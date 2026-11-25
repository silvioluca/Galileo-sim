// field.js — il campo magnetico delle sorgenti, nel piano della lastra.
//
// I magneti (ferrite, Br ≈ 0,38 T) sono uniformemente magnetizzati: il loro campo è quello di «cariche magnetiche»
// distribuite sulle facce polari, q = M·A (positive al nord), B = μ0/4π · Σ q (r − rᵢ)/|r − rᵢ|³. Il ferro di cavallo
// è magnetizzato lungo la U, e così le cariche stanno solo sulle due facce delle estremità.
// I conduttori sono spezzati in segmenti rettilinei; per ciascuno la legge di Biot–Savart dà il campo esatto:
// B = μ0 I/4π · (r₁ × r₂)(r₁ + r₂) / (r₁ r₂ (r₁ r₂ + r₁·r₂)), con r₁, r₂ dai due estremi al punto. Dentro il filo il
// campo cala linearmente fino all'asse.
// Il campo terrestre ha una componente orizzontale di 20 µT verso il nord, che nella scena è −z.

export const MU0 = 4e-7 * Math.PI;
const K = 1e-7;                                   // μ0/4π
export const B_EARTH = 2.0e-5;                    // T, orizzontale, verso il nord (−z)
export const PLATE = { w: 0.4, d: 0.3, t: 0.005 }; // la lastra: x ∈ [−0,2; 0,2], z ∈ [−0,15; 0,15]
export const YP = { magnet: 0.0175, current: 0.2 }; // quota della faccia superiore della lastra
export const MAG = { L: 0.1, W: 0.022, H: 0.012, M: 3.0e5 };
export const HORSE = { x0: -0.075, x1: 0, zc: 0.025, w: 0.016, H: 0.012, M: 3.0e5 };
export const WIRE = { y0: 0.012, y1: 0.5, r: 0.0015 };
export const LOOP = { R: 0.08 };
export const COIL = { R: 0.035, len: 0.14 };
const RW2 = 0.0015 * 0.0015;

export const SOURCES = {
  bar: { name: 'Magnete a barra', magnet: true },
  two: { name: 'Due magneti', magnet: true },
  horse: { name: 'Ferro di cavallo', magnet: true },
  wire: { name: 'Filo rettilineo', magnet: false },
  loop: { name: 'Spira', magnet: false },
  coil: { name: 'Solenoide', magnet: false },
};

/** Cariche su una faccia rettangolare: centro c, normale lungo x, lati wz (z) e hy (y). */
function face(out, cx, cy, cz, wz, hy, q, nz = 8, ny = 4) {
  for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) out.push(cx, cy + ((j + 0.5) / ny - 0.5) * hy, cz + ((i + 0.5) / nz - 0.5) * wz, q / (nz * ny));
}
/** Una barra magnetica lunga lungo x, centrata in (cx, cy, cz), con il nord verso +x (dir = +1) o −x (dir = −1). */
function bar(out, cx, cy, cz, dir) {
  const q = MAG.M * MAG.W * MAG.H;
  face(out, cx + dir * MAG.L / 2, cy, cz, MAG.W, MAG.H, q);
  face(out, cx - dir * MAG.L / 2, cy, cz, MAG.W, MAG.H, -q);
}

/**
 * Le sorgenti per la configurazione cfg: { src, pair: 'opp'|'same', nLoop, nCoil }.
 * charges: [x, y, z, q]…; segs: [ax, ay, az, bx, by, bz, peso]… (per 1 A); yp: quota della lastra;
 * path: la retta della sonda { x0, axis: [ax, az], label }; holes: [[x, z, r]] dove la limatura non sta.
 */
export function build(cfg) {
  const ch = [], sg = [], lp = [], holes = [], boxes = [], seeds = [];
  const S = SOURCES[cfg.src];
  const yp = S.magnet ? YP.magnet : YP.current;
  let path = { x0: 0, axis: [1, 0], label: 'lungo x' };
  const yc = MAG.H / 2;
  // i semi delle linee nello spazio sulla faccia nord: la loro densità segue il flusso
  const northSeeds = (x, nx, wz, hy, zc = 0) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) seeds.push([x + nx * 0.002, ((j + 0.5) / 3) * hy, zc + ((i + 0.5) / 7 - 0.5) * wz]); };
  const barBox = (cx) => boxes.push([cx - MAG.L / 2, cx + MAG.L / 2, 0, MAG.H, -MAG.W / 2, MAG.W / 2]);
  if (cfg.src === 'bar') { bar(ch, 0, yc, 0, 1); barBox(0); northSeeds(MAG.L / 2, 1, MAG.W, MAG.H); }
  else if (cfg.src === 'two') {
    const off = MAG.L / 2 + 0.03, d2 = cfg.pair === 'same' ? -1 : 1;
    bar(ch, -off, yc, 0, 1); bar(ch, off, yc, 0, d2); barBox(-off); barBox(off);
    northSeeds(-off + MAG.L / 2, 1, MAG.W, MAG.H); northSeeds(off + (d2 * MAG.L) / 2, d2, MAG.W, MAG.H);
  } else if (cfg.src === 'horse') {
    const q = HORSE.M * HORSE.w * HORSE.H;
    face(ch, HORSE.x1, HORSE.H / 2, HORSE.zc, HORSE.w, HORSE.H, q);
    face(ch, HORSE.x1, HORSE.H / 2, -HORSE.zc, HORSE.w, HORSE.H, -q);
    for (const s of [1, -1]) boxes.push([HORSE.x0, HORSE.x1, 0, HORSE.H, s * HORSE.zc - HORSE.w / 2, s * HORSE.zc + HORSE.w / 2]);
    boxes.push([HORSE.x0 - HORSE.zc - HORSE.w / 2, HORSE.x0, 0, HORSE.H, -HORSE.zc - HORSE.w / 2, HORSE.zc + HORSE.w / 2]);
    northSeeds(HORSE.x1, 1, HORSE.w, HORSE.H, HORSE.zc);
    path = { x0: -0.05, axis: [1, 0], label: 'lungo x' };
  } else if (cfg.src === 'wire') {
    sg.push(0, WIRE.y0, 0, 0, WIRE.y1, 0, 1);
    holes.push([0, 0, 0.004]);
    for (const y of [0.07, 0.14, yp, 0.27, 0.36, 0.45]) for (const r of [0.02, 0.045, 0.08]) seeds.push([r, y, 0]);
    path = { x0: 0, axis: [0, -1], label: 'tangente al cerchio' };
  } else if (cfg.src === 'loop') {
    lp.push(0, yp, 0, LOOP.R, cfg.nLoop || 1);
    holes.push([0, LOOP.R, 0.006], [0, -LOOP.R, 0.006]);
    seeds.push([0, yp, 0]);
    for (const r of [0.3, 0.6, 0.82]) for (let k = 0; k < 6; k++) { const a = (k / 6) * 2 * Math.PI + r; seeds.push([0, yp + r * LOOP.R * Math.cos(a), r * LOOP.R * Math.sin(a)]); }
    path = { x0: 0, axis: [1, 0], label: 'lungo l\'asse' };
  } else if (cfg.src === 'coil') {
    // le spire del solenoide come anelli affiancati (il passo dell'elica conta pochissimo); attraversano la lastra
    const N = cfg.nCoil || 20;
    for (let k = 0; k < N; k++) {
      const x = -COIL.len / 2 + (COIL.len * (k + 0.5)) / N;
      lp.push(x, yp, 0, COIL.R, 1);
      holes.push([x, COIL.R, 0.003], [x, -COIL.R, 0.003]);
    }
    seeds.push([0, yp, 0]);
    for (const r of [0.35, 0.65, 0.88]) for (let k = 0; k < 8; k++) { const a = (k / 8) * 2 * Math.PI + r; seeds.push([0, yp + r * COIL.R * Math.cos(a), r * COIL.R * Math.sin(a)]); }
    path = { x0: 0, axis: [1, 0], label: 'lungo l\'asse' };
  }
  return { cfg: { ...cfg }, src: cfg.src, magnet: S.magnet, charges: new Float64Array(ch), segs: new Float64Array(sg), loops: new Float64Array(lp), yp, path, holes, boxes, seeds };
}

/**
 * Le linee di campo nello spazio: partono dai semi (sulla faccia del polo nord, o attorno ai conduttori) e seguono il
 * campo (Runge–Kutta 4) finché entrano in un magnete, escono dalla zona, toccano il pavimento o si richiudono.
 * Per i conduttori si calcolano con la corrente positiva. Restituisce Float32Array [x, y, z, |B|]… per linea.
 */
export function lines3D(S) {
  const out = [], o = [0, 0, 0], I = S.magnet ? 0 : 1, h = 0.0025, maxN = 900;
  const lim = S.magnet ? [0.34, 0.3, 0.3] : [0.34, 0.62, 0.32];
  const dir = (x, y, z) => { fieldAt(S, x, y, z, I, o); const m = Math.hypot(o[0], o[1], o[2]) || 1e-30; return [o[0] / m, o[1] / m, o[2] / m, m]; };
  const inBox = (x, y, z) => S.boxes.some((b) => x > b[0] && x < b[1] && y > b[2] && y < b[3] && z > b[4] && z < b[5]);
  for (const s of S.seeds) {
    const pts = [];
    let [x, y, z] = s;
    pts.push(x, y, z, dir(x, y, z)[3]);
    for (let n = 0; n < maxN; n++) {
      const k1 = dir(x, y, z), k2 = dir(x + k1[0] * h / 2, y + k1[1] * h / 2, z + k1[2] * h / 2);
      const k3 = dir(x + k2[0] * h / 2, y + k2[1] * h / 2, z + k2[2] * h / 2), k4 = dir(x + k3[0] * h, y + k3[1] * h, z + k3[2] * h);
      x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); z += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      if (Math.abs(x) > lim[0] || y > lim[1] || Math.abs(z) > lim[2]) break;
      if (y < 0.0005) { pts.push(x, 0.0005, z, k4[3]); break; }
      pts.push(x, y, z, k4[3]);
      if (inBox(x, y, z)) break;
      if (n > 30 && (x - s[0]) ** 2 + (y - s[1]) ** 2 + (z - s[2]) ** 2 < (1.3 * h) ** 2) { pts.push(s[0], s[1], s[2], k4[3]); break; }
    }
    if (pts.length >= 12) out.push(new Float32Array(pts));
  }
  return out;
}

/** Integrali ellittici completi K(m) ed E(m), con la media aritmetico-geometrica. */
function ellipKE(m) {
  let a = 1, b = Math.sqrt(Math.max(1e-14, 1 - m)), c2 = m, sum = 0.5 * c2, p = 0.5;
  for (let n = 0; n < 12; n++) {
    const an = (a + b) / 2, bn = Math.sqrt(a * b), cn = (a - b) / 2;
    p *= 2; sum += p * cn * cn; a = an; b = bn;
    if (Math.abs(cn) < 1e-12) break;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

/** B (tesla) nel punto (x, y, z), con la corrente I nei conduttori. out: [bx, by, bz]. */
export function fieldAt(S, x, y, z, I, out) {
  let bx = 0, by = 0, bz = 0;
  const C = S.charges;
  for (let i = 0; i < C.length; i += 4) {
    const dx = x - C[i], dy = y - C[i + 1], dz = z - C[i + 2], r2 = dx * dx + dy * dy + dz * dz + 1e-9, f = C[i + 3] / (r2 * Math.sqrt(r2));
    bx += dx * f; by += dy * f; bz += dz * f;
  }
  bx *= K; by *= K; bz *= K;
  const G = S.segs;
  if (I && G.length) {
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < G.length; i += 7) {
      const r1x = x - G[i], r1y = y - G[i + 1], r1z = z - G[i + 2], r2x = x - G[i + 3], r2y = y - G[i + 4], r2z = z - G[i + 5];
      const r1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z), r2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
      const cx = r1y * r2z - r1z * r2y, cy = r1z * r2x - r1x * r2z, cz = r1x * r2y - r1y * r2x;
      const den = r1 * r2 * (r1 * r2 + r1x * r2x + r1y * r2y + r1z * r2z);
      if (den < 1e-18) continue;
      let f = (G[i + 6] * (r1 + r2)) / den;
      const lx = G[i + 3] - G[i], ly = G[i + 4] - G[i + 1], lz = G[i + 5] - G[i + 2], d2 = (cx * cx + cy * cy + cz * cz) / (lx * lx + ly * ly + lz * lz);
      if (d2 < RW2) f *= d2 / RW2;
      sx += f * cx; sy += f * cy; sz += f * cz;
    }
    bx += K * I * sx; by += K * I * sy; bz += K * I * sz;
  }
  // le spire circolari (asse lungo x), con le formule degli integrali ellittici
  const P = S.loops;
  if (I && P && P.length) {
    for (let i = 0; i < P.length; i += 5) {
      const a = P[i + 3], N = P[i + 4], zx = x - P[i], dy = y - P[i + 1], dz = z - P[i + 2];
      let rho = Math.sqrt(dy * dy + dz * dz);
      const q = (a + rho) ** 2 + zx * zx, w2 = Math.max(RW2, (a - rho) ** 2 + zx * zx), m = Math.min(0.999999, (4 * a * rho) / q);
      const [Kk, Ek] = ellipKE(m), c = (2 * K * N * I) / Math.sqrt(q);    // μ0 N I / (2π √q)
      bx += c * (Kk + ((a * a - rho * rho - zx * zx) / w2) * Ek);
      if (rho > 1e-9) {
        const br = ((c * zx) / rho) * (-Kk + ((a * a + rho * rho + zx * zx) / w2) * Ek);
        by += (br * dy) / rho; bz += (br * dz) / rho;
      }
    }
  }
  out[0] = bx; out[1] = by; out[2] = bz;
  return out;
}

/**
 * Il campo su una griglia nel piano della lastra (a 0,5 mm sopra la sua faccia), per i magneti in tesla, per i
 * conduttori per ampere. { nx, nz, h, x0, z0, b: Float32Array [bx, by, bz]… }
 */
export function grid(S, h = 0.0025) {
  const nx = Math.round(PLATE.w / h) + 1, nz = Math.round(PLATE.d / h) + 1, x0 = -PLATE.w / 2, z0 = -PLATE.d / 2;
  const b = new Float32Array(nx * nz * 3), o = [0, 0, 0], I = S.magnet ? 0 : 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    fieldAt(S, x0 + i * h, S.yp + 0.0005, z0 + j * h, I, o);
    const k = (j * nx + i) * 3; b[k] = o[0]; b[k + 1] = o[1]; b[k + 2] = o[2];
  }
  return { nx, nz, h, x0, z0, b };
}
/** Campo interpolato dalla griglia nel punto (x, z), moltiplicato per scale. */
export function sample(g, x, z, scale, out) {
  let fx = (x - g.x0) / g.h, fz = (z - g.z0) / g.h;
  fx = Math.max(0, Math.min(g.nx - 1.001, fx)); fz = Math.max(0, Math.min(g.nz - 1.001, fz));
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, b = g.b;
  const k00 = (j * g.nx + i) * 3, k10 = k00 + 3, k01 = k00 + g.nx * 3, k11 = k01 + 3;
  for (let c = 0; c < 3; c++) out[c] = scale * ((b[k00 + c] * (1 - u) + b[k10 + c] * u) * (1 - v) + (b[k01 + c] * (1 - u) + b[k11 + c] * u) * v);
  return out;
}

/** Valori «da libro» per confronto. */
export const ideal = {
  wire: (I, r) => (MU0 * I) / (2 * Math.PI * r),
  loopCenter: (I, N) => (MU0 * N * I) / (2 * LOOP.R),
  loopAxis: (I, N, x) => (MU0 * N * I * LOOP.R * LOOP.R) / (2 * Math.pow(LOOP.R * LOOP.R + x * x, 1.5)),
  coil: (I, N) => (MU0 * N * I) / COIL.len,
};

/**
 * Linee di campo nel piano, ugualmente spaziate (Jobard–Lefer): si parte da un seme, si segue la direzione del campo nei
 * due versi e ci si ferma fuori dalla lastra, dove il campo è troppo debole, nei fori, o troppo vicino a un'altra linea;
 * nuovi semi nascono a distanza dsep di fianco alle linee già tracciate.
 * opts: { dsep, scale (A o 1), bmin (T), holes, step }. Restituisce un array di linee: Float32Array [x, z, |B|]…
 */
export function streamlines(g, opts) {
  const { dsep, scale = 1, bmin = 0, holes = [], step = 0.0008, maxPts = 4000 } = opts;
  const dtest = dsep * 0.5, X0 = -PLATE.w / 2 + 0.003, X1 = PLATE.w / 2 - 0.003, Z0 = -PLATE.d / 2 + 0.003, Z1 = PLATE.d / 2 - 0.003;
  const cs = dsep, cnx = Math.ceil(PLATE.w / cs) + 2, cells = new Map();
  const key = (x, z) => (Math.floor((x - X0) / cs) + 1) + (Math.floor((z - Z0) / cs) + 1) * cnx;
  const o = [0, 0, 0];
  const dirAt = (x, z) => { sample(g, x, z, scale, o); const m = Math.hypot(o[0], o[2]); return m < 1e-12 ? null : [o[0] / m, o[2] / m, Math.hypot(o[0], o[1], o[2]), m]; };
  const inHole = (x, z, extra = 0) => holes.some(([hx, hz, r]) => (x - hx) ** 2 + (z - hz) ** 2 < (r + extra) ** 2);
  const ok = (x, z, d, line, idx) => {
    const cx = Math.floor((x - X0) / cs) + 1, cz = Math.floor((z - Z0) / cs) + 1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = cells.get(cx + a + (cz + b) * cnx); if (!list) continue;
      for (const p of list) {
        if (p.l === line && idx - p.i < (2.5 * dsep) / step && idx - p.i > -(2.5 * dsep) / step) continue;
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false;
      }
    }
    return true;
  };
  const lines = [];
  const trace = (sx, sz, id) => {
    let closed = false;
    const half = (sgn) => {
      const pts = []; let x = sx, z = sz;
      for (let n = 0; n < maxPts; n++) {
        const d1 = dirAt(x, z); if (!d1) break;
        const mx = x + sgn * d1[0] * step * 0.5, mz = z + sgn * d1[1] * step * 0.5;
        const d2 = dirAt(mx, mz); if (!d2 || d1[0] * d2[0] + d1[1] * d2[1] < 0.2) break;
        x += sgn * d2[0] * step; z += sgn * d2[1] * step;
        if (x < X0 || x > X1 || z < Z0 || z > Z1 || inHole(x, z) || d2[2] < bmin) break;
        if (!ok(x, z, dtest, id, sgn * (n + 1))) break;
        // la linea si chiude (attorno a un filo) quando torna al punto di partenza
        if (n > (3 * dsep) / step && (x - sx) ** 2 + (z - sz) ** 2 < (dtest * 0.8) ** 2) { closed = true; pts.push([sx, sz, d2[2]]); break; }
        // né deve ripassare su sé stessa
        if (n > (3 * dsep) / step) { let near = false; for (let k = 0; k < pts.length - (2.5 * dsep) / step; k += 3) if ((pts[k][0] - x) ** 2 + (pts[k][1] - z) ** 2 < dtest * dtest) { near = true; break; } if (near) break; }
        pts.push([x, z, d2[2]]);
      }
      return pts;
    };
    const d0 = dirAt(sx, sz);
    const fw = half(1), bw = closed ? [] : half(-1).reverse();
    const all = [...bw, [sx, sz, d0 ? d0[2] : 0], ...fw];
    if (all.length < 6) return null;
    const arr = new Float32Array(all.length * 3);
    all.forEach((p, i) => { arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; });
    all.forEach((p, i) => { const k = key(p[0], p[1]); if (!cells.has(k)) cells.set(k, []); cells.get(k).push({ x: p[0], z: p[1], l: id, i: i - bw.length }); });
    return arr;
  };
  const seeds = [];
  // semi iniziali su una griglia larga, mescolati, più qualche seme vicino alle sorgenti
  for (let z = Z0 + dsep; z < Z1; z += dsep * 6) for (let x = X0 + dsep; x < X1; x += dsep * 6) seeds.push([x, z]);
  for (let i = seeds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seeds[i], seeds[j]] = [seeds[j], seeds[i]]; }
  for (const [hx, hz, r] of holes) for (let a = 0; a < 6; a++) seeds.unshift([hx + Math.cos(a) * (r + dsep), hz + Math.sin(a) * (r + dsep)]);
  const queue = [];
  const tryLine = (x, z) => {
    if (x < X0 || x > X1 || z < Z0 || z > Z1 || inHole(x, z, dsep * 0.5)) return;
    const d = dirAt(x, z); if (!d || d[2] < bmin) return;
    if (!ok(x, z, dsep * 0.95, -1, 0)) return;
    const L = trace(x, z, lines.length);
    if (!L) return;
    lines.push(L); queue.push(L);
  };
  let si = 0;
  while (si < seeds.length || queue.length) {
    if (queue.length) {
      const L = queue.shift(), n = L.length / 3, every = Math.max(1, Math.round(dsep / step / 2));
      for (let i = 0; i < n - 1; i += every) {
        const x = L[i * 3], z = L[i * 3 + 1], tx = L[i * 3 + 3] - x, tz = L[i * 3 + 4] - z, m = Math.hypot(tx, tz) || 1;
        tryLine(x - (tz / m) * dsep, z + (tx / m) * dsep);
        tryLine(x + (tz / m) * dsep, z - (tx / m) * dsep);
      }
    } else { const [x, z] = seeds[si++]; tryLine(x, z); }
    if (lines.length > 4000) break;
  }
  return lines;
}
