// ripple.js — la fisica delle increspature nella vaschetta ondoscopica (nessuna dipendenza: gira anche in Node).
//
// Le onde sull'acqua di una vaschetta, lunghe un paio di centimetri, sono onde di gravità e di capillarità insieme:
// la relazione di dispersione è  ω² = (g·k + (σ/ρ)·k³)·tanh(k·h),  con k = 2π/λ, σ la tensione superficiale e h la
// profondità. Ne viene la velocità di fase v = ω/k: nelle frequenze della vaschetta (5–25 Hz) sta poco sopra il suo
// minimo, circa 23 cm/s, e cresce di poco con la frequenza; dove l'acqua è bassa (sopra una lastra di vetro) tanh(k·h)
// la riduce, e l'onda rallenta: lì λ si accorcia e il fronte si piega (rifrazione).
// La simulazione (nella scheda grafica) integra l'equazione delle onde con la velocità di fase della frequenza del
// generatore in ogni punto: per un'onda monocromatica è la stessa cosa.
// Unità SI.

export const G = 9.81;
export const SIGMA_RHO = 0.0728 / 998;          // σ/ρ dell'acqua a 20 °C
export const PLATE_DEPTH = 0.0015;              // acqua sopra la lastra di vetro

/** Numero d'onda k (1/m) alla frequenza f (Hz) e profondità h (m): bisezione sulla relazione di dispersione. */
export function kOf(f, h) {
  const w2 = (2 * Math.PI * f) ** 2;
  let lo = 0.1, hi = 2e5;
  for (let i = 0; i < 80; i++) {
    const k = Math.sqrt(lo * hi), F = (G * k + SIGMA_RHO * k ** 3) * Math.tanh(k * h) - w2;
    if (F > 0) hi = k; else lo = k;
  }
  return Math.sqrt(lo * hi);
}
export const lambdaOf = (f, h) => (2 * Math.PI) / kOf(f, h);
export const speedOf = (f, h) => f * lambdaOf(f, h);
/** Solo gravità, acqua profonda (per confronto): λ = g/(2π f²). */
export const lambdaGravity = (f) => G / (2 * Math.PI * f * f);

/** Ampiezza relativa nel punto (x, z) di due sorgenti puntiformi coerenti (onde circolari, ampiezza ∝ 1/√r). */
export function twoSources(x, z, s1, s2, k, dphi = 0) {
  const r1 = Math.hypot(x - s1[0], z - s1[1]), r2 = Math.hypot(x - s2[0], z - s2[1]);
  const a1 = 1 / Math.sqrt(Math.max(r1, 1e-3)), a2 = 1 / Math.sqrt(Math.max(r2, 1e-3));
  const re = a1 * Math.cos(k * r1) + a2 * Math.cos(k * r2 + dphi), im = a1 * Math.sin(k * r1) + a2 * Math.sin(k * r2 + dphi);
  return Math.hypot(re, im);
}
/** Figura di una o due fenditure (larghe a, distanti d) vista da un punto a distanza: ampiezza relativa (Huygens,
 *  somma di molte sorgenti lungo le aperture, con 1/√r: vale anche da vicino). */
export function slits(x, z, xb, a, d, k, two) {
  const opens = two ? [[-d / 2 - a / 2, -d / 2 + a / 2], [d / 2 - a / 2, d / 2 + a / 2]] : [[-a / 2, a / 2]];
  let re = 0, im = 0;
  for (const [z0, z1] of opens) {
    const n = Math.max(8, Math.ceil(((z1 - z0) * k) / 0.6));
    for (let i = 0; i < n; i++) {
      const zs = z0 + ((i + 0.5) * (z1 - z0)) / n, r = Math.hypot(x - xb, z - zs), w = (z1 - z0) / n / Math.sqrt(Math.max(r, 1e-3));
      re += w * Math.cos(k * r); im += w * Math.sin(k * r);
    }
  }
  return Math.hypot(re, im);
}
/** Doppler: lunghezze d'onda davanti e dietro una sorgente che si muove a velocità u (< v). */
export const dopplerFront = (lam, u, v) => lam * (1 - u / v);
export const dopplerBack = (lam, u, v) => lam * (1 + u / v);
/** Semiapertura del cono di Mach (rad), se u > v. */
export const machAngle = (u, v) => (u > v ? Math.asin(v / u) : null);
