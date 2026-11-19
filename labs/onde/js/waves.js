// waves.js — onde stazionarie in una dimensione: la corda di Melde e la colonna d'aria di un tubo sonoro.
//
// Tutte e due obbediscono all'equazione delle onde con un poco di smorzamento:
//   ∂²y/∂t² = v²·∂²y/∂x² − 2β·∂y/∂t
// dove y è lo spostamento (trasversale per la corda, lungo il tubo per l'aria) e v la velocità dell'onda:
// √(T/μ) per la corda, c ≈ 331·√(1 + t/273) m/s per l'aria. Gli estremi decidono quali onde stazionarie esistono:
//  - estremo fisso (corda sulla carrucola, tubo chiuso): y = 0, un nodo di spostamento;
//  - estremo libero (tubo aperto): ∂y/∂x = 0, un nodo di pressione, appena fuori dal tubo (correzione ≈ 0,61·r);
//  - il vibratore (o la membrana dell'altoparlante) impone y = A·sin(ωt); l'altoparlante davanti a un'apertura
//    impone invece la pressione, cioè la pendenza ∂y/∂x.
// L'onda che parte dal vibratore e quella riflessa si sommano: quando la lunghezza contiene un numero giusto di
// mezze lunghezze d'onda (o di quarti, con un estremo aperto) si rinforzano a ogni andata e ritorno: risonanza.
// Integrazione esplicita alle differenze finite (salto di rana), con il passo sotto il limite di Courant; la
// soluzione a regime per una frequenza (per la curva di risonanza teorica) si trova risolvendo il sistema
// tridiagonale complesso sulla stessa griglia.
// Unità SI. Nessuna dipendenza: gira identico nel browser e in Node.

export const G = 9.81;
export const STRINGS = {
  cotton: { name: 'Filo di cotone', short: 'cotone', mu: 0.0005, r: 0.0007, color: '#f1ece0' },
  nylon: { name: 'Cordino di nylon', short: 'nylon', mu: 0.001, r: 0.0009, color: '#e2c34e' },
  cord: { name: 'Cordoncino', short: 'cordoncino', mu: 0.002, r: 0.0012, color: '#c8553a' },
};
export const TUBE_R = 0.025;
export const END_CORR = 0.61 * TUBE_R;
export const ENDS = {
  cc: { name: 'Chiuso e chiuso', short: 'chiuso–chiuso', left: 'disp', right: 'fixed', note: 'Altoparlante contro un estremo, tappo all\'altro: nodi di spostamento ai due estremi (il tubo di Kundt)' },
  co: { name: 'Chiuso e aperto', short: 'chiuso–aperto', left: 'disp', right: 'free', note: 'Altoparlante contro un estremo, l\'altro aperto: un nodo e un ventre, solo armoniche dispari' },
  oo: { name: 'Aperto e aperto', short: 'aperto–aperto', left: 'press', right: 'free', note: 'Altoparlante davanti a un estremo aperto, l\'altro aperto: ventri di spostamento ai due estremi' },
};
export const soundSpeed = (tc) => 331.3 * Math.sqrt(1 + tc / 273.15);
export const BETA = { string: 2, tube: 22 };

/** Frequenze di risonanza ideali (senza smorzamento): f_n per n = 1, 2, … */
export function modeFreq(kind, n, v, L, ends = 'cc') {
  if (kind === 'string') return (n * v) / (2 * L);
  const e = ENDS[ends];
  const Le = L + (e.right === 'free' ? END_CORR : 0) + (e.left === 'press' ? END_CORR : 0);
  return ends === 'co' ? ((2 * n - 1) * v) / (4 * Le) : (n * v) / (2 * Le);
}

export class Wave1D {
  /** o: { L, v, beta, N, left: 'disp'|'press', right: 'fixed'|'free', ext0, ext1 } — ext: tratti di dominio oltre
   *  gli estremi visibili (la correzione d'estremità dei tubi aperti). */
  constructor(o) {
    this.f = 10; this.A = 0.001; this.phi = 0; this.t = 0; this.on = true;
    this.strobeF = 0; this.strobePh = 0; this.flashes = 0; this.snapPhi = 0;
    this.configure(o);
  }
  configure(o) {
    const old = this.x ? { x: this.x, y: this.y, yo: this.yo, e: this.e2 } : null;
    Object.assign(this, o);
    const N = this.N, x0 = -(this.ext0 || 0), x1 = this.L + (this.ext1 || 0);
    this.dx = (x1 - x0) / N;
    this.x = new Float64Array(N + 1); for (let i = 0; i <= N; i++) this.x[i] = x0 + i * this.dx;
    this.y = new Float64Array(N + 1); this.yo = new Float64Array(N + 1); this.yn = new Float64Array(N + 1); this.e2 = new Float64Array(N + 1); this.snap = new Float64Array(N + 1);
    if (old) {
      // si conserva la forma (riscalata sulla nuova lunghezza), così cambiare un parametro non azzera il moto
      const s = (old.x[old.x.length - 1] - old.x[0]) / (x1 - x0);
      for (let i = 0; i <= N; i++) { const xi = old.x[0] + (this.x[i] - x0) * s; this.y[i] = interp(old.x, old.y, xi); this.yo[i] = interp(old.x, old.yo, xi); this.e2[i] = interp(old.x, old.e, xi); }
    }
    this._dt();
  }
  _dt() {
    const dtNew = (0.95 * this.dx) / this.v;
    if (this.dt && Math.abs(dtNew - this.dt) > 1e-15) for (let i = 0; i <= this.N; i++) this.yo[i] = this.y[i] - (this.y[i] - this.yo[i]) * (dtNew / this.dt);
    this.dt = dtNew; this.r2 = ((this.v * dtNew) / this.dx) ** 2;
  }
  setV(v) { if (v !== this.v) { this.v = v; this._dt(); } }
  setDrive(f, A) { this.f = f; this.A = A; }
  /** Avanza di T secondi (passi interi del passo stabile; il resto si accumula). */
  step(T) {
    this.acc = (this.acc || 0) + T;
    const n = Math.floor(this.acc / this.dt);
    if (n <= 0) return 0;
    this.acc -= n * this.dt;
    const N = this.N, dt = this.dt, r2 = this.r2, b = this.beta * dt, w = 2 * Math.PI * this.f;
    const y = this.y, yo = this.yo, e2 = this.e2;
    let yn = this.yn;
    const tauE = Math.max(2.5 / Math.max(this.f, 0.5), 0.02), ke = dt / tauE;
    const dispL = this.left === 'disp', fixR = this.right === 'fixed';
    const kslope = this.A * (w / this.v);
    for (let s = 0; s < n; s++) {
      this.phi += w * dt; if (this.phi > 6.283185307179586) this.phi -= 6.283185307179586;
      const drv = this.on ? Math.sin(this.phi) : 0;
      for (let i = 1; i < N; i++) yn[i] = (2 * y[i] - (1 - b) * yo[i] + r2 * (y[i + 1] - 2 * y[i] + y[i - 1])) / (1 + b);
      if (dispL) yn[0] = this.A * drv;
      else { const ghost = y[1] - 2 * this.dx * kslope * drv; yn[0] = (2 * y[0] - (1 - b) * yo[0] + r2 * (y[1] - 2 * y[0] + ghost)) / (1 + b); }
      if (fixR) yn[N] = 0;
      else yn[N] = (2 * y[N] - (1 - b) * yo[N] + r2 * (2 * y[N - 1] - 2 * y[N])) / (1 + b);
      for (let i = 0; i <= N; i++) { yo[i] = y[i]; y[i] = yn[i]; e2[i] += (yn[i] * yn[i] - e2[i]) * ke; }
      this.t += dt;
      // stroboscopio: a ogni lampo si fissa la forma (e la fase del vibratore)
      if (this.strobeF > 0) { this.strobePh += this.strobeF * dt; if (this.strobePh >= 1) { this.strobePh -= Math.floor(this.strobePh); this.snap.set(y); this.snapPhi = this.phi; this.flashes++; } }
    }
    return n;
  }
  /** Lampi a frequenza fs (0: spento). */
  setStrobe(fs) {
    this.strobeF = fs;
    if (!this.snap || this.snap.length !== this.N + 1) { this.snap = new Float64Array(this.N + 1); this.snap.set(this.y); this.snapPhi = this.phi; this.strobePh = 0; this.flashes = 0; }
  }
  /** Ampiezza stimata (dalla media dei quadrati) nel nodo i. */
  amp(i) { return Math.sqrt(2 * this.e2[i]); }
  /** Indici della griglia dentro la parte visibile [0, L]. */
  get i0() { return Math.round((this.ext0 || 0) / this.dx); }
  get i1() { return this.N - Math.round((this.ext1 || 0) / this.dx); }
  ampMax() { let m = 0; for (let i = this.i0; i <= this.i1; i++) m = Math.max(m, this.e2[i]); return Math.sqrt(2 * m); }
  /** Valore interpolato di un campo nel punto x. */
  at(field, x) { return interp(this.x, field, x); }
  reset() { this.y.fill(0); this.yo.fill(0); this.e2.fill(0); this.snap.fill(0); this.phi = 0; this.t = 0; }

  /** Soluzione a regime alla frequenza f: ampiezza complessa Y_i (y = Im(Y·e^{iωt})). */
  steady(f, A = this.A) {
    const N = this.N, dx2 = this.dx * this.dx, v2 = this.v * this.v, w = 2 * Math.PI * f;
    const kr = w * w, ki = -2 * this.beta * w;                 // ω² − 2iβω
    // righe: a_i·Y_{i−1} + b_i·Y_i + c_i·Y_{i+1} = d_i (reali a, c; b e d complessi)
    const n = N + 1, a = new Float64Array(n), c = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n), dr = new Float64Array(n), di = new Float64Array(n);
    for (let i = 0; i < n; i++) { a[i] = v2 / dx2; c[i] = v2 / dx2; br[i] = -2 * v2 / dx2 + kr; bi[i] = ki; }
    if (this.left === 'disp') { a[0] = 0; c[0] = 0; br[0] = 1; bi[0] = 0; dr[0] = A; }
    else { a[0] = 0; c[0] = (2 * v2) / dx2; dr[0] = (2 * v2 / this.dx) * A * (w / this.v); }
    if (this.right === 'fixed') { a[N] = 0; c[N] = 0; br[N] = 1; bi[N] = 0; dr[N] = 0; }
    else { a[N] = (2 * v2) / dx2; c[N] = 0; }
    // Thomas, in complesso
    const cpR = new Float64Array(n), cpI = new Float64Array(n), dpR = new Float64Array(n), dpI = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let mr = br[i], mi = bi[i], er = dr[i], ei = di[i];
      if (i > 0) { mr -= a[i] * cpR[i - 1]; mi -= a[i] * cpI[i - 1]; er -= a[i] * dpR[i - 1]; ei -= a[i] * dpI[i - 1]; }
      const den = mr * mr + mi * mi;
      cpR[i] = (c[i] * mr) / den; cpI[i] = (-c[i] * mi) / den;
      dpR[i] = (er * mr + ei * mi) / den; dpI[i] = (ei * mr - er * mi) / den;
    }
    const Yr = new Float64Array(n), Yi = new Float64Array(n);
    Yr[N] = dpR[N]; Yi[N] = dpI[N];
    for (let i = N - 1; i >= 0; i--) { Yr[i] = dpR[i] - (cpR[i] * Yr[i + 1] - cpI[i] * Yi[i + 1]); Yi[i] = dpI[i] - (cpR[i] * Yi[i + 1] + cpI[i] * Yr[i + 1]); }
    return { Yr, Yi };
  }
  /** Ampiezza massima a regime (nella parte visibile) alla frequenza f. */
  steadyMax(f, A = this.A) {
    const { Yr, Yi } = this.steady(f, A);
    let m = 0; for (let i = this.i0; i <= this.i1; i++) m = Math.max(m, Yr[i] * Yr[i] + Yi[i] * Yi[i]);
    return Math.sqrt(m);
  }
}
export function interp(xs, ys, x) {
  const n = xs.length, x0 = xs[0], dx = (xs[n - 1] - x0) / (n - 1);
  let u = (x - x0) / dx; if (u <= 0) return ys[0]; if (u >= n - 1) return ys[n - 1];
  const i = Math.floor(u); u -= i;
  return ys[i] * (1 - u) + ys[i + 1] * u;
}
/** Ventri contati sul profilo delle ampiezze: massimi locali alti almeno metà del più alto. */
export function countLoops(amps) {
  let mx = 0; for (const a of amps) mx = Math.max(mx, a);
  if (mx <= 0) return 0;
  let n = 0, up = false, low = true;
  for (let i = 1; i < amps.length; i++) {
    const a = amps[i] / mx;
    if (a < 0.35) low = true;
    if (low && a > 0.6) { n++; low = false; up = true; }
  }
  return up ? n : 0;
}
