import { ASSETS, TUNING } from "./config.js";

const DEFAULT_DELEGATES = ["GPU", "CPU"];

export function forcedDelegate() {
  const value = new URLSearchParams(location.search).get("delegate")?.toLowerCase();
  return value === "cpu" || value === "gpu" ? value.toUpperCase() : null;
}

async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url, { cache: "force-cache" });

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${url} (HTTP ${response.status})`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const body = response.body;

  if (!body || !total) return new Uint8Array(await response.arrayBuffer());

  const reader = body.getReader();
  const chunks = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(Math.min(loaded / total, 1), loaded, total);
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function preloadModel({ onProgress, onStatus } = {}) {
  const load = async (url) => {
    onStatus?.("Descargando modelo…");
    return fetchWithProgress(url, onProgress);
  };

  return load(ASSETS.localModel).catch((error) => {
    onStatus?.("Assets locales no disponibles, usando CDN…");
    return load(ASSETS.cdnModel);
  });
}

export async function createHandTracker({ modelBuffer, onStatus, delegate } = {}) {
  onStatus?.("Iniciando motor…");

  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");

  const fileset = await (async () => {
    try {
      return await FilesetResolver.forVisionTasks(ASSETS.localWasm);
    } catch {
      onStatus?.("WASM local no disponible, usando CDN…");
      return FilesetResolver.forVisionTasks(ASSETS.cdnWasm);
    }
  })();

  const pinned = delegate ?? forcedDelegate();
  const delegates = pinned ? [pinned] : DEFAULT_DELEGATES;
  let lastError = null;

  for (const candidate of delegates) {
    try {
      const instance = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: modelBuffer, delegate: candidate },
        numHands: 2,
        runningMode: "VIDEO",
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { instance, delegate: candidate };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function countExtendedFingers(hand, extensionThreshold) {
  const size = distance(hand[0], hand[9]) || 1e-6;
  return (
    (distance(hand[8], hand[5]) / size > extensionThreshold ? 1 : 0) +
    (distance(hand[12], hand[9]) / size > extensionThreshold ? 1 : 0) +
    (distance(hand[16], hand[13]) / size > extensionThreshold ? 1 : 0) +
    (distance(hand[20], hand[17]) / size > extensionThreshold ? 1 : 0)
  );
}

export function readHandState(result) {
  const hands = result?.landmarks ?? [];
  if (hands.length === 0) return { detected: false, x: 0, y: 0, open: false, hands };

  const hand = hands[hands.length - 1];
  const wrist = hand[0];

  return {
    detected: true,
    x: 1 - wrist.x,
    y: wrist.y,
    open: countExtendedFingers(hand, TUNING.fingerExtension) >= TUNING.openFingerThreshold,
    hands,
  };
}
