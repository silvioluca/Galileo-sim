// rig.js — i tre apparati in 3D, appoggiati sul pavimento.
// Il banco ottico: una rotaia con la scala, la sorgente (lampada con il condensatore o laser), il polarizzatore, un
// elemento al centro (un altro polarizzatore, una lamina λ/2 o λ/4, il tubo con la soluzione di zucchero),
// l'analizzatore, lo schermo con il fotometro. Ogni montatura gira, con la ghiera graduata e l'asse segnato.
// Brewster: un laser che si può ruotare sul suo asse, una lastra di vetro su un piatto girevole graduato, il braccio con
// il rivelatore che segue il fascio riflesso.
// La fotoelasticità: una scatola luminosa, il polarizzatore, una pressa con il disco di policarbonato e la cella di
// carico, l'analizzatore: attraverso l'analizzatore si vede l'immagine calcolata (una «finestra» con la sua texture).
// E i fasci di luce, con le frecce del campo elettrico che oscilla.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { DISK } from './optics.js';

const MONO = '"Geist Mono Variable", Consolas, monospace';
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const cyl = (r0, r1, h, seg = 32, hs = 1, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, hs, open);
const std = (o) => new THREE.MeshStandardMaterial(o);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
// il banco
export const H = 0.16, SCR_TILT = 0.6;
export const BX = { src: -0.47, exitLamp: -0.4025, exitLaser: -0.398, P: -0.26, mid: 0, A: 0.24, scr: 0.46, tube: 0.1 };
// Brewster
export const HB = 0.07, LASER_X = -0.45, LASER_EXIT = -0.378, ARM = 0.3;
// fotoelasticità
export const FY = 0.21, FZ = { box: -0.13, P: -0.065, disk: 0, A: 0.065 }, WIN_R = 0.1;

/** Segmenti luminosi con colore ai due capi. */
class BeamBuffer {
  constructor(max) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    this.bPos = new THREE.InstancedInterleavedBuffer(this.pos, 6, 1); this.bCol = new THREE.InstancedInterleavedBuffer(this.col, 6, 1);
    this.bPos.setUsage(THREE.DynamicDrawUsage); this.bCol.setUsage(THREE.DynamicDrawUsage);
    this.geos = [];
  }
  geometry() {
    const g = new LineSegmentsGeometry();
    g.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.bPos, 3, 0));
    g.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.bPos, 3, 3));
    g.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(this.bCol, 3, 0));
    g.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(this.bCol, 3, 3));
    g.instanceCount = 0; this.geos.push(g); return g;
  }
  reset() { this.n = 0; }
  push(a, b, c0, c1) {
    if (this.n >= this.max) return;
    const i = this.n * 6;
    this.pos[i] = a.x; this.pos[i + 1] = a.y; this.pos[i + 2] = a.z; this.pos[i + 3] = b.x; this.pos[i + 4] = b.y; this.pos[i + 5] = b.z;
    this.col[i] = c0[0]; this.col[i + 1] = c0[1]; this.col[i + 2] = c0[2]; this.col[i + 3] = c1[0]; this.col[i + 4] = c1[1]; this.col[i + 5] = c1[2];
    this.n++;
  }
  commit() { this.bPos.needsUpdate = true; this.bCol.needsUpdate = true; for (const g of this.geos) { g.instanceCount = this.n; g.computeBoundingSphere(); } }
}
const glowTex = () => canvasTexture(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.7)'); r.addColorStop(0.5, 'rgba(255,255,255,0.15)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
}, { srgb: false });

export class Rig {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'polarizzazione';
    this.M = {
      black: std({ color: '#17181b', metalness: 0.2, roughness: 0.5 }),
      dark: std({ color: '#2b2e33', metalness: 0.25, roughness: 0.45 }),
      alu: std({ color: '#c9ccd1', metalness: 1, roughness: 0.35 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      brass: std({ color: '#c9a24f', metalness: 1, roughness: 0.3 }),
      white: std({ color: '#f4f4f1', metalness: 0, roughness: 0.55 }),
      steel: std({ color: '#9ea3aa', metalness: 1, roughness: 0.32 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#eef6f6', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, clearcoat: 1, envMapIntensity: 1.6, side: THREE.DoubleSide }),
    };
    this.glow = glowTex();
    this._buildBench();
    this._buildBrewster();
    this._buildPhoto();
    this._buildBeams();
    this._buildField();
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
  /** Ghiera graduata (0–360°, in senso orario per chi guarda verso la sorgente), per una corona fra r0 e r1. */
  _dialTex(r0, r1, labelEvery = 30) {
    return canvasTexture(1024, 1024, (c) => {
      c.fillStyle = '#1d2026'; c.beginPath(); c.arc(512, 512, 512, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#f2f2ef'; c.fillStyle = '#f2f2ef'; c.font = `600 44px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const R1 = 500, R0 = 512 * (r0 / r1);
      for (let d = 0; d < 360; d += 2) {
        const a = d * D2R, len = d % 10 === 0 ? 46 : 24;
        c.lineWidth = d % 10 === 0 ? 4 : 2.5; c.beginPath(); c.moveTo(512 + Math.sin(a) * R1, 512 - Math.cos(a) * R1); c.lineTo(512 + Math.sin(a) * (R1 - len), 512 - Math.cos(a) * (R1 - len)); c.stroke();
        if (d % labelEvery === 0) { const rr = (R1 + R0) / 2 - 10; c.save(); c.translate(512 + Math.sin(a) * rr, 512 - Math.cos(a) * rr); c.rotate(a); c.fillText(String(d % 180), 0, 0); c.restore(); }
      }
    });
  }
  /**
   * Una montatura girevole (polarizzatore, lamina): la ghiera fissa con la scala, la parte interna che gira con il
   * filtro e l'indice. kind: 'pol' | 'half' | 'quarter'. La normale è lungo x; r: raggio del filtro.
   */
  _mount(kind, parent, r = 0.028) {
    const g = new THREE.Group(); parent.add(g);
    const R1 = r + 0.017;
    this._mesh(new THREE.RingGeometry(r + 0.004, R1, 64).rotateY(Math.PI / 2).translate(0.0062, 0, 0), new THREE.MeshStandardMaterial({ map: this._dialTex(r + 0.004, R1), roughness: 0.5 }), g, false);
    this._mesh(cyl(R1, R1, 0.012, 64, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1d2026', roughness: 0.5, side: THREE.DoubleSide }), g);
    this._mesh(new THREE.RingGeometry(r + 0.004, R1, 64).rotateY(-Math.PI / 2).translate(-0.0062, 0, 0), this.M.black, g, false);
    const rot = new THREE.Group(); g.add(rot);
    this._mesh(new THREE.TorusGeometry(r + 0.002, 0.0028, 10, 64).rotateY(Math.PI / 2), this.M.dark, rot);
    // l'indice (sull'asse di trasmissione o sull'asse veloce) e la levetta per girare
    this._mesh(new THREE.BoxGeometry(0.004, 0.012, 0.0025).translate(0.0068, r + 0.004, 0), new THREE.MeshBasicMaterial({ color: '#e8452c' }), rot, false);
    this._mesh(cyl(0.003, 0.003, 0.018, 12).translate(0, -(r + 0.012), 0), this.M.black, rot);
    const tex = canvasTexture(256, 256, (c) => {
      if (kind === 'pol') {
        c.fillStyle = 'rgba(40,46,44,0.85)'; c.fillRect(0, 0, 256, 256);
        c.strokeStyle = 'rgba(160,170,165,0.35)'; c.lineWidth = 1.5; for (let x = 8; x < 256; x += 12) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
      } else {
        c.fillStyle = 'rgba(232,240,246,0.35)'; c.fillRect(0, 0, 256, 256);
        c.strokeStyle = 'rgba(40,46,54,0.6)'; c.lineWidth = 3; c.setLineDash([10, 8]); c.beginPath(); c.moveTo(128, 6); c.lineTo(128, 250); c.stroke();
        c.fillStyle = 'rgba(30,34,40,0.8)'; c.font = `700 56px ${FONT}`; c.textAlign = 'center'; c.fillText(kind === 'half' ? 'λ/2' : 'λ/4', 128, 170);
      }
    }, { srgb: true });
    const filt = this._mesh(new THREE.CircleGeometry(r + 0.001, 64).rotateY(Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.15, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }), rot, false);
    filt.renderOrder = 4; filt.userData.noOutline = true;
    return { g, rot };
  }
  /** Una montatura su cavaliere: il carrello sulla rotaia, l'asta, la montatura. */
  _onCarrier(x, h, build) {
    const g = new THREE.Group(); g.position.x = x; this.bench.add(g);
    this._mesh(new RoundedBoxGeometry(0.05, 0.022, 0.07, 2, 0.003).translate(0, 0.056, 0), this.M.dark, g);
    this._mesh(cyl(0.006, 0.006, h - 0.067 - 0.03, 16).translate(0, 0.067 + (h - 0.067 - 0.03) / 2, 0), this.M.chrome, g);
    const inner = new THREE.Group(); inner.position.y = h; g.add(inner);
    const out = build(inner);
    return { ...out, g };
  }

  // ───────────────────────────── il banco ottico ─────────────────────────────
  _buildBench() {
    const g = this.bench = new THREE.Group(); this.group.add(g);
    // la rotaia d'alluminio, sui piedini, con la scala davanti
    this._mesh(new RoundedBoxGeometry(1.12, 0.026, 0.05, 2, 0.003).translate(0, 0.032, 0), this.M.alu, g);
    for (const x of [-0.5, 0.5]) this._mesh(new RoundedBoxGeometry(0.04, 0.02, 0.16, 2, 0.003).translate(x, 0.01, 0), this.M.dark, g);
    const scale = canvasTexture(2048, 64, (c) => { c.fillStyle = '#e8eaec'; c.fillRect(0, 0, 2048, 64); c.fillStyle = '#1d2026'; c.font = `600 22px ${MONO}`; c.textAlign = 'center'; for (let cm = 0; cm <= 110; cm++) { const x = (cm / 112) * 2048 + 18; c.fillRect(x - 1, 0, 2, cm % 10 === 0 ? 30 : cm % 5 === 0 ? 20 : 12); if (cm % 10 === 0) c.fillText(String(cm), x, 54); } });
    this._mesh(new THREE.PlaneGeometry(1.12, 0.016).translate(0, 0.032, 0.0252), new THREE.MeshStandardMaterial({ map: scale, roughness: 0.6 }), g, false);
    // la sorgente: la lampada con il condensatore, o il laser
    this.lampG = new THREE.Group(); this.laserG = new THREE.Group();
    this._onCarrier(BX.src, H, (inner) => {
      inner.add(this.lampG, this.laserG);
      this._mesh(new RoundedBoxGeometry(0.1, 0.09, 0.09, 3, 0.008).translate(-0.01, 0, 0), this.M.black, this.lampG);
      for (let i = 0; i < 5; i++) this._mesh(new THREE.BoxGeometry(0.06, 0.003, 0.092).translate(-0.02, 0.046, -0.036 + i * 0.018), this.M.dark, this.lampG, false);
      this._mesh(cyl(0.024, 0.024, 0.03, 32).rotateZ(Math.PI / 2).translate(0.052, 0, 0), this.M.dark, this.lampG);
      this.lampLens = this._mesh(new THREE.CircleGeometry(0.02, 32).rotateY(Math.PI / 2).translate(0.0675, 0, 0), new THREE.MeshBasicMaterial({ color: '#fff4d8', toneMapped: false }), this.lampG, false);
      this.laserBody = this._mesh(cyl(0.013, 0.013, 0.12, 32).rotateZ(Math.PI / 2).translate(0, 0, 0), this.M.dark, this.laserG);
      this._mesh(cyl(0.008, 0.01, 0.012, 24).rotateZ(Math.PI / 2).translate(0.066, 0, 0), this.M.chrome, this.laserG);
      this.laserLed = this._mesh(new THREE.CircleGeometry(0.003, 16).rotateY(Math.PI / 2).translate(0.0725, 0, 0), new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false }), this.laserG, false);
      this._mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03).translate(0, -0.025, 0), this.M.dark, this.laserG);
      return {};
    });
    // il polarizzatore, l'elemento centrale, l'analizzatore
    this.P = this._onCarrier(BX.P, H, (inner) => this._mount('pol', inner));
    this.A = this._onCarrier(BX.A, H, (inner) => this._mount('pol', inner));
    this.mids = {
      pol: this._onCarrier(BX.mid, H, (inner) => this._mount('pol', inner)),
      half: this._onCarrier(BX.mid, H, (inner) => this._mount('half', inner)),
      quarter: this._onCarrier(BX.mid, H, (inner) => this._mount('quarter', inner)),
    };
    // il tubo con la soluzione di zucchero, sui suoi due supporti a V
    const tube = new THREE.Group(); g.add(tube); this.mids.sugar = { g: tube };
    const L = 2 * BX.tube;
    this._mesh(cyl(0.015, 0.015, L, 40, 1, true).rotateZ(Math.PI / 2).translate(0, H, 0), this.M.glass, tube, false).renderOrder = 3;
    this.liquid = this._mesh(cyl(0.013, 0.013, L - 0.004, 32).rotateZ(Math.PI / 2).translate(0, H, 0), new THREE.MeshPhysicalMaterial({ color: '#f3e7b8', transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false }), tube, false);
    this.liquid.renderOrder = 2;
    for (const s of [-1, 1]) {
      this._mesh(cyl(0.017, 0.017, 0.012, 32).rotateZ(Math.PI / 2).translate(s * (BX.tube - 0.004), H, 0), this.M.brass, tube);
      const c = new THREE.Group(); c.position.x = s * 0.06; tube.add(c);
      this._mesh(new RoundedBoxGeometry(0.05, 0.022, 0.07, 2, 0.003).translate(0, 0.056, 0), this.M.dark, c);
      this._mesh(cyl(0.006, 0.006, H - 0.016 - 0.067, 16).translate(0, 0.067 + (H - 0.016 - 0.067) / 2, 0), this.M.chrome, c);
      this._mesh(new THREE.BoxGeometry(0.012, 0.006, 0.04).translate(0, H - 0.017, 0), this.M.black, c);
    }
    // lo schermo con il fotometro, e il fotometro per terra
    // lo schermo è girato un poco verso chi guarda il banco, così la macchia di luce si vede
    this._onCarrier(BX.scr, H, (inner) => {
      inner.rotation.y = SCR_TILT;
      this._mesh(new RoundedBoxGeometry(0.006, 0.14, 0.14, 2, 0.002).translate(0.003, 0, 0), this.M.white, inner);
      this.scrSpot = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.glow, transparent: true, depthWrite: false, toneMapped: false }));
      this.scrSpot.position.x = -0.0004; this.scrSpot.renderOrder = 5; this.scrSpot.userData.noOutline = true; this.scrSpot.userData.noAO = true; inner.add(this.scrSpot);
      this._mesh(cyl(0.011, 0.011, 0.006, 32).rotateZ(Math.PI / 2).translate(-0.002, 0, 0), this.M.black, inner);
      this._mesh(new THREE.CircleGeometry(0.0055, 24).rotateY(-Math.PI / 2).translate(-0.0052, 0, 0), new THREE.MeshStandardMaterial({ color: '#2c3550', roughness: 0.2, metalness: 0.3 }), inner, false);
      return {};
    });
    this.meterBench = this._buildMeter(g, V3(0.36, 0, 0.2), -0.6);
    this._bar(V3(BX.scr + 0.006, H - 0.07, 0.02), V3(0.36, 0.012, 0.15), 0.0016, this.M.black, g);
  }
  /** Un fotometro da banco con il display. */
  _buildMeter(parent, at, rotY) {
    const g = new THREE.Group(); g.position.copy(at); g.rotation.y = rotY; parent.add(g);
    this._mesh(new RoundedBoxGeometry(0.12, 0.05, 0.09, 3, 0.008).translate(0, 0.025, 0), std({ color: '#2f6fb3', roughness: 0.6 }), g);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05).rotateX(-Math.PI / 2 + 0.35), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
    face.position.set(0, 0.052, 0.005); g.add(face);
    return { g, cv, tex, last: '' };
  }
  drawMeter(m, txt, unit, label = 'FOTOMETRO') {
    const key = `${txt}|${unit}`;
    if (key === m.last) return;
    m.last = key;
    const c = m.cv.getContext('2d');
    c.fillStyle = '#23262b'; c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#a3ab93'; c.beginPath(); c.roundRect(24, 24, 464, 160, 14); c.fill();
    c.fillStyle = '#1b1f18'; c.font = `600 110px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(txt, 380, 110);
    c.font = `600 44px ${MONO}`; c.textAlign = 'left'; c.fillText(unit, 392, 124);
    c.fillStyle = '#7fc8ff'; c.font = `700 34px ${FONT}`; c.textAlign = 'center'; c.fillText(label, 256, 222);
    m.tex.needsUpdate = true;
  }
  /** Il banco: sorgente, presenza e angoli delle montature, elemento centrale. */
  setBench({ src, useP, p1, mid, m, useA, an, conc }) {
    this.lampG.visible = src === 'lamp'; this.laserG.visible = src !== 'lamp';
    this.laserLed.material.color.set(src === 'green' ? '#30ff60' : '#ff3020');
    this.P.g.visible = useP; this.A.g.visible = useA;
    this.P.rot.rotation.x = -p1 * D2R; this.A.rot.rotation.x = -an * D2R;
    for (const [k, v] of Object.entries(this.mids)) { v.g.visible = k === mid; if (v.rot) v.rot.rotation.x = -m * D2R; }
    this.liquid.material.color.set('#f3e7b8').lerp(new THREE.Color('#e7c76a'), Math.min(1, conc / 0.6));
  }

  // ───────────────────────────── Brewster ─────────────────────────────
  _buildBrewster() {
    const g = this.brew = new THREE.Group(); this.group.add(g);
    // il piatto girevole graduato, sulla sua base
    this._mesh(cyl(0.135, 0.14, 0.02, 64).translate(0, 0.01, 0), this.M.dark, g);
    this.table = new THREE.Group(); g.add(this.table);
    const top = canvasTexture(1024, 1024, (c) => {
      c.fillStyle = '#e9ebee'; c.beginPath(); c.arc(512, 512, 512, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#1d2026'; c.fillStyle = '#1d2026'; c.font = `600 34px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let d = 0; d < 360; d++) { const a = d * D2R, len = d % 10 === 0 ? 40 : d % 5 === 0 ? 26 : 14; c.lineWidth = d % 10 === 0 ? 3 : 1.5; c.beginPath(); c.moveTo(512 + Math.cos(a) * 500, 512 + Math.sin(a) * 500); c.lineTo(512 + Math.cos(a) * (500 - len), 512 + Math.sin(a) * (500 - len)); c.stroke(); if (d % 10 === 0) c.fillText(String(d <= 180 ? d : 360 - d), 512 + Math.cos(a) * 430, 512 + Math.sin(a) * 430); }
      c.lineWidth = 2; c.setLineDash([12, 10]); c.beginPath(); c.moveTo(12, 512); c.lineTo(1012, 512); c.stroke();
    });
    this._mesh(cyl(0.125, 0.125, 0.008, 96).translate(0, 0.024, 0), this.M.dark, this.table);
    this._mesh(new THREE.CircleGeometry(0.124, 96).rotateX(-Math.PI / 2).translate(0, 0.0282, 0), new THREE.MeshStandardMaterial({ map: top, roughness: 0.6 }), this.table, false);
    // la lastra di vetro: la faccia riflettente passa per il centro e ha la normale verso −x quando il piatto è a 0°
    const T = 0.025, W = 0.08, Hh = 0.08;
    const blk = new THREE.Group(); blk.position.set(T / 2, 0.028 + Hh / 2, 0); this.table.add(blk);
    const glass = this._mesh(new THREE.BoxGeometry(T, Hh, W), new THREE.MeshPhysicalMaterial({ color: '#dff0ee', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false, envMapIntensity: 2 }), blk, false);
    glass.renderOrder = 3;
    blk.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(T, Hh, W)), new THREE.LineBasicMaterial({ color: '#7fa6a2', transparent: true, opacity: 0.7 })));
    // l'indice fisso, verso il laser
    this._mesh(new THREE.BoxGeometry(0.02, 0.004, 0.003).translate(-0.145, 0.03, 0), new THREE.MeshBasicMaterial({ color: '#e8452c' }), g, false);
    // il laser, che gira sul suo asse dentro il supporto a V
    const ls = new THREE.Group(); ls.position.set(LASER_X, 0, 0); g.add(ls);
    this._mesh(new RoundedBoxGeometry(0.1, 0.012, 0.07, 2, 0.003).translate(0, 0.006, 0), this.M.dark, ls);
    this._mesh(cyl(0.006, 0.006, HB - 0.03, 16).translate(0, 0.012 + (HB - 0.03) / 2, 0), this.M.chrome, ls);
    this._mesh(new THREE.BoxGeometry(0.03, 0.012, 0.04).translate(0, HB - 0.019, 0), this.M.black, ls);
    this.bLaser = new THREE.Group(); this.bLaser.position.set(0, HB, 0); ls.add(this.bLaser);
    this._mesh(cyl(0.013, 0.013, 0.12, 32).rotateZ(Math.PI / 2), this.M.dark, this.bLaser);
    this._mesh(cyl(0.008, 0.01, 0.012, 24).rotateZ(Math.PI / 2).translate(0.066, 0, 0), this.M.chrome, this.bLaser);
    // il segno della polarizzazione sul corpo del laser
    this._mesh(new THREE.BoxGeometry(0.09, 0.0026, 0.0012).translate(0, 0.0131, 0), new THREE.MeshBasicMaterial({ color: '#f2f2ef' }), this.bLaser, false);
    this._mesh(new THREE.BoxGeometry(0.09, 0.0026, 0.0012).translate(0, -0.0131, 0), new THREE.MeshBasicMaterial({ color: '#f2f2ef' }), this.bLaser, false);
    // il braccio con il rivelatore
    this.arm = new THREE.Group(); g.add(this.arm);
    this._mesh(new RoundedBoxGeometry(ARM + 0.03, 0.01, 0.024, 2, 0.003).translate((ARM + 0.03) / 2, 0.035, 0), this.M.alu, this.arm);
    this._mesh(cyl(0.006, 0.006, HB - 0.04, 16).translate(ARM, 0.04 + (HB - 0.04) / 2 - 0.01, 0), this.M.chrome, this.arm);
    this._mesh(new RoundedBoxGeometry(0.02, 0.06, 0.06, 2, 0.004).translate(ARM + 0.012, HB, 0), this.M.white, this.arm);
    this._mesh(new THREE.CircleGeometry(0.006, 24).rotateY(-Math.PI / 2).translate(ARM + 0.0015, HB, 0), new THREE.MeshStandardMaterial({ color: '#2c3550', roughness: 0.2 }), this.arm, false);
    this._mesh(cyl(0.01, 0.01, 0.008, 24).translate(ARM, 0.028, 0), this.M.black, this.arm);
    this.meterBrew = this._buildMeter(g, V3(0.36, 0, 0.27), -0.75);
  }
  /** Il piatto all'angolo d'incidenza th, il laser girato di bp, il braccio sul fascio riflesso (direzione rd). */
  setBrewster(th, bp) {
    // la normale della faccia è (−cos θ, 0, sin θ): il piatto gira di −θ attorno a y
    this.table.rotation.y = th * D2R;
    this.bLaser.rotation.x = -bp * D2R;
    const ang = Math.atan2(Math.sin(2 * th * D2R), -Math.cos(2 * th * D2R));    // direzione del riflesso nel piano xz
    this.arm.rotation.y = -ang;
  }

  // ───────────────────────────── fotoelasticità ─────────────────────────────
  _buildPhoto() {
    const g = this.photo = new THREE.Group(); this.group.add(g);
    // la scatola luminosa, in piedi
    this._mesh(new RoundedBoxGeometry(0.34, 0.34, 0.06, 3, 0.008).translate(0, FY, FZ.box), this.M.dark, g);
    this.lightPanel = this._mesh(new THREE.PlaneGeometry(0.3, 0.3).translate(0, FY, FZ.box + 0.0305), new THREE.MeshBasicMaterial({ color: '#fbfaf4', toneMapped: false }), g, false);
    for (const s of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.06, 0.04, 0.1, 2, 0.004).translate(s * 0.13, 0.02, FZ.box), this.M.black, g);
    // il polarizzatore e l'analizzatore, rotondi, nelle loro ghiere su due aste
    const ring = (z) => {
      const holder = new THREE.Group(); holder.position.set(0, FY, z); g.add(holder);
      const R0 = WIN_R, R1 = WIN_R + 0.018;
      this._mesh(new THREE.RingGeometry(R0, R1, 96).translate(0, 0, 0.004), new THREE.MeshStandardMaterial({ map: this._dialTex(R0, R1, 30), roughness: 0.5 }), holder, false);
      this._mesh(cyl(R1, R1, 0.008, 96, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1d2026', side: THREE.DoubleSide, roughness: 0.5 }), holder);
      for (const s of [-1, 1]) this._bar(V3(s * (R1 + 0.006), -0.0, 0), V3(s * (R1 + 0.006), -FY + 0.012, 0), 0.005, this.M.chrome, holder);
      for (const s of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.05, 0.012, 0.07, 2, 0.003).translate(s * (R1 + 0.006), -FY + 0.006, 0), this.M.dark, holder);
      const rot = new THREE.Group(); holder.add(rot);
      this._mesh(new THREE.BoxGeometry(0.006, 0.016, 0.003).translate(0, R0 + 0.006, 0.0052), new THREE.MeshBasicMaterial({ color: '#e8452c' }), rot, false);
      return { holder, rot };
    };
    this.fP = ring(FZ.P); this.fA = ring(FZ.A);
    const pf = this._mesh(new THREE.CircleGeometry(WIN_R, 96), new THREE.MeshPhysicalMaterial({ color: '#59605c', transparent: true, opacity: 0.42, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide }), this.fP.rot, false);
    pf.renderOrder = 3; pf.userData.noOutline = true;
    // la finestra dell'analizzatore: ciò che si vede attraverso. Per ogni pixel lo shader segue il raggio dall'occhio fino
    // al piano del disco: sul disco calcola lo sforzo (la soluzione chiusa) e ne legge il colore nella tabella del
    // polariscopio; fuori dal disco c'è il fondo della scatola luminosa, o la sagoma scura della pressa.
    this.lutTex = new THREE.DataTexture(new Uint8Array(1024 * 48 * 4), 1024, 48, THREE.RGBAFormat);
    this.lutTex.colorSpace = THREE.SRGBColorSpace; this.lutTex.magFilter = this.lutTex.minFilter = THREE.LinearFilter;
    this.lutTex.wrapS = THREE.ClampToEdgeWrapping; this.lutTex.wrapT = THREE.RepeatWrapping; this.lutTex.needsUpdate = true;
    const masks = this.photoMasks().map((m) => new THREE.Vector4(m.x0, m.x1, m.y0, m.y1));
    while (masks.length < 10) masks.push(new THREE.Vector4(0, 0, 0, 0));
    this.winMat = new THREE.ShaderMaterial({
      uniforms: {
        lut: { value: this.lutTex }, maxN: { value: 30 }, nN: { value: 1024 }, load: { value: 0 }, gain: { value: 1.25 },
        c0: { value: new THREE.Vector2(0, FY) }, zd: { value: FZ.disk }, zp: { value: FZ.box + 0.0305 }, masks: { value: masks }, frame: { value: new THREE.Color(0.012, 0.013, 0.015) },
        R: { value: DISK.R }, T: { value: DISK.t }, FS: { value: DISK.fs },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D lut; uniform float maxN, nN, load, gain, zd, zp, R, T, FS; uniform vec2 c0; uniform vec4 masks[10]; uniform vec3 frame; varying vec3 vW;
        const float PI = 3.14159265;
        vec3 lutAt(float N, float v) { return texture2D(lut, vec2(clamp(N / maxN, 0.0, 1.0) * (1.0 - 1.0 / nN) + 0.5 / nN, v)).rgb; }
        void main() {
          vec3 d = normalize(vW - cameraPosition);
          vec2 q = (vW + d * ((zd - vW.z) / d.z)).xy - c0;
          vec3 col = lutAt(0.0, 0.25);
          float r2 = dot(q, q);
          if (r2 < R * R) {
            float x = q.x, y = q.y, k = 2.0 / (PI * T);
            float a1 = max(x * x + (R - y) * (R - y), 1e-10), a2 = max(x * x + (R + y) * (R + y), 1e-10);
            a1 *= a1; a2 *= a2;
            float sx = -k * ((R - y) * x * x / a1 + (R + y) * x * x / a2 - 0.5 / R);
            float sy = -k * ((R - y) * (R - y) * (R - y) / a1 + (R + y) * (R + y) * (R + y) / a2 - 0.5 / R);
            float txy = k * ((R - y) * (R - y) * x / a1 - (R + y) * (R + y) * x / a2);
            float ds = sqrt((sx - sy) * (sx - sy) + 4.0 * txy * txy);
            float alpha = 0.5 * atan(2.0 * txy, sx - sy);
            // l'angolo della tabella si conta dalla verticale, in senso orario
            col = lutAt(ds * load * T / FS, fract(0.5 - alpha / PI));
            col *= 1.0 - 0.55 * smoothstep(0.93 * R * R, R * R, r2);
          } else {
            for (int i = 0; i < 10; i++) { vec4 m = masks[i]; if (q.x > m.x && q.x < m.y && q.y > m.z && q.y < m.w) col = frame; }
            vec2 p = (vW + d * ((zp - vW.z) / d.z)).xy - c0;
            if (abs(p.x) > 0.15 || abs(p.y) > 0.15) col = frame;
          }
          gl_FragColor = vec4(col * gain, 1.0);
        }`,
    });
    this.win = this._mesh(new THREE.CircleGeometry(WIN_R, 96), this.winMat, this.fA.holder, false);
    this.win.position.z = 0.0012; this.win.userData.noOutline = true; this.win.userData.noAO = true;
    // la pressa: due colonne, i traversi, la vite con il volantino, le ganasce, la cella di carico
    const press = new THREE.Group(); press.position.set(0, 0, FZ.disk); g.add(press);
    for (const s of [-1, 1]) this._mesh(cyl(0.006, 0.006, 0.34, 16).translate(s * 0.075, 0.17, 0), this.M.chrome, press);
    this._mesh(new RoundedBoxGeometry(0.19, 0.02, 0.03, 2, 0.003).translate(0, 0.34, 0), this.M.steel, press);
    this._mesh(new RoundedBoxGeometry(0.19, 0.02, 0.03, 2, 0.003).translate(0, 0.02, 0), this.M.steel, press);
    this._mesh(new RoundedBoxGeometry(0.06, 0.012, 0.1, 2, 0.003).translate(0, 0.006, 0), this.M.dark, press);
    this.screw = this._mesh(cyl(0.005, 0.005, 0.12, 16).translate(0, 0.34, 0), this.M.steel, press);
    this.wheel = new THREE.Group(); this.wheel.position.set(0, 0.395, 0); press.add(this.wheel);
    this._mesh(new THREE.TorusGeometry(0.025, 0.003, 10, 40).rotateX(Math.PI / 2), this.M.black, this.wheel);
    for (let k = 0; k < 3; k++) this._mesh(new THREE.BoxGeometry(0.05, 0.003, 0.003).rotateY((k * Math.PI) / 3), this.M.black, this.wheel);
    // la cella di carico sopra la ganascia
    this._mesh(cyl(0.012, 0.012, 0.016, 32).translate(0, FY + DISK.R + 0.034, 0), std({ color: '#2f6fb3', roughness: 0.5 }), press);
    for (const s of [1, -1]) this._mesh(new RoundedBoxGeometry(0.03, 0.022, 0.016, 2, 0.002).translate(0, FY + s * (DISK.R + 0.011), 0), this.M.steel, press);
    this._mesh(new RoundedBoxGeometry(0.03, FY - DISK.R - 0.022 - 0.03, 0.016, 2, 0.002).translate(0, (FY - DISK.R - 0.022 + 0.03) / 2, 0), this.M.steel, press);
    // il disco di policarbonato
    const disk = this._mesh(cyl(DISK.R, DISK.R, DISK.t, 64).rotateX(Math.PI / 2).translate(0, FY, 0), new THREE.MeshPhysicalMaterial({ color: '#eef4f6', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }), press, false);
    disk.renderOrder = 2;
    this.loadMeter = this._buildMeter(g, V3(0.2, 0, 0.12), -0.4);
  }
  setPhoto({ pa, aa, load }) {
    this.fP.rot.rotation.z = -pa * D2R; this.fA.rot.rotation.z = -aa * D2R;
    this.wheel.rotation.y = load * 0.01;
    this.winMat.uniforms.load.value = load;
  }
  /** La tabella dei colori del polariscopio (da photoLUT). */
  setPhotoLUT(L) {
    const t = this.lutTex;
    // in WebGL 2 la memoria della texture ha dimensioni fisse: se cambiano, la si rifà
    if (t.image.width === L.nN && t.image.height === L.nPhi) t.image.data.set(L.data);
    else { t.dispose(); t.image = { data: L.data.slice(), width: L.nN, height: L.nPhi }; }
    t.needsUpdate = true;
    this.winMat.uniforms.maxN.value = L.maxN; this.winMat.uniforms.nN.value = L.nN;
  }
  /** Le silhouette dietro l'analizzatore (coordinate della finestra in metri, centro sul disco): colonne e ganasce. */
  photoMasks() {
    return [
      { x0: -0.081, x1: -0.069, y0: -1, y1: 1 }, { x0: 0.069, x1: 0.081, y0: -1, y1: 1 },
      { x0: -0.015, x1: 0.015, y0: DISK.R, y1: DISK.R + 0.022 }, { x0: -0.015, x1: 0.015, y0: -DISK.R - 0.022, y1: -DISK.R },
      { x0: -0.015, x1: 0.015, y0: -1, y1: -DISK.R - 0.022 }, { x0: -0.012, x1: 0.012, y0: DISK.R + 0.022, y1: DISK.R + 0.042 },
      { x0: -0.005, x1: 0.005, y0: DISK.R + 0.042, y1: 1 }, { x0: -0.095, x1: 0.095, y0: 0.34 - FY - 0.01, y1: 0.34 - FY + 0.01 },
      { x0: -0.095, x1: 0.095, y0: 0.02 - FY - 0.01, y1: 0.02 - FY + 0.01 },
    ];
  }

  // ───────────────────────────── fasci di luce ─────────────────────────────
  _buildBeams() {
    this.beams = new BeamBuffer(400);
    const mk = (w, op, blend) => {
      const m = new LineMaterial({ vertexColors: true, linewidth: w, worldUnits: true, transparent: true, opacity: op, blending: blend, premultipliedAlpha: blend === THREE.MultiplyBlending, depthWrite: false, toneMapped: false });
      const l = new LineSegments2(this.beams.geometry(), m);
      l.frustumCulled = false; l.renderOrder = 8; l.userData.noOutline = true; this.group.add(l); return l;
    };
    this.core = mk(0.0012, 1, THREE.AdditiveBlending); this.halo = mk(0.007, 0.25, THREE.AdditiveBlending);
    this.tintBuf = new BeamBuffer(400);
    this.tint = new LineSegments2(this.tintBuf.geometry(), new LineMaterial({ vertexColors: true, linewidth: 0.005, worldUnits: true, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, toneMapped: false }));
    this.tint.frustumCulled = false; this.tint.renderOrder = 7; this.tint.userData.noOutline = true; this.group.add(this.tint);
    this.spots = Array.from({ length: 4 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.visible = false; s.renderOrder = 9; this.group.add(s); return s;
    });
  }
  /** La macchia di luce sullo schermo: c il colore (rgb lineare, già con l'intensità), r il raggio. */
  setScreenSpot(c, r) {
    const m = Math.max(c[0], c[1], c[2]);
    this.scrSpot.visible = m > 0.003;
    if (!this.scrSpot.visible) return;
    this.scrSpot.material.color.setRGB(c[0] / m, c[1] / m, c[2] / m).multiplyScalar(1.25);
    this.scrSpot.material.opacity = Math.min(1, Math.sqrt(m) * 1.6);
    this.scrSpot.scale.setScalar(r);
  }
  /** segs: [{a, b (Vector3), c0, c1 (rgb, intensità comprese)}]; spots: [{p, c, size}]; wide: fascio largo (la lampada). */
  setBeams(segs, spots, wide) {
    const b = this.beams, tb = this.tintBuf; b.reset(); tb.reset();
    this.core.material.linewidth = wide ? 0.004 : 0.0012; this.halo.material.linewidth = wide ? 0.022 : 0.007; this.halo.material.opacity = wide ? 0.14 : 0.25;
    for (const s of segs) {
      b.push(s.a, s.b, s.c0, s.c1);
      // sotto il fascio un velo che toglie i colori che la luce non ha (e un poco di tutto): così si vede anche sul chiaro
      const tint = (c) => { const m = Math.max(c[0], c[1], c[2], 1e-6), k = Math.min(1, m * 0.6); return c.map((v) => 1 - (0.55 * (1 - v / m) + 0.1) * k); };
      tb.push(s.a, s.b, tint(s.c0), tint(s.c1));
    }
    b.commit(); tb.commit();
    this.spots.forEach((sp, i) => {
      const s = spots[i]; sp.visible = !!s;
      if (!s) return;
      sp.position.copy(s.p); sp.material.color.setRGB(s.c[0], s.c[1], s.c[2]); sp.scale.setScalar(s.size);
    });
  }

  // ───────────────────────────── il campo elettrico ─────────────────────────────
  _buildField() {
    const mat = new THREE.MeshStandardMaterial({ color: '#e8452c', roughness: 0.4, emissive: '#e8452c', emissiveIntensity: 0.35 });
    this.eShaft = new THREE.InstancedMesh(cyl(0.0011, 0.0011, 1, 8).translate(0, 0.5, 0), mat, 220);
    this.eHead = new THREE.InstancedMesh(new THREE.ConeGeometry(0.0032, 0.008, 10).translate(0, -0.004, 0), mat, 220);
    for (const m of [this.eShaft, this.eHead]) { m.count = 0; m.frustumCulled = false; m.userData.noOutline = true; m.userData.noAO = true; this.group.add(m); }
    this.eBuf = new BeamBuffer(400);
    this.eLine = new LineSegments2(this.eBuf.geometry(), new LineMaterial({ vertexColors: true, linewidth: 0.0012, worldUnits: true, toneMapped: false }));
    this.eLine.frustumCulled = false; this.eLine.userData.noOutline = true; this.group.add(this.eLine);
  }
  /** Le frecce del campo: pts [{p (sull'asse), e (vettore campo, m)}], a gruppi (tratti) per la curva delle punte. */
  setField(groups, show) {
    this.eShaft.visible = this.eHead.visible = this.eLine.visible = show;
    if (!show) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V3(0, 1, 0), d = new THREE.Vector3(), tip = new THREE.Vector3(), one = V3(1, 1, 1);
    let n = 0; this.eBuf.reset();
    const col = [0.91, 0.27, 0.17];
    for (const pts of groups) {
      let prev = null, prevL = 0;
      for (const pt of pts) {
        const L = pt.e.length();
        tip.copy(pt.p).add(pt.e);
        // la curva delle punte, solo dove il campo c'è
        if (prev && (L > 0.0012 || prevL > 0.0012)) this.eBuf.push(prev, tip.clone(), col, col);
        prev = tip.clone(); prevL = L;
        if (L < 0.0025 || n >= 220) continue;
        d.copy(pt.e).divideScalar(L); q.setFromUnitVectors(up, d);
        m.compose(pt.p, q, V3(1, L - 0.006 > 0 ? L - 0.006 : 0.0001, 1)); this.eShaft.setMatrixAt(n, m);
        m.compose(tip, q, one); this.eHead.setMatrixAt(n, m);
        n++;
      }
    }
    this.eShaft.count = this.eHead.count = n;
    this.eShaft.instanceMatrix.needsUpdate = this.eHead.instanceMatrix.needsUpdate = true;
    this.eBuf.commit();
  }

  /** Quale apparato. */
  setExp(exp) { this.bench.visible = exp === 'bench'; this.brew.visible = exp === 'brewster'; this.photo.visible = exp === 'photo'; }
  anchors(exp) {
    if (exp === 'bench') return { src: V3(BX.src, H + 0.07, 0), P: V3(BX.P, H + 0.06, 0), mid: V3(BX.mid, H + 0.06, 0), A: V3(BX.A, H + 0.06, 0), scr: V3(BX.scr, H + 0.09, 0), meter: V3(0.36, 0.08, 0.2) };
    if (exp === 'brewster') return { laser: V3(LASER_X, HB + 0.04, 0), table: V3(-0.11, 0.03, 0.1), glass: V3(0.03, 0.118, -0.02), det: V3(0, HB + 0.05, 0), meter: V3(0.38, 0.08, 0.25) };
    return { box: V3(0.12, FY + 0.19, FZ.box), P: V3(-0.11, FY + 0.1, FZ.P), A: V3(0.11, FY + 0.1, FZ.A), press: V3(0, 0.415, 0), meter: V3(0.2, 0.08, 0.12) };
  }
}
