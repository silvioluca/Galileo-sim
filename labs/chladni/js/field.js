// field.js — come vibra la lamina adesso: risposta forzata al generatore, oppure il modo che fa suonare l'archetto.
// Lo spostamento è una somma di modi, W(x) = Σ a_k φ_k(x). Per il vibratore la forza F al punto d'attacco p dà
//     a_k = φ_k(p) · F / (ρh a²) / (ω_k² − ω² + i ω ω_k / Q)
// (modi normalizzati sulla massa; i tre modi rigidi della lamina libera hanno ω_k = 0). Il campo si sintetizza
// sulla griglia combinando prima i coefficienti dei polinomi: un costo che non dipende da quanti modi contano.
import { SHAPES, legendre } from './plate.js';

export const G0 = 9.81;

export class Field {
  constructor(gx = 145) { this.gx = gx; this.pack = null; }

  /** I modi appena calcolati (dal worker). */
  setPack(pack) {
    this.pack = pack;
    const { Nx, Ny, gmax, K } = pack, gx = this.gx, nx1 = Nx + 1, ny1 = Ny + 1;
    const h = 2 / (gx - 1), gy = 2 * Math.round(gmax / h) + 1, y0 = -((gy - 1) / 2) * h;
    Object.assign(this, { nc: nx1 * ny1, nx1, ny1, h, gy, y0, x0: -1, K });
    const t0 = new Float64Array(Math.max(nx1, ny1)), t1 = new Float64Array(t0.length), t2 = new Float64Array(t0.length);
    this.LX = new Float64Array(gx * nx1); this.LY = new Float64Array(gy * ny1);
    for (let i = 0; i < gx; i++) { legendre(-1 + i * h, Nx, t0, t1, t2); this.LX.set(t0.subarray(0, nx1), i * nx1); }
    for (let j = 0; j < gy; j++) { legendre((y0 + j * h) / gmax, Ny, t0, t1, t2); this.LY.set(t0.subarray(0, ny1), j * ny1); }
    const n = gx * gy;
    this.re = new Float32Array(n); this.im = new Float32Array(n); this.mag = new Float32Array(n);
    this.inside = new Uint8Array(n);
    const S = SHAPES[pack.shapeId];
    let area = 0;
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const x = -1 + i * h, y = y0 + j * h;
      if (Math.abs(y) <= S.g(x)) { this.inside[j * gx + i] = 1; area += h * h; }
    }
    // area ridotta esatta, con Gauss sulla semicorda
    area = 0; for (let i = 0; i < 4000; i++) { const x = -1 + (i + 0.5) / 2000; area += 2 * S.g(x) / 2000; }
    this.areaRed = area;
    this.Cre = new Float64Array(this.nc); this.Cim = new Float64Array(this.nc);
    this.tre = new Float64Array(ny1); this.tim = new Float64Array(ny1);
    this.basisTmp = [new Float64Array(nx1), new Float64Array(nx1), new Float64Array(nx1), new Float64Array(ny1), new Float64Array(ny1), new Float64Array(ny1)];
    // gruppi di modi (quasi) degeneri: per l'archetto contano le loro combinazioni
    this.clusters = [];
    for (let k = 0; k < K; k++) {
      const last = this.clusters[this.clusters.length - 1];
      if (last && pack.lam[k] > 1e-6 && Math.abs(Math.sqrt(pack.lam[k]) / Math.sqrt(pack.lam[last[0]]) - 1) < 2e-3) last.push(k); else this.clusters.push([k]);
    }
  }

  /** Costanti fisiche: D, ρh, semilunghezza a (m), Q. */
  setPlate({ D, rhoH, a, Q }) {
    const p = this.pack; if (!p) return;
    this.a = a; this.Q = Q; this.rhoH = rhoH;
    this.wScale = Math.sqrt(D / rhoH) / (a * a);
    this.omega = new Float64Array(p.K);
    for (let k = 0; k < p.K; k++) this.omega[k] = p.lam[k] < 1e-4 ? 0 : Math.sqrt(p.lam[k]) * this.wScale;
    this.fMax = (this.omega[p.K - 1] / (2 * Math.PI)) * 0.96;
  }
  freq(k) { return this.omega[k] / (2 * Math.PI); }

  /** Tutti i modi in un punto (coordinate ridotte). */
  modesAt(x, y, out = new Float64Array(this.K)) {
    const p = this.pack, [a0, a1, a2, b0, b1, b2] = this.basisTmp, ny1 = this.ny1, nc = this.nc;
    legendre(x, p.Nx, a0, a1, a2); legendre(y / p.gmax, p.Ny, b0, b1, b2);
    for (let k = 0; k < p.K; k++) {
      const o = k * nc; let v = 0;
      for (let i = 0; i <= p.Nx; i++) { const ax = a0[i]; if (!ax) continue; let s = 0; const oi = o + i * ny1; for (let j = 0; j < ny1; j++) s += p.coef[oi + j] * b0[j]; v += ax * s; }
      out[k] = v;
    }
    return out;
  }

  /**
   * Coefficienti della risposta al vibratore: forza F (N) alla frequenza f nel punto con modi phiP.
   * Restituisce {re, im} (spostamenti modali in metri·√area ridotta).
   */
  driveCoeffs(f, F, phiP, re = new Float64Array(this.K), im = new Float64Array(this.K)) {
    const w = 2 * Math.PI * f, s = F / (this.rhoH * this.a * this.a), Q = this.Q;
    for (let k = 0; k < this.K; k++) {
      const wk = this.omega[k], dr = wk * wk - w * w, di = (w * wk) / Q, den = dr * dr + di * di;
      const g = phiP[k] * s;
      re[k] = (g * dr) / den; im[k] = (-g * di) / den;
    }
    return { re, im };
  }

  /** Accelerazione efficace sulla lamina, in g, per i coefficienti dati alla frequenza f. */
  rmsG(f, re, im) {
    let s = 0; for (let k = 0; k < this.K; k++) s += re[k] * re[k] + im[k] * im[k];
    const w = 2 * Math.PI * f;
    return (w * w * Math.sqrt(s / this.areaRed)) / G0;
  }

  /** Sintesi del campo complesso sulla griglia; mag = |W|. Restituisce il massimo di |W| sulla lamina. */
  synth(re, im) {
    const p = this.pack, nc = this.nc, ny1 = this.ny1, nx1 = this.nx1, gx = this.gx, gy = this.gy;
    const Cre = this.Cre, Cim = this.Cim; Cre.fill(0); Cim.fill(0);
    let big = 0; for (let k = 0; k < this.K; k++) big = Math.max(big, Math.abs(re[k]) + (im ? Math.abs(im[k]) : 0));
    const tol = big * 1e-4;
    for (let k = 0; k < this.K; k++) {
      const ar = re[k], ai = im ? im[k] : 0;
      if (Math.abs(ar) + Math.abs(ai) < tol) continue;
      const o = k * nc;
      for (let q = 0; q < nc; q++) { const c = p.coef[o + q]; if (c) { Cre[q] += ar * c; Cim[q] += ai * c; } }
    }
    const tre = this.tre, tim = this.tim, LX = this.LX, LY = this.LY;
    let mx = 0;
    for (let i = 0; i < gx; i++) {
      tre.fill(0); tim.fill(0);
      for (let a = 0; a < nx1; a++) { const lx = LX[i * nx1 + a]; if (!lx) continue; const o = a * ny1; for (let j = 0; j < ny1; j++) { tre[j] += lx * Cre[o + j]; tim[j] += lx * Cim[o + j]; } }
      for (let j = 0; j < gy; j++) {
        let sr = 0, si = 0; const o = j * ny1;
        for (let b = 0; b < ny1; b++) { const ly = LY[o + b]; sr += tre[b] * ly; si += tim[b] * ly; }
        const q = j * gx + i;
        this.re[q] = sr; this.im[q] = si;
        const m = Math.hypot(sr, si); this.mag[q] = m;
        if (this.inside[q] && m > mx) mx = m;
      }
    }
    this.maxMag = mx;
    return mx;
  }

  /** Il campo reale «in fase» (la direzione principale del campo complesso): le sue linee di zero sono le linee nodali. */
  realPart(out) {
    let srr = 0, sii = 0, sri = 0;
    for (let q = 0; q < this.re.length; q++) if (this.inside[q]) { const r = this.re[q], i = this.im[q]; srr += r * r; sii += i * i; sri += r * i; }
    const th = 0.5 * Math.atan2(2 * sri, srr - sii), c = Math.cos(th), s = Math.sin(th);
    for (let q = 0; q < this.re.length; q++) out[q] = this.re[q] * c + this.im[q] * s;
    return out;
  }

  /** Valore interpolato di una griglia nel punto (coordinate ridotte). */
  sample(grid, x, y) {
    const fx = (x + 1) / this.h, fy = (y - this.y0) / this.h;
    const i = Math.max(0, Math.min(this.gx - 2, Math.floor(fx))), j = Math.max(0, Math.min(this.gy - 2, Math.floor(fy)));
    const u = fx - i, v = fy - j, o = j * this.gx + i;
    return (grid[o] * (1 - u) + grid[o + 1] * u) * (1 - v) + (grid[o + this.gx] * (1 - u) + grid[o + this.gx + 1] * u) * v;
  }

  /**
   * L'archetto: quale gruppo di modi suona con l'archetto nel punto b e (se c'è) il dito nel punto d.
   * Il dito smorza i modi che lo fanno muovere; dei modi degeneri sopravvive la combinazione con un nodo sotto
   * il dito. pressure 0…1: un archetto pesante e lento fa suonare le note basse, uno leggero quelle alte.
   * @returns {{ list: {cl, f, score, coupling, coef: Float64Array}[], best }}
   */
  bowChoice(phiB, phiD, pressure, fCap) {
    const p = this.pack, out = [];
    const f0 = this.freq(this.clusters.find((c) => this.omega[c[0]] > 0)?.[0] ?? 0) || 1;
    const fPref = f0 * Math.pow(Math.min(fCap, f0 * 40) / f0, 1 - pressure) ;
    for (const cl of this.clusters) {
      const k0 = cl[0]; if (!this.omega[k0]) continue;
      const f = this.freq(k0); if (f > fCap) break;
      const vb = cl.map((k) => phiB[k]), peak = Math.max(...cl.map((k) => p.peak[k]));
      let alpha = vb.slice(), damp = 1;
      if (phiD) {
        const vd = cl.map((k) => phiD[k]);
        if (cl.length > 1) {
          const dd = vd.reduce((s, v) => s + v * v, 0), bd = vb.reduce((s, v, i) => s + v * vd[i], 0);
          if (dd > 1e-12) alpha = vb.map((v, i) => v - (bd / dd) * vd[i]);
        } else damp = Math.exp(-28 * (vd[0] / peak) ** 2);
      }
      const na = Math.hypot(...alpha);
      if (na < 1e-9) continue;
      const coupling = na / peak;                                   // |χ(b)| / max|χ|
      const w = Math.exp(-0.5 * (Math.log(f / fPref) / 0.6) ** 2);
      const score = coupling * damp * w;
      const coef = new Float64Array(this.K);
      cl.forEach((k, i) => { coef[k] = alpha[i] / na; });
      out.push({ cl, f, coupling, damp, score, coef });
    }
    let best = null; for (const c of out) if (c.coupling > 0.2 && (!best || c.score > best.score)) best = c;
    return { list: out, best };
  }
}
