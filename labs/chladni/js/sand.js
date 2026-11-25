// sand.js — i granelli sulla lamina.
// Un granello resta fermo finché la lamina, sotto di lui, accelera meno di g (Γ = ω²|W|/g < 1): non si stacca.
// Dove Γ > 1 rimbalza: a ogni salto riparte in una direzione un po' a caso e, poiché la lamina inclinata lo spinge
// verso dove vibra meno, in media scivola giù per Γ. Si ferma solo quando arriva dove Γ < 1: lungo le linee nodali.
// La polvere finissima (licopodio) fa il contrario: le correnti d'aria che la lamina stessa crea (Faraday, 1831)
// la portano ai ventri, dove forma mucchietti che ribollono. Chi passa il bordo cade sul pavimento.
// Coordinate: x, y ridotte (semilunghezza 1); le velocità sono in metri al secondo e si dividono per a.

export const KIND = { sand: 0, lyco: 1 };
const ST = { none: 0, plate: 1, fall: 2, floor: 3, rain: 4 };
export { ST };

export class Sand {
  constructor(max) {
    this.max = max; this.n = 0;
    const F = (k = 1) => new Float32Array(max * k);
    this.x = F(); this.y = F(); this.z = F();       // z: altezza sulla lamina (m), o quota locale se cade
    this.vx = F(); this.vy = F(); this.vz = F();
    this.st = new Uint8Array(max); this.kind = new Uint8Array(max);
    this.size = F();                                // diametro (m)
    this.hop = F();                                 // quanto sta saltando (0…1), per l'aspetto
    this.moving = 0; this.onPlate = 0; this.fallen = 0;
    this._cells = null;
  }

  clear() { this.n = 0; }

  /** Sparge count granelli dall'alto, a caso sulla lamina. kind: 0 sabbia, 1 licopodio. */
  sprinkle(count, kind, insideFn, d) {
    for (let c = 0; c < count && this.n < this.max; c++) {
      let x, y, tries = 0;
      do { x = Math.random() * 2 - 1; y = (Math.random() * 2 - 1) * 1.6; tries++; } while (!insideFn(x * 0.985, y * 0.985) && tries < 50);
      if (tries >= 50) continue;
      const i = this.n++;
      this.x[i] = x * 0.985; this.y[i] = y * 0.985;
      this.z[i] = 0.004 + Math.random() * 0.05; this.vz[i] = -Math.random() * 0.3;
      this.vx[i] = this.vy[i] = 0;
      this.st[i] = ST.rain; this.kind[i] = kind;
      this.size[i] = d * (kind === KIND.lyco ? 0.55 : 0.75 + Math.random() * 0.5);
      this.hop[i] = 0;
    }
  }

  /**
   * Un passo. ctx: { gamma(x,y) → [Γ, ∂Γ/∂x, ∂Γ/∂y] (coordinate ridotte), a (m), inside(x,y), plateY (m sopra il
   * pavimento), run (la lamina vibra) }.
   */
  step(dt, ctx) {
    const { a, inside, plateY, run } = ctx, g = 9.81, ia = 1 / a, sq = Math.sqrt(dt), omega = Math.max(1, ctx.omega || 600);
    let moving = 0, onPlate = 0, fallen = 0;
    const out = [0, 0, 0], C = this._cells;
    for (let i = 0; i < this.n; i++) {
      const st = this.st[i];
      if (st === ST.rain) {
        this.vz[i] -= g * dt; this.z[i] += this.vz[i] * dt;
        if (this.z[i] <= 0) { this.z[i] = 0; this.vz[i] = 0; this.st[i] = ST.plate; }
        moving++; continue;
      }
      if (st === ST.fall) {
        this.vz[i] -= g * dt;
        this.x[i] += this.vx[i] * dt * ia; this.y[i] += this.vy[i] * dt * ia; this.z[i] += this.vz[i] * dt;
        if (this.z[i] <= -plateY) { this.z[i] = -plateY; this.st[i] = ST.floor; }
        moving++; continue;
      }
      if (st === ST.floor) { fallen++; continue; }
      onPlate++;
      if (!run) { this.hop[i] = Math.max(0, this.hop[i] - dt * 6); continue; }
      ctx.gamma(this.x[i], this.y[i], out);
      const G = out[0];
      let gx = out[1], gy = out[2];
      const gl = Math.hypot(gx, gy) || 1e-9;
      gx /= gl; gy /= gl;
      // mucchi troppo alti franano: un granello in una cella affollata scivola in una vicina
      if (C && Math.random() < 0.25) {
        const cx = ((this.x[i] + 1) / this._cell) | 0, cy = ((this.y[i] + this._gm) / this._cell) | 0;
        if (cx >= 0 && cy >= 0 && cx < this._nx && C[cy * this._nx + cx] > 4) {
          const ang = Math.random() * 6.2832, r = this._cell * (0.6 + Math.random() * 0.8);
          const nx = this.x[i] + Math.cos(ang) * r, ny = this.y[i] + Math.sin(ang) * r;
          if (inside(nx, ny)) { this.x[i] = nx; this.y[i] = ny; }
        }
      }
      let vd, sig, e;
      if (this.kind[i] === KIND.sand) {
        if (G <= 1) {
          // non si stacca più, ma la lamina inclinata che vibra lo fa ancora strisciare verso il nodo
          this.hop[i] = Math.max(0, this.hop[i] - dt * 8);
          if (G > 0.12) {
            const v = (0.0012 + 0.005 * (G - 0.12)) * dt * ia;
            this.x[i] -= gx * v; this.y[i] -= gy * v;
          }
          continue;
        }
        // i salti sono lunghi quanto veloce va la lamina sotto il granello: v = Γ g / ω
        e = Math.min(1, (G - 1) / 2.5);
        const vp = (G * g) / omega;
        vd = -Math.min(0.022, Math.max(0.003, 0.3 * vp)) * e;      // giù per Γ
        sig = Math.min(0.012, Math.max(0.0008, 0.07 * vp)) * Math.sqrt(e);   // salti a caso
      } else {
        if (G <= 0.25) { this.hop[i] = Math.max(0, this.hop[i] - dt * 8); continue; }
        e = Math.min(1, G / 3);
        vd = 0.016 * e * Math.min(1, ((gl / a) * 0.01) / Math.max(G, 1e-6));   // verso i ventri; rallenta sulla cima
        sig = 0.0035 * Math.sqrt(e);
      }
      moving++;
      this.hop[i] = Math.min(1, this.hop[i] + dt * 10) * (0.6 + 0.4 * e);
      const nx = this.x[i] + (vd * gx * dt + sig * sq * (Math.random() * 2 - 1) * 1.7) * ia;
      const ny = this.y[i] + (vd * gy * dt + sig * sq * (Math.random() * 2 - 1) * 1.7) * ia;
      if (!inside(nx, ny)) {
        // oltre il bordo: cade
        this.st[i] = ST.fall;
        const dx = nx - this.x[i], dy = ny - this.y[i], dl = Math.hypot(dx, dy) || 1;
        this.vx[i] = (dx / dl) * 0.06; this.vy[i] = (dy / dl) * 0.06; this.vz[i] = 0.05;
        this.x[i] = nx; this.y[i] = ny; this.z[i] = 0;
        continue;
      }
      this.x[i] = nx; this.y[i] = ny;
    }
    this.moving = moving; this.onPlate = onPlate; this.fallen = fallen;
  }

  /**
   * Altezze di appoggio: i granelli fermi nella stessa cella si impilano (le righe di sabbia hanno spessore).
   * cell: lato della cella (in coordinate ridotte).
   */
  stack(cell, gmax) {
    const nx = Math.ceil(2 / cell) + 2, ny = Math.ceil((2 * gmax) / cell) + 2;
    if (!this._cells || this._cells.length < nx * ny) this._cells = new Uint16Array(nx * ny);
    this._nx = nx; this._cell = cell; this._gm = gmax;
    const C = this._cells; C.fill(0, 0, nx * ny);
    this.layer = this.layer && this.layer.length === this.max ? this.layer : new Uint8Array(this.max);
    for (let i = 0; i < this.n; i++) {
      if (this.st[i] !== ST.plate) { this.layer[i] = 0; continue; }
      const cx = Math.max(0, Math.min(nx - 1, ((this.x[i] + 1) / cell) | 0)), cy = Math.max(0, Math.min(ny - 1, ((this.y[i] + gmax) / cell) | 0));
      const q = cy * nx + cx;
      this.layer[i] = Math.min(255, C[q]);
      C[q]++;
    }
  }
}
