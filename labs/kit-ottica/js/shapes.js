// shapes.js — i pezzi del kit di ottica da lavagna: profili 2D fatti di segmenti e archi di cerchio, nel sistema
// del pezzo (metri). L'origine è il punto di riferimento del pezzo: il centro di una lente, il centro della faccia
// piana del semicilindro, il vertice di uno specchio. L'asse ottico delle lenti è l'asse x locale.
// Ogni contorno è una catena chiusa percorsa in senso antiorario; ogni lato ha un tipo: 'glass' (acrilico, rifrange),
// 'mirror' (riflette), 'black' (assorbe: il retro e i fianchi degli specchi).

/** Indice dell'acrilico (PMMA) alla lunghezza d'onda lam (µm): formula di Sellmeier. */
export function nPMMA(lam) {
  const l2 = lam * lam;
  return Math.sqrt(1 + (0.99654 * l2) / (l2 - 0.00787) + (0.18964 * l2) / (l2 - 0.02191) + (0.00411 * l2) / (l2 - 3.85727));
}

export const THICK = 0.012;                  // spessore dei pezzi (m)
const TAU = Math.PI * 2;

const seg = (ax, ay, bx, by, kind = 'glass') => ({ type: 'seg', a: [ax, ay], b: [bx, by], kind });
/** Arco da angolo s ad angolo e, in senso antiorario se ccw. */
const arc = (cx, cy, r, s, e, ccw, kind = 'glass') => ({ type: 'arc', c: [cx, cy], r, s, e, ccw, kind });

/** Freccia della calotta, con segno: c = 1/R (> 0 se il centro di curvatura sta verso +x). */
const sag = (c, y) => (c * y * y) / (1 + Math.sqrt(Math.max(0, 1 - c * c * y * y)));

/**
 * Lente con asse lungo x, alta 2a: curvature c1 (faccia di sinistra) e c2 (di destra), spessore al centro tc.
 * Contorno antiorario: giù lungo la faccia di sinistra, il bordo in basso, su lungo la faccia di destra, il bordo in alto.
 */
function lens(c1, c2, tc, a) {
  const xl = -tc / 2, xr = tc / 2, E = [];
  const L = (y) => xl + sag(c1, y), R = (y) => xr + sag(c2, y);
  if (c1 === 0) E.push(seg(xl, a, xl, -a));
  else {
    const r = 1 / Math.abs(c1), al = Math.asin(a * Math.abs(c1));
    if (c1 > 0) E.push(arc(xl + r, 0, r, Math.PI - al, Math.PI + al, true));
    else E.push(arc(xl - r, 0, r, al, -al, false));
  }
  E.push(seg(L(-a), -a, R(-a), -a));
  if (c2 === 0) E.push(seg(xr, -a, xr, a));
  else {
    const r = 1 / Math.abs(c2), al = Math.asin(a * Math.abs(c2));
    if (c2 > 0) E.push(arc(xr + r, 0, r, Math.PI + al, Math.PI - al, false));
    else E.push(arc(xr - r, 0, r, -al, al, true));
  }
  E.push(seg(R(a), a, L(a), a));
  return E;
}

/** Spessore al centro perché il bordo sia spesso almeno e (e il centro almeno tmin). */
const centerT = (c1, c2, a, e = 0.004, tmin = 0.005) => Math.max(tmin, e + sag(c1, a) - sag(c2, a));

/** Specchio con la faccia lucida rivolta verso −x e il corpo dietro, spesso w. c: curvatura della faccia (> 0 concavo). */
function mirror(c, a, w = 0.006) {
  if (c === 0) return [seg(0, a, 0, -a, 'mirror'), seg(0, -a, w, -a, 'black'), seg(w, -a, w, a, 'black'), seg(w, a, 0, a, 'black')];
  const r = 1 / Math.abs(c), al = Math.asin(a * Math.abs(c));
  if (c > 0) {
    // concavo: centro di curvatura a sinistra (−R, 0), la faccia lucida guarda il centro, il corpo dietro (raggio R + w)
    const R2 = r + w, al2 = Math.asin(a / R2), cx = -r;
    return [
      arc(cx, 0, r, al, -al, false, 'mirror'),
      seg(cx + r * Math.cos(al), -a, cx + R2 * Math.cos(al2), -a, 'black'),
      arc(cx, 0, R2, -al2, al2, true, 'black'),
      seg(cx + R2 * Math.cos(al2), a, cx + r * Math.cos(al), a, 'black'),
    ];
  }
  // convesso: centro a destra (+R, 0), la faccia lucida sporge verso sinistra, il corpo dentro (raggio R − w)
  const R2 = r - w, al2 = Math.asin(a / R2), cx = r;
  return [
    arc(cx, 0, r, Math.PI - al, Math.PI + al, true, 'mirror'),
    seg(cx - r * Math.cos(al), -a, cx - R2 * Math.cos(al2), -a, 'black'),
    arc(cx, 0, R2, Math.PI + al2, Math.PI - al2, false, 'black'),
    seg(cx - R2 * Math.cos(al2), a, cx - r * Math.cos(al), a, 'black'),
  ];
}

function polygon(pts) { return pts.map((p, i) => seg(p[0], p[1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1])); }

/** Focale (parassiale) di una lente spessa in aria: curvature c1, c2, spessore tc, indice n. */
export function lensFocal(c1, c2, tc, n) {
  const P = (n - 1) * (c1 - c2 + ((n - 1) * tc * c1 * c2) / n);
  return P ? 1 / P : Infinity;
}

// ─────────────────────────────── il catalogo ───────────────────────────────
// group: 'lens' | 'block' | 'mirror'; focal(n): focale nominale (m) o null; extent: raggio d'ingombro (per la manopola)
function lensDef(id, label, c1, c2, a, extra = {}) {
  const tc = extra.tc ?? centerT(c1, c2, a);
  return { id, label, group: 'lens', medium: true, edges: lens(c1, c2, tc, a), extent: Math.hypot(a, tc / 2 + 0.02), focal: (n) => lensFocal(c1, c2, tc, n), c1, c2, tc, a, ...extra };
}
const R10 = 1 / 0.1, R6 = 1 / 0.06, R12 = 1 / 0.12;

export const PIECES = {
  biconvex: lensDef('biconvex', 'Biconvessa', R10, -R10, 0.05),
  biconcave: lensDef('biconcave', 'Biconcava', -R10, R10, 0.05, { tc: 0.006 }),
  planoconvex: lensDef('planoconvex', 'Piano-convessa', R6, 0, 0.04),
  planoconcave: lensDef('planoconcave', 'Piano-concava', -R6, 0, 0.04, { tc: 0.005 }),
  meniscusPos: lensDef('meniscusPos', 'Menisco convergente', R6, R12, 0.04),
  meniscusNeg: lensDef('meniscusNeg', 'Menisco divergente', R12, R6, 0.04, { tc: 0.004 }),
  semicircle: {
    id: 'semicircle', label: 'Semicilindro', group: 'block', medium: true, extent: 0.05,
    // faccia piana sull'asse y (il suo centro è l'origine), arco verso +x
    edges: [seg(0, 0.045, 0, -0.045), arc(0, 0, 0.045, -Math.PI / 2, Math.PI / 2, true)],
    focal: (n) => 0.045 / (n - 1),
  },
  disk: {
    id: 'disk', label: 'Cilindro (lente sferica)', short: 'Cilindro', group: 'block', medium: true, extent: 0.035,
    edges: [arc(0, 0, 0.03, 0, TAU, true)],
    focal: (n) => (n * 0.03) / (2 * (n - 1)),            // dal centro
  },
  slab: { id: 'slab', label: 'Lastra', group: 'block', medium: true, extent: 0.055, edges: polygon([[-0.0225, 0.045], [-0.0225, -0.045], [0.0225, -0.045], [0.0225, 0.045]]), focal: () => null },
  prism60: (() => {
    const s = 0.07, h = (s * Math.sqrt(3)) / 2;
    return { id: 'prism60', label: 'Prisma a 60°', group: 'block', medium: true, extent: 0.05, edges: polygon([[0, (2 * h) / 3], [-s / 2, -h / 3], [s / 2, -h / 3]]), focal: () => null, apex: 60 };
  })(),
  prism45: (() => {
    const L = 0.06, g = L / 3;
    return { id: 'prism45', label: 'Prisma a 45°', group: 'block', medium: true, extent: 0.05, edges: polygon([[-g, -g], [L - g, -g], [-g, L - g]]), focal: () => null };
  })(),
  mirrorPlane: { id: 'mirrorPlane', label: 'Specchio piano', group: 'mirror', medium: false, extent: 0.055, edges: mirror(0, 0.05), focal: () => null, c: 0 },
  mirrorConcave: { id: 'mirrorConcave', label: 'Specchio concavo', group: 'mirror', medium: false, extent: 0.055, edges: mirror(1 / 0.2, 0.05), focal: () => 0.1, c: 5 },
  mirrorConvex: { id: 'mirrorConvex', label: 'Specchio convesso', group: 'mirror', medium: false, extent: 0.055, edges: mirror(-1 / 0.2, 0.05), focal: () => -0.1, c: -5 },
};

// ─────────────────────────────── trasformazioni e geometria ───────────────────────────────
/** Lati del pezzo nel sistema della lavagna (u, v): ruotato di rot (rad) attorno all'origine, poi traslato. */
export function placeEdges(def, u, v, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const T = ([x, y]) => [u + c * x - s * y, v + s * x + c * y];
  return def.edges.map((e) => {
    if (e.type === 'seg') return { ...e, a: T(e.a), b: T(e.b) };
    // arco: in forma normalizzata (inizio a0, ampiezza sw > 0 in senso antiorario)
    const s0 = e.ccw ? e.s : e.e, sw = Math.abs(e.e - e.s);
    return { ...e, c: T(e.c), a0: s0 + rot, sw: Math.min(sw, TAU) };
  });
}

const wrap = (x) => ((x % TAU) + TAU) % TAU;
export const inArc = (e, x, y) => e.sw >= TAU - 1e-9 || wrap(Math.atan2(y - e.c[1], x - e.c[0]) - e.a0) <= e.sw + 1e-12;

/** Il punto (x, y) sta dentro il contorno? Conta gli attraversamenti di una semiretta verso +x. */
export function contains(edges, x, y) {
  let n = 0;
  for (const e of edges) {
    if (e.type === 'seg') {
      const [ax, ay] = e.a, [bx, by] = e.b;
      if ((ay > y) !== (by > y)) { const xi = ax + ((y - ay) * (bx - ax)) / (by - ay); if (xi > x) n++; }
    } else {
      const dy = y - e.c[1], q = e.r * e.r - dy * dy;
      if (q <= 0) continue;
      const w = Math.sqrt(q);
      for (const xi of [e.c[0] - w, e.c[0] + w]) if (xi > x && inArc(e, xi, y)) n++;
    }
  }
  return (n & 1) === 1;
}

/** Punti del contorno (per disegnarlo e per estruderlo): gli archi divisi in tratti. */
export function outline(def, perRad = 40) {
  const pts = [];
  for (const e of def.edges) {
    if (e.type === 'seg') pts.push(e.a);
    else {
      const n = Math.max(4, Math.ceil(Math.abs(e.e - e.s) * perRad));
      for (let i = 0; i < n; i++) { const t = e.s + ((e.e - e.s) * i) / n; pts.push([e.c[0] + e.r * Math.cos(t), e.c[1] + e.r * Math.sin(t)]); }
    }
  }
  return pts;
}
