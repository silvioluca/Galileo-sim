// plate.js — la lamina vibrante: forme, materiali e modi propri di flessione (teoria di Kirchhoff).
// I modi si calcolano con il metodo di Ritz, lo stesso con cui Walther Ritz risolse nel 1909 il problema delle
// figure di Chladni: lo spostamento è una somma di prodotti di polinomi di Legendre P_i(x)·P_j(y), e i
// coefficienti rendono stazionaria l'energia
//     U = D/2 ∫ [ (w_xx + w_yy)² − 2(1−ν)(w_xx·w_yy − w_xy²) ] dA,   T = ρh/2 ∫ ẇ² dA.
// Il bordo libero non va imposto (è la condizione «naturale» del metodo). Un morsetto al centro si impone
// esattamente, togliendo dalla base le direzioni che muovono o inclinano la lamina in quel punto.
// Gli integrali sul dominio {|x| ≤ 1, |y| ≤ g(x)} si fanno con Gauss–Legendre: in x, poi in y su ogni corda.
// Unità ridotte: semilunghezza 1, D = 1, ρh = 1. In unità vere ω = √λ · √(D/ρh) / a², con a la semilunghezza.
import { symEig } from './eigen.js';

// ───────────────────────────── materiali ─────────────────────────────
// Q: fattore di merito di una lamina con un velo di sabbia sopra (il vetro risuona più a lungo del metallo).
export const MATERIALS = {
  al: { name: 'Alluminio', E: 69e9, rho: 2700, nu: 0.33, Q: 150 },
  brass: { name: 'Ottone', E: 100e9, rho: 8500, nu: 0.34, Q: 120 },
  steel: { name: 'Acciaio', E: 200e9, rho: 7850, nu: 0.29, Q: 200 },
  glass: { name: 'Vetro', E: 70e9, rho: 2500, nu: 0.22, Q: 280 },
};
/** Rigidità flessionale D = E h³ / 12(1−ν²) e massa per unità di superficie ρh. */
export function plateConsts(mat, h) {
  const m = MATERIALS[mat];
  return { D: (m.E * h ** 3) / (12 * (1 - m.nu * m.nu)), rhoH: m.rho * h, nu: m.nu, Q: m.Q, E: m.E, rho: m.rho };
}

// ───────────────────────────── forme ─────────────────────────────
// Coordinate ridotte: x lungo il lato lungo da −1 a 1, y di traverso, |y| ≤ g(x). symX: simmetrica anche in x.
// la chitarra: estremità tonde (√(1−x²) dà il raggio di curvatura h(±1)²), fascia inferiore larga, vita, fascia superiore
const guitarH = (x) => 0.74 + 0.11 * Math.exp(-(((x + 0.45) / 0.45) ** 2)) - 0.27 * Math.exp(-(((x - 0.1) / 0.22) ** 2));
export const SHAPES = {
  square: { name: 'Quadrata', symX: true, round: false, g: () => 1, N: [26, 26] },
  rect: { name: 'Rettangolare', symX: true, round: false, g: () => 2 / 3, N: [28, 20] },
  circle: { name: 'Rotonda', symX: true, round: true, g: (x) => Math.sqrt(Math.max(0, 1 - x * x)), N: [26, 26] },
  guitar: { name: 'Chitarra', symX: false, round: true, g: (x) => Math.sqrt(Math.max(0, 1 - x * x)) * guitarH(x), N: [26, 20] },
};
for (const s of Object.values(SHAPES)) {
  let gm = 0;
  for (let i = 0; i <= 2000; i++) gm = Math.max(gm, s.g(-1 + i / 1000));
  s.gmax = gm;
}

/** Il contorno come poligono chiuso (coordinate ridotte, verso antiorario). */
export function outline(shapeId, n = 240) {
  const s = SHAPES[shapeId], pts = [];
  if (!s.round) {
    const b = s.gmax;
    const side = (x0, y0, x1, y1, k) => { for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k]); };
    const k = Math.round(n / 4);
    side(-1, -b, 1, -b, k); side(1, -b, 1, b, Math.round(k * b)); side(1, b, -1, b, k); side(-1, b, -1, -b, Math.round(k * b));
    return pts;
  }
  // x = −cos t concentra i punti alle estremità, dove il bordo curva di più
  for (let i = 0; i < n / 2; i++) { const x = -Math.cos((Math.PI * i) / (n / 2)); pts.push([x, -s.g(x)]); }
  for (let i = 0; i < n / 2; i++) { const x = Math.cos((Math.PI * i) / (n / 2)); pts.push([x, s.g(x)]); }
  return pts;
}
export const inside = (shapeId, x, y) => Math.abs(x) <= 1 && Math.abs(y) <= SHAPES[shapeId].g(x);

/** Un punto del bordo a frazione u (0…1) del perimetro, con la normale uscente. Parte da (1, 0) in verso antiorario. */
export function edgePoint(shapeId, u) {
  const key = shapeId;
  let P = edgeCache[key];
  if (!P) {
    const pts = outline(shapeId, 720);
    // si parte dal punto più a destra sull'asse
    let i0 = 0; for (let i = 0; i < pts.length; i++) if (pts[i][0] > pts[i0][0] || (pts[i][0] === pts[i0][0] && Math.abs(pts[i][1]) < Math.abs(pts[i0][1]))) i0 = i;
    const ring = pts.slice(i0).concat(pts.slice(0, i0));
    ring.push(ring[0]);
    const cum = [0];
    for (let i = 1; i < ring.length; i++) cum.push(cum[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
    P = edgeCache[key] = { ring, cum, L: cum[cum.length - 1] };
  }
  const t = (((u % 1) + 1) % 1) * P.L;
  let lo = 0, hi = P.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] <= t) lo = m; else hi = m; }
  const a = P.ring[lo], b = P.ring[hi], f = (t - P.cum[lo]) / Math.max(1e-12, P.cum[hi] - P.cum[lo]);
  const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
  return { x: a[0] + tx * f, y: a[1] + ty * f, nx: ty / tl, ny: -tx / tl };
}
const edgeCache = {};

// ───────────────────────────── strumenti numerici ─────────────────────────────
/** Nodi e pesi di Gauss–Legendre su [−1, 1]. */
export function gauss(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const dz = p1 / pp; z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = -z; x[n - 1 - i] = z;
    w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * pp * pp);
  }
  return { x, w };
}

/** Polinomi di Legendre normalizzati (∫P̃ᵢ² = 1 su [−1,1]) con derivate prima e seconda, fino al grado N. */
export function legendre(x, N, p0, p1, p2) {
  p0[0] = 1; p1[0] = 0; p2[0] = 0;
  if (N >= 1) { p0[1] = x; p1[1] = 1; p2[1] = 0; }
  for (let n = 1; n < N; n++) {
    p0[n + 1] = ((2 * n + 1) * x * p0[n] - n * p0[n - 1]) / (n + 1);
    p1[n + 1] = p1[n - 1] + (2 * n + 1) * p0[n];
    p2[n + 1] = p2[n - 1] + (2 * n + 1) * p1[n];
  }
  for (let n = 0; n <= N; n++) { const s = Math.sqrt(n + 0.5); p0[n] *= s; p1[n] *= s; p2[n] *= s; }
}

// ───────────────────────────── il calcolo dei modi ─────────────────────────────
/**
 * Modi propri della lamina.
 * @param {string} shapeId
 * @param {number} nu  coefficiente di Poisson
 * @param {{clamp?: boolean, keep?: number}} opt  clamp: morsetto al centro (spostamento e pendenze nulli);
 *        keep: frazione dei modi di ogni classe di simmetria da tenere (i più alti sono imprecisi)
 * @returns {{ shapeId, nu, clamp, Nx, Ny, gmax, modes: {lam:number, cls:number, c:Float64Array}[] }}
 *          c: coefficienti (Nx+1)·(Ny+1) della base P̃_i(x)·P̃_j(y/gmax), normalizzati in massa (∫φ² dA = 1)
 */
export function solveModes(shapeId, nu, opt = {}) {
  const S = SHAPES[shapeId], [Nx, Ny] = S.N, gm = S.gmax, clamp = !!opt.clamp, keep = opt.keep ?? 0.5;
  const nx1 = Nx + 1, ny1 = Ny + 1;
  // classi di simmetria: parità in y (sempre) e in x (se la forma lo permette)
  const classes = [];
  for (const py of [0, 1]) for (const px of S.symX ? [0, 1] : [-1]) {
    const list = [];
    for (let i = 0; i <= Nx; i++) for (let j = 0; j <= Ny; j++) if ((px < 0 || i % 2 === px) && j % 2 === py) list.push(i * ny1 + j);
    classes.push({ px, py, list });
  }
  // nodi in x: per i contorni curvi x = sin t, così l'integrando resta liscio anche dove la corda si chiude
  const nqx = S.round ? 2 * Nx + 16 : Nx + 6, nqy = Ny + 4;
  const gx = gauss(nqx), gy = gauss(nqy);
  const xs = new Float64Array(nqx), wxs = new Float64Array(nqx);
  for (let q = 0; q < nqx; q++) {
    if (S.round) { const t = (gx.x[q] * Math.PI) / 2; xs[q] = Math.sin(t); wxs[q] = gx.w[q] * (Math.PI / 2) * Math.cos(t); } else { xs[q] = gx.x[q]; wxs[q] = gx.w[q]; }
  }
  const L0 = new Float64Array(nx1), L1 = new Float64Array(nx1), L2 = new Float64Array(nx1);
  const P0 = new Float64Array(ny1), P1 = new Float64Array(ny1), P2 = new Float64Array(ny1);
  const Y00 = new Float64Array(ny1 * ny1), Y02 = new Float64Array(ny1 * ny1), Y22 = new Float64Array(ny1 * ny1), Y11 = new Float64Array(ny1 * ny1);
  const mats = classes.map((c) => { const n = c.list.length; return { n, M: new Float64Array(n * n), K0: new Float64Array(n * n), K1: new Float64Array(n * n) }; });
  const gi = 1 / gm, gi2 = gi * gi, gi4 = gi2 * gi2;
  for (let q = 0; q < nqx; q++) {
    const x = xs[q], wq = wxs[q], G = S.g(x);
    if (G <= 0) continue;
    legendre(x, Nx, L0, L1, L2);
    Y00.fill(0); Y02.fill(0); Y22.fill(0); Y11.fill(0);
    for (let r = 0; r < nqy; r++) {
      const y = G * gy.x[r], w = G * gy.w[r];
      legendre(y * gi, Ny, P0, P1, P2);
      for (let j = 0; j <= Ny; j++) {
        const a0 = P0[j] * w, a1 = P1[j] * w * gi2, a2 = P2[j] * w;
        for (let l = 0; l <= Ny; l++) {
          const o = j * ny1 + l;
          Y00[o] += a0 * P0[l];
          Y02[o] += a0 * P2[l] * gi2;          // P_j · P_l''
          Y22[o] += a2 * P2[l] * gi4;          // P_j'' · P_l''
          Y11[o] += a1 * P1[l];                // P_j' · P_l'
        }
      }
    }
    for (let c = 0; c < classes.length; c++) {
      const list = classes[c].list, { n, M, K0, K1 } = mats[c];
      for (let a = 0; a < n; a++) {
        const ia = (list[a] / ny1) | 0, ja = list[a] - ia * ny1;
        const x0a = L0[ia] * wq, x1a = L1[ia] * wq, x2a = L2[ia] * wq;
        for (let b = a; b < n; b++) {
          const ib = (list[b] / ny1) | 0, jb = list[b] - ib * ny1;
          const y00 = Y00[ja * ny1 + jb];
          const xx0 = x0a * L0[ib];
          const mAB = xx0 * y00;
          const axx = x2a * L2[ib] * y00;                             // w_xx w_xx
          const ayy = xx0 * Y22[ja * ny1 + jb];                       // w_yy w_yy
          const amix = x2a * L0[ib] * Y02[ja * ny1 + jb] + x0a * L2[ib] * Y02[jb * ny1 + ja];   // w_xx w_yy + w_yy w_xx
          const axy = x1a * L1[ib] * Y11[ja * ny1 + jb];              // w_xy w_xy
          const o = a * n + b;
          M[o] += mAB;
          K0[o] += axx + ayy + 2 * axy;
          K1[o] += amix - 2 * axy;
        }
      }
    }
  }
  // il morsetto: valori e pendenze delle funzioni di base al centro
  const c0 = new Float64Array(nx1), c1 = new Float64Array(nx1), c2 = new Float64Array(nx1), d0 = new Float64Array(ny1), d1 = new Float64Array(ny1), d2 = new Float64Array(ny1);
  legendre(0, Nx, c0, c1, c2); legendre(0, Ny, d0, d1, d2);
  const modes = [];
  classes.forEach((cl, ci) => {
    const { n, M, K0, K1 } = mats[ci];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { M[b * n + a] = M[a * n + b]; K0[b * n + a] = K0[a * n + b]; K1[b * n + a] = K1[a * n + b]; }
    const K = new Float64Array(n * n);
    for (let k = 0; k < n * n; k++) K[k] = K0[k] + nu * K1[k];
    // base ortonormale per la massa (le direzioni quasi nulle si scartano: sono polinomi che vivono fuori dal dominio)
    const em = symEig(M, n), mu = em.d, mmax = mu[n - 1];
    const keepCols = []; for (let k = 0; k < n; k++) if (mu[k] > mmax * 1e-13) keepCols.push(k);
    const m = keepCols.length, Sx = new Float64Array(n * m);
    for (let c = 0; c < m; c++) { const k = keepCols[c], s = 1 / Math.sqrt(mu[k]); for (let r = 0; r < n; r++) Sx[r * m + c] = em.V[r * n + k] * s; }
    // A = Sᵀ K S
    const KS = new Float64Array(n * m);
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) { const kv = K[r * n + k]; if (kv === 0) continue; const ro = r * m, so = k * m; for (let c = 0; c < m; c++) KS[ro + c] += kv * Sx[so + c]; }
    const A = new Float64Array(m * m);
    for (let r = 0; r < n; r++) { const ro = r * m; for (let a = 0; a < m; a++) { const s = Sx[ro + a]; if (s === 0) continue; for (let b = a; b < m; b++) A[a * m + b] += s * KS[ro + b]; } }
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) A[b * m + a] = A[a * m + b];
    // vincoli del morsetto in questa classe: si proiettano via, i modi spuri finiscono a un autovalore enorme
    let nCon = 0;
    if (clamp) {
      const rows = [];
      if (cl.px !== 1 && cl.py === 0) rows.push((i, j) => c0[i] * d0[j]);
      if (cl.px === 1 && cl.py === 0) rows.push((i, j) => c1[i] * d0[j]);
      if (cl.px !== 1 && cl.py === 1) rows.push((i, j) => c0[i] * d1[j] * gi);
      if (cl.px < 0 && cl.py === 0) rows.push((i, j) => c1[i] * d0[j]);
      const Q = [];
      for (const f of rows) {
        const cz = new Float64Array(m);
        for (let r = 0; r < n; r++) { const ii = (cl.list[r] / ny1) | 0, jj = cl.list[r] - ii * ny1, v = f(ii, jj); if (v) for (let c = 0; c < m; c++) cz[c] += v * Sx[r * m + c]; }
        for (const q of Q) { let dt = 0; for (let c = 0; c < m; c++) dt += cz[c] * q[c]; for (let c = 0; c < m; c++) cz[c] -= dt * q[c]; }
        let nr = 0; for (let c = 0; c < m; c++) nr += cz[c] * cz[c]; nr = Math.sqrt(nr);
        if (nr > 1e-9) { for (let c = 0; c < m; c++) cz[c] /= nr; Q.push(cz); }
      }
      nCon = Q.length;
      if (nCon) {
        // A ← P A P + σ Q Qᵀ, con P = I − Q Qᵀ
        const PA = projectBoth(A, m, Q);
        let tr = 0; for (let a = 0; a < m; a++) tr = Math.max(tr, Math.abs(PA[a * m + a]));
        const sigma = 1e6 * (tr + 1);
        for (const q of Q) for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) PA[a * m + b] += sigma * q[a] * q[b];
        A.set(PA);
      }
    }
    const ea = symEig(A, m);
    const nKeep = Math.max(1, Math.floor((m - nCon) * keep));
    for (let k = 0; k < nKeep; k++) {
      const lam = ea.d[k];
      const c = new Float64Array(nx1 * ny1);
      for (let r = 0; r < n; r++) {
        let v = 0; const ro = r * m;
        for (let a = 0; a < m; a++) v += Sx[ro + a] * ea.V[a * m + k];
        c[cl.list[r]] = v;
      }
      modes.push({ lam: Math.max(0, lam), cls: ci, c });
    }
  });
  modes.sort((a, b) => a.lam - b.lam);
  return { shapeId, nu, clamp, Nx, Ny, gmax: gm, modes };
}

function projectBoth(A, m, Q) {
  // P A P con P = I − Σ q qᵀ
  const B = new Float64Array(A);
  for (const q of Q) {
    // B ← (I − q qᵀ) B (I − q qᵀ)
    const Bq = new Float64Array(m);
    for (let a = 0; a < m; a++) { let s = 0; for (let b = 0; b < m; b++) s += B[a * m + b] * q[b]; Bq[a] = s; }
    let qBq = 0; for (let a = 0; a < m; a++) qBq += q[a] * Bq[a];
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) B[a * m + b] += -Bq[a] * q[b] - q[a] * Bq[b] + qBq * q[a] * q[b];
  }
  return B;
}

// ───────────────────────────── valutazione ─────────────────────────────
/** Valore di un modo (coordinate ridotte). */
export function modeAt(res, c, x, y) {
  const { Nx, Ny, gmax } = res, ny1 = Ny + 1;
  const a0 = new Float64Array(Nx + 1), a1 = new Float64Array(Nx + 1), a2 = new Float64Array(Nx + 1);
  const b0 = new Float64Array(ny1), b1 = new Float64Array(ny1), b2 = new Float64Array(ny1);
  legendre(x, Nx, a0, a1, a2); legendre(y / gmax, Ny, b0, b1, b2);
  let v = 0;
  for (let i = 0; i <= Nx; i++) { if (!a0[i]) continue; let s = 0; for (let j = 0; j <= Ny; j++) s += c[i * ny1 + j] * b0[j]; v += a0[i] * s; }
  return v;
}

/**
 * I modi su una griglia regolare che copre il rettangolo [−1,1]×[−gmax,gmax] (fuori dalla lamina i valori
 * proseguono il polinomio: servono solo per interpolare vicino al bordo).
 * @returns {{ gx, gy, x0, y0, h, fields: Float32Array[] }}
 */
export function sampleModes(res, gx = 129) {
  const { Nx, Ny, gmax } = res, ny1 = Ny + 1, h = 2 / (gx - 1), gy = 2 * Math.round(gmax / h) + 1;
  const y0 = -((gy - 1) / 2) * h;
  const LX = new Float64Array(gx * (Nx + 1)), LY = new Float64Array(gy * ny1);
  const t0 = new Float64Array(Math.max(Nx, Ny) + 1), t1 = new Float64Array(t0.length), t2 = new Float64Array(t0.length);
  for (let i = 0; i < gx; i++) { legendre(-1 + i * h, Nx, t0, t1, t2); for (let k = 0; k <= Nx; k++) LX[i * (Nx + 1) + k] = t0[k]; }
  for (let j = 0; j < gy; j++) { legendre((y0 + j * h) / gmax, Ny, t0, t1, t2); for (let k = 0; k <= Ny; k++) LY[j * ny1 + k] = t0[k]; }
  const tmp = new Float64Array(ny1);
  const fields = res.modes.map((md) => {
    const f = new Float32Array(gx * gy), c = md.c;
    for (let i = 0; i < gx; i++) {
      tmp.fill(0);
      for (let k = 0; k <= Nx; k++) { const lx = LX[i * (Nx + 1) + k]; if (!lx) continue; const o = k * ny1; for (let j = 0; j <= Ny; j++) tmp[j] += lx * c[o + j]; }
      for (let j = 0; j < gy; j++) { let s = 0; const o = j * ny1; for (let k = 0; k <= Ny; k++) s += tmp[k] * LY[o + k]; f[j * gx + i] = s; }
    }
    return f;
  });
  return { gx, gy, x0: -1, y0, h, fields };
}

/**
 * I modi in forma compatta, da passare fra thread: autovalori, coefficienti, massimo |φ| sulla lamina,
 * per le lamine rotonde i diametri e i cerchi nodali (m, n).
 */
export function packModes(res) {
  const { Nx, Ny, gmax, modes } = res, nc = (Nx + 1) * (Ny + 1), K = modes.length;
  const lam = new Float64Array(K), coef = new Float64Array(K * nc), peak = new Float64Array(K), mn = new Int8Array(2 * K).fill(-1), cls = new Int8Array(K);
  const smp = sampleModes(res, 65), S = SHAPES[res.shapeId];
  modes.forEach((md, k) => {
    lam[k] = md.lam; coef.set(md.c, k * nc); cls[k] = md.cls;
    let p = 0; const f = smp.fields[k];
    for (let j = 0; j < smp.gy; j++) for (let i = 0; i < smp.gx; i++) {
      const x = smp.x0 + i * smp.h, y = smp.y0 + j * smp.h;
      if (Math.abs(y) <= S.g(x)) p = Math.max(p, Math.abs(f[j * smp.gx + i]));
    }
    peak[k] = p || 1;
    if (res.shapeId === 'circle') { const q = circleIndices(res, md.c); mn[2 * k] = q.m; mn[2 * k + 1] = q.n; }
  });
  return { shapeId: res.shapeId, nu: res.nu, clamp: res.clamp, Nx, Ny, gmax, K, lam, coef, peak, mn, cls };
}

/**
 * Per le lamine rotonde: diametri nodali m e cerchi nodali n di un modo (dal campo campionato).
 * Il centro, se bloccato o spinto, non conta come cerchio.
 */
export function circleIndices(res, c) {
  const R = 0.72, K = 180, v = [];
  for (let k = 0; k < K; k++) { const a = (2 * Math.PI * k) / K; v.push(modeAt(res, c, R * Math.cos(a), R * Math.sin(a))); }
  let amp = 0, best = 0; for (let k = 0; k < K; k++) if (Math.abs(v[k]) > amp) { amp = Math.abs(v[k]); best = k; }
  // diametri: cambi di segno lungo il cerchio (contando solo i campioni lontani da zero, per ignorare il rumore)
  const m = amp > 0 ? Math.round(signChanges(v.concat(v[0]), amp * 0.03) / 2) : 0;
  // cerchi: cambi di segno lungo il raggio nella direzione del massimo
  const ang = (2 * Math.PI * best) / K, rs = [];
  for (let i = 1; i <= 200; i++) { const r = 0.02 + (0.975 * i) / 200; rs.push(modeAt(res, c, r * Math.cos(ang), r * Math.sin(ang))); }
  let rmax = 0; for (const x of rs) rmax = Math.max(rmax, Math.abs(x));
  return { m, n: signChanges(rs, rmax * 0.02) };
}
/** Cambi di segno di una sequenza, saltando i campioni più piccoli di tol. */
function signChanges(a, tol) {
  let last = 0, n = 0;
  for (const x of a) { if (Math.abs(x) < tol) continue; const s = Math.sign(x); if (last && s !== last) n++; last = s; }
  return n;
}
