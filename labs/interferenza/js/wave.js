// wave.js — ottica ondulatoria scalare in approssimazione parassiale.
//
// Il fascio (gaussiano) arriva sull'elemento diffrangente; da lì al piano di osservazione il
// sistema ottico (tratti liberi e lenti sottili) è riassunto dalla sua matrice ABCD e il campo
// si ottiene con l'integrale di Collins:
//     U₂(x) ∝ ∫ U₁(ξ) · exp{ iπ (A ξ² − 2 ξ x + D x²) / (λ B) } dξ
// che contiene come casi particolari Fresnel (campo vicino), Fraunhofer (campo lontano) e il piano
// focale di una lente. La curvatura del fronte d'onda incidente è inglobata in A.
//
//  • elementi lineari (fenditure, filo, reticolo): il campo è separabile, U(x,y) = X(x)·Y(y);
//    X si calcola con una FFT 1D, Y è un fascio gaussiano analitico;
//  • elementi circolari (fori, disco): integrale radiale con la funzione di Bessel J₀; più fori
//    si sommano con il teorema dello spostamento, il disco con il principio di Babinet.
//
// Nessuna dipendenza: gira identico nel browser e in Node (per i test). Unità: metri.

import { cie, spectralRGB, toGamut, displayRGB, planck } from '../../../shared/js/color.js';

export const SCREEN_W = 0.30;      // schermo 30 × 20 cm
export const SCREEN_H = 0.20;
const PI = Math.PI;

// ───────────────────────────── FFT ─────────────────────────────
const plans = new Map();
function plan(n) {
  let p = plans.get(n);
  if (p) return p;
  const rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  let bits = 0;
  while ((1 << bits) < n) bits++;
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  for (let k = 0; k < n / 2; k++) { cos[k] = Math.cos((2 * PI * k) / n); sin[k] = Math.sin((2 * PI * k) / n); }
  p = { rev, cos, sin };
  plans.set(n, p);
  return p;
}

/** FFT complessa in loco (lunghezza potenza di 2). */
export function fft(re, im, inverse = false) {
  const n = re.length, { rev, cos, sin } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cos[k], wi = inverse ? sin[k] : -sin[k];
        const a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) { const s = 1 / n; for (let i = 0; i < n; i++) { re[i] *= s; im[i] *= s; } }
}

// ───────────────────────────── funzioni di Bessel ─────────────────────────────
export function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const b = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a / b;
  }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
  const a = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const b = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
}

export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
    const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const b = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const v = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
  return x < 0 ? -v : v;
}

// ───────────────────────────── colore ─────────────────────────────
// (funzioni colorimetriche comuni a tutti i laboratori)
export { cie, spectralRGB, toGamut, displayRGB };

/**
 * Campionamento dello spettro della sorgente.
 * @returns {{lam:number, rgb:number[], Y:number}[]}  pesi già normalizzati: la somma dei colori dà il bianco (1,1,1)
 */
export function spectrum(source, count) {
  if (source.kind === 'laser') {
    const l = source.lambda * 1e9;
    const rgb = spectralRGB(l);
    const Y = Math.max(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], 1e-6);
    const g = toGamut(rgb).map((v) => Math.max(v, 0));
    const m = Math.max(g[0], g[1], g[2]);
    return [{ lam: source.lambda, rgb: g.map((v) => v / m), Y: Y / m }];
  }
  const out = [], sum = [0, 0, 0];
  const l0 = 400, l1 = 700;
  for (let i = 0; i < count; i++) {
    const l = l0 + ((i + 0.5) * (l1 - l0)) / count;
    const s = planck(l, 6500);
    const rgb = spectralRGB(l).map((v) => v * s);
    out.push({ lam: l * 1e-9, rgb });
    for (let k = 0; k < 3; k++) sum[k] += rgb[k];
  }
  for (const o of out) {
    o.rgb = o.rgb.map((v, k) => v / sum[k]);
    o.Y = 0.2126 * o.rgb[0] + 0.7152 * o.rgb[1] + 0.0722 * o.rgb[2];
  }
  return out;
}

// ───────────────────────────── fascio gaussiano e matrici ABCD ─────────────────────────────

/** Il fascio (raggio w, curvatura R) alla coordinata x del banco, attraverso le lenti che precedono x. */
export function beamAt(cfg, lam, x) {
  const w0 = cfg.source.w0, zR = (PI * w0 * w0) / lam;
  let qr = 0, qi = zR;                       // q = z + i·zR al piano di uscita della sorgente
  const L = cfg.lens;
  if (L.on && L.x < x) {
    qr += L.x;
    // lente sottile: 1/q' = 1/q − 1/f
    const d = qr * qr + qi * qi;
    let ir = qr / d - 1 / L.f, ii = -qi / d;
    const e = ir * ir + ii * ii;
    qr = ir / e; qi = -ii / e;
    qr += x - L.x;
  } else qr += x;
  const d = qr * qr + qi * qi;
  const invR = qr / d, invW2 = (PI / lam) * (qi / d);
  return { w: Math.sqrt(1 / invW2), R: Math.abs(invR) < 1e-12 ? Infinity : 1 / invR, w0 };
}

/** Elementi A e B della matrice dal piano dell'elemento (xm) al piano di osservazione (x). */
export function abcdAfter(cfg, xm, x) {
  const L = cfg.lens;
  if (L.on && L.x > xm && L.x < x) {
    const d1 = L.x - xm, d2 = x - L.x;
    return { A: 1 - d2 / L.f, B: d1 + d2 - (d1 * d2) / L.f, lens: true };
  }
  return { A: 1, B: x - xm, lens: false };
}

/** Coordinata del piano dell'elemento diffrangente (con "nessun elemento" basta un piano subito dopo la sorgente). */
export const maskPlane = (cfg) => (cfg.element.kind === 'none' ? Math.min(0.005, cfg.xScreen * 0.5) : cfg.xMask);
export const isLinear = (el) => el.kind === 'slits' || el.kind === 'wire' || el.kind === 'grating';

// ───────────────────────────── trasmissione degli elementi lineari ─────────────────────────────

/** Intervalli aperti [da, a] lungo ξ per fenditure e filo (il reticolo è periodico e trattato a parte). */
function openings(el) {
  if (el.kind === 'slits') {
    const out = [];
    for (let j = 0; j < el.n; j++) { const c = (j - (el.n - 1) / 2) * el.d; out.push([c - el.a / 2, c + el.a / 2]); }
    return out;
  }
  return null;
}
function featureSize(el) {
  if (el.kind === 'slits') return el.n > 1 ? Math.min(el.a, el.d - el.a > 0 ? el.d - el.a : el.a) : el.a;
  if (el.kind === 'wire') return el.a;
  if (el.kind === 'grating') return 1e-3 / el.lines / 2;
  return Infinity;
}
/** Frazione aperta della cella [x0, x1] (campionamento ad area: niente scalettature sui bordi). */
function coverage(el, x0, x1) {
  const len = x1 - x0;
  if (el.kind === 'grating') {
    const p = 1e-3 / el.lines, open = p / 2;
    // aperture centrate sui multipli del passo
    let acc = 0;
    const k0 = Math.floor((x0 + open / 2) / p), k1 = Math.floor((x1 + open / 2) / p);
    for (let k = k0; k <= k1; k++) {
      const a = k * p - open / 2, b = a + open;
      acc += Math.max(0, Math.min(x1, b) - Math.max(x0, a));
    }
    return acc / len;
  }
  if (el.kind === 'wire') {
    const blocked = Math.max(0, Math.min(x1, el.a / 2) - Math.max(x0, -el.a / 2));
    return 1 - blocked / len;
  }
  let acc = 0;
  for (const [a, b] of openings(el)) acc += Math.max(0, Math.min(x1, b) - Math.max(x0, a));
  return acc / len;
}

// ───────────────────────────── motore 1D (elementi lineari) ─────────────────────────────
const buffers = new Map();
function buf(n) {
  let b = buffers.get(n);
  if (!b) { b = { re: new Float64Array(n), im: new Float64Array(n), I: new Float64Array(n), P: new Float64Array(n + 1) }; buffers.set(n, b); }
  return b;
}
const MAXN = 1 << 18;
const pow2 = (v) => { let n = 256; while (n < v && n < MAXN) n <<= 1; return n; };

/**
 * Risolve la parte X(x) del campo sul piano di osservazione xObs per la lunghezza d'onda lam.
 * extent: semi-larghezza (m) che si vuole coprire sul piano di osservazione.
 * Il risultato si campiona con sampleLinear().
 */
export function solveLinear(cfg, lam, xObs, extent, fast = false) {
  const xm = maskPlane(cfg);
  const beam = beamAt(cfg, lam, xm);
  const { A, B, lens } = abcdAfter(cfg, xm, xObs);
  const Ap = A + (isFinite(beam.R) ? B / beam.R : 0);     // curvatura del fronte incidente inglobata in A
  const w = beam.w, el = cfg.element;
  const half = 3.4 * w;                                    // oltre, l'ampiezza del fascio è < 10⁻⁵
  const feat = featureSize(el);
  // i reticoli si campionano a 1/8 di passo; gli altri elementi a 1/8 del dettaglio più fine
  const q = fast ? 2 : 1;                                   // campionamento dimezzato per le anteprime
  const dBase = Math.max(Math.min(el.kind === 'grating' ? feat / 4 : (q * feat) / 8, (q * w) / 24), (4 * half) / MAXN);

  // 1) campo vicino: spettro angolare (funzione di trasferimento), griglia invariata.
  //    La finestra è doppia rispetto al fascio: la luce diffratta non rientra dai bordi.
  let N = pow2((4 * half) / dBase);
  let dxi = (4 * half) / N;
  const zc = (N * dxi * dxi) / lam;
  const ze = Math.abs(Ap) > 1e-9 ? B / Ap : Infinity;
  const near = Math.abs(ze) <= zc;
  if (!near) {
    // 2) campo lontano: una sola FFT del campo moltiplicato per la fase quadratica
    const nonpar = !lens;
    const xp = nonpar ? (Math.abs(B) * extent) / Math.hypot(B, extent) : extent;       // coordinata parassiale del bordo
    const dOut = (lam * Math.abs(B)) / (2 * xp * 1.05);
    const dChirp = (lam * Math.abs(B)) / (2 * Math.max(Math.abs(Ap), 1e-12) * 2.6 * w);
    dxi = Math.min(dBase, dOut, dChirp);
    N = pow2((2 * half) / dxi);
    dxi = Math.max(dxi, (2 * half) / N);
  }
  const b = buf(N), re = b.re, im = b.im, I = b.I;
  const chirp = near ? 0 : (PI * Ap) / (lam * B);
  for (let n = 0; n < N; n++) {
    const xi = (n - N / 2) * dxi;
    let amp = 0;
    if (Math.abs(xi) < half) {
      amp = Math.exp(-(xi * xi) / (w * w));
      if (el.kind !== 'none') amp *= coverage(el, xi - dxi / 2, xi + dxi / 2);
    }
    if (chirp) { const ph = chirp * xi * xi; re[n] = amp * Math.cos(ph); im[n] = amp * Math.sin(ph); } else { re[n] = amp; im[n] = 0; }
  }
  fft(re, im, false);
  let c0, dc, scale;
  if (near) {
    // U(z) = F⁻¹{ F{u} · exp(−iπ λ z f²) }
    const k = -PI * lam * ze, df = 1 / (N * dxi);
    for (let n = 0; n < N; n++) {
      const f = (n < N / 2 ? n : n - N) * df, ph = k * f * f;
      const c = Math.cos(ph), s = Math.sin(ph), r = re[n], i = im[n];
      re[n] = r * c - i * s; im[n] = r * s + i * c;
    }
    fft(re, im, true);
    for (let n = 0; n < N; n++) I[n] = re[n] * re[n] + im[n] * im[n];
    c0 = (-N / 2) * dxi; dc = dxi; scale = 1 / Math.abs(Ap);
  } else {
    const h = N / 2;
    for (let n = 0; n < N; n++) { const m = (n + h) % N; I[n] = re[m] * re[m] + im[m] * im[m]; }   // frequenze in ordine crescente
    dc = 1 / (N * dxi); c0 = -h * dc; scale = (dxi * dxi) / (lam * Math.abs(B));
  }
  const P = b.P;
  P[0] = 0;
  for (let n = 0; n < N; n++) P[n + 1] = P[n] + I[n];
  // fattore verticale: il fascio gaussiano che prosegue indisturbato lungo y
  const wy = beamAt(cfg, lam, xObs).w;
  const gain = (beam.w0 / w) ** 2 * (w / wy);
  return { near, N, I, P, c0, dc, scale, Ap, B, lam, nonpar: !near && !lens, wy, gain, w, lens };
}

/** Intensità media (mediata sull'intervallo) fra le coordinate di schermo xa e xb. */
export function sampleLinear(s, xa, xb) {
  let ca, cb, factor = s.scale;
  if (s.near) { ca = xa / s.Ap; cb = xb / s.Ap; } else if (s.nonpar) {
    // fuori dall'approssimazione parassiale: x = B·tanθ con sinθ = λ·f, più il fattore di obliquità cos³θ
    const ha = Math.hypot(s.B, xa), hb = Math.hypot(s.B, xb), k = 1 / (s.lam * s.B);
    ca = (s.B * xa / ha) * k; cb = (s.B * xb / hb) * k;
    const c = Math.abs(s.B) / Math.hypot(s.B, 0.5 * (xa + xb));
    factor *= c * c * c;
  } else { const k = 1 / (s.lam * s.B); ca = xa * k; cb = xb * k; }
  if (ca > cb) { const t = ca; ca = cb; cb = t; }
  const { I, P, c0, dc, N } = s;
  if (cb - ca < dc) {
    const u = (0.5 * (ca + cb) - c0) / dc;
    if (u <= 0 || u >= N - 1) return 0;
    const i = Math.floor(u), t = u - i;
    return (I[i] * (1 - t) + I[i + 1] * t) * factor * s.gain;
  }
  // media esatta della funzione costante a tratti
  const ua = Math.min(Math.max((ca - c0) / dc + 0.5, 0), N), ub = Math.min(Math.max((cb - c0) / dc + 0.5, 0), N);
  if (ub - ua < 1e-9) return 0;
  const ia = Math.floor(ua), ib = Math.floor(ub);
  let acc = P[ib] - P[ia];
  if (ia < N) acc -= I[ia] * (ua - ia);
  if (ib < N) acc += I[ib] * (ub - ib);
  return (acc / ((cb - ca) / dc)) * factor * s.gain;
}

// ───────────────────────────── motore radiale (elementi circolari) ─────────────────────────────

/**
 * Campo complesso Ẽ(r) prodotto da un foro centrato di raggio a (oppure dal fascio libero, o dal disco).
 * kind: 'hole' | 'disc' | 'free'. Scrive parte reale e immaginaria in out[offset + 2k], out[offset + 2k + 1].
 */
export function solveRadial(cfg, lam, xObs, kind, a, radii, out, offset = 0) {
  const xm = maskPlane(cfg);
  const beam = beamAt(cfg, lam, xm);
  const { A, B } = abcdAfter(cfg, xm, xObs);
  const Ap = A + (isFinite(beam.R) ? B / beam.R : 0);
  const w = beam.w, gain = beam.w0 / w;
  const n = radii.length;
  const lamB = lam * B;
  const kap = Math.abs(lamB) > 1e-18 ? (2 * PI) / lamB : Infinity;
  const NF = (a * a * Math.abs(Ap)) / Math.max(Math.abs(lamB), 1e-18);       // numero di Fresnel efficace
  const info = { Ap, B, lam, w, NF, gain, regime: 'fresnel' };

  // fascio libero: integrale gaussiano in forma chiusa  κ·exp(−b²/4p)/(2p),  p = 1/w² − iπA/(λB)
  const free = (r, o) => {
    if (!isFinite(kap) || Math.abs(B) < 1e-9) {
      const m = Math.abs(Ap) > 1e-9 ? Ap : 1e-9, x = r / m;
      out[o] = (gain / Math.abs(m)) * Math.exp(-(x * x) / (w * w)); out[o + 1] = 0;
      return;
    }
    const pr = 1 / (w * w), pi = (-PI * Ap) / lamB;
    const d = pr * pr + pi * pi, b2 = (kap * r) ** 2 / 4;
    // exp(−b²/(4p)) = exp(−b2·conj(p)/|p|²)
    const er = (-b2 * pr) / d, ei = (b2 * pi) / d;
    const mag = Math.exp(er) * Math.abs(kap) * 0.5 * gain;
    const cr = Math.cos(ei), ci = Math.sin(ei);
    // dividere per p = moltiplicare per conj(p)/|p|²
    out[o] = (mag * (cr * pr + ci * pi)) / d;
    out[o + 1] = (mag * (ci * pr - cr * pi)) / d;
  };
  if (kind === 'free') { for (let k = 0; k < n; k++) free(radii[k], offset + 2 * k); info.regime = 'libero'; return info; }

  if (NF > 150 || !isFinite(kap)) {
    // ottica geometrica: sullo schermo c'è l'immagine (o l'ombra) nitida dell'elemento
    info.regime = 'geometrico';
    const m = Math.abs(Ap), edge = Math.max(m * a * 0.01, 1e-7);
    for (let k = 0; k < n; k++) {
      const o = offset + 2 * k, r = radii[k];
      const inside = 1 - Math.min(Math.max((r - m * a) / edge + 0.5, 0), 1);
      if (kind === 'disc') { free(r, o); out[o] *= 1 - inside; out[o + 1] *= 1 - inside; } else {
        const x = r / m;
        out[o] = (gain / m) * Math.exp(-(x * x) / (w * w)) * inside; out[o + 1] = 0;
      }
    }
    return info;
  }
  const chirp = (PI * Ap) / lamB;
  const fraunhofer = NF < 0.02 && a < 0.3 * w;
  if (fraunhofer) info.regime = 'fraunhofer';
  const apod = Math.exp(-(a * a) / (2 * w * w));
  for (let k = 0; k < n; k++) {
    const o = offset + 2 * k, r = radii[k];
    let ur = 0, ui = 0;
    const osc = (2 * a * r) / Math.abs(lamB);          // oscillazioni di J₀ lungo il raggio del foro
    if (fraunhofer) {
      const x = kap * a * r;
      ur = Math.abs(kap) * a * a * apod * (Math.abs(x) < 1e-6 ? 0.5 : besselJ1(x) / x);
    } else if (osc > 260) {
      ur = 0; ui = 0;                                    // molto oltre il 200° anello: intensità trascurabile
    } else {
      // Simpson su ρ ∈ [0, a]
      let m = Math.ceil(24 + 14 * (NF + osc));
      if (m % 2) m++;
      const h = a / m;
      for (let j = 0; j <= m; j++) {
        const rho = j * h;
        const wt = j === 0 || j === m ? 1 : j % 2 ? 4 : 2;
        const f = wt * rho * Math.exp(-(rho * rho) / (w * w)) * besselJ0(kap * rho * r);
        const ph = chirp * rho * rho;
        ur += f * Math.cos(ph); ui += f * Math.sin(ph);
      }
      const s = (Math.abs(kap) * h) / 3;
      ur *= s; ui *= s;
    }
    ur *= gain; ui *= gain;
    if (kind === 'disc') { free(r, o); out[o] -= ur; out[o + 1] -= ui; } else { out[o] = ur; out[o + 1] = ui; }
  }
  return info;
}

/** Centri dei fori (lungo ξ) e ampiezza del fascio su ciascuno. */
export function holeCenters(cfg, w) {
  const el = cfg.element;
  if (el.kind !== 'holes') return [{ x: 0, c: 1 }];
  const out = [];
  for (let j = 0; j < el.n; j++) { const x = (j - (el.n - 1) / 2) * el.d; out.push({ x, c: Math.exp(-(x * x) / (w * w)) }); }
  return out;
}

/** Tipo di soluzione radiale e raggio caratteristico dell'elemento. */
export function radialKind(el) {
  if (el.kind === 'holes') return { kind: 'hole', a: el.a / 2 };
  if (el.kind === 'disc') return { kind: 'disc', a: el.a / 2 };
  return { kind: 'free', a: 0 };
}

/**
 * Intensità lungo l'asse orizzontale (y = 0) per gli elementi circolari, da una tabella radiale già calcolata.
 * table: campo complesso su raggi uniformi 0…rMax (nR campioni); indexOf, se dato, converte un raggio
 * nell'indice frazionario di una tabella a passo non uniforme.
 */
export function radialIntensityAt(x, table, nR, rMax, holes, info, indexOf) {
  let sr = 0, si = 0;
  const k = PI / (info.lam * info.B);
  for (const h of holes) {
    const r = Math.abs(x - info.Ap * h.x);
    const u = indexOf ? indexOf(r) : (r / rMax) * (nR - 1);
    if (!(u < nR - 1)) continue;
    const i = Math.floor(u), t = u - i;
    const er = table[2 * i] * (1 - t) + table[2 * i + 2] * t, ei = table[2 * i + 1] * (1 - t) + table[2 * i + 3] * t;
    const ph = holes.length > 1 && isFinite(k) ? k * (info.Ap * h.x * h.x - 2 * h.x * x) : 0;
    const c = Math.cos(ph) * h.c, s = Math.sin(ph) * h.c;
    sr += er * c - ei * s; si += er * s + ei * c;
  }
  return sr * sr + si * si;
}

// ───────────────────────────── grandezze da mostrare ─────────────────────────────

/** Frazione della potenza del fascio che supera l'elemento. */
export function transmittedFraction(cfg, lam) {
  const el = cfg.element;
  if (el.kind === 'none') return 1;
  const w = beamAt(cfg, lam, maskPlane(cfg)).w;
  if (el.kind === 'disc') return Math.exp((-2 * (el.a / 2) ** 2) / (w * w));
  if (el.kind === 'holes') {
    let s = 0;
    for (const h of holeCenters(cfg, w)) s += h.c * h.c * (1 - Math.exp((-2 * (el.a / 2) ** 2) / (w * w)));
    return Math.min(s, 1);
  }
  // elementi lineari: integrale numerico di exp(−2ξ²/w²)·t(ξ)
  const n = 4000, half = 3.5 * w, d = (2 * half) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = -half + (i + 0.5) * d, g = Math.exp((-2 * x * x) / (w * w));
    den += g; num += g * coverage(el, x - d / 2, x + d / 2);
  }
  return num / den;
}

/** Scala efficace del campo lontano: λ·B/A (m²) — la "λL" delle formule, corretta per lenti e fronte curvo. */
export function effectiveScale(cfg, lam) {
  const xm = maskPlane(cfg), beam = beamAt(cfg, lam, xm);
  const { A, B, lens } = abcdAfter(cfg, xm, cfg.xScreen);
  const Ap = A + (isFinite(beam.R) ? B / beam.R : 0);
  return { A, B, Ap, lens, lamB: lam * B, w: beam.w, R: beam.R, ws: beamAt(cfg, lam, cfg.xScreen).w };
}
