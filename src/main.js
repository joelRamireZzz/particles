import { TUNING, isCoarsePointer, prefersReducedMotion } from "./config.js";
import { CameraError, describeEnvironment, startCamera, stopCamera } from "./camera.js";
import { Hud } from "./hud.js";
import { ParticleSystem } from "./particles.js";
import { QualityManager } from "./quality.js";
import { Renderer } from "./renderer.js";
import { createHandTracker, forcedDelegate, preloadModel, readHandState } from "./tracker.js";

const BASE_PARTICLES = isCoarsePointer() ? 260 : 400;
const FIXED_STEP = 1000 / TUNING.physicsHz;
const STALLED_VIDEO_MS = 500;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayHint = document.getElementById("overlay-hint");
const retryButton = document.getElementById("retry");

const renderer = new Renderer(canvas);
const hud = new Hud();
const particles = new ParticleSystem();

const hand = { detected: false, x: 0, y: 0, open: false, hands: [] };

let tracker = null;
let stream = null;
let modelBuffer = null;
let activeDelegate = null;
let delegateCheckedAt = 0;
let rafId = 0;
let running = false;
let booting = false;
let videoReady = false;

let lastFrame = performance.now();
let physicsAccumulator = 0;
let spawnAccumulator = 0;
let lastVideoTime = -1;
let lastVideoChange = 0;
let lastDetect = -Infinity;
let displayedFps = 0;
let detectInterval = 30;

const quality = new QualityManager({
  onChange: (preset) => {
    particles.trimTo(quality.budget(BASE_PARTICLES));
    detectInterval = preset.detectMs;
    applyViewport(particles.count > 0);
  },
});

detectInterval = quality.preset.detectMs;

function applyViewport(rescaleParticles) {
  // Se mide el canvas, no la ventana: en iOS innerHeight incluye el hueco de la
  // barra de direcciones y las partículas quedarían descolocadas del dibujo.
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(dpr, quality.preset.scale);

  if (rescaleParticles && particles.count > 0) {
    particles.resize(particles.width, particles.height, width, height);
  } else {
    particles.setBounds(width, height);
  }

  renderer.resize(width, height, scale);
}

function showOverlay({ title, hint, mode }) {
  if (!overlay) return;
  overlay.hidden = false;
  overlay.dataset.mode = mode;
  if (overlayTitle) overlayTitle.textContent = title;
  if (overlayHint) overlayHint.textContent = hint || "";
  if (retryButton) retryButton.hidden = mode !== "error";
}

const hideOverlay = () => {
  if (overlay) overlay.hidden = true;
};

function showCameraError(error) {
  const cameraError =
    error instanceof CameraError
      ? error
      : new CameraError("unknown", "No se pudo iniciar la cámara.", { hint: error?.message });

  const { secure, hasApi, protocol } = describeEnvironment();
  const diagnostics =
    `contexto seguro: ${secure ? "sí" : "no"} · ` +
    `getUserMedia: ${hasApi ? "disponible" : "no disponible"} · ` +
    `protocolo: ${protocol}`;

  showOverlay({
    title: cameraError.message,
    hint: `${cameraError.hint}\n${diagnostics}`,
    mode: "error",
  });
}

function showTrackerError(error) {
  showOverlay({
    title: "No se pudo cargar el modelo de manos.",
    hint: error?.message || "Revisa la conexión y pulsa Reintentar.",
    mode: "error",
  });
}


let frameAvailable = true;
let usingVideoCallback = false;
let watchingFrames = false;

function watchVideoFrames() {
  if (typeof video.requestVideoFrameCallback !== "function") return;
  usingVideoCallback = true;
  if (watchingFrames) return;
  watchingFrames = true;

  const onFrame = () => {
    frameAvailable = true;
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}

function hasNewVideoFrame(now) {
  if (usingVideoCallback) {
    if (frameAvailable) {
      frameAvailable = false;
      return true;
    }
    return now - lastVideoChange > STALLED_VIDEO_MS;
  }

  const time = video.currentTime;
  if (time !== lastVideoTime) {
    lastVideoTime = time;
    lastVideoChange = now;
    return true;
  }
  return now - lastVideoChange > STALLED_VIDEO_MS;
}

function updateHands(timestamp) {
  let state;
  try {
    state = readHandState(tracker.detectForVideo(video, timestamp));
  } catch {
    return;
  }

  const wasOpen = hand.open;
  hand.hands = state.hands;
  hand.detected = state.detected;
  hand.open = state.open;

  // Sin mano se conservan las últimas coordenadas, como en el original.
  if (!state.detected) return;

  hand.x = state.x * renderer.width;
  hand.y = state.y * renderer.height;

  if (!wasOpen && state.open) particles.explode(hand.x, hand.y);
}


async function maybeSwitchDelegate(now) {
  if (activeDelegate !== "GPU" || forcedDelegate()) return;
  if (now - delegateCheckedAt < 8000) return;
  delegateCheckedAt = now;

  if (quality.level > 0 || !modelBuffer) return;

  const previous = tracker;
  try {
    const next = await createHandTracker({ modelBuffer, delegate: "CPU" });
    tracker = next.instance;
    activeDelegate = "CPU";
    previous?.close?.();
  } catch {

  }
}

function frame(now) {
  if (!running) {
    rafId = 0;
    return;
  }
  rafId = requestAnimationFrame(frame);

  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;


  physicsAccumulator += delta;
  let steps = 0;
  while (physicsAccumulator >= FIXED_STEP && steps < TUNING.maxPhysicsSteps) {
    particles.step(hand);
    physicsAccumulator -= FIXED_STEP;
    steps += 1;
  }
  if (steps === TUNING.maxPhysicsSteps) physicsAccumulator = 0;

  spawnAccumulator += delta;
  while (spawnAccumulator >= TUNING.spawnEveryMs) {
    spawnAccumulator -= TUNING.spawnEveryMs;
    if (particles.count < quality.budget(BASE_PARTICLES)) particles.spawn();
  }

  if (videoReady && tracker && now - lastDetect >= detectInterval && hasNewVideoFrame(now)) {
    lastDetect = now;
    updateHands(now);
    maybeSwitchDelegate(now);
  }

  renderer.clear();
  renderer.drawHands(hand.hands);
  particles.buildGrid();
  renderer.drawConnections(particles);
  renderer.drawParticles(particles, hand.open);

  const fps = quality.sample(delta);
  if (fps !== null) displayedFps = fps;

  hud.update({
    fps: displayedFps,
    hands: hand.hands.length,
    x: hand.x,
    y: hand.y,
  });
}

const startLoop = () => {
  if (running) return;
  running = true;
  lastFrame = performance.now();
  physicsAccumulator = 0;
  rafId = requestAnimationFrame(frame);
};

function stopLoop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function teardown() {
  stopLoop();
  stopCamera(stream);
  stream = null;
  tracker?.close?.();
  tracker = null;
  video.srcObject = null;
  videoReady = false;
}

let resizeTimer = 0;
const scheduleResize = (delay) => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => applyViewport(true), delay);
};

window.addEventListener("resize", () => scheduleResize(150));
window.addEventListener("orientationchange", () => scheduleResize(250));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else if (videoReady) {
    startLoop();
  }
});

retryButton?.addEventListener("click", () => {
  if (!booting) boot();
});

let statusText = "";
let progressRatio = -1;

const renderStatus = () => {
  showOverlay({
    title: statusText,
    hint: progressRatio >= 0 ? `${Math.round(progressRatio * 100)} %` : "",
    mode: "loading",
  });
};

const setStatus = (text) => {
  statusText = text;
  if (booting) renderStatus();
};

const setProgress = (ratio) => {
  progressRatio = ratio;
  if (booting) renderStatus();
};

let modelBufferPromise = null;

const startModelDownload = () => {
  modelBufferPromise ??= preloadModel({
    onStatus: setStatus,
    onProgress: setProgress,
  });
  return modelBufferPromise;
};

async function boot() {
  if (booting) return;
  booting = true;

  teardown();
  statusText = "Iniciando…";
  progressRatio = -1;
  renderStatus();
  applyViewport(particles.count > 0);

  if (particles.count === 0) {
    particles.fill(prefersReducedMotion() ? 120 : TUNING.startParticles);
  }
  particles.trimTo(quality.budget(BASE_PARTICLES));


  const cameraPromise = startCamera(video, {
    onStatus: setStatus,
    onEnded: () => {
      stopLoop();
      showOverlay({
        title: "La cámara se ha desconectado o se ha revocado el permiso.",
        hint: "Vuelve a activarla y pulsa Reintentar.",
        mode: "error",
      });
    },
  });

  const trackerPromise = startModelDownload()
    .then((buffer) => {
      modelBuffer = buffer;
      return createHandTracker({ modelBuffer: buffer, onStatus: setStatus });
    })
    .finally(() => {
      progressRatio = -1;
    });

  const [camera, tracking] = await Promise.allSettled([cameraPromise, trackerPromise]);
  booting = false;

  if (camera.status === "rejected") {
    // startCamera ya suelta el stream si falla tras abrirlo.
    showCameraError(camera.reason);
    return;
  }

  if (tracking.status === "rejected") {
    showTrackerError(tracking.reason);
    stopCamera(camera.value.stream);
    return;
  }

  stream = camera.value.stream;
  tracker = tracking.value.instance;
  activeDelegate = tracking.value.delegate;
  delegateCheckedAt = performance.now();

  videoReady = true;
  lastVideoTime = -1;
  lastVideoChange = performance.now();
  frameAvailable = true;
  watchVideoFrames();
  booting = false;
  hideOverlay();
  startLoop();
}

boot();
