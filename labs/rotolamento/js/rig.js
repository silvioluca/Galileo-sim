// rig.js — il banco del rotolamento: una tavola larga di legno incernierata su una base (da 0°, in piano, a 40°),
// sostenuta da una traversa su un'asta; cinque corsie con i divisori, un lanciatore a molla in cima a ognuna,
// traguardo con fotocellule, respingente in fondo, righello e goniometro; binari per la ruota; i corpi.
// Coordinate della tavola: origine sulla cerniera (faccia superiore), x lungo la tavola (la cima a x = −L),
// y perpendicolare al piano, z attraverso le corsie. Il centro di un corpo che ha percorso s sta a x = −start + s.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { BODIES, rhoOf } from './rolling.js';

export const HINGE = { x: 0.62, y: 0.062 };
export const BOARD = { L: 1.66, W: 0.6, T: 0.022, start: 1.54, end: 0.05 };
export const S_END = BOARD.start - BOARD.end;               // faccia del respingente (per s)
export const FINISH = 1.3;                                  // traguardo (centri)
export const NL = 5, LW = 0.112;
export const laneZ = (i) => ((NL - 1) / 2 - i) * LW;       // corsia 0 davanti
export const SUPPORT = { dx: -0.8, z: -0.4, top: 1.25 };
export const RAIL_H = 0.066;                                // binari della ruota: faccia superiore sopra la tavola
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
const xs = (s) => -BOARD.start + s;

/** Quota del centro sopra la tavola. */
export function centerH(key) { const B = BODIES[key]; return key === 'wheel' ? RAIL_H + B.rho : key === 'slider' ? 0.017 : B.R; }
/** Dove si disegna il punto a distanza rp dall'asse: [distanza dall'asse, profondità z] sulla faccia davanti
 *  (sulle sfere: sulla superficie, appena fuori lungo la normale). */
export function dotLocal(key, rp) {
  const B = BODIES[key];
  if (key === 'slider') return [0, (B.w || 0.05) / 2 + 0.0012];
  if (key === 'sphere' || key === 'hsphere') { const z = Math.sqrt(Math.max(0, B.R * B.R - rp * rp)), k = 1 + 0.0014 / B.R; return [rp * k, z * k]; }
  if (key === 'wheel') return [rp, rp < B.rho + 0.0005 ? B.wa / 2 + 0.0012 : rp < 0.0145 ? B.wd / 2 + 0.0032 : B.wd / 2 + 0.0012];
  return [rp, B.w / 2 + 0.0012];
}

// ───────────────────────────── trame ─────────────────────────────
function woodTexture(base = '#dcbc8c', dark = 'rgba(120, 78, 36,') {
  return canvasTexture(1024, 512, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) {
      const y = Math.random() * H, a = 0.05 + Math.random() * 0.15;
      g.strokeStyle = `${dark} ${a})`; g.lineWidth = 0.6 + Math.random() * 2.4;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + 4 * Math.sin(x / 140 + i) + 2 * Math.sin(x / 31 + i * 3));
      g.stroke();
    }
  }, { repeat: true, aniso: 16 });
}
function rulerTexture(cm) {
  const W = 4096, H = 96, px = (W - 40) / cm;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#eceae3'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#15181c'; g.textBaseline = 'top'; g.textAlign = 'center';
    for (let i = 0; i <= cm * 2; i++) {
      const x = 20 + (i / 2) * px, big = i % 20 === 0, mid = i % 10 === 0, c = i % 2 === 0;
      g.fillRect(x - 1.5, 0, 3, big ? 46 : mid ? 34 : c ? 24 : 14);
      if (big) { g.font = `700 34px ${FONT}`; g.fillText(String(i / 2), x, 50); }
    }
  }, { aniso: 16 });
}
function protractorTexture() {
  const S = 1024, c = S / 2, R = S / 2 - 6;
  return canvasTexture(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(240, 244, 246, 0.42)';
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, Math.PI, Math.PI * 1.5); g.closePath(); g.fill();
    g.strokeStyle = '#1b1f25'; g.fillStyle = '#1b1f25';
    for (let d = 0; d <= 90; d++) {
      const a = (d * Math.PI) / 180, L = d % 10 === 0 ? 70 : d % 5 === 0 ? 48 : 30, ca = Math.cos(a), sa = Math.sin(a);
      g.lineWidth = d % 10 === 0 ? 4 : 2.4;
      g.beginPath(); g.moveTo(c - ca * R, c - sa * R); g.lineTo(c - ca * (R - L), c - sa * (R - L)); g.stroke();
      if (d % 10 === 0 && d > 0 && d < 90) { g.save(); g.translate(c - ca * (R - 102), c - sa * (R - 102)); g.rotate(-a + Math.PI / 2); g.font = `700 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${d}°`, 0, 0); g.restore(); }
    }
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, R, Math.PI, Math.PI * 1.5); g.stroke();
  }, { aniso: 16 });
}
function stripeTexture(base, stripe) {
  return canvasTexture(256, 128, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.fillStyle = stripe; g.fillRect(0, H / 2 - 6, W, 12); g.fillRect(W / 4 - 6, 0, 12, H); g.fillRect((3 * W) / 4 - 6, 0, 12, H);
  });
}
function finishTexture() {
  return canvasTexture(64, 512, (g, W, H) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#15181c' : '#f4f2ec'; g.fillRect(x * 32, y * 32, 32, 32); }
  });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'rotolamento';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      alu: std({ color: '#c9cdd2', metalness: 1, roughness: 0.32 }),
      black: std({ color: '#141518', metalness: 0.3, roughness: 0.5 }),
      rubber: std({ color: '#1b1c1e', metalness: 0, roughness: 0.92 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      steel: std({ color: '#d3d6da', metalness: 1, roughness: 0.2 }),
      brass: std({ color: '#d6b160', metalness: 1, roughness: 0.22 }),
      red: std({ color: '#d4301f', metalness: 0, roughness: 0.4 }),
      plastic: std({ color: '#eceae5', metalness: 0, roughness: 0.5 }),
      wood: std({ map: woodTexture(), roughness: 0.62 }),
      baseWood: std({ map: woodTexture('#8a5c34', 'rgba(52, 30, 12,'), roughness: 0.7 }),
    };
    this._buildBase();
    this.board = new THREE.Group(); this.board.position.set(HINGE.x, HINGE.y, 0); this.group.add(this.board);
    this._buildBoard();
    this._buildSupport();
    this._buildTimer();
    this.lanes = Array.from({ length: NL }, (_, i) => this._buildLane(i));
    this.angle = 0;
  }
  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── base, cerniera, goniometro, sostegno ─────────────────────────────
  _buildBase() {
    const M = this.M, x0 = HINGE.x - BOARD.L - 0.08, x1 = HINGE.x + 0.1;
    this._mesh(new RoundedBoxGeometry(x1 - x0, 0.03, BOARD.W + 0.12, 3, 0.006).translate((x0 + x1) / 2, 0.015, 0), M.baseWood);
    for (const z of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.05, HINGE.y - 0.018, 0.008, 2, 0.002).translate(HINGE.x, 0.03 + (HINGE.y - 0.03) / 2, z * (BOARD.W / 2 + 0.009)), M.alu);
    this._mesh(cyl(0.007, 0.007, BOARD.W + 0.04, 20).rotateX(Math.PI / 2).translate(HINGE.x, HINGE.y - BOARD.T / 2, 0), M.chrome);
    const q = new THREE.Mesh(new THREE.CircleGeometry(0.2, 96, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ map: protractorTexture(), transparent: true, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    q.position.set(HINGE.x, HINGE.y, -(BOARD.W / 2 + 0.012)); q.renderOrder = 5; q.userData.noAO = true;
    this.group.add(q);
    this._mesh(new THREE.BoxGeometry(0.03, HINGE.y - 0.03, 0.006).translate(HINGE.x - 0.015, 0.03 + (HINGE.y - 0.03) / 2, -(BOARD.W / 2 + 0.012)), M.alu);
  }
  _buildSupport() {
    const M = this.M, x = HINGE.x + SUPPORT.dx, z = SUPPORT.z;
    this._mesh(new RoundedBoxGeometry(0.22, 0.024, 0.18, 3, 0.007).translate(x - 0.05, 0.012, z - 0.03), M.iron);
    this._mesh(cyl(0.0095, 0.0095, SUPPORT.top - 0.024, 24).translate(x, (SUPPORT.top + 0.024) / 2, z), M.chrome);
    this._mesh(cyl(0.012, 0.012, 0.012, 24).translate(x, SUPPORT.top + 0.006, z), M.black);
    const g = new THREE.Group(); this.group.add(g); this.support = g;
    this._mesh(new RoundedBoxGeometry(0.034, 0.034, 0.034, 2, 0.004).translate(x, 0, z), M.boss, g);
    this._mesh(cyl(0.0045, 0.0045, 0.022, 12).rotateZ(Math.PI / 2).translate(x - 0.028, 0, z), M.chrome, g);
    this._mesh(cyl(0.009, 0.009, 0.006, 20).rotateZ(Math.PI / 2).translate(x - 0.042, 0, z), M.black, g);
    const len = -z + BOARD.W / 2 + 0.05;
    this._mesh(cyl(0.008, 0.008, len, 20).rotateX(Math.PI / 2).translate(x, 0, z + len / 2), M.chrome, g);
    this._mesh(cyl(0.011, 0.011, 0.014, 20).rotateX(Math.PI / 2).translate(x, 0, z + len), M.black, g);
  }

  // ───────────────────────────── tavola ─────────────────────────────
  _buildBoard() {
    const M = this.M, b = this.board, { L, W, T } = BOARD;
    const wood = M.wood.clone(); wood.map = M.wood.map.clone(); wood.map.repeat.set(1.6, 0.6); wood.map.needsUpdate = true;
    this._mesh(new RoundedBoxGeometry(L, T, W, 2, 0.003).translate(-L / 2, -T / 2, 0), wood, b);
    for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(L, 0.016, 0.005).translate(-L / 2, 0.006, s * (W / 2 + 0.0025)), M.alu, b);
    // divisori fra le corsie
    for (let i = 0; i < NL - 1; i++) this._mesh(new THREE.BoxGeometry(BOARD.start - BOARD.end + 0.06, 0.007, 0.003).translate(-(BOARD.start + BOARD.end + 0.06) / 2 + 0.03, 0.0035, (laneZ(i) + laneZ(i + 1)) / 2), M.alu, b);
    this._mesh(new THREE.BoxGeometry(0.22, 0.0025, 0.0015).translate(-0.11, 0.0005, -(W / 2 + 0.0055)), M.red, b);
    // righello sul bordo davanti: 0 alla linea di partenza (centri)
    const cm = Math.round((BOARD.start - BOARD.end) * 100), Wp = ((cm / 100) * 4096) / (4096 - 40);
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(Wp, 0.014), new THREE.MeshStandardMaterial({ map: rulerTexture(cm), roughness: 0.6 }));
    ruler.position.set(xs(0) - (20 / 4096) * Wp + Wp / 2, 0.006, W / 2 + 0.0052); ruler.receiveShadow = true; b.add(ruler);
    // respingente in fondo
    this._mesh(new RoundedBoxGeometry(0.02, 0.09, W - 0.01, 2, 0.004).translate(-BOARD.end + 0.01, 0.045, 0), M.rubber, b);
    this._mesh(new THREE.BoxGeometry(0.006, 0.096, W).translate(-BOARD.end + 0.023, 0.048, 0), M.alu, b);
    // traguardo: striscia a scacchi e portale delle fotocellule
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.024, W - 0.01).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: finishTexture(), roughness: 0.6 }));
    fin.position.set(xs(FINISH), 0.0006, 0); fin.receiveShadow = true; b.add(fin);
    const gate = new THREE.Group(); gate.position.x = xs(FINISH); b.add(gate);
    for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(0.012, 0.17, 0.012).translate(0, 0.08, s * (W / 2 + 0.014)), M.black, gate);
    this._mesh(new THREE.BoxGeometry(0.012, 0.012, W + 0.04).translate(0, 0.168, 0), M.black, gate);
    // fotocellule: emettitore e ricevitore sui divisori di ogni corsia
    for (let i = 0; i < NL; i++) for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(0.005, 0.056, 0.003).translate(0, 0.028, laneZ(i) + s * (LW / 2 - 0.003)), M.black, gate);
    this.beams = Array.from({ length: NL }, (_, i) => {
      const m = new THREE.Mesh(cyl(0.0007, 0.0007, LW - 0.008, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.75, toneMapped: false }));
      m.position.set(0, 0.022, laneZ(i)); m.userData.noAO = true; m.userData.noOutline = true; gate.add(m);
      return m;
    });
    this.finishGate = gate;
  }
  setAngle(a) {
    this.angle = a;
    this.board.rotation.z = -a;
    const T = BOARD.T, xl = (SUPPORT.dx + T * Math.sin(a)) / Math.cos(a), yw = -xl * Math.sin(a) - T * Math.cos(a);
    this.support.position.y = HINGE.y + yw - 0.008;
    this.board.updateMatrixWorld(true);
  }

  // ───────────────────────────── cronometro ─────────────────────────────
  _buildTimer() {
    const g = new THREE.Group(); g.position.set(HINGE.x + 0.14, 0, BOARD.W / 2 + 0.16); g.rotation.y = -0.35; this.group.add(g);
    this._mesh(new RoundedBoxGeometry(0.15, 0.06, 0.09, 3, 0.008).translate(0, 0.03, 0), this.M.plastic, g);
    this._mesh(new RoundedBoxGeometry(0.13, 0.034, 0.006, 2, 0.003).translate(0, 0.034, 0.045), this.M.black, g);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    this.timerCtx = c.getContext('2d');
    this.timerTex = new THREE.CanvasTexture(c); this.timerTex.colorSpace = THREE.SRGBColorSpace; this.timerTex.anisotropy = 8;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.0288), new THREE.MeshBasicMaterial({ map: this.timerTex, toneMapped: false }));
    d.position.set(0, 0.034, 0.0485); g.add(d);
    this.timerG = g; this.timerText = '';
  }
  setTimer(text) {
    if (text === this.timerText) return;
    this.timerText = text;
    const g = this.timerCtx;
    g.fillStyle = '#140707'; g.fillRect(0, 0, 512, 128);
    g.font = `700 96px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255, 60, 40, 0.08)'; g.fillText('88,888', 440, 68);
    g.fillStyle = '#ff4a2e'; g.fillText(text, 440, 68);
    g.font = `700 40px ${MONO}`; g.textAlign = 'left'; g.fillText('s', 452, 86);
    this.timerTex.needsUpdate = true;
  }

  // ───────────────────────────── corsie: lanciatore, binari, corpo, punto, traiettoria ─────────────────────────────
  _buildLane(i) {
    const M = this.M, z = laneZ(i), b = this.board;
    const lane = { i, z, key: '' };
    // lanciatore a molla: blocco con il pistone, la faccia appoggiata dietro il corpo
    const lg = new THREE.Group(); lg.position.z = z; b.add(lg); lane.launcher = lg;
    this._mesh(new RoundedBoxGeometry(0.05, 0.032, 0.05, 2, 0.004).translate(-0.025, 0.016, 0), M.boss, lg);
    lane.post = this._mesh(cyl(0.004, 0.004, 1, 12).translate(0, 0.5, 0), M.chrome, lg);
    lane.piston = new THREE.Group(); lg.add(lane.piston);
    this._mesh(cyl(0.004, 0.004, 0.03, 12).rotateZ(Math.PI / 2).translate(-0.015, 0, 0), M.chrome, lane.piston);
    this._mesh(cyl(0.011, 0.011, 0.006, 24).rotateZ(Math.PI / 2).translate(-0.003, 0, 0), M.red, lane.piston);
    // binari per la ruota, su colonnine
    const rails = new THREE.Group(); rails.position.z = z; rails.visible = false; b.add(rails); lane.rails = rails;
    const x0 = -BOARD.start - 0.08, x1 = -BOARD.end - 0.004;
    for (const s of [-1, 1]) {
      this._mesh(new THREE.BoxGeometry(x1 - x0, 0.006, 0.008).translate((x0 + x1) / 2, RAIL_H - 0.003, s * 0.034), M.alu, rails);
      for (let x = x0 + 0.04; x < x1; x += 0.32) this._mesh(cyl(0.004, 0.005, RAIL_H - 0.006, 10).translate(x, (RAIL_H - 0.006) / 2, s * 0.034), M.chrome, rails);
    }
    // il corpo: gruppo nel centro, con la parte che gira (e il punto colorato)
    const g = new THREE.Group(); g.position.z = z; b.add(g); lane.g = g;
    lane.spin = new THREE.Group(); g.add(lane.spin);
    lane.dot = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    lane.dot.userData.noOutline = true;
    // traiettoria del punto (nel mondo)
    lane.trail = new SegBuffer(6000);
    lane.trailMat = new LineMaterial({ color: 0xffffff, linewidth: 2.2, transparent: true, opacity: 0.95, depthWrite: false });
    const line = new LineSegments2(lane.trail.geometry(), lane.trailMat);
    line.frustumCulled = false; line.userData.noAO = true; line.userData.noOutline = true; line.renderOrder = 6; b.add(line); lane.trailLine = line;
    lane.white = new THREE.Color('#ffffff');
    // fermo a scomparsa davanti al corpo: un piolo che rientra nella tavola al via
    lane.pin = new THREE.Group(); lane.pin.position.z = z; b.add(lane.pin);
    lane.pinRod = this._mesh(cyl(0.003, 0.003, 1, 16).translate(0, -0.5, 0), M.chrome, lane.pin);
    this._mesh(cyl(0.006, 0.006, 0.0012, 24).translate(0, 0.0002, 0), M.black, lane.pin);
    return lane;
  }
  _bodyMesh(key, S) {
    const M = this.M, B = BODIES[key], own = (m) => { m.userData.own = true; return m; };
    if (key === 'sphere') own(this._mesh(new THREE.SphereGeometry(B.R, 48, 32), new THREE.MeshPhysicalMaterial({ map: stripeTexture('#cfd3d8', '#c8321f'), metalness: 0.9, roughness: 0.18 }), S));
    else if (key === 'hsphere') own(this._mesh(new THREE.SphereGeometry(B.R, 48, 32), new THREE.MeshPhysicalMaterial({ map: stripeTexture('#f28a2a', '#fbf4ea'), metalness: 0, roughness: 0.35, clearcoat: 0.6 }), S));
    else if (key === 'cyl') {
      this._mesh(cyl(B.R, B.R, B.w, 56).rotateX(Math.PI / 2), M.alu, S);
      for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(0.0035, B.R * 0.96, 0.0008).translate(0, B.R * 0.48, s * (B.w / 2 + 0.0004)), M.red, S);
      this._mesh(new THREE.BoxGeometry(0.0035, 0.0012, B.w + 0.0004).translate(0, B.R - 0.0004, 0), M.red, S);
    } else if (key === 'ring') {
      const prof = [[B.ri, -B.w / 2], [B.R, -B.w / 2], [B.R, B.w / 2], [B.ri, B.w / 2], [B.ri, -B.w / 2]].map(([a, c]) => new THREE.Vector2(a, c));
      own(this._mesh(new THREE.LatheGeometry(prof, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d6b160', metalness: 1, roughness: 0.24, side: THREE.DoubleSide }), S));
      this._mesh(new THREE.BoxGeometry(0.0035, 0.0012, B.w + 0.0004).translate(0, B.R - 0.0004, 0), M.red, S);
      // una razza sottile sul davanti, che porta il punto anche dentro il foro
      this._mesh(new THREE.BoxGeometry(0.0026, 2 * B.ri + 0.001, 0.0016).translate(0, 0, B.w / 2 - 0.0008), M.brass, S);
      this._mesh(cyl(0.0032, 0.0032, 0.0018, 20).rotateX(Math.PI / 2).translate(0, 0, B.w / 2 - 0.0008), M.brass, S);
    } else if (key === 'wheel') {
      own(this._mesh(cyl(B.R, B.R, B.wd, 96).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c3c8ce', metalness: 1, roughness: 0.36 }), S));
      this._mesh(cyl(0.014, 0.014, B.wd + 0.004, 32).rotateX(Math.PI / 2), M.black, S);
      this._mesh(cyl(B.rho, B.rho, B.wa, 24).rotateX(Math.PI / 2), M.steel, S);
      for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(0.004, B.R * 0.95, 0.0008).translate(0, B.R * 0.475, s * (B.wd / 2 + 0.0004)), M.red, S);
    } else {
      // pattino: un blocchetto su due slitte lucide, non gira
      own(this._mesh(new RoundedBoxGeometry(0.044, 0.026, 0.05, 2, 0.004).translate(0, 0.001, 0), new THREE.MeshStandardMaterial({ color: '#2f8f87', roughness: 0.4 }), S));
      for (const s of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.046, 0.005, 0.006, 2, 0.002).translate(0, -0.0135, s * 0.018), M.chrome, S);
    }
  }
  /** Mette il corpo key nella corsia i (null: corsia vuota), con il colore della corsia per il punto e la traiettoria. */
  setLane(i, key, color) {
    const L = this.lanes[i];
    const used = !!key;
    L.g.visible = used; L.launcher.visible = used; L.trailLine.visible = used; L.pin.visible = used;
    L.rails.visible = key === 'wheel';
    if (!used) { L.key = ''; return; }
    L.dot.material.color.set(color); L.trailMat.color.set(color);
    if (L.key === key) return;
    L.key = key;
    for (const c of [...L.spin.children]) { L.spin.remove(c); if (c === L.dot) continue; c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.own) { o.material.map?.dispose(); o.material.dispose(); } }); }
    this._bodyMesh(key, L.spin);
    L.spin.add(L.dot);
    // lanciatore all'altezza del centro, con la faccia subito dietro il corpo
    const hC = centerH(key), B = BODIES[key];
    L.launcher.position.x = xs(-B.R - 0.0015);
    L.post.scale.y = Math.max(hC - 0.016, 0.001); L.post.position.set(-0.025, 0, 0); L.post.visible = hC > 0.035;
    L.piston.position.set(0, hC, 0);
    L.launcher.children[0].position.y = hC > 0.035 ? hC - 0.016 : 0;
    this.beams[i].position.y = Math.min(hC, 0.05);
    // il piolo tocca il corpo davanti, alla sua sommità
    const H = key === 'wheel' ? 0.03 : 0.012, R = key === 'slider' ? 0.022 : B.R;
    const xc = key === 'slider' ? R : H < hC ? Math.sqrt(Math.max(0, R * R - (hC - H) ** 2)) : R;
    L.pin.position.x = xs(xc + 0.0032); L.pinH = H; L.pinRod.scale.y = H; this.setPin(i, 1);
  }
  /** Piolo d'arresto: 1 alzato, 0 rientrato nella tavola. */
  setPin(i, k) { const L = this.lanes[i]; L.pinRod.position.y = L.pinH * k; L.pinRod.visible = k > 0.02; }
  /** Corpo nella corsia i: centro a s, rotazione phi, punto a distanza rp dall'asse sulla faccia davanti. */
  place(i, key, s, phi, rp, showDot) {
    const L = this.lanes[i];
    L.g.position.set(xs(s), centerH(key), L.z);
    L.spin.rotation.z = key === 'slider' ? 0 : -phi;
    L.dot.visible = showDot;
    const [r, z] = dotLocal(key, rp);
    L.dot.position.set(0, -r, z);
  }
  /** Pistone del lanciatore: 0 a riposo, 1 tutto fuori. */
  setPiston(i, k) { this.lanes[i].piston.position.x = 0.018 * k; }
  /** Traiettoria: azzera o aggiunge un tratto (punti nelle coordinate della tavola: s, quota, z). */
  trailReset(i) { const L = this.lanes[i]; L.trail.reset(); L.trail.commit(); L.last = null; L.sent = 0; }
  trailAdd(i, p) {
    const L = this.lanes[i];
    const x = xs(p.x);
    if (L.last) { L.trail.push(L.last.x, L.last.y, L.last.z, x, p.y, p.z, L.white, 0, 0); }
    L.last = (L.last || new THREE.Vector3()).set(x, p.y, p.z);
  }
  trailCommit(i) { const L = this.lanes[i]; L.trail.commitFrom(L.sent || 0); L.sent = L.trail.n; }
  /** Punto della tavola nel mondo. */
  world(s, y, z, out = new THREE.Vector3()) { return this.board.localToWorld(out.set(xs(s), y, z)); }
}
