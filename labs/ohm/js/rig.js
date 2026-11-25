// rig.js — il banco di misura in 3D, appoggiato sul pavimento: l'alimentatore da laboratorio con i suoi display,
// due multimetri sul loro cavalletto (amperometro e voltmetro), davanti la basetta con il componente fra due morsetti
// (resistore a fasce colorate, lampadina nel portalampada, LED) oppure il banco della seconda legge con sei fili tesi
// e la pinza; i cavi con le spine a banana nei morsetti fissi e le pinze a coccodrillo sui componenti liberi e su ciò che
// scorre, i puntini della corrente che scorre, il fumo dei componenti che scaldano troppo.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { COMPONENTS, MATERIALS, WIRES } from './circuit.js';

const MONO = '"Geist Mono Variable", Consolas, monospace';
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const std = (o) => new THREE.MeshStandardMaterial(o);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const BAND = { black: '#1a1a1a', brown: '#6b3a1e', red: '#c4251c', orange: '#e2741d', yellow: '#e8c21c', green: '#2f8a3a', blue: '#2756b8', violet: '#7a3fb5', grey: '#8a8a8a', white: '#f2f2f2', gold: '#c9a24a' };
// il banco della seconda legge: lo zero del metro in x0, il metro in x1
export const BOARD = { x0: -0.45, x1: 0.55, z0: -0.31, dz: 0.042, y: 0.0305 };
export const wireZ = (i) => BOARD.z0 + i * BOARD.dz;
const BX0 = BOARD.x0 - 0.27, BX1 = BOARD.x1 + 0.07, BZ0 = wireZ(0) - 0.045, BZ1 = wireZ(WIRES.length - 1) + 0.06;
// il filo singolo teso fra due isolatori su asta: altezza del filo e centri degli isolatori (il filo parte da x0)
export const YW = 0.16;
const RODS = { xL: BOARD.x0 - 0.0084, xR: BOARD.x1 + 0.025 };
// dove stanno gli strumenti con ciascun apparato: [x, z, rotazione]
const LAYOUT = {
  base: { supply: [-0.43, -0.12, 0.28], amm: [-0.1, -0.17, 0.1], volt: [0.27, -0.17, -0.1], at: [0.07, 0.1, 0] },
  rods: { supply: [-0.72, -0.32, 0.3], amm: [-0.14, -0.34, 0.06], volt: [0.3, -0.34, -0.06], at: [0, 0.12, 0] },
  board: { supply: [-0.93, -0.2, 0.42], amm: [-0.36, -0.56, 0.06], volt: [0.12, -0.56, -0.05], at: null },
};
const METER_TILT = -1.05, METER_Y = 0.068;

/** Colore (lineare) di un corpo nero alla temperatura T, normalizzato al canale più forte. */
export function blackbody(T) {
  const t = T / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305.0;
  return [r, g, b].map((v) => (Math.max(0, Math.min(255, v)) / 255) ** 2.2);
}

export class Rig {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'leggi di Ohm';
    this.M = {
      black: std({ color: '#17181b', metalness: 0.2, roughness: 0.5 }),
      panel: std({ color: '#d9dbdf', metalness: 0.15, roughness: 0.5 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      brass: std({ color: '#c9a24f', metalness: 1, roughness: 0.3 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      redCable: std({ color: '#c0281d', metalness: 0, roughness: 0.55 }),
      blackCable: std({ color: '#1b1c1e', metalness: 0, roughness: 0.55 }),
      wood: std({ color: '#c49565', metalness: 0, roughness: 0.62 }),
      holster: std({ color: '#f0b429', metalness: 0, roughness: 0.7 }),
      meterBody: std({ color: '#2b2e33', metalness: 0.1, roughness: 0.5 }),
      white: std({ color: '#f2f2ef', metalness: 0, roughness: 0.5 }),
      bakelite: std({ color: '#1d1b1a', metalness: 0, roughness: 0.32 }),
      nickel: std({ color: '#cfd2d6', metalness: 1, roughness: 0.26 }),
      lead: std({ color: '#8e9298', metalness: 1, roughness: 0.35 }),
      stand: std({ color: '#2f3f5c', metalness: 0.35, roughness: 0.45 }),
      porcelain: new THREE.MeshPhysicalMaterial({ color: '#f3f0e8', metalness: 0, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    };
    this._buildHalo();
    this._buildSupply();
    this.amm = this._buildMeter('A');
    this.volt = this._buildMeter('V');
    this._buildBase();
    this._buildBoard();
    this._buildRods();
    this.cables = new THREE.Group(); this.group.add(this.cables);
    this._buildDots();
    this._buildSmoke();
  }
  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m); return m;
  }
  /** Un'asticciola fra due punti (coordinate del gruppo parent). */
  _bar(a, b, r, mat, parent) {
    const d = b.clone().sub(a), m = this._mesh(cyl(r, r, d.length(), 10), mat, parent);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return m;
  }

  // ───────────────────────────── alimentatore ─────────────────────────────
  _buildSupply() {
    const g = this.supply = new THREE.Group(); this.group.add(g);
    const W = 0.24, H = 0.11, D = 0.2;
    this._mesh(new RoundedBoxGeometry(W, H, D, 3, 0.008).translate(0, H / 2 + 0.008, 0), this.M.panel, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this._mesh(cyl(0.008, 0.009, 0.008, 16).translate(sx * (W / 2 - 0.02), 0.004, sz * (D / 2 - 0.02)), this.M.black, g);
    // le feritoie sul coperchio
    const vent = std({ color: '#9ca1a8', metalness: 0.1, roughness: 0.6 });
    for (let i = 0; i < 6; i++) this._mesh(new THREE.BoxGeometry(0.1, 0.0008, 0.0035).translate(-0.04, H + 0.0082, -0.05 + i * 0.012), vent, g, false);
    this.supCanvas = document.createElement('canvas'); this.supCanvas.width = 1024; this.supCanvas.height = 470;
    this.supTex = new THREE.CanvasTexture(this.supCanvas); this.supTex.colorSpace = THREE.SRGBColorSpace; this.supTex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.008, H - 0.004), new THREE.MeshStandardMaterial({ map: this.supTex, emissive: '#ffffff', emissiveMap: this.supTex, emissiveIntensity: 0.3, roughness: 0.5 }));
    face.position.set(0, H / 2 + 0.008, D / 2 + 0.0006); face.receiveShadow = true; g.add(face);
    // manopole (tensione, corrente) e morsetti
    this.knobV = this._mesh(cyl(0.011, 0.012, 0.014, 32).rotateX(Math.PI / 2), this.M.black, g); this.knobV.position.set(0.03, 0.045, D / 2 + 0.007);
    this.knobI = this._mesh(cyl(0.009, 0.01, 0.012, 32).rotateX(Math.PI / 2), this.M.black, g); this.knobI.position.set(0.064, 0.045, D / 2 + 0.006);
    for (const k of [this.knobV, this.knobI]) this._mesh(new THREE.BoxGeometry(0.0016, 0.007, 0.002).translate(0, 0.005, 0.0075), this.M.white, k, false);
    this.supTerm = {};
    for (const [id, x, mat] of [['plus', 0.088, this.M.red], ['minus', 0.108, this.M.black]]) {
      this._mesh(cyl(0.0055, 0.0055, 0.012, 20).rotateX(Math.PI / 2).translate(x, 0.03, D / 2 + 0.006), mat, g);
      this.supTerm[id] = { p: V3(x, 0.03, D / 2 + 0.012), d: V3(0, 0, 1) };
    }
  }
  /** Il pannello dell'alimentatore: tensione e corrente in uscita, CV/CC, acceso o no. */
  drawSupply({ V, I, on, cc, Vset, Ilim }) {
    const key = `${V.toFixed(2)}|${I.toFixed(3)}|${on}|${cc}|${Vset.toFixed(2)}|${Ilim.toFixed(3)}`;
    if (key === this._supKey) return;
    this._supKey = key;
    const c = this.supCanvas.getContext('2d'), W = 1024;
    c.fillStyle = '#cfd2d6'; c.fillRect(0, 0, W, 470);
    const disp = (x, y, w, h, txt, unit, col) => {
      c.fillStyle = '#120f0e'; c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill();
      c.font = `600 ${h * 0.62}px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillStyle = on ? col : 'rgba(110,40,30,0.5)'; c.shadowColor = on ? col : 'transparent'; c.shadowBlur = on ? 16 : 0;
      c.fillText(on ? txt : '- - - -', x + w - 70, y + h / 2 + 4); c.shadowBlur = 0;
      c.font = `600 ${h * 0.3}px ${MONO}`; c.textAlign = 'left'; c.fillText(unit, x + w - 58, y + h / 2 + 6);
    };
    disp(40, 46, 420, 150, Math.abs(V).toFixed(2), 'V', '#ff4632');
    disp(500, 46, 440, 150, Math.abs(I).toFixed(3), 'A', '#46ff82');
    c.textBaseline = 'alphabetic';
    for (const [label, x, lit, col] of [['CV', 60, on && !cc, '#3bff7a'], ['CC', 190, on && cc, '#ff3b2b']]) {
      c.fillStyle = lit ? col : '#80858c'; c.beginPath(); c.arc(x, 252, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3a3f46'; c.font = `600 28px ${MONO}`; c.textAlign = 'left'; c.fillText(label, x + 24, 262);
    }
    c.fillStyle = '#3a3f46'; c.font = `700 30px ${FONT}`; c.textAlign = 'left';
    c.fillText('ALIMENTATORE  0–12 V  1 A', 40, 350);
    c.font = `500 25px ${MONO}`; c.fillStyle = '#5b626c';
    c.fillText(`impostati ${Vset.toFixed(2)} V  ${Ilim.toFixed(3)} A`, 40, 405);
    c.textAlign = 'center'; c.font = `600 22px ${MONO}`; c.fillStyle = '#3a3f46';
    c.fillText('TENSIONE', 644, 400); c.fillText('CORRENTE', 795, 400);
    c.font = `700 40px ${MONO}`; c.fillStyle = '#c62a1e'; c.fillText('+', 900, 335); c.fillStyle = '#17181b'; c.fillText('−', 988, 335);
    c.fillStyle = on ? '#ff4b2e' : '#7a4a42'; c.beginPath(); c.arc(960, 252, 12, 0, Math.PI * 2); c.fill();
    this.supTex.needsUpdate = true;
    this.knobV.rotation.z = 2.3 - (Vset / 12) * 4.6; this.knobI.rotation.z = 2.3 - Ilim * 4.6;
  }

  // ───────────────────────────── multimetri ─────────────────────────────
  _buildMeter(kind) {
    const g = new THREE.Group(); this.group.add(g);
    const inner = new THREE.Group(); inner.rotation.x = METER_TILT; inner.position.y = METER_Y; g.add(inner);   // appoggiato, inclinato
    const W = 0.09, H = 0.18, D = 0.036;
    this._mesh(new RoundedBoxGeometry(W + 0.012, H + 0.012, D + 0.008, 4, 0.012), this.M.holster, inner);
    this._mesh(new RoundedBoxGeometry(W, H, D + 0.01, 3, 0.006), this.M.meterBody, inner);
    // il cavalletto dietro
    for (const sx of [-1, 1]) this._bar(V3(sx * 0.03, 0.074, -0.054), V3(sx * 0.03, 0.002, -0.098), 0.0016, this.M.chrome, g);
    this._bar(V3(-0.03, 0.002, -0.098), V3(0.03, 0.002, -0.098), 0.0016, this.M.chrome, g);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1024;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.006, H - 0.006), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
    face.position.z = D / 2 + 0.0055; face.receiveShadow = true; inner.add(face);
    const knob = this._mesh(cyl(0.017, 0.018, 0.01, 32).rotateX(Math.PI / 2), this.M.black, inner); knob.position.set(0, -0.012, D / 2 + 0.01);
    this._mesh(new THREE.BoxGeometry(0.004, 0.026, 0.004).translate(0, 0.006, 0.006), this.M.panel, knob, false);
    knob.rotation.z = kind === 'A' ? -1.2 : 1.2;
    // boccole: quella di misura (rossa) e COM (nera)
    const jacks = {};
    for (const [id, x, mat] of [['in', -0.022, this.M.red], ['com', 0.022, this.M.black]]) {
      this._mesh(cyl(0.0052, 0.0052, 0.008, 20).rotateX(Math.PI / 2).translate(x, -0.068, D / 2 + 0.007), mat, inner);
      jacks[id] = { p: V3(x, -0.068, D / 2 + 0.012), d: V3(0, 0, 1) };
    }
    const m = { g, inner, cv, tex, jacks, kind, last: '' };
    this.drawMeter(m, { txt: '0.0', unit: kind === 'A' ? 'mA' : 'V', range: '' });
    return m;
  }
  /** Il display del multimetro: testo principale, unità, portata. */
  drawMeter(m, { txt, unit, range }) {
    const key = `${txt}|${unit}|${range}`;
    if (key === m.last) return;
    m.last = key;
    const c = m.cv.getContext('2d'), W = 512;
    c.fillStyle = '#2b2e33'; c.fillRect(0, 0, W, 1024);
    c.fillStyle = '#a3ab93'; c.beginPath(); c.roundRect(36, 46, W - 72, 300, 20); c.fill();
    c.fillStyle = '#1b1f18'; c.font = `600 140px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle';
    // cifre strette come quelle a sette segmenti, se non ci stanno
    const tw = c.measureText(txt).width, sx = Math.min(1, 300 / tw);
    c.save(); c.translate(W - 128, 214); c.scale(sx, 1); c.fillText(txt, 0, 0); c.restore();
    c.font = `600 52px ${MONO}`; c.textAlign = 'left'; c.fillText(unit, W - 120, 232);
    c.font = `500 32px ${MONO}`; c.fillText('DC  AUTO', 66, 92);
    c.textAlign = 'right'; c.fillText(range, W - 66, 92);
    c.textBaseline = 'alphabetic';
    c.font = `700 44px ${FONT}`; c.textAlign = 'center'; c.fillStyle = m.kind === 'A' ? '#ffb347' : '#7fc8ff';
    c.fillText(m.kind === 'A' ? 'AMPEROMETRO' : 'VOLTMETRO', W / 2, 410);
    // la ghiera
    c.fillStyle = '#d6d8dc'; c.font = `600 38px ${FONT}`;
    for (const [t, a] of [['OFF', -2.2], ['V⎓', -1.25], ['V~', -0.5], ['Ω', 0.4], ['A⎓', 1.25], ['A~', 1.95]]) c.fillText(t, W / 2 + Math.sin(a) * 152, 604 - Math.cos(a) * 152);
    c.font = `600 32px ${MONO}`; c.fillStyle = '#c9ccd1';
    c.fillText(m.kind === 'A' ? 'mA A' : 'VΩ', 122, 990); c.fillText('COM', 390, 990);
    m.tex.needsUpdate = true;
  }

  // ───────────────────────────── basetta e componenti ─────────────────────────────
  _buildBase() {
    // il posto del componente: la lampadina sta su una basetta di legno con due morsetti (spine a banana); il resistore
    // e il LED, liberi, sono appoggiati sul piano e presi con due pinze a coccodrillo
    const g = this.base = new THREE.Group(); this.group.add(g);
    this.baseBoard = new THREE.Group(); g.add(this.baseBoard);
    this._mesh(new RoundedBoxGeometry(0.22, 0.022, 0.11, 2, 0.004).translate(0, 0.011, 0), this.M.wood, this.baseBoard);
    this.posts = [];
    for (const [x, mat] of [[-0.065, this.M.red], [0.065, this.M.black]]) {
      this._mesh(cyl(0.006, 0.006, 0.045, 20).translate(x, 0.022 + 0.0225, 0), this.M.brass, this.baseBoard);
      this._mesh(cyl(0.009, 0.009, 0.012, 24).translate(x, 0.072, 0), mat, this.baseBoard);
      this.posts.push({ p: V3(x, 0.078, 0), d: V3(0, 1, 0) });
    }
    this.compG = new THREE.Group(); g.add(this.compG);
    // le due pinze per i componenti liberi: rossa verso l'amperometro, nera verso il −; puntano in alto, all'indietro
    this.lclips = ['red', 'black'].map((c) => { const k = this._makeClip(g, c); k.g.rotation.x = 2.0; return k; });
    this.light = new THREE.PointLight('#ffd7a0', 0, 0.9, 2); this.light.position.set(0, 0.08, 0); g.add(this.light);
    g.add(this.halo);
  }
  /**
   * Una pinza a coccodrillo: le ganasce mordono nell'origine (il filo preso va lungo x locale), il corpo con la guaina
   * va lungo −y locale e in coda ha la boccola per la spina a banana.
   */
  _makeClip(parent, color = 'black') {
    const g = new THREE.Group(); parent.add(g);
    for (const s of [-1, 1]) {
      const j = new THREE.Group(); j.rotation.x = s * 0.05; g.add(j);
      this._mesh(new THREE.BoxGeometry(0.0042, 0.026, 0.0011).translate(0, -0.012, s * 0.0014), this.M.chrome, j);
      // i denti
      for (let k = 0; k < 6; k++) this._mesh(new THREE.BoxGeometry(0.0042, 0.0007, 0.0007).rotateX(Math.PI / 4).translate(0, -0.0008 - k * 0.0014, s * 0.0008), this.M.chrome, j, false);
    }
    this._mesh(cyl(0.0016, 0.0016, 0.0075, 12).rotateZ(Math.PI / 2).translate(0, -0.021, 0), this.M.chrome, g);
    this._mesh(cyl(0.0042, 0.0058, 0.032, 20).scale(1, 1, 0.8).translate(0, -0.036, 0), color === 'red' ? this.M.red : this.M.black, g);
    return { g, tail: { p: V3(0, -0.053, 0), d: V3(0, -1, 0) } };
  }
  /** Il resistore assiale: ghiere alle estremità più larghe, il centro un po' più sottile, le fasce del codice dei colori. */
  _resistor(C, g, y) {
    const half = 0.0092, N = 96, pts = [];
    for (let i = 0; i <= N; i++) {
      const x = -half + (2 * half * i) / N, u = Math.abs(x) / half;
      const r = (0.00255 + 0.0006 * Math.exp(-(((u - 0.74) / 0.12) ** 2))) * (u > 0.88 ? Math.sqrt(Math.max(0, 1 - ((u - 0.88) / 0.12) ** 2)) : 1);
      pts.push(new THREE.Vector2(Math.max(0.00055, r), x));
    }
    // le fasce si dipingono sulla vernice: la coordinata v del tornio corre lungo l'asse
    const tex = canvasTexture(8, 512, (c) => {
      c.fillStyle = '#d6c39b'; c.fillRect(0, 0, 8, 512);
      const band = (x, col) => { const t = (x + half) / (2 * half), w = (0.0011 / (2 * half)) * 512; c.fillStyle = BAND[col]; c.fillRect(0, (1 - t) * 512 - w / 2, 8, w); };
      C.bands.forEach((col, i) => band([-0.0061, -0.0037, -0.0013, 0.0061][i], col));
    }, { aniso: 4 });
    this.resMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    this._mesh(new THREE.LatheGeometry(pts, 40).rotateZ(-Math.PI / 2).translate(0, y, 0), this.resMat, g);
    // i reofori: diritti, stagnati
    for (const s of [-1, 1]) this._mesh(cyl(0.0004, 0.0004, 0.034, 10).rotateZ(Math.PI / 2).translate(s * (half - 0.0005 + 0.017), y, 0), this.M.nickel, g, false);
  }
  /** Mette al suo posto il componente key; il percorso della corrente (locale) va da un morso all'altro. */
  setComponent(key) {
    const g = this.compG; for (const c of [...g.children]) { g.remove(c); c.traverse((o) => o.geometry?.dispose()); }
    this.resMat = null; this.filMat = null; this.ledMat = null; this._lampBurnt = false;
    const C = COMPONENTS[key];
    this.compKind = C.kind;
    this.baseBoard.visible = C.kind === 'lamp';
    for (const k of this.lclips) k.g.visible = C.kind !== 'lamp';
    let inside;
    if (C.kind === 'R') {
      // resistore da 2 W appoggiato sul piano; le pinze mordono i reofori vicino alle estremità
      const y = 0.0031;
      this._resistor(C, g, y);
      this.lclips[0].g.position.set(-0.035, y, 0); this.lclips[1].g.position.set(0.035, y, 0);
      inside = [V3(-0.035, y, 0), V3(-0.009, y, 0), V3(0.009, y, 0), V3(0.035, y, 0)];
      this.hotSpot = V3(0, y + 0.004, 0);
    } else if (C.kind === 'lamp') {
      // portalampada E10 di bachelite fissato alla basetta; due lamine d'ottone sotto la sua flangia portano la corrente
      // dai morsetti al contatto centrale e alla ghiera filettata
      const B = 0.022;
      for (const s of [-1, 1]) {
        this._mesh(new THREE.BoxGeometry(0.058, 0.0008, 0.0055).translate(s * 0.036, B + 0.0004, 0), this.M.brass, g, false);
        this._mesh(cyl(0.0022, 0.0022, 0.0014, 16).translate(s * 0.0165, B + 0.0011, 0), this.M.brass, g, false);
      }
      const L2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
      this._mesh(new THREE.LatheGeometry(L2([[0, 0], [0.0125, 0], [0.0125, 0.0035], [0.0098, 0.0045], [0.0098, 0.0185], [0.009, 0.0205], [0.0064, 0.0205], [0.006, 0.012], [0, 0.012]]), 48).translate(0, B, 0), this.M.bakelite, g);
      // la lampadina: attacco a vite E10 di ottone nichelato, bulbo di vetro, il pozzetto con i due reofori e il filamento
      const yb = B + 0.012, y0 = yb + 0.011, yf = y0 + 0.0135;
      const thr = [[0.0042, 0]]; for (let i = 0; i <= 60; i++) { const y = (0.0105 * i) / 60; thr.push([0.005 + 0.00035 * Math.sin((2 * Math.PI * y) / 0.0018), y]); }
      thr.push([0.0046, 0.0112]);
      this._mesh(new THREE.LatheGeometry(L2(thr), 40).translate(0, yb, 0), this.M.nickel, g);
      this.lampGlass = new THREE.MeshPhysicalMaterial({ color: '#f8faf9', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, envMapIntensity: 2, emissive: '#ffb060', emissiveIntensity: 0 });
      const bulb = this._mesh(new THREE.LatheGeometry(L2([[0.0046, 0], [0.0049, 0.0025], [0.0062, 0.0055], [0.0078, 0.0095], [0.0084, 0.0135], [0.0081, 0.018], [0.0068, 0.0222], [0.0045, 0.0249], [0.0018, 0.0262], [0, 0.0265]]), 48).translate(0, y0, 0), this.lampGlass, g, false);
      bulb.renderOrder = 5; bulb.userData.noOutline = true;
      const stem = new THREE.MeshStandardMaterial({ color: '#eef3f2', roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
      this._mesh(cyl(0.0014, 0.0026, 0.0055, 16).translate(0, y0 + 0.0022, 0), stem, g, false).renderOrder = 4;
      this._mesh(new THREE.SphereGeometry(0.0011, 16, 10).translate(0, y0 + 0.0062, 0), stem, g, false).renderOrder = 4;
      for (const s of [-1, 1]) {
        this._bar(V3(s * 0.0007, y0, 0), V3(s * 0.0007, y0 + 0.0062, 0), 0.0002, this.M.lead, g);
        this._bar(V3(s * 0.0007, y0 + 0.0062, 0), V3(s * 0.0027, yf, 0), 0.0002, this.M.lead, g);
      }
      // il filamento a spirale, in due metà che si possono spezzare (pernio sul reoforo)
      this.filMat = std({ color: '#3a3a3a', emissive: '#000000', roughness: 0.4, metalness: 0.6 });
      const half = (s) => {
        const pv = new THREE.Group(); pv.position.set(s * 0.0027, yf, 0); g.add(pv);
        const pts = []; for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * Math.PI * 2 * 7; pts.push(V3(-s * 0.0027 * t, 0.00034 * Math.sin(a), 0.00034 * Math.cos(a))); }
        this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.0001, 5, false), this.filMat, pv, false);
        return pv;
      };
      this.filL = half(-1); this.filR = half(1);
      // i puntini della corrente corrono sulle lamine e passano sotto il portalampada; nel bulbo si vede il filamento
      inside = [V3(-0.065, 0.075, 0), V3(-0.065, B + 0.001, 0), V3(-0.007, B + 0.001, 0), V3(-0.004, B + 0.004, 0), V3(0.004, B + 0.004, 0), V3(0.007, B + 0.001, 0), V3(0.065, B + 0.001, 0), V3(0.065, 0.075, 0)];
      this.hotSpot = V3(0, yf, 0);
    } else {
      // LED rosso da 5 mm coricato sul piano, la cupola verso di noi; le gambe aperte a destra e a sinistra, l'anodo
      // (la più lunga) verso la pinza rossa
      const y = 0.0029, zl = -0.006;
      this.ledMat = new THREE.MeshPhysicalMaterial({ color: '#d42a1c', roughness: 0.12, transparent: true, opacity: 0.88, emissive: '#ff2010', emissiveIntensity: 0, clearcoat: 1 });
      const dome = this._mesh(new THREE.CapsuleGeometry(0.0025, 0.0045, 8, 20).rotateX(Math.PI / 2).translate(0, y, 0.0048), this.ledMat, g, false); dome.renderOrder = 4;
      this._mesh(cyl(0.0029, 0.0029, 0.001, 20).rotateX(Math.PI / 2).translate(0, y, 0.0005), this.ledMat, g, false);
      for (const s of [-1, 1]) {
        const a = V3(s * 0.00127, y, 0), b = V3(s * 0.00127, y, -0.003), c = V3(s * 0.006, y, zl), e = V3(s * 0.042, y, zl);
        this._bar(a, b, 0.00025, this.M.nickel, g); this._bar(b, c, 0.00025, this.M.nickel, g); this._bar(c, e, 0.00025, this.M.nickel, g);
      }
      this.lclips[0].g.position.set(-0.035, y, zl); this.lclips[1].g.position.set(0.035, y, zl);
      inside = [V3(-0.035, y, zl), V3(-0.006, y, zl), V3(-0.00127, y, -0.003), V3(-0.00127, y, 0), V3(0, y, 0.004), V3(0.00127, y, 0), V3(0.00127, y, -0.003), V3(0.006, y, zl), V3(0.035, y, zl)];
      this.hotSpot = V3(0, y, 0.006);
    }
    this.light.position.copy(this.hotSpot); this.halo.position.copy(this.hotSpot);
    this.light.intensity = 0; this.halo.visible = false;
    this.inside = inside;
    return inside;
  }
  /** Come appare il componente: temperatura (K), luce (0…1), bruciato. */
  showComponent(kind, { T, glow, burnt }) {
    const h = this.halo.material;
    if (kind === 'R' && this.resMat) {
      // la vernice scurisce scaldandosi, e da bruciata è carbonizzata
      const k = Math.min(1, Math.max(0, (T - 380) / 300));
      this.resMat.color.set('#ffffff').lerp(new THREE.Color('#7a5a3c'), k);
      if (burnt) this.resMat.color.set('#3a2e26');
      this.light.intensity = 0; this.halo.visible = false;
    } else if (kind === 'lamp' && this.filMat) {
      const bb = blackbody(Math.max(1000, T)), b = burnt ? 0 : Math.max(0, Math.min(1, (T - 900) / 1700)) ** 3;
      this.filMat.emissive.setRGB(bb[0], bb[1], bb[2]); this.filMat.emissiveIntensity = b * 30;
      this.light.color.setRGB(bb[0], bb[1], bb[2]); this.light.intensity = b * 0.006;
      this.halo.visible = b > 0.003; h.color.setRGB(bb[0], bb[1], bb[2]); h.opacity = Math.min(1, b * 1.3); this.halo.scale.setScalar(0.018 + 0.045 * Math.sqrt(b));
      h.blending = THREE.AdditiveBlending;
      this.lampGlass.emissive.setRGB(bb[0], bb[1], bb[2]); this.lampGlass.emissiveIntensity = b * 0.35;
      if (burnt !== this._lampBurnt) {
        // il filamento rotto: le due metà cadono, il vetro si annerisce un poco
        this._lampBurnt = burnt;
        this.filL.rotation.z = burnt ? -0.9 : 0; this.filR.rotation.z = burnt ? 0.9 : 0;
        this.lampGlass.color.set(burnt ? '#a8a49c' : '#f8faf9'); this.lampGlass.opacity = burnt ? 0.32 : 0.2;
      }
    } else if (kind === 'led' && this.ledMat) {
      const b = burnt ? 0 : Math.min(1, glow);
      this.ledMat.emissiveIntensity = b * 5; this.ledMat.color.set(burnt ? '#4a1410' : '#d42a1c');
      this.light.color.set('#ff2a18'); this.light.intensity = b * 0.0007;
      this.halo.visible = b > 0.01; h.color.set('#ff3a22'); h.opacity = Math.min(0.75, b * 0.8); this.halo.scale.setScalar(0.012 + 0.03 * Math.sqrt(b));
      h.blending = THREE.NormalBlending;
    }
  }
  _buildHalo() {
    const tex = canvasTexture(128, 128, (c) => { const r = c.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.55)'); r.addColorStop(0.5, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 128, 128); }, { srgb: false });
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.halo.visible = false; this.halo.renderOrder = 8; this.halo.userData.noAO = true; this.halo.userData.noOutline = true;
  }

  // ───────────────────────────── banco della seconda legge ─────────────────────────────
  _buildBoard() {
    const g = this.board = new THREE.Group(); this.group.add(g);
    const { x0, x1, y } = BOARD;
    this._mesh(new RoundedBoxGeometry(BX1 - BX0, 0.024, BZ1 - BZ0, 2, 0.005).translate((BX0 + BX1) / 2, 0.012, (BZ0 + BZ1) / 2), this.M.wood, g);
    // il metro, davanti ai fili
    const rz = wireZ(WIRES.length - 1) + 0.034;
    this._mesh(new THREE.BoxGeometry(1.04, 0.003, 0.026).translate((x0 + x1) / 2, 0.0255, rz), new THREE.MeshStandardMaterial({ map: this._rulerTex(), roughness: 0.6 }), g);
    this.wireMeshes = WIRES.map((w, i) => {
      const z = wireZ(i), m = MATERIALS[w.mat], r = 0.0004 + w.d;
      for (const x of [x0 - 0.03, x1 + 0.03]) {
        this._mesh(new RoundedBoxGeometry(0.03, 0.014, 0.022, 2, 0.003).translate(x, 0.024 + 0.007, z), this.M.brass, g);
        this._mesh(cyl(0.0045, 0.0045, 0.006, 6).translate(x, 0.041, z), this.M.chrome, g);
      }
      const mat = std({ color: m.color, metalness: 1, roughness: 0.32 });
      this._mesh(cyl(r, r, x1 - x0 + 0.06, 8).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z), mat, g, false);
      // il tratto percorso dalla corrente, che si scalda
      const hotMat = std({ color: m.color, metalness: 1, roughness: 0.32, emissive: '#ff4010', emissiveIntensity: 0 });
      const hot = this._mesh(cyl(r * 1.08, r * 1.08, 1, 8).rotateZ(Math.PI / 2).translate(0.5, 0, 0), hotMat, g, false);
      hot.position.set(x0, y, z); hot.visible = false; hot.userData.noOutline = true;
      const tag = canvasTexture(512, 64, (c) => { c.fillStyle = '#2a1d10'; c.font = `600 36px ${MONO}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(`${m.name} ${(w.d * 1000).toFixed(2).replace('.', ',')} mm`, 4, 34); });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.021).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tag, transparent: true, depthWrite: false }));
      label.position.set(x0 - 0.155, 0.0242, z); label.userData.noOutline = true; g.add(label);
      return { hot, hotMat, color: m.color };
    });
    // la pinza a coccodrillo che si sposta sul filo scelto: morde il filo e punta in alto, all'indietro, sopra gli altri
    this.bclip = this._makeClip(g, 'black'); this.bclip.g.rotation.x = 2.0;
  }
  _rulerTex() {
    if (!this._ruler) {
      this._ruler = canvasTexture(4096, 128, (c) => {
        c.fillStyle = '#f2ead6'; c.fillRect(0, 0, 4096, 128); c.fillStyle = '#1d2026'; c.font = `600 44px ${MONO}`; c.textAlign = 'center';
        const px = 4096 / 1.04;
        for (let mm = 0; mm <= 1000; mm += 5) { const x = 0.02 * px + (mm / 1000) * px, h = mm % 100 === 0 ? 70 : mm % 50 === 0 ? 50 : mm % 10 === 0 ? 34 : 18; c.fillRect(x - 1.5, 0, 3, h); if (mm % 100 === 0) c.fillText(String(mm / 10), Math.min(4070, Math.max(26, x)), 118); }
      }, { aniso: 16 });
    }
    return this._ruler;
  }

  // ───────────────────────────── il filo singolo su due isolatori ─────────────────────────────
  _buildRods() {
    const g = this.rods = new THREE.Group(); this.group.add(g);
    const { x0, x1 } = BOARD;
    // isolatore di porcellana a gola (il filo gira nella gola), con la boccola d'ottone in cima
    const prof = [[0, -0.024], [0.0125, -0.024], [0.014, -0.021], [0.014, -0.013], [0.0115, -0.0095], [0.0086, -0.006], [0.0083, 0], [0.0086, 0.006], [0.0115, 0.0095], [0.0125, 0.013], [0.0125, 0.019], [0.0095, 0.023], [0, 0.023]].map(([r, y]) => new THREE.Vector2(r, y));
    for (const x of [RODS.xL, RODS.xR]) {
      this._mesh(new RoundedBoxGeometry(0.1, 0.014, 0.12, 3, 0.004).translate(x, 0.007, 0), this.M.stand, g);
      this._mesh(cyl(0.0055, 0.0055, YW - 0.038, 24).translate(x, 0.014 + (YW - 0.038) / 2, 0), this.M.chrome, g);
      this._mesh(new THREE.LatheGeometry(prof, 48).translate(x, YW, 0), this.M.porcelain, g);
      this._mesh(cyl(0.0065, 0.0065, 0.004, 6).translate(x, YW + 0.025, 0), this.M.brass, g);
      this._mesh(cyl(0.0045, 0.0045, 0.012, 20).translate(x, YW + 0.033, 0), this.M.brass, g);
    }
    // il metro, tenuto da due morsetti alle aste, appena sotto il filo e un poco davanti
    const ry = YW - 0.03, rz = 0.028;
    this._mesh(new THREE.BoxGeometry(1.04, 0.004, 0.026).translate((x0 + x1) / 2, ry, rz), new THREE.MeshStandardMaterial({ map: this._rulerTex(), roughness: 0.6 }), g);
    this._mesh(new RoundedBoxGeometry(0.018, 0.014, 0.05, 2, 0.003).translate(RODS.xL, ry, 0.012), this.M.black, g);
    this._mesh(new RoundedBoxGeometry(0.018, 0.014, 0.05, 2, 0.003).translate(RODS.xR - 0.003, ry, 0.012), this.M.black, g);
    this.rodsWire = new THREE.Group(); g.add(this.rodsWire);
    // la pinza a coccodrillo che morde il filo, con la guaina nera e la boccola in coda
    const rc = this._makeClip(g, 'black');
    this.clip = rc.g; this.clip.rotation.x = -0.72; this.clipTail = rc.tail;
  }
  /** Monta sugli isolatori il filo w. */
  setRodsWire(w) {
    const g = this.rodsWire; for (const c of [...g.children]) { g.remove(c); c.geometry.dispose(); }
    const m = MATERIALS[w.mat], r = 0.0004 + w.d, xa = BOARD.x0, xb = RODS.xR - 0.0084;
    const mat = std({ color: m.color, metalness: 1, roughness: 0.32 });
    this._mesh(cyl(r, r, xb - xa, 8).rotateZ(Math.PI / 2).translate((xa + xb) / 2, YW, 0), mat, g, false);
    for (const [x, s] of [[RODS.xL, -1], [RODS.xR, 1]]) {
      this._mesh(new THREE.TorusGeometry(0.0085, r, 6, 40).rotateX(Math.PI / 2).translate(x, YW, 0), mat, g, false);
      // il capo del filo risale lungo la porcellana fino al morsetto
      this._bar(V3(x + s * 0.0085, YW, 0), V3(x + s * 0.0136, YW + 0.012, 0), r, mat, g);
      this._bar(V3(x + s * 0.0136, YW + 0.012, 0), V3(x + s * 0.0062, YW + 0.0245, 0), r, mat, g);
    }
    this.rodsHotMat = std({ color: m.color, metalness: 1, roughness: 0.32, emissive: '#ff4010', emissiveIntensity: 0 });
    this.rodsHot = this._mesh(cyl(r * 1.1, r * 1.1, 1, 8).rotateZ(Math.PI / 2).translate(0.5, 0, 0), this.rodsHotMat, g, false);
    this.rodsHot.position.set(xa, YW, 0); this.rodsHot.userData.noOutline = true;
    this.rodsColor = m.color;
  }

  /** Calore del tratto di filo percorso (K) e se è bruciato; app: 'board' (filo i del banco) o 'rods'. */
  showWire(app, i, L, T, burnt) {
    const paint = (mat, color) => {
      const bb = blackbody(Math.max(900, T)), glow = burnt ? 0 : Math.max(0, Math.min(1, (T - 760) / 500));
      mat.emissive.setRGB(bb[0], bb[1], bb[2]); mat.emissiveIntensity = glow * glow * 6;
      mat.color.set(color).lerp(new THREE.Color('#3a2d24'), burnt ? 1 : Math.max(0, Math.min(0.6, (T - 420) / 600)));
    };
    if (app === 'rods') {
      if (!this.rodsHot) return;
      this.rodsHot.scale.x = Math.max(0.001, L); paint(this.rodsHotMat, this.rodsColor);
      return;
    }
    this.wireMeshes.forEach((w, k) => {
      w.hot.visible = k === i; w.hot.scale.x = Math.max(0.001, L);
      if (k === i) paint(w.hotMat, w.color);
    });
  }

  // ───────────────────────────── disposizione e cavi ─────────────────────────────
  /**
   * Sistema strumenti e apparato: app 'base' (componente sulla basetta), 'rods' (filo sugli isolatori, pinza alla
   * lunghezza L), 'board' (banco a più fili, pinza sul filo i alla lunghezza L). Restituisce i morsetti (mondo).
   */
  layout(app, wireIndex = 0, L = 1) {
    const P = LAYOUT[app];
    const put = (obj, [x, z, r]) => { obj.position.set(x, 0, z); obj.rotation.y = r; };
    put(this.supply, P.supply); put(this.amm.g, P.amm); put(this.volt.g, P.volt);
    this.base.visible = app === 'base'; this.board.visible = app === 'board'; this.rods.visible = app === 'rods';
    if (app === 'base') put(this.base, P.at);
    if (app === 'rods') put(this.rods, P.at);
    this.bclip.g.position.set(BOARD.x0 + L, BOARD.y, wireZ(wireIndex));
    this.clip.position.set(BOARD.x0 + L, YW, 0);
    this.group.updateMatrixWorld(true);
    const w = (t, obj) => ({ p: t.p.clone().applyMatrix4(obj.matrixWorld), d: t.d.clone().transformDirection(obj.matrixWorld) });
    const T = {
      plus: w(this.supTerm.plus, this.supply), minus: w(this.supTerm.minus, this.supply),
      aIn: w(this.amm.jacks.in, this.amm.inner), aCom: w(this.amm.jacks.com, this.amm.inner),
      vIn: w(this.volt.jacks.in, this.volt.inner), vCom: w(this.volt.jacks.com, this.volt.inner),
    };
    if (app === 'base') {
      const b = this.base.position, inner = (this.inside || []).map((p) => p.clone().applyMatrix4(this.base.matrixWorld));
      if (this.compKind === 'lamp') {
        // la basetta della lampadina: spine a banana nei morsetti; i cavi escono all'indietro, lontano dal bulbo
        T.c1 = { ...w(this.posts[0], this.base), o: V3(0, 0, -1) }; T.c2 = { ...w(this.posts[1], this.base), o: V3(0, 0, -1) };
        T.inside = inner;
        this.feet = [{ x0: b.x - 0.11, x1: b.x + 0.11, z0: b.z - 0.055, z1: b.z + 0.055, y: 0.0225 }];
      } else {
        // un componente libero: le spine entrano nelle code delle due pinze a coccodrillo
        T.c1 = w(this.lclips[0].tail, this.lclips[0].g); T.c2 = w(this.lclips[1].tail, this.lclips[1].g);
        T.inside = [T.c1.p.clone(), ...inner, T.c2.p.clone()];
        this.feet = [];
      }
    } else if (app === 'rods') {
      // dal morsetto in cima all'isolatore di sinistra, lungo il filo, fino alla pinza
      const R = this.rods.matrixWorld, at = (x, y, z) => V3(x, y, z).applyMatrix4(R);
      T.c1 = { p: at(RODS.xL, YW + 0.039, 0), d: V3(0, 1, 0) };
      T.c2 = w(this.clipTail, this.clip);
      T.inside = [at(RODS.xL, YW + 0.039, 0), at(RODS.xL - 0.006, YW + 0.024, 0), at(RODS.xL - 0.0136, YW + 0.012, 0), at(RODS.xL - 0.0085, YW, 0), at(RODS.xL, YW, -0.0085), at(BOARD.x0, YW, 0), at(BOARD.x0 + L, YW, 0), T.c2.p.clone()];
      const z = this.rods.position.z;
      this.feet = [RODS.xL, RODS.xR].map((x) => ({ x0: x - 0.05, x1: x + 0.05, z0: z - 0.06, z1: z + 0.06, y: 0.0145 }));
    } else {
      const z = wireZ(wireIndex), x = BOARD.x0 + L, y = BOARD.y + 0.001;
      T.c1 = { p: V3(BOARD.x0 - 0.03, 0.044, z), d: V3(0, 1, 0) };
      T.c2 = w(this.bclip.tail, this.bclip.g);
      T.inside = [V3(BOARD.x0 - 0.03, 0.044, z), V3(BOARD.x0 - 0.03, y, z), V3(x, y, z), T.c2.p.clone()];
      this.feet = [{ x0: BX0, x1: BX1, z0: BZ0, z1: BZ1, y: 0.0335 }];
    }
    this.T = T;
    return T;
  }
  _floorAt(x, z) {
    let y = 0;
    for (const f of this.feet || []) if (x > f.x0 - 0.004 && x < f.x1 + 0.004 && z > f.z0 - 0.004 && z < f.z1 + 0.004) y = Math.max(y, f.y);
    return y;
  }
  /** Un cavo a banana fra i morsetti a e b ({p, d}), che si appoggia per terra. stack: spine già infilate lì. */
  cable(a, b, color, side = 1, stackA = 0, stackB = 0) {
    const R = 0.0024, pa = a.p.clone().addScaledVector(a.d, 0.019 * stackA), pb = b.p.clone().addScaledVector(b.d, 0.019 * stackB);
    const a1 = pa.clone().addScaledVector(a.d, 0.024), b1 = pb.clone().addScaledVector(b.d, 0.024);
    const span = V3(b1.x - a1.x, 0, b1.z - a1.z), len = span.length(), nrm = V3(-span.z, 0, span.x).normalize();
    const mid = a1.clone().lerp(b1, 0.5).addScaledVector(nrm, side * Math.min(0.06, 0.12 * len)); mid.y = 0;
    // dopo la spina il cavo piega dolcemente verso terra (o, se il morsetto lo chiede, prima all'indietro)
    const bend = (p1, toward, o) => {
      const h = o ? o.clone() : V3(toward.x - p1.x, 0, toward.z - p1.z), L = h.length();
      return p1.clone().addScaledVector(h, (o ? 0.045 : Math.min(0.03, 0.4 * L)) / Math.max(1e-6, L)).setY(p1.y * 0.72);
    };
    const ba = bend(a1, mid, a.o), bb = bend(b1, mid, b.o);
    const qa = ba.clone().lerp(mid, 0.5); qa.y = 0; const qb = bb.clone().lerp(mid, 0.5); qb.y = 0;
    const guide = new THREE.CatmullRomCurve3([pa, a1, ba, qa, mid, qb, bb, b1, pb], false, 'centripetal');
    const pts = guide.getSpacedPoints(140), n = pts.length;
    // il cavo non attraversa la basetta o il banco: ci passa sopra e scende dal bordo con una curva
    const lo = pts.map((p, i) => (Math.min(i, n - 1 - i) > 6 ? this._floorAt(p.x, p.z) + R : -1));
    for (let i = 0; i < n; i++) pts[i].y = Math.max(pts[i].y, lo[i]);
    for (let pass = 0; pass < 8; pass++) {
      const y = pts.map((p) => p.y);
      for (let i = 7; i < n - 7; i++) pts[i].y = Math.max(lo[i], (y[i - 1] + 2 * y[i] + y[i + 1]) / 4);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const cm = color === 'red' ? this.M.redCable : this.M.blackCable, pm = color === 'red' ? this.M.red : this.M.black;
    this._mesh(new THREE.TubeGeometry(curve, 200, R, 8, false), cm, this.cables);
    // le spine a banana: il puntale è dentro la boccola, fuori restano il corpo con le scanalature e il passacavo
    const PLUG = [[0, 0], [0.0021, 0], [0.0021, 0.0013], [0.0033, 0.0016], [0.004, 0.0032], [0.0041, 0.006], [0.0038, 0.0064], [0.0041, 0.0068], [0.0041, 0.0115], [0.0038, 0.0119], [0.0041, 0.0123], [0.0041, 0.0135], [0.0033, 0.016], [0.0027, 0.0195], [0.0026, 0.021]].map(([r, y]) => new THREE.Vector2(r, y));
    for (const [p, d] of [[pa, a.d], [pb, b.d]]) {
      const plug = this._mesh(new THREE.LatheGeometry(PLUG, 18), pm, this.cables);
      plug.position.copy(p); plug.quaternion.setFromUnitVectors(V3(0, 1, 0), d);
    }
    return { curve, a: pa, b: pb };
  }
  /** I cavi del circuito, mode 'valle' | 'monte'; flip: i cavi scambiati all'alimentatore. Restituisce il percorso della corrente. */
  wireUp(mode, flip) {
    for (const m of [...this.cables.children]) { this.cables.remove(m); m.geometry.dispose(); }
    const T = this.T, plus = flip ? T.minus : T.plus, minus = flip ? T.plus : T.minus;
    const c1 = this.cable(plus, T.aIn, 'red', 1);
    const c2 = this.cable(T.aCom, T.c1, 'red', -1);
    const c3 = this.cable(T.c2, minus, 'black', 1);
    if (mode === 'valle') this.cable(T.c1, T.vIn, 'red', 1, 1, 0);
    else this.cable(plus, T.vIn, 'red', -1, 1, 0);
    this.cable(T.c2, T.vCom, 'black', -1, 1, 0);
    // il percorso della corrente (convenzionale): dal morsetto positivo, attraverso l'amperometro e il componente
    const path = [], add = (c) => { for (let i = 0; i <= 80; i++) path.push(c.curve.getPoint(i / 80)); };
    add(c1); add(c2);
    for (const p of T.inside) path.push(p.clone());
    add(c3);
    this.setPath(path);
    return path;
  }

  // ───────────────────────────── la corrente e il fumo ─────────────────────────────
  _buildDots() {
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0015, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffc21a', toneMapped: false }), 500);
    this.dots.count = 0; this.dots.frustumCulled = false; this.dots.userData.noAO = true; this.dots.userData.noOutline = true;
    this.group.add(this.dots);
  }
  setPath(path) {
    this.path = path; this.cum = [0];
    for (let i = 1; i < path.length; i++) this.cum.push(this.cum[i - 1] + path[i].distanceTo(path[i - 1]));
    this.pathLen = this.cum[this.cum.length - 1];
  }
  /** I puntini della corrente, spostati di phase metri lungo il percorso. */
  setDots(show, phase) {
    if (!show || !this.path || this.pathLen <= 0) { this.dots.count = 0; return; }
    const step = 0.016, n = Math.min(500, Math.floor(this.pathLen / step)), m = new THREE.Matrix4(), p = new THREE.Vector3();
    const off = ((phase % step) + step) % step;
    let j = 0;
    for (let k = 0; k < n; k++) {
      const s = k * step + off;
      while (j < this.cum.length - 2 && this.cum[j + 1] < s) j++;
      const a = this.path[j], b = this.path[j + 1], t = Math.min(1, (s - this.cum[j]) / Math.max(1e-9, this.cum[j + 1] - this.cum[j]));
      p.copy(a).lerp(b, t); m.makeTranslation(p.x, p.y + 0.0012, p.z); this.dots.setMatrixAt(k, m);
    }
    this.dots.count = n; this.dots.instanceMatrix.needsUpdate = true;
  }
  _buildSmoke() {
    const N = 260, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    const tex = canvasTexture(64, 64, (c) => { const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, 64, 64); }, { srgb: false });
    this.smoke = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 0.026, transparent: true, depthWrite: false, vertexColors: true }));
    this.smoke.frustumCulled = false; this.smoke.userData.noOutline = true; this.group.add(this.smoke);
    this.smokeN = N; this.smokeP = [];
  }
  /** Fumo che sale dal punto p (mondo) con intensità k (0…1). */
  stepSmoke(dt, p, k) {
    if (k > 0.02 && p) {
      const rate = dt * 70 * k, n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) this.smokeP.push({ x: p.x + (Math.random() - 0.5) * 0.012, y: p.y, z: p.z + (Math.random() - 0.5) * 0.008, v: 0.04 + Math.random() * 0.04, life: 0, dark: k });
    }
    for (const s of this.smokeP) { s.y += s.v * dt; s.x += (Math.random() - 0.5) * 0.004 + 0.004 * dt; s.z += (Math.random() - 0.5) * 0.003; s.life += dt; }
    this.smokeP = this.smokeP.filter((s) => s.life < 3.2).slice(-this.smokeN);
    const pos = this.smoke.geometry.attributes.position, col = this.smoke.geometry.attributes.color;
    for (let i = 0; i < this.smokeN; i++) {
      const s = this.smokeP[i];
      if (!s) { pos.setXYZ(i, 0, -5, 0); col.setXYZW(i, 0, 0, 0, 0); continue; }
      pos.setXYZ(i, s.x, s.y, s.z);
      const g = 0.62 - 0.25 * s.dark; col.setXYZW(i, g, g, g + 0.02, Math.max(0, 0.6 * (1 - s.life / 3.2)) * Math.min(1, s.life * 6));
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  /** Punti notevoli (mondo) per le etichette e le inquadrature. */
  anchors() {
    const w = (obj, x, y, z) => V3(x, y, z).applyMatrix4(obj.matrixWorld);
    return {
      supply: w(this.supply, 0, 0.13, 0), amm: w(this.amm.inner, 0, 0.1, 0), volt: w(this.volt.inner, 0, 0.1, 0),
      comp: this.hotSpot ? this.hotSpot.clone().applyMatrix4(this.base.matrixWorld) : V3(0, 0.08, 0),
      cursor: w(this.bclip.g, 0, -0.03, 0),
      clip: w(this.rods, this.clip.position.x, YW + 0.025, 0), insL: w(this.rods, RODS.xL, YW + 0.05, 0), insR: w(this.rods, RODS.xR, YW + 0.05, 0),
      rodsRuler: w(this.rods, BOARD.x0 + 0.72, YW - 0.03, 0.03),
    };
  }
}
