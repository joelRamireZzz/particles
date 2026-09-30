import { createWriteStream } from "node:fs";
import { mkdir, stat, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const TASKS_VISION_VERSION = "1.0.1";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = join(ROOT, "public", "mediapipe", "wasm");
const MODEL_PATH = join(ROOT, "public", "mediapipe", "hand_landmarker.task");

const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const FILES = [
  { url: `${WASM_BASE}/vision_wasm_internal.js`, dest: join(WASM_DIR, "vision_wasm_internal.js") },
  { url: `${WASM_BASE}/vision_wasm_internal.wasm`, dest: join(WASM_DIR, "vision_wasm_internal.wasm") },
  { url: `${WASM_BASE}/vision_wasm_nosimd_internal.js`, dest: join(WASM_DIR, "vision_wasm_nosimd_internal.js") },
  { url: `${WASM_BASE}/vision_wasm_nosimd_internal.wasm`, dest: join(WASM_DIR, "vision_wasm_nosimd_internal.wasm") },
  { url: MODEL_URL, dest: MODEL_PATH },
];

const exists = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

async function download({ url, dest }) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar ${url}`);
  }

  const tmp = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tmp));
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }

  const { rename } = await import("node:fs/promises");
  await rename(tmp, dest);
}

async function main() {
  await mkdir(WASM_DIR, { recursive: true });

  const pending = [];
  for (const file of FILES) {
    if (await exists(file.dest)) {
      console.log(`✓ ya está: ${file.dest.replace(`${ROOT}/`, "")}`);
      continue;
    }
    pending.push(
      download(file)
        .then(() => console.log(`✓ descargado: ${file.dest.replace(`${ROOT}/`, "")}`))
        .catch((error) => console.warn(`⚠ no se pudo descargar ${file.url}\n  ${error.message}`)),
    );
  }

  await Promise.all(pending);
  console.log("Assets de MediaPipe listos.");
}

main();
