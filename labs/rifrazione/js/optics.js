// optics.js — i mezzi trasparenti e il tracciamento dei raggi nel piano del fascio.
// Indici di rifrazione con la formula di Cauchy, n(λ) = A + B/λ² (λ in µm), tarati sull'indice alla riga gialla del
// sodio (589 nm) e sul numero di Abbe di ciascun materiale. Alle superfici: legge di Snell, n₁ sin θ₁ = n₂ sin θ₂,
// e fattori di Fresnel per luce non polarizzata; oltre l'angolo limite la riflessione è totale.
// Il tracciatore segue il fascio e i fasci riflessi in parte, fino a che l'intensità resta visibile.

export const MEDIA = {
  air: { name: 'Aria', A: 1.000277, B: 0 },
  water: { name: 'Acqua', A: 1.3244, B: 0.00298 },
  alcohol: { name: 'Alcol', A: 1.3515, B: 0.00345 },
  glycerin: { name: 'Glicerina', A: 1.4589, B: 0.00486 },
  oil: { name: 'Olio', A: 1.4597, B: 0.00497 },
  pmma: { name: 'Plexiglas', A: 1.4784, B: 0.0045 },
  crown: { name: 'Vetro crown', A: 1.5046, B: 0.00423 },
  flint: { name: 'Vetro flint', A: 1.5944, B: 0.0089 },
  zirconia: { name: 'Zirconia cubica', A: 2.0856, B: 0.0314 },
};
export const nOf = (id, lambdaNm) => { const m = MEDIA[id]; const l = lambdaNm / 1000; return m.A + m.B / (l * l); };
export const LASERS = { red: { name: 'Rosso', nm: 650, color: [1, 0.12, 0.06] }, green: { name: 'Verde', nm: 532, color: [0.2, 1, 0.25] }, violet: { name: 'Viola', nm: 405, color: [0.55, 0.15, 1] } };

/** Riflettanza di Fresnel (s, p e media) per un'interfaccia n1 → n2 con incidenza θ (rad). */
export function fresnel(n1, n2, th) {
  const s = (n1 / n2) * Math.sin(th);
  if (s >= 1) return { rs: 1, rp: 1, R: 1, tir: true };
  const ci = Math.cos(th), ct = Math.sqrt(1 - s * s);
  const rs = ((n1 * ci - n2 * ct) / (n1 * ci + n2 * ct)) ** 2;
  const rp = ((n1 * ct - n2 * ci) / (n1 * ct + n2 * ci)) ** 2;
  return { rs, rp, R: (rs + rp) / 2, tir: false };
}
/** Angolo limite (rad) da n1 verso n2, o null se n1 ≤ n2. */
export const critical = (n1, n2) => (n1 > n2 ? Math.asin(n2 / n1) : null);

// ───────────────────────────── la scena 2D ─────────────────────────────
// Regioni: { id, medium, shape, prio, scatter } con shape = {poly: [[x,y]…]} | {d: {cx, cy, R, ux, uy}} (mezzo disco:
// il lato curvo dalla parte di u). Il mezzo in un punto è quello della regione di priorità più alta che lo contiene.
// Bordi: tutti i lati delle regioni (con un'etichetta) e gli assorbitori {a, b, spot}, dove il fascio si ferma.

function inPoly(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inShape(p, s) {
  if (s.poly) return inPoly(p, s.poly);
  const d = s.d, dx = p[0] - d.cx, dy = p[1] - d.cy;
  return dx * dx + dy * dy <= d.R * d.R && dx * d.ux + dy * d.uy >= 0;
}

export class Scene {
  constructor(bg = 'air') { this.bg = bg; this.regions = []; this.edges = []; }
  /** tags: etichette dei lati (per i poligoni: un'etichetta per lato, o una sola per tutti). */
  add(region, tags = 'edge') {
    region.prio = region.prio ?? this.regions.length;
    this.regions.push(region);
    const s = region.shape;
    if (s.poly) {
      const P = s.poly;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        this.edges.push({ kind: 'seg', a, b, tag: Array.isArray(tags) ? tags[i] : tags });
      }
    } else {
      const d = s.d, vx = -d.uy, vy = d.ux;
      this.edges.push({ kind: 'seg', a: [d.cx - vx * d.R, d.cy - vy * d.R], b: [d.cx + vx * d.R, d.cy + vy * d.R], tag: Array.isArray(tags) ? tags[0] : tags });
      this.edges.push({ kind: 'arc', c: [d.cx, d.cy], R: d.R, ux: d.ux, uy: d.uy, tag: Array.isArray(tags) ? tags[1] : tags });
    }
    return region;
  }
  /** Un assorbitore: il fascio si ferma (spot: lascia una macchia di luce). Anche come cerchio {c, R}. */
  stop(a, b, spot = true, tag = 'stop') { this.edges.push({ kind: 'seg', a, b, stop: true, spot, tag }); }
  stopCircle(c, R, spot = true, tag = 'rim') { this.edges.push({ kind: 'circle', c, R, stop: true, spot, tag }); }
  mediumAt(p) {
    let best = null;
    for (const r of this.regions) if ((!best || r.prio > best.prio) && inShape(p, r.shape)) best = r;
    return best;
  }
}

/** Primo bordo colpito dal raggio p + t d (t > tmin). */
function hit(scene, p, d) {
  let tBest = Infinity, eBest = null, nx = 0, ny = 0;
  for (const e of scene.edges) {
    if (e.kind === 'seg') {
      const ex = e.b[0] - e.a[0], ey = e.b[1] - e.a[1];
      const den = d[0] * ey - d[1] * ex;
      if (Math.abs(den) < 1e-14) continue;
      const ax = e.a[0] - p[0], ay = e.a[1] - p[1];
      const t = (ax * ey - ay * ex) / den, u = (ax * d[1] - ay * d[0]) / den;
      if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t < tBest) { tBest = t; eBest = e; const l = Math.hypot(ex, ey); nx = -ey / l; ny = ex / l; }
    } else {
      const ox = p[0] - e.c[0], oy = p[1] - e.c[1];
      const b = ox * d[0] + oy * d[1], c = ox * ox + oy * oy - e.R * e.R, disc = b * b - c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      for (const t of [-b - sq, -b + sq]) {
        if (t <= 1e-9 || t >= tBest) continue;
        const qx = ox + t * d[0], qy = oy + t * d[1];
        if (e.kind === 'arc' && qx * e.ux + qy * e.uy < -1e-9) continue;
        tBest = t; eBest = e; nx = qx / e.R; ny = qy / e.R;
        break;
      }
    }
  }
  return eBest ? { t: tBest, e: eBest, nx, ny } : null;
}

/**
 * Traccia il fascio dal punto o nella direzione d (normalizzata) per la lunghezza d'onda λ (nm).
 * opt: { maxSegs, imin, atten(mediumId) → coefficiente d'estinzione (1/m), far }
 * @returns {{ segs: {a, b, I0, I1, region}[], spots: {p, I}[], events: {p, tag, n1, n2, m1, m2, th1, th2, R, tir, primary, I}[] }}
 */
export function trace(scene, o, d, lambda, opt = {}) {
  const maxSegs = opt.maxSegs ?? 500, imin = opt.imin ?? 0.004, far = opt.far ?? 3, atten = opt.atten || (() => 0);
  const segs = [], spots = [], events = [];
  const stack = [{ p: o, d, I: 1, primary: true, depth: 0 }];
  while (stack.length && segs.length < maxSegs) {
    const ray = stack.pop();
    const { p, d: dir } = ray;
    const reg = scene.mediumAt([p[0] + dir[0] * 1e-7, p[1] + dir[1] * 1e-7]);
    const mid = reg ? reg.medium : scene.bg;
    const h = hit(scene, p, dir);
    const t = h ? h.t : far;
    const q = [p[0] + dir[0] * t, p[1] + dir[1] * t];
    const I1 = ray.I * Math.exp(-atten(mid) * t);
    segs.push({ a: p, b: q, I0: ray.I, I1, region: reg, medium: mid, primary: ray.primary });
    if (!h || ray.depth > 60) continue;
    if (h.e.stop) { if (h.e.spot) spots.push({ p: q, I: I1, tag: h.e.tag }); continue; }
    // mezzi ai due lati
    const after = scene.mediumAt([q[0] + dir[0] * 1e-7, q[1] + dir[1] * 1e-7]);
    const m2 = after ? after.medium : scene.bg;
    if (m2 === mid) { stack.push({ p: q, d: dir, I: I1, primary: ray.primary, depth: ray.depth }); continue; }
    const n1 = nOf(mid, lambda), n2 = nOf(m2, lambda);
    let nx = h.nx, ny = h.ny;
    if (nx * dir[0] + ny * dir[1] > 0) { nx = -nx; ny = -ny; }            // normale verso il raggio in arrivo
    const ci = -(nx * dir[0] + ny * dir[1]), th1 = Math.acos(Math.min(1, ci));
    const F = fresnel(n1, n2, th1);
    const eta = n1 / n2, st = eta * Math.sin(th1);
    const rd = [dir[0] + 2 * ci * nx, dir[1] + 2 * ci * ny];
    let th2 = null;
    const IR = I1 * F.R, IT = I1 * (1 - F.R);
    const ev = { p: q, tag: h.e.tag, n1, n2, m1: mid, m2, th1, th2: null, R: F.R, tir: F.tir, primary: ray.primary, I: I1, d: dir, nrm: [nx, ny] };
    events.push(ev);
    const children = [];
    if (!F.tir) {
      const ct = Math.sqrt(1 - st * st);
      th2 = Math.asin(st); ev.th2 = th2;
      const td = [eta * dir[0] + (eta * ci - ct) * nx, eta * dir[1] + (eta * ci - ct) * ny];
      const l = Math.hypot(td[0], td[1]);
      if (IT > imin) children.push({ p: q, d: [td[0] / l, td[1] / l], I: IT, kind: 't' });
    }
    if (IR > imin) children.push({ p: q, d: rd, I: IR, kind: 'r' });
    // il ramo più intenso resta «principale»; si traccia per primo (in cima alla pila)
    children.sort((a, b) => a.I - b.I);
    children.forEach((c, i) => stack.push({ p: c.p, d: c.d, I: c.I, primary: ray.primary && i === children.length - 1, depth: ray.depth + 1 }));
  }
  return { segs, spots, events };
}
