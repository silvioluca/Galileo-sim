// rig.js — i due apparati in 3D, appoggiati sul pavimento.
// Faraday: due colonnine isolanti con i morsetti in cima, l'altalena di ottone appesa a due fili di rame, uno, due o tre
// magneti a U coricati su un rialzo di legno, con il tratto orizzontale dell'altalena fra le espansioni polari, e un
// goniometro trasparente accanto per leggere l'inclinazione.
// Ampère: un portale con due strisce di alluminio verticali, tese da due mollette, i morsetti in alto e in basso, i
// ponticelli che le mettono in serie o in parallelo, un righello dietro le strisce a metà altezza.
// In comune: l'alimentatore per correnti forti, i cavi con le spine a banana, le frecce di I, B e F.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { SWING, MAGNET, ROD_Y, STRIPS, magnetX } from './physics.js';

const MONO = '"Geist Mono Variable", Consolas, monospace';
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const std = (o) => new THREE.MeshStandardMaterial(o);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SUPPLY_AT = [-0.42, 0.04, 0.4];
export const MID_Y = STRIPS.top - STRIPS.L / 2;

export class Rig {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'Ampère e Faraday';
    this.M = {
      black: std({ color: '#17181b', metalness: 0.2, roughness: 0.5 }),
      dark: std({ color: '#2b2e33', metalness: 0.2, roughness: 0.5 }),
      panel: std({ color: '#d9dbdf', metalness: 0.15, roughness: 0.5 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      brass: std({ color: '#c9a24f', metalness: 1, roughness: 0.3 }),
      copper: std({ color: '#c77a48', metalness: 1, roughness: 0.3 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      steel: std({ color: '#9ea3aa', metalness: 1, roughness: 0.32 }),
      wood: std({ color: '#c49565', metalness: 0, roughness: 0.62 }),
      white: std({ color: '#f2f2ef', metalness: 0, roughness: 0.5 }),
      alu: new THREE.MeshStandardMaterial({ color: '#d8dbe0', metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide }),
      redCable: std({ color: '#c0281d', metalness: 0, roughness: 0.55 }),
      blackCable: std({ color: '#1b1c1e', metalness: 0, roughness: 0.55 }),
    };
    this._buildFaraday();
    this._buildAmpere();
    this._buildSupply();
    this._buildArrows();
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
  _socket(parent, p, d, mat) {
    const m = this._mesh(cyl(0.0058, 0.0058, 0.012, 20), mat, parent);
    m.position.copy(p).addScaledVector(d, 0.006); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d);
    this._mesh(cyl(0.0022, 0.0022, 0.0125, 12), this.M.black, m, false);
    return { p: p.clone().addScaledVector(d, 0.012), d: d.clone() };
  }
  _label(text, size, color, parent, x, y, z) {
    const tex = canvasTexture(128, 128, (c) => { c.fillStyle = color; c.font = `700 96px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 64, 70); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false }));
    m.position.set(x, y, z); m.userData.noOutline = true; parent.add(m); return m;
  }

  // ───────────────────────────── Faraday ─────────────────────────────
  _buildFaraday() {
    const g = this.faraday = new THREE.Group(); this.group.add(g);
    const P = SWING.pivotY, H = SWING.half, CX = H + 0.025, CZ = -0.13;
    this._mesh(new RoundedBoxGeometry(0.34, 0.012, 0.3, 2, 0.004).translate(0, 0.006, -0.04), this.M.dark, g);
    // le colonnine isolanti (indietro, per non coprire i fili e il goniometro), i morsetti in cima, i bracci con i ganci
    this.fT = [];
    for (const s of [-1, 1]) {
      this._mesh(cyl(0.008, 0.009, P + 0.01 - 0.012, 24).translate(s * CX, 0.012 + (P + 0.01 - 0.012) / 2, CZ), this.M.black, g);
      this._mesh(cyl(0.009, 0.009, 0.022, 24).translate(s * CX, P + 0.021, CZ), this.M.brass, g);
      this.fT.push(this._socket(g, V3(s * CX, P + 0.032, CZ), V3(0, 1, 0), s < 0 ? this.M.red : this.M.black));
      this._bar(V3(s * CX, P, CZ), V3(s * H, P, -0.006), 0.0022, this.M.brass, g);
      this._bar(V3(s * H, P, -0.006), V3(s * H, P, 0.006), 0.0018, this.M.brass, g);
      this._mesh(new THREE.TorusGeometry(0.003, 0.0009, 8, 20).rotateY(Math.PI / 2).translate(s * H, P - 0.003, 0), this.M.brass, g, false);
    }
    // l'altalena: due fili di rame e il tratto orizzontale d'ottone, che ruota attorno all'asse dei ganci
    this.swing = new THREE.Group(); this.swing.position.set(0, P, 0); g.add(this.swing);
    for (const s of [-1, 1]) this._mesh(cyl(0.0008, 0.0008, SWING.l, 8).translate(s * H, -SWING.l / 2, 0), this.M.copper, this.swing);
    this._mesh(cyl(SWING.r, SWING.r, 2 * H + 0.004, 24).rotateZ(Math.PI / 2).translate(0, -SWING.l, 0), this.M.brass, this.swing);
    // i magneti a U, coricati con l'apertura verso di noi, sul loro rialzo
    const ro = MAGNET.gap / 2 + MAGNET.arm, ri = MAGNET.gap / 2, zb = -0.066, z1 = MAGNET.depth / 2;
    const s = new THREE.Shape();
    s.moveTo(-z1, ro); s.lineTo(-zb, ro); s.absarc(-zb, 0, ro, Math.PI / 2, -Math.PI / 2, true); s.lineTo(-z1, -ro);
    s.lineTo(-z1, -ri); s.lineTo(-zb, -ri); s.absarc(-zb, 0, ri, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-z1, ri); s.closePath();
    const ugeo = new THREE.ExtrudeGeometry(s, { depth: MAGNET.a, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2, curveSegments: 32 }).rotateY(Math.PI / 2);
    this.magnets = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Group(); g.add(m);
      this._mesh(ugeo, this.M.red, m).position.set(-MAGNET.a / 2, ROD_Y, 0);
      for (const sy of [1, -1]) this._mesh(new THREE.BoxGeometry(MAGNET.a, 0.002, MAGNET.depth).translate(0, ROD_Y + sy * (ri - 0.001), 0), this.M.steel, m);
      this._mesh(new RoundedBoxGeometry(MAGNET.a + 0.004, ROD_Y - ro - 0.012, 0.11, 2, 0.002).translate(0, (ROD_Y - ro + 0.012) / 2, -0.015), this.M.wood, m);
      const top = this._label('N', 0.016, '#ffffff', m, 0, ROD_Y + ro + 0.0012, 0.03);
      m.userData.letter = top;
      this.magnets.push(m);
    }
    this.letterTex = { N: this.magnets[0].userData.letter.material.map, S: canvasTexture(128, 128, (c) => { c.fillStyle = '#ffffff'; c.font = `700 96px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('S', 64, 70); }) };
    // il goniometro trasparente, centrato sull'asse dei ganci, accanto al filo di destra
    const R = 0.17, tex = canvasTexture(1024, 512, (c) => {
      c.clearRect(0, 0, 1024, 512);
      c.fillStyle = 'rgba(240,244,248,0.35)'; c.beginPath(); c.moveTo(512, 0); c.arc(512, 0, 510, 0, Math.PI); c.fill();
      c.strokeStyle = '#1d2026'; c.fillStyle = '#1d2026'; c.font = `600 26px ${MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let d = -40; d <= 40; d++) {
        const a = (d * Math.PI) / 180, r0 = d % 10 === 0 ? 400 : d % 5 === 0 ? 440 : 465;
        // da questa parte del goniometro un'inclinazione verso di noi (+z) appare a sinistra
        const ux = -Math.sin(a), uy = Math.cos(a);
        c.lineWidth = d % 10 === 0 ? 3 : 1.6; c.beginPath(); c.moveTo(512 + ux * r0, uy * r0); c.lineTo(512 + ux * 505, uy * 505); c.stroke();
        if (d % 10 === 0) c.fillText(String(Math.abs(d)), 512 + ux * 365, uy * 365);
      }
      c.lineWidth = 2; c.beginPath(); c.moveTo(512, 0); c.lineTo(512, 505); c.stroke();
    }, { aniso: 8 });
    tex.flipY = true;
    const prot = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, R).translate(0, -R / 2, 0).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    prot.position.set(H + 0.012, P, 0); prot.userData.noOutline = true; prot.renderOrder = 3; g.add(prot);
    this._bar(V3(H + 0.012, P + 0.002, 0), V3(H + 0.012, P + 0.002, CZ), 0.0015, this.M.chrome, g);
    this._bar(V3(H + 0.012, P + 0.002, CZ), V3(CX, P + 0.002, CZ), 0.0015, this.M.chrome, g);
  }
  /** Altalena all'angolo th; n magneti; flip: nord in basso. */
  setFaraday(th, n, flip) {
    this.swing.rotation.x = -th;
    const xs = magnetX(n);
    this.magnets.forEach((m, k) => {
      m.visible = k < n; if (k < n) m.position.x = xs[k];
      const L = m.userData.letter; L.material.map = flip ? this.letterTex.S : this.letterTex.N;
    });
  }

  // ───────────────────────────── Ampère ─────────────────────────────
  _buildAmpere() {
    const g = this.ampere = new THREE.Group(); this.group.add(g);
    const T = STRIPS.top, B = T - STRIPS.L, zb = -0.03, half = STRIPS.d0 / 2;
    this._mesh(new RoundedBoxGeometry(0.3, 0.012, 0.18, 2, 0.004).translate(0, 0.006, -0.01), this.M.dark, g);
    for (const s of [-1, 1]) this._mesh(cyl(0.008, 0.008, T + 0.04 - 0.012, 24).translate(s * 0.11, 0.012 + (T + 0.04 - 0.012) / 2, zb), this.M.chrome, g);
    this._mesh(new RoundedBoxGeometry(0.26, 0.02, 0.026, 2, 0.003).translate(0, T + 0.03, zb), this.M.black, g);
    this._mesh(new RoundedBoxGeometry(0.26, 0.02, 0.026, 2, 0.003).translate(0, B - 0.05, zb), this.M.black, g);
    this.aT = { top: [], bot: [] };
    for (const s of [-1, 1]) {
      // morsetti in alto (dal traverso) e mollette in basso
      this._mesh(new RoundedBoxGeometry(0.01, 0.02, 0.022, 2, 0.002).translate(s * half, T + 0.008, 0), this.M.black, g);
      this._bar(V3(s * half, T + 0.02, 0), V3(s * half, T + 0.02, zb), 0.003, this.M.black, g);
      this._mesh(new RoundedBoxGeometry(0.01, 0.014, 0.022, 2, 0.002).translate(s * half, B - 0.006, 0), this.M.black, g);
      const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120; pts.push(V3(s * half + 0.003 * Math.cos(t * Math.PI * 24), B - 0.013 - 0.026 * t, 0.003 * Math.sin(t * Math.PI * 24))); }
      this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0005, 6, false), this.M.chrome, g, false);
      this._bar(V3(s * half, B - 0.039, 0), V3(s * half, B - 0.05, zb), 0.0012, this.M.chrome, g);
      // i morsetti con le boccole, collegati alle strisce da una lamina d'ottone
      for (const [list, y] of [[this.aT.top, T + 0.008], [this.aT.bot, B - 0.006]]) {
        this._bar(V3(s * half, y, 0.006), V3(s * (half + 0.016), y, 0.006), 0.0015, this.M.brass, g);
        list.push(this._socket(g, V3(s * (half + 0.02), y, 0.006), V3(0, 0, 1), s < 0 ? this.M.red : this.M.black));
      }
    }
    // le strisce di alluminio: nastri verticali con la faccia verso l'altra striscia
    this.strips = [-1, 1].map((s) => {
      const geo = new THREE.PlaneGeometry(STRIPS.w, STRIPS.L, 1, STRIPS.N).rotateY(Math.PI / 2).translate(0, T - STRIPS.L / 2, 0);
      const m = this._mesh(geo, this.M.alu, g, true);
      m.userData.side = s; m.frustumCulled = false;
      return m;
    });
    // il righello dietro, a metà altezza
    const tex = canvasTexture(1024, 96, (c) => {
      c.fillStyle = '#f2ead6'; c.fillRect(0, 0, 1024, 96); c.fillStyle = '#1d2026'; c.font = `600 26px ${MONO}`; c.textAlign = 'center';
      for (let mm = -50; mm <= 50; mm++) { const x = 512 + mm * 9.6, h = mm % 10 === 0 ? 40 : mm % 5 === 0 ? 28 : 16; c.fillRect(x - 1, 0, 2, h); if (mm % 10 === 0) c.fillText(String(Math.abs(mm / 10)), x, 80); }
    }, { aniso: 8 });
    this._mesh(new THREE.BoxGeometry(0.1067, 0.01, 0.002).translate(0, MID_Y, -0.012), [this.M.panel, this.M.panel, this.M.panel, this.M.panel, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), this.M.panel], g, false);
    // il campo a metà altezza: un foglio trasparente con le linee di campo
    this.sheet = this._mesh(new THREE.PlaneGeometry(0.16, 0.12).rotateX(-Math.PI / 2).translate(0, MID_Y - 0.0005, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide }), g, false);
    this.sheet.renderOrder = 2; this.sheet.userData.noOutline = true;
    this.slBuf = new SegBuffer(12000);
    this.slLines = new LineSegments2(this.slBuf.geometry(), new LineMaterial({ vertexColors: true, linewidth: 0.0007, worldUnits: true, toneMapped: false }));
    this.slLines.frustumCulled = false; this.slLines.userData.noOutline = true; this.slLines.renderOrder = 3; g.add(this.slLines);
  }
  /** Forma delle strisce: u (spostamenti verso l'esterno, dall'alto in basso). */
  setStrips(u) {
    for (const m of this.strips) {
      const pos = m.geometry.attributes.position, s = m.userData.side;
      for (let i = 0; i <= STRIPS.N; i++) for (let j = 0; j < 2; j++) pos.setX(i * 2 + j, s * (STRIPS.d0 / 2 + u[i]));
      pos.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
    }
  }
  /**
   * Le linee del campo delle due strisce sul foglio a metà altezza: sono le curve di livello di ψ = Σ sᵢ ln rᵢ (sᵢ il
   * verso della corrente), trovate con i quadrati che marciano. d: distanza fra le strisce lì, same: correnti concordi.
   */
  setSlice(show, d, same) {
    this.sheet.visible = this.slLines.visible = show;
    if (!show) return;
    const nx = 161, nz = 121, X = 0.08, Z = 0.06, hx = (2 * X) / (nx - 1), hz = (2 * Z) / (nz - 1), psi = new Float32Array(nx * nz);
    const xa = -d / 2, xb = d / 2, sb = same ? 1 : -1;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = -X + i * hx, z = -Z + j * hz;
      psi[j * nx + i] = 0.5 * Math.log((x - xa) ** 2 + z * z + 1e-8) + sb * 0.5 * Math.log((x - xb) ** 2 + z * z + 1e-8);
    }
    const vals = Array.from(psi).sort((a, b) => a - b), lo = vals[Math.floor(vals.length * 0.02)], hi = vals[Math.floor(vals.length * 0.995)];
    const buf = this.slBuf; buf.reset(); const col = new THREE.Color('#1f5fb0');
    const nl = 26, y = MID_Y + 0.0006;
    for (let l = 1; l < nl; l++) {
      const lev = lo + ((hi - lo) * l) / nl;
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = psi[j * nx + i], b = psi[j * nx + i + 1], c = psi[(j + 1) * nx + i + 1], e = psi[(j + 1) * nx + i];
        const pts = [];
        const edge = (p, q, x0, z0, x1, z1) => { if ((p - lev) * (q - lev) < 0) { const t = (lev - p) / (q - p); pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]); } };
        const x0 = -X + i * hx, z0 = -Z + j * hz;
        edge(a, b, x0, z0, x0 + hx, z0); edge(b, c, x0 + hx, z0, x0 + hx, z0 + hz); edge(c, e, x0 + hx, z0 + hz, x0, z0 + hz); edge(e, a, x0, z0 + hz, x0, z0);
        if (pts.length >= 2) buf.push(pts[0][0], y, pts[0][1], pts[1][0], y, pts[1][1], col, 0, 0);
        if (pts.length === 4) buf.push(pts[2][0], y, pts[2][1], pts[3][0], y, pts[3][1], col, 0, 0);
      }
    }
    buf.commit();
  }

  // ───────────────────────────── frecce I, B, F ─────────────────────────────
  _arrow(color) {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 });
    const shaft = this._mesh(cyl(0.0016, 0.0016, 1, 10).translate(0, 0.5, 0), mat, g, false);
    const head = this._mesh(new THREE.ConeGeometry(0.0045, 0.012, 14).translate(0, 0.006, 0), mat, g, false);
    g.userData = { shaft, head, noOutline: true }; g.visible = false; this.group.add(g);
    return g;
  }
  _buildArrows() { this.arrows = { I: this._arrow('#e2a400'), B: this._arrow('#2a56b8'), F: this._arrow('#d2402a'), I2: this._arrow('#e2a400'), F2: this._arrow('#d2402a'), B2: this._arrow('#2a56b8') }; }
  /** Freccia a da p lungo d (vettore: la lunghezza è la sua norma). */
  setArrow(a, show, p, d) {
    const L = d ? d.length() : 0;
    a.visible = show && L > 0.004;
    if (!a.visible) return;
    a.position.copy(p); a.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
    const hl = Math.min(0.012, L * 0.45);
    a.userData.shaft.scale.y = L - hl; a.userData.head.position.y = L - hl; a.userData.head.scale.setScalar(hl / 0.012);
  }

  // ───────────────────────────── alimentatore e cavi ─────────────────────────────
  _buildSupply() {
    const g = this.supply = new THREE.Group(); this.group.add(g);
    const W = 0.24, H = 0.11, D = 0.2;
    this._mesh(new RoundedBoxGeometry(W, H, D, 3, 0.008).translate(0, H / 2 + 0.008, 0), this.M.panel, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this._mesh(cyl(0.008, 0.009, 0.008, 16).translate(sx * (W / 2 - 0.02), 0.004, sz * (D / 2 - 0.02)), this.M.black, g);
    this.supCanvas = document.createElement('canvas'); this.supCanvas.width = 1024; this.supCanvas.height = 470;
    this.supTex = new THREE.CanvasTexture(this.supCanvas); this.supTex.colorSpace = THREE.SRGBColorSpace; this.supTex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.008, H - 0.004), new THREE.MeshStandardMaterial({ map: this.supTex, emissive: '#ffffff', emissiveMap: this.supTex, emissiveIntensity: 0.3, roughness: 0.5 }));
    face.position.set(0, H / 2 + 0.008, D / 2 + 0.0006); g.add(face);
    this.knobI = this._mesh(cyl(0.011, 0.012, 0.014, 32).rotateX(Math.PI / 2), this.M.black, g); this.knobI.position.set(0.064, 0.045, D / 2 + 0.007);
    this._mesh(cyl(0.011, 0.012, 0.014, 32).rotateX(Math.PI / 2), this.M.black, g).position.set(0.03, 0.045, D / 2 + 0.007);
    this._mesh(new THREE.BoxGeometry(0.0016, 0.007, 0.002).translate(0, 0.005, 0.0075), this.M.white, this.knobI, false);
    this.supTerm = {};
    for (const [id, x, mat] of [['plus', 0.088, this.M.red], ['minus', 0.108, this.M.black]]) {
      this._mesh(cyl(0.0055, 0.0055, 0.012, 20).rotateX(Math.PI / 2).translate(x, 0.03, D / 2 + 0.006), mat, g);
      this.supTerm[id] = { p: V3(x, 0.03, D / 2 + 0.012), d: V3(0, 0, 1) };
    }
    g.position.set(SUPPLY_AT[0], 0, SUPPLY_AT[1]); g.rotation.y = SUPPLY_AT[2];
  }
  drawSupply({ V, I, on, Iset, Imax }) {
    const key = `${V.toFixed(2)}|${I.toFixed(2)}|${on}|${Iset.toFixed(2)}|${Imax}`;
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
    disp(500, 46, 440, 150, Math.abs(I).toFixed(Imax > 20 ? 1 : 2), 'A', '#46ff82');
    c.textBaseline = 'alphabetic';
    for (const [label, x, lit, col] of [['CV', 60, false, '#3bff7a'], ['CC', 190, on, '#ff3b2b']]) {
      c.fillStyle = lit ? col : '#80858c'; c.beginPath(); c.arc(x, 252, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3a3f46'; c.font = `600 28px ${MONO}`; c.textAlign = 'left'; c.fillText(label, x + 24, 262);
    }
    c.fillStyle = '#3a3f46'; c.font = `700 30px ${FONT}`; c.textAlign = 'left';
    c.fillText(`ALIMENTATORE  0–6 V  ${Imax} A`, 40, 350);
    c.font = `500 25px ${MONO}`; c.fillStyle = '#5b626c'; c.fillText(`corrente impostata ${Iset.toFixed(2)} A`, 40, 405);
    c.textAlign = 'center'; c.font = `600 22px ${MONO}`; c.fillStyle = '#3a3f46';
    c.fillText('TENSIONE', 644, 400); c.fillText('CORRENTE', 795, 400);
    c.font = `700 40px ${MONO}`; c.fillStyle = '#c62a1e'; c.fillText('+', 900, 335); c.fillStyle = '#17181b'; c.fillText('−', 988, 335);
    c.fillStyle = on ? '#ff4b2e' : '#7a4a42'; c.beginPath(); c.arc(960, 252, 12, 0, Math.PI * 2); c.fill();
    this.supTex.needsUpdate = true;
    this.knobI.rotation.z = 2.3 - (Iset / Imax) * 4.6;
  }
  /** Un cavo con le spine a banana fra a e b ({p, d}); stack: spine già infilate lì. */
  cable(a, b, color, side = 1, stackA = 0, stackB = 0, sag = true) {
    const R = 0.0026, pa = a.p.clone().addScaledVector(a.d, 0.021 * stackA), pb = b.p.clone().addScaledVector(b.d, 0.021 * stackB);
    const a1 = pa.clone().addScaledVector(a.d, 0.026), b1 = pb.clone().addScaledVector(b.d, 0.026);
    const span = V3(b1.x - a1.x, 0, b1.z - a1.z), len = span.length(), nrm = V3(-span.z, 0, span.x).normalize();
    let pts;
    if (sag) {
      const mid = a1.clone().lerp(b1, 0.5).addScaledVector(nrm, side * Math.min(0.08, 0.15 * len)); mid.y = R;
      const bend = (p1, toward) => { const h = V3(toward.x - p1.x, 0, toward.z - p1.z), L = h.length(); return p1.clone().addScaledVector(h, Math.min(0.04, 0.3 * L) / Math.max(1e-6, L)).setY(Math.max(R, p1.y * 0.7)); };
      const ba = bend(a1, mid), bb = bend(b1, mid), qa = ba.clone().lerp(mid, 0.5).setY(R), qb = bb.clone().lerp(mid, 0.5).setY(R);
      pts = [pa, a1, ba, qa, mid, qb, bb, b1, pb];
    } else {
      // un ponticello corto, che pende un poco fra due morsetti vicini
      const mid = a1.clone().lerp(b1, 0.5); mid.y -= 0.02 + 0.2 * len; mid.z += 0.01 * side;
      pts = [pa, a1, mid, b1, pb];
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this._mesh(new THREE.TubeGeometry(curve, 200, R, 8, false), color === 'red' ? this.M.redCable : this.M.blackCable, this.cables);
    const PLUG = [[0, 0], [0.0021, 0], [0.0021, 0.0013], [0.0033, 0.0016], [0.004, 0.0032], [0.0041, 0.006], [0.0038, 0.0064], [0.0041, 0.0068], [0.0041, 0.0115], [0.0038, 0.0119], [0.0041, 0.0123], [0.0041, 0.0135], [0.0033, 0.016], [0.0027, 0.0195], [0.0026, 0.021]].map(([r, y]) => new THREE.Vector2(r, y));
    for (const [p, d] of [[pa, a.d], [pb, b.d]]) {
      const plug = this._mesh(new THREE.LatheGeometry(PLUG, 18), color === 'red' ? this.M.red : this.M.black, this.cables);
      plug.position.copy(p); plug.quaternion.setFromUnitVectors(V3(0, 1, 0), d);
    }
  }
  /** Sistema l'esperienza e i cavi: exp 'faraday'|'ampere', rev (cavi scambiati all'alimentatore), mode 'opp'|'same'. */
  wire(exp, rev, mode) {
    this.faraday.visible = exp === 'faraday'; this.ampere.visible = exp === 'ampere';
    for (const m of [...this.cables.children]) { this.cables.remove(m); m.geometry.dispose(); }
    this.group.updateMatrixWorld(true);
    const w = (t, obj) => ({ p: t.p.clone().applyMatrix4(obj.matrixWorld), d: t.d.clone().transformDirection(obj.matrixWorld) });
    const plus = w(this.supTerm[rev ? 'minus' : 'plus'], this.supply), minus = w(this.supTerm[rev ? 'plus' : 'minus'], this.supply);
    if (exp === 'faraday') {
      this.cable(plus, w(this.fT[0], this.faraday), 'red', 1);
      this.cable(w(this.fT[1], this.faraday), minus, 'black', -1);
      return;
    }
    const A = this.aT, F = this.ampere;
    this.cable(plus, w(A.top[0], F), 'red', 1);
    if (mode === 'opp') {
      // in serie: giù per la prima striscia, su per la seconda
      this.cable(w(A.bot[0], F), w(A.bot[1], F), 'black', 1, 0, 0, false);
      this.cable(w(A.top[1], F), minus, 'black', -1);
    } else {
      // in parallelo: giù per tutte e due
      this.cable(w(A.top[0], F), w(A.top[1], F), 'red', 1, 1, 0, false);
      this.cable(w(A.bot[0], F), w(A.bot[1], F), 'black', 1, 0, 0, false);
      this.cable(w(A.bot[1], F), minus, 'black', -1, 1, 0);
    }
  }
  anchors(exp) {
    return exp === 'faraday'
      ? { app: V3(-SWING.half - 0.025, SWING.pivotY + 0.06, 0), magnet: V3(0, ROD_Y + MAGNET.gap / 2 + MAGNET.arm + 0.02, -0.04), prot: V3(SWING.half + 0.012, SWING.pivotY - 0.18, 0), supply: V3(SUPPLY_AT[0], 0.14, SUPPLY_AT[1]) }
      : { app: V3(0, STRIPS.top + 0.06, -0.03), strips: V3(-STRIPS.d0 / 2 - 0.01, MID_Y + 0.12, 0), ruler: V3(0.05, MID_Y - 0.012, -0.012), supply: V3(SUPPLY_AT[0], 0.14, SUPPLY_AT[1]) };
  }
}
