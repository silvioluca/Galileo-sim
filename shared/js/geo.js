// geo.js — utilità geometriche: solidi di rivoluzione, estrusioni orientate, taglio in sezione con
// facce di taglio ("spaccato") e texture procedurali.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const TWO_PI = Math.PI * 2;

/**
 * Solido di rivoluzione attorno all'asse X.
 * @param {Array<[number,number]>} profile poligono chiuso [x, r] (r ≥ 0); i lati sull'asse vengono ignorati
 * @param {number} segments suddivisioni angolari
 * @param {number} crease angolo (rad) oltre il quale uno spigolo resta vivo
 */
export function revolveX(profile, segments = 96, crease = 0.5) {
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const P = area < 0 ? profile.slice().reverse() : profile;   // antiorario nel piano (x, r)
  const cos = new Float64Array(segments + 1), sin = new Float64Array(segments + 1);
  for (let j = 0; j < segments; j++) { cos[j] = Math.cos((TWO_PI * j) / segments); sin[j] = Math.sin((TWO_PI * j) / segments); }
  cos[segments] = cos[0]; sin[segments] = sin[0];
  const pos = [];
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    if (a[1] <= 1e-9 && b[1] <= 1e-9) continue;
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) continue;
    for (let j = 0; j < segments; j++) {
      const c0 = cos[j], s0 = sin[j], c1 = cos[j + 1], s1 = sin[j + 1];
      const ax = a[0], ar = a[1], bx = b[0], br = b[1];
      // A_j, B_j, B_j+1
      if (br > 1e-9) pos.push(ax, ar * c0, ar * s0, bx, br * c0, br * s0, bx, br * c1, br * s1);
      // A_j, B_j+1, A_j+1
      if (ar > 1e-9) pos.push(ax, ar * c0, ar * s0, bx, br * c1, br * s1, ax, ar * c1, ar * s1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return toCreasedNormals(geo, crease);
}

/** Smussa gli spigoli di un profilo [x, r] chiuso con un raccordo di raggio rad (solo spigoli abbastanza lunghi). */
export function bevelProfile(profile, rad, steps = 3) {
  const n = profile.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = profile[i], a = profile[(i - 1 + n) % n], b = profile[(i + 1) % n];
    if (p[1] <= 1e-9) { out.push(p); continue; }
    const ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    const dot = (ux * vx + uy * vy) / (lu * lv || 1);
    const r = Math.min(rad, lu * 0.4, lv * 0.4);
    if (r < 1e-4 || dot < -0.98 || dot > 0.98 || p.noBevel) { out.push(p); continue; }
    const p0 = [p[0] + (ux / lu) * r, p[1] + (uy / lu) * r], p1 = [p[0] + (vx / lv) * r, p[1] + (vy / lv) * r];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, k = 1 - t;
      out.push([k * k * p0[0] + 2 * k * t * p[0] + t * t * p1[0], k * k * p0[1] + 2 * k * t * p[1] + t * t * p1[1]]);
    }
  }
  return out;
}

/** Estrude una THREE.Shape lungo X. Coordinate della forma: (u, v) = (−z, y). */
export function extrudeX(shape, x0, x1, opts = {}) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: opts.curveSegments || 24, ...opts });
  geo.rotateY(Math.PI / 2);
  geo.translate(x0, 0, 0);
  return finish(geo, opts.crease);
}

/** Estrude una THREE.Shape lungo Y. Coordinate della forma: (u, v) = (x, −z). bevel = raggio del raccordo. */
export function extrudeY(shape, y0, y1, bevel = 0, opts = {}) {
  const settings = { depth: y1 - y0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: opts.curveSegments || 24 };
  const geo = new THREE.ExtrudeGeometry(shape, settings);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + bevel, 0);
  return finish(geo, opts.crease);
}

function finish(geo, crease = 0.6) {
  const g = toCreasedNormals(geo, crease);
  return g;
}

export function rectShape(u0, u1, v0, v1, r = 0) {
  const s = new THREE.Shape();
  roundedRectPath(s, u0, u1, v0, v1, r);
  return s;
}
export function roundedRectPath(path, u0, u1, v0, v1, r = 0) {
  if (r <= 0) {
    path.moveTo(u0, v0); path.lineTo(u1, v0); path.lineTo(u1, v1); path.lineTo(u0, v1); path.closePath();
    return path;
  }
  path.moveTo(u0 + r, v0);
  path.lineTo(u1 - r, v0); path.absarc(u1 - r, v0 + r, r, -Math.PI / 2, 0, false);
  path.lineTo(u1, v1 - r); path.absarc(u1 - r, v1 - r, r, 0, Math.PI / 2, false);
  path.lineTo(u0 + r, v1); path.absarc(u0 + r, v1 - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(u0, v0 + r); path.absarc(u0 + r, v0 + r, r, Math.PI, Math.PI * 1.5, false);
  path.closePath();
  return path;
}

/** Corona dentata (zigrinatura): profilo esterno a denti, foro interno circolare. */
export function knurledShape(rOuter, rInner, teeth, depth) {
  const s = new THREE.Shape();
  const step = TWO_PI / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [[a, rOuter], [a + step * 0.42, rOuter], [a + step * 0.56, rOuter - depth], [a + step * 0.86, rOuter - depth]];
    for (const [ang, r] of pts) {
      const x = r * Math.cos(ang), y = r * Math.sin(ang);
      if (i === 0 && ang === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
  }
  s.closePath();
  if (rInner > 0) { const h = new THREE.Path(); h.absarc(0, 0, rInner, 0, TWO_PI, true); s.holes.push(h); }
  return s;
}

// ───────────────────────────── spaccato ─────────────────────────────

const _v = new THREE.Vector3();

/**
 * Taglia una geometria con il piano z = z0, conservando la parte con z ≤ z0, e genera la faccia di taglio.
 * La geometria è prima portata nello spazio definito da `matrix`.
 * @returns {{kept: THREE.BufferGeometry|null, cap: THREE.BufferGeometry|null, loops: number[][]}}
 */
export function sliceZ(geometry, matrix, z0) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) g.applyMatrix4(matrix);
  const P = g.attributes.position.array;
  const N = g.attributes.normal ? g.attributes.normal.array : null;
  const U = g.attributes.uv ? g.attributes.uv.array : null;
  const tri = P.length / 9;
  const oP = [], oN = [], oU = [];
  const segs = [];   // [x0,y0,x1,y1]

  const vert = (i) => ({
    x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2],
    nx: N ? N[i * 3] : 0, ny: N ? N[i * 3 + 1] : 0, nz: N ? N[i * 3 + 2] : 1,
    u: U ? U[i * 2] : 0, v: U ? U[i * 2 + 1] : 0,
  });
  const less = (a, b) => (a.x !== b.x ? a.x < b.x : a.y !== b.y ? a.y < b.y : a.z < b.z);
  // intersezione calcolata sempre nello stesso verso: identica per i due triangoli che condividono lo spigolo
  const cut = (a, b) => {
    if (!less(a, b)) { const t = a; a = b; b = t; }
    const t = (z0 - a.z) / (b.z - a.z);
    const l = (p, q) => p + (q - p) * t;
    return { x: l(a.x, b.x), y: l(a.y, b.y), z: z0, nx: l(a.nx, b.nx), ny: l(a.ny, b.ny), nz: l(a.nz, b.nz), u: l(a.u, b.u), v: l(a.v, b.v) };
  };
  const push = (p) => { oP.push(p.x, p.y, p.z); oN.push(p.nx, p.ny, p.nz); oU.push(p.u, p.v); };

  for (let t = 0; t < tri; t++) {
    const v = [vert(t * 3), vert(t * 3 + 1), vert(t * 3 + 2)];
    const out = [v[0].z > z0, v[1].z > z0, v[2].z > z0];
    const nOut = out[0] + out[1] + out[2];
    if (nOut === 0) { push(v[0]); push(v[1]); push(v[2]); continue; }
    if (nOut === 3) continue;
    const poly = [], cuts = [];
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3];
      if (!out[i]) poly.push(a);
      if (out[i] !== out[(i + 1) % 3]) { const c = cut(a, b); poly.push(c); cuts.push(c); }
    }
    for (let i = 1; i < poly.length - 1; i++) { push(poly[0]); push(poly[i]); push(poly[i + 1]); }
    if (cuts.length === 2) segs.push([cuts[0].x, cuts[0].y, cuts[1].x, cuts[1].y]);
  }

  let kept = null;
  if (oP.length) {
    kept = new THREE.BufferGeometry();
    kept.setAttribute('position', new THREE.Float32BufferAttribute(oP, 3));
    kept.setAttribute('normal', new THREE.Float32BufferAttribute(oN, 3));
    if (U) kept.setAttribute('uv', new THREE.Float32BufferAttribute(oU, 2));
  }
  g.dispose();
  if (!segs.length) return { kept, cap: null, loops: [] };

  // ── concatena i segmenti in anelli chiusi (i capi coincidenti entro una tolleranza sono fusi) ──
  const CELL = 4e-3, TOL2 = 2e-3 * 2e-3;
  const grid = new Map(), upts = [];
  const idOf = (x, y) => {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = grid.get((gx + dx) + '_' + (gy + dy));
      if (!list) continue;
      for (const id of list) { const ex = upts[id * 2] - x, ey = upts[id * 2 + 1] - y; if (ex * ex + ey * ey < TOL2) return id; }
    }
    const id = upts.length / 2;
    upts.push(x, y);
    const k = gx + '_' + gy;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(id);
    return id;
  };
  const ends = segs.map((s) => [idOf(s[0], s[1]), idOf(s[2], s[3])]);
  const adj = new Map();
  ends.forEach((e, i) => {
    if (e[0] === e[1]) return;
    for (const k of [0, 1]) { if (!adj.has(e[k])) adj.set(e[k], []); adj.get(e[k]).push(i * 2 + k); }
  });
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    if (ends[i][0] === ends[i][1]) continue;
    const start = ends[i][0];
    const loop = [upts[start * 2], upts[start * 2 + 1]];
    let cur = ends[i][1];
    let closed = false, guard = 0;
    while (guard++ < segs.length + 2) {
      if (cur === start) { closed = true; break; }
      loop.push(upts[cur * 2], upts[cur * 2 + 1]);
      let next = -1;
      for (const c of adj.get(cur) || []) { if (!used[c >> 1]) { next = c; break; } }
      if (next < 0) break;
      used[next >> 1] = 1;
      cur = ends[next >> 1][1 - (next & 1)];
    }
    if (closed && loop.length >= 6) loops.push(loop);
  }
  if (!loops.length) return { kept, cap: null, loops: [] };

  // ── annidamento: anelli esterni e fori ──
  const areaOf = (l) => { let a = 0; for (let i = 0; i < l.length; i += 2) { const j = (i + 2) % l.length; a += l[i] * l[j + 1] - l[j] * l[i + 1]; } return a / 2; };
  const inside = (px, py, l) => {
    let c = false;
    for (let i = 0, j = l.length - 2; i < l.length; j = i, i += 2) {
      if ((l[i + 1] > py) !== (l[j + 1] > py) && px < ((l[j] - l[i]) * (py - l[i + 1])) / (l[j + 1] - l[i + 1]) + l[i]) c = !c;
    }
    return c;
  };
  const info = loops.map((l) => ({ l, area: Math.abs(areaOf(l)), depth: 0, parent: -1 })).filter((o) => o.area > 1e-7);
  info.sort((a, b) => b.area - a.area);
  for (let i = 0; i < info.length; i++) {
    // punto interno all'anello: medio di un lato, spostato appena verso l'interno non serve: basta un vertice
    const px = (info[i].l[0] + info[i].l[2]) / 2, py = (info[i].l[1] + info[i].l[3]) / 2;
    for (let j = i - 1; j >= 0; j--) {
      if (inside(px, py, info[j].l)) { info[i].parent = j; info[i].depth = info[j].depth + 1; break; }
    }
  }
  const cP = [], cN = [], cU = [];
  info.forEach((o, i) => {
    if (o.depth % 2) return;
    const toV2 = (l) => { const a = []; for (let k = 0; k < l.length; k += 2) a.push(new THREE.Vector2(l[k], l[k + 1])); return a; };
    const contour = toV2(o.l);
    const holes = info.filter((h) => h.parent === i && h.depth === o.depth + 1).map((h) => toV2(h.l));
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    for (const f of faces) {
      let [a, b, c] = [all[f[0]], all[f[1]], all[f[2]]];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross < 0) { const t = b; b = c; c = t; }
      for (const p of [a, b, c]) { cP.push(p.x, p.y, z0); cN.push(0, 0, 1); cU.push(p.x, p.y); }
    }
  });
  let cap = null;
  if (cP.length) {
    cap = new THREE.BufferGeometry();
    cap.setAttribute('position', new THREE.Float32BufferAttribute(cP, 3));
    cap.setAttribute('normal', new THREE.Float32BufferAttribute(cN, 3));
    cap.setAttribute('uv', new THREE.Float32BufferAttribute(cU, 2));
  }
  return { kept, cap, loops: info.map((o) => o.l) };
}

// ───────────────────────────── texture procedurali ─────────────────────────────

export function canvasTexture(w, h, draw, { srgb = true, aniso = 8, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Mappa normale a grana di similpelle (ripetibile). */
export function leatherNormalMap(size = 256) {
  const h = new Float32Array(size * size);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 2600; i++) {
    const cx = rnd() * size, cy = rnd() * size, r = 2.2 + rnd() * 3.4, amp = 0.5 + rnd() * 0.5;
    const r0 = Math.ceil(r);
    for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d >= 1) continue;
      const x = ((Math.round(cx) + dx) % size + size) % size, y = ((Math.round(cy) + dy) % size + size) % size;
      const v = amp * Math.sqrt(1 - d * d);
      if (v > h[y * size + x]) h[y * size + x] = v;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * 1.6, ny = (u - d) * 1.6, nz = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    data[i] = (nx * inv * 0.5 + 0.5) * 255; data[i + 1] = (ny * inv * 0.5 + 0.5) * 255; data[i + 2] = (nz * inv * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Tratteggio a 45° per le facce di taglio (convenzione del disegno tecnico). */
export function hatchTexture(base, line, dir = 1) {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 2.4;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      if (dir > 0) { g.moveTo(i * w - 8, h + 8); g.lineTo((i + 1) * w + 8, -8); } else { g.moveTo(i * w - 8, -8); g.lineTo((i + 1) * w + 8, h + 8); }
      g.stroke();
    }
  }, { repeat: true });
}

export { _v };
