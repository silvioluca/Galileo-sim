// rig.js — il banco del pendolo: base di ghisa, colonna e braccio; il morsetto del filo o il perno d'acciaio;
// goniometro trasparente dietro il perno; la sfera appesa al filo oppure l'asta, il disco, l'anello; due fotocellule
// a forcella su aste proprie, il cronometro; i "fantasmi" di confronto (moto armonico, pendolo equivalente).
// Coordinate: il perno del pendolo A sta in (0, PIVOT_Y, 0), quello del B in (0, PIVOT_Y, ZB); i pendoli oscillano
// nel piano x–y e θ > 0 porta il corpo verso +x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { BOB_R, BODIES, holesOf, TAB } from './pendulum.js';

export const PIVOT_Y = 1.9;
export const ZB = -0.17;
export const COLUMN = { x: -0.36, z: -0.26 };
export const BASE = { w: 0.82, d: 0.74, h: 0.03, x: -0.1, z: -0.21 };
export const GATE_POST_X = 0.24;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

function protractorTexture() {
  const S = 1024, c = S / 2, R = S / 2 - 6;
  return canvasTexture(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(240, 244, 246, 0.4)';
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, 0, Math.PI); g.closePath(); g.fill();
    g.strokeStyle = '#1b1f25'; g.fillStyle = '#1b1f25';
    for (let d = -90; d <= 90; d++) {
      const a = Math.PI / 2 + (d * Math.PI) / 180, L = d % 10 === 0 ? 70 : d % 5 === 0 ? 46 : 28, ca = Math.cos(a), sa = Math.sin(a);
      g.lineWidth = d % 10 === 0 ? 4 : 2.2;
      g.beginPath(); g.moveTo(c + ca * R, c + sa * R); g.lineTo(c + ca * (R - L), c + sa * (R - L)); g.stroke();
      if (d % 10 === 0 && Math.abs(d) < 90) { g.save(); g.translate(c + ca * (R - 100), c + sa * (R - 100)); g.rotate(a - Math.PI / 2); g.font = `700 32px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${Math.abs(d)}°`, 0, 0); g.restore(); }
    }
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, R, 0, Math.PI); g.stroke();
    g.beginPath(); g.moveTo(c, c); g.lineTo(c, c + R); g.lineWidth = 2; g.setLineDash([10, 8]); g.stroke();
  }, { aniso: 16 });
}
function woodTexture(base, dark) {
  return canvasTexture(512, 512, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * H; g.strokeStyle = `${dark} ${0.06 + Math.random() * 0.16})`; g.lineWidth = 0.8 + Math.random() * 2.4;
      g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 32) g.lineTo(x, y + 5 * Math.sin(x / 90 + i)); g.stroke();
    }
  });
}
function corkTexture() {
  return canvasTexture(512, 512, (g, W, H) => {
    g.fillStyle = '#b98d5c'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { const r = 1 + Math.random() * 3.5; g.fillStyle = Math.random() < 0.5 ? `rgba(92, 58, 28, ${0.25 + Math.random() * 0.4})` : `rgba(226, 190, 140, ${0.25 + Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2); g.fill(); }
  });
}
function plateShape(outline, holes) {
  const s = new THREE.Shape(); outline(s);
  for (const h of holes) { const p = new THREE.Path(); p.absarc(h[0], h[1], h[2], 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}
const extrude = (shape, depth, bevel = 0.0008) => new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 48 }).translate(0, 0, -depth / 2 + bevel);

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'pendolo';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.5 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      alu: std({ color: '#c9cdd2', metalness: 1, roughness: 0.32 }),
      black: std({ color: '#141518', metalness: 0.3, roughness: 0.5 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      steel: std({ color: '#d3d6da', metalness: 1, roughness: 0.2 }),
      red: std({ color: '#d4301f', metalness: 0, roughness: 0.4 }),
      plastic: std({ color: '#eceae5', metalness: 0, roughness: 0.5 }),
      thread: std({ color: '#f3efe6', metalness: 0, roughness: 0.8 }),
      rodMat: std({ color: '#c3c8ce', metalness: 0.9, roughness: 0.34 }),
      diskMat: std({ color: '#b9bec5', metalness: 0.9, roughness: 0.3 }),
      ringMat: std({ color: '#d6b160', metalness: 1, roughness: 0.24 }),
    };
    this.bobMats = {
      lead: std({ color: '#6c727a', metalness: 0.55, roughness: 0.55 }),
      brass: std({ color: '#d6b160', metalness: 1, roughness: 0.22 }),
      steel: std({ color: '#d8dbdf', metalness: 1, roughness: 0.12 }),
      wood: std({ map: woodTexture('#d9b27c', 'rgba(120, 78, 36,'), roughness: 0.6 }),
      cork: std({ map: corkTexture(), roughness: 0.95 }),
    };
    this._buildStand();
    this.pend = [this._buildPendulum(0), this._buildPendulum(ZB)];
    this.gates = [this._buildGate(0), this._buildGate(ZB)];
    this._buildTimer();
    this._buildGhosts();
  }
  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── base, colonna, braccio, goniometro ─────────────────────────────
  _buildStand() {
    const M = this.M, cx = COLUMN.x, cz = COLUMN.z;
    this._mesh(new RoundedBoxGeometry(BASE.w, BASE.h, BASE.d, 3, 0.008).translate(BASE.x, BASE.h / 2, BASE.z), M.iron);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this._mesh(cyl(0.014, 0.016, 0.01, 20).translate(BASE.x + x * (BASE.w / 2 - 0.04), -0.002, BASE.z + z * (BASE.d / 2 - 0.04)), M.black);
    this._mesh(cyl(0.0125, 0.0125, 2.05, 32).translate(cx, BASE.h + 1.025, cz), M.chrome);
    this._mesh(cyl(0.016, 0.016, 0.012, 24).translate(cx, BASE.h + 2.056, cz), M.black);
    // morsetto sulla colonna, braccio lungo x fino sopra il perno, morsetto doppio e braccio verso il davanti
    const ya = PIVOT_Y + 0.03, yx = ya + 0.024;
    this._mesh(new RoundedBoxGeometry(0.04, 0.04, 0.04, 2, 0.005).translate(cx, yx, cz), M.boss);
    this._mesh(cyl(0.005, 0.005, 0.03, 12).rotateX(Math.PI / 2).translate(cx, yx, cz - 0.035), M.chrome);
    this._mesh(cyl(0.011, 0.011, 0.007, 20).rotateX(Math.PI / 2).translate(cx, yx, cz - 0.052), M.black);
    this._mesh(cyl(0.009, 0.009, 0.02 - cx, 24).rotateZ(Math.PI / 2).translate((cx + 0.02) / 2, yx, cz), M.chrome);
    this._mesh(new RoundedBoxGeometry(0.036, 0.06, 0.036, 2, 0.005).translate(0, (ya + yx) / 2, cz), M.boss);
    this._mesh(cyl(0.011, 0.011, 0.007, 20).rotateZ(Math.PI / 2).translate(-0.024, (ya + yx) / 2, cz), M.black);
    const z1 = -0.034;
    this._mesh(cyl(0.009, 0.009, z1 - cz + 0.02, 24).rotateX(Math.PI / 2).translate(0, ya, (cz - 0.02 + z1) / 2), M.chrome);
    // testa: blocco in fondo al braccio che porta il morsetto del filo o il perno
    this._mesh(new RoundedBoxGeometry(0.05, 0.05, 0.026, 2, 0.004).translate(0, PIVOT_Y + 0.012, z1 + 0.001), M.boss);
    // morsetto del filo (A): due ganasce che stringono il filo proprio nel punto di sospensione
    this.clampA = new THREE.Group(); this.group.add(this.clampA);
    this._mesh(new THREE.BoxGeometry(0.014, 0.008, 0.04).translate(0, PIVOT_Y + 0.008, -0.01), M.boss, this.clampA);
    for (const s of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.006, 0.014, 0.018, 2, 0.0015).translate(s * 0.0035, PIVOT_Y + 0.007, 0), M.steel, this.clampA);
    // morsetto del filo (B), sotto il braccio
    this.clampB = new THREE.Group(); this.group.add(this.clampB);
    this._mesh(new RoundedBoxGeometry(0.022, 0.022, 0.022, 2, 0.003).translate(0, ya, ZB), M.boss, this.clampB);
    for (const s of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.006, 0.02, 0.016, 2, 0.0015).translate(s * 0.0035, PIVOT_Y + 0.01, ZB), M.steel, this.clampB);
    // perno d'acciaio per i corpi rigidi: esce dalla testa e attraversa il foro
    this.pin = new THREE.Group(); this.group.add(this.pin);
    this._mesh(cyl(0.0035, 0.0035, 0.05, 20).rotateX(Math.PI / 2).translate(0, PIVOT_Y, -0.012), M.steel, this.pin);
    this._mesh(cyl(0.007, 0.007, 0.004, 6).rotateX(Math.PI / 2).translate(0, PIVOT_Y, 0.0105), M.chrome, this.pin);
    // goniometro trasparente subito dietro il piano di oscillazione
    const q = new THREE.Mesh(new THREE.CircleGeometry(0.22, 96, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ map: protractorTexture(), transparent: true, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    q.position.set(0, PIVOT_Y, -0.0085); q.renderOrder = 5; q.userData.noAO = true;
    this.group.add(q); this.protractor = q;
    // indice della posizione di partenza
    const idx = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.24, 0.0006).translate(0, -0.12, 0), new THREE.MeshBasicMaterial({ color: '#d4301f', transparent: true, opacity: 0.85, toneMapped: false }));
    idx.position.set(0, PIVOT_Y, -0.0075); idx.userData.noAO = true; idx.userData.noOutline = true; this.group.add(idx); this.startIdx = idx;
  }

  // ───────────────────────────── pendoli ─────────────────────────────
  _buildPendulum(z) {
    const g = new THREE.Group(); g.position.set(0, PIVOT_Y, z); this.group.add(g);
    const P = { g, z, kind: '', key: '', L: 0 };
    // pendolo semplice: filo e sfera con l'occhiello
    P.simple = new THREE.Group(); g.add(P.simple);
    P.thread = this._mesh(cyl(0.0006, 0.0006, 1, 6).translate(0, -0.5, 0), this.M.thread, P.simple);
    P.thread.userData.noOutline = true;                         // troppo sottile per il contorno: si evidenzia la sfera
    P.bob = new THREE.Group(); P.simple.add(P.bob);
    P.ball = this._mesh(new THREE.SphereGeometry(BOB_R, 48, 32), this.bobMats.lead, P.bob);
    this._mesh(new THREE.TorusGeometry(0.0035, 0.0011, 8, 20).translate(0, BOB_R + 0.003, 0), this.M.chrome, P.bob);
    // corpi rigidi
    P.phys = new THREE.Group(); g.add(P.phys);
    return P;
  }
  _physMesh(key, yp, parent) {
    const B = BODIES[key], M = this.M, rh = B.hole || 0;
    if (key === 'rod') {
      const w = B.w, L = B.L, r = 0.006, c = -yp;
      const holes = holesOf('rod').flatMap((y) => [[0, c + y, rh], [0, c - y, rh]]);
      const s = plateShape((p) => {
        p.moveTo(-w / 2 + r, c - L / 2); p.lineTo(w / 2 - r, c - L / 2); p.quadraticCurveTo(w / 2, c - L / 2, w / 2, c - L / 2 + r);
        p.lineTo(w / 2, c + L / 2 - r); p.quadraticCurveTo(w / 2, c + L / 2, w / 2 - r, c + L / 2); p.lineTo(-w / 2 + r, c + L / 2);
        p.quadraticCurveTo(-w / 2, c + L / 2, -w / 2, c + L / 2 - r); p.lineTo(-w / 2, c - L / 2 + r); p.quadraticCurveTo(-w / 2, c - L / 2, -w / 2 + r, c - L / 2);
      }, holes);
      this._mesh(extrude(s, B.t), M.rodMat, parent);
      // tacche ogni 5 cm accanto ai fori e il baricentro
      for (const [x, y] of holes) this._mesh(new THREE.BoxGeometry(0.006, 0.0008, 0.0004).translate(x + 0.0105, y, B.t / 2 + 0.0002), M.black, parent);
      this._cmMark(c, B.t / 2, parent);
    } else if (key === 'disk') {
      const c = -yp, holes = holesOf('disk').map((y) => [0, c + y, rh]);
      const s = plateShape((p) => p.absarc(0, c, B.R, 0, Math.PI * 2, false), holes);
      this._mesh(extrude(s, B.t), M.diskMat, parent);
      this._mesh(new THREE.BoxGeometry(TAB.w, TAB.len + 0.004, 0.0015).translate(0, c - B.R - TAB.len / 2 + 0.002, 0), M.black, parent);
      this._cmMark(c, B.t / 2, parent);
    } else {
      const Ri = B.R - B.tr, c = -Ri;
      const s = new THREE.Shape(); s.absarc(0, c, B.R, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, c, Ri, 0, Math.PI * 2, true); s.holes.push(hole);
      this._mesh(extrude(s, B.t), M.ringMat, parent);
      this._mesh(new THREE.BoxGeometry(TAB.w, TAB.len + 0.004, 0.0015).translate(0, c - B.R - TAB.len / 2 + 0.002, 0), M.black, parent);
      // il baricentro dell'anello è nel vuoto: una crocetta sottile
      const cross = new THREE.MeshBasicMaterial({ color: '#d4301f', toneMapped: false });
      for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0016, 0.0005).rotateZ(r).translate(0, c, 0), cross); m.userData.noOutline = true; parent.add(m); }
    }
  }
  _cmMark(y, z, parent) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.006, 24), new THREE.MeshBasicMaterial({ color: '#d4301f', toneMapped: false }));
    m.position.set(0, y, z + 0.0005); m.userData.noOutline = true; parent.add(m);
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    w.position.set(0, y, z + 0.0007); w.userData.noOutline = true; parent.add(w);
  }
  /** Pendolo i: semplice (L, materiale) o fisico (corpo, distanza del foro yp); null lo toglie. */
  setPendulum(i, spec) {
    const P = this.pend[i];
    P.g.visible = !!spec;
    if (i === 1) this.clampB.visible = !!spec;
    if (!spec) { P.kind = ''; return; }
    const simple = spec.kind === 'simple';
    P.simple.visible = simple; P.phys.visible = !simple;
    if (simple) {
      P.ball.material = this.bobMats[spec.key];
      P.thread.scale.y = spec.L - BOB_R - 0.004; P.bob.position.y = -spec.L;
    } else {
      const sig = `${spec.key}:${spec.yp}`;
      if (P.sig !== sig) {
        for (const c of [...P.phys.children]) { P.phys.remove(c); c.geometry?.dispose(); }
        this._physMesh(spec.key, spec.yp, P.phys); P.sig = sig;
      }
    }
    P.kind = spec.kind; P.key = spec.key;
    if (i === 0) { this.clampA.visible = simple; this.pin.visible = !simple; }
  }
  setAngle(i, th) { this.pend[i].g.rotation.z = th; }
  /** Indice rosso della posizione di partenza (null: nascosto). */
  setStartIndex(th) { this.startIdx.visible = th !== null; if (th !== null) this.startIdx.rotation.z = th; }

  // ───────────────────────────── fotocellule ─────────────────────────────
  _buildGate(z) {
    const M = this.M, g = new THREE.Group(); g.position.z = z; this.group.add(g);
    const G = { g, z };
    // asta sulla base, con il morsetto che sale e scende
    G.post = this._mesh(cyl(0.006, 0.006, 1, 16).translate(0, 0.5, 0), M.chrome, g);
    G.post.position.set(GATE_POST_X, BASE.h, 0);
    G.head = new THREE.Group(); g.add(G.head);
    this._mesh(new RoundedBoxGeometry(0.026, 0.026, 0.026, 2, 0.003).translate(GATE_POST_X, -0.075, 0), M.boss, G.head);
    this._mesh(cyl(0.005, 0.005, GATE_POST_X - 0.006, 12).rotateZ(Math.PI / 2).translate(GATE_POST_X / 2 + 0.003, -0.075, 0), M.chrome, G.head);
    // forcella: traversa sotto il piano di oscillazione e due bracci con emettitore e ricevitore
    this._mesh(new RoundedBoxGeometry(0.018, 0.016, 0.11, 2, 0.003).translate(0, -0.075, 0), M.black, G.head);
    for (const s of [-1, 1]) {
      this._mesh(new RoundedBoxGeometry(0.018, 0.09, 0.014, 2, 0.003).translate(0, -0.035, s * 0.048), M.black, G.head);
      this._mesh(cyl(0.0035, 0.0035, 0.002, 16).rotateX(Math.PI / 2).translate(0, 0, s * 0.0405), M.red, G.head);
    }
    G.led = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 12, 8), new THREE.MeshBasicMaterial({ color: '#3a1010', toneMapped: false }));
    G.led.position.set(0, 0.006, 0.0555); G.head.add(G.led);
    G.beam = new THREE.Mesh(cyl(0.0006, 0.0006, 0.08, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.7, toneMapped: false }));
    G.beam.userData.noAO = true; G.beam.userData.noOutline = true; G.head.add(G.beam);
    return G;
  }
  /** Fotocellula i alla quota y del fascio (null: nascosta), accesa se interrotta. */
  setGate(i, y, lit) {
    const G = this.gates[i];
    G.g.visible = y !== null;
    if (y === null) return;
    G.head.position.y = y;
    G.post.scale.y = Math.max(0.01, y - 0.075 - BASE.h);
    G.led.material.color.set(lit ? '#ff3020' : '#3a1010');
    G.beam.visible = !lit;
  }

  // ───────────────────────────── cronometro ─────────────────────────────
  _buildTimer() {
    const g = new THREE.Group(); g.position.set(-0.3, BASE.h, 0.05); g.rotation.y = 0.32; this.group.add(g);
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

  // ───────────────────────────── confronti ─────────────────────────────
  _buildGhosts() {
    // moto armonico: una copia trasparente del pendolo A, appena davanti
    this.ghostMat = new THREE.MeshStandardMaterial({ color: '#3a7bd5', transparent: true, opacity: 0.32, roughness: 0.5, depthWrite: false });
    const h = new THREE.Group(); h.position.set(0, PIVOT_Y, 0.03); h.visible = false; this.group.add(h); this.harm = h;
    // pendolo semplice equivalente: filo e pallina arancione dallo stesso perno
    const e = new THREE.Group(); e.position.set(0, PIVOT_Y, 0.022); e.visible = false; this.group.add(e); this.equiv = e;
    this.eqThread = this._mesh(cyl(0.0007, 0.0007, 1, 6).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: '#e07b1f', roughness: 0.6 }), e);
    this.eqBob = this._mesh(new THREE.SphereGeometry(0.014, 32, 20), new THREE.MeshStandardMaterial({ color: '#f08a24', roughness: 0.35, metalness: 0.1 }), e);
    for (const m of [this.eqThread, this.eqBob]) m.userData.noOutline = true;
  }
  /** Rifà la copia trasparente quando cambia il pendolo A. */
  setHarmShape(spec) {
    const h = this.harm;
    for (const c of [...h.children]) { h.remove(c); c.geometry?.dispose(); }
    if (spec.kind === 'simple') {
      const t = new THREE.Mesh(cyl(0.0007, 0.0007, spec.L - BOB_R, 6).translate(0, -(spec.L - BOB_R) / 2, 0), this.ghostMat); h.add(t);
      const b = new THREE.Mesh(new THREE.SphereGeometry(BOB_R, 32, 20).translate(0, -spec.L, 0), this.ghostMat); h.add(b);
    } else {
      const tmp = new THREE.Group(); this._physMesh(spec.key, spec.yp, tmp);
      for (const c of [...tmp.children]) { c.material = this.ghostMat; c.castShadow = false; h.add(c); }
    }
    h.traverse((o) => { o.userData.noOutline = true; o.userData.noAO = true; o.castShadow = false; });
  }
  setHarm(show, th) { this.harm.visible = show; if (show) this.harm.rotation.z = th; }
  setEquiv(show, Leq, th) {
    this.equiv.visible = show;
    if (!show) return;
    this.eqThread.scale.y = Math.max(0.01, Leq - 0.014); this.eqBob.position.y = -Leq; this.equiv.rotation.z = th;
  }
}
