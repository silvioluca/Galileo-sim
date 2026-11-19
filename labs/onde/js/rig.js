// rig.js — il banco delle onde stazionarie: un tavolo da laboratorio con
//  - l'apparato di Melde: vibratore che scorre sul tavolo, corda, carrucola sul bordo, pesi appesi, righello,
//    generatore di funzioni con il display, lampada stroboscopica;
//  - il tubo sonoro: tubo di vetro a cannocchiale su due supporti, altoparlante, tappo, particelle d'aria
//    (spostamenti ingranditi), un letto di polvere sul fondo che nei ventri si increspa in creste sottili.
// La corda, la sua scia e le due onde che la compongono si ridisegnano a ogni fotogramma dai dati della simulazione.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { STRINGS, TUBE_R } from './waves.js';

export const TABLE = { x0: -1.05, x1: 1.05, z0: -0.36, z1: 0.36, y: 0.78, t: 0.04 };
export const STR_Y = TABLE.y + 0.2;
export const PULLEY = { x: 1.08, r: 0.03 };
export const HANG_Y = 0.52;
export const TUBE_Y = TABLE.y + 0.105;
export const TUBE_X = -0.78;
export const NS = 240;
const NCOL_MAX = 130, NROW = 5;
/** Polveri per il tubo di Kundt. s: passo delle creste; H: loro altezza piena; base: spessore del letto; grain:
 *  grana; lo, hi: ampiezza di spostamento dell'aria (m) da cui la polvere comincia a muoversi e a cui le creste
 *  sono piene; hop: altezza dei salti dei granelli, size: loro diametro; jx, jy: tremito della superficie. Il polistirolo, leggero, si muove prima e fa creste più alte; il licopodio, finissimo, più fitte. */
export const GRAINS = {
  cork: { name: 'Sughero', color: '#e4c798', s: 0.0055, H: 0.0038, base: 0.0009, grain: 0.0003, lo: 4e-6, hi: 10e-6, hop: 0.004, size: 0.0011, jx: 0.0005, jy: 0.0005 },
  styro: { name: 'Polistirolo', color: '#f1f0ea', s: 0.007, H: 0.0046, base: 0.0011, grain: 0.0005, lo: 2.5e-6, hi: 7e-6, hop: 0.0065, size: 0.0016, jx: 0.0007, jy: 0.0008 },
  lyco: { name: 'Licopodio', color: '#e0bd52', s: 0.0036, H: 0.0019, base: 0.0006, grain: 0.00015, lo: 5e-6, hi: 12e-6, hop: 0.0025, size: 0.0006, jx: 0.0003, jy: 0.0003 },
};
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);

function woodTexture(base, dark) {
  return canvasTexture(1024, 512, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      const y = Math.random() * H; g.strokeStyle = `${dark} ${0.05 + Math.random() * 0.14})`; g.lineWidth = 0.6 + Math.random() * 2.2;
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 32) g.lineTo(x, y + 4 * Math.sin(x / 140 + i) + 2 * Math.sin(x / 31 + i * 3)); g.stroke();
    }
  }, { repeat: true, aniso: 16 });
}
/** Righello: cm tacche; reverse = lo zero a destra (si legge verso sinistra). */
function rulerTexture(cm, reverse) {
  const W = 4096, H = 96, px = (W - 40) / cm;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#eceae3'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#15181c'; g.textBaseline = 'top'; g.textAlign = 'center';
    for (let i = 0; i <= cm * 2; i++) {
      const v = i / 2, x = reverse ? W - 20 - v * px : 20 + v * px, big = i % 20 === 0, mid = i % 10 === 0, c = i % 2 === 0;
      g.fillRect(x - 1.5, 0, 3, big ? 46 : mid ? 34 : c ? 24 : 14);
      if (big) { g.font = `700 34px ${FONT}`; g.fillText(String(v), x, 50); }
    }
  }, { aniso: 16 });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'onde';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      alu: std({ color: '#c9cdd2', metalness: 1, roughness: 0.32 }),
      black: std({ color: '#141518', metalness: 0.3, roughness: 0.5 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      brass: std({ color: '#d6b160', metalness: 1, roughness: 0.22 }),
      red: std({ color: '#d4301f', metalness: 0, roughness: 0.4 }),
      blue: std({ color: '#2a5fb8', metalness: 0.2, roughness: 0.45 }),
      plastic: std({ color: '#eceae5', metalness: 0, roughness: 0.5 }),
      top: std({ map: woodTexture('#cfae7e', 'rgba(110, 72, 34,'), roughness: 0.66 }),
      cone: std({ color: '#1e1f22', metalness: 0, roughness: 0.85 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#dfeaf0', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.05 }),
    };
    this.M.top.map.repeat.set(2, 1);
    this._buildTable();
    this.strG = new THREE.Group(); this.group.add(this.strG);
    this.tubeG = new THREE.Group(); this.group.add(this.tubeG);
    this._buildGenerator();
    this._buildMelde();
    this._buildStrobe();
    this._buildTube();
    this._buildCables();
  }
  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  _buildTable() {
    const M = this.M, T = TABLE, w = T.x1 - T.x0, d = T.z1 - T.z0;
    this._mesh(new RoundedBoxGeometry(w, T.t, d, 3, 0.006).translate((T.x0 + T.x1) / 2, T.y - T.t / 2, 0), M.top);
    for (const x of [T.x0 + 0.06, T.x1 - 0.06]) for (const z of [T.z0 + 0.06, T.z1 - 0.06]) this._mesh(new RoundedBoxGeometry(0.05, T.y - T.t, 0.05, 2, 0.006).translate(x, (T.y - T.t) / 2, z), M.iron);
    for (const z of [T.z0 + 0.06, T.z1 - 0.06]) this._mesh(new THREE.BoxGeometry(w - 0.12, 0.06, 0.02).translate((T.x0 + T.x1) / 2, T.y - T.t - 0.03, z), M.iron);
  }
  _buildGenerator() {
    const g = new THREE.Group(); g.position.set(-0.76, TABLE.y, -0.2); g.rotation.y = 0.18; this.group.add(g); this.genG = g;
    this._mesh(new RoundedBoxGeometry(0.28, 0.11, 0.2, 3, 0.01).translate(0, 0.055, 0), this.M.plastic, g);
    this._mesh(new RoundedBoxGeometry(0.26, 0.09, 0.006, 2, 0.003).translate(0, 0.055, 0.1), this.M.boss, g);
    const c = document.createElement('canvas'); c.width = 640; c.height = 160;
    this.genCtx = c.getContext('2d');
    this.genTex = new THREE.CanvasTexture(c); this.genTex.colorSpace = THREE.SRGBColorSpace; this.genTex.anisotropy = 8;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0375), new THREE.MeshBasicMaterial({ map: this.genTex, toneMapped: false }));
    d.position.set(-0.035, 0.066, 0.1035); g.add(d);
    // manopola, tasti e boccole
    this._mesh(cyl(0.017, 0.017, 0.014, 32).rotateX(Math.PI / 2).translate(0.085, 0.066, 0.108), this.M.black, g);
    this._mesh(new THREE.BoxGeometry(0.003, 0.012, 0.002).translate(0.085, 0.074, 0.116), this.M.red, g);
    for (const [x, m] of [[0.07, this.M.red], [0.1, this.M.black]]) this._mesh(cyl(0.005, 0.005, 0.01, 16).rotateX(Math.PI / 2).translate(x, 0.028, 0.106), m, g);
    this.genText = '';
  }
  setGenerator(text, on) {
    const k = `${text}|${on}`;
    if (k === this.genText) return;
    this.genText = k;
    const g = this.genCtx;
    g.fillStyle = '#0d1410'; g.fillRect(0, 0, 640, 160);
    g.font = `700 104px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(120, 255, 170, 0.07)'; g.fillText('8888,88', 520, 84);
    g.fillStyle = on ? '#7dffb0' : '#2f6b48'; g.fillText(text, 520, 84);
    g.font = `700 44px ${MONO}`; g.textAlign = 'left'; g.fillText('Hz', 534, 110);
    g.font = `600 30px ${MONO}`; g.fillText(on ? '∿ ON' : '∿ OFF', 22, 34);
    this.genTex.needsUpdate = true;
  }

  // ───────────────────────────── l'apparato di Melde ─────────────────────────────
  _buildMelde() {
    const M = this.M, S = this.strG;
    // carrucola sul bordo destro del tavolo
    this._mesh(new RoundedBoxGeometry(0.06, 0.07, 0.07, 2, 0.006).translate(TABLE.x1 - 0.005, TABLE.y - 0.02, -0.03), M.boss, S);
    this._mesh(cyl(0.006, 0.006, STR_Y - PULLEY.r - TABLE.y + 0.02, 16).translate(PULLEY.x, (STR_Y - PULLEY.r + TABLE.y) / 2 + 0.005, -0.03), M.chrome, S);
    this._mesh(cyl(0.003, 0.003, 0.036, 12).rotateX(Math.PI / 2).translate(PULLEY.x, STR_Y - PULLEY.r, -0.014), M.chrome, S);
    const wheel = new THREE.Group(); wheel.position.set(PULLEY.x, STR_Y - PULLEY.r, 0); S.add(wheel); this.wheel = wheel;
    const prof = [[0.004, -0.006], [PULLEY.r + 0.004, -0.006], [PULLEY.r + 0.004, -0.004], [PULLEY.r, -0.0005], [PULLEY.r, 0.0005], [PULLEY.r + 0.004, 0.004], [PULLEY.r + 0.004, 0.006], [0.004, 0.006]].map(([a, b]) => new THREE.Vector2(a, b));
    this._mesh(new THREE.LatheGeometry(prof, 48).rotateX(Math.PI / 2), M.brass, wheel);
    for (let k = 0; k < 3; k++) this._mesh(new THREE.BoxGeometry(0.004, PULLEY.r * 1.6, 0.003).rotateZ((k * Math.PI) / 3), M.black, wheel);
    // il filo che scende ai pesi, e i pesi a disco su un portapesi
    this.drop = this._mesh(cyl(0.0007, 0.0007, 1, 6).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.8 }), S);
    this.drop.position.set(PULLEY.x + PULLEY.r, STR_Y - PULLEY.r, 0); this.drop.scale.y = STR_Y - PULLEY.r - HANG_Y;
    this.hanger = new THREE.Group(); this.hanger.position.set(PULLEY.x + PULLEY.r, HANG_Y, 0); S.add(this.hanger);
    this._mesh(new THREE.TorusGeometry(0.008, 0.0016, 8, 24, Math.PI * 1.5).rotateZ(-Math.PI / 4).translate(0, -0.008, 0), M.chrome, this.hanger);
    this.stem = this._mesh(cyl(0.0025, 0.0025, 1, 12).translate(0, -0.5, 0), M.chrome, this.hanger);
    this.hBase = this._mesh(cyl(0.022, 0.022, 0.006, 32), M.chrome, this.hanger);
    this.discs = [];
    // vibratore: scorre sul tavolo, l'asta oscilla in verticale e tiene il capo della corda
    const v = new THREE.Group(); S.add(v); this.vib = v;
    this._mesh(new RoundedBoxGeometry(0.11, 0.1, 0.12, 3, 0.012).translate(-0.02, TABLE.y + 0.05, 0), M.blue, v);
    this._mesh(cyl(0.035, 0.035, 0.012, 32).translate(0, TABLE.y + 0.106, 0), M.black, v);
    this.shaft = new THREE.Group(); v.add(this.shaft);
    this._mesh(cyl(0.004, 0.004, STR_Y - TABLE.y - 0.1, 16).translate(0, (STR_Y + TABLE.y + 0.1) / 2, 0), M.chrome, this.shaft);
    this._mesh(new RoundedBoxGeometry(0.014, 0.012, 0.014, 2, 0.002).translate(0, STR_Y, 0), M.black, this.shaft);
    for (const s of [-1, 1]) { this._mesh(cyl(0.0075, 0.0075, 0.003, 6).rotateZ(Math.PI / 2).translate(-0.0765, TABLE.y + 0.03, s * 0.025), M.chrome, v); this._mesh(cyl(0.005, 0.005, 0.008, 16).rotateZ(Math.PI / 2).translate(-0.082, TABLE.y + 0.03, s * 0.025), s > 0 ? M.red : M.black, v); }
    // righello sul tavolo: lo zero sotto la carrucola, si legge la lunghezza verso sinistra
    const cm = 170, Wp = ((cm / 100) * 4096) / (4096 - 40);
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(Wp, 0.03).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rulerTexture(cm, true), roughness: 0.6 }));
    ruler.position.set(PULLEY.x + (20 / 4096) * Wp - Wp / 2, TABLE.y + 0.001, 0.07); ruler.receiveShadow = true; S.add(ruler);
    // la corda (tubo che si deforma), il suo doppio largo per il contorno, la scia e le due onde progressive
    this.strMat = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.75 });
    this.str = this._tube(this.strMat, S);
    this.str.mesh.castShadow = true;
    this.proxy = this._tube(new THREE.MeshBasicMaterial({ color: 0xffffff }), S);
    this.proxy.mesh.layers.disableAll();                                  // solo nel passaggio del contorno
    // scia: la corda passa più tempo vicino agli estremi dell'oscillazione, lì la scia è più fitta
    this.bandMat = new THREE.MeshBasicMaterial({ color: '#f1ece0', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NS + 1) * 5 * 3), 3));
    const ca = new Float32Array((NS + 1) * 5 * 4), dens = [1, 0.62, 0.42, 0.62, 1];
    for (let j = 0; j <= NS; j++) for (let k = 0; k < 5; k++) { const o = (j * 5 + k) * 4; ca[o] = 1; ca[o + 1] = 1; ca[o + 2] = 1; ca[o + 3] = dens[k]; }
    bg.setAttribute('color', new THREE.BufferAttribute(ca, 4));
    const bi = []; for (let j = 0; j < NS; j++) for (let k = 0; k < 4; k++) { const a = j * 5 + k, b = a + 5; bi.push(a, a + 1, b, a + 1, b + 1, b); }
    bg.setIndex(bi);
    this.band = new THREE.Mesh(bg, this.bandMat); this.band.frustumCulled = false; this.band.renderOrder = 4; this.band.userData.noAO = true; S.add(this.band);
    this.travel = ['#e8452c', '#2c67dc'].map((c) => {
      const buf = new SegBuffer(NS);
      const line = new LineSegments2(buf.geometry(), new LineMaterial({ color: new THREE.Color(c), linewidth: 2.4, transparent: true, opacity: 0.9, depthWrite: false }));
      line.frustumCulled = false; line.renderOrder = 6; line.userData.noAO = true; S.add(line);
      return { buf, line, col: new THREE.Color(c) };
    });
    // segni dei nodi (blu) e dei ventri (rossi) sul righello
    this.marks = Array.from({ length: 24 }, () => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.016, 16).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: '#2c67dc', roughness: 0.4 }));
      m.visible = false; m.userData.noOutline = true; S.add(m); return m;
    });
  }
  _tube(mat, parent) {
    const RS = 6, n = (NS + 1) * RS, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let j = 0; j < NS; j++) for (let k = 0; k < RS; k++) { const a = j * RS + k, b = j * RS + ((k + 1) % RS), c = a + RS, d = b + RS; idx.push(a, c, b, b, c, d); }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = false;
    parent.add(mesh);
    return { mesh, geo, RS };
  }
  /** Ridisegna la corda: ys[j] spostamento (m) nei NS+1 punti fra il vibratore (x0) e la carrucola. */
  _shapeTube(T, x0, L, ys, r) {
    const p = T.geo.attributes.position.array, nn = T.geo.attributes.normal.array, RS = T.RS;
    for (let j = 0; j <= NS; j++) {
      const x = x0 + (L * j) / NS, y = STR_Y + ys[j];
      for (let k = 0; k < RS; k++) {
        const a = (k / RS) * Math.PI * 2, cy = Math.cos(a), cz = Math.sin(a), o = (j * RS + k) * 3;
        p[o] = x; p[o + 1] = y + r * cy; p[o + 2] = r * cz; nn[o] = 0; nn[o + 1] = cy; nn[o + 2] = cz;
      }
    }
    T.geo.attributes.position.needsUpdate = true; T.geo.attributes.normal.needsUpdate = true;
  }
  setString(key) {
    const s = STRINGS[key];
    // la scia è scurita verso l'ardesia: sullo sfondo chiaro un filo bianco che vibra si vedrebbe appena
    this.strMat.color.set(s.color); this.bandMat.color.set(s.color).lerp(new THREE.Color('#262b33'), 0.6); this.drop.material.color.set(s.color);
    this.strR = s.r;
  }
  /** Lunghezza L (dal vibratore alla carrucola) e massa appesa (kg). */
  setMelde(L, mass) {
    const xv = PULLEY.x - L;
    this.vib.position.x = xv; this.xv = xv; this.L = L;
    // pesi: portapesi da 20 g più dischi da 50 g (l'ultimo più sottile se serve)
    const n = Math.max(0, Math.round((mass - 0.02) / 0.05));
    while (this.discs.length < n) this.discs.push(this._mesh(cyl(0.026, 0.026, 0.0075, 40), this.M.brass, this.hanger));
    this.discs.forEach((d, i) => { d.visible = i < n; d.position.y = -0.03 - 0.004 - 0.0075 * (i + 0.5) - 0.0004 * i; });
    const bottom = -0.03 - 0.004 - (0.0079 * n) - 0.004;
    this.stem.scale.y = -bottom - 0.012; this.stem.position.y = -0.012;
    this.hBase.position.y = bottom;
    this.updateCables('string');
  }

  // ───────────────────────────── cavi ─────────────────────────────
  _buildCables() {
    const lead = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0 });
    this.leadMats = [lead('#c62a1d'), lead('#1c1d20')];
    const mk = (mat) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.castShadow = true; m.receiveShadow = true; m.userData.noOutline = true; this.group.add(m); return m; };
    this.leads = this.leadMats.map(mk);
    // spine a banana: corpo isolato e manicotto, una per capo di ogni filo
    const plugGeo = cyl(0.0048, 0.0042, 0.026, 20).translate(0, 0.013, 0);
    const bootGeo = cyl(0.0032, 0.0024, 0.012, 16).translate(0, 0.031, 0);
    this.plugs = this.leadMats.map((mat) => [0, 1].map(() => { const g = new THREE.Group(); this.group.add(g); for (const geo of [plugGeo, bootGeo]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.userData.noOutline = true; g.add(m); } return g; }));
    this.power = mk(new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.7 }));
    this.powerPlug = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.016, 0.03, 2, 0.003), new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.6 }));
    this.powerPlug.castShadow = true; this.group.add(this.powerPlug);
  }
  /** Ricostruisce i cavi: due fili (rosso e nero) dalle boccole del generatore al vibratore o alla cassa, e la
   *  spina di rete del generatore che scende dal bordo del tavolo. */
  updateCables(mode) {
    if (!this.leads) return;
    const V = (x, y, z) => new THREE.Vector3(x, y, z), ty = TABLE.y + 0.0024;
    this.genG.updateMatrixWorld(true); this.group.updateMatrixWorld(true);
    const gq = this.genG.getWorldQuaternion(new THREE.Quaternion()), out0 = V(0, 0, 1).applyQuaternion(gq);
    const gen = [V(0.07, 0.028, 0.111), V(0.1, 0.028, 0.111)].map((p) => this.genG.localToWorld(p));
    let dev, out1, via, d0 = 0.11, d1 = 0.12;
    if (mode === 'string') {
      this.vib.updateMatrixWorld(true);
      dev = [V(-0.086, TABLE.y + 0.03, 0.025), V(-0.086, TABLE.y + 0.03, -0.025)].map((p) => this.vib.localToWorld(p));
      out1 = V(-1, 0, 0);
      const a = gen[0].clone().addScaledVector(out0, 0.12), b = dev[0].clone().addScaledVector(out1, 0.14);
      via = [V((a.x + b.x) / 2, ty, (a.z + b.z) / 2 + 0.035)];
    } else {
      this.sp.updateMatrixWorld(true);
      dev = this.spJacks.map((p) => this.sp.localToWorld(p.clone()));
      out1 = V(-1, 0, 0);
      // dietro il piede della cassa, non sotto
      via = [V(this.sp.position.x - 0.06, ty, -0.09), V(this.sp.position.x - 0.175, ty, -0.055)];
      d0 = 0.09; d1 = 0.075;
    }
    for (let k = 0; k < 2; k++) {
      const P = gen[k], Q = dev[k], side = (k ? -1 : 1) * 0.0035;
      const pts = [
        P.clone().addScaledVector(out0, 0.04),
        P.clone().addScaledVector(out0, d0 * 0.62).setY((P.y + ty) / 2 + 0.004),
        P.clone().addScaledVector(out0, d0).setY(ty),
        ...via.map((v) => v.clone().add(V(0, 0, side))),
        Q.clone().addScaledVector(out1, d1).setY(ty),
        Q.clone().addScaledVector(out1, d1 * 0.62).setY((Q.y + ty) / 2 + 0.004),
        Q.clone().addScaledVector(out1, 0.04),
      ];
      this.leads[k].geometry.dispose();
      this.leads[k].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 160, 0.0022, 8, false);
      // le spine: infilate nelle boccole, puntate verso fuori
      for (const [g, at, dir] of [[this.plugs[k][0], P, out0], [this.plugs[k][1], Q, out1]]) { g.position.copy(at); g.quaternion.setFromUnitVectors(V(0, 1, 0), dir); }
    }
    // cavo di rete: dal retro del generatore al bordo del tavolo, giù fino al pavimento
    const back = this.genG.localToWorld(V(-0.09, 0.03, -0.1)), bout = V(0, 0, -1).applyQuaternion(gq), z0 = TABLE.z0;
    const pw = [back.clone().addScaledVector(bout, 0.012), back.clone().addScaledVector(bout, 0.05).setY(TABLE.y + 0.012), V(back.x + 0.01, TABLE.y + 0.0035, z0 + 0.03), V(back.x + 0.02, TABLE.y - 0.004, z0 - 0.008), V(back.x + 0.03, TABLE.y - 0.12, z0 - 0.03), V(back.x + 0.05, 0.25, z0 - 0.06), V(back.x + 0.08, 0.004, z0 - 0.2), V(back.x + 0.25, 0.004, z0 - 0.45), V(back.x + 0.55, 0.004, z0 - 0.6)];
    this.power.geometry.dispose();
    this.power.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pw, false, 'centripetal'), 120, 0.0032, 8, false);
    this.powerPlug.position.copy(back.clone().addScaledVector(bout, 0.0)); this.powerPlug.quaternion.copy(gq);
  }
  /** Corda: forma ys (o null), scia amp (ampiezze) con opacità bandOp, onde progressive (null o [yr, yl]). */
  drawString(ys, amps, bandOp, waves, y0) {
    const L = this.L, x0 = this.xv;
    this.shaft.position.y = y0;
    this.str.mesh.visible = !!ys; this.proxy.mesh.visible = !!ys;
    if (ys) { this._shapeTube(this.str, x0, L, ys, this.strR); this._shapeTube(this.proxy, x0, L, ys, Math.max(0.0035, this.strR * 3)); }
    this.band.visible = bandOp > 0.01;
    if (this.band.visible) {
      this.bandMat.opacity = bandOp;
      const p = this.band.geometry.attributes.position.array, fr = [1, 0.72, 0, -0.72, -1];
      for (let j = 0; j <= NS; j++) {
        const x = x0 + (L * j) / NS, a = Math.max(amps[j], this.strR * 0.7);
        for (let k = 0; k < 5; k++) { const o = (j * 5 + k) * 3; p[o] = x; p[o + 1] = STR_Y + a * fr[k]; p[o + 2] = 0; }
      }
      this.band.geometry.attributes.position.needsUpdate = true;
    }
    this.travel.forEach((T, k) => {
      T.line.visible = !!waves;
      if (!waves) return;
      const w = waves[k], b = T.buf; b.reset();
      for (let j = 0; j < NS; j++) b.push(x0 + (L * j) / NS, STR_Y + w[j], 0.012, x0 + (L * (j + 1)) / NS, STR_Y + w[j + 1], 0.012, T.col, 0, 0);
      b.commit();
    });
  }
  /** Segni sotto nodi e ventri: liste di posizioni x dal vibratore (m). */
  setMarks(nodes, antis) {
    let k = 0;
    const put = (x, col) => { if (k >= this.marks.length) return; const m = this.marks[k++]; m.visible = true; m.position.set(this.xv + x, TABLE.y + 0.012, 0.045); m.material.color.set(col); };
    if (nodes) { for (const x of nodes) put(x, '#2c67dc'); for (const x of antis) put(x, '#e8452c'); }
    for (; k < this.marks.length; k++) this.marks[k].visible = false;
  }

  // ───────────────────────────── stroboscopio ─────────────────────────────
  _buildStrobe() {
    const M = this.M, g = new THREE.Group(); g.position.set(0.15, TABLE.y, -0.27); this.strG.add(g); this.strobeG = g;
    this._mesh(cyl(0.05, 0.055, 0.014, 32).translate(0, 0.007, 0), M.iron, g);
    this._mesh(cyl(0.006, 0.006, 0.3, 16).translate(0, 0.15, 0), M.chrome, g);
    const head = new THREE.Group(); head.position.y = 0.3; head.rotation.x = 0.25; g.add(head);
    this._mesh(new RoundedBoxGeometry(0.16, 0.08, 0.07, 3, 0.01), M.black, head);
    this.flashMat = new THREE.MeshStandardMaterial({ color: '#dfe8ff', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.2 });
    this._mesh(new RoundedBoxGeometry(0.13, 0.05, 0.006, 2, 0.003).translate(0, 0, 0.036), this.flashMat, head);
    this.strobeLight = new THREE.SpotLight('#eef3ff', 0, 3, 0.7, 0.5, 1.2);
    this.strobeLight.position.set(0.15, TABLE.y + 0.3, -0.24);
    this.strobeLight.target.position.set(0, STR_Y, 0.05);
    this.strG.add(this.strobeLight, this.strobeLight.target);
  }
  setStrobe(on, flash) {
    this.strobeLight.intensity = on ? 2.2 : 0;
    this.flashMat.emissiveIntensity = on ? (flash ? 3 : 1.2) : 0;
  }

  // ───────────────────────────── il tubo sonoro ─────────────────────────────
  _buildTube() {
    const M = this.M, T = this.tubeG, r = TUBE_R;
    // pezzo fisso (più largo) e pezzo che scorre dentro: la lunghezza si regola a cannocchiale
    this.tubeA = this._mesh(cyl(r + 0.0028, r + 0.0028, 0.3, 48, true).rotateZ(Math.PI / 2).translate(TUBE_X + 0.15, TUBE_Y, 0), M.glass, T);
    this.tubeB = this._mesh(cyl(r + 0.0012, r + 0.0012, 1, 48, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0), M.glass, T);
    this.tubeB.position.set(TUBE_X + 0.26, TUBE_Y, 0);
    this.rimA = this._mesh(new THREE.TorusGeometry(r + 0.0028, 0.0014, 8, 48).rotateY(Math.PI / 2), M.glass, T); this.rimA.position.set(TUBE_X, TUBE_Y, 0);
    this.rimB = this._mesh(new THREE.TorusGeometry(r + 0.0012, 0.0014, 8, 48).rotateY(Math.PI / 2), M.glass, T); this.rimB.position.y = TUBE_Y;
    this._mesh(new THREE.TorusGeometry(r + 0.0028, 0.0018, 8, 48).rotateY(Math.PI / 2).translate(TUBE_X + 0.3, TUBE_Y, 0), M.glass, T);
    // supporti a V
    this.supports = [0, 1].map(() => {
      const g = new THREE.Group(); T.add(g);
      this._mesh(new RoundedBoxGeometry(0.05, TUBE_Y - r - TABLE.y - 0.002, 0.07, 2, 0.004).translate(0, (TUBE_Y - r + TABLE.y) / 2, 0), M.iron, g);
      for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(0.05, 0.03, 0.008).rotateX(s * 0.7).translate(0, TUBE_Y - r + 0.004, s * 0.022), M.iron, g);
      return g;
    });
    // tappo (tubo chiuso)
    this.cap = this._mesh(cyl(r + 0.0035, r + 0.0035, 0.008, 48).rotateZ(Math.PI / 2), M.alu, T); this.cap.position.y = TUBE_Y;
    // altoparlante: cassa e membrana
    const sp = new THREE.Group(); sp.position.set(TUBE_X, TUBE_Y, 0); T.add(sp); this.spk = sp;
    this._mesh(new RoundedBoxGeometry(0.11, 0.15, 0.15, 3, 0.01).translate(-0.06, 0, 0), M.black, sp);
    this._mesh(new THREE.BoxGeometry(0.05, TUBE_Y - TABLE.y - 0.075, 0.1).translate(-0.06, -(TUBE_Y - TABLE.y + 0.075) / 2, 0), M.iron, sp);
    this._mesh(new THREE.TorusGeometry(0.048, 0.005, 10, 48).rotateY(Math.PI / 2).translate(-0.004, 0, 0), M.boss, sp);
    this.membrane = new THREE.Group(); sp.add(this.membrane);
    const cone = [[0.012, -0.02], [0.046, -0.004], [0.046, -0.002]].map(([a, b]) => new THREE.Vector2(a, b));
    this._mesh(new THREE.LatheGeometry(cone, 48).rotateZ(-Math.PI / 2), M.cone, this.membrane);
    this._mesh(new THREE.SphereGeometry(0.014, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).translate(-0.02, 0, 0), M.boss, this.membrane);
    // morsetti d'ingresso sul retro della cassa (rosso e nero)
    this.spJacks = [new THREE.Vector3(-0.131, -0.035, 0.022), new THREE.Vector3(-0.131, -0.035, -0.022)];
    this.spJacks.forEach((p, k) => {
      this._mesh(cyl(0.0075, 0.0075, 0.004, 6).rotateZ(Math.PI / 2).translate(-0.117, p.y, p.z), M.chrome, sp);
      this._mesh(cyl(0.0055, 0.0055, 0.012, 20).rotateZ(Math.PI / 2).translate(-0.125, p.y, p.z), k ? M.black : M.red, sp);
    });
    this.sp = sp;
    // particelle d'aria
    this.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0026, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4 }), NCOL_MAX * NROW);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.parts.frustumCulled = false; this.parts.userData.noAO = true;
    this.parts.setColorAt(0, new THREE.Color()); this.parts.instanceColor.setUsage(THREE.DynamicDrawUsage);
    T.add(this.parts);
    // letto di polvere sul fondo: una mappa d'altezza fitta (si costruisce in buildBed). Dove l'aria vibra, ogni
    // punto della superficie trema (lungo l'asse con l'aria, e in su): lo fa la scheda grafica, letta l'agitazione
    // da una piccola tessitura lungo il tubo (rosso: agitazione, verde: creste)
    this.agitData = new Uint8Array((BED_N + 1) * 4);
    this.agitTex = new THREE.DataTexture(this.agitData, BED_N + 1, 1, THREE.RGBAFormat);
    this.agitTex.magFilter = THREE.LinearFilter; this.agitTex.minFilter = THREE.LinearFilter; this.agitTex.needsUpdate = true;
    this.grainU = {
      uTime: { value: 0 }, uAgit: { value: this.agitTex }, uX0: { value: TUBE_X }, uLen: { value: 1 }, uTubeY: { value: TUBE_Y }, uR: { value: TUBE_R },
      uJx: { value: 0.0006 }, uJy: { value: 0.0006 }, uH: { value: 0.003 }, uBase: { value: 0.001 }, uHop: { value: 0.004 }, uSize: { value: 0.001 }, uHalfH: { value: 500 }, uColor: { value: new THREE.Color('#e4c798') },
    };
    const bedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    bedMat.onBeforeCompile = (sh) => {
      for (const k of ['uTime', 'uAgit', 'uX0', 'uLen', 'uTubeY', 'uR', 'uJx', 'uJy', 'uH']) sh.uniforms[k] = this.grainU[k];
      sh.vertexShader = 'uniform float uTime, uX0, uLen, uTubeY, uR, uJx, uJy, uH;\nuniform sampler2D uAgit;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float pag = texture2D(uAgit, vec2(clamp((transformed.x - uX0) / uLen, 0.0, 1.0), 0.5)).r;
          if (pag > 0.002) {
            float ph = fract(sin(dot(transformed.xz * 1000.0, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
            float hl = transformed.y - (uTubeY - sqrt(max(uR * uR - transformed.z * transformed.z, 0.0)));
            float k = pag * (0.3 + 0.7 * clamp(hl / uH, 0.0, 1.0));
            transformed.x += k * uJx * sin(uTime * 53.0 + ph);
            transformed.y += k * uJy * (0.5 + 0.5 * sin(uTime * 37.0 + 1.7 * ph));
          }
        }`);
    };
    bedMat.customProgramCacheKey = () => 'kundt-bed';
    this.powder = new THREE.Mesh(new THREE.BufferGeometry(), bedMat);
    this.powder.frustumCulled = false; this.powder.receiveShadow = true; this.powder.castShadow = false; this.powder.userData.noOutline = true; T.add(this.powder);
    // granelli che saltellano sopra le creste dove l'aria vibra: posizioni e salti calcolati nella scheda grafica
    const NG = 900, gg = new THREE.BufferGeometry(), seed = new Float32Array(NG * 3);
    let sd = 777;
    const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < NG; i++) { seed[i * 3] = rnd(); seed[i * 3 + 1] = (rnd() * 2 - 1) * 0.0095; seed[i * 3 + 2] = rnd(); }
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NG * 3), 3));
    gg.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    this.grains = new THREE.Points(gg, new THREE.ShaderMaterial({
      uniforms: this.grainU,
      vertexShader: `uniform float uTime, uX0, uLen, uTubeY, uR, uH, uBase, uHop, uSize, uHalfH;
        uniform sampler2D uAgit;
        attribute vec3 seed;
        varying float vShade;
        void main() {
          vec4 a = texture2D(uAgit, vec2(seed.x, 0.5));
          float ag = a.r, rg = a.g;
          // ogni granello salta più volte al secondo, con un ritmo suo, e ricade un poco più in là
          float t = uTime * (3.0 + 4.0 * fract(seed.z * 7.13)) + seed.z * 17.0;
          float cyc = floor(t), u = fract(t);
          float hs = fract(sin((cyc + seed.z * 91.7) * 12.9898) * 43758.5453);
          float x = uX0 + seed.x * uLen + (hs - 0.5) * 0.004 * ag;
          float z = seed.y;
          float yb = uTubeY - sqrt(max(uR * uR - z * z, 0.0));
          float y = yb + uBase + rg * uH * 0.5 + 4.0 * u * (1.0 - u) * uHop * ag * (0.35 + 0.65 * hs);
          vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = ag > 0.12 ? uSize * projectionMatrix[1][1] * uHalfH / -mv.z : 0.0;
          vShade = 0.85 + 0.3 * hs;
        }`,
      fragmentShader: `uniform vec3 uColor;
        varying float vShade;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r2 = dot(c, c);
          if (r2 > 0.25) discard;
          gl_FragColor = vec4(uColor * vShade * (0.62 + 1.2 * (0.25 - r2) - 0.3 * c.y), 1.0);   // una sferetta: più chiara al centro, scura sotto
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    this.grains.frustumCulled = false; this.grains.userData.noAO = true; this.grains.renderOrder = 3; T.add(this.grains);
    // righello davanti al tubo: lo zero all'altoparlante
    const cm = 160, Wp = ((cm / 100) * 4096) / (4096 - 40);
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(Wp, 0.03).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rulerTexture(cm, false), roughness: 0.6 }));
    ruler.position.set(TUBE_X - (20 / 4096) * Wp + Wp / 2, TABLE.y + 0.001, 0.075); ruler.receiveShadow = true; T.add(ruler);
  }
  /** Tubo lungo L, estremi ends ('cc', 'co', 'oo'). */
  setTube(L, ends) {
    this.tubeL = L;
    this.tubeB.scale.x = L - 0.26;
    this.rimB.position.x = TUBE_X + L;
    this.cap.visible = ends === 'cc'; this.cap.position.x = TUBE_X + L + 0.004;
    this.sp.position.x = ends === 'oo' ? TUBE_X - 0.035 : TUBE_X;
    this.supports[0].position.x = TUBE_X + 0.12; this.supports[1].position.x = TUBE_X + L - 0.1;
    this.rimA.visible = true;
    this.grainU.uLen.value = L;
    this.updateCables('tube');
  }
  /** Polvere che vibra: agitazione (0…1) e creste lungo il tubo, tempo dell'animazione, scala dei punti. */
  setGrainField(agit, ridge, n) {
    const d = this.agitData;
    for (let j = 0; j <= n; j++) { d[j * 4] = Math.round(255 * Math.min(1, agit[j])); d[j * 4 + 1] = Math.round(255 * Math.min(1, ridge[j])); }
    this.agitTex.needsUpdate = true;
  }
  setGrainTime(t, halfH) { this.grainU.uTime.value = t; this.grainU.uHalfH.value = halfH; }
  setGrainShow(show) { this.grains.visible = show; }
  /** Particelle: sx(x) spostamento visibile (m) e pc(x) pressione relativa (−1…1). */
  drawTube(sAt, pAt, membrane, showParts) {
    const L = this.tubeL, ncol = Math.min(NCOL_MAX, Math.round(L / 0.0115)), m = new THREE.Matrix4(), c = new THREE.Color();
    this.membrane.position.x = membrane;
    this.parts.visible = showParts;
    if (!showParts) return;
    let k = 0;
    for (let j = 0; j < ncol; j++) {
      const x0 = ((j + 0.5) / ncol) * L, dx = sAt(x0), p = Math.max(-1, Math.min(1, pAt(x0)));
      c.setRGB(0.55 + 0.4 * Math.max(p, 0) - 0.4 * Math.max(-p, 0), 0.55 - 0.35 * Math.abs(p), 0.58 + 0.4 * Math.max(-p, 0) - 0.4 * Math.max(p, 0));
      for (let r = 0; r < NROW; r++) {
        const y = TUBE_Y + (r - (NROW - 1) / 2) * 0.0085, z = ((j * 7 + r * 3) % 5 - 2) * 0.004;
        m.makeTranslation(TUBE_X + x0 + dx, y, z); this.parts.setMatrixAt(k, m); this.parts.setColorAt(k, c); k++;
      }
    }
    this.parts.count = k;
    this.parts.instanceMatrix.needsUpdate = true; this.parts.instanceColor.needsUpdate = true;
  }
  /** Letto di polvere per un tubo lungo L: griglia lungo il tubo (passo ≤ s/7) e di traverso sul fondo curvo,
   *  con la grana (piccole irregolarità fisse di altezza e colore) e i parametri casuali delle creste. */
  buildBed(L, key) {
    const G = GRAINS[key], dx = Math.max(G.s / 7, L / 3200), nx = Math.round(L / dx) + 1, nz = 13, w = 0.0115, n = nx * nz;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3), base = new THREE.Color(G.color), gn = new Float32Array(n);
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cb = new Float32Array(n);
    for (let i = 0; i < n; i++) { const f = 0.86 + 0.26 * rnd(); cb[i] = f; col[i * 3] = base.r * f; col[i * 3 + 1] = base.g * f; col[i * 3 + 2] = base.b * f; gn[i] = (rnd() - 0.5) * G.grain; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let i = 0; i < nx - 1; i++) for (let k = 0; k < nz - 1; k++) { const a = i * nz + k, b = a + nz; idx[o++] = a; idx[o++] = a + 1; idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1; idx[o++] = b; }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const zs = new Float32Array(nz), yb = new Float32Array(nz), tb = new Float32Array(nz), tr = new Float32Array(nz);
    for (let k = 0; k < nz; k++) {
      const z = -w + (2 * w * k) / (nz - 1), q = Math.max(0, 1 - (z / w) ** 2);
      zs[k] = z; yb[k] = TUBE_Y - Math.sqrt(TUBE_R * TUBE_R - z * z) + 0.0003; tb[k] = Math.sqrt(q); tr[k] = q ** 0.25;
    }
    // ogni cresta ha la sua altezza e un piccolo spostamento: non sono tutte uguali
    const nc = Math.ceil(L / G.s) + 8, rh = new Float32Array(nc), sh = new Float32Array(nc);
    for (let c = 0; c < nc; c++) { rh[c] = 0.7 + 0.5 * rnd(); sh[c] = (rnd() - 0.5) * 0.22; }
    this.powder.geometry.dispose(); this.powder.geometry = geo;
    const U = this.grainU;
    U.uLen.value = L; U.uH.value = G.H; U.uBase.value = G.base; U.uHop.value = G.hop; U.uSize.value = G.size; U.uJx.value = G.jx; U.uJy.value = G.jy; U.uColor.value.set(G.color);
    this.bed = { G, L, dx, nx, nz, w, zs, yb, tb, tr, gn, rh, sh, cb, base, h: new Float32Array(n) };
  }
  /** Ridisegna il letto: baseAt(x) spessore relativo (1 = uniforme), ridgeAt(x) creste (0 liscio … 1 piene). */
  drawBed(baseAt, ridgeAt, show) {
    this.powder.visible = show;
    if (!show || !this.bed) return;
    const B = this.bed, G = B.G, { nx, nz, dx, w, zs, yb, tb, tr, gn, rh, sh, cb, base, h } = B;
    const p = this.powder.geometry.attributes.position.array, nn = this.powder.geometry.attributes.normal.array, col = this.powder.geometry.attributes.color.array;
    for (let i = 0; i < nx; i++) {
      const x = i * dx, rf = ridgeAt(x), b = baseAt(x) * G.base, r = rf * G.H;
      for (let k = 0; k < nz; k++) {
        const v = i * nz + k, zr = zs[k] / w;
        let c = 0;
        if (r > 1e-6) {
          // creste trasversali, appena inclinate e incurvate di traverso
          const ph = (x + G.s * (0.2 * zr + 0.15 * zr * zr)) / G.s + 4, ci = Math.floor(ph), u = ph - ci - 0.5 - sh[ci];
          c = Math.max(0, 1 - Math.abs(u) / 0.24) ** 1.2 * rh[ci];       // creste sottili, a lama
        }
        // fra una cresta e l'altra la polvere si dirada (è salita nelle creste) e il fondo si vede più scuro
        const gap = rf * (1 - Math.min(1, c));
        const hh = tb[k] * b * (1 - 0.9 * gap) + tr[k] * r * c + gn[v] * (0.4 + Math.min(1, b / G.base));
        h[v] = hh;
        p[v * 3] = TUBE_X + x; p[v * 3 + 1] = yb[k] + hh; p[v * 3 + 2] = zs[k];
        const f = cb[v] * (1 - 0.5 * gap) * (0.82 + 0.18 * tb[k]);
        col[v * 3] = base.r * f; col[v * 3 + 1] = base.g * f; col[v * 3 + 2] = base.b * f;
      }
    }
    this.powder.geometry.attributes.color.needsUpdate = true;
    // normali dalle pendenze della superficie (fondo curvo più polvere)
    const dz = (2 * w) / (nz - 1);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const v = i * nz + k, iL = Math.max(0, i - 1), iR = Math.min(nx - 1, i + 1), kL = Math.max(0, k - 1), kR = Math.min(nz - 1, k + 1);
      const gx = (h[iR * nz + k] - h[iL * nz + k]) / ((iR - iL) * dx);
      const gz = (yb[kR] + h[i * nz + kR] - yb[kL] - h[i * nz + kL]) / ((kR - kL) * dz);
      const inv = 1 / Math.hypot(gx, 1, gz);
      nn[v * 3] = -gx * inv; nn[v * 3 + 1] = inv; nn[v * 3 + 2] = -gz * inv;
    }
    this.powder.geometry.attributes.position.needsUpdate = true; this.powder.geometry.attributes.normal.needsUpdate = true;
  }
  setMode(mode) {
    this.strG.visible = mode === 'string'; this.tubeG.visible = mode === 'tube';
    // il generatore sta dietro il vibratore, o in fondo al tavolo lontano dall'altoparlante
    if (mode === 'string') { this.genG.position.set(-0.76, TABLE.y, -0.2); this.genG.rotation.y = 0.18; } else { this.genG.position.set(-0.86, TABLE.y, -0.25); this.genG.rotation.y = 0.25; }
    this.updateCables(mode);
  }
}
/** Risoluzione dei campi della polvere (spessore e creste) lungo il tubo. */
export const BED_N = 300;
