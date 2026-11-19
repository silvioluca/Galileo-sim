// solver.js — collega il motore ondulatorio (wave.js) alle texture (pattern.js):
// riempie le tabelle dello schermo, ricava il profilo d'intensità e costruisce, a piccoli passi,
// il foglio di luce lungo il banco.
import {
  SCREEN_W, SCREEN_H, spectrum, isLinear, maskPlane, beamAt, solveLinear, sampleLinear,
  solveRadial, radialKind, holeCenters, radialIntensityAt, abcdAfter,
} from './wave.js';
import { TABLE_W, SHEET_K, SHEET_M, SHEET_HALF, SHEET_SINH } from './pattern.js';

const WIDE_R = Math.hypot(SCREEN_W, SCREEN_H) / 2 * 1.01;
const PROFILE_N = 512;
const tmp = new Float64Array(TABLE_W * 2);
const radiiWide = new Float64Array(TABLE_W), radiiDetail = new Float64Array(TABLE_W);

/**
 * Calcola la figura sullo schermo.
 * view: { hx } semi-larghezza della vista ingrandita (m).  nLam: campioni dello spettro (luce bianca).
 * @returns {{peak:number, profile:Float32Array, profileHalf:number, linear:boolean, info:object, nLam:number}}
 */
export function solveScreen(cfg, field, view, nLam, radialN = 1024) {
  const sp = spectrum(cfg.source, nLam);
  const n = sp.length, linear = isLinear(cfg.element);
  const u = field.uniforms;
  const wide = field.wide.image.data, detail = field.detail.image.data;
  const fullHalf = SCREEN_W / 2;
  const useDetail = view.hx < fullHalf * 0.98;
  const dHalf = useDetail ? (linear ? view.hx * 1.02 : view.hx * 1.2) : 0;     // la vista radiale deve coprire la diagonale
  const pHalf = useDetail ? view.hx : fullHalf;
  const profile = new Float32Array(PROFILE_N), coarse = new Float32Array(PROFILE_N);
  let info = null;
  u.mode.value = linear ? 0 : 1;
  u.nLam.value = n;
  u.wideHalf.value = linear ? fullHalf : WIDE_R;
  u.detailHalf.value = dHalf;

  if (linear) {
    u.tableN.value = TABLE_W;
    for (let i = 0; i < n; i++) {
      const { lam, rgb, Y } = sp[i];
      const s = solveLinear(cfg, lam, cfg.xScreen, fullHalf * 1.02);
      const o = i * TABLE_W * 2, dx = (2 * fullHalf) / TABLE_W;
      for (let m = 0; m < TABLE_W; m++) wide[o + 2 * m] = sampleLinear(s, -fullHalf + m * dx, -fullHalf + (m + 1) * dx);
      if (useDetail) { const dd = (2 * dHalf) / TABLE_W; for (let m = 0; m < TABLE_W; m++) detail[o + 2 * m] = sampleLinear(s, -dHalf + m * dd, -dHalf + (m + 1) * dd); }
      const dp = (2 * pHalf) / PROFILE_N, dc = (2 * fullHalf) / PROFILE_N;
      for (let p = 0; p < PROFILE_N; p++) {
        profile[p] += Y * sampleLinear(s, -pHalf + p * dp, -pHalf + (p + 1) * dp);
        coarse[p] += Y * sampleLinear(s, -fullHalf + p * dc, -fullHalf + (p + 1) * dc);
      }
      u.lamA.value[i].set(rgb[0], rgb[1], rgb[2], s.wy);
      info = { Ap: s.Ap, B: s.B, near: s.near, N: s.N, w: s.w, wy: s.wy, lam };
    }
    u.nHoles.value = 1;
  } else {
    const N = Math.min(radialN, TABLE_W);
    u.tableN.value = N;
    const { kind, a } = radialKind(cfg.element);
    const dR = dHalf;
    for (let k = 0; k < N; k++) { radiiWide[k] = (WIDE_R * k) / (N - 1); radiiDetail[k] = (dR * k) / (N - 1); }
    const rw = radiiWide.subarray(0, N), rd = radiiDetail.subarray(0, N);
    let holes = null;
    for (let i = 0; i < n; i++) {
      const { lam, rgb, Y } = sp[i];
      const o = i * TABLE_W * 2;
      info = solveRadial(cfg, lam, cfg.xScreen, kind, a, rw, tmp);
      for (let k = 0; k < 2 * N; k++) wide[o + k] = tmp[k];
      if (!holes) holes = holeCenters(cfg, info.w);
      const dc = (2 * fullHalf) / PROFILE_N;
      for (let p = 0; p < PROFILE_N; p++) coarse[p] += Y * radialIntensityAt(-fullHalf + (p + 0.5) * dc, tmp, N, WIDE_R, holes, info);
      if (useDetail) {
        solveRadial(cfg, lam, cfg.xScreen, kind, a, rd, tmp);
        for (let k = 0; k < 2 * N; k++) detail[o + k] = tmp[k];
      }
      const dp = (2 * pHalf) / PROFILE_N, R = useDetail ? dR : WIDE_R;
      for (let p = 0; p < PROFILE_N; p++) profile[p] += Y * radialIntensityAt(-pHalf + (p + 0.5) * dp, tmp, N, R, holes, info);
      u.lamA.value[i].set(rgb[0], rgb[1], rgb[2], 1);
      const k = Math.abs(info.B) > 1e-9 ? Math.PI / (lam * info.B) : 0;
      u.lamB.value[i].set(k, info.Ap, 0, 0);
    }
    u.nHoles.value = holes.length;
    holes.forEach((h, j) => u.holes.value[j].set(h.x, h.c, 0));
  }
  let peak = 0;
  for (let p = 0; p < PROFILE_N; p++) peak = Math.max(peak, profile[p], coarse[p]);
  // riferimento per l'esposizione: il secondo massimo, se molto più debole del primo (che allora satura, come in fotografia)
  const ref = Math.min(Math.max(secondPeak(profile), secondPeak(coarse), peak / 6), peak);
  return { peak, ref, profile, profileHalf: pHalf, coarse, linear, info, nLam: n };
}

/** Il più alto dei massimi che non appartengono al lobo principale. */
function secondPeak(a) {
  const n = a.length;
  let im = 0;
  for (let i = 1; i < n; i++) if (a[i] > a[im]) im = i;
  let r = im, l = im, s = 0;
  while (r + 1 < n && a[r + 1] <= a[r]) r++;
  while (l > 0 && a[l - 1] <= a[l]) l--;
  for (let i = 0; i < l; i++) if (a[i] > s) s = a[i];
  for (let i = r + 1; i < n; i++) if (a[i] > s) s = a[i];
  return s;
}

// posizioni trasversali del foglio di luce (mappa sinh: fitte vicino all'asse)
const sheetZ = new Float64Array(SHEET_M + 1);
for (let j = 0; j <= SHEET_M; j++) {
  const t = -1 + (2 * (j - 0.5)) / (SHEET_M - 1);
  sheetZ[j] = (SHEET_HALF * Math.sinh(SHEET_SINH * t)) / Math.sinh(SHEET_SINH);
}
const SHEET_NR = SHEET_M / 2 + 2;
const sheetR = new Float64Array(SHEET_NR);
for (let i = 0; i < SHEET_NR; i++) sheetR[i] = (SHEET_HALF * 1.02 * Math.sinh((SHEET_SINH * i) / (SHEET_NR - 1))) / Math.sinh(SHEET_SINH);
const sheetIndex = (r) => (Math.asinh((r / (SHEET_HALF * 1.02)) * Math.sinh(SHEET_SINH)) / SHEET_SINH) * (SHEET_NR - 1);
const col = new Float64Array(SHEET_M * 3);

/**
 * Generatore che costruisce il foglio di luce a risoluzione crescente (una sezione per passo).
 * Chi lo consuma decide quanto tempo dedicargli a ogni fotogramma.
 */
export function* buildSheet(cfg, sheet) {
  const data = sheet.data;
  const sp = spectrum(cfg.source, 6);          // per il foglio bastano sei bande dello spettro
  const linear = isLinear(cfg.element);
  const xm = maskPlane(cfg), xEnd = cfg.xScreen;
  const { kind, a } = radialKind(cfg.element);
  const done = new Uint8Array(SHEET_K);
  let peak = 0;
  for (let stride = 16; stride >= 1; stride >>= 1) {
    for (let k = 0; k < SHEET_K; k += stride) {
      if (done[k]) continue;
      done[k] = 1;
      const x = Math.max((k / (SHEET_K - 1)) * xEnd, 1e-4);
      col.fill(0);
      for (const { lam, rgb } of sp) {
        if (x <= xm) {
          // prima dell'elemento: il fascio gaussiano indisturbato
          const b = beamAt(cfg, lam, x), g = (b.w0 / b.w) ** 2;
          for (let j = 0; j < SHEET_M; j++) {
            const z = 0.5 * (sheetZ[j] + sheetZ[j + 1]);
            const I = g * Math.exp((-2 * z * z) / (b.w * b.w));
            col[3 * j] += rgb[0] * I; col[3 * j + 1] += rgb[1] * I; col[3 * j + 2] += rgb[2] * I;
          }
        } else if (linear) {
          const s = solveLinear(cfg, lam, x, SHEET_HALF, true);
          for (let j = 0; j < SHEET_M; j++) {
            const I = sampleLinear(s, sheetZ[j], sheetZ[j + 1]);
            col[3 * j] += rgb[0] * I; col[3 * j + 1] += rgb[1] * I; col[3 * j + 2] += rgb[2] * I;
          }
        } else {
          const info = solveRadial(cfg, lam, x, kind, a, sheetR, tmp);
          const holes = holeCenters(cfg, info.w);
          for (let j = 0; j < SHEET_M; j++) {
            const I = radialIntensityAt(0.5 * (sheetZ[j] + sheetZ[j + 1]), tmp, SHEET_NR, 0, holes, info, sheetIndex);
            col[3 * j] += rgb[0] * I; col[3 * j + 1] += rgb[1] * I; col[3 * j + 2] += rgb[2] * I;
          }
        }
      }
      // la sezione appena calcolata riempie anche le colonne vicine non ancora risolte
      for (let kk = k; kk < Math.min(k + stride, SHEET_K); kk++) {
        if (kk !== k && done[kk]) break;
        for (let j = 0; j < SHEET_M; j++) {
          const o = (j * SHEET_K + kk) * 4;
          data[o] = col[3 * j]; data[o + 1] = col[3 * j + 1]; data[o + 2] = col[3 * j + 2]; data[o + 3] = 1;
        }
      }
      for (let j = 0; j < SHEET_M * 3; j++) if (col[j] > peak) peak = col[j];
      sheet.material.uniforms.logHi.value = Math.log10(Math.max(peak, 1e-12));
      yield stride;
    }
  }
}

/** Le lenti deviano anche il fascio prima dell'elemento: utile per disegnare il percorso della luce. */
export const systemAt = (cfg, x) => abcdAfter(cfg, maskPlane(cfg), x);
