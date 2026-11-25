// trace.js — i raggi del laser sulla lavagna, in due dimensioni. Ogni raggio va diritto fino al primo lato che
// incontra; su un lato di acrilico si divide in un raggio rifratto (legge di Snell) e in uno riflesso, con le
// intensità di Fresnel (luce non polarizzata); oltre l'angolo limite la riflessione è totale. Gli specchi
// riflettono il 92 % della luce, i fianchi neri la assorbono. Si seguono i rami finché portano almeno lo 0,6 %
// della luce. Nessuna dipendenza: gira nel browser e in Node.
import { placeEdges, contains, inArc } from './shapes.js';

const EPS = 1e-9;
export const MIRROR_R = 0.92;
const MIN_I = 0.006, MAX_DEPTH = 24;

/** I pezzi sulla lavagna: [{ def, u, v, rot }] → lati in coordinate della lavagna, con l'indice del pezzo. */
export function buildScene(pieces) {
  const edges = [], shapes = [];
  pieces.forEach((p, k) => {
    const E = placeEdges(p.def, p.u, p.v, p.rot);
    shapes.push({ edges: E, medium: p.def.medium, k });
    for (const e of E) edges.push({ ...e, k });
  });
  return { edges, shapes };
}

function hitEdge(e, px, py, dx, dy) {
  if (e.type === 'seg') {
    const ex = e.b[0] - e.a[0], ey = e.b[1] - e.a[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-14) return null;
    const wx = e.a[0] - px, wy = e.a[1] - py;
    const t = (wx * ey - wy * ex) / den, s = (wx * dy - wy * dx) / den;
    if (t <= EPS || s < 0 || s > 1) return null;
    const l = Math.hypot(ex, ey);
    return { t, nx: ey / l, ny: -ex / l };
  }
  const ox = px - e.c[0], oy = py - e.c[1];
  const b = ox * dx + oy * dy, k = ox * ox + oy * oy - e.r * e.r, q = b * b - k;
  if (q < 0) return null;
  const sq = Math.sqrt(q);
  for (const t of [-b - sq, -b + sq]) {
    if (t <= EPS) continue;
    const x = px + t * dx, y = py + t * dy;
    if (!inArc(e, x, y)) continue;
    return { t, nx: (x - e.c[0]) / e.r, ny: (y - e.c[1]) / e.r };
  }
  return null;
}

/** Indice del mezzo nel punto (x, y), senza contare il pezzo skip: l'acrilico di un altro pezzo o l'aria. */
function mediumAt(scene, x, y, n, skip) {
  for (const s of scene.shapes) if (s.medium && s.k !== skip && contains(s.edges, x, y)) return n;
  return 1;
}

/** Riflettanza di Fresnel per luce non polarizzata. */
export function fresnel(n1, n2, cosi, cost) {
  const rs = (n1 * cosi - n2 * cost) / (n1 * cosi + n2 * cost), rp = (n2 * cosi - n1 * cost) / (n2 * cosi + n1 * cost);
  return (rs * rs + rp * rp) / 2;
}

/**
 * Segue i raggi. beams: [{ x, y, dx, dy }] (direzioni unitarie); n: indice dell'acrilico per questo colore;
 * bounds: [u0, v0, u1, v1] bordi della lavagna. Restituisce i tratti { ax, ay, bx, by, I, beam, main } (main: il
 * ramo che porta più luce), gli eventi sul ramo principale di ogni raggio e le direzioni finali.
 */
export function traceBeams(scene, beams, n, bounds) {
  const segs = [], paths = [];
  beams.forEach((bm, bi) => {
    const events = [];
    const stack = [{ x: bm.x, y: bm.y, dx: bm.dx, dy: bm.dy, I: 1, depth: 0, main: true }];
    let last = null;
    while (stack.length) {
      const r = stack.pop();
      // primo lato lungo il raggio
      let best = null;
      for (const e of scene.edges) {
        const h = hitEdge(e, r.x, r.y, r.dx, r.dy);
        if (h && (!best || h.t < best.t)) { best = h; best.e = e; }
      }
      // fino al bordo della lavagna
      const tb = exitBox(r, bounds);
      if (!best || best.t > tb) {
        segs.push({ ax: r.x, ay: r.y, bx: r.x + tb * r.dx, by: r.y + tb * r.dy, I: r.I, beam: bi, main: r.main });
        if (r.main) last = { x: r.x, y: r.y, dx: r.dx, dy: r.dy, end: 'board' };
        continue;
      }
      const hx = r.x + best.t * r.dx, hy = r.y + best.t * r.dy, e = best.e;
      segs.push({ ax: r.x, ay: r.y, bx: hx, by: hy, I: r.I, beam: bi, main: r.main });
      if (r.depth >= MAX_DEPTH) { if (r.main) last = { x: hx, y: hy, dx: r.dx, dy: r.dy, end: 'stop' }; continue; }
      let nx = best.nx, ny = best.ny;
      const cosI0 = -(r.dx * nx + r.dy * ny);
      if (cosI0 < 0) { nx = -nx; ny = -ny; }                       // normale verso il raggio in arrivo
      const cosi = Math.abs(cosI0);
      const refl = { dx: r.dx + 2 * cosi * nx, dy: r.dy + 2 * cosi * ny };
      if (e.kind === 'black') { if (r.main) { last = { x: r.x, y: r.y, dx: r.dx, dy: r.dy, end: 'black' }; events.push({ type: 'absorb', x: hx, y: hy, k: e.k }); } continue; }
      if (e.kind === 'mirror') {
        if (r.main) events.push({ type: 'mirror', x: hx, y: hy, nx, ny, dx: r.dx, dy: r.dy, ox: refl.dx, oy: refl.dy, i: Math.acos(Math.min(1, cosi)), k: e.k });
        if (r.I * MIRROR_R > MIN_I) stack.push({ x: hx, y: hy, ...refl, I: r.I * MIRROR_R, depth: r.depth + 1, main: r.main });
        else if (r.main) last = { x: hx, y: hy, dx: refl.dx, dy: refl.dy, end: 'weak' };
        continue;
      }
      // vetro: da che parte è il pezzo? (il punto appena dietro la superficie, lungo la normale verso il raggio)
      const shape = scene.shapes[e.k];
      const inside = contains(shape.edges, hx + nx * 2e-6, hy + ny * 2e-6);   // il raggio arriva da dentro il pezzo
      const n1 = inside ? n : mediumAt(scene, hx + nx * 2e-6, hy + ny * 2e-6, n, e.k);
      const n2 = inside ? mediumAt(scene, hx - nx * 2e-6, hy - ny * 2e-6, n, e.k) : n;
      const eta = n1 / n2, k = 1 - eta * eta * (1 - cosi * cosi);
      if (k < 0) {
        // riflessione totale
        if (r.main) events.push({ type: 'tir', x: hx, y: hy, nx, ny, dx: r.dx, dy: r.dy, ox: refl.dx, oy: refl.dy, i: Math.acos(Math.min(1, cosi)), n1, n2, R: 1, k: e.k });
        stack.push({ x: hx, y: hy, ...refl, I: r.I, depth: r.depth + 1, main: r.main });
        continue;
      }
      const cost = Math.sqrt(k);
      const tdx = eta * r.dx + (eta * cosi - cost) * nx, tdy = eta * r.dy + (eta * cosi - cost) * ny;
      const R = fresnel(n1, n2, cosi, cost), T = 1 - R;
      if (r.main) events.push({ type: 'refr', x: hx, y: hy, nx, ny, dx: r.dx, dy: r.dy, ox: tdx, oy: tdy, rx: refl.dx, ry: refl.dy, i: Math.acos(Math.min(1, cosi)), r: Math.acos(Math.min(1, cost)), n1, n2, R, k: e.k });
      const mainT = r.main && T >= R;
      if (r.I * R > MIN_I) stack.push({ x: hx, y: hy, ...refl, I: r.I * R, depth: r.depth + 1, main: r.main && !mainT });
      if (r.I * T > MIN_I) stack.push({ x: hx, y: hy, dx: tdx, dy: tdy, I: r.I * T, depth: r.depth + 1, main: mainT });
    }
    paths.push({ events, last, beam: bm });
  });
  return { segs, paths };
}

function exitBox(r, [u0, v0, u1, v1]) {
  let t = Infinity;
  if (r.dx > 0) t = Math.min(t, (u1 - r.x) / r.dx); else if (r.dx < 0) t = Math.min(t, (u0 - r.x) / r.dx);
  if (r.dy > 0) t = Math.min(t, (v1 - r.y) / r.dy); else if (r.dy < 0) t = Math.min(t, (v0 - r.y) / r.dy);
  return Math.max(0, t);
}

/**
 * Dove si incontrano i raggi usciti (ramo principale di ogni raggio): il punto più vicino a tutte le rette, con lo
 * scarto quadratico medio. real: davanti ai raggi (fuoco reale) o dietro (virtuale). null se sono paralleli.
 */
export function convergence(paths) {
  // l'ultimo tratto di ogni raggio, anche se finisce su un ostacolo (x, y: il suo inizio)
  const L = paths.map((p) => p.last).filter((l) => l && l.end !== 'stop');
  if (L.length < 2) return null;
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const l of L) {
    const m11 = 1 - l.dx * l.dx, m12 = -l.dx * l.dy, m22 = 1 - l.dy * l.dy;
    a11 += m11; a12 += m12; a22 += m22;
    b1 += m11 * l.x + m12 * l.y; b2 += m12 * l.x + m22 * l.y;
  }
  const det = a11 * a22 - a12 * a12;
  // raggi quasi paralleli: il sistema è mal condizionato
  const spread = Math.max(...L.map((l) => Math.atan2(l.dy, l.dx))) - Math.min(...L.map((l) => Math.atan2(l.dy, l.dx)));
  if (Math.abs(det) < 1e-6 || spread < 0.004) return { parallel: true, dir: [L[0].dx, L[0].dy] };
  const x = (b1 * a22 - b2 * a12) / det, y = (a11 * b2 - a12 * b1) / det;
  let s = 0, ahead = 0;
  for (const l of L) {
    const t = (x - l.x) * l.dx + (y - l.y) * l.dy;
    if (t > 0) ahead++;
    const px = l.x + t * l.dx - x, py = l.y + t * l.dy - y;
    s += px * px + py * py;
  }
  return { x, y, rms: Math.sqrt(s / L.length), real: ahead > L.length / 2, n: L.length };
}
