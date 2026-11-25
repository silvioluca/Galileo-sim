// rig.js — il pendolo di Foucault in 3D: una trave d'acciaio in alto con il morsetto e l'anello di Charron, il filo,
// il peso d'ottone con la punta, il grande quadrante a terra (rosa dei venti, scala dei gradi, cerchi ogni mezzo
// metro), l'anello di birilli, il paletto con il filo che tiene il peso prima del lancio, la traccia della punta e
// le «immagini mosse» del peso quando il tempo scorre veloce.
// Tutto ciò che è fissato alla Terra sta nel gruppo `earth`, che si può far girare per guardare dalle stelle.
// Coordinate fisiche: x est, y nord, z in alto dal punto di sospensione → mondo: (x, Ysusp + z, −y).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { canvasTexture } from '../../../shared/js/geo.js';

export const DIAL_R = 3.4, DIAL_TOP = 0.1;
export const TIP_LEN = 0.075;                 // punta sotto la sfera
export const TIP_CLEAR = 0.03;                // la punta passa 3 cm sopra il quadrante
const PIN_N = 72;
const MAX_TRACE = 16000, GHOSTS = 16;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

/** Il quadrante: pietra chiara, cerchi ogni 50 cm, scala dei gradi (azimut da nord, in senso orario), rosa dei venti. */
function dialTexture() {
  const W = 4096;
  return canvasTexture(W, W, (g) => {
    const c = W / 2, px = c / DIAL_R, P = (m) => m * px;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, '#ece6d8'); grd.addColorStop(1, '#ddd5c3');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
    // cerchi ogni mezzo metro
    for (let r = 0.5; r < DIAL_R - 0.35; r += 0.5) {
      g.strokeStyle = r % 1 === 0 ? 'rgba(90,72,40,0.45)' : 'rgba(90,72,40,0.22)'; g.lineWidth = r % 1 === 0 ? 5 : 3;
      g.beginPath(); g.arc(c, c, P(r), 0, Math.PI * 2); g.stroke();
      if (r % 1 === 0) { g.fillStyle = 'rgba(90,72,40,0.6)'; g.font = `500 44px ${MONO}`; g.textAlign = 'left'; g.fillText(`${r} m`, c + P(r) + 10, c - 12); }
    }
    // anello d'ottone con la scala dei gradi
    const R0 = P(DIAL_R - 0.32), R1 = P(DIAL_R - 0.05);
    g.fillStyle = '#c9a45a'; g.beginPath(); g.arc(c, c, R1, 0, Math.PI * 2); g.arc(c, c, R0, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = '#7a5a20'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, R1, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(c, c, R0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#3e2c0c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 360; d++) {
      const a = (d * Math.PI) / 180, s = Math.sin(a), co = -Math.cos(a);        // azimut da nord, in senso orario
      const len = d % 10 === 0 ? P(0.12) : d % 5 === 0 ? P(0.08) : P(0.045);
      g.strokeStyle = '#3e2c0c'; g.lineWidth = d % 10 === 0 ? 7 : 4;
      g.beginPath(); g.moveTo(c + s * R1, c + co * R1); g.lineTo(c + s * (R1 - len), c + co * (R1 - len)); g.stroke();
      if (d % 10 === 0) {
        g.save(); g.translate(c + s * (R0 + P(0.08)), c + co * (R0 + P(0.08))); g.rotate(a);
        g.font = `700 ${d % 90 === 0 ? 74 : 56}px ${MONO}`; g.fillText(String(d), 0, 0); g.restore();
      }
    }
    // rosa dei venti
    const star = (r1, r2, n, rot, col) => {
      g.fillStyle = col; g.beginPath();
      for (let i = 0; i < 2 * n; i++) { const a = rot + (i * Math.PI) / n, r = i % 2 ? r2 : r1; g.lineTo(c + r * Math.sin(a), c - r * Math.cos(a)); }
      g.closePath(); g.fill();
    };
    star(P(0.62), P(0.11), 4, Math.PI / 4, 'rgba(120,96,52,0.55)');
    star(P(0.95), P(0.14), 4, 0, 'rgba(62,44,12,0.85)');
    g.fillStyle = '#c9a45a'; g.beginPath(); g.arc(c, c, P(0.06), 0, Math.PI * 2); g.fill();
    g.font = `700 120px ${FONT}`; g.fillStyle = '#3e2c0c';
    for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['O', 270]]) {
      const r = P(1.12), aa = (a * Math.PI) / 180;
      g.save(); g.translate(c + r * Math.sin(aa), c - r * Math.cos(aa)); g.rotate(aa); g.fillStyle = t === 'N' ? '#a3271a' : '#3e2c0c'; g.fillText(t, 0, 0); g.restore();
    }
  }, { aniso: 16 });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'pendolo di Foucault';
    this.earth = new THREE.Group(); this.group.add(this.earth);
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      brass: std({ color: '#c8a55c', metalness: 1, roughness: 0.22 }),
      darkBrass: std({ color: '#8a6a2c', metalness: 1, roughness: 0.35 }),
      steel: std({ color: '#5a626d', metalness: 0.8, roughness: 0.38 }),
      paint: std({ color: '#9aa3ae', metalness: 0.15, roughness: 0.55 }),     // le travi verniciate: dal basso non diventano una sagoma nera
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      stone: std({ color: '#cfc7b6', metalness: 0, roughness: 0.85 }),
      pin: std({ color: '#fbf9f4', metalness: 0, roughness: 0.32, vertexColors: true }),
      black: std({ color: '#16181b', metalness: 0.3, roughness: 0.5 }),
      wood: std({ color: '#6b4a2e', metalness: 0, roughness: 0.6 }),
    };
    this._buildDial();
    this._buildBob();
    this._buildTop();
    this._buildPost();
    this._buildTrace();
    this.pinMesh = null;
    this.ySusp = 20;
  }
  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = true;
    (parent || this.earth).add(m);
    return m;
  }

  _buildDial() {
    this._mesh(cyl(DIAL_R + 0.06, DIAL_R + 0.1, DIAL_TOP - 0.004, 128).translate(0, (DIAL_TOP - 0.004) / 2, 0), this.M.stone);
    const top = new THREE.Mesh(new THREE.CircleGeometry(DIAL_R, 128).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.7, metalness: 0.05 }));
    top.position.y = DIAL_TOP; top.receiveShadow = true; top.userData.noOutline = true;
    this.earth.add(top);
  }

  // ───────────────────────────── il peso ─────────────────────────────
  _buildBob() {
    const M = this.M;
    this.bob = new THREE.Group(); this.earth.add(this.bob);
    this.bobSphere = this._mesh(new THREE.SphereGeometry(1, 64, 48), M.brass, this.bob);
    this.bobTip = this._mesh(new THREE.ConeGeometry(1, 1, 40).rotateX(Math.PI), M.darkBrass, this.bob);
    this.bobCap = this._mesh(cyl(1, 1, 1, 32), M.darkBrass, this.bob);
    // le immagini mosse del peso (tempo veloce): sfere trasparenti
    this.ghostMat = new THREE.MeshStandardMaterial({ color: '#c8a55c', metalness: 0.6, roughness: 0.3, transparent: true, opacity: 0.12, depthWrite: false });
    this.ghosts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 24), this.ghostMat, GHOSTS);
    this.ghosts.count = 0; this.ghosts.frustumCulled = false; this.ghosts.userData.noOutline = true; this.ghosts.userData.noAO = true;
    this.earth.add(this.ghosts);
    // il filo
    this.wireBuf = new SegBuffer(2);
    this.wire = new LineSegments2(this.wireBuf.geometry(), new LineMaterial({ color: 0x2a2d32, linewidth: 1.6, worldUnits: false }));
    this.wire.frustumCulled = false; this.wire.userData.noOutline = true;
    this.earth.add(this.wire);
  }
  /** Raggio della sfera (m) dalla massa. */
  setBobSize(R) {
    this.R = R;
    this.bobSphere.scale.setScalar(R);
    this.bobTip.scale.set(R * 0.28, TIP_LEN, R * 0.28); this.bobTip.position.y = -R - TIP_LEN / 2 + 0.004;
    this.bobCap.scale.set(R * 0.22, 0.03, R * 0.22); this.bobCap.position.y = R + 0.01;
  }

  // ───────────────────────────── in alto: trave, morsetto, anello di Charron ─────────────────────────────
  _buildTop() {
    const M = this.M;
    this.top = new THREE.Group(); this.earth.add(this.top);
    const ibeam = (z) => {
      const g = new THREE.Group(); g.position.z = z; this.top.add(g);
      this._mesh(new THREE.BoxGeometry(6, 0.02, 0.16).translate(0, 0.19, 0), M.paint, g);
      this._mesh(new THREE.BoxGeometry(6, 0.02, 0.16).translate(0, -0.19, 0), M.paint, g);
      this._mesh(new THREE.BoxGeometry(6, 0.38, 0.014), M.paint, g);
    };
    ibeam(-0.35); ibeam(0.35);
    this._mesh(new RoundedBoxGeometry(0.5, 0.03, 0.9, 2, 0.006).translate(0, -0.215, 0), M.paint, this.top);
    this._mesh(new RoundedBoxGeometry(0.12, 0.1, 0.12, 2, 0.01).translate(0, -0.28, 0), M.black, this.top);
    this._mesh(cyl(0.012, 0.012, 0.06, 20).translate(0, -0.35, 0), M.chrome, this.top);
    // l'anello di Charron: un anello d'ottone 40 cm sotto il punto di sospensione
    this.ring = new THREE.Group(); this.top.add(this.ring);
    this.ringTorus = this._mesh(new THREE.TorusGeometry(1, 0.006, 16, 96).rotateX(Math.PI / 2), M.brass, this.ring);
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3;
      const rod = this._mesh(cyl(0.005, 0.005, 1, 12), M.steel, this.ring);
      rod.userData.a = a;
    }
  }
  /** Mette la sospensione a quota y (mondo) e l'anello a 40 cm sotto, del raggio che il filo sfiora (m). */
  setTop(y, ringR, ringOn) {
    this.ySusp = y;
    this.top.position.y = y + 0.35;
    this.ring.visible = ringOn;
    this.ring.position.y = -0.35 - 0.4;
    this.ringTorus.scale.set(ringR, ringR, ringR);
    this.ring.children.slice(1).forEach((rod) => {
      const a = rod.userData.a, x = Math.cos(a) * (ringR + 0.02), z = Math.sin(a) * (ringR + 0.02);
      rod.position.set(x, 0.2, z); rod.scale.set(1, 0.4, 1);
    });
  }

  // ───────────────────────────── paletto e filo che tiene il peso ─────────────────────────────
  _buildPost() {
    const M = this.M;
    this.post = new THREE.Group(); this.earth.add(this.post);
    this._mesh(cyl(0.09, 0.11, 0.03, 32).translate(0, DIAL_TOP + 0.015, 0), M.black, this.post);
    this._mesh(cyl(0.012, 0.012, 0.42, 16).translate(0, DIAL_TOP + 0.24, 0), M.chrome, this.post);
    this._mesh(new THREE.SphereGeometry(0.02, 20, 14).translate(0, DIAL_TOP + 0.455, 0), M.black, this.post);
    this.threadBuf = new SegBuffer(1);
    this.thread = new LineSegments2(this.threadBuf.geometry(), new LineMaterial({ color: 0xe8e2d0, linewidth: 1.4 }));
    this.thread.frustumCulled = false; this.thread.userData.noOutline = true;
    this.earth.add(this.thread);
    // la fiammella quando si brucia il filo
    this.flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, 0.5), transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.flame.userData.noOutline = true; this.flame.userData.noAO = true;
    this.earth.add(this.flame);
  }
  /** Paletto all'azimut psi (da est verso nord) a distanza d dal centro; filo fino al peso se held. */
  setPost(psi, d, held, bobWorld) {
    this.post.visible = held;
    this.post.position.set(d * Math.cos(psi), 0, -d * Math.sin(psi));
    this.thread.visible = held;
    if (held) {
      const c = new THREE.Color(0xe8e2d0);
      this.threadBuf.reset();
      this.threadBuf.push(this.post.position.x, DIAL_TOP + 0.45, this.post.position.z, bobWorld.x, bobWorld.y, bobWorld.z, c, 0, 1);
      this.threadBuf.commit();
      this._threadMid = new THREE.Vector3((this.post.position.x + bobWorld.x) / 2, (DIAL_TOP + 0.45 + bobWorld.y) / 2, (this.post.position.z + bobWorld.z) / 2);
    }
  }
  burn(t) {
    // t: 0 → 1 nel mezzo secondo dopo il lancio
    const m = this.flame.material;
    if (t >= 1 || !this._threadMid) { m.opacity = 0; return; }
    this.flame.position.copy(this._threadMid);
    this.flame.scale.setScalar(0.6 + 1.6 * Math.sin(Math.PI * t));
    m.opacity = Math.sin(Math.PI * t) * 0.9;
  }

  // ───────────────────────────── birilli ─────────────────────────────
  /** Un anello di birilli al raggio Rp, alti h. */
  setPins(Rp, h) {
    if (this.pinMesh) { this.earth.remove(this.pinMesh); this.pinMesh.geometry.dispose(); }
    const prof = [[0, 0], [0.011, 0], [0.012, 0.18], [0.009, 0.42], [0.0065, 0.55], [0.007, 0.6], [0.00702, 0.601], [0.0078, 0.66], [0.00782, 0.661], [0.0085, 0.72], [0.0075, 0.9], [0.004, 0.98], [0, 1]].map(([r, y]) => new THREE.Vector2(r * 1.15, y));
    const geo = new THREE.LatheGeometry(prof, 20);
    // una fascia rossa sul collo, come nei birilli veri
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), band = y > 0.6005 && y < 0.6605;
      col.set(band ? [0.72, 0.1, 0.07] : [1, 1, 1], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.scale(1, h, 1);
    this.pinMesh = new THREE.InstancedMesh(geo, this.M.pin, PIN_N);
    this.pinMesh.castShadow = true; this.pinMesh.receiveShadow = true; this.pinMesh.userData.noOutline = true;
    this.earth.add(this.pinMesh);
    this.pins = Array.from({ length: PIN_N }, (_, k) => {
      const az = (k * 2 * Math.PI) / PIN_N;               // da est, verso nord
      return { az, x: Rp * Math.cos(az), y: Rp * Math.sin(az), down: false, fall: 0, dir: 0 };
    });
    this.pinH = h;
    this.updatePins(0);
  }
  /** Anima la caduta dei birilli (dt in secondi veri). */
  updatePins(dt) {
    if (!this.pinMesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    this.pins.forEach((pin, i) => {
      if (pin.down && pin.fall < 1) pin.fall = Math.min(1, pin.fall + dt / 0.45);
      const k = pin.fall < 1 ? pin.fall * pin.fall : 1;               // cade accelerando
      const ang = k * (Math.PI / 2 - 0.03);
      // ruota attorno a un asse orizzontale perpendicolare alla direzione di caduta, sul piede del birillo
      ax.set(-Math.sin(pin.dir), 0, -Math.cos(pin.dir));
      q.setFromAxisAngle(ax, ang);
      p.set(pin.x, DIAL_TOP, -pin.y);
      m.compose(p, q, s);
      this.pinMesh.setMatrixAt(i, m);
    });
    this.pinMesh.instanceMatrix.needsUpdate = true;
  }

  // ───────────────────────────── la traccia della punta ─────────────────────────────
  _buildTrace() {
    this.tracePos = new Float32Array(MAX_TRACE * 3); this.traceCol = new Float32Array(MAX_TRACE * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.tracePos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.traceCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.trace = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
    this.trace.frustumCulled = false; this.trace.userData.noOutline = true; this.trace.userData.noAO = true; this.trace.renderOrder = 3;
    this.earth.add(this.trace);
    this.traceN = 0;
  }
  /** Punti (x, y) della punta sul quadrante, dal più vecchio al più recente. */
  setTrace(pts) {
    const n = Math.min(pts.length, MAX_TRACE), o = pts.length - n, P = this.tracePos, C = this.traceCol;
    const sand = [0.86, 0.82, 0.73], groove = [0.42, 0.3, 0.12];
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[o + i], k = 0.25 + 0.75 * (i / Math.max(1, n - 1)) ** 1.5;
      P[i * 3] = x; P[i * 3 + 1] = DIAL_TOP + 0.002; P[i * 3 + 2] = -y;
      for (let c = 0; c < 3; c++) C[i * 3 + c] = sand[c] + (groove[c] - sand[c]) * k;
    }
    const g = this.trace.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }

  // ───────────────────────────── posizione del peso ─────────────────────────────
  /** r: vettore dalla sospensione al centro del peso (fisico); ghosts: altri vettori r per le immagini mosse. */
  setBob(r, L, ghosts = []) {
    const y0 = this.ySusp, W = (v) => new THREE.Vector3(v[0], y0 + v[2], -v[1]);
    const c = W(r);
    this.bob.position.copy(c);
    const dir = new THREE.Vector3(r[0], r[2], -r[1]).normalize();
    this.bob.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const top = new THREE.Vector3(0, y0, 0), att = c.clone().addScaledVector(dir, -this.R - 0.02);
    this.wireBuf.reset(); this.wireBuf.push(top.x, top.y, top.z, att.x, att.y, att.z, new THREE.Color(0x2a2d32), 0, 1); this.wireBuf.commit();
    const m = new THREE.Matrix4(), s = new THREE.Vector3(this.R, this.R, this.R), q = new THREE.Quaternion();
    this.ghosts.count = ghosts.length;
    ghosts.forEach((g, i) => { m.compose(W(g), q, s); this.ghosts.setMatrixAt(i, m); });
    this.ghosts.instanceMatrix.needsUpdate = true;
    return c;
  }
}
