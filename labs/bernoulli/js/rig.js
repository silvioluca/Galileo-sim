// rig.js — gli apparati in 3D.
// Il tubo di Venturi: un pannello bianco con la scala (zero sull'asse del tubo) su due montanti; a sinistra il
// serbatoio di plexiglas con il tubo del troppo pieno, che tiene il livello costante, e il rubinetto che lo riempie;
// il tubo trasparente con l'acqua colorata, i tubicini piezometrici (e a scelta i tubi di Pitot accanto), la valvola
// a sfera, il getto che esce e il becher graduato sul pavimento; a scelta l'aspiratore alla gola con l'inchiostro.
// La pallina nel getto: un asciugacapelli su un sostegno che si inclina, la pallina, il fumo, un'asta graduata.
// Coordinate: x lungo il tubo, y in alto, z verso chi guarda; il tubo ha l'asse a quota PIPE.Y0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { PIPE, JET } from './flow.js';

const MONO = '"Geist Mono Variable", Consolas, monospace';
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const std = (o) => new THREE.MeshStandardMaterial(o);
export const TUBE_TOP = 0.66;                          // i tubicini arrivano a 66 cm sopra l'asse
export const RES = { x0: -0.84, x1: -0.6, z: 0.11, bottom: -0.07, top: 0.66 };   // il serbatoio (y relative all'asse)
export const BEAKER = { x: 0.7, R: 0.064, H: 0.2, V: 2.0 };                      // becher da 2 L
const NOZ = 0.012;                                    // raggio dell'ugello d'uscita

function scaleTexture(W, Hh, y0, y1) {
  // scala in centimetri: zero sull'asse del tubo
  return canvasTexture(2048, 1400, (g) => {
    const px = 2048 / W, py = 1400 / Hh, Y = (y) => 1400 - (y - y0) * py;
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, 2048, 1400);
    g.strokeStyle = '#2a2e35'; g.fillStyle = '#2a2e35'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let c = Math.ceil(y0 * 100); c <= Math.floor(y1 * 100); c++) {
      const y = Y(c / 100), long = c % 5 === 0;
      g.lineWidth = c % 10 === 0 ? 3 : 1.6; g.globalAlpha = long ? 0.55 : 0.22;
      g.beginPath(); g.moveTo(long ? 70 : 90, y); g.lineTo(2048 - 30, y); g.stroke();
      g.globalAlpha = 1;
      if (c % 5 === 0 && c >= 0) { g.font = `600 ${c % 10 === 0 ? 30 : 24}px ${MONO}`; g.fillText(String(c), 62, y); }
    }
    g.lineWidth = 4; g.strokeStyle = '#c62a1e'; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(70, Y(0)); g.lineTo(2048 - 30, Y(0)); g.stroke(); g.globalAlpha = 1;
    g.font = `600 28px ${FONT}`; g.fillStyle = '#c62a1e'; g.textAlign = 'left'; g.fillText('asse del tubo', 110, Y(0) - 20);
    g.font = `500 26px ${MONO}`; g.fillStyle = '#6b7380'; g.fillText('cm', 20, 40);
  }, { aniso: 16 });
}

function ballTexture() {
  return canvasTexture(512, 256, (g) => {
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#e8452c'; g.fillRect(0, 118, 512, 20);
    g.font = `700 34px ${FONT}`; g.fillStyle = '#e8452c'; g.textAlign = 'center'; g.fillText('★ ★ ★', 256, 88);
  });
}
function smokeTexture() {
  return canvasTexture(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, { srgb: false });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'bernoulli';
    this.M = {
      alu: std({ color: '#c3c8ce', metalness: 1, roughness: 0.3 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      black: std({ color: '#17181b', metalness: 0.3, roughness: 0.5 }),
      iron: std({ color: '#2c3138', metalness: 0.55, roughness: 0.45 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      brass: std({ color: '#c9a24f', metalness: 1, roughness: 0.3 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      blue: std({ color: '#5b7fa3', metalness: 0.35, roughness: 0.58 }),
      acrylic: new THREE.MeshPhysicalMaterial({ color: '#eef6f8', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, clearcoat: 1, envMapIntensity: 1.6, side: THREE.DoubleSide }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#f2f8f8', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.22, depthWrite: false, clearcoat: 1, envMapIntensity: 1.8 }),
      // acqua colorata di blu, come si fa davvero per leggere bene i livelli
      water: new THREE.MeshPhysicalMaterial({ color: '#2a72d4', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.62, depthWrite: false, envMapIntensity: 1.2 }),
      column: new THREE.MeshPhysicalMaterial({ color: '#1257d6', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.95, depthWrite: false, emissive: '#1a4fb8', emissiveIntensity: 0.5 }),
      meniscus: std({ color: '#0b2f6e', roughness: 0.3, metalness: 0 }),
      waterTank: new THREE.MeshPhysicalMaterial({ color: '#3a86e0', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide }),
      ink: new THREE.MeshPhysicalMaterial({ color: '#c0201a', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.85, depthWrite: false }),
      white: std({ color: '#f4f4f1', roughness: 0.55, metalness: 0 }),
      dryer: std({ color: '#ececee', roughness: 0.38, metalness: 0.05 }),
      dryerDark: std({ color: '#2a2c31', roughness: 0.45, metalness: 0.2 }),
    };
    this.venturiG = new THREE.Group(); this.group.add(this.venturiG);
    this.jetG = new THREE.Group(); this.group.add(this.jetG);
    this._buildBoard();
    this._buildReservoir();
    this._buildValve();
    this._buildBeaker();
    this._buildParticles();
    this._buildJet();
  }
  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m); return m;
  }
  setApparatus(kind) { this.venturiG.visible = kind === 'venturi'; this.jetG.visible = kind === 'jet'; }

  // ───────────────────────────── pannello e scala ─────────────────────────────
  _buildBoard() {
    const g = this.venturiG, Y0 = PIPE.Y0, x0 = -0.58, x1 = 0.5, y0 = Y0 - 0.08, y1 = Y0 + 0.7;
    const W = x1 - x0, H = y1 - y0;
    const board = this._mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: scaleTexture(W, H, y0 - Y0, y1 - Y0), roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.05 }), g);
    board.position.set((x0 + x1) / 2, (y0 + y1) / 2, -0.045); board.userData.noOutline = true;
    this._mesh(new RoundedBoxGeometry(W + 0.02, H + 0.02, 0.012, 2, 0.003).translate((x0 + x1) / 2, (y0 + y1) / 2, -0.052), this.M.alu, g);
    for (const x of [x0 + 0.06, x1 - 0.06]) {
      this._mesh(new RoundedBoxGeometry(0.03, y1, 0.03, 2, 0.004).translate(x, y1 / 2, -0.075), this.M.alu, g);
      this._mesh(new RoundedBoxGeometry(0.05, 0.02, 0.32, 2, 0.005).translate(x, 0.01, -0.03), this.M.iron, g);
    }
  }

  // ───────────────────────────── il tubo, i tubicini ─────────────────────────────
  /** Ricostruisce il tubo per il profilo P (con r(x)) e i tubicini alle stazioni P.xs. */
  setPipe(P, opts) {
    const g = this.venturiG, Y0 = PIPE.Y0;
    for (const m of this.pipeParts || []) { g.remove(m); m.geometry?.dispose(); }
    this.pipeParts = [];
    const add = (m) => { this.pipeParts.push(m); return m; };
    const N = 260, x0 = PIPE.x0, x1 = PIPE.x1 + 0.005;
    const outer = [], inner = [];
    for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N, r = P.r(Math.min(PIPE.x1, x)); outer.push(new THREE.Vector2(r + PIPE.wall, x)); inner.push(new THREE.Vector2(r - 0.0002, x)); }
    const lathe = (pts, mat) => { const geo = new THREE.LatheGeometry(pts, 48).rotateZ(-Math.PI / 2).translate(0, Y0, 0); return add(this._mesh(geo, mat, g, false)); };
    const tube = lathe(outer, this.M.acrylic); tube.renderOrder = 4; tube.userData.noAO = true;
    this.pipeWater = lathe(inner, this.M.water); this.pipeWater.renderOrder = 3; this.pipeWater.userData.noAO = true;
    // flange
    for (const x of [x0 + 0.004, PIPE.x1 - 0.004]) add(this._mesh(cyl(P.R1 + 0.012, P.R1 + 0.012, 0.012, 40).rotateZ(Math.PI / 2).translate(x, Y0, 0), this.M.alu, g));
    // supporti del tubo
    for (const x of [-0.35, 0.3]) {
      add(this._mesh(new RoundedBoxGeometry(0.02, Y0 - P.R1 - PIPE.wall, 0.02, 2, 0.004).translate(x, (Y0 - P.R1 - PIPE.wall) / 2, 0), this.M.alu, g));
      add(this._mesh(new RoundedBoxGeometry(0.06, 0.02, 0.14, 2, 0.005).translate(x, 0.01, 0), this.M.iron, g));
    }
    // tubicini piezometrici e, a scelta, di Pitot
    this.tubes = [];
    P.xs.forEach((x0s, i) => {
      let x = x0s;
      const r = P.r(x0s), base = Y0 + r + PIPE.wall;
      const aspir = opts.aspirator && i === P.tap;
      const mk = (dx, pitot) => {
        const dz = 0, xx = x + dx, T = { x: xx, z: dz, base, pitot, level: base, vel: 0 };
        x = xx;
        T.glass = add(this._mesh(cyl(0.0045, 0.0045, Y0 + TUBE_TOP - base, 20).translate(x, (Y0 + TUBE_TOP + base) / 2, dz), this.M.glass, g, false));
        T.glass.renderOrder = 5;
        T.col = add(this._mesh(cyl(0.0034, 0.0034, 1, 16).translate(0, 0.5, 0), this.M.column, g, false)); T.col.position.set(x, base, dz); T.col.renderOrder = 4;
        T.men = add(this._mesh(cyl(0.0036, 0.0036, 0.0025, 16), pitot ? this.M.red : this.M.meniscus, g, false)); T.men.position.set(x, base, dz);
        add(this._mesh(cyl(0.0065, 0.0065, 0.012, 20).translate(x, base + 0.004, dz), pitot ? this.M.red : this.M.black, g));
        // fermagli sul pannello
        for (const yy of [Y0 + 0.25, Y0 + 0.55]) add(this._mesh(new RoundedBoxGeometry(0.014, 0.008, 0.035 + dz, 2, 0.002).translate(x, yy, (dz - 0.045) / 2), this.M.alu, g));
        if (pitot) {
          // la presa di Pitot: un tubetto piegato dentro il tubo, aperto controcorrente
          add(this._mesh(cyl(0.0018, 0.0018, r + PIPE.wall, 12).translate(x, Y0 + (r + PIPE.wall) / 2, 0), this.M.chrome, g));
          add(this._mesh(cyl(0.0018, 0.0018, 0.012, 12).rotateZ(Math.PI / 2).translate(x - 0.006, Y0, 0), this.M.chrome, g));
        }
        return T;
      };
      if (aspir) { this.tubes.push(null); return; }
      this.tubes.push(mk(0, false));
      if (opts.pitot) { x = x0s; this.tubes.push(mk(0.012, true)); }
    });
    // l'aspiratore: un tubetto che scende dalla gola in una vaschetta d'inchiostro
    this.aspir = null;
    if (opts.aspirator) {
      const x = P.xs[P.tap], r = P.r(x), top = Y0 - r - PIPE.wall, cupY = Y0 - 0.17;
      const A = { x, top, cupY, level: cupY, vel: 0 };
      A.glass = add(this._mesh(cyl(0.0035, 0.0035, top - (cupY - 0.03), 16).translate(x, (top + cupY - 0.03) / 2, 0), this.M.glass, g, false)); A.glass.renderOrder = 5;
      A.col = add(this._mesh(cyl(0.0024, 0.0024, 1, 12).translate(0, 0.5, 0), this.M.ink, g, false)); A.col.renderOrder = 4;
      const cup = add(this._mesh(new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.032, 0.002], [0.034, 0.05], [0.036, 0.052]].map(([a, b]) => new THREE.Vector2(a, b)), 40).translate(x, cupY - 0.035, 0), this.M.glass, g, false)); cup.renderOrder = 5;
      add(this._mesh(cyl(0.031, 0.031, 0.035, 40).translate(x, cupY - 0.0165, 0), this.M.ink, g, false)).renderOrder = 4;
      add(this._mesh(cyl(0.004, 0.004, cupY - 0.035, 12).translate(x + 0.05, (cupY - 0.035) / 2, 0), this.M.chrome, g));
      add(this._mesh(new RoundedBoxGeometry(0.1, 0.006, 0.06, 2, 0.002).translate(x + 0.02, cupY - 0.038, 0), this.M.iron, g));
      add(this._mesh(new RoundedBoxGeometry(0.1, 0.012, 0.08, 2, 0.003).translate(x + 0.04, 0.006, 0), this.M.iron, g));
      this.aspir = A;
    }
    this.P = P;
  }

  /** Livelli nei tubicini (y assolute) e nell'aspiratore. */
  setLevels(levels, aspirLevel) {
    this.tubes.forEach((T, i) => {
      if (!T) return;
      const y = Math.max(T.base, Math.min(PIPE.Y0 + TUBE_TOP - 0.004, levels[i]));
      T.col.scale.y = Math.max(0.0001, y - T.base); T.col.visible = T.men.visible = y > T.base + 0.0005;
      T.men.position.y = y - 0.001;
    });
    if (this.aspir) {
      const A = this.aspir, y = Math.max(A.cupY - 0.03, Math.min(A.top, aspirLevel));
      A.col.position.set(A.x, A.cupY - 0.03, 0); A.col.scale.y = y - (A.cupY - 0.03);
    }
  }

  // ───────────────────────────── serbatoio ─────────────────────────────
  _buildReservoir() {
    const g = this.venturiG, Y0 = PIPE.Y0, { x0, x1, z, bottom, top } = RES;
    const W = x1 - x0, cx = (x0 + x1) / 2, yb = Y0 + bottom, yt = Y0 + top, t = 0.005;
    const wall = (sx, sy, sz, px, py, pz) => { const m = this._mesh(new THREE.BoxGeometry(sx, sy, sz).translate(px, py, pz), this.M.acrylic, g, false); m.renderOrder = 5; };
    wall(W, yt - yb, t, cx, (yt + yb) / 2, z); wall(W, yt - yb, t, cx, (yt + yb) / 2, -z);
    wall(t, yt - yb, 2 * z, x0, (yt + yb) / 2, 0); wall(t, yt - yb, 2 * z, x1, (yt + yb) / 2, 0);
    this._mesh(new THREE.BoxGeometry(W + 0.01, 0.012, 2 * z + 0.01).translate(cx, yb - 0.006, 0), this.M.acrylic, g, false);
    // gambe
    for (const sx of [x0 + 0.02, x1 - 0.02]) for (const sz of [-z + 0.02, z - 0.02]) this._mesh(cyl(0.008, 0.008, yb - 0.012, 16).translate(sx, (yb - 0.012) / 2, sz), this.M.alu, g);
    this.resWater = this._mesh(new THREE.BoxGeometry(1, 1, 1), this.M.waterTank, g, false); this.resWater.renderOrder = 3; this.resWater.userData.noAO = true;
    // troppo pieno: un tubo verticale che si alza e si abbassa e scarica in basso
    this.overflow = this._mesh(cyl(0.011, 0.011, 1, 24).translate(0, -0.5, 0), this.M.acrylic, g, false);
    this.overflow.renderOrder = 6;
    this._mesh(cyl(0.011, 0.011, yb - 0.02, 20).translate(x0 + 0.05, (yb - 0.02) / 2 + 0.01, -0.04), this.M.acrylic, g, false);
    // il rubinetto che lo riempie, con il getto d'acqua
    this._mesh(cyl(0.007, 0.007, 0.16, 16).rotateZ(Math.PI / 2).translate(cx - 0.1, yt + 0.1, -0.03), this.M.chrome, g);
    this._mesh(cyl(0.007, 0.006, 0.05, 16).translate(cx - 0.02, yt + 0.08, -0.03), this.M.chrome, g);
    this._mesh(cyl(0.012, 0.012, 0.016, 16).translate(cx - 0.05, yt + 0.115, -0.03), this.M.red, g);
    this.fillJet = this._mesh(cyl(0.0032, 0.0026, 1, 12).translate(0, -0.5, 0), this.M.waterTank, g, false); this.fillJet.position.set(cx - 0.02, yt + 0.055, -0.03);
    // imbocco del tubo
    this._mesh(cyl(PIPE.D1 / 2 + 0.012, PIPE.D1 / 2 + 0.012, 0.014, 40).rotateZ(Math.PI / 2).translate(x1 + 0.007, Y0, 0), this.M.alu, g);
  }
  setReservoir(H) {
    const Y0 = PIPE.Y0, { x0, x1, z, bottom } = RES, yb = Y0 + bottom, ys = Y0 + H;
    this.resWater.scale.set(x1 - x0 - 0.01, ys - yb, 2 * z - 0.01); this.resWater.position.set((x0 + x1) / 2, (ys + yb) / 2, 0);
    this.overflow.position.set(x0 + 0.05, ys + 0.002, -0.04); this.overflow.scale.y = ys + 0.002 - (yb + 0.003);
    this.fillJet.scale.y = this.fillJet.position.y - ys;
  }

  // ───────────────────────────── valvola, getto, becher ─────────────────────────────
  _buildValve() {
    const g = this.venturiG, Y0 = PIPE.Y0, x = PIPE.x1 + 0.03;
    this._mesh(cyl(0.024, 0.024, 0.05, 32).rotateZ(Math.PI / 2).translate(x, Y0, 0), this.M.brass, g);
    this._mesh(new THREE.SphereGeometry(0.026, 32, 20).translate(x, Y0, 0), this.M.brass, g);
    this._mesh(cyl(0.006, 0.006, 0.03, 16).translate(x, Y0 + 0.035, 0), this.M.chrome, g);
    this.lever = new THREE.Group(); this.lever.position.set(x, Y0 + 0.05, 0); g.add(this.lever);
    this._mesh(new RoundedBoxGeometry(0.11, 0.012, 0.02, 2, 0.004).translate(0.05, 0, 0), this.M.red, this.lever);
    // ugello d'uscita
    this._mesh(cyl(NOZ + 0.004, NOZ + 0.004, 0.04, 32).rotateZ(Math.PI / 2).translate(x + 0.045, Y0, 0), this.M.brass, g);
    this.outX = x + 0.065;
    this.outJet = null;
  }
  setValve(phi) { this.lever.rotation.y = (1 - phi) * (Math.PI / 2); }
  /** Il getto che esce dalla valvola con velocità ve (m/s) e portata Q (m³/s), fino all'acqua del becher. */
  setOutflow(ve, Q, surfY) {
    const g = this.venturiG;
    if (this.outJet) { g.remove(this.outJet); this.outJet.geometry.dispose(); this.outJet = null; }
    if (Q < 1e-6) return;
    const pts = [], radii = [], y0 = PIPE.Y0;
    const vx = Math.max(0.02, ve), T = Math.sqrt((2 * (y0 - surfY)) / 9.81);
    for (let i = 0; i <= 40; i++) {
      const t = (T * i) / 40, x = this.outX + vx * t, y = y0 - 0.5 * 9.81 * t * t, sp = Math.hypot(vx, 9.81 * t);
      pts.push(new THREE.Vector3(x, y, 0)); radii.push(Math.sqrt(Q / (Math.PI * Math.max(sp, 0.05))));
    }
    const curve = new THREE.CatmullRomCurve3(pts), geo = new THREE.TubeGeometry(curve, 60, 1, 12, false), p = geo.attributes.position, c = new THREE.Vector3();
    for (let i = 0; i <= 60; i++) { curve.getPointAt(i / 60, c); const r = radii[Math.min(40, Math.round((i / 60) * 40))]; for (let j = 0; j <= 12; j++) { const v = i * 13 + j; p.setXYZ(v, c.x + (p.getX(v) - c.x) * r, c.y + (p.getY(v) - c.y) * r, c.z + (p.getZ(v) - c.z) * r); } }
    geo.computeVertexNormals();
    this.outJet = this._mesh(geo, this.M.water, g, false); this.outJet.renderOrder = 3;
    this.jetLand = pts[pts.length - 1].x;
  }
  _buildBeaker() {
    const g = this.venturiG, { x, R, H } = BEAKER;
    const prof = [[0, 0.001], [R - 0.004, 0.001], [R, 0.005], [R, H], [R + 0.004, H + 0.004]].map(([a, b]) => new THREE.Vector2(a, b));
    const mk = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), this.M.glass); mk.position.set(x, 0, 0); mk.renderOrder = 6; g.add(mk);
    this.beakerParts = [mk];
    // tacche: ogni 100 mL
    const tex = canvasTexture(512, 512, (c) => {
      c.clearRect(0, 0, 512, 512); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.fillStyle = 'rgba(255,255,255,0.95)'; c.font = `600 22px ${MONO}`; c.textAlign = 'left';
      const vToY = (L) => 512 - ((L / 1000) / (Math.PI * R * R)) / H * 512;
      for (let L = 100; L <= 2000; L += 100) { const y = vToY(L); c.lineWidth = L % 500 ? 2 : 4; c.beginPath(); c.moveTo(10, y); c.lineTo(L % 500 ? 50 : 80, y); c.stroke(); if (L % 500 === 0) c.fillText(`${L}`, 88, y + 8); }
    }, { srgb: true });
    const marks = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.0006, R + 0.0006, H, 48, 1, true, -0.5, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    marks.position.set(x, H / 2, 0); marks.renderOrder = 7; g.add(marks);
    this.beakerWater = this._mesh(cyl(R - 0.002, R - 0.002, 1, 48).translate(0, 0.5, 0), this.M.waterTank, g, false); this.beakerWater.position.set(x, 0.002, 0); this.beakerWater.renderOrder = 4;
    this.beakerParts.push(marks, this.beakerWater);
  }
  /** Il becher si mette sotto il punto in cui cade il getto. */
  moveBeaker(x) { for (const m of this.beakerParts) m.position.x = x; }
  /** Litri nel becher. */
  setBeaker(L) { const { R } = BEAKER; this.beakerWater.scale.y = Math.max(0.0001, (L / 1000) / (Math.PI * R * R)); this.beakerSurf = 0.002 + (L / 1000) / (Math.PI * R * R); }

  // ───────────────────────────── particelle nell'acqua ─────────────────────────────
  _buildParticles() {
    const geo = new THREE.CylinderGeometry(0.0007, 0.0007, 1, 6).rotateZ(Math.PI / 2);
    this.parts = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }), 600);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.parts.count = 0; this.parts.frustumCulled = false; this.parts.renderOrder = 4;
    this.parts.userData.noAO = true; this.parts.userData.noOutline = true;
    this.parts.setColorAt(0, new THREE.Color(1, 1, 1));
    this.venturiG.add(this.parts);
  }
  /** pts: [{x, y, z, len, ink}] */
  setParticles(pts) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), white = new THREE.Color(1, 1, 1), red = new THREE.Color(0.85, 0.08, 0.06);
    const n = Math.min(pts.length, 600);
    for (let i = 0; i < n; i++) {
      const a = pts[i]; s.set(Math.max(0.002, a.len), a.ink ? 2.2 : 1, a.ink ? 2.2 : 1); p.set(a.x, a.y, a.z);
      m.compose(p, q, s); this.parts.setMatrixAt(i, m); this.parts.setColorAt(i, a.ink ? red : white);
    }
    this.parts.count = n; this.parts.instanceMatrix.needsUpdate = true; if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  // ───────────────────────────── il getto d'aria e la pallina ─────────────────────────────
  _buildJet() {
    const g = this.jetG, M = this.M;
    // sostegno con l'asse di rotazione all'altezza del corpo dell'asciugacapelli
    this._mesh(new RoundedBoxGeometry(0.22, 0.024, 0.16, 2, 0.006).translate(0, 0.012, -0.1), M.blue, g);
    this._mesh(cyl(0.0065, 0.0065, 0.2, 20).translate(0, 0.1 + 0.024, -0.1), M.chrome, g);
    this._mesh(new RoundedBoxGeometry(0.03, 0.03, 0.03, 2, 0.004).translate(0, 0.17, -0.1), M.boss, g);
    this._mesh(cyl(0.005, 0.005, 0.07, 16).rotateX(Math.PI / 2).translate(0, 0.17, -0.06), M.chrome, g);
    // l'asciugacapelli: si inclina attorno al perno (0, 0.17, 0); ugello in alto
    this.dryer = new THREE.Group(); this.dryer.position.set(0, 0.17, 0); g.add(this.dryer);
    const body = [[0.0, -0.11], [0.03, -0.11], [0.042, -0.1], [0.046, -0.06], [0.046, 0.04], [0.04, 0.07], [0.028, 0.09], [0.025, 0.11]].map(([r, y]) => new THREE.Vector2(r, y));
    this._mesh(new THREE.LatheGeometry(body, 48), M.dryer, this.dryer);
    this._mesh(cyl(0.0255, JET.D0 / 2 + 0.003, 0.04, 40).translate(0, 0.13, 0), M.dryerDark, this.dryer);            // concentratore
    this._mesh(new THREE.TorusGeometry(JET.D0 / 2 + 0.002, 0.002, 10, 40).rotateX(Math.PI / 2).translate(0, 0.15, 0), M.dryerDark, this.dryer);
    // griglia d'aspirazione e impugnatura
    this._mesh(cyl(0.031, 0.031, 0.004, 40).translate(0, -0.112, 0), M.dryerDark, this.dryer);
    const h = this._mesh(new RoundedBoxGeometry(0.032, 0.13, 0.026, 3, 0.01).translate(0, 0, 0), M.dryer, this.dryer);
    h.position.set(0.07, -0.05, 0); h.rotation.z = -1.2;
    this._mesh(new RoundedBoxGeometry(0.012, 0.022, 0.03, 2, 0.003).translate(0.085, -0.018, 0), M.red, this.dryer);
    // morsetto che lo stringe
    this._mesh(cyl(0.05, 0.05, 0.02, 40).translate(0, -0.02, 0), M.boss, this.dryer);
    this.NOZZLE_L = 0.15;
    // la pallina
    this.ball = this._mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.42, metalness: 0 }), g);
    // asta graduata, dietro
    const rod = canvasTexture(128, 2048, (c) => {
      c.fillStyle = '#f6d36a'; c.fillRect(0, 0, 128, 2048); c.fillStyle = '#1d2026'; c.font = `700 30px ${MONO}`; c.textAlign = 'left';
      for (let cm = 0; cm <= 100; cm++) { const y = 2048 - cm * 20.48; c.fillRect(0, y - 1.5, cm % 10 === 0 ? 70 : cm % 5 === 0 ? 50 : 30, 3); if (cm % 10 === 0 && cm > 0) c.fillText(String(cm), 76, y + 10); }
    });
    const stick = this._mesh(new THREE.BoxGeometry(0.03, 1, 0.006), new THREE.MeshStandardMaterial({ map: rod, roughness: 0.6 }), g);
    stick.position.set(-0.24, 0.5, -0.12);
    this._mesh(new RoundedBoxGeometry(0.12, 0.02, 0.1, 2, 0.005).translate(-0.24, 0.01, -0.12), M.iron, g);
    // forze sulla pallina
    this.arrows = ['#15181c', '#2c67dc', '#e8452c'].map((c) => { const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, c, 0.02, 0.012); a.visible = false; g.add(a); return a; });
    // fumo
    const N = 2200;
    this.smokeN = N;
    this.smoke = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: smokeTexture(), size: 0.034, transparent: true, depthWrite: false, opacity: 1, vertexColors: true, sizeAttenuation: true }));
    this.smoke.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.smoke.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4), 4));   // bianco, con la trasparenza nel quarto canale
    this.smoke.frustumCulled = false; this.smoke.renderOrder = 8; this.smoke.userData.noOutline = true;
    g.add(this.smoke);
  }
  /** Inclinazione (rad, verso +x) e posizione dell'ugello (piano x–y). */
  setDryer(tilt) {
    this.dryer.rotation.z = -tilt;
    const t = [Math.sin(tilt), Math.cos(tilt)];
    return { N: [this.dryer.position.x + t[0] * this.NOZZLE_L, this.dryer.position.y + t[1] * this.NOZZLE_L], t };
  }
  setBall(p, R, spinAngle) { this.ball.position.set(p[0], p[1], 0); this.ball.scale.setScalar(R); this.ball.rotation.z = spinAngle; }
  setArrows(on, p, forces) {
    this.arrows.forEach((a, i) => {
      const f = forces[i];
      a.visible = on && !!f && Math.hypot(f[0], f[1]) > 1e-5;
      if (!a.visible) return;
      const L = Math.min(0.25, Math.hypot(f[0], f[1]) * 2.5);
      a.position.set(p[0], p[1], 0.03); a.setDirection(new THREE.Vector3(f[0], f[1], 0).normalize()); a.setLength(Math.max(0.03, L), 0.018, 0.011);
    });
  }
  setSmoke(pts, on) {
    this.smoke.visible = on;
    if (!on) return;
    const pos = this.smoke.geometry.attributes.position, col = this.smoke.geometry.attributes.color;
    for (let i = 0; i < this.smokeN; i++) {
      const s = pts[i];
      if (!s) { pos.setXYZ(i, 0, -5, 0); continue; }
      pos.setXYZ(i, s.x, s.y, s.z); col.setXYZW(i, 0.56, 0.58, 0.62, s.a);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}
