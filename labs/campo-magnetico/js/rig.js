// rig.js — il banco in 3D: la lastra di plexiglas su cui si sparge la limatura (bassa, sopra i magneti appoggiati sul
// piano; alta, su quattro gambe, attraversata dai conduttori), i magneti di ferrite (a barra, a ferro di cavallo), il
// filo rettilineo, la spira e il solenoide con le loro basette e le boccole, l'alimentatore da 20 A, le bussole, la
// limatura di ferro, le linee di campo, il teslametro con la sonda di Hall sul suo sostegno.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { PLATE, YP, MAG, HORSE, WIRE, LOOP, COIL } from './field.js';

const MONO = '"Geist Mono Variable", Consolas, monospace';
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const std = (o) => new THREE.MeshStandardMaterial(o);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const NF = 14000;                                  // granelli di limatura
export const NC = 8;                                      // bussole al massimo
const SUPPLY_AT = [-0.52, -0.06, 0.42], METER_AT = [0.4, 0.2, -0.35];

export class Rig {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'campo magnetico';
    this.M = {
      black: std({ color: '#17181b', metalness: 0.2, roughness: 0.5 }),
      dark: std({ color: '#2b2e33', metalness: 0.15, roughness: 0.5 }),
      panel: std({ color: '#d9dbdf', metalness: 0.15, roughness: 0.5 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      alu: std({ color: '#c9ccd1', metalness: 1, roughness: 0.35 }),
      brass: std({ color: '#c9a24f', metalness: 1, roughness: 0.3 }),
      copper: std({ color: '#c77a48', metalness: 1, roughness: 0.3 }),
      enamel: std({ color: '#a8552c', metalness: 0.8, roughness: 0.28 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      blue: std({ color: '#2a56b8', metalness: 0.1, roughness: 0.45 }),
      steel: std({ color: '#9ea3aa', metalness: 1, roughness: 0.32 }),
      redCable: std({ color: '#c0281d', metalness: 0, roughness: 0.55 }),
      blackCable: std({ color: '#1b1c1e', metalness: 0, roughness: 0.55 }),
      grayCable: std({ color: '#3b3e44', metalness: 0, roughness: 0.6 }),
      white: std({ color: '#f2f2ef', metalness: 0, roughness: 0.5 }),
      filing: std({ color: '#2a2b2e', metalness: 0.6, roughness: 0.5 }),
    };
    this._buildPlate();
    this._buildMagnets();
    this._buildConductors();
    this._buildSupply();
    this.meter = this._buildMeter();
    this._buildProbe();
    this.compasses = []; for (let i = 0; i < NC; i++) this.compasses.push(this._buildCompass());
    this._buildFilings();
    this._buildLines();
    this.cables = new THREE.Group(); this.group.add(this.cables);
  }
  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m); return m;
  }
  _bar(a, b, r, mat, parent) {
    const d = b.clone().sub(a), m = this._mesh(cyl(r, r, d.length(), 12), mat, parent);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
    return m;
  }
  _label(text, size, color, parent, x, y, z, bg = null) {
    const tex = canvasTexture(128, 128, (c) => { if (bg) { c.fillStyle = bg; c.fillRect(0, 0, 128, 128); } c.fillStyle = color; c.font = `700 96px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 64, 70); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false }));
    m.position.set(x, y, z); m.userData.noOutline = true; parent.add(m); return m;
  }

  // ───────────────────────────── la lastra ─────────────────────────────
  _buildPlate() {
    // la lastra si muove (scossa quando la si picchietta): tutto ciò che vi sta sopra è nel suo gruppo, con y = 0 sulla faccia
    this.plateG = new THREE.Group(); this.group.add(this.plateG);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#f6f7f8', metalness: 0, roughness: 0.4, transparent: true, opacity: 0.68, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const plate = this._mesh(new RoundedBoxGeometry(PLATE.w, PLATE.t, PLATE.d, 2, 0.002).translate(0, -PLATE.t / 2, 0), mat, this.plateG, false);
    plate.renderOrder = 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLATE.w, PLATE.t, PLATE.d).translate(0, -PLATE.t / 2, 0)), new THREE.LineBasicMaterial({ color: '#9aa1ab', transparent: true, opacity: 0.6 }));
    this.plateG.add(edges);
    // piedini (lastra bassa) e gambe (lastra alta)
    this.feet = new THREE.Group(); this.legs = new THREE.Group(); this.group.add(this.feet, this.legs);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (PLATE.w / 2 - 0.016), z = sz * (PLATE.d / 2 - 0.016);
      this._mesh(cyl(0.008, 0.009, YP.magnet - PLATE.t, 20).translate(x, (YP.magnet - PLATE.t) / 2, z), this.M.black, this.feet);
      this._mesh(cyl(0.006, 0.006, YP.current - PLATE.t, 20).translate(x, (YP.current - PLATE.t) / 2, z), this.M.alu, this.legs);
      this._mesh(cyl(0.011, 0.012, 0.008, 20).translate(x, 0.004, z), this.M.black, this.legs);
    }
  }
  /** Lastra alla quota yp (della faccia superiore), sui piedini o sulle gambe. */
  setPlate(yp, low) { this.plateG.position.y = yp; this.yp = yp; this.feet.visible = low; this.legs.visible = !low; }
  /** Scossa della lastra quando la si picchietta. */
  shake(dy) { this.plateG.position.y = this.yp + dy; }

  // ───────────────────────────── magneti ─────────────────────────────
  _makeBar() {
    const g = new THREE.Group(); this.group.add(g);
    const { L, W, H } = MAG;
    this._mesh(new RoundedBoxGeometry(L / 2, H, W, 2, 0.0012).translate(L / 4, H / 2, 0), this.M.red, g);
    this._mesh(new RoundedBoxGeometry(L / 2, H, W, 2, 0.0012).translate(-L / 4, H / 2, 0), this.M.blue, g);
    this._label('N', 0.016, '#ffffff', g, L / 2 - 0.014, H + 0.0003, 0);
    this._label('S', 0.016, '#ffffff', g, -L / 2 + 0.014, H + 0.0003, 0);
    return g;
  }
  _buildMagnets() {
    this.bar1 = this._makeBar(); this.bar2 = this._makeBar();
    // il ferro di cavallo: una U di ferrite rossa, con le estremità polari d'acciaio
    const { x0, x1, zc, w, H } = HORSE, ro = zc + w / 2, ri = zc - w / 2;
    const s = new THREE.Shape();
    s.moveTo(x1 - 0.012, ro); s.lineTo(x0, ro); s.absarc(x0, 0, ro, Math.PI / 2, (3 * Math.PI) / 2, false); s.lineTo(x1 - 0.012, -ro);
    s.lineTo(x1 - 0.012, -ri); s.lineTo(x0, -ri); s.absarc(x0, 0, ri, (3 * Math.PI) / 2, Math.PI / 2, true); s.lineTo(x1 - 0.012, ri); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 40 }).rotateX(Math.PI / 2).translate(0, H, 0);
    this.horse = new THREE.Group(); this.group.add(this.horse);
    this._mesh(geo, this.M.red, this.horse);
    for (const [z, t] of [[zc, 'N'], [-zc, 'S']]) {
      this._mesh(new RoundedBoxGeometry(0.012, H, w, 2, 0.001).translate(x1 - 0.006, H / 2, z), this.M.steel, this.horse);
      this._label(t, 0.012, '#1d2026', this.horse, x1 - 0.018, H + 0.0012, z);
    }
  }

  // ───────────────────────────── conduttori ─────────────────────────────
  _socket(parent, p, d, mat) {
    const m = this._mesh(cyl(0.0058, 0.0058, 0.012, 20), mat, parent);
    m.position.copy(p).addScaledVector(d, 0.006); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d);
    this._mesh(cyl(0.0022, 0.0022, 0.0125, 12), this.M.black, m);
    return { p: p.clone().addScaledVector(d, 0.012), d: d.clone() };
  }
  _buildConductors() {
    const yp = YP.current;
    // il filo rettilineo: una barra di rame verticale su una base, con una boccola in basso e una in cima
    const w = this.wireG = new THREE.Group(); this.group.add(w);
    this._mesh(new RoundedBoxGeometry(0.12, 0.024, 0.09, 2, 0.004).translate(0, 0.012, 0), this.M.dark, w);
    this._mesh(cyl(WIRE.r, WIRE.r, WIRE.y1 - 0.024, 16).translate(0, (WIRE.y1 + 0.024) / 2, 0), this.M.copper, w);
    this._mesh(cyl(0.008, 0.008, 0.02, 24).translate(0, WIRE.y1 + 0.01, 0), this.M.red, w);
    this.wireT = { a: this._socket(w, V3(0.03, 0.012, 0.045), V3(0, 0, 1), this.M.red), b: { p: V3(0, WIRE.y1 + 0.02, 0), d: V3(0, 1, 0) } };
    this._mesh(cyl(0.0024, 0.0024, 0.002, 12).translate(0, WIRE.y1 + 0.0205, 0), this.M.black, w, false);
    // la spira (o la bobina di poche spire): nel piano nord–sud, a metà sopra e a metà sotto la lastra
    const l = this.loopG = new THREE.Group(); this.group.add(l);
    this._mesh(new RoundedBoxGeometry(0.1, 0.024, 0.07, 2, 0.004).translate(0, 0.012, 0), this.M.dark, l);
    this.loopRing = this._mesh(new THREE.TorusGeometry(LOOP.R, 1, 10, 120).rotateY(Math.PI / 2), this.M.enamel, l);
    this.loopRing.position.set(0, yp, 0);
    for (const s of [-1, 1]) this._bar(V3(0, yp - LOOP.R, s * 0.003), V3(s * 0.02, 0.024, s * 0.003), 0.0013, this.M.enamel, l);
    this.loopT = { a: this._socket(l, V3(-0.02, 0.012, 0.035), V3(0, 0, 1), this.M.red), b: this._socket(l, V3(0.02, 0.012, 0.035), V3(0, 0, 1), this.M.black) };
    // il solenoide: un'elica di filo smaltato attorno all'asse x, alla quota della lastra
    const c = this.coilG = new THREE.Group(); this.group.add(c);
    this._mesh(new RoundedBoxGeometry(0.2, 0.024, 0.07, 2, 0.004).translate(0, 0.012, 0), this.M.dark, c);
    this.coilT = { a: this._socket(c, V3(-0.06, 0.012, 0.035), V3(0, 0, 1), this.M.red), b: this._socket(c, V3(0.06, 0.012, 0.035), V3(0, 0, 1), this.M.black) };
    this.coilWire = null;
  }
  /** La bobina della spira (N spire, un fascio) e l'elica del solenoide (N spire). */
  setTurns(nLoop, nCoil) {
    const t = 0.0011 * Math.sqrt(nLoop) * 1.25;
    this.loopRing.scale.set(1, 1, 1);
    this.loopRing.geometry.dispose(); this.loopRing.geometry = new THREE.TorusGeometry(LOOP.R, t, 10, 120).rotateY(Math.PI / 2);
    if (this._nCoil === nCoil) return;
    this._nCoil = nCoil;
    if (this.coilWire) for (const m of this.coilWire) { this.coilG.remove(m); m.geometry.dispose(); }
    const yp = YP.current, R = COIL.R, L = COIL.len, N = nCoil, pts = [];
    for (let i = 0; i <= N * 32; i++) { const u = i / (N * 32); pts.push(V3(-L / 2 + L * u, yp + R * Math.cos(2 * Math.PI * N * u), R * Math.sin(2 * Math.PI * N * u))); }
    const helix = this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 40, 0.0009, 6, false), this.M.enamel, this.coilG);
    const lead = (x, sx) => this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(x, yp + R, 0), V3(x + sx * 0.008, yp + R - 0.003, 0), V3(x + sx * 0.012, yp, 0), V3(x + sx * 0.012, 0.06, 0), V3(sx * 0.06, 0.03, 0.004), V3(sx * 0.06, 0.024, 0.004)]), 40, 0.0009, 6, false), this.M.enamel, this.coilG);
    this.coilWire = [helix, lead(-L / 2, -1), lead(L / 2, 1)];
  }

  // ───────────────────────────── alimentatore ─────────────────────────────
  _buildSupply() {
    const g = this.supply = new THREE.Group(); this.group.add(g);
    const W = 0.24, H = 0.11, D = 0.2;
    this._mesh(new RoundedBoxGeometry(W, H, D, 3, 0.008).translate(0, H / 2 + 0.008, 0), this.M.panel, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this._mesh(cyl(0.008, 0.009, 0.008, 16).translate(sx * (W / 2 - 0.02), 0.004, sz * (D / 2 - 0.02)), this.M.black, g);
    const vent = std({ color: '#9ca1a8', metalness: 0.1, roughness: 0.6 });
    for (let i = 0; i < 6; i++) this._mesh(new THREE.BoxGeometry(0.1, 0.0008, 0.0035).translate(-0.04, H + 0.0082, -0.05 + i * 0.012), vent, g, false);
    this.supCanvas = document.createElement('canvas'); this.supCanvas.width = 1024; this.supCanvas.height = 470;
    this.supTex = new THREE.CanvasTexture(this.supCanvas); this.supTex.colorSpace = THREE.SRGBColorSpace; this.supTex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.008, H - 0.004), new THREE.MeshStandardMaterial({ map: this.supTex, emissive: '#ffffff', emissiveMap: this.supTex, emissiveIntensity: 0.3, roughness: 0.5 }));
    face.position.set(0, H / 2 + 0.008, D / 2 + 0.0006); g.add(face);
    this.knobV = this._mesh(cyl(0.011, 0.012, 0.014, 32).rotateX(Math.PI / 2), this.M.black, g); this.knobV.position.set(0.03, 0.045, D / 2 + 0.007);
    this.knobI = this._mesh(cyl(0.011, 0.012, 0.014, 32).rotateX(Math.PI / 2), this.M.black, g); this.knobI.position.set(0.064, 0.045, D / 2 + 0.007);
    for (const k of [this.knobV, this.knobI]) this._mesh(new THREE.BoxGeometry(0.0016, 0.007, 0.002).translate(0, 0.005, 0.0075), this.M.white, k, false);
    this.supTerm = {};
    for (const [id, x, mat] of [['plus', 0.088, this.M.red], ['minus', 0.108, this.M.black]]) {
      this._mesh(cyl(0.0055, 0.0055, 0.012, 20).rotateX(Math.PI / 2).translate(x, 0.03, D / 2 + 0.006), mat, g);
      this.supTerm[id] = { p: V3(x, 0.03, D / 2 + 0.012), d: V3(0, 0, 1) };
    }
    g.position.set(SUPPLY_AT[0], 0, SUPPLY_AT[1]); g.rotation.y = SUPPLY_AT[2];
  }
  drawSupply({ V, I, on, Iset }) {
    const key = `${V.toFixed(2)}|${I.toFixed(2)}|${on}|${Iset.toFixed(2)}`;
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
    disp(500, 46, 440, 150, Math.abs(I).toFixed(2), 'A', '#46ff82');
    c.textBaseline = 'alphabetic';
    for (const [label, x, lit, col] of [['CV', 60, false, '#3bff7a'], ['CC', 190, on, '#ff3b2b']]) {
      c.fillStyle = lit ? col : '#80858c'; c.beginPath(); c.arc(x, 252, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3a3f46'; c.font = `600 28px ${MONO}`; c.textAlign = 'left'; c.fillText(label, x + 24, 262);
    }
    c.fillStyle = '#3a3f46'; c.font = `700 30px ${FONT}`; c.textAlign = 'left';
    c.fillText('ALIMENTATORE  0–20 V  20 A', 40, 350);
    c.font = `500 25px ${MONO}`; c.fillStyle = '#5b626c'; c.fillText(`corrente impostata ${Iset.toFixed(2)} A`, 40, 405);
    c.textAlign = 'center'; c.font = `600 22px ${MONO}`; c.fillStyle = '#3a3f46';
    c.fillText('TENSIONE', 644, 400); c.fillText('CORRENTE', 795, 400);
    c.font = `700 40px ${MONO}`; c.fillStyle = '#c62a1e'; c.fillText('+', 900, 335); c.fillStyle = '#17181b'; c.fillText('−', 988, 335);
    c.fillStyle = on ? '#ff4b2e' : '#7a4a42'; c.beginPath(); c.arc(960, 252, 12, 0, Math.PI * 2); c.fill();
    this.supTex.needsUpdate = true;
    this.knobI.rotation.z = 2.3 - (Iset / 20) * 4.6;
  }

  // ───────────────────────────── teslametro e sonda ─────────────────────────────
  _buildMeter() {
    const g = new THREE.Group(); this.group.add(g);
    const inner = new THREE.Group(); inner.rotation.x = -1.05; inner.position.y = 0.068; g.add(inner);
    const W = 0.09, H = 0.18, D = 0.036;
    this._mesh(new RoundedBoxGeometry(W + 0.012, H + 0.012, D + 0.008, 4, 0.012), std({ color: '#2f6fb3', roughness: 0.65 }), inner);
    this._mesh(new RoundedBoxGeometry(W, H, D + 0.01, 3, 0.006), this.M.dark, inner);
    for (const sx of [-1, 1]) this._bar(V3(sx * 0.03, 0.074, -0.054), V3(sx * 0.03, 0.002, -0.098), 0.0016, this.M.chrome, g);
    this._bar(V3(-0.03, 0.002, -0.098), V3(0.03, 0.002, -0.098), 0.0016, this.M.chrome, g);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1024;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.006, H - 0.006), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
    face.position.z = D / 2 + 0.0055; inner.add(face);
    const knob = this._mesh(cyl(0.017, 0.018, 0.01, 32).rotateX(Math.PI / 2), this.M.black, inner); knob.position.set(0, -0.012, D / 2 + 0.01);
    this._mesh(new THREE.BoxGeometry(0.004, 0.026, 0.004).translate(0, 0.006, 0.006), this.M.panel, knob, false);
    knob.rotation.z = -0.6;
    this._mesh(cyl(0.007, 0.007, 0.01, 20).rotateX(Math.PI / 2).translate(0, -0.07, D / 2 + 0.008), this.M.black, inner);
    g.position.set(METER_AT[0], 0, METER_AT[1]); g.rotation.y = METER_AT[2];
    const m = { g, inner, cv, tex, jack: { p: V3(0, -0.07, D / 2 + 0.013), d: V3(0, 0, 1) }, last: '' };
    this.drawMeter(m, { txt: '0.000', unit: 'mT', range: '2 mT' });
    return m;
  }
  drawMeter(m, { txt, unit, range }) {
    const key = `${txt}|${unit}|${range}`;
    if (key === m.last) return;
    m.last = key;
    const c = m.cv.getContext('2d'), W = 512;
    c.fillStyle = '#2b2e33'; c.fillRect(0, 0, W, 1024);
    c.fillStyle = '#a3ab93'; c.beginPath(); c.roundRect(36, 46, W - 72, 300, 20); c.fill();
    c.fillStyle = '#1b1f18'; c.font = `600 140px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle';
    const tw = c.measureText(txt).width, sx = Math.min(1, 300 / tw);
    c.save(); c.translate(W - 128, 214); c.scale(sx, 1); c.fillText(txt, 0, 0); c.restore();
    c.font = `600 52px ${MONO}`; c.textAlign = 'left'; c.fillText(unit, W - 120, 232);
    c.font = `500 32px ${MONO}`; c.fillText('DC  AUTO', 66, 92);
    c.textAlign = 'right'; c.fillText(range, W - 66, 92);
    c.textBaseline = 'alphabetic';
    c.font = `700 44px ${FONT}`; c.textAlign = 'center'; c.fillStyle = '#7fc8ff'; c.fillText('TESLAMETRO', W / 2, 410);
    c.fillStyle = '#d6d8dc'; c.font = `600 36px ${FONT}`;
    for (const [t, a] of [['OFF', -1.6], ['20 mT', -0.6], ['200 mT', 0.6], ['1 T', 1.6]]) c.fillText(t, W / 2 + Math.sin(a) * 160, 604 - Math.cos(a) * 160);
    c.font = `600 30px ${MONO}`; c.fillStyle = '#c9ccd1'; c.fillText('SONDA DI HALL', W / 2, 1000);
    m.tex.needsUpdate = true;
  }
  _buildProbe() {
    // la sonda: una lamina sottile con l'elemento di Hall in punta, il fusto d'alluminio e l'impugnatura; la tiene un
    // sostegno con un morsetto
    const g = this.probe = new THREE.Group(); this.group.add(g);
    this.probeBody = new THREE.Group(); g.add(this.probeBody);
    this._mesh(new THREE.BoxGeometry(0.07, 0.0012, 0.005).translate(0.035, 0.0006, 0), std({ color: '#1f3b2c', roughness: 0.5 }), this.probeBody);
    this._mesh(new THREE.BoxGeometry(0.0025, 0.0003, 0.0032).translate(0.003, 0.0013, 0), this.M.white, this.probeBody, false);
    this._mesh(cyl(0.0035, 0.0035, 0.012, 16).rotateZ(Math.PI / 2).translate(0.076, 0.0035, 0), this.M.black, this.probeBody);
    this._mesh(cyl(0.003, 0.003, 0.12, 16).rotateZ(Math.PI / 2).translate(0.142, 0.0035, 0), this.M.alu, this.probeBody);
    this._mesh(cyl(0.008, 0.007, 0.09, 24).rotateZ(Math.PI / 2).translate(0.247, 0.008, 0), this.M.black, this.probeBody);
    this.probeTail = { p: V3(0.292, 0.008, 0), d: V3(1, 0, 0) };
    this.stand = new THREE.Group(); g.add(this.stand);
    this._mesh(new RoundedBoxGeometry(0.07, 0.012, 0.09, 2, 0.003).translate(0, 0.006, 0), this.M.dark, this.stand);
    this.standRod = this._mesh(cyl(0.005, 0.005, 1, 16).translate(0, 0.5, 0), this.M.chrome, this.stand);
    this.standClamp = this._mesh(new RoundedBoxGeometry(0.02, 0.022, 0.026, 2, 0.003), this.M.black, this.stand);
    this.probeCable = null;
  }
  /** La sonda con la punta in (x, quota della lastra yp, 0). */
  setProbe(on, x, yp) {
    this.probe.visible = on; this.meter.g.visible = on;
    if (!on) { if (this.probeCable) this.probeCable.visible = false; return; }
    this.probeBody.position.set(x, yp, 0);
    const sx = x + 0.24, top = yp + 0.008;
    this.stand.position.set(sx, 0, 0);
    this.standRod.scale.y = top + 0.01; this.standRod.position.y = 0;
    this.standClamp.position.set(0, top, 0);
    // il cavo della sonda fino al teslametro
    this.group.updateMatrixWorld(true);
    const a = this.probeTail.p.clone().applyMatrix4(this.probeBody.matrixWorld), b = this.meter.jack.p.clone().applyMatrix4(this.meter.inner.matrixWorld);
    const bd = this.meter.jack.d.clone().transformDirection(this.meter.inner.matrixWorld);
    const mid = a.clone().lerp(b, 0.5); mid.y = 0.003;
    const curve = new THREE.CatmullRomCurve3([a, a.clone().add(V3(0.03, 0, 0)), a.clone().add(V3(0.06, -Math.min(0.03, a.y * 0.5), 0.01)), V3(a.x + 0.08, 0.003, a.z + 0.04), mid, b.clone().addScaledVector(bd, 0.05).setY(0.004), b.clone().addScaledVector(bd, 0.02), b], false, 'centripetal');
    if (this.probeCable) { this.group.remove(this.probeCable); this.probeCable.geometry.dispose(); }
    this.probeCable = this._mesh(new THREE.TubeGeometry(curve, 120, 0.0018, 8, false), this.M.grayCable, this.group);
  }

  // ───────────────────────────── bussole ─────────────────────────────
  _buildCompass() {
    const g = new THREE.Group(); this.plateG.add(g);
    const prof = [[0, 0], [0.0118, 0], [0.0122, 0.001], [0.0122, 0.0056], [0.0113, 0.0063], [0.0106, 0.0063], [0.0106, 0.0012], [0, 0.0012]].map(([r, y]) => new THREE.Vector2(r, y));
    this._mesh(new THREE.LatheGeometry(prof, 40), this.M.black, g);
    if (!this._dialTex) {
      this._dialTex = canvasTexture(256, 256, (c) => {
        c.fillStyle = '#f4f1ea'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a2f36';
        for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = i % 18 === 0 ? 92 : i % 2 ? 112 : 104; c.lineWidth = i % 18 === 0 ? 4 : 2; c.beginPath(); c.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); c.lineTo(128 + Math.sin(a) * 124, 128 - Math.cos(a) * 124); c.stroke(); }
        c.font = `700 40px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (const [t, a, col] of [['N', 0, '#c62a1e'], ['E', 1, '#2a2f36'], ['S', 2, '#2a2f36'], ['O', 3, '#2a2f36']]) { c.fillStyle = col; c.fillText(t, 128 + Math.sin((a * Math.PI) / 2) * 66, 130 - Math.cos((a * Math.PI) / 2) * 66); }
      });
    }
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.0106, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this._dialTex, roughness: 0.6 }));
    dial.position.y = 0.0013; dial.receiveShadow = true; g.add(dial);
    // l'ago: metà rossa (il nord) e metà bianca, su un perno
    const needle = new THREE.Group(); needle.position.y = 0.0042; g.add(needle);
    const half = (sgn, mat) => { const s = new THREE.Shape(); s.moveTo(0, 0.0014); s.lineTo(sgn * 0.0092, 0); s.lineTo(0, -0.0014); s.closePath(); this._mesh(new THREE.ExtrudeGeometry(s, { depth: 0.0006, bevelEnabled: false }).rotateX(-Math.PI / 2), mat, needle, false); };
    half(1, this.M.red); half(-1, std({ color: '#e9e9e6', roughness: 0.5 }));
    this._mesh(cyl(0.0009, 0.0009, 0.0012, 12).translate(0, 0.0009, 0), this.M.brass, needle, false);
    const glass = this._mesh(cyl(0.0107, 0.0107, 0.0004, 40).translate(0, 0.006, 0), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, roughness: 0.03, clearcoat: 1, depthWrite: false }), g, false);
    glass.renderOrder = 3; glass.userData.noOutline = true;
    return { g, needle };
  }
  /** Bussole nelle posizioni date ([x, z] sulla lastra); le altre spariscono. */
  placeCompasses(list, on) {
    this.compasses.forEach((c, i) => { c.g.visible = on && i < list.length; if (i < list.length) c.g.position.set(list[i][0], 0, list[i][1]); });
  }

  // ───────────────────────────── limatura e linee di campo ─────────────────────────────
  _buildFilings() {
    this.filings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.M.filing, NF);
    this.filings.count = 0; this.filings.frustumCulled = false; this.filings.userData.noAO = true; this.filings.userData.noOutline = true;
    this.filings.castShadow = false; this.filings.receiveShadow = true;
    this.plateG.add(this.filings);
  }
  _buildLines() {
    this.lineBuf = new SegBuffer(60000);
    this.lineMat = new LineMaterial({ vertexColors: true, linewidth: 0.0011, worldUnits: true, toneMapped: false });
    this.fieldLines = new LineSegments2(this.lineBuf.geometry(), this.lineMat);
    this.fieldLines.frustumCulled = false; this.fieldLines.userData.noOutline = true; this.fieldLines.renderOrder = 4;
    this.plateG.add(this.fieldLines);
    this.arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.0022, 0.0065, 10).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1f5fb0', toneMapped: false }), 1500);
    this.arrows.count = 0; this.arrows.frustumCulled = false; this.arrows.userData.noAO = true; this.arrows.userData.noOutline = true;
    this.plateG.add(this.arrows);
    // le linee nello spazio, colorate dall'intensità del campo, con le frecce
    this.l3Buf = new SegBuffer(40000);
    this.l3 = new LineSegments2(this.l3Buf.geometry(), new LineMaterial({ vertexColors: true, linewidth: 0.0016, worldUnits: true, toneMapped: false }));
    this.l3.frustumCulled = false; this.l3.userData.noOutline = true; this.l3.visible = false;
    this.group.add(this.l3);
    this.l3Arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.003, 0.009, 12).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false }), 1200);
    this.l3Arrows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1200 * 3), 3);
    this.l3Arrows.count = 0; this.l3Arrows.frustumCulled = false; this.l3Arrows.userData.noAO = true; this.l3Arrows.userData.noOutline = true; this.l3Arrows.visible = false;
    this.group.add(this.l3Arrows);
  }
  /** Le linee nello spazio (Float32Array [x, y, z, |B|]…), con le frecce nel verso del campo (sgn −1: invertite). */
  setLines3D(lines, sgn, show) {
    this.l3.visible = this.l3Arrows.visible = show && !!lines;
    if (!show || !lines) return;
    const buf = this.l3Buf; buf.reset();
    const all = []; for (const L of lines) for (let i = 3; i < L.length; i += 4) all.push(Math.log10(L[i] || 1e-12));
    all.sort((a, b) => a - b);
    const lo = all[Math.floor(all.length * 0.05)] ?? -5, hi = all[Math.floor(all.length * 0.97)] ?? -2;
    const weak = new THREE.Color('#8db8e6'), strong = new THREE.Color('#d2402a'), mid = new THREE.Color('#2a52b8'), c = new THREE.Color();
    const colorOf = (B) => { const t = Math.max(0, Math.min(1, (Math.log10(B || 1e-12) - lo) / (hi - lo))); return t < 0.6 ? c.copy(weak).lerp(mid, t / 0.6) : c.copy(mid).lerp(strong, (t - 0.6) / 0.4); };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), ex = V3(1, 0, 0), d = new THREE.Vector3(), p = new THREE.Vector3();
    let na = 0;
    for (const L of lines) {
      const n = L.length / 4; let acc = 0.02 + Math.random() * 0.03;
      for (let i = 0; i < n - 1; i++) {
        const a = i * 4, b = a + 4;
        buf.push(L[a], L[a + 1], L[a + 2], L[b], L[b + 1], L[b + 2], colorOf(L[a + 3]), 0, 0);
        const seg = Math.hypot(L[b] - L[a], L[b + 1] - L[a + 1], L[b + 2] - L[a + 2]);
        acc += seg;
        if (acc > 0.045 && na < 1200 && i > 1 && i < n - 3) {
          acc = 0;
          d.set(L[b] - L[a], L[b + 1] - L[a + 1], L[b + 2] - L[a + 2]).multiplyScalar(sgn / (seg || 1));
          q.setFromUnitVectors(ex, d); p.set((L[a] + L[b]) / 2, (L[a + 1] + L[b + 1]) / 2, (L[a + 2] + L[b + 2]) / 2);
          m.compose(p, q, one); this.l3Arrows.setMatrixAt(na, m); this.l3Arrows.setColorAt(na, colorOf(L[a + 3])); na++;
        }
      }
    }
    buf.commit(); this.l3Arrows.count = na; this.l3Arrows.instanceMatrix.needsUpdate = true; this.l3Arrows.instanceColor.needsUpdate = true;
  }
  /** Le linee di campo (dal calcolo), con le frecce nel verso del campo (sgn = −1 se la corrente è invertita). */
  setFieldLines(lines, sgn, show) {
    this.fieldLines.visible = this.arrows.visible = show;
    if (!show || !lines) return;
    const buf = this.lineBuf; buf.reset();
    const col = new THREE.Color('#1f5fb0'), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = V3(0, 1, 0);
    let na = 0;
    for (const L of lines) {
      const n = L.length / 3; let acc = 0.012 + Math.random() * 0.02;
      for (let i = 0; i < n - 1; i++) {
        const ax = L[i * 3], az = L[i * 3 + 1], bx = L[i * 3 + 3], bz = L[i * 3 + 4];
        buf.push(ax, 0.0012, az, bx, 0.0012, bz, col, 0, 0);
        acc += Math.hypot(bx - ax, bz - az);
        if (acc > 0.035 && na < 1500 && i > 2 && i < n - 3) {
          acc = 0;
          const ang = Math.atan2(-(bz - az) * sgn, (bx - ax) * sgn);
          q.setFromAxisAngle(up, ang); m.compose(V3((ax + bx) / 2, 0.0016, (az + bz) / 2), q, s); this.arrows.setMatrixAt(na++, m);
        }
      }
    }
    buf.commit(); this.arrows.count = na; this.arrows.instanceMatrix.needsUpdate = true;
  }

  // ───────────────────────────── disposizione e cavi ─────────────────────────────
  /** Mostra la sorgente e la collega: src, n. spire, e se la corrente è invertita (i cavi scambiati all'alimentatore). */
  setSource(src, { nLoop, nCoil, rev }) {
    const magnet = src === 'bar' || src === 'two' || src === 'horse';
    this.setPlate(magnet ? YP.magnet : YP.current, magnet);
    this.bar1.visible = src === 'bar' || src === 'two'; this.bar2.visible = src === 'two'; this.horse.visible = src === 'horse';
    this.wireG.visible = src === 'wire'; this.loopG.visible = src === 'loop'; this.coilG.visible = src === 'coil';
    this.supply.visible = !magnet;
    this.setTurns(nLoop, nCoil);
    for (const m of [...this.cables.children]) { this.cables.remove(m); m.geometry.dispose(); }
    if (magnet) return;
    this.group.updateMatrixWorld(true);
    const w = (t, obj) => ({ p: t.p.clone().applyMatrix4(obj.matrixWorld), d: t.d.clone().transformDirection(obj.matrixWorld) });
    const T = src === 'wire' ? this.wireT : src === 'loop' ? this.loopT : this.coilT;
    const G = src === 'wire' ? this.wireG : src === 'loop' ? this.loopG : this.coilG;
    const plus = w(this.supTerm[rev ? 'minus' : 'plus'], this.supply), minus = w(this.supTerm[rev ? 'plus' : 'minus'], this.supply);
    this.cable(plus, w(T.a, G), 'red', 1);
    this.cable(w(T.b, G), minus, 'black', -1);
  }
  setBars(pair) {
    const off = MAG.L / 2 + 0.03;
    if (pair) { this.bar1.position.set(-off, 0, 0); this.bar2.position.set(off, 0, 0); this.bar2.rotation.y = pair === 'same' ? Math.PI : 0; }
    else this.bar1.position.set(0, 0, 0);
  }
  /** Un cavo con le spine a banana fra i morsetti a e b ({p, d}), che si appoggia per terra. */
  cable(a, b, color, side = 1) {
    const R = 0.0026, a1 = a.p.clone().addScaledVector(a.d, 0.024), b1 = b.p.clone().addScaledVector(b.d, 0.024);
    const span = V3(b1.x - a1.x, 0, b1.z - a1.z), len = span.length(), nrm = V3(-span.z, 0, span.x).normalize();
    const mid = a1.clone().lerp(b1, 0.5).addScaledVector(nrm, side * Math.min(0.08, 0.15 * len)); mid.y = R;
    const bend = (p1, toward) => { const h = V3(toward.x - p1.x, 0, toward.z - p1.z), L = h.length(); return p1.clone().addScaledVector(h, Math.min(0.04, 0.3 * L) / Math.max(1e-6, L)).setY(Math.max(R, p1.y * 0.7)); };
    const ba = bend(a1, mid), bb = bend(b1, mid), qa = ba.clone().lerp(mid, 0.5).setY(R), qb = bb.clone().lerp(mid, 0.5).setY(R);
    const curve = new THREE.CatmullRomCurve3([a.p, a1, ba, qa, mid, qb, bb, b1, b.p], false, 'centripetal');
    this._mesh(new THREE.TubeGeometry(curve, 220, R, 8, false), color === 'red' ? this.M.redCable : this.M.blackCable, this.cables);
    const PLUG = [[0, 0], [0.0021, 0], [0.0021, 0.0013], [0.0033, 0.0016], [0.004, 0.0032], [0.0041, 0.006], [0.0038, 0.0064], [0.0041, 0.0068], [0.0041, 0.0115], [0.0038, 0.0119], [0.0041, 0.0123], [0.0041, 0.0135], [0.0033, 0.016], [0.0027, 0.0195], [0.0026, 0.021]].map(([r, y]) => new THREE.Vector2(r, y));
    for (const t of [a, b]) {
      const plug = this._mesh(new THREE.LatheGeometry(PLUG, 18), color === 'red' ? this.M.red : this.M.black, this.cables);
      plug.position.copy(t.p); plug.quaternion.setFromUnitVectors(V3(0, 1, 0), t.d);
    }
  }
  /** Punti notevoli per le etichette. */
  anchors(src, probeX) {
    const yp = this.yp;
    return {
      plate: V3(-PLATE.w / 2 + 0.05, yp + 0.005, -PLATE.d / 2 + 0.02),
      source: src === 'wire' ? V3(0, WIRE.y1 + 0.03, 0) : src === 'loop' ? V3(0, yp + LOOP.R + 0.012, 0) : src === 'coil' ? V3(-COIL.len / 2, yp + COIL.R + 0.012, 0) : src === 'horse' ? V3(HORSE.x0 - 0.03, 0.02, 0) : V3(src === 'two' ? -0.1 : 0, 0.02, MAG.W / 2 + 0.02),
      supply: V3(SUPPLY_AT[0], 0.13, SUPPLY_AT[1]),
      meter: V3(METER_AT[0], 0.13, METER_AT[1]),
      probe: V3(probeX + 0.03, yp + 0.012, 0),
    };
  }
}
