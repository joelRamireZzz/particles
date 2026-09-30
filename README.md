# Hand Particle System

A real-time particle system you control with your hands through the webcam. Particles are pulled toward your hand, orbit around it, and react to your gestures.

**JavaScript · Vite · MediaPipe Tasks Vision · Canvas 2D**

![Particle field](docs/particulas.png)

*The particle system in action. The screenshot was taken with the camera feed hidden in the background so the effect is easier to see.*

---

## What it does

- **Tracks up to two hands** in real time using MediaPipe's `hand_landmarker` model.
- **Follows your position**: particles react to the wrist of each hand.
- **Reacts to open and closed gestures**:
  - **Closed fist**: particles are pulled toward your hand.
  - **Open hand** (3 or more fingers extended): particles are pushed away and circle around your hand, turn **orange**, and a radial **explosion** fires the moment you open it.
- **Proximity links**: any two particles closer than 100 px are joined by a line whose opacity fades with distance.
- **Hand overlay**: all 21 landmarks are drawn in green, with the wrist in red.
- **HUD** showing FPS, number of hands, and detected position.

## Technical highlights

- **Spatial grid** (`Int32Array`) to find nearby particle pairs instead of comparing every particle with every other one. Uses 6× less CPU with identical results.
- **Decoupled loop**: particles render at your display's refresh rate even when hand detection runs slower. Physics uses a fixed timestep, so speed stays the same on 60, 90, or 120 Hz screens.
- **Inference only on new frames** via `requestVideoFrameCallback`, at an adjustable rate.
- **Adaptive quality**: measures real FPS and adjusts render resolution, particle density, and inference rate. If the GPU delegate turns out to be slow, it rebuilds the detector on CPU.
- **Camera diagnostics**: detects insecure contexts, denied permission, busy or missing cameras, and permission revoked mid-session, and offers a **Retry** button.
- **Mobile-friendly**: `playsinline` for iOS, `dvh` for the address bar, `safe-area-inset` for the notch, and `touch-action` to prevent accidental zoom.
- **Parallel loading**: the 7.8 MB model downloads while the user decides on the camera permission, with real progress shown on screen.
- **No third-party runtime dependencies**: WASM and the model are served from the project itself, with an automatic CDN fallback.

### Camera error handling

| Situation | What happens |
| --- | --- |
| Permission denied | A panel explains the cause and shows a Retry button. It also explains that you must use the lock or camera icon in the address bar, because the browser has already saved the "no". |
| Page served over `http://` (insecure context) | Explains that `https://` or `localhost` is required, instead of showing a black screen. |
| Camera in use by another app | Tells you to close that app and retry. |
| No camera connected | Shows a specific message. |
| Permission revoked while the page is open | Stops the loop and notifies you. |
| Device rejects the requested resolution | Retries with simpler constraints. |

![Camera error panel](docs/error-camara.png)

---

## Requirements

- **Node.js** `^20.19.0` or `>=22.12.0`
- A browser with WebGL and `getUserMedia` support: an up-to-date Chrome, Edge, Firefox, or Safari
- **The camera requires a secure context**: `https://` or `http://localhost`. If you open the project through your local network IP (for example `http://192.168.1.50:5173`), the browser will block the camera.

## Installation

```bash
npm install
```

The install step automatically downloads the MediaPipe assets (WASM and model, about 31 MB) into `public/mediapipe/`. If that folder is missing, the app falls back to the CDN automatically.

To download them separately:

```bash
npm run setup:assets
```

## Usage

```bash
npm run dev       # development server
npm run build     # build into dist/
npm run preview   # serve dist/ to check the final result
```

### Debug parameters

Add these to the URL during development:

| Parameter | Effect |
| --- | --- |
| `?delegate=cpu` | Forces CPU inference and disables automatic switching. |
| `?delegate=gpu` | Forces GPU inference. |

## Project structure

```
index.html                     markup, iOS attributes, loading and error overlays
vite.config.js                 Vite configuration
scripts/fetch-assets.mjs       downloads the MediaPipe assets
docs/                          README screenshots

src/
├── main.js       orchestration, render loop, startup and retry
├── camera.js     camera permission, constraint ladder, diagnostics
├── tracker.js    model download, detector creation, hand reading
├── particles.js  physics simulation and spatial grid
├── renderer.js   2D canvas drawing
├── quality.js    automatic quality tuning based on FPS
├── hud.js        DOM writes only when a value changes
├── config.js     constants: physics, colors, quality presets
└── style.css     styles and mobile adjustments

public/mediapipe/               assets downloaded by npm install (not versioned)
```

## Deployment

`npm run build` produces a static `dist/` directory that any hosting service can serve.

Remember that **the camera does not work over `http://`**. For a public deployment, use `https://` (GitHub Pages, Netlify, Vercel, and Cloudflare Pages provide it by default).

The `public/mediapipe/` directory holds about 31 MB and is included in the build output. If your host has size limits, consider serving those files from your own CDN instead of bundling them.

## Performance

The original version of this project took 50.0 ms per frame; the current one takes 16.7 ms, measured in Chromium with the original rebuilt and run under the same conditions.

| Stage | Original | Current |
| --- | --- | --- |
| Hand inference | 42–44 ms | 16–18 ms |
| Remaining JavaScript | 2.7–2.9 ms | 0.3 ms |
| Browser work (rasterization) | 3–5 ms | 0–1 ms |
| **Total per frame** | **50.0 ms** | **16.7 ms** |

## How the spatial grid works

To draw the links, we need to know which particles are within 100 px of each other. Comparing every pair costs 400 × 399 / 2 = **79,800 checks per frame**, and grows quadratically.

The grid splits the canvas into cells exactly as wide as that distance. Since two particles closer than 100 px always sit in the same or adjacent cells, it is enough to check a particle's own cell plus four neighbors, which brings the cost down to the order of thousands.

```js
// Linked lists on an Int32Array, no per-frame allocations.
// head[cell] = index of the first particle in the cell (-1 if empty)
// next[i]    = index of the next particle in the same cell
next[i] = head[cell];
head[cell] = i;
```

To avoid visiting the same pair twice, each cell only checks the neighbor to its right and the three below it. Those four positions cover all eight directions, splitting each pair between the two particles.

## Credits

- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe): hand detection
- [Hand Landmarker model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task): detection model
- [Vite](https://vite.dev): dev server and bundler