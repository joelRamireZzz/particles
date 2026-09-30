import { COLORS, TUNING } from "./config.js";

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.scale = 1;
    this.width = 1;
    this.height = 1;
  }

  resize(cssWidth, cssHeight, scale) {
    this.scale = scale;
    this.width = cssWidth;
    this.height = cssHeight;
    const nextWidth = Math.max(1, Math.round(cssWidth * scale));
    const nextHeight = Math.max(1, Math.round(cssHeight * scale));
    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
  }

  clear() {
    const { ctx, canvas, scale } = this;
    if (scale === 1) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  drawHands(hands) {
    if (hands.length === 0) return;
    const { ctx } = this;
    const r = TUNING.handLandmarkRadius;

    ctx.beginPath();
    for (const hand of hands) {
      for (let i = 0; i < hand.length; i++) {
        const x = (1 - hand[i].x) * this.width;
        const y = hand[i].y * this.height;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
    }

    ctx.fillStyle = COLORS.landmark;
    ctx.fill();

    for (const hand of hands) {
      const wrist = hand[0];
      ctx.beginPath();
      ctx.arc((1 - wrist.x) * this.width, wrist.y * this.height, TUNING.wristRadius, 0, TAU);
      ctx.fillStyle = COLORS.wrist;
      ctx.fill();
    }
  }

  drawConnections(system) {
    const { ctx } = this;
    const maxDist = TUNING.linkDistance;
    const maxDistSq = maxDist * maxDist;
    const invMax = 1 / maxDist;
    const levels = TUNING.linkAlphaLevels;

    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.link;

    system.grid.forEachPair(system.list, (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= maxDistSq) return;

      // Opacidad cuantizada: evita construir una cadena rgba por línea.
      const alpha = 1 - Math.sqrt(distSq) * invMax;
      let level = (alpha * levels) | 0;
      if (level >= levels) level = levels - 1;
      if (level === 0) return; // opacidad 0: no se vería

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.globalAlpha = level / (levels - 1);
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
  }

  drawParticles(system, open) {
    if (system.list.length === 0) return;
    const { ctx } = this;
    const list = system.list;

    ctx.beginPath();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const r = p.radius * (1 + p.z);
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, TAU);
    }

    ctx.fillStyle = open ? COLORS.particleOpen : COLORS.particleIdle;
    ctx.fill();
  }
}
