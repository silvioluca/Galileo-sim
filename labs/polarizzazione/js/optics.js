// optics.js — la luce polarizzata con il calcolo di Mueller sui vettori di Stokes.
//
// Lo stato della luce è S = (S0, S1, S2, S3): l'intensità, quanto è polarizzata verticale o orizzontale, a +45° o −45°,
// circolare. Gli angoli si contano dalla verticale, in senso orario per chi guarda verso la sorgente (come si leggono
// le ghiere dei polarizzatori e dei polarimetri). La luce della lampada non è polarizzata e contiene tutti i colori: il
// calcolo si fa lunghezza d'onda per lunghezza d'onda e poi si somma con le funzioni colorimetriche, così le lamine
// e lo zucchero, che dipendono dal colore, colorano la luce. I polaroid lasciano passare l'86 % della luce lungo
// l'asse e lo 0,06 % di quella perpendicolare.
import { cie, planck } from '../../../shared/js/color.js';

const D2R = Math.PI / 180;
export const LAMBDAS = Array.from({ length: 31 }, (_, i) => 400 + i * 10);
const LAMP = LAMBDAS.map((l) => planck(l, 3100));               // lampada alogena
const SUN = LAMBDAS.map((l) => planck(l, 6000));                // luce bianca del pannello
const CMF = LAMBDAS.map((l) => cie(l));
export const SOURCES = {
  lamp: { name: 'Lampada', white: true, spec: LAMP },
  red: { name: 'Laser rosso', lambda: 650, dop: 0.99 },
  green: { name: 'Laser verde', lambda: 532, dop: 0.99 },
};
export const K1 = 0.86, K2 = 0.0006;

// ─────────────────────────── matrici di Mueller ───────────────────────────
const mul = (M, S) => [0, 1, 2, 3].map((i) => M[i][0] * S[0] + M[i][1] * S[1] + M[i][2] * S[2] + M[i][3] * S[3]);
/** Polarizzatore con l'asse a th gradi. */
export function polarizer(th, k1 = K1, k2 = K2) {
  const c = Math.cos(2 * th * D2R), s = Math.sin(2 * th * D2R), a = (k1 + k2) / 2, b = (k1 - k2) / 2, g = Math.sqrt(k1 * k2);
  return [[a, b * c, b * s, 0], [b * c, a * c * c + g * s * s, (a - g) * c * s, 0], [b * s, (a - g) * c * s, a * s * s + g * c * c, 0], [0, 0, 0, g]];
}
/** Lamina di ritardo δ (radianti) con l'asse veloce a th gradi. */
export function retarder(th, d) {
  const c = Math.cos(2 * th * D2R), s = Math.sin(2 * th * D2R), cd = Math.cos(d), sd = Math.sin(d);
  return [[1, 0, 0, 0], [0, c * c + s * s * cd, c * s * (1 - cd), -s * sd], [0, c * s * (1 - cd), s * s + c * c * cd, c * sd], [0, s * sd, -c * sd, cd]];
}
/** Rotatore: il piano di polarizzazione gira di a gradi (positivo: in senso orario, destrogiro). */
export function rotator(a) {
  const c = Math.cos(2 * a * D2R), s = Math.sin(2 * a * D2R);
  return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]];
}
export const apply = (M, S) => mul(M, S);

/** L'ellisse di polarizzazione di S: grado di polarizzazione, orientazione ψ (gradi), ellitticità χ (gradi). */
export function ellipse(S) {
  const Ip = Math.hypot(S[1], S[2], S[3]), dop = S[0] > 1e-12 ? Math.min(1, Ip / S[0]) : 0;
  const psi = 0.5 * Math.atan2(S[2], S[1]) / D2R, chi = Ip > 1e-12 ? 0.5 * Math.asin(Math.max(-1, Math.min(1, S[3] / Ip))) / D2R : 0;
  return { I: S[0], dop, psi, chi };
}
/** Descrizione a parole dello stato. */
export function describe(S) {
  const e = ellipse(S);
  if (S[0] < 1e-6) return 'buio';
  if (e.dop < 0.08) return 'non polarizzata';
  const kind = Math.abs(e.chi) > 40 ? 'circolare' : Math.abs(e.chi) > 4 ? 'ellittica' : 'lineare';
  const verso = Math.abs(e.chi) > 4 ? (e.chi > 0 ? ' sinistrorsa' : ' destrorsa') : '';
  const ang = ((e.psi % 180) + 180) % 180;
  return `${kind}${verso}${kind !== 'circolare' ? ` a ${Math.round(ang)}°` : ''}${e.dop < 0.92 ? ' (in parte)' : ''}`;
}

// ─────────────────────────── il banco ottico ───────────────────────────
// Lamine progettate per il laser rosso (650 nm); lo zucchero ha potere rotatorio 66,5°·mL/(g·dm) a 589 nm, che cresce come 1/λ².
export const TUBE_DM = 2, DESIGN = 650;
export const rotation = (conc, l) => 66.5 * TUBE_DM * conc * (589 / l) ** 2;
/**
 * La catena del banco per una lunghezza d'onda l. cfg: { src, useP, p1, mid, m, conc, useA, an }.
 * Restituisce gli stati dopo la sorgente, il polarizzatore, l'elemento centrale, l'analizzatore (e dentro il tubo).
 */
export function chain(cfg, l) {
  const src = SOURCES[cfg.src];
  let S = src.white ? [1, 0, 0, 0] : [1, src.dop, 0, 0];             // i laser escono polarizzati in verticale
  const out = [S];
  if (cfg.useP) S = mul(polarizer(cfg.p1), S);
  out.push(S);
  if (cfg.mid === 'pol') S = mul(polarizer(cfg.m), S);
  else if (cfg.mid === 'half') S = mul(retarder(cfg.m, Math.PI * (DESIGN / l)), S);
  else if (cfg.mid === 'quarter') S = mul(retarder(cfg.m, (Math.PI / 2) * (DESIGN / l)), S);
  else if (cfg.mid === 'sugar') S = mul(rotator(rotation(cfg.conc, l)), S);
  out.push(S);
  if (cfg.useA) S = mul(polarizer(cfg.an), S);
  out.push(S);
  return out;
}
/** Il banco con la luce della sorgente: per ogni tratto l'intensità (0…1), il colore (sRGB lineare) e lo stato a λ0. */
export function bench(cfg) {
  const src = SOURCES[cfg.src];
  if (!src.white) {
    const st = chain(cfg, src.lambda);
    return { I: st.map((s) => s[0]), color: st.map(() => null), states: st, lambda: src.lambda, reading: st[3][0] };
  }
  // luce bianca: si somma sullo spettro; il fotometro pesa con la sensibilità dell'occhio (Y)
  const acc = [0, 1, 2, 3].map(() => [0, 0, 0]);
  let Y0 = 0;
  LAMBDAS.forEach((l, i) => {
    const st = chain(cfg, l), w = src.spec[i];
    for (let k = 0; k < 4; k++) for (let c = 0; c < 3; c++) acc[k][c] += w * st[k][0] * CMF[i][c];
    Y0 += w * CMF[i][1];
  });
  // l'occhio si adatta alla lampada: la sua luce, senza filtri, è il bianco
  const raw = acc.map(([X, Y, Z]) => xyzToRGB(X / Y0, Y / Y0, Z / Y0)), w0 = raw[0];
  const rgb = raw.map((c) => c.map((v, i) => Math.max(0, v / w0[i])));
  return { I: acc.map((a) => a[1] / Y0), color: rgb, states: chain(cfg, 550), lambda: 550, reading: acc[3][1] / Y0 };
}
export function xyzToRGB(X, Y, Z) {
  // bianco di riferimento: quello della sorgente (X = Y = Z circa); riportato verso il bianco D65
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
}

// ─────────────────────────── Brewster ───────────────────────────
export const GLASSES = { crown: { name: 'Vetro crown', n: 1.52 }, flint: { name: 'Vetro flint', n: 1.62 }, pmma: { name: 'Plexiglas', n: 1.49 } };
/** Riflettività di Fresnel per s e p all'angolo di incidenza th (gradi), dall'aria al mezzo n. */
export function fresnel(th, n) {
  const ti = th * D2R, st = Math.sin(ti) / n, tt = Math.asin(Math.min(1, st)), ci = Math.cos(ti), ct = Math.cos(tt);
  const rs = (ci - n * ct) / (ci + n * ct), rp = (n * ci - ct) / (n * ci + ct);
  return { Rs: rs * rs, Rp: rp * rp, rs, rp, tt: tt / D2R };
}
export const brewsterAngle = (n) => Math.atan(n) / D2R;

// ─────────────────────────── fotoelasticità ───────────────────────────
// Disco di policarbonato (⌀ 6 cm, spesso 6 mm) compresso lungo un diametro: il campo di sforzi ha una forma chiusa
// (Hertz–Frocht). La differenza delle tensioni principali dà il ritardo δ = 2π (σ1 − σ2) t / fσ, con fσ la costante
// di frangia del materiale (7 kN/m a 550 nm, proporzionale a λ).
export const DISK = { R: 0.03, t: 0.006, fs: 7000 };
/** Δσ per newton di carico e direzione principale (radianti) nel punto (x, y) del disco (carico lungo y). */
export function diskStress(x, y) {
  const { R, t } = DISK, k = 2 / (Math.PI * t);
  const r1 = x * x + (R - y) ** 2, r2 = x * x + (R + y) ** 2;
  if (r1 < 1e-8 || r2 < 1e-8) return { ds: 1e9, phi: 0 };
  const sx = -k * ((R - y) * x * x / (r1 * r1) + (R + y) * x * x / (r2 * r2) - 1 / (2 * R));
  const sy = -k * ((R - y) ** 3 / (r1 * r1) + (R + y) ** 3 / (r2 * r2) - 1 / (2 * R));
  const txy = k * ((R - y) ** 2 * x / (r1 * r1) - (R + y) ** 2 * x / (r2 * r2));
  return { ds: Math.sqrt((sx - sy) ** 2 + 4 * txy * txy), phi: 0.5 * Math.atan2(2 * txy, sx - sy) };
}
/** Ordine di frangia al centro: N = 8P / (π D fσ). */
export const centerOrder = (P) => (8 * P) / (Math.PI * 2 * DISK.R * DISK.fs);
/**
 * Il polariscopio, per ogni lunghezza d'onda: le matrici prima e dopo il campione. opt: { pa (polarizzatore),
 * aa (analizzatore), circ (lamine λ/4 a +45° e −45° dal polarizzatore, incrociate), light: 'white'|'sodium' }.
 */
export function polariscope(opt) {
  const ls = opt.light === 'sodium' ? [589] : LAMBDAS.filter((_, i) => i % 2 === 0);
  return ls.map((l) => {
    let S = mul(polarizer(opt.pa), [1, 0, 0, 0]);
    if (opt.circ) S = mul(retarder(opt.pa + 45, (Math.PI / 2) * (550 / l)), S);
    let Mout = polarizer(opt.aa);
    if (opt.circ) { const Q = retarder(opt.pa - 45, (Math.PI / 2) * (550 / l)); Mout = mm(Mout, Q); }   // incrociata con la prima
    const li = LAMBDAS.indexOf(l), cmf = li >= 0 ? CMF[li] : cie(l), w = opt.light === 'sodium' ? 1 : SUN[li];
    return { l, Sin: S, row: Mout[0], cmf, w };
  });
}
const mm = (A, B) => A.map((r, i) => [0, 1, 2, 3].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j] + r[3] * B[3][j]));
/** Intensità e colore (XYZ) di un punto con ritardo per 550 nm d550 e direzione phi (gradi), attraverso il polariscopio P. */
export function pixelXYZ(P, d550, phi) {
  let X = 0, Y = 0, Z = 0;
  for (const p of P) {
    const S = mul(retarder(phi, d550 * (550 / p.l)), p.Sin), I = p.row[0] * S[0] + p.row[1] * S[1] + p.row[2] * S[2] + p.row[3] * S[3];
    X += p.w * I * p.cmf[0]; Y += p.w * I * p.cmf[1]; Z += p.w * I * p.cmf[2];
  }
  return [X, Y, Z];
}
/** Il bianco di riferimento del polariscopio (polarizzatori paralleli, nessun campione). */
export function whiteXYZ(P) {
  let X = 0, Y = 0, Z = 0;
  for (const p of P) { const k = p.w * 0.5 * (K1 + K2) * K1; X += k * p.cmf[0]; Y += k * p.cmf[1]; Z += k * p.cmf[2]; }
  return [X, Y, Z];
}
/**
 * La tabella dei colori del polariscopio: per ogni ordine di frangia N (a 550 nm, da 0 a maxN) e direzione principale φ
 * (da 0° a 180°, al centro dei texel) il colore sRGB, già codificato in byte (RGBA). Con la luce bianca il bianco è quello
 * dei polarizzatori paralleli; con il sodio la luce resta gialla. Per un campione di ritardo δ e asse φ l'intensità è
 * A(φ) + B(φ) cos δ + C(φ) sin δ: i coefficienti si calcolano una volta per φ, il resto è una somma.
 */
export const LUT_MAXN = 30;
export function photoLUT(opt, nN = 1024, nPhi = 64, maxN = LUT_MAXN) {
  const P = polariscope(opt), W = whiteXYZ(P), nl = P.length;
  const cs = new Float64Array(nN * nl), sn = new Float64Array(nN * nl);
  for (let i = 0; i < nN; i++) for (let k = 0; k < nl; k++) { const d = 2 * Math.PI * ((i / (nN - 1)) * maxN) * (550 / P[k].l); cs[i * nl + k] = Math.cos(d); sn[i * nl + k] = Math.sin(d); }
  const sodium = opt.light === 'sodium', wRGB = xyzToRGB(...W);
  const yellow = sodium ? sodiumRGB() : null;
  const enc = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
  const out = new Uint8Array(nN * nPhi * 4), co = new Float64Array(nl * 9);
  for (let j = 0; j < nPhi; j++) {
    const ph = (((j + 0.5) / nPhi) * 180) * D2R, c = Math.cos(2 * ph), s = Math.sin(2 * ph);
    for (let k = 0; k < nl; k++) {
      const [S0, S1, S2, S3] = P[k].Sin, [r0, r1, r2, r3] = P[k].row;
      const A = r0 * S0 + r1 * (S1 * c * c + S2 * c * s) + r2 * (S1 * c * s + S2 * s * s);
      const B = r1 * (S1 * s * s - S2 * c * s) + r2 * (-S1 * c * s + S2 * c * c) + r3 * S3;
      const C = -r1 * S3 * s + r2 * S3 * c + r3 * (S1 * s - S2 * c);
      for (let q = 0; q < 3; q++) { const wq = P[k].w * P[k].cmf[q]; co[k * 9 + q] = A * wq; co[k * 9 + 3 + q] = B * wq; co[k * 9 + 6 + q] = C * wq; }
    }
    for (let i = 0; i < nN; i++) {
      let X = 0, Y = 0, Z = 0;
      for (let k = 0; k < nl; k++) {
        const a = cs[i * nl + k], b = sn[i * nl + k], o = k * 9;
        X += co[o] + co[o + 3] * a + co[o + 6] * b; Y += co[o + 1] + co[o + 4] * a + co[o + 7] * b; Z += co[o + 2] + co[o + 5] * a + co[o + 8] * b;
      }
      let rgb;
      if (sodium) { const y = Math.max(0, Y / W[1]); rgb = yellow.map((v) => v * y); } else rgb = xyzToRGB(X, Y, Z).map((v, q) => v / wRGB[q]);
      const p = (j * nN + i) * 4;
      out[p] = enc(rgb[0]); out[p + 1] = enc(rgb[1]); out[p + 2] = enc(rgb[2]); out[p + 3] = 255;
    }
  }
  return { data: out, nN, nPhi, maxN };
}
/** Il giallo della lampada al sodio, in sRGB lineare, con il canale più forte a 1. */
function sodiumRGB() {
  const [X, Y, Z] = cie(589), rgb = xyzToRGB(X / Y, 1, Z / Y), m = Math.min(...rgb);
  // fuori gamma: si desatura quanto basta conservando la luminanza
  const L = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], k = m < 0 ? L / (L - m) : 1;
  const g = rgb.map((v) => L + (v - L) * k), top = Math.max(...g);
  return g.map((v) => v / top);
}
