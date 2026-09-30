import { QUALITY_PRESETS, isCoarsePointer, isSmallViewport } from "./config.js";

const SAMPLE_MS = 900;
const DOWNGRADE_FPS = 42;
const UPGRADE_FPS = 56;

export class QualityManager {
  constructor({ onChange } = {}) {
    this.onChange = onChange;
    this.level = this._initialLevel();
    this.accumulatedMs = 0;
    this.frames = 0;
    this.stableUp = 0;
  }

  _initialLevel() {
    if (isCoarsePointer() || isSmallViewport()) return 2;
    return QUALITY_PRESETS.length - 1;
  }

  get preset() {
    return QUALITY_PRESETS[this.level];
  }

  budget(base) {
    return Math.round(base * this.preset.budget);
  }

  sample(deltaMs) {
    this.accumulatedMs += deltaMs;
    this.frames += 1;

    if (this.accumulatedMs < SAMPLE_MS) return null;

    const fps = (this.frames * 1000) / this.accumulatedMs;
    this.accumulatedMs = 0;
    this.frames = 0;

    this._evaluate(fps);
    return fps;
  }

  _evaluate(fps) {
    const maxLevel = QUALITY_PRESETS.length - 1;
    let next = this.level;

    if (fps < DOWNGRADE_FPS && this.level > 0) {
      next = this.level - 1;
      this.stableUp = 0;
    } else if (fps > UPGRADE_FPS && this.level < maxLevel) {

      this.stableUp += 1;
      if (this.stableUp >= 3) {
        next = this.level + 1;
        this.stableUp = 0;
      }
    } else {
      this.stableUp = 0;
    }

    if (next !== this.level) {
      this.level = next;
      this.onChange?.(this.preset, this.level);
    }
  }
}
