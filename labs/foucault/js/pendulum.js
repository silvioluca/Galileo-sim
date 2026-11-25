// pendulum.js — il pendolo di Foucault nel riferimento della Terra che ruota.
// Il peso è un punto a distanza fissa L dal punto di sospensione (filo teso): pendolo sferico completo, non
// linearizzato, integrato con Runge–Kutta del quarto ordine; la tensione del filo è quella che mantiene |r| = L.
// Sul peso agiscono la gravità locale (che dipende dalla latitudine), la forza di Coriolis −2Ω×v con il vettore
// completo della rotazione terrestre, la resistenza dell'aria (quadratica). A scelta: la spinta elettromagnetica
// che rimpiazza l'energia persa (una piccola spinta lungo la velocità quando il peso passa vicino al centro) e
// l'anello di Charron, che al ritorno del filo smorza il moto di traverso, cioè l'ellisse.
// Coordinate locali: x verso est, y verso nord, z in alto, origine nel punto di sospensione. Metri, secondi.

export const OMEGA = (2 * Math.PI) / 86164.0905;        // rotazione terrestre (giorno siderale)
const RHO_AIR = 1.2, CD = 0.47, RHO_BRASS = 8500;

/** Gravità alla latitudine phi (rad), formula internazionale. */
export function gAt(phi) { const s = Math.sin(phi), s2 = Math.sin(2 * phi); return 9.780327 * (1 + 0.0053024 * s * s - 0.0000058 * s2 * s2); }
/** Rotazione del piano prevista da Foucault: rad/s (positivo = in senso orario visto dall'alto). */
export const foucaultRate = (phi) => OMEGA * Math.sin(phi);
/** Precessione di Airy di un'ellisse di semiassi a e b (rad/s, nel verso in cui gira l'ellisse). */
export const airyRate = (a, b, L, g) => (3 / 8) * Math.sqrt(g / L) * (a * b) / (L * L);

/**
 * Registro a densità uniforme: tiene una voce ogni `stride`; quando supera max voci ne toglie una su due
 * (la prima, l'inizio della misura, resta sempre) e raddoppia il passo. Così un pendolo lasciato andare
 * per giorni non riempie la memoria e il grafico copre sempre tutta la storia con la stessa risoluzione.
 */
function log(a, st, item, max = 4000) {
  if (st.n++ % st.stride !== 0) return;
  a.push(item);
  if (a.length > max) {
    let k = 0;
    for (let i = 0; i < a.length; i += 2) a[k++] = a[i];
    a.length = k; st.stride *= 2;
  }
}

export class Foucault {
  constructor() {
    this.p = { L: 15, m: 28, phi: (41.9 * Math.PI) / 180, A: 1.5, psi0: Math.PI / 2, vt: 0, ring: true, drive: true, tip: 0.17 };
    this.r = [0, 0, -15]; this.v = [0, 0, 0];
    this.t = 0; this.held = true;
    this.configure();
    this.hold();
  }

  configure() {
    const p = this.p;
    this.g = gAt(p.phi);
    this.Om = [0, OMEGA * Math.cos(p.phi), OMEGA * Math.sin(p.phi)];
    this.Oz = this.Om[2];
    this.w0 = Math.sqrt(this.g / p.L);
    this.R = Math.cbrt((3 * p.m) / (4 * Math.PI * RHO_BRASS));            // raggio della sfera d'ottone
    this.kd = (0.5 * RHO_AIR * CD * Math.PI * this.R * this.R) / p.m;     // resistenza dell'aria: a = −kd·|v|·v
    this.E0 = this.g * (p.L - Math.sqrt(p.L * p.L - p.A * p.A));          // energia (per kg) all'ampiezza voluta
    // passo d'integrazione: 1/400 di periodo
    this.h = (2 * Math.PI) / this.w0 / 400;
  }

  /** Il peso tenuto da un filo, scostato di A nella direzione psi0 (rad da est, verso nord). */
  hold() {
    const p = this.p, A = Math.min(p.A, p.L * 0.3);
    this.r = [A * Math.cos(p.psi0), A * Math.sin(p.psi0), -Math.sqrt(p.L * p.L - A * A)];
    this.v = [0, 0, 0];
    this.t = 0; this.held = true;
    this.turns = []; this.closest = []; this._s = 0; this._psi = null; this.amax = A; this.bmin = 0;
    this.lastTurn = null; this._logT = { n: 0, stride: 1 }; this._logC = { n: 0, stride: 1 };
  }
  /** Si brucia il filo: il peso parte (con un'eventuale spinta di traverso vt, m/s). */
  release() {
    const p = this.p;
    this.v = [-p.vt * Math.sin(p.psi0), p.vt * Math.cos(p.psi0), 0];
    this.held = false; this.t = 0;
  }

  energy(r = this.r, v = this.v) { return 0.5 * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) + this.g * (r[2] + this.p.L); }

  accel(r, v, out) {
    const p = this.p, O = this.Om, L = p.L;
    const sp = Math.hypot(v[0], v[1], v[2]);
    // gravità, Coriolis (−2Ω×v), aria
    let fx = -2 * (O[1] * v[2] - O[2] * v[1]) - this.kd * sp * v[0];
    let fy = -2 * (O[2] * v[0] - O[0] * v[2]) - this.kd * sp * v[1];
    let fz = -this.g - 2 * (O[0] * v[1] - O[1] * v[0]) - this.kd * sp * v[2];
    const rho = Math.hypot(r[0], r[1]);
    if (p.drive && rho < 0.12 * p.A) {
      // spinta elettromagnetica vicino al centro, lungo la velocità orizzontale
      const vh = Math.hypot(v[0], v[1]);
      if (vh > 1e-6) { const k = 0.15 * (1 - this.energy(r, v) / this.E0); fx += (k * v[0]) / vh; fy += (k * v[1]) / vh; }
    }
    if (p.ring && rho > 0.96 * this.amax && rho > 1e-6) {
      // anello di Charron (ideale): smorza la velocità di traverso, lasciando quella della rotazione del piano
      const ux = r[0] / rho, uy = r[1] / rho, vr = v[0] * ux + v[1] * uy;
      const px = v[0] - vr * ux - this.Oz * r[1] * 1, py = v[1] - vr * uy + this.Oz * r[0] * 1;
      fx -= 0.6 * px; fy -= 0.6 * py;
    }
    // tensione del filo: quella che mantiene |r| = L
    const lam = (r[0] * fx + r[1] * fy + r[2] * fz + v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / (L * L);
    out[0] = fx - lam * r[0]; out[1] = fy - lam * r[1]; out[2] = fz - lam * r[2];
  }

  /** Un passo di Runge–Kutta di durata h, poi il peso viene riportato esattamente sulla sfera di raggio L. */
  step(h) {
    const r = this.r, v = this.v, a1 = [0, 0, 0], a2 = [0, 0, 0], a3 = [0, 0, 0], a4 = [0, 0, 0], r2 = [0, 0, 0], v2 = [0, 0, 0];
    this.accel(r, v, a1);
    for (let i = 0; i < 3; i++) { r2[i] = r[i] + 0.5 * h * v[i]; v2[i] = v[i] + 0.5 * h * a1[i]; }
    const k2r = v2.slice(); this.accel(r2, v2, a2);
    for (let i = 0; i < 3; i++) { r2[i] = r[i] + 0.5 * h * k2r[i]; v2[i] = v[i] + 0.5 * h * a2[i]; }
    const k3r = v2.slice(); this.accel(r2, v2, a3);
    for (let i = 0; i < 3; i++) { r2[i] = r[i] + h * k3r[i]; v2[i] = v[i] + h * a3[i]; }
    const k4r = v2.slice(); this.accel(r2, v2, a4);
    for (let i = 0; i < 3; i++) {
      r[i] += (h / 6) * (v[i] + 2 * k2r[i] + 2 * k3r[i] + k4r[i]);
      v[i] += (h / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]);
    }
    const L = this.p.L, l = Math.hypot(r[0], r[1], r[2]);
    for (let i = 0; i < 3; i++) r[i] *= L / l;
    const vr = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (L * L);
    for (let i = 0; i < 3; i++) v[i] -= vr * r[i];
    this.t += h;
    this._watch();
  }

  /** I punti d'inversione (azimut del piano, ampiezza) e i passaggi più vicini al centro (semiasse minore). */
  _watch() {
    const r = this.r, v = this.v, s = r[0] * v[0] + r[1] * v[1];
    if (this._s > 0 && s <= 0) {
      const rho = Math.hypot(r[0], r[1]);
      let psi = Math.atan2(r[1], r[0]);
      if (this._psi !== null) { let d = psi - this._psi; d -= Math.PI * Math.round(d / Math.PI); psi = this._psi + d; }
      this._psi = psi;
      this.lastTurn = [this.t, psi, rho];
      log(this.turns, this._logT, this.lastTurn);
      this.amax = rho;
      this.onTurn?.(r[0], r[1]);
    } else if (this._s < 0 && s >= 0 && this._px !== undefined) {
      // distanza minima dal centro: dal tratto percorso nell'ultimo passo (il peso passa veloce, un passo è ~2 cm)
      const ax = this._px, ay = this._py, dx = r[0] - ax, dy = r[1] - ay, l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const rho = Math.hypot(ax + u * dx, ay + u * dy);
      this.bmin = rho;
      log(this.closest, this._logC, [this.t, rho]);
      this.onClosest?.(r[0], r[1]);
    }
    this._s = s; this._px = r[0]; this._py = r[1];
  }

  /** Velocità di rotazione del piano misurata (rad/s, positiva in senso orario) sugli ultimi punti d'inversione. */
  measuredRate(window = 3600) {
    const T = this.turns, n = T.length;
    if (n < 6) return null;
    const t1 = T[n - 1][0], pts = T.filter((q) => q[0] >= t1 - window);
    if (pts.length < 6) return null;
    let st = 0, sp = 0, stt = 0, stp = 0;
    for (const [t, p] of pts) { st += t; sp += p; stt += t * t; stp += t * p; }
    const k = pts.length, den = k * stt - st * st;
    return den > 0 ? -(k * stp - st * sp) / den : null;
  }
  /** Rotazione del piano dall'inizio (rad, positiva in senso orario). */
  rotated() { const T = this.turns; return T.length >= 1 && this.lastTurn ? -(this.lastTurn[1] - T[0][1]) : 0; }
  /** Periodo per piccole oscillazioni e corretto per l'ampiezza. */
  period() { const th = Math.asin(Math.min(1, this.p.A / this.p.L)); return ((2 * Math.PI) / this.w0) * (1 + (th * th) / 16 + (11 * th ** 4) / 3072); }
}
