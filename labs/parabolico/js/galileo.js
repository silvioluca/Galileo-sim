// galileo.js — l'apparato in legno per la traiettoria parabolica, sul modello di quello del Museo Galileo
// di Firenze (XVIII secolo): base con viti di livello, rampa curva intarsiata con la scanalatura e il fermo,
// tavola scura con le linee dei tempi uguali e la parabola, cassetta di raccolta in fondo.
// Coordinate del mondo (metri): la pallina esce dalla rampa in x = 0 e vola nel piano z = 0, davanti alla tavola.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { GAL, ballSpec, rampRun, rampPath, rampAt, rampS, rollRadius } from './proj.js';

const SERIF = '"Fraunces Variable", Georgia, serif';
const Z = { back: -0.048, board: -0.028, front: 0.035 };    // profondità di rampa e tavola
export const GAL_BASE = { x0: -0.43, x1: 0.80, y0: 0.014, z0: -0.075, z1: 0.065 };
const GD = 0.007;                                            // profondità della scanalatura
const BAND = 0.024;                                          // fascia chiara intarsiata lungo i bordi della rampa
const XL = -0.37;                                            // fianco esterno della rampa
const NC = 140;                                              // punti della curva nei profili

const WALNUT = { base: '#5b3520', dark: '#2a160a', light: '#86532f' };
const SATIN = { base: '#c48f52', dark: '#93602c', light: '#e2b57a' };
const BURL = { base: '#6e3d1d', dark: '#341a0a', light: '#a0612e' };
const EBONY = { base: '#2a1c14', dark: '#120a06', light: '#45301f' };
const IVORY = '#efe4c8';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Venatura: bande di tono, fibre ondulate, pori. Lungo x, o lungo y con vertical. */
function grain(g, W, H, o) {
  const rnd = rng(o.seed || 1);
  g.save();
  let w = W, h = H;
  if (o.vertical) { g.translate(W, 0); g.rotate(Math.PI / 2); w = H; h = W; }
  g.fillStyle = o.base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.05 + rnd() * 0.09; g.fillStyle = rnd() < 0.55 ? o.dark : o.light;
    g.fillRect(0, rnd() * h, w, 4 + rnd() * h * 0.12);
  }
  const n = o.lines || Math.round(h * 0.9);
  for (let i = 0; i < n; i++) {
    const y0 = rnd() * h, amp = (o.wave ?? 5) * (0.3 + rnd()), f = ((0.6 + rnd() * 2.4) / w) * 6.28, ph = rnd() * 6.28;
    g.globalAlpha = 0.05 + rnd() * 0.22; g.strokeStyle = rnd() < 0.72 ? o.dark : o.light; g.lineWidth = 0.5 + rnd() * 1.6;
    g.beginPath();
    for (let x = -10; x <= w + 10; x += 10) { const y = y0 + amp * Math.sin(x * f + ph) + amp * 0.35 * Math.sin(x * f * 2.7 + ph * 1.3); if (x < 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = o.dark;
  for (let i = 0; i < (w * h) / 500; i++) { g.globalAlpha = 0.12 + rnd() * 0.25; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 0.8 + rnd() * 0.6); }
  g.restore();
  g.globalAlpha = 1;
}

/** Radica: macchie sovrapposte e piccoli occhi (dentro il tracciato corrente se clip). */
function burl(g, x, y, w, h, o, seed = 3) {
  const rnd = rng(seed);
  g.fillStyle = o.base; g.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 90; i++) {
    const r = 1.5 + rnd() * 7;
    g.globalAlpha = 0.07 + rnd() * 0.2; g.fillStyle = rnd() < 0.6 ? o.dark : o.light;
    g.beginPath(); g.ellipse(x + rnd() * w, y + rnd() * h, r * (0.6 + rnd()), r * (0.4 + rnd() * 0.6), rnd() * 3.14, 0, 6.29); g.fill();
  }
  for (let i = 0; i < (w * h) / 5000; i++) {
    const cx = x + rnd() * w, cy = y + rnd() * h;
    g.globalAlpha = 0.35; g.fillStyle = o.dark; g.beginPath(); g.arc(cx, cy, 1 + rnd() * 2.2, 0, 6.29); g.fill();
    g.globalAlpha = 0.15; g.strokeStyle = o.dark; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, 3 + rnd() * 5, 0, 6.29); g.stroke();
  }
  g.globalAlpha = 1;
}

const woodTex = (o, W = 1024, H = 256, extra = {}) => canvasTexture(W, H, (g) => grain(g, W, H, { ...o, ...extra }), { aniso: 8, repeat: true });

// ───────────────────────────── profili della rampa ─────────────────────────────
const edge = (p) => ({ x: -GAL.a * Math.sin(p), y: GAL.yE + GAL.b * (1 - Math.cos(p)) });
function normal(p) { const tx = -GAL.a * Math.cos(p), ty = GAL.b * Math.sin(p), L = Math.hypot(tx, ty); return { x: ty / L, y: -tx / L }; }
const TOP = edge(GAL.phiMax).y;
/** Ingombro della rampa (per le inquadrature). */
export const GAL_RAMP = { x0: XL, top: TOP, z0: Z.back, z1: Z.front };

/** Contorno della rampa (antiorario); off sposta il bordo curvo verso l'interno del legno. */
function outline(off = 0) {
  const pts = [[XL, GAL.floor], [0, GAL.floor]];
  for (let i = 0; i <= NC; i++) {
    const p = (GAL.phiMax * i) / NC, e = edge(p), n = normal(p);
    pts.push([e.x - off * n.x, e.y - off * n.y]);
  }
  pts.push([XL, pts[pts.length - 1][1]]);
  return pts;
}
/** Contorno rientrato di B su tutti i lati (per gli intarsi). */
function inset(B) {
  const yTop = TOP - B, pts = [[XL + B, GAL.floor + B], [-B, GAL.floor + B]];
  let started = false;
  for (let i = 0; i <= NC * 2; i++) {
    const p = (GAL.phiMax * i) / (NC * 2), e = edge(p), n = normal(p);
    const x = e.x - B * n.x, y = e.y - B * n.y;
    if (x > -B) continue;
    if (!started) { pts.push([-B, y]); started = true; }
    if (y >= yTop) { pts.push([x, yTop]); break; }
    pts.push([x, y]);
  }
  pts.push([XL + B, yTop]);
  return pts;
}
const shapeOf = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };

// ───────────────────────────── texture ─────────────────────────────
const PXM = 1900;                                            // pixel per metro della faccia della rampa
const RW = Math.ceil(-XL * PXM), RH = Math.ceil((TOP - GAL.floor) * PXM);

/** Faccia anteriore della rampa: fascia di legno satinato, filetto d'ebano, radica, riquadri, scala delle altezze. */
function rampFaceTexture(heights) {
  const tex = canvasTexture(RW, RH, (g) => {
    const X = (x) => (x - XL) * PXM, Y = (y) => (TOP - y) * PXM;
    const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); };
    g.save();
    path(outline()); g.clip();
    grain(g, RW, RH, { ...SATIN, seed: 21, lines: 900, wave: 7 });
    // filetto d'ebano e radica dentro la fascia
    path(inset(BAND)); g.fillStyle = EBONY.dark; g.fill();
    g.save(); path(inset(BAND + 0.0028)); g.clip(); burl(g, 0, 0, RW, RH, BURL, 5); g.restore();
    // filetto chiaro che ripete la curva
    g.strokeStyle = SATIN.light; g.globalAlpha = 0.85; g.lineWidth = 0.0022 * PXM; g.beginPath();
    let first = true;
    for (let i = 0; i <= NC; i++) {
      const p = (GAL.phiMax * i) / NC, e = edge(p), n = normal(p), x = e.x - (BAND + 0.03) * n.x, y = e.y - (BAND + 0.03) * n.y;
      if (x > -(BAND + 0.03) || y > TOP - BAND - 0.03) continue;
      if (first) { g.moveTo(X(x), Y(y)); first = false; } else g.lineTo(X(x), Y(y));
    }
    g.stroke(); g.globalAlpha = 1;
    // riquadri intarsiati in basso
    const rect = (x0, y0, x1, y1, fill) => { g.fillStyle = fill; g.fillRect(X(x0), Y(y1), (x1 - x0) * PXM, (y1 - y0) * PXM); };
    const R = [XL + 0.05, GAL.floor + 0.045, -0.05, GAL.yE - 0.045];
    const ins = (d) => [R[0] + d, R[1] + d, R[2] - d, R[3] - d];
    rect(...ins(0), SATIN.light); rect(...ins(0.005), EBONY.dark); rect(...ins(0.008), SATIN.base); rect(...ins(0.011), EBONY.dark);
    g.save(); const r2 = ins(0.0135); g.beginPath(); g.rect(X(r2[0]), Y(r2[3]), (r2[2] - r2[0]) * PXM, (r2[3] - r2[1]) * PXM); g.clip(); burl(g, X(r2[0]), Y(r2[3]), (r2[2] - r2[0]) * PXM, (r2[3] - r2[1]) * PXM, { base: '#5a3018', dark: '#2a1408', light: '#8a5428' }, 9); g.restore();
    const r3 = ins(0.04); g.strokeStyle = SATIN.light; g.lineWidth = 0.002 * PXM; g.strokeRect(X(r3[0]), Y(r3[3]), (r3[2] - r3[0]) * PXM, (r3[3] - r3[1]) * PXM);
    // losanga al centro del riquadro
    const cx = (R[0] + R[2]) / 2, cy = (R[1] + R[3]) / 2, dx = 0.035, dy = 0.05;
    g.fillStyle = SATIN.light; g.beginPath(); g.moveTo(X(cx), Y(cy + dy)); g.lineTo(X(cx + dx), Y(cy)); g.lineTo(X(cx), Y(cy - dy)); g.lineTo(X(cx - dx), Y(cy)); g.closePath(); g.fill();
    g.fillStyle = EBONY.dark; g.beginPath(); g.moveTo(X(cx), Y(cy + dy * 0.6)); g.lineTo(X(cx + dx * 0.6), Y(cy)); g.lineTo(X(cx), Y(cy - dy * 0.6)); g.lineTo(X(cx - dx * 0.6), Y(cy)); g.closePath(); g.fill();
    // scala delle altezze di partenza lungo il bordo curvo (centimetri sopra l'uscita)
    g.fillStyle = '#1d120a'; g.strokeStyle = '#1d120a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const { H, ex, ey, nx, ny } of heights) {
      const cm = Math.round(H * 100), major = cm % 10 === 0, mid = cm % 5 === 0;
      const L = major ? 0.011 : mid ? 0.0075 : 0.0045;
      g.lineWidth = (major ? 0.0014 : 0.0009) * PXM;
      g.beginPath(); g.moveTo(X(ex - 0.0012 * nx), Y(ey - 0.0012 * ny)); g.lineTo(X(ex - L * nx), Y(ey - L * ny)); g.stroke();
      if (major) {
        g.font = `italic 600 ${Math.round(0.0095 * PXM)}px ${SERIF}`;
        g.fillText(String(cm), X(ex - 0.0175 * nx), Y(ey - 0.0175 * ny));
      }
    }
    g.restore();
  }, { aniso: 16 });
  tex.repeat.set(PXM / RW, PXM / RH);
  tex.offset.set((-XL * PXM) / RW, (-(TOP - RH / PXM) * PXM) / RH);
  return tex;
}

/** Faccia della tavola: ebano a venatura verticale, linee d'avorio dei tempi uguali, parabola, numeri. */
function boardTexture(par) {
  const BW = GAL.board, BH = GAL.yE - GAL.floor, W = 2048, H = Math.round((2048 * BH) / BW), px = W / BW;
  return canvasTexture(W, H, (g) => {
    const X = (x) => x * px, Y = (y) => (GAL.yE - y) * px;
    grain(g, W, H, { ...EBONY, seed: 33, vertical: true, lines: 1400, wave: 4 });
    // giunti fra le assi
    g.strokeStyle = '#0b0604'; g.globalAlpha = 0.55; g.lineWidth = 2;
    for (const x of [0.093, 0.205, 0.31, 0.43, 0.54]) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    g.globalAlpha = 1;
    // linee verticali a distanze uguali = istanti uguali
    g.fillStyle = IVORY;
    for (let i = 1; i < par.x.length; i++) g.fillRect(X(par.x[i]) - 0.0012 * px, 0, 0.0024 * px, H);
    // parabola intarsiata (contorno scuro, poi avorio)
    const curve = () => { g.beginPath(); for (let i = 0; i <= 160; i++) { const x = (par.d * i) / 160, y = par.y0 - par.drop * (x / par.d) ** 2; if (i) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y)); } };
    g.lineCap = 'round'; g.lineJoin = 'round';
    curve(); g.strokeStyle = '#0b0604'; g.lineWidth = 0.0052 * px; g.stroke();
    curve(); g.strokeStyle = IVORY; g.lineWidth = 0.0032 * px; g.stroke();
    // numeri romani in cima (gli istanti) e cadute 1, 4, 9, 16… accanto ai segni
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    g.fillStyle = IVORY; g.textBaseline = 'top'; g.textAlign = 'center';
    g.font = `italic 500 ${Math.round(0.0125 * px)}px ${SERIF}`;
    for (let i = 1; i < par.x.length; i++) g.fillText(roman[i - 1], X(par.x[i]) - 0.0105 * px, 0.006 * px);
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `italic 500 ${Math.round(0.0105 * px)}px ${SERIF}`;
    for (let i = 1; i < par.x.length; i++) {
      const tx = X(par.x[i]) + 0.006 * px, ty = Y(par.y[i]) + 0.012 * px;
      g.fillText(String(i * i), tx, Math.min(ty, H - 0.012 * px));
    }
  }, { aniso: 16 });
}

/** Regolo d'avorio sul fronte della base: centimetri dal punto d'uscita. */
function rulerTexture(len) {
  const W = 4096, H = 88, px = W / len;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = IVORY; g.fillRect(0, 0, W, H);
    grain(g, W, H, { base: IVORY, dark: '#cbbd98', light: '#fbf4e2', seed: 41, lines: 70, wave: 2 });
    g.fillStyle = '#1d120a';
    const x0 = 0.01 * px;                                   // lo zero è 1 cm dopo l'inizio del regolo
    for (let mm = 0; mm <= (len - 0.012) * 1000; mm++) {
      const x = x0 + (mm / 1000) * px, L = mm % 100 === 0 ? 0.55 : mm % 50 === 0 ? 0.42 : mm % 10 === 0 ? 0.3 : 0.14;
      g.fillRect(x - (mm % 10 === 0 ? 1.1 : 0.6), 0, mm % 10 === 0 ? 2.2 : 1.2, H * L);
    }
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.font = `italic 600 ${Math.round(H * 0.42)}px ${SERIF}`;
    for (let cm = 5; cm <= (len - 0.02) * 100; cm += 5) g.fillText(String(cm), x0 + (cm / 100) * px, H - 3);
    g.fillStyle = '#9b2a1a'; g.fillRect(x0 - 2, 0, 4, H);
  }, { aniso: 16 });
}

function plaqueTexture() {
  return canvasTexture(768, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#d9b45a'); gr.addColorStop(0.5, '#f0d48a'); gr.addColorStop(1, '#b8913c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(60,40,10,0.7)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = 'rgba(48,30,6,0.9)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 600 46px ${SERIF}`; g.fillText('De motu proiectorum', w / 2, h / 2 - 2);
  }, { aniso: 8 });
}

// ───────────────────────────── l'apparato ─────────────────────────────
export class Galileo {
  /** rig: per le palline (geometrie e materiali condivisi). */
  constructor(rig) {
    this.rig = rig;
    this.group = new THREE.Group();
    this.group.name = 'apparato di Galileo';
    this.dragTargets = [];
    this.pinT = 1; this.H = GAL.Hmax; this.r = 0.0127;
    const phys = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32, ...o });
    const walnutMap = woodTex(WALNUT, 1024, 256, { seed: 7 });
    const sideMap = walnutMap.clone(); sideMap.repeat.set(3, 3); sideMap.needsUpdate = true;
    this.M = {
      walnut: phys({ map: walnutMap }),
      walnutSide: phys({ map: sideMap }),
      ebony: phys({ map: woodTex(EBONY, 512, 512, { seed: 13, vertical: true }), roughness: 0.55 }),
      groove: phys({ color: '#3a2214', roughness: 0.62, clearcoat: 0.2 }),
      brass: new THREE.MeshStandardMaterial({ color: '#c9a24c', metalness: 1, roughness: 0.27 }),
      baize: new THREE.MeshStandardMaterial({ color: '#2d5236', roughness: 1, metalness: 0 }),
    };
    this._design();
    this._buildBase();
    this._buildRamp();
    this._buildBoard();
    this._buildCatcher();
    this._buildPin();
    this.setBall('steel', 0.0127);
  }

  _mesh(geo, mat, parent, drag) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    if (drag) { m.userData.drag = drag; this.dragTargets.push(m); }
    (parent || this.group).add(m);
    return m;
  }

  /** La parabola disegnata sulla tavola: pallina d'acciaio lasciata dalla cima, nel vuoto. */
  _design() {
    const sp = ballSpec('steel'), R = rampRun(sp, { g: 9.81, rho: 0 }, GAL.Hmax);
    const h = R.y0 - sp.r - GAL.floor, d = R.v * Math.sqrt((2 * h) / 9.81);
    const x = [], y = [];
    for (let i = 0; i <= 6; i++) { x.push((d * i) / 6); y.push(R.y0 - h * (i / 6) ** 2); }
    this.par = { d, y0: R.y0, drop: h, x, y };
  }

  _buildBase() {
    const M = this.M, B = GAL_BASE, g = this.group;
    const top = GAL.floor, hgt = top - B.y0;
    this._mesh(new RoundedBoxGeometry(B.x1 - B.x0, hgt, B.z1 - B.z0, 3, 0.004).translate((B.x0 + B.x1) / 2, B.y0 + hgt / 2, (B.z0 + B.z1) / 2), M.walnut, g);
    // cornice: listello chiaro sul fronte
    this._mesh(new THREE.BoxGeometry(B.x1 - B.x0 - 0.01, 0.003, 0.002).translate((B.x0 + B.x1) / 2, top - 0.006, B.z1 + 0.0004), new THREE.MeshStandardMaterial({ color: SATIN.light, roughness: 0.5 }), g);
    // regolo d'avorio dall'uscita alla sponda
    const len = GAL.wall1 + 0.012;
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.017), new THREE.MeshStandardMaterial({ map: rulerTexture(len), roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    ruler.position.set(-0.01 + len / 2, B.y0 + hgt * 0.45, B.z1 + 0.0006); ruler.receiveShadow = true;
    g.add(ruler);
    // targhetta d'ottone sotto la rampa
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.025), new THREE.MeshStandardMaterial({ map: plaqueTexture(), metalness: 0.9, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    plq.position.set(-0.2, B.y0 + hgt * 0.45, B.z1 + 0.0006);
    g.add(plq);
    // testate con le viti di livello
    for (const [xa, xb] of [[B.x0 - 0.07, B.x0 + 0.002], [B.x1 - 0.002, B.x1 + 0.07]]) {
      const cx = (xa + xb) / 2;
      this._mesh(new RoundedBoxGeometry(xb - xa, 0.026, 0.12, 2, 0.004).translate(cx, B.y0 + 0.013, -0.005), M.walnut, g);
      for (const z of [-0.04, 0.03]) {
        const sx = xa < B.x0 ? cx - 0.008 : cx + 0.008;
        this._mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.008, 28).translate(sx, B.y0 + 0.03, z), M.brass, g);
        this._mesh(new THREE.SphereGeometry(0.0095, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).translate(sx, B.y0 + 0.034, z), M.brass, g);
        this._mesh(new THREE.CylinderGeometry(0.0034, 0.0034, B.y0 - 0.003, 14).translate(sx, 0.003 + (B.y0 - 0.003) / 2, z), M.brass, g);
        this._mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.004, 28).translate(sx, 0.002, z), M.brass, g);
      }
    }
  }

  _buildRamp() {
    const M = this.M, w = GAL.groove / 2;
    const ext = (pts, z0, z1, mats) => {
      const geo = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 });
      geo.translate(0, 0, z0);
      return this._mesh(geo, mats, this.group);
    };
    // due guance ai lati della scanalatura e il fondo della scanalatura, più basso
    ext(outline(), Z.back, -w, [M.walnut, M.walnutSide]);
    ext(outline(), w, Z.front, [M.walnut, M.walnutSide]);
    ext(outline(GD), -w, w, [M.groove, M.groove]);
    // faccia intarsiata (davanti)
    this.faceMat = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.22, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const face = this._mesh(new THREE.ShapeGeometry(shapeOf(outline()), 1), this.faceMat, this.group);
    face.position.z = Z.front + 0.0003; face.castShadow = false;
    // pomolo tornito in cima
    const knob = new THREE.LatheGeometry([[0, 0], [0.011, 0], [0.011, 0.006], [0.007, 0.01], [0.009, 0.018], [0.006, 0.026], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
    this._mesh(knob.translate(XL + 0.02, TOP, (Z.back + Z.front) / 2), M.walnut);
  }

  /** Scala delle altezze della faccia della rampa, per la pallina corrente. */
  _rampFace() {
    const P = rampPath(this.rho), q = {}, heights = [];
    for (let cm = 1; cm <= Math.round(GAL.Hmax * 100); cm++) { rampAt(P, rampS(P, cm / 100), q); heights.push({ H: cm / 100, ex: q.ex, ey: q.ey, nx: q.nx, ny: q.ny }); }
    if (this.faceMat.map) this.faceMat.map.dispose();
    this.faceMat.map = rampFaceTexture(heights);
    this.faceMat.needsUpdate = true;
  }

  _buildBoard() {
    const M = this.M, BW = GAL.board, BH = GAL.yE - GAL.floor, D = Z.board - Z.back;
    const face = new THREE.MeshPhysicalMaterial({ map: boardTexture(this.par), roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.3 });
    this._mesh(new THREE.BoxGeometry(BW, BH, D).translate(BW / 2, GAL.floor + BH / 2, (Z.back + Z.board) / 2), [M.ebony, M.ebony, M.ebony, M.ebony, face, M.ebony]);
    // spilli d'ottone sulla parabola, alle linee dei tempi uguali
    const { x, y } = this.par;
    for (let i = 1; i < x.length; i++) {
      this._mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.006, 12).rotateX(Math.PI / 2).translate(x[i], y[i], Z.board + 0.003), M.brass);
      this._mesh(new THREE.SphereGeometry(0.0026, 16, 10).translate(x[i], y[i], Z.board + 0.006), M.brass);
    }
  }

  /** In fondo: sponda alta, fondo di panno, bordino davanti. */
  _buildCatcher() {
    const M = this.M, x0 = GAL.board, x1 = GAL.wall1, f = GAL.floor;
    this._mesh(new RoundedBoxGeometry(0.02, 0.18, 0.124, 2, 0.003).translate(x1 + 0.01, f + 0.09, -0.006), M.walnut);
    this._mesh(new THREE.BoxGeometry(x1 - x0, 0.12, Z.board - Z.back).translate((x0 + x1) / 2, f + 0.06, (Z.back + Z.board) / 2), M.ebony);
    this._mesh(new RoundedBoxGeometry(x1 - x0, 0.022, 0.012, 2, 0.003).translate((x0 + x1) / 2, f + 0.011, 0.05), M.walnut);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.072).rotateX(-Math.PI / 2), M.baize);
    cloth.position.set((x0 + x1) / 2, f + 0.0006, 0.008); cloth.receiveShadow = true;
    this.group.add(cloth);
  }

  /** Il fermo: uno spillo d'ottone piantato nella scanalatura, contro cui riposa la pallina. */
  _buildPin() {
    const M = this.M, pin = new THREE.Group();
    this._mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.04, 16).translate(0, 0.012, 0), M.brass, pin, 'release');
    this._mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.007, 24).translate(0, 0.034, 0), M.brass, pin, 'release');
    this._mesh(new THREE.SphereGeometry(0.0065, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1).translate(0, 0.0375, 0), M.brass, pin, 'release');
    // presa invisibile più grande, per afferrarlo con il puntatore
    const grab = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    grab.position.y = 0.02; grab.userData.drag = 'release'; grab.userData.noAO = true; this.dragTargets.push(grab); pin.add(grab);
    this.group.add(pin);
    this.pin = pin;
    this.loaded = this.rig.makeBall('steel', 0.0127);
    this.loaded.userData.drag = 'release'; this.dragTargets.push(this.loaded);
    this.group.add(this.loaded);
  }

  /** Pallina in uso: raggio di rotolamento, scala delle altezze, aspetto della pallina sul fermo. */
  setBall(key, r) {
    const rho = rollRadius(r);
    if (this.key === key && this.rho === rho) return;
    const newRho = this.rho !== rho;
    this.key = key; this.r = r; this.rho = rho;
    this.loaded.geometry = this.rig.ballGeometry(r); this.loaded.material = this.rig.ballMaterial(key);
    if (newRho) this._rampFace();
    this.setRelease(this.H, true);
  }

  /** Partenza H (dislivello del centro fino all'uscita): pallina e fermo. */
  setRelease(H, force) {
    if (!force && H === this.H) return;
    this.H = H;
    const P = rampPath(this.rho), s0 = rampS(P, H), q = rampAt(P, s0, {});
    this.loaded.position.set(q.x, q.y, 0); this.loaded.rotation.set(0, 0, 0);
    this.center = new THREE.Vector3(q.x, q.y, 0);
    // fermo appena a valle, perpendicolare al fondo della scanalatura
    const p = rampAt(P, Math.max(s0 - this.r - 0.0024, 0), {});
    this.pinBase = new THREE.Vector3(p.ex - GD * p.nx, p.ey - GD * p.ny, 0);
    this.pinDir = new THREE.Vector3(p.nx, p.ny, 0);
    this.pin.rotation.set(0, 0, Math.atan2(p.ny, p.nx) - Math.PI / 2);
    this._placePin(0);
  }
  _placePin(lift) { this.pin.position.copy(this.pinBase).addScaledVector(this.pinDir, lift * 0.034); }

  /** Il fermo si alza e lascia andare la pallina, poi torna giù. */
  release() { this.pinT = 0; }
  update(dt) {
    if (this.pinT >= 1) return;
    this.pinT = Math.min(1, this.pinT + dt / 0.85);
    const t = this.pinT * 0.85, lift = t < 0.07 ? t / 0.07 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.25);
    this._placePin(lift);
  }
}
