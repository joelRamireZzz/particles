
export const TUNING = {
  physicsHz: 60,
  maxPhysicsSteps: 3,

  linkDistance: 100,

  startParticles: 220,
  spawnEveryMs: 100,

  particle: { baseRadius: 3, friction: 0.95, maxSpeed: 5 },
  attractRadius: 300,
  attractForce: 70,
  orbitFactor: 0.5,
  pullFactor: 0.001,
  pushFactor: 0.001,
  explodeRadius: 200,
  explodeForce: 70,

  linkAlphaLevels: 16,

  handLandmarkRadius: 5,
  wristRadius: 20,
  openFingerThreshold: 3,
  fingerExtension: 0.5,
};

export const COLORS = {
  particleIdle: "#00ffff",
  particleOpen: "#ffa500",
  landmark: "#008000",
  wrist: "#ff0000",
  link: "#ffffff",
};

export const DETECT = {
  fastMs: 16,
  normalMs: 30,
  slowMs: 60,
};

export const QUALITY_PRESETS = [
  { scale: 1.0, budget: 0.5, detectMs: DETECT.slowMs },
  { scale: 1.0, budget: 0.7, detectMs: DETECT.normalMs },
  { scale: 1.15, budget: 0.85, detectMs: DETECT.normalMs },
  { scale: 1.35, budget: 1.0, detectMs: DETECT.fastMs },
  { scale: 1.6, budget: 1.0, detectMs: DETECT.fastMs },
];

const ASSET_ROOT = "mediapipe";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const baseHref = typeof location !== "undefined" ? location.href : "http://localhost/";
const baseUrl = new URL(import.meta.env?.BASE_URL || "./", baseHref);

const localAsset = (path) => new URL(`${ASSET_ROOT}/${path}`, baseUrl).href;

export const ASSETS = {
  localWasm: localAsset("wasm"),
  localModel: localAsset("hand_landmarker.task"),
  cdnWasm: CDN_WASM,
  cdnModel: CDN_MODEL,
};

export const isCoarsePointer = () =>
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export const isSmallViewport = () =>
  Math.min(window.innerWidth, window.innerHeight) < 768;

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
