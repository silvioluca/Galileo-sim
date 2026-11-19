// color.js — dalla lunghezza d'onda al colore: funzioni colorimetriche CIE 1931 e gamma sRGB.
// Nessuna dipendenza: gira identico nel browser e in Node.

const lobe = (l, mu, s1, s2) => { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
/** Funzioni colorimetriche CIE 1931 (approssimazione analitica di Wyman, Sloan e Shirley). λ in nm. */
export function cie(l) {
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ];
}
/** λ (nm) → sRGB lineare; può avere componenti negative (colori spettrali fuori gamma). */
export function spectralRGB(l) {
  const [X, Y, Z] = cie(l);
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
}
/** Riporta un colore nella gamma sRGB conservandone la luminanza. */
export function toGamut(rgb) {
  const Y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const m = Math.min(rgb[0], rgb[1], rgb[2]);
  if (m >= 0) return rgb.slice();
  const k = Y / (Y - m);
  return rgb.map((c) => Y + (c - Y) * k);
}
/** Colore da mostrare per una luce monocromatica (normalizzato al canale massimo). */
export function displayRGB(l) {
  const c = toGamut(spectralRGB(l)).map((v) => Math.max(v, 0));
  const m = Math.max(c[0], c[1], c[2], 1e-9);
  return c.map((v) => v / m);
}
/** Spettro del corpo nero (unità arbitrarie). λ in nm, T in kelvin. */
export const planck = (l, T) => { const x = l * 1e-9; return 1 / (x ** 5 * (Math.exp(0.0143877 / (x * T)) - 1)); };

/** sRGB lineare → stringa CSS (con la codifica gamma). */
export function cssRGB(rgb) {
  const c = rgb.map((v) => Math.round(255 * Math.min(Math.max(v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055, 0), 1)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
