// physics.js — le forze magnetiche sulle correnti.
//
// Faraday (1821): un filo percorso da corrente in un campo magnetico subisce una forza F = I L × B. Qui il filo è il
// tratto orizzontale di un'altalena di ottone appesa a due fili, che passa fra i poli di uno, due o tre magneti a U:
// il campo fra le espansioni polari è verticale (90 mT), la forza è orizzontale e l'altalena si inclina finché la
// forza bilancia il peso: tan θ = F/mg (con un po' d'attrito dell'aria, e il campo che cala quando il filo esce dai poli).
// Ampère (1820): due correnti parallele si attraggono se hanno lo stesso verso, si respingono se hanno versi opposti,
// con una forza per unità di lunghezza F/L = μ0 I1 I2 / (2π d). Qui sono due strisce di alluminio verticali, tese da
// una molla: ciascuna è una corda (λ ü = T u'' + f − attrito) con la forza distribuita che cresce quando si avvicinano.
// Se si attraggono abbastanza si chiudono di colpo e restano attaccate.

export const G = 9.81;
export const MU0 = 4e-7 * Math.PI;

// ─────────────────────── Faraday: l'altalena fra i poli ───────────────────────
export const SWING = { pivotY: 0.3, l: 0.2, half: 0.1, r: 0.003, m: 0.035, damp: 1.6 };
export const MAGNET = { B0: 0.09, a: 0.04, pitch: 0.046, depth: 0.12, gap: 0.025, fringe: 0.005, arm: 0.02 };
export const ROD_Y = SWING.pivotY - SWING.l;
const box = (u, half, w) => 0.5 * (Math.tanh((u + half) / w) - Math.tanh((u - half) / w));
/** Posizioni lungo x dei magneti, n = 1…3. */
export const magnetX = (n) => Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * MAGNET.pitch);
/** Campo verticale fra le espansioni in (x, z): verso il basso (negativo) se il nord è in alto. */
export function gapField(x, z, n, flip) {
  let s = 0; for (const xk of magnetX(n)) s += box(x - xk, MAGNET.a / 2, MAGNET.fringe);
  return (flip ? 1 : -1) * MAGNET.B0 * s * box(z, MAGNET.depth / 2, MAGNET.fringe);
}
/** Forza orizzontale (lungo z) sul tratto orizzontale dell'altalena alla posizione z: F_z = I ∫ B_y dx. */
export function swingForce(I, z, n, flip) {
  let sum = 0; const N = 80, dx = (2 * SWING.half) / N;
  for (let i = 0; i < N; i++) sum += gapField(-SWING.half + (i + 0.5) * dx, z, n, flip) * dx;
  return I * sum;
}
export class Swing {
  constructor() { this.th = 0; this.w = 0; this.F = 0; }
  step(dt, I, n, flip) {
    const S = SWING, steps = Math.max(1, Math.ceil(dt / 0.002)), h = dt / steps;
    for (let k = 0; k < steps; k++) {
      this.F = swingForce(I, S.l * Math.sin(this.th), n, flip);
      const acc = (this.F * Math.cos(this.th) - S.m * G * Math.sin(this.th)) / (S.m * S.l) - S.damp * this.w;
      this.w += acc * h; this.th += this.w * h;
      if (Math.abs(this.th) > 0.6) { this.th = Math.sign(this.th) * 0.6; this.w = 0; }
    }
  }
}
/** Angolo d'equilibrio (F(θ) cos θ = m g sin θ). */
export function swingEquilibrium(I, n, flip) {
  let th = 0;
  for (let k = 0; k < 60; k++) th = Math.atan(swingForce(I, SWING.l * Math.sin(th), n, flip) / (SWING.m * G));
  return th;
}

// ─────────────────────── Ampère: le due strisce ───────────────────────
export const STRIPS = { L: 0.5, top: 0.6, d0: 0.016, w: 0.012, lam: 6.5e-4, T: 0.012, N: 50, damp: 4, dmin: 0.0012 };
export class Strips {
  constructor() { const n = STRIPS.N + 1; this.u = new Float64Array(n); this.v = new Float64Array(n); this.stuck = false; }
  reset() { this.u.fill(0); this.v.fill(0); this.stuck = false; }
  /** Ip: corrente in ciascuna striscia; mode 'opp' (si respingono) o 'same' (si attraggono). */
  step(dt, Ip, mode) {
    const S = STRIPS, n = S.N, dy = S.L / n, s = mode === 'opp' ? 1 : -1, k = (MU0 * Ip * Ip) / (2 * Math.PI);
    const steps = Math.max(1, Math.ceil(dt / 0.0008)), h = dt / steps, u = this.u, v = this.v;
    const lim = (S.dmin - S.d0) / 2;
    this.stuck = false;
    for (let st = 0; st < steps; st++) {
      for (let i = 1; i < n; i++) {
        const d = Math.max(S.dmin, S.d0 + 2 * u[i]);
        const a = (S.T * (u[i + 1] - 2 * u[i] + u[i - 1]) / (dy * dy) + (s * k) / d) / S.lam - S.damp * v[i];
        v[i] += a * h;
      }
      for (let i = 1; i < n; i++) {
        u[i] += v[i] * h;
        if (u[i] < lim) { u[i] = lim; if (v[i] < 0) v[i] = 0; this.stuck = true; }
      }
    }
  }
  /** Distanza fra le strisce a metà altezza. */
  gap() { return STRIPS.d0 + 2 * this.u[STRIPS.N >> 1]; }
}
/** La distanza d'equilibrio a metà altezza (rilassamento della forma statica); null se si chiudono. */
export function stripsEquilibrium(Ip, mode) {
  const S = STRIPS, sim = new Strips();
  for (let k = 0; k < 400; k++) sim.step(0.02, Ip, mode);
  return sim.stuck ? S.dmin : sim.gap();
}
