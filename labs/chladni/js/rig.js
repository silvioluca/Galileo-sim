// rig.js — l'apparato in 3D. Col vibratore: la lamina avvitata sull'albero di un vibratore meccanico, collegato
// con due cavi a un generatore di funzioni che mostra la frequenza. Con l'archetto (il metodo di Chladni): la
// lamina stretta al centro in un morsetto su un sostegno, l'archetto di violino che sfrega il bordo. Sulla lamina: i granelli, le linee nodali previste, la mappa dell'ampiezza.
// Coordinate ridotte della lamina (x lungo il lato lungo, y di traverso, semilunghezza 1) → locali del gruppo
// della lamina: (a·x, quota, −a·y). La lamina ha il centro nell'origine del mondo, a quota PLATE_Y.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SHAPES } from './plate.js';
import { ST } from './sand.js';

export const PLATE_Y = 0.2;                 // quota della faccia superiore della lamina sul vibratore (m)
export const BOW_Y = 0.6;                    // sul sostegno, per l'archetto
const MONO = '"Geist Mono Variable", Consolas, monospace';
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const std = (o) => new THREE.MeshStandardMaterial(o);

const PLATE_LOOK = {
  al: { top: { color: '#24262a', metalness: 0.3, roughness: 0.38, envMapIntensity: 1.2 }, edge: { color: '#c3c8ce', metalness: 1, roughness: 0.32, envMapIntensity: 1 } },
  brass: { top: { color: '#c9a24f', metalness: 1, roughness: 0.3, envMapIntensity: 1 }, edge: { color: '#b38c3c', metalness: 1, roughness: 0.28, envMapIntensity: 1 } },
  steel: { top: { color: '#9aa0a7', metalness: 1, roughness: 0.36, envMapIntensity: 1 }, edge: { color: '#b9bec4', metalness: 1, roughness: 0.3, envMapIntensity: 1 } },
  // il vetro: verdolino, con i riflessi dello studio; il bordo, visto di taglio, è verde scuro
  glass: { top: { color: '#a9cfc0', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.5, envMapIntensity: 1.8 }, edge: { color: '#3f7f68', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.92, envMapIntensity: 1.4 } },
};
export const GRAIN_LOOK = {
  sand: [['#e6d6b0', 0.5], ['#d9c49a', 0.3], ['#f1e6cc', 0.2]],
  salt: [['#f6f6f2', 0.6], ['#ebebe6', 0.4]],
  lyco: [['#e6c43c', 0.6], ['#d9b02a', 0.4]],
};

export class Rig {
  constructor(maxGrains) {
    this.group = new THREE.Group(); this.group.name = 'piastre di Chladni';
    this.M = {
      black: std({ color: '#1c1e22', metalness: 0.2, roughness: 0.55 }),
      body: std({ color: '#3a3e45', metalness: 0.25, roughness: 0.5 }),
      panel: std({ color: '#d9dbdf', metalness: 0.1, roughness: 0.5 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      steel: std({ color: '#8d949c', metalness: 0.9, roughness: 0.35 }),
      rubber: std({ color: '#141516', metalness: 0, roughness: 0.85 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      redCable: std({ color: '#b3261c', metalness: 0, roughness: 0.55 }),
      blackCable: std({ color: '#1a1b1d', metalness: 0, roughness: 0.55 }),
      wood: std({ color: '#5a2c17', metalness: 0, roughness: 0.42 }),
      ebony: std({ color: '#141210', metalness: 0.1, roughness: 0.35 }),
      hair: std({ color: '#f2eee4', metalness: 0, roughness: 0.75 }),
      nail: std({ color: '#ecc3b0', metalness: 0, roughness: 0.3 }),
      iron: std({ color: '#2b2e33', metalness: 0.6, roughness: 0.45 }),
    };
    this.plateG = new THREE.Group(); this.plateY = PLATE_Y; this.plateG.position.y = PLATE_Y; this.group.add(this.plateG);
    this._buildShaker();
    this._buildGenerator();
    this._buildStand();
    this._buildBow();
    this._buildGrains(maxGrains);
    this.lineBuf = new SegBuffer(12000);
    this.lines = new LineSegments2(this.lineBuf.geometry(), new LineMaterial({ color: 0xe8452c, linewidth: 2, worldUnits: false, transparent: true, opacity: 0.9, depthTest: true }));
    this.lines.frustumCulled = false; this.lines.userData.noOutline = true; this.lines.renderOrder = 3;
    this.plateG.add(this.lines);
    this.cables = new THREE.Group(); this.group.add(this.cables);
  }
  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true;
    (parent || this.group).add(m); return m;
  }

  // ───────────────────────────── la lamina ─────────────────────────────
  /** Costruisce la lamina: forma, semilunghezza a (m), spessore h (m), materiale, punto d'attacco (ridotto). */
  setPlate(shapeId, a, h, mat, mount) {
    this.shapeId = shapeId; this.a = a; this.h = Math.max(h, 0.0008); this.mat = mat;
    const S = SHAPES[shapeId];
    for (const m of [this.top, this.bottom, this.side, this.mapMesh]) if (m) { this.plateG.remove(m); m.geometry.dispose(); }
    const nu = S.round ? 170 : 130, ns = Math.max(24, Math.round(nu * S.gmax * (S.round ? 0.75 : 1)));
    const xs = [];
    for (let i = 0; i < nu; i++) xs.push(S.round ? -Math.cos((Math.PI * i) / (nu - 1)) : -1 + (2 * i) / (nu - 1));
    const NV = nu * ns;
    const red = new Float32Array(NV * 2), pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2);
    for (let i = 0; i < nu; i++) for (let j = 0; j < ns; j++) {
      const x = xs[i], s = -1 + (2 * j) / (ns - 1), y = s * S.g(x), v = i * ns + j;
      red[2 * v] = x; red[2 * v + 1] = y;
      pos[3 * v] = a * x; pos[3 * v + 1] = 0; pos[3 * v + 2] = -a * y;
      uv[2 * v] = (x + 1) / 2; uv[2 * v + 1] = (y / S.gmax + 1) / 2;
    }
    const idx = [];
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < ns - 1; j++) {
      const v = i * ns + j;
      idx.push(v, v + ns, v + 1, v + 1, v + ns, v + ns + 1);
    }
    const mk = (flip) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(flip ? idx.slice().reverse() : idx);
      g.computeVertexNormals();
      return g;
    };
    const look = PLATE_LOOK[mat];
    this.topMat = this.topMat || std({}); this.edgeMat = this.edgeMat || std({});
    this.topMat.setValues({ transparent: false, opacity: 1, ...look.top }); this.topMat.side = THREE.FrontSide; this.topMat.depthWrite = !look.top.transparent; this.topMat.needsUpdate = true;
    this.edgeMat.setValues({ transparent: false, opacity: 1, ...look.edge }); this.edgeMat.needsUpdate = true;
    this.bottomMat = this.bottomMat || std({});
    this.bottomMat.setValues({ transparent: false, opacity: 1, ...(mat === 'al' ? look.edge : look.top) }); this.bottomMat.depthWrite = !look.top.transparent; this.bottomMat.needsUpdate = true;
    this.top = this._mesh(mk(false), this.topMat, this.plateG);
    this.bottom = this._mesh(mk(true), this.bottomMat, this.plateG);
    this.bottom.position.y = -this.h;
    this.top.userData.noAO = !!look.top.transparent; this.bottom.userData.noAO = !!look.top.transparent;
    // il bordo: anello di quadrilateri lungo il contorno
    const loop = [];
    for (let i = 0; i < nu; i++) loop.push(i * ns);                               // s = −1, x crescente
    if (!S.round) for (let j = 1; j < ns; j++) loop.push((nu - 1) * ns + j);       // x = 1
    for (let i = nu - 1; i >= 0; i--) loop.push(i * ns + ns - 1);                  // s = +1, x decrescente
    if (!S.round) for (let j = ns - 2; j > 0; j--) loop.push(j);                  // x = −1
    this.loop = loop;
    const L = loop.length, sp = new Float32Array((L + 1) * 2 * 3), si = [];
    for (let k = 0; k <= L; k++) { const v = loop[k % L]; for (const [q, dy] of [[0, 0], [1, -this.h]]) { const o = (k * 2 + q) * 3; sp[o] = pos[3 * v]; sp[o + 1] = dy; sp[o + 2] = pos[3 * v + 2]; } }
    for (let k = 0; k < L; k++) { const a0 = k * 2, b0 = (k + 1) * 2; si.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
    this.side = this._mesh(sg, this.edgeMat, this.plateG);
    // la mappa dell'ampiezza: un velo colorato che condivide le posizioni della faccia superiore
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', this.top.geometry.attributes.position);
    mg.setAttribute('normal', this.top.geometry.attributes.normal);
    mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NV * 3), 3));
    mg.setIndex(idx);
    this.mapMesh = new THREE.Mesh(mg, this.mapMat || (this.mapMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    this.mapMesh.visible = false; this.mapMesh.userData.noAO = true; this.mapMesh.userData.noOutline = true; this.mapMesh.renderOrder = 2;
    this.plateG.add(this.mapMesh);
    this.red = red; this.nv = NV; this.flat = true;
    this.setMount(mount);
  }

  /**
   * Deforma la lamina (vibrazione mostrata, esagerata): disp(x, y) → spostamento in metri; null la rimette piana.
   */
  deform(disp) {
    if (!disp && this.flat) return;
    const tp = this.top.geometry.attributes.position, bp = this.bottom.geometry.attributes.position, sp = this.side.geometry.attributes.position;
    const red = this.red, d = this.dispBuf && this.dispBuf.length === this.nv ? this.dispBuf : (this.dispBuf = new Float32Array(this.nv));
    for (let v = 0; v < this.nv; v++) { const w = disp ? disp(red[2 * v], red[2 * v + 1]) : 0; d[v] = w; tp.array[3 * v + 1] = w; bp.array[3 * v + 1] = w; }
    const L = this.loop.length;
    for (let k = 0; k <= L; k++) { const w = d[this.loop[k % L]]; sp.array[(k * 2) * 3 + 1] = w; sp.array[(k * 2 + 1) * 3 + 1] = w - this.h; }
    tp.needsUpdate = bp.needsUpdate = sp.needsUpdate = true;
    if (disp) { this.top.geometry.computeVertexNormals(); this.bottom.geometry.computeVertexNormals(); this.side.geometry.computeVertexNormals(); }
    else { for (const g of [this.top.geometry, this.bottom.geometry, this.side.geometry]) g.computeVertexNormals(); }
    for (const m of [this.top, this.bottom, this.side, this.mapMesh]) m.geometry.computeBoundingSphere();
    this.flat = !disp;
  }

  /** Colori della mappa: f(x, y) → [r, g, b]. */
  paintMap(f) {
    const c = this.mapMesh.geometry.attributes.color, red = this.red;
    for (let v = 0; v < this.nv; v++) { const col = f(red[2 * v], red[2 * v + 1]); c.array[3 * v] = col[0]; c.array[3 * v + 1] = col[1]; c.array[3 * v + 2] = col[2]; }
    c.needsUpdate = true;
  }

  // ───────────────────────────── vibratore ─────────────────────────────
  _buildShaker() {
    const M = this.M, g = this.shaker = new THREE.Group(); this.group.add(g);
    this._mesh(new RoundedBoxGeometry(0.15, 0.1, 0.15, 3, 0.012).translate(0, 0.05, 0), M.body, g);
    this._mesh(new RoundedBoxGeometry(0.158, 0.012, 0.158, 2, 0.004).translate(0, 0.006, 0), M.black, g);
    this._mesh(cyl(0.052, 0.055, 0.008, 48).translate(0, 0.102, 0), M.black, g);
    this._mesh(cyl(0.04, 0.04, 0.004, 48).translate(0, 0.106, 0), M.rubber, g);          // membrana
    this.shaft = this._mesh(cyl(0.003, 0.003, 1, 16), M.chrome, g);
    this._mesh(cyl(0.007, 0.007, 0.012, 20).translate(0, 0.114, 0), M.steel, g);
    // morsetti a banana sul davanti
    for (const [x, mat] of [[-0.025, M.red], [0.025, M.black]]) {
      this._mesh(cyl(0.007, 0.007, 0.012, 20).rotateX(Math.PI / 2).translate(x, 0.045, 0.081), mat, g);
      this._mesh(cyl(0.0022, 0.0022, 0.004, 12).rotateX(Math.PI / 2).translate(x, 0.045, 0.088), M.chrome, g);
    }
    // targhetta
    const tex = canvasTexture(512, 128, (c) => {
      c.fillStyle = '#2b2f35'; c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#d7dbe0'; c.font = `600 44px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('VIBRATORE MECCANICO', 256, 52);
      c.font = `500 26px ${MONO}`; c.fillStyle = '#9aa1ab'; c.fillText('0,1 Hz – 5 kHz · 8 Ω', 256, 98);
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.0275), std({ map: tex, roughness: 0.6, metalness: 0.2 }));
    plate.position.set(0, 0.078, 0.0755); g.add(plate);
    // dado e rondella sulla lamina
    this.nut = new THREE.Group(); this.plateG.add(this.nut);
    this._mesh(cyl(0.011, 0.011, 0.002, 32).translate(0, 0.001, 0), M.chrome, this.nut);
    this._mesh(cyl(0.0075, 0.0075, 0.007, 6).translate(0, 0.0055, 0), M.steel, this.nut);
    this._mesh(cyl(0.0032, 0.0032, 0.004, 16).translate(0, 0.0105, 0), M.chrome, this.nut);
  }

  setMount(m) {
    this.mount = m;
    const X = this.a * m[0], Z = -this.a * m[1];
    this.shaker.position.set(X, 0, Z);
    this.nut.position.set(X, 0, Z);
    // il generatore a terra, a sinistra e un po' avanti, girato verso chi guarda
    this.gen.position.set(-(this.a + 0.25), 0, this.a * 0.35 + 0.08);
    this.gen.rotation.y = 0.38;
    this.setShaft(0);
    this._buildCables();
  }
  /** L'albero del vibratore segue il punto d'attacco (dy: spostamento mostrato). */
  setShaft(dy) {
    const y0 = 0.114, y1 = this.plateY - this.h + dy;
    this.shaft.scale.set(1, Math.max(0.001, y1 - y0), 1);
    this.shaft.position.set(0, (y0 + y1) / 2, 0);
    this.nut.position.y = dy;
  }

  // ───────────────────────────── generatore di funzioni ─────────────────────────────
  _buildGenerator() {
    const M = this.M, g = this.gen = new THREE.Group(); this.group.add(g);
    this._mesh(new RoundedBoxGeometry(0.26, 0.1, 0.22, 3, 0.01).translate(0, 0.05, 0), M.panel, g);
    this._mesh(new RoundedBoxGeometry(0.266, 0.012, 0.226, 2, 0.004).translate(0, 0.006, 0), M.black, g);
    // pannello frontale con il display
    this.dispCanvas = document.createElement('canvas'); this.dispCanvas.width = 1024; this.dispCanvas.height = 384;
    this.dispTex = new THREE.CanvasTexture(this.dispCanvas); this.dispTex.colorSpace = THREE.SRGBColorSpace; this.dispTex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.09375), new THREE.MeshStandardMaterial({ map: this.dispTex, roughness: 0.45, metalness: 0.05, emissive: '#ffffff', emissiveMap: this.dispTex, emissiveIntensity: 0.22 }));
    face.position.set(0, 0.052, 0.1105); g.add(face);
    // manopole e prese
    for (const [x, r] of [[0.03, 0.013], [0.072, 0.009]]) {
      this._mesh(cyl(r, r * 1.08, 0.014, 32).rotateX(Math.PI / 2).translate(x, 0.05, 0.118), M.black, g);
      this._mesh(new THREE.BoxGeometry(0.0016, r * 0.8, 0.002).translate(x, 0.05 + r * 0.45, 0.1255), M.panel, g);
    }
    this.genJacks = [];
    for (const [y, mat] of [[0.066, M.red], [0.034, M.black]]) {
      this._mesh(cyl(0.006, 0.006, 0.01, 20).rotateX(Math.PI / 2).translate(0.108, y, 0.115), mat, g);
      this.genJacks.push(new THREE.Vector3(0.108, y, 0.122));
    }
    // piedini e maniglia
    this._mesh(cyl(0.004, 0.004, 0.24, 12).rotateZ(Math.PI / 2).translate(0, 0.09, 0.122), M.steel, g);
    this.drawDisplay({ f: 0, amp: 0, on: false, wave: 'sine' });
  }

  drawDisplay({ f, amp, on, note = '' }) {
    const c = this.dispCanvas.getContext('2d'), W = 1024, H = 384;
    c.fillStyle = '#c9ccd1'; c.fillRect(0, 0, W, H);
    // LCD
    const lx = 40, ly = 50, lw = 500, lh = 210;
    c.fillStyle = '#10140f'; c.beginPath(); c.roundRect(lx - 10, ly - 10, lw + 20, lh + 20, 14); c.fill();
    c.fillStyle = on ? '#9fd8a3' : '#2e3a2f'; c.fillRect(lx, ly, lw, lh);
    if (on) {
      c.fillStyle = '#0f2a12'; c.font = `600 108px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      const txt = f >= 1000 ? (f / 1000).toFixed(3).replace('.', ',') : f.toFixed(1).replace('.', ',');
      c.fillText(txt, lx + lw - 118, ly + 148);
      c.font = `600 50px ${MONO}`; c.textAlign = 'left'; c.fillText(f >= 1000 ? 'kHz' : 'Hz', lx + lw - 110, ly + 148);
      c.font = `500 34px ${MONO}`; c.fillText('∿ SINE', lx + 16, ly + 44);
      c.textAlign = 'right'; c.fillText(note, lx + lw - 16, ly + 44);
      // barra dell'ampiezza
      c.fillStyle = 'rgba(15,42,18,0.25)'; c.fillRect(lx + 16, ly + 175, lw - 32, 18);
      c.fillStyle = '#0f2a12'; c.fillRect(lx + 16, ly + 175, (lw - 32) * Math.max(0, Math.min(1, amp)), 18);
    }
    c.fillStyle = '#3a3f46'; c.font = `600 30px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('GENERATORE DI FUNZIONI', lx - 10, 318);
    c.font = `500 22px ${MONO}`; c.fillStyle = '#5b626c'; c.textAlign = 'center';
    c.fillText('FREQUENZA', 635, 292); c.fillText('AMPIEZZA', 807, 292); c.fillText('USCITA', 954, 70);
    // spia
    c.fillStyle = on ? '#ff4b2e' : '#5a2a22'; c.beginPath(); c.arc(570, 318, 12, 0, Math.PI * 2); c.fill();
    this.dispTex.needsUpdate = true;
  }

  _buildCables() {
    for (const m of this.cables.children) m.geometry.dispose();
    this.cables.clear();
    if (!this.genJacks) return;
    this.gen.updateMatrixWorld(true); this.shaker.updateMatrixWorld(true);
    const ends = [[0, -0.025], [1, 0.025]];
    for (const [k, dx] of ends) {
      const a = this.genJacks[k].clone().applyMatrix4(this.gen.matrixWorld);
      const b = new THREE.Vector3(dx, 0.045, 0.092).applyMatrix4(this.shaker.matrixWorld);
      const mid = a.clone().lerp(b, 0.5);
      const pts = [a, a.clone().add(new THREE.Vector3(0.02, -0.02, 0.05)), new THREE.Vector3(mid.x - 0.03 + k * 0.03, 0.006, mid.z + 0.1 + k * 0.025), b.clone().add(new THREE.Vector3(0, -0.035, 0.06)), b];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this._mesh(new THREE.TubeGeometry(curve, 80, 0.0028, 10, false), k === 0 ? this.M.redCable : this.M.blackCable, this.cables);
    }
  }

  // ───────────────────────────── sostegno e morsetto (archetto) ─────────────────────────────
  _buildStand() {
    const M = this.M, g = this.stand = new THREE.Group(); this.group.add(g);
    // una piastra di base larga e nera: pesa, e sotto una lastra di vetro fa da fondo scuro per vedere la sabbia
    this.standBase = this._mesh(new RoundedBoxGeometry(1, 0.022, 1, 2, 0.006).translate(0, 0.011, 0), std({ color: '#191a1d', metalness: 0.3, roughness: 0.7 }), g);
    this.rod = this._mesh(cyl(0.0065, 0.0065, 1, 24), M.chrome, g);
    this.clampLow = this._mesh(cyl(0.017, 0.017, 0.008, 40), M.steel, g);
    this.clampTop = new THREE.Group(); g.add(this.clampTop);
    this._mesh(cyl(0.017, 0.017, 0.008, 40).translate(0, 0.004, 0), M.steel, this.clampTop);
    this._mesh(cyl(0.004, 0.004, 0.02, 16).translate(0, 0.016, 0), M.chrome, this.clampTop);
    this._mesh(new RoundedBoxGeometry(0.03, 0.009, 0.005, 2, 0.002).translate(0, 0.026, 0), M.steel, this.clampTop);   // galletto
    g.visible = false;
  }
  setStandHeight() {
    const yTop = this.plateY - this.h - 0.008;
    const S = SHAPES[this.shapeId], w = 2 * this.a + 0.1, d = 2 * this.a * S.gmax + 0.1;
    this.standBase.scale.set(w, 1, d);
    this.rod.scale.set(1, yTop - 0.022, 1); this.rod.position.y = (yTop + 0.022) / 2;
    this.clampLow.position.y = yTop + 0.004;
    this.clampTop.position.y = this.plateY;
  }

  // ───────────────────────────── archetto ─────────────────────────────
  _buildBow() {
    const M = this.M, g = this.bow = new THREE.Group(); this.group.add(g);
    const inner = this.bowInner = new THREE.Group(); g.add(inner);
    // bacchetta leggermente incurvata verso i crini (asse y, 0 al tallone)
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24, y = 0.02 + t * 0.71; pts.push(new THREE.Vector3(0.006 * Math.sin(Math.PI * t), y, 0)); }
    const stick = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 1, 10, false);
    // raggio che si assottiglia verso la punta
    const p = stick.attributes.position, ctr = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); const t = Math.min(1, Math.max(0, (y - 0.02) / 0.71));
      ctr.set(0.006 * Math.sin(Math.PI * t), 0, 0);
      const r = 0.0042 - 0.0017 * t;
      p.setX(i, ctr.x + (p.getX(i) - ctr.x) * r); p.setZ(i, p.getZ(i) * r);
    }
    stick.computeVertexNormals();
    this._mesh(stick, M.wood, inner);
    // tallone (ebano), con l'occhio di madreperla e la vite
    this._mesh(new RoundedBoxGeometry(0.014, 0.045, 0.011, 2, 0.002).translate(0.009, 0.045, 0), M.ebony, inner);
    this._mesh(cyl(0.0022, 0.0022, 0.0115, 16).rotateX(Math.PI / 2).translate(0.009, 0.045, 0), M.nail, inner);
    this._mesh(cyl(0.0035, 0.0035, 0.025, 16).translate(0, 0.012, 0), M.ebony, inner);
    this._mesh(cyl(0.0036, 0.0036, 0.004, 16).translate(0, 0.022, 0), M.chrome, inner);
    // punta
    this._mesh(new RoundedBoxGeometry(0.012, 0.022, 0.007, 2, 0.002).translate(0.006, 0.725, 0), M.wood, inner);
    this._mesh(new THREE.BoxGeometry(0.0125, 0.003, 0.0075).translate(0.007, 0.716, 0), M.hair, inner);
    // crini: un nastro dal tallone alla punta
    this.HAIR_X = 0.0165;
    const hairGeo = new THREE.BoxGeometry(0.0008, 0.66, 0.0095).translate(0, 0.39, 0);
    hairGeo.attributes.position.array.forEach((_, i, arr) => { if (i % 3 === 0) { const y = arr[i + 1]; arr[i] += this.HAIR_X - ((y - 0.06) / 0.65) * (this.HAIR_X - 0.012); } });
    hairGeo.computeVertexNormals();
    this._mesh(hairGeo, M.hair, inner);
    g.visible = false;
  }
  /**
   * L'archetto sul bordo: punto del bordo (ridotto) con normale uscente; stroke: quanto è scorso (m).
   */
  placeBow(e, stroke) {
    const a = this.a, E = new THREE.Vector3(a * e.x, this.plateY - this.h / 2, -a * e.y);
    const n = new THREE.Vector3(e.nx, 0, -e.ny).normalize();
    // il tallone in alto, nella mano, un po' in fuori; la bacchetta scende quasi verticale lungo il bordo
    const along = new THREE.Vector3(0, -Math.cos(0.2), 0).addScaledVector(n, -Math.sin(0.2)).normalize();
    const toward = n.clone().negate().addScaledVector(along, n.dot(along)).normalize();
    const side = new THREE.Vector3().crossVectors(toward, along).normalize();
    this.bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toward, along, side));
    const contact = 0.24 + stroke;                 // distanza dal tallone del punto dei crini che tocca il bordo
    const hx = this.HAIR_X - ((contact - 0.06) / 0.65) * (this.HAIR_X - 0.012);
    this.bow.position.copy(E).addScaledVector(toward, -hx - 0.0006).addScaledVector(along, -contact);
  }

  /** Cosa si vede: 'shaker' o 'bow'. */
  setExcitation(kind) {
    const sh = kind === 'shaker';
    this.plateY = sh ? PLATE_Y : BOW_Y; this.plateG.position.y = this.plateY;
    this.setShaft(0);
    this.shaker.visible = this.gen.visible = this.cables.visible = this.nut.visible = sh;
    this.stand.visible = this.bow.visible = !sh;
    if (!sh) this.setStandHeight();
  }

  // ───────────────────────────── i granelli ─────────────────────────────
  _buildGrains(max) {
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = std({ color: '#ffffff', roughness: 0.78, metalness: 0 });
    const mesh = this.grains = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.userData.noOutline = true;
    this.plateG.add(mesh);
    // rotazione e forma di ogni posto, fisse; la traslazione cambia a ogni fotogramma
    this.grainBase = new Float32Array(max * 9);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < max; i++) {
      e.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3); q.setFromEuler(e);
      m.compose(new THREE.Vector3(), q, new THREE.Vector3(0.8 + Math.random() * 0.5, 0.6 + Math.random() * 0.4, 0.8 + Math.random() * 0.5));
      const el = m.elements;
      this.grainBase.set([el[0], el[1], el[2], el[4], el[5], el[6], el[8], el[9], el[10]], i * 9);
    }
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.maxGrains = max;
  }
  setGrainLook(kind) {
    this.grainKind = kind;
    const pal = GRAIN_LOOK[kind] || GRAIN_LOOK.sand, c = new THREE.Color();
    for (let i = 0; i < this.maxGrains; i++) {
      let r = Math.random(), k = 0; while (k < pal.length - 1 && r > pal[k][1]) { r -= pal[k][1]; k++; }
      c.set(pal[k][0]).multiplyScalar(0.92 + Math.random() * 0.12);
      this.grains.setColorAt(i, c);
    }
    this.grains.instanceColor.needsUpdate = true;
  }
  /** Colori per il miscuglio sabbia + licopodio: kindOf(i) → 0/1. */
  colorByKind(sand, sandKind) {
    const pals = [GRAIN_LOOK[sandKind] || GRAIN_LOOK.sand, GRAIN_LOOK.lyco], c = new THREE.Color();
    for (let i = 0; i < sand.n; i++) {
      const pal = pals[sand.kind[i]];
      let r = Math.random(), k = 0; while (k < pal.length - 1 && r > pal[k][1]) { r -= pal[k][1]; k++; }
      c.set(pal[k][0]).multiplyScalar(0.92 + Math.random() * 0.12);
      this.grains.setColorAt(i, c);
    }
    this.grains.instanceColor.needsUpdate = true;
  }

  /**
   * Posa i granelli: sand (Sand), disp(x,y) spostamento mostrato della lamina (o null), t per il saltellare.
   */
  updateGrains(sand, disp) {
    const mesh = this.grains, arr = mesh.instanceMatrix.array, B = this.grainBase, a = this.a;
    const n = sand.n;
    for (let i = 0; i < n; i++) {
      const s = sand.size[i], o = i * 16, b = i * 9;
      arr[o] = B[b] * s; arr[o + 1] = B[b + 1] * s; arr[o + 2] = B[b + 2] * s; arr[o + 3] = 0;
      arr[o + 4] = B[b + 3] * s; arr[o + 5] = B[b + 4] * s; arr[o + 6] = B[b + 5] * s; arr[o + 7] = 0;
      arr[o + 8] = B[b + 6] * s; arr[o + 9] = B[b + 7] * s; arr[o + 10] = B[b + 8] * s; arr[o + 11] = 0;
      const st = sand.st[i];
      let y;
      if (st === ST.plate) {
        const hop = sand.hop[i];
        y = s * (0.32 + 0.5 * (sand.layer ? sand.layer[i] : 0)) + (hop > 0.02 ? hop * Math.random() * 0.0016 : 0);
        if (disp) y += disp(sand.x[i], sand.y[i]);
      } else if (st === ST.rain) y = sand.z[i] + s * 0.32;
      else y = sand.z[i] + s * 0.32 - (st === ST.floor ? 0 : 0);
      arr[o + 12] = a * sand.x[i]; arr[o + 13] = y; arr[o + 14] = -a * sand.y[i]; arr[o + 15] = 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Linee nodali: segmenti in coordinate ridotte [[x0,y0,x1,y1]…]. */
  setLines(segs) {
    const b = this.lineBuf, a = this.a, col = new THREE.Color(0xe8452c), y = 0.0004;
    b.reset();
    for (const s of segs) b.push(a * s[0], y, -a * s[1], a * s[2], y, -a * s[3], col, 0, 0);
    b.commit();
  }
}
