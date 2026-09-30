import { TUNING } from "./config.js";


export class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.head = null;
    this.next = null;
    this.cols = 0;
    this.rows = 0;
  }

  build(particles, width, height) {
    const count = particles.length;
    const cols = Math.max(1, Math.ceil(width / this.cellSize) + 1);
    const rows = Math.max(1, Math.ceil(height / this.cellSize) + 1);
    const cells = cols * rows;

    if (this.head === null || this.head.length < cells) this.head = new Int32Array(cells);
    if (this.next === null || this.next.length < count) this.next = new Int32Array(count);

    const { head, next, invCellSize, cellSize } = this;
    head.fill(-1, 0, cells);
    this.cols = cols;
    this.rows = rows;

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      let cx = Math.floor(p.x * invCellSize);
      let cy = Math.floor(p.y * invCellSize);
      if (cx < 0) cx = 0;
      else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0;
      else if (cy >= rows) cy = rows - 1;
      const cell = cy * cols + cx;
      next[i] = head[cell];
      head[cell] = i;
    }
  }


  forEachPair(particles, pair) {
    const { head, next, cols, rows } = this;

    for (let cy = 0; cy < rows; cy++) {
      const row = cy * cols;
      const downRow = cy + 1 < rows;
      const nextRow = downRow ? row + cols : -1;

      for (let cx = 0; cx < cols; cx++) {
        const cell = row + cx;
        const hasRight = cx + 1 < cols;
        const rightCell = hasRight ? cell + 1 : -1;
        const downLeftCell = downRow && cx > 0 ? nextRow + cx - 1 : -1;
        const downCell = downRow ? nextRow + cx : -1;
        const downRightCell = downRow && hasRight ? nextRow + cx + 1 : -1;

        for (let i = head[cell]; i !== -1; i = next[i]) {
          const a = particles[i];

          // Misma celda: avanzar la lista garantiza j > i.
          for (let j = next[i]; j !== -1; j = next[j]) pair(a, particles[j]);

          if (rightCell !== -1) {
            for (let j = head[rightCell]; j !== -1; j = next[j]) pair(a, particles[j]);
          }
          if (downLeftCell !== -1) {
            for (let j = head[downLeftCell]; j !== -1; j = next[j]) pair(a, particles[j]);
          }
          if (downCell !== -1) {
            for (let j = head[downCell]; j !== -1; j = next[j]) pair(a, particles[j]);
          }
          if (downRightCell !== -1) {
            for (let j = head[downRightCell]; j !== -1; j = next[j]) pair(a, particles[j]);
          }
        }
      }
    }
  }
}

export class ParticleSystem {
  constructor() {
    this.list = [];
    this.grid = new SpatialGrid(TUNING.linkDistance);
    this.width = 1;
    this.height = 1;
  }

  setBounds(width, height) {
    this.width = width;
    this.height = height;
  }

  get count() {
    return this.list.length;
  }

  spawn(radius = TUNING.particle.baseRadius) {
    this.list.push({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      z: Math.random(),
      vx: Math.random() < 0.5 ? -1 : 1,
      vy: Math.random() < 0.5 ? -1 : 1,
      radius,
    });
  }

  fill(count) {
    for (let i = 0; i < count; i++) this.spawn();
  }

  trimTo(count) {
    if (this.list.length > count) this.list.length = count;
  }

  resize(oldWidth, oldHeight, newWidth, newHeight) {
    if (oldWidth <= 0 || oldHeight <= 0) return;
    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      list[i].x *= scaleX;
      list[i].y *= scaleY;
    }
    this.width = newWidth;
    this.height = newHeight;
  }

  step(hand) {
    const {
      particle,
      attractRadius,
      attractForce,
      orbitFactor,
      pullFactor,
      pushFactor,
    } = TUNING;
    const { baseRadius, friction, maxSpeed } = particle;
    const radiusSq = attractRadius * attractRadius;
    const list = this.list;

    const active = hand.detected;
    const hx = hand.x;
    const hy = hand.y;
    const open = hand.open;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      let vx = p.vx;
      let vy = p.vy;

      if (active) {
        const dx = hx - p.x;
        const dy = hy - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < radiusSq && distSq > 0) {
          const distancia = Math.sqrt(distSq);
          const fuerza = attractForce / (distancia + 1);

          if (open) {
            vx -= dx * fuerza * pushFactor;
            vy -= dy * fuerza * pushFactor;

            const tx = -dy / distancia + 1;
            const ty = dx / distancia + 1;
            vx -= tx * fuerza * orbitFactor;
            vy -= ty * fuerza * orbitFactor;
          } else {
            // Atracción.
            vx += dx * fuerza * pullFactor;
            vy += dy * fuerza * pullFactor;
          }
        }
      }

      p.x += vx;
      p.y += vy;
      vx *= friction;
      vy *= friction;

      const speed = Math.sqrt(vx * vx + vy * vy);
      p.radius = baseRadius + speed;

      if (vx > maxSpeed) vx = maxSpeed;
      else if (vx < -maxSpeed) vx = -maxSpeed;
      if (vy > maxSpeed) vy = maxSpeed;
      else if (vy < -maxSpeed) vy = -maxSpeed;

      p.vx = vx;
      p.vy = vy;
    }
  }


  explode(hx, hy) {
    const { explodeRadius, explodeForce } = TUNING;
    const list = this.list;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const dx = p.x - hx;
      const dy = p.y - hy;

      const distancia = Math.sqrt(dx * dx + dy * dy) + 1;

      if (distancia < explodeRadius) {
        const fuerza = explodeForce / (distancia + 1);
        p.vx += (dx / distancia) * fuerza;
        p.vy += (dy / distancia) * fuerza;
      }
    }
  }

  buildGrid() {
    this.grid.build(this.list, this.width, this.height);
  }

}
