// rig.js — l'apparato: lanciatore a molla con goniometro su una colonna che esce da un pozzetto nel
// pavimento (così il punto di lancio può stare anche a filo del pavimento), metro a nastro, asta graduata
// per le proiezioni, bersaglio a terra, supporto con elettromagnete e barattolo per il bersaglio che cade.
// Unità: metri. x = direzione del lancio, y = verticale, z = profondità; il lancio avviene nel piano z = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { revolveX, canvasTexture } from '../../../shared/js/geo.js';
import { CAN } from './proj.js';
import { Galileo } from './galileo.js';

export const PIT = { x0: -0.39, x1: 0.09, z0: -0.09, z1: 0.09, depth: 0.55 };
export const TWIN_Z = 0.13;                     // la seconda pallina, lasciata cadere, sta accanto alla bocca
export const TAPE_Z = 0.21;                     // il metro a nastro corre davanti al piano del lancio
export const ROD = { x: -0.62, z: -0.42 };      // asta graduata per la proiezione verticale
export const STAND_Z = -0.32;                   // supporto del bersaglio che cade
const YOKE_BASE = -0.405;                       // base della forcella sotto il perno (coordinate del lanciatore)
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const DEG = Math.PI / 180;
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
/** Solido di rivoluzione attorno all'asse verticale: profilo [r, y]. */
const lathe = (pts, seg = 64, crease = 0.5) => revolveX(pts.map(([r, y]) => [y, r]), seg, crease).rotateZ(Math.PI / 2);

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    alu: std({ color: '#c9ccd0', metalness: 1, roughness: 0.3 }),
    brushed: std({ color: '#c3c6ca', metalness: 0.85, roughness: 0.36 }),
    anod: std({ color: '#1d2024', metalness: 0.55, roughness: 0.38 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
    black: std({ color: '#0e0f11', metalness: 0.7, roughness: 0.4 }),
    rubber: std({ color: '#121314', metalness: 0, roughness: 0.9 }),
    copper: std({ color: '#b8703f', metalness: 1, roughness: 0.35 }),
    orange: std({ color: '#e5671f', metalness: 0.3, roughness: 0.42 }),
    plate: std({ color: '#8e949b', metalness: 0.85, roughness: 0.42 }),
    yellow: std({ color: '#f0bf22', metalness: 0.05, roughness: 0.45 }),
    pit: std({ color: '#585c62', metalness: 0, roughness: 0.95, side: THREE.BackSide }),
  };
}

// ───────────────────────────── texture ─────────────────────────────
function speckle(base, dot, n) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n; i++) { g.fillStyle = dot; g.globalAlpha = 0.25 + rnd() * 0.5; g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 2.4, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  });
}
function pingpongTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#f58a1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b'; g.font = `700 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('40+ ★★★', w * 0.25, h / 2);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}
const BALL_LOOK = {
  steel: () => ({ color: '#e2e4e6', metalness: 1, roughness: 0.1 }),
  nylon: () => ({ color: '#f1ece0', metalness: 0, roughness: 0.36 }),
  cork: () => ({ map: speckle('#b98b5b', '#5a3a1e', 2600), metalness: 0, roughness: 0.92 }),
  pingpong: () => ({ map: pingpongTexture(), metalness: 0, roughness: 0.42 }),
};

/** Il goniometro stampato sulla piastra: l'alzo θ si legge dove punta la coda della canna (direzione θ + 180°). */
function protractorTexture(R) {
  const S = 1024, c = S / 2, px = c / R;
  return canvasTexture(S, S, (g) => {
    g.clearRect(0, 0, S, S);                      // stampa su plexiglas: fondo trasparente
    const P = (r, th) => { const phi = Math.PI + th * DEG; return [c + r * px * Math.cos(phi), c - r * px * Math.sin(phi)]; };
    // fascia colorata 0°–90°
    g.fillStyle = 'rgba(194,51,29,0.22)';
    g.beginPath();
    for (let th = 0; th <= 90; th++) { const [x, y] = P(R * 0.985, th); if (th) g.lineTo(x, y); else g.moveTo(x, y); }
    for (let th = 90; th >= 0; th--) { const [x, y] = P(R * 0.79, th); g.lineTo(x, y); }
    g.fill();
    g.strokeStyle = '#16181b';
    for (let th = -45; th <= 90; th++) {
      const major = th % 10 === 0, mid = th % 5 === 0;
      const [x0, y0] = P(R * (major ? 0.74 : mid ? 0.81 : 0.86), th), [x1, y1] = P(R * 0.97, th);
      g.lineWidth = major ? 4 : mid ? 3 : 1.8;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    g.lineWidth = 3; g.beginPath();
    for (let th = -45; th <= 90; th++) { const [x, y] = P(R * 0.97, th); if (th > -45) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = '#16181b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let th = -40; th <= 90; th += 10) {
      const [x, y] = P(R * 0.63, th);
      g.font = `${th === 0 || th === 45 || th === 90 ? 700 : 600} 37px ${FONT}`;
      g.fillStyle = th === 45 ? '#c2331d' : '#16181b';
      g.fillText(th < 0 ? `−${-th}` : String(th), x, y);
    }
    const [x45, y45] = P(R * 0.63, 45); void x45; void y45;
    g.fillStyle = '#5b626c'; g.font = `600 30px ${MONO}`;
    const [lx, ly] = P(R * 0.36, 28);
    g.fillText('ALZO (°)', lx, ly);
    g.font = `500 22px ${MONO}`; g.fillStyle = '#8a9099';
    const [bx, by] = P(R * 0.36, 58);
    g.fillText('GALILEO SIM', bx, by);
  }, { aniso: 16 });
}

function tapeTexture(startCm, lengthCm) {
  const W = 2048, H = 80;
  return canvasTexture(W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f6cf2c'); grad.addColorStop(1, '#e9b70e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const px = W / (lengthCm * 10);
    g.fillStyle = '#1b1b1b';
    for (let mm = 0; mm <= lengthCm * 10; mm++) {
      const abs = startCm * 10 + mm, x = mm * px;
      const len = abs % 100 === 0 ? H * 0.62 : abs % 10 === 0 ? H * 0.42 : abs % 5 === 0 ? H * 0.28 : H * 0.17;
      g.fillRect(x - (abs % 10 === 0 ? 0.8 : 0.5), H - len, abs % 10 === 0 ? 1.6 : 1, len);
    }
    g.textBaseline = 'top';
    for (let cm = 0; cm <= lengthCm; cm++) {
      const abs = startCm + cm, x = cm * 10 * px;
      if (abs === 0) continue;
      if (abs % 10 === 0) {
        g.font = `700 36px ${FONT}`;
        const t = abs % 100 === 0 ? `${abs / 100} m` : String(abs);
        const tw = g.measureText(t).width;
        g.fillStyle = '#c8281e'; g.fillRect(x + 4, 4, tw + 12, 38);
        g.fillStyle = '#fff6da'; g.fillText(t, x + 10, 6);
      } else if (abs % 2 === 0) { g.font = `600 22px ${FONT}`; g.fillStyle = '#1b1b1b'; g.fillText(String(abs % 10), x + 4, 6); }
    }
  }, { aniso: 16 });
}

function poleScaleTexture(m0) {
  const W = 128, H = 2048, pxcm = H / 100;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16181b'; g.textBaseline = 'middle';
    for (let cm = 0; cm <= 100; cm++) {
      const y = H - cm * pxcm, abs = m0 * 100 + cm;
      const len = abs % 10 === 0 ? 58 : abs % 5 === 0 ? 40 : 24;
      g.fillRect(0, y - (abs % 10 === 0 ? 1.8 : 1), len, abs % 10 === 0 ? 3.6 : 2);
      if (abs % 10 === 0 && cm < 100 && abs > 0) {
        const metre = abs % 100 === 0;
        g.font = `${metre ? 700 : 600} ${metre ? 40 : 34}px ${FONT}`;
        g.fillStyle = metre ? '#c2331d' : '#16181b';
        g.fillText(metre ? `${abs / 100} m` : String(abs % 100), 64, y - 2);
        g.fillStyle = '#16181b';
      }
    }
  }, { aniso: 16 });
}

function targetTexture() {
  return canvasTexture(1024, 1024, (g, w) => {
    const c = w / 2;
    g.clearRect(0, 0, w, w);
    const rings = ['#f4f1ea', '#d8352a', '#f4f1ea', '#d8352a', '#f4f1ea', '#d8352a', '#f2c230'];
    rings.forEach((col, i) => {
      const r = c * (1 - i / rings.length);
      g.fillStyle = col; g.beginPath(); g.arc(c, c, r - 2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 3; g.stroke();
    });
    g.strokeStyle = 'rgba(20,20,20,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(c, 10); g.lineTo(c, w - 10); g.moveTo(10, c); g.lineTo(w - 10, c); g.stroke();
    g.fillStyle = '#1b1b1b'; g.font = `700 40px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i < rings.length; i++) {
      const r = c * (1 - (i - 0.5) / rings.length);
      g.fillText(`${Math.round((20 * (rings.length - i + 0.5)) / rings.length)}`, c + r, c - 22);
    }
  }, { aniso: 16 });
}

function canLabelTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = '#c8281e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6efe0'; g.fillRect(0, h * 0.12, w, h * 0.06); g.fillRect(0, h * 0.82, w, h * 0.06);
    g.font = `800 74px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const x of [w * 0.25, w * 0.75]) { g.fillText('BERSAGLIO', x, h * 0.5); }
    g.font = `600 22px ${MONO}`; g.fillText('120 g · Ø 66 mm', w * 0.5, h * 0.7);
  }, { aniso: 8 });
}

function markerTexture(text) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8281e'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#16181b'; g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'apparato';
    this.M = materials();
    this.dragTargets = [];
    this._ballMats = {}; this._ballGeos = {};
    this._buildLauncher();
    this._buildPit();
    this._buildTape();
    this._buildRod();
    this._buildTargets();
    this.plungerT = 1;
  }

  _mesh(geo, mat, parent, drag) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    if (drag) { m.userData.drag = drag; this.dragTargets.push(m); }
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── apparato: lanciatore a molla o piano di Galileo ─────────────────────────────
  /** L'apparato di Galileo si costruisce la prima volta che serve. */
  setApparatus(gal) {
    if (gal && !this.gal) { this.gal = new Galileo(this); this.group.add(this.gal.group); }
    this.galOn = gal;
    this.launcher.visible = !gal;
    this.pitGroup.visible = !gal;
    this.tape.visible = !gal;
    if (this.gal) this.gal.group.visible = gal;
  }
  /** Oggetti afferrabili con il puntatore nell'apparato in uso. */
  get grabbable() { return this.galOn ? this.gal.dragTargets : this.dragTargets; }

  // ───────────────────────────── palline ─────────────────────────────
  ballMaterial(key) { return this._ballMats[key] || (this._ballMats[key] = new THREE.MeshStandardMaterial(BALL_LOOK[key]())); }
  ballGeometry(r) { const k = r.toFixed(4); return this._ballGeos[k] || (this._ballGeos[k] = new THREE.SphereGeometry(r, 40, 28)); }
  makeBall(key, r) {
    const m = new THREE.Mesh(this.ballGeometry(r), this.ballMaterial(key));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ───────────────────────────── lanciatore ─────────────────────────────
  _buildLauncher() {
    const M = this.M;
    const L = new THREE.Group();          // origine nel perno (= centro della pallina all'uscita)
    this.launcher = L;
    this.group.add(L);
    // canna: tubo anodizzato nero lungo −x, bocca nel perno
    const barrel = new THREE.Group();
    this.barrel = barrel;
    L.add(barrel);
    const tube = [[-0.29, 0], [-0.29, 0.028], [-0.024, 0.028], [-0.024, 0.0215], [-0.25, 0.0215], [-0.25, 0]];
    this._mesh(revolveX(tube, 64, 0.6), M.anod, barrel, 'angle');
    // anello di bocca cromato con i due perni laterali
    this._mesh(revolveX([[-0.026, 0.0215], [-0.026, 0.0305], [0, 0.0305], [0, 0.0222]], 64, 0.6), M.chrome, barrel, 'angle');
    for (const s of [1, -1]) this._mesh(cyl(0.0085, 0.0085, 0.016, 24).rotateX(Math.PI / 2).translate(-0.012, 0, s * 0.033), M.chrome, barrel);
    // fascia arancione e tappo posteriore zigrinato
    this._mesh(revolveX([[-0.215, 0.028], [-0.215, 0.0286], [-0.175, 0.0286], [-0.175, 0.028]], 64), M.orange, barrel, 'angle');
    this._mesh(revolveX([[-0.318, 0], [-0.318, 0.031], [-0.286, 0.031], [-0.286, 0]], 48, 0.6), M.black, barrel, 'angle');
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this._mesh(new THREE.BoxGeometry(0.03, 0.002, 0.002).translate(-0.302, 0.031 * Math.cos(a), 0.031 * Math.sin(a)), M.black, barrel);
    }
    // stantuffo con pomello: scatta in avanti al lancio
    const plunger = new THREE.Group();
    this._mesh(cyl(0.0045, 0.0045, 0.05, 16).rotateZ(Math.PI / 2).translate(-0.34, 0, 0), M.chrome, plunger, 'angle');
    this._mesh(new THREE.SphereGeometry(0.011, 24, 16).translate(-0.369, 0, 0), M.black, plunger, 'angle');
    barrel.add(plunger);
    this.plunger = plunger;
    // lancetta sul goniometro (davanti alla piastra) e pomello di bloccaggio sul perno
    this._mesh(new THREE.BoxGeometry(0.168, 0.0028, 0.0012).translate(-0.103, 0, 0.0484), new THREE.MeshStandardMaterial({ color: '#c2331d', roughness: 0.5 }), barrel);
    this._mesh(cyl(0.017, 0.017, 0.012, 32).rotateX(Math.PI / 2).translate(0, 0, 0.0545), M.black, barrel);
    this._mesh(cyl(0.004, 0.004, 0.0124, 12).rotateX(Math.PI / 2).translate(-0.0105, 0, 0.0545), M.chrome, barrel);
    // pallina caricata, appena dentro la bocca
    this.loaded = new THREE.Mesh(this.ballGeometry(0.0127), this.ballMaterial('steel'));
    this.loaded.castShadow = true;
    barrel.add(this.loaded);

    // forcella: due piastre (quella davanti col goniometro) e una base, fisse sulla colonna
    const plateShape = new THREE.Shape();
    const R = 0.2, xL = -0.06, xR = 0.022, a1 = Math.atan2(-Math.sqrt(R * R - xL * xL), xL) + Math.PI * 2;
    plateShape.moveTo(0, R);
    plateShape.absarc(0, 0, R, Math.PI / 2, a1, false);
    plateShape.lineTo(xL, -0.36); plateShape.lineTo(xR, -0.36); plateShape.lineTo(xR, 0);
    plateShape.absarc(0, 0, xR, 0, Math.PI / 2, false);
    plateShape.lineTo(0, R);
    // piastra posteriore in alluminio; quella anteriore in plexiglas con la scala stampata, così la canna si vede
    const acrylic = new THREE.MeshStandardMaterial({ color: '#dfe9ee', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.22, depthWrite: false });
    for (const [z0, mat] of [[0.040, acrylic], [-0.046, M.brushed]]) {
      const g = new THREE.ExtrudeGeometry(plateShape, { depth: 0.006, bevelEnabled: false, curveSegments: 48 });
      g.translate(0, 0, z0);
      const m = this._mesh(g, mat, L, 'height');
      if (mat === acrylic) m.renderOrder = 2;
    }
    const scale = new THREE.Mesh(new THREE.CircleGeometry(0.19, 128, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: protractorTexture(0.19), roughness: 0.5, metalness: 0, transparent: true, alphaTest: 0.04, depthWrite: false }));
    scale.position.z = 0.0462; scale.renderOrder = 3;
    L.add(scale);
    // bordo lucido del plexiglas (si vede meglio dove finisce la piastra)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0016, 6, 96, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.043), M.chrome);
    L.add(rim);
    this._mesh(new RoundedBoxGeometry(0.1, 0.045, 0.104, 2, 0.004).translate(-0.02, YOKE_BASE + 0.0225, 0), M.anod, L, 'height');
    for (const z of [0.052, -0.052]) for (const y of [-0.3, -0.385]) this._mesh(cyl(0.005, 0.005, 0.004, 12).rotateX(Math.PI / 2).translate(-0.02, y, z), M.chrome, L);
    // colonna quadra: scende nel pozzetto
    this._mesh(new THREE.BoxGeometry(0.05, 4, 0.05).translate(-0.02, YOKE_BASE - 2, 0), M.alu, L, 'height');

    // supporto della seconda pallina (lasciata cadere): braccetto con elettromagnete accanto alla bocca
    this.twinHolder = new THREE.Group();
    L.add(this.twinHolder);
    this.twinLoaded = new THREE.Mesh(this.ballGeometry(0.0127), this.ballMaterial('steel'));
    this.twinLoaded.castShadow = true;
    this.twinLoaded.position.set(0, 0, TWIN_Z);
    L.add(this.twinLoaded);
    this.setBallKind('steel', 0.0127);
  }

  /** Aspetto della pallina caricata e del suo gemello; il supporto dipende dal raggio. */
  setBallKind(key, r) {
    if (this.gal) this.gal.setBall(key, r);
    if (this.ballKey === key && this.ballR === r) return;
    this.ballKey = key; this.ballR = r;
    this.loaded.geometry = this.ballGeometry(r); this.loaded.material = this.ballMaterial(key);
    this.loaded.position.set(-r - 0.003, 0, 0);
    this.twinLoaded.geometry = this.ballGeometry(r); this.twinLoaded.material = this.ballMaterial(key);
    const M = this.M, h = this.twinHolder;
    for (const c of [...h.children]) { h.remove(c); c.geometry.dispose(); }
    const yRod = r + 0.03;
    this._mesh(cyl(0.004, 0.004, TWIN_Z - 0.046 + 0.01, 16).rotateX(Math.PI / 2).translate(-0.004, yRod, (0.046 + TWIN_Z + 0.01) / 2), M.chrome, h);
    this._mesh(cyl(0.004, 0.004, yRod - (r + 0.019), 12).translate(0, (yRod + r + 0.019) / 2, TWIN_Z), M.chrome, h);
    this._mesh(cyl(0.011, 0.011, 0.018, 24).translate(0, r + 0.01, TWIN_Z), M.copper, h);
    this._mesh(cyl(0.0115, 0.0115, 0.004, 24).translate(0, r + 0.0205, TWIN_Z), M.black, h);
  }

  /** Perno all'altezza P (m dal pavimento), canna all'alzo th (rad). */
  setLauncher(P, th) {
    this.launcher.position.set(0, P, 0);
    this.barrel.rotation.z = th;
    this.P = P;
    // con la base della forcella sopra il pavimento la botola si chiude attorno alla colonna
    const closed = P + YOKE_BASE >= 0.006;
    this.lid.visible = closed;
    this.lidAside.visible = !closed;
  }

  setTwin(on) { this.twinHolder.visible = on; this.twinLoaded.visible = on; }

  kick() { this.plungerT = 0; }

  update(dt) {
    if (this.plungerT < 1) {
      this.plungerT = Math.min(1, this.plungerT + dt / 0.9);
      // scatto in 40 ms, poi la ricarica lenta
      const t = this.plungerT * 0.9, x = t < 0.04 ? 0.045 * (t / 0.04) : 0.045 * Math.max(0, 1 - (t - 0.25) / 0.6);
      this.plunger.position.x = x;
    }
  }

  // ───────────────────────────── pozzetto e botola ─────────────────────────────
  _buildPit() {
    const M = this.M, { x0, x1, z0, z1, depth } = PIT;
    const w = x1 - x0, d = z1 - z0;
    const pit = new THREE.Group();
    this.group.add(pit);
    this.pitGroup = pit;
    const box = this._mesh(new THREE.BoxGeometry(w, depth, d).translate((x0 + x1) / 2, -depth / 2, (z0 + z1) / 2), M.pit, pit);
    box.castShadow = false;
    // cornice in acciaio
    const t = 0.014, hgt = 0.004;
    this._mesh(new THREE.BoxGeometry(w + 2 * t, hgt, t).translate((x0 + x1) / 2, hgt / 2, z1 + t / 2), M.plate, pit);
    this._mesh(new THREE.BoxGeometry(w + 2 * t, hgt, t).translate((x0 + x1) / 2, hgt / 2, z0 - t / 2), M.plate, pit);
    this._mesh(new THREE.BoxGeometry(t, hgt, d).translate(x0 - t / 2, hgt / 2, (z0 + z1) / 2), M.plate, pit);
    this._mesh(new THREE.BoxGeometry(t, hgt, d).translate(x1 + t / 2, hgt / 2, (z0 + z1) / 2), M.plate, pit);
    // botola chiusa: lamiera attorno alla colonna, con un collare di guida
    const lid = new THREE.Group();
    const cx0 = -0.045, cx1 = 0.005, cz0 = -0.025, cz1 = 0.025, y = 0.0035;
    const piece = (a0, a1, b0, b1) => this._mesh(new THREE.BoxGeometry(a1 - a0, 0.004, b1 - b0).translate((a0 + a1) / 2, y - 0.002, (b0 + b1) / 2), M.plate, lid);
    piece(x0, cx0, z0, z1); piece(cx1, x1, z0, z1); piece(cx0, cx1, cz1, z1); piece(cx0, cx1, z0, cz0);
    const c = 0.012;
    for (const [a0, a1, b0, b1] of [[cx0 - c, cx1 + c, cz1, cz1 + c], [cx0 - c, cx1 + c, cz0 - c, cz0], [cx0 - c, cx0, cz0, cz1], [cx1, cx1 + c, cz0, cz1]]) {
      this._mesh(new THREE.BoxGeometry(a1 - a0, 0.03, b1 - b0).translate((a0 + a1) / 2, 0.019, (b0 + b1) / 2), M.anod, lid);
    }
    for (const x of [x0 + 0.03, x1 - 0.03]) for (const z of [z0 + 0.025, z1 - 0.025]) this._mesh(cyl(0.006, 0.006, 0.002, 12).translate(x, 0.006, z), M.chrome, lid);
    pit.add(lid);
    this.lid = lid;
    // botola aperta: le lamiere appoggiate accanto al pozzetto
    const aside = new THREE.Group();
    this._mesh(new THREE.BoxGeometry(w * 0.5, 0.004, d).translate(0, 0.002, 0), M.plate, aside);
    this._mesh(new THREE.BoxGeometry(w * 0.5, 0.004, d).translate(0.012, 0.006, 0.01).rotateY(0.06), M.plate, aside);
    aside.position.set(x0 - 0.2, 0, z0 - 0.16);
    pit.add(aside);
    this.lidAside = aside;
  }

  // ───────────────────────────── metro a nastro e cartelli di distanza ─────────────────────────────
  _buildTape() {
    this.tape = new THREE.Group();
    this.group.add(this.tape);
    this.tapeSegs = [];
    const M = this.M;
    // gancio all'inizio del nastro
    this._mesh(new THREE.BoxGeometry(0.003, 0.012, 0.024).translate(-0.0015, 0.006, TAPE_Z), M.chrome, this.tape);
    // cassa del metro alla fine del nastro (spostata quando il nastro si allunga)
    const box = new THREE.Group();
    this._mesh(new RoundedBoxGeometry(0.08, 0.08, 0.04, 3, 0.012).translate(0.04, 0.04, 0), M.yellow, box);
    this._mesh(cyl(0.022, 0.022, 0.042, 32).rotateX(Math.PI / 2).translate(0.045, 0.045, 0), M.black, box);
    this._mesh(new THREE.BoxGeometry(0.02, 0.01, 0.044).translate(0.008, 0.012, 0), M.black, box);
    box.position.set(1, 0, TAPE_Z);
    this.tape.add(box);
    this.tapeBox = box;
    this.markers = {};
    this.tapeLen = 0;
    this.setTape(3);
  }

  /** Nastro fino a maxX (al più 15 m); oltre, cartelli di distanza sul pavimento. */
  setTape(maxX) {
    const n = Math.min(15, Math.max(2, Math.ceil(maxX + 0.6)));
    if (n !== this.tapeLen) {
      for (let i = this.tapeSegs.length; i < n; i++) {
        const mat = new THREE.MeshStandardMaterial({ map: tapeTexture(i * 100, 100), roughness: 0.42, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.019), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(i + 0.5, 0.0006, TAPE_Z);
        m.receiveShadow = true;
        this.tape.add(m);
        this.tapeSegs.push(m);
      }
      this.tapeSegs.forEach((m, i) => { m.visible = i < n; });
      this.tapeBox.position.x = n;
      this.tapeLen = n;
    }
    // cartelli ogni 5 m (ogni 10 m oltre i 50 m) dopo la fine del nastro
    const want = new Set();
    for (let d = 5; d <= maxX + 6 && d <= 400; d += d < 50 ? 5 : 10) if (d > n) want.add(d);
    for (const d of want) {
      if (this.markers[d]) continue;
      const s = 0.3 * (1 + d / 30);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s / 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: markerTexture(`${d} m`), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.position.set(d, 0.0008, TAPE_Z + 0.12 + s / 4);
      m.receiveShadow = true;
      this.group.add(m);
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.012 * (1 + d / 30), 0.25 * (1 + d / 30)).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c8281e', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      tick.position.set(d, 0.0008, TAPE_Z - 0.02);
      this.group.add(tick);
      this.markers[d] = [m, tick];
    }
    for (const [d, ms] of Object.entries(this.markers)) for (const m of ms) m.visible = want.has(Number(d));
  }

  // ───────────────────────────── asta graduata per la proiezione verticale ─────────────────────────────
  _buildRod() {
    const M = this.M, g = new THREE.Group();
    g.position.set(ROD.x, 0, ROD.z);
    const prof = [[0, 0], [0.074, 0], [0.079, 0.006], [0.086, 0.03], [0.089, 0.06], [0.086, 0.09], [0.079, 0.114], [0.072, 0.12], [0.016, 0.12], [0, 0.12]];
    this._mesh(lathe(prof, 64, 0.35), M.iron, g);
    this.rodPole = new THREE.Group();
    g.add(this.rodPole);
    this.group.add(g);
    this.rod = g;
    this.rodKey = '';
    this.rodMats = [];
  }

  /** Asta alta top metri (scala a strisce di un metro rivolta verso +z). */
  setRod(on, top) {
    this.rod.visible = on;
    if (!on) return;
    top = Math.min(Math.max(Math.ceil(top * 2) / 2, 1), 10);
    const key = top.toFixed(1);
    if (key === this.rodKey) return;
    this.rodKey = key;
    const p = this.rodPole, M = this.M;
    for (const c of [...p.children]) { p.remove(c); c.geometry.dispose(); }
    const r = 0.012, y0 = 0.11;
    this._mesh(cyl(r, r, top - y0, 24).translate(0, (top + y0) / 2, 0), M.alu, p);
    this._mesh(cyl(r * 1.08, r * 1.08, 0.01, 24).translate(0, top + 0.005, 0), M.black, p);
    for (let k = 0; k < Math.ceil(top); k++) {
      if (!this.rodMats[k]) this.rodMats[k] = new THREE.MeshStandardMaterial({ map: poleScaleTexture(k), roughness: 0.5, metalness: 0.1 });
      const ya = Math.max(k, 0.12), yb = Math.min(k + 1, top - 0.006);
      if (yb <= ya) continue;
      const geo = new THREE.PlaneGeometry(0.018, yb - ya);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? yb - k : ya - k);
      const m = new THREE.Mesh(geo, this.rodMats[k]);
      m.position.set(0, (ya + yb) / 2, r + 0.0006);
      m.receiveShadow = true;
      p.add(m);
    }
  }

  // ───────────────────────────── bersagli ─────────────────────────────
  _buildTargets() {
    const M = this.M;
    // bersaglio a terra: tappetino di gomma con i cerchi
    const plate = new THREE.Group();
    this._mesh(cyl(0.205, 0.205, 0.003, 64).translate(0, 0.0015, 0), M.rubber, plate);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.7 }));
    face.position.y = 0.0032; face.receiveShadow = true;
    plate.add(face);
    this.group.add(plate);
    this.plate = plate;
    // supporto del bersaglio che cade
    this.stand = new THREE.Group();
    this.group.add(this.stand);
    // il barattolo
    const can = new THREE.Group();
    const H = 2 * CAN.hh, r = CAN.r;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H - 0.012, 64, 1, true), new THREE.MeshStandardMaterial({ map: canLabelTexture(), metalness: 0.35, roughness: 0.4 }));
    body.castShadow = true; body.receiveShadow = true;
    can.add(body);
    for (const s of [1, -1]) {
      this._mesh(revolveX([[0, r - 0.003], [0, r + 0.0012], [0.006, r + 0.0012], [0.006, r - 0.003]], 64, 0.6).rotateZ(s * Math.PI / 2).translate(0, s * (H / 2 - 0.006), 0), M.chrome, can);
      this._mesh(new THREE.CircleGeometry(r - 0.002, 48).rotateX(-s * Math.PI / 2).translate(0, s * (H / 2 - 0.002), 0), M.chrome, can);
    }
    this.group.add(can);
    this.can = can;
    this.canGhostGeo = new THREE.CylinderGeometry(r, r, H, 24);
  }

  /** kind: 'none' | 'floor' | 'drop'. D distanza dal punto di lancio, H quota del centro del barattolo appeso. */
  setTarget(kind, D, H) {
    this.plate.visible = kind === 'floor';
    this.plate.position.set(D, 0, 0);
    this.stand.visible = kind === 'drop';
    this.can.visible = kind === 'drop';
    if (kind !== 'drop') return;
    const key = `${D.toFixed(3)}:${H.toFixed(3)}`;
    if (key === this.standKey) return;
    this.standKey = key;
    const M = this.M, s = this.stand;
    for (const c of [...s.children]) { s.remove(c); c.geometry.dispose(); }
    const yMag = H + CAN.hh + 0.001, top = yMag + 0.03 + 0.008;
    const base = [[0, 0], [0.1, 0], [0.104, 0.008], [0.098, 0.03], [0.02, 0.04], [0, 0.04]];
    this._mesh(lathe(base, 64, 0.4).translate(D, 0, STAND_Z), M.iron, s);
    this._mesh(cyl(0.012, 0.012, top + 0.06, 24).translate(D, (top + 0.06) / 2, STAND_Z), M.alu, s);
    this._mesh(new RoundedBoxGeometry(0.045, 0.045, 0.045, 2, 0.005).translate(D, top, STAND_Z), M.black, s);
    this._mesh(cyl(0.007, 0.007, -STAND_Z, 20).rotateX(Math.PI / 2).translate(D, top, STAND_Z / 2), M.chrome, s);
    this._mesh(cyl(0.004, 0.004, 0.012, 12).translate(D, top - 0.009, 0), M.chrome, s);
    this._mesh(cyl(0.02, 0.02, 0.03, 32).translate(D, yMag + 0.015, 0), M.copper, s);
    this._mesh(cyl(0.0205, 0.0205, 0.004, 32).translate(D, yMag + 0.028, 0), M.black, s);
    // cavo dell'elettromagnete: giù lungo l'asta e per terra fino al lanciatore (si apre al lancio)
    const pts = [[D, top, 0.0], [D, top + 0.03, -0.12], [D + 0.015, top - 0.05, STAND_Z + 0.02], [D + 0.016, 0.3, STAND_Z + 0.016], [D + 0.04, 0.004, STAND_Z + 0.08], [D * 0.5, 0.003, -0.2], [0.12, 0.003, PIT.z0 - 0.04], [0, 0.003, PIT.z0 - 0.02]];
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    this._mesh(new THREE.TubeGeometry(curve, Math.ceil(80 + D * 30), 0.0025, 8), M.rubber, s);
  }

  /** Barattolo al centro (x, y, z), ruotato di rot attorno a z. */
  placeCan(x, y, z, rot) { this.can.position.set(x, y, z); this.can.rotation.set(0, 0, rot); }
}
