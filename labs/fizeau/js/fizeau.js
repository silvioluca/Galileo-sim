// fizeau.js — la fisica dell'esperimento di Fizeau (1849): la luce passa in un vano della ruota dentata,
// va fino allo specchio lontano e torna. Se nel frattempo la ruota è avanzata di mezzo dente, al ritorno
// trova un dente e l'osservatore non la vede più (eclissi).
//
// Fase della ruota u: in passi di dente (u intero = centro di un vano sul fascio). In un tempo t la fase
// avanza di N·f·t. Lo sfasamento fra andata e ritorno è s = N·f·τ, con τ = 2d/c il tempo di andata e ritorno.
// Nessuna dipendenza: gira identico nel browser e in Node.

export const C = 299792458;                 // m/s, nel vuoto (esatta per definizione)
export const N_AIR = 1.000277;              // aria secca a 15 °C e 1013 hPa, luce gialla
export const DUTY = 0.5;                    // vani e denti larghi uguali
/** Fizeau, 1849: Suresnes–Montmartre, ruota da 720 denti, prima eclissi a 12,6 giri al secondo. */
export const HISTORY = { d: 8633, N: 720, f1: 12.6 };
HISTORY.c = 4 * HISTORY.d * HISTORY.N * HISTORY.f1;

export const lightSpeed = (air) => (air ? C / N_AIR : C);
/** Tempo di andata e ritorno (s) su una distanza d (m). */
export const roundTrip = (d, air) => (2 * d) / lightSpeed(air);
/** Sfasamento fra andata e ritorno, in passi di dente. */
export const shift = (f, N, d, air) => N * f * roundTrip(d, air);
/** Velocità della ruota (giri/s) della k-esima eclissi: s = k − ½. */
export const eclipseF = (k, N, d, air) => ((2 * k - 1) * lightSpeed(air)) / (4 * d * N);
/** Velocità della ruota del k-esimo ritorno della luce piena: s = k. */
export const brightF = (k, N, d, air) => (k * lightSpeed(air)) / (2 * d * N);

/** Funzione d'errore (Abramowitz e Stegun 7.1.26, errore < 1,5·10⁻⁷). */
export function erf(x) {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/**
 * Frazione della luce di un'immagine gaussiana (deviazione standard sigma, in passi) che passa la ruota
 * quando la sua fase è u. Somma sui vani vicini: ognuno lascia passare la parte della gaussiana che lo copre.
 */
export function gate(u, sigma, duty = DUTY) {
  const w = duty / 2, r = Math.SQRT2 * Math.max(sigma, 1e-6);
  const d = u - Math.round(u);
  let T = 0;
  for (let k = -2; k <= 2; k++) { const c = d - k; T += 0.5 * (erf((w - c) / r) + erf((w + c) / r)); }
  return Math.min(T, 1);
}

/**
 * Luce che torna all'osservatore con la ruota che gira (media nel tempo), rispetto a quella con la ruota
 * ferma e un vano sul fascio. È la correlazione fra il passaggio all'andata e quello al ritorno,
 * ⟨G(u)·G(u + s)⟩, calcolata in serie di Fourier: per un'onda quadra di vani smussata da una gaussiana
 * le armoniche valgono c_k = sin(π·k·duty)/(π·k)·exp(−2π²σ²k²).
 */
export function returned(s, sigma, duty = DUTY) {
  let I = duty * duty;
  for (let k = 1; k <= 4000; k++) {
    const ck = Math.sin(Math.PI * k * duty) / (Math.PI * k);
    if (ck === 0) continue;
    const damp = Math.exp(-4 * Math.PI * Math.PI * sigma * sigma * k * k);
    if (damp < 1e-12) break;
    I += 2 * ck * ck * damp * Math.cos(2 * Math.PI * k * s);
  }
  const G0 = gate(0, sigma, duty);
  return I / (G0 * G0);
}

/** Ordine dell'eclissi più vicina allo sfasamento s (1 per s ≈ ½, 2 per s ≈ 1½, …). */
export const eclipseOrder = (s) => Math.max(1, Math.round(s + 0.5));
/** Velocità della luce che si ricava prendendo f come k-esima eclissi. */
export const measuredC = (f, k, N, d) => (4 * d * N * f) / (2 * k - 1);
