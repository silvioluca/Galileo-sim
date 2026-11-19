// rig.js — il piano inclinato: tavola di legno incernierata su una base, sostenuta da una traversa su un'asta;
// goniometro alla cerniera, righello sul bordo, fermo in cima, respingente in fondo; fotocellule con
// cronometro, campanelli, dinamometro parallelo al piano; carrello e blocco.
// Coordinate della tavola: origine sulla cerniera (faccia superiore), x lungo la tavola (la cima a x = −L),
// y perpendicolare al piano, z attraverso la tavola. Un punto che ha percorso s dal fermo sta a x = −start + s.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SegBuffer } from '../../../shared/js/lines.js';

export const HINGE = { x: 0.52, y: 0.062 };
export const BOARD = { L: 1.2, W: 0.16, T: 0.02, start: 1.1, end: 0.05 };
export const RUN = BOARD.start - BOARD.end;                // corsa del bordo anteriore fino al respingente
export const LANES = [0];                                   // una corsia, al centro della tavola
export const SUPPORT = { dx: -0.58, z: -0.22, top: 1.22 };
export const BEAM_Y = 0.016;
export const DYN = { len: 0.3, rest: 0.1, travel: 0.1, axis: 0.024, anchor: -0.02 };
export const STRING = 0.02;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
const xs = (s) => -BOARD.start + s;                         // da spazio percorso a x della tavola

// ───────────────────────────── trame ─────────────────────────────
function woodTexture(base = '#d8b480', dark = 'rgba(120, 78, 36,') {
  return canvasTexture(1024, 256, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * H, a = 0.06 + Math.random() * 0.16;
      g.strokeStyle = `${dark} ${a})`; g.lineWidth = 0.6 + Math.random() * 2.4;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + 4 * Math.sin(x / 140 + i) + 2 * Math.sin(x / 31 + i * 3));
      g.stroke();
    }
  }, { repeat: true, aniso: 16 });
}
/** Righello in cm da 0 (il fermo) a 105 (il respingente). */
function rulerTexture() {
  const cm = Math.round(RUN * 100), W = 4096, H = 96, px = (W - 40) / cm;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#eceae3'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#15181c'; g.textBaseline = 'top'; g.textAlign = 'center';
    for (let i = 0; i <= cm * 2; i++) {
      const x = 20 + (i / 2) * px, big = i % 20 === 0, mid = i % 10 === 0, cmTick = i % 2 === 0;
      const h = big ? 46 : mid ? 34 : cmTick ? 24 : 14;
      g.fillRect(x - 1.5, 0, 3, h);
      if (big) { g.font = `700 34px ${FONT}`; g.fillText(String(i / 2), x, 50); }
    }
  }, { aniso: 16 });
}
/** Quadrante del goniometro: tacche di grado da 0 (orizzontale, verso la cima) a 90. */
function protractorTexture() {
  const S = 1024, c = S / 2, R = S / 2 - 6;
  return canvasTexture(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(240, 244, 246, 0.42)';
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, Math.PI, Math.PI * 1.5); g.closePath(); g.fill();
    g.strokeStyle = '#1b1f25'; g.fillStyle = '#1b1f25'; g.lineCap = 'butt';
    for (let d = 0; d <= 90; d++) {
      const a = (d * Math.PI) / 180, L = d % 10 === 0 ? 70 : d % 5 === 0 ? 48 : 30;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.lineWidth = d % 10 === 0 ? 4 : 2.4;
      g.beginPath(); g.moveTo(c - ca * R, c - sa * R); g.lineTo(c - ca * (R - L), c - sa * (R - L)); g.stroke();
      if (d % 10 === 0 && d > 0 && d < 90) {
        g.save(); g.translate(c - ca * (R - 102), c - sa * (R - 102)); g.rotate(-a + Math.PI / 2);
        g.font = `700 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${d}°`, 0, 0); g.restore();
      }
    }
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, R, Math.PI, Math.PI * 1.5); g.stroke();
  }, { aniso: 16 });
}
/** Scala del dinamometro (stessa serie del laboratorio di Archimede). */
function dynScaleTexture(range) {
  const W = 160, H = 1100, top = 50, len = 1000;
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#16191e'; g.textBaseline = 'middle'; g.textAlign = 'right';
    const n = Math.round(range.F / range.div), every = n > 60 ? 10 : 5;
    for (let i = 0; i <= n; i++) {
      const y = top + (i / n) * len, big = i % every === 0, mid = !big && i % (every / 2) === 0;
      g.fillRect(W - (big ? 62 : mid ? 44 : 28), y - (big ? 2.5 : 1.5), big ? 62 : mid ? 44 : 28, big ? 5 : 3);
      if (big) { const txt = (i * range.div).toLocaleString('it-IT', { maximumFractionDigits: 2 }); g.font = `700 ${txt.length > 3 ? 30 : 36}px ${FONT}`; g.fillText(txt, W - 70, y); }
    }
    g.textAlign = 'center'; g.font = `700 34px ${FONT}`; g.fillText(`${range.F} N`, W / 2, 22);
  }, { aniso: 16 });
}
class Helix extends THREE.Curve {
  constructor(r, turns, L) { super(); this.r = r; this.turns = turns; this.L = L; }
  getPoint(t, out = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2; return out.set(this.r * Math.cos(a), -t * this.L, this.r * Math.sin(a)); }
}
const SPRING0 = DYN.rest - 0.027;

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'piano inclinato';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      alu: std({ color: '#c9cdd2', metalness: 1, roughness: 0.32 }),
      black: std({ color: '#141518', metalness: 0.3, roughness: 0.5 }),
      rubber: std({ color: '#1b1c1e', metalness: 0, roughness: 0.92 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      steel: std({ color: '#d3d6da', metalness: 1, roughness: 0.2 }),
      brass: std({ color: '#d4ae5d', metalness: 1, roughness: 0.24 }),
      red: std({ color: '#d4301f', metalness: 0, roughness: 0.4 }),
      plastic: std({ color: '#eceae5', metalness: 0, roughness: 0.5 }),
      wire: std({ color: '#c3c6ca', metalness: 1, roughness: 0.28 }),
      cap: std({ color: '#3aa458', metalness: 0, roughness: 0.4 }),
      wood: std({ map: woodTexture(), roughness: 0.62 }),
      baseWood: std({ map: woodTexture('#8a5c34', 'rgba(52, 30, 12,'), roughness: 0.7 }),
      blockWood: std({ map: woodTexture('#c99a5e', 'rgba(110, 66, 28,'), roughness: 0.66 }),
    };
    this.tubeMat = new THREE.MeshPhysicalMaterial({ color: '#f5f7f8', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.22, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    this._buildBase();
    this.board = new THREE.Group(); this.board.position.set(HINGE.x, HINGE.y, 0); this.group.add(this.board);
    this._buildBoard();
    this._buildSupport();
    this._buildGates();
    this._buildBells();
    this._buildTimer();
    this._buildDyn();
    this.lanes = LANES.map((z) => { const g = new THREE.Group(); g.position.z = z; this.board.add(g); const spin = new THREE.Group(); g.add(spin); return { g, spin, key: '' }; });
    this.angle = 0;
  }

  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── base, cerniera, goniometro ─────────────────────────────
  _buildBase() {
    const M = this.M, x0 = HINGE.x - 1.3, x1 = HINGE.x + 0.1;
    this._mesh(new RoundedBoxGeometry(x1 - x0, 0.03, 0.34, 3, 0.006).translate((x0 + x1) / 2, 0.015, 0), M.baseWood);
    for (const z of [-1, 1]) {
      this._mesh(new RoundedBoxGeometry(0.05, HINGE.y - 0.03 + 0.012, 0.008, 2, 0.002).translate(HINGE.x, 0.03 + (HINGE.y - 0.03) / 2, z * (BOARD.W / 2 + 0.009)), M.alu);
    }
    this._mesh(cyl(0.007, 0.007, BOARD.W + 0.04, 20).rotateX(Math.PI / 2).translate(HINGE.x, HINGE.y - BOARD.T / 2, 0), M.chrome);
    // goniometro di plexiglas fissato alla base, dietro la tavola: l'angolo si legge sul bordo superiore
    const q = new THREE.Mesh(new THREE.CircleGeometry(0.2, 96, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ map: protractorTexture(), transparent: true, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    q.position.set(HINGE.x, HINGE.y, -(BOARD.W / 2 + 0.012)); q.renderOrder = 5; q.userData.noAO = true;
    this.group.add(q);
    this._mesh(new THREE.BoxGeometry(0.03, HINGE.y - 0.03, 0.006).translate(HINGE.x - 0.015, 0.03 + (HINGE.y - 0.03) / 2, -(BOARD.W / 2 + 0.012)), M.alu);
  }

  // ───────────────────────────── tavola ─────────────────────────────
  _buildBoard() {
    const M = this.M, b = this.board, { L, W, T } = BOARD;
    const wood = M.wood.clone(); wood.map = M.wood.map.clone(); wood.map.repeat.set(1.2, 0.3); wood.map.needsUpdate = true;
    this._mesh(new RoundedBoxGeometry(L, T, W, 2, 0.003).translate(-L / 2, -T / 2, 0), wood, b);
    // bordi d'alluminio, divisorio fra le corsie, segno rosso per leggere l'angolo sul goniometro
    for (const s of [-1, 1]) this._mesh(new THREE.BoxGeometry(L, 0.016, 0.004).translate(-L / 2, 0.006, s * (W / 2 + 0.002)), M.alu, b);
    this._mesh(new THREE.BoxGeometry(0.22, 0.0025, 0.0015).translate(-0.11, 0.0005, -(W / 2 + 0.0045)), M.red, b);   // indice sul goniometro (dietro)
    // righello sul bordo anteriore
    // (nella trama lo 0 sta 20 px dal bordo sinistro e la corsa occupa 4096 − 40 px)
    const Wp = (RUN * 4096) / (4096 - 40);
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(Wp, 0.014), new THREE.MeshStandardMaterial({ map: rulerTexture(), roughness: 0.6 }));
    ruler.position.set(xs(0) - (20 / 4096) * Wp + Wp / 2, 0.006, W / 2 + 0.0042);
    ruler.receiveShadow = true; b.add(ruler);
    // fermi in cima, uno per corsia (si abbassano verso la cima quando si dà il via)
    this.stoppers = LANES.map((z) => {
      // cerniera poco sopra la tavola: abbassato, il fermo resta appoggiato sopra il legno
      const p = new THREE.Group(); p.position.set(xs(0) - 0.002, 0.0045, z); b.add(p);
      this._mesh(new RoundedBoxGeometry(0.004, 0.034, W - 0.014, 2, 0.0012).translate(-0.002, 0.017, 0), M.red, p);
      return p;
    });
    this._mesh(cyl(0.003, 0.003, W, 12).rotateX(Math.PI / 2).translate(xs(0) - 0.004, 0.0045, 0), M.chrome, b);
    // respingente di gomma in fondo, su una staffa
    this._mesh(new RoundedBoxGeometry(0.018, 0.034, W - 0.012, 2, 0.004).translate(-BOARD.end + 0.009, 0.017, 0), M.rubber, b);
    this._mesh(new THREE.BoxGeometry(0.006, 0.04, W).translate(-BOARD.end + 0.021, 0.02, 0), M.alu, b);
    // paletto per il dinamometro, in cima alla corsia A
    this._mesh(cyl(0.004, 0.004, 0.032, 12).translate(xs(DYN.anchor) - 0.004, 0.016, LANES[0]), M.chrome, b);
  }
  /** Inclinazione (rad): la tavola ruota sulla cerniera, la traversa del sostegno la segue. */
  setAngle(a) {
    this.angle = a;
    this.board.rotation.z = -a;
    const T = BOARD.T, xl = (SUPPORT.dx + T * Math.sin(a)) / Math.cos(a), yw = -xl * Math.sin(a) - T * Math.cos(a);
    this.support.position.y = HINGE.y + yw - 0.0065;
    this.board.updateMatrixWorld(true);
  }

  // ───────────────────────────── sostegno ─────────────────────────────
  _buildSupport() {
    const M = this.M, x = HINGE.x + SUPPORT.dx, z = SUPPORT.z;
    this._mesh(new RoundedBoxGeometry(0.2, 0.024, 0.16, 3, 0.007).translate(x - 0.05, 0.012, z - 0.03), M.iron);
    this._mesh(cyl(0.0085, 0.0085, SUPPORT.top - 0.024, 24).translate(x, (SUPPORT.top + 0.024) / 2, z), M.chrome);
    this._mesh(cyl(0.011, 0.011, 0.012, 24).translate(x, SUPPORT.top + 0.006, z), M.black);
    const g = new THREE.Group(); this.group.add(g); this.support = g;
    this._mesh(new RoundedBoxGeometry(0.032, 0.032, 0.032, 2, 0.004).translate(x, 0, z), M.boss, g);
    this._mesh(cyl(0.0045, 0.0045, 0.022, 12).rotateZ(Math.PI / 2).translate(x - 0.026, 0, z), M.chrome, g);
    this._mesh(cyl(0.009, 0.009, 0.006, 20).rotateZ(Math.PI / 2).translate(x - 0.04, 0, z), M.black, g);
    const len = -z + BOARD.W / 2 + 0.05;
    this._mesh(cyl(0.0065, 0.0065, len, 20).rotateX(Math.PI / 2).translate(x, 0, z + len / 2), M.chrome, g);
    this._mesh(cyl(0.009, 0.009, 0.012, 20).rotateX(Math.PI / 2).translate(x, 0, z + len), M.black, g);
  }

  // ───────────────────────────── fotocellule e cronometro ─────────────────────────────
  _buildGates() {
    const M = this.M, W = BOARD.W;
    this.gates = [0, 1].map(() => {
      const g = new THREE.Group(); this.board.add(g);
      for (const s of [-1, 1]) {
        this._mesh(new THREE.BoxGeometry(0.012, 0.085, 0.01).translate(0, 0.035, s * (W / 2 + 0.012)), M.black, g);
        this._mesh(new RoundedBoxGeometry(0.02, 0.016, 0.014, 2, 0.003).translate(0, BEAM_Y, s * (W / 2 + 0.016)), M.boss, g);
      }
      this._mesh(new THREE.BoxGeometry(0.012, 0.01, W + 0.034).translate(0, 0.082, 0), M.black, g);
      const beams = LANES.map((z) => {
        const m = new THREE.Mesh(cyl(0.0007, 0.0007, W - 0.008, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.8, toneMapped: false }));
        m.position.set(0, BEAM_Y, z); m.userData.noAO = true; m.userData.noOutline = true; g.add(m);
        return m;
      });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.003, 12, 8), new THREE.MeshBasicMaterial({ color: '#2fd06b' }));
      led.position.set(0, 0.09, W / 2 + 0.012); g.add(led);
      return { g, beams, led };
    });
  }
  setGates(on, list) {
    this.gates.forEach((G, i) => { G.g.visible = on && list[i] !== undefined; if (G.g.visible) G.g.position.x = xs(list[i]); });
  }
  /** Raggio interrotto (per corsia). */
  setGateLit(i, blocked) {
    const G = this.gates[i];
    G.beams.forEach((b, k) => { b.material.opacity = blocked[k] ? 0.2 : 0.8; });
    G.led.material.color.set(blocked.some(Boolean) ? '#ff3a24' : '#2fd06b');
  }
  _buildTimer() {
    const g = new THREE.Group(); g.position.set(HINGE.x + 0.11, 0, 0.28); g.rotation.y = -0.35; this.group.add(g);
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

  // ───────────────────────────── campanelli ─────────────────────────────
  _buildBells() {
    const M = this.M, W = BOARD.W, zA = LANES[0];
    const prof = [[0, 0.028], [0.004, 0.028], [0.007, 0.026], [0.009, 0.02], [0.011, 0.012], [0.0135, 0.004], [0.016, 0], [0.0148, 0], [0.0125, 0.004], [0.0098, 0.012], [0.0078, 0.02], [0.0058, 0.0255], [0, 0.0262]].map(([r, y]) => new THREE.Vector2(r, y));
    const bellGeo = new THREE.LatheGeometry(prof, 40);
    this.bells = [0, 1, 2, 3, 4].map(() => {
      const g = new THREE.Group(); this.board.add(g);
      this._mesh(cyl(0.0025, 0.0025, 0.11, 10).translate(0, 0.055, -(W / 2 + 0.012)), M.chrome, g);
      const armL = zA + W / 2 + 0.012;
      this._mesh(cyl(0.0022, 0.0022, armL, 10).rotateX(Math.PI / 2).translate(0, 0.108, -(W / 2 + 0.012) + armL / 2), M.chrome, g);
      // campanello e filo che la sfera tocca passando: oscillano attorno al punto d'appoggio
      const swing = new THREE.Group(); swing.position.set(0, 0.106, zA); g.add(swing);
      this._mesh(bellGeo, M.brass, swing).position.y = -0.03;
      this._mesh(cyl(0.0005, 0.0005, 0.058, 6).translate(0, -0.006 - 0.058 / 2 - 0.024, 0), M.wire, swing);
      this._mesh(new THREE.SphereGeometry(0.0022, 10, 8).translate(0, -0.088, 0), M.brass, swing);
      return { g, swing, amp: 0, ph: 0 };
    });
  }
  setBells(on, list) { this.bells.forEach((B, i) => { B.g.visible = on; if (on) B.g.position.x = xs(list[i]); }); }
  ringBell(i) { const B = this.bells[i]; B.amp = 0.5; B.ph = 0; }
  /** Oscillazione smorzata dei campanelli che hanno suonato. */
  update(dt) {
    for (const B of this.bells) {
      if (B.amp < 1e-3) { B.swing.rotation.z = 0; continue; }
      B.ph += dt * 18; B.amp *= Math.exp(-dt * 2.2);
      B.swing.rotation.z = B.amp * Math.sin(B.ph);           // la sfera spinge il filo in discesa (+x)
    }
  }

  // ───────────────────────────── dinamometro lungo il piano ─────────────────────────────
  _buildDyn() {
    const M = this.M, g = new THREE.Group();
    // costruito verticale (verso −y, come quello di Archimede) e girato lungo la discesa (+x)
    g.rotation.z = Math.PI / 2; g.position.set(xs(DYN.anchor), DYN.axis, LANES[0]);
    this.board.add(g); this.dynG = g;
    this._mesh(new THREE.TorusGeometry(0.0055, 0.0014, 8, 24).translate(0, -0.0055, 0), M.chrome, g);
    this._mesh(cyl(0.0148, 0.0148, 0.016, 32).translate(0, -0.019, 0), M.cap, g);
    const tube = this._mesh(cyl(0.0128, 0.0128, 0.236, 40, true).translate(0, -0.027 - 0.118, 0), this.tubeMat, g); tube.renderOrder = 5;
    this._mesh(cyl(0.0142, 0.0142, 0.01, 32).translate(0, -0.268, 0), M.cap, g);
    const arc = 1.5, sh = (DYN.travel * 1100) / 1000;
    this.scale = this._mesh(new THREE.CylinderGeometry(0.0131, 0.0131, sh, 24, 1, true, -arc / 2, arc), new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, alphaTest: 0.3, depthWrite: false }), g);
    this.scale.position.set(0, -DYN.rest + DYN.travel * 0.05 - sh / 2, 0); this.scale.renderOrder = 6; this.scale.castShadow = false;
    this.spring = this._mesh(new THREE.TubeGeometry(new Helix(0.0078, 22, SPRING0), 700, 0.00065, 5, false), M.wire, g);
    this.spring.position.y = -0.027;
    this.slider = new THREE.Group(); g.add(this.slider);
    this._mesh(cyl(0.0118, 0.0118, 0.0022, 32), M.red, this.slider);
    this._mesh(cyl(0.0024, 0.0024, DYN.len - DYN.rest - 0.006, 12).translate(0, -(DYN.len - DYN.rest - 0.006) / 2, 0), M.chrome, this.slider);
    this._mesh(new THREE.TorusGeometry(0.0045, 0.0013, 8, 20).translate(0, -(DYN.len - DYN.rest) - 0.002, 0), M.chrome, this.slider);
    this.stringBuf = new SegBuffer(2);
    const line = new LineSegments2(this.stringBuf.geometry(), new LineMaterial({ color: 0x2c2f35, linewidth: 1.6 }));
    line.frustumCulled = false; line.userData.noAO = true; this.group.add(line); this.stringLine = line;
    this.range = null;
  }
  setRange(range) {
    if (this.range === range) return;
    this.range = range; this.M.cap.color.set(range.color);
    const m = this.scale.material; if (m.map) m.map.dispose();
    m.map = dynScaleTexture(range); m.needsUpdate = true;
  }
  /** Dinamometro visibile, allungamento della molla, filo fino al gancio del corpo (s del suo retro). */
  setDyn(on, ext, sBack, hookY) {
    this.dynG.visible = on; this.stringLine.visible = on;
    if (!on) return;
    const e = Math.min(ext, DYN.travel * 1.04);
    this.slider.position.y = -DYN.rest - e;
    this.spring.scale.y = (SPRING0 + e) / SPRING0;
    const a = this.board.localToWorld(new THREE.Vector3(xs(DYN.anchor + DYN.len + e), DYN.axis, LANES[0]));
    const b = this.board.localToWorld(new THREE.Vector3(xs(sBack), hookY, LANES[0]));
    const c = new THREE.Color('#ffffff');
    this.stringBuf.reset(); this.stringBuf.push(a.x, a.y, a.z, b.x, b.y, b.z, c, 0, 0); this.stringBuf.commit();
  }

  // ───────────────────────────── corpi ─────────────────────────────
  /** Mette nella corsia i il corpo key (massa m: dischi d'acciaio da 100 g sul carrello o sul blocco). */
  setObject(i, key, m, surf, surfColor) {
    const Ln = this.lanes[i], id = `${key}|${m}|${surf}`;
    if (Ln.key === id) return;
    Ln.key = id;
    for (const c of [...Ln.spin.children]) { Ln.spin.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.own) { o.material.map?.dispose(); o.material.dispose(); } }); }
    const M = this.M, S = Ln.spin, own = (mesh) => { mesh.userData.own = true; return mesh; };
    S.position.set(0, 0, 0); S.rotation.set(0, 0, 0);
    const plates = (y0) => { const n = Math.round((m - 0.1) / 0.1); for (let k = 0; k < n; k++) this._mesh(new RoundedBoxGeometry(0.06, 0.0056, 0.044, 2, 0.0015).translate(0, y0 + 0.003 + k * 0.006, 0), M.steel, S); };
    const eye = (x, y) => this._mesh(new THREE.TorusGeometry(0.0035, 0.001, 6, 16).translate(x, y, 0), M.wire, S);
    if (key === 'cart') {
      this._mesh(new RoundedBoxGeometry(0.1, 0.02, 0.058, 2, 0.003).translate(0, 0.022, 0), new THREE.MeshStandardMaterial({ color: '#2a5fb8', metalness: 0.5, roughness: 0.4 }), S).userData.own = true;
      Ln.wheels = [];
      for (const x of [-0.034, 0.034]) for (const z of [-0.031, 0.031]) {
        const wg = new THREE.Group(); wg.position.set(x, 0.012, z); S.add(wg);
        this._mesh(cyl(0.012, 0.012, 0.007, 24).rotateX(Math.PI / 2), M.black, wg);
        this._mesh(cyl(0.004, 0.004, 0.0075, 12).rotateX(Math.PI / 2), M.chrome, wg);
        this._mesh(new THREE.BoxGeometry(0.004, 0.012, 0.0076), M.alu, wg);
        Ln.wheels.push(wg);
      }
      plates(0.032); eye(-0.052, 0.022); eye(0.052, 0.022);
      Ln.hookY = 0.022;
    } else {
      this._mesh(new RoundedBoxGeometry(0.08, 0.028, 0.06, 2, 0.002).translate(0, 0.016, 0), M.blockWood, S);
      if (surf !== 'wood') own(this._mesh(new THREE.BoxGeometry(0.079, 0.002, 0.059).translate(0, 0.001, 0), new THREE.MeshStandardMaterial({ color: surfColor, roughness: surf === 'ptfe' ? 0.3 : 0.95 }), S));
      plates(0.03); eye(-0.043, 0.015);
      Ln.hookY = 0.015; Ln.wheels = null;
    }
  }
  /** Posizione del corpo: bordo anteriore a s, centro mezzo ingombro più indietro; le ruote girano. */
  placeObject(i, s, len, phi, visible = true) {
    const Ln = this.lanes[i];
    Ln.g.visible = visible;
    if (!visible) return;
    Ln.g.position.x = xs(s) - len / 2;
    if (Ln.wheels) for (const w of Ln.wheels) w.rotation.z = -phi;
  }
  /** I fermi in cima: alzati (trattengono) o abbassati. */
  setStoppers(open) { this.stoppers.forEach((p, i) => { const t = open[i] ? Math.PI / 2 : 0; p.rotation.z += (t - p.rotation.z) * 0.35; }); }
  /** Punto della tavola (s, quota sopra il piano, corsia) nel mondo. */
  world(s, y, lane, out = new THREE.Vector3()) { return this.board.localToWorld(out.set(xs(s), y, LANES[lane])); }
}
