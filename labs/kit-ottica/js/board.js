// board.js — la lavagna bianca su un cavalletto con le ruote, il foglio A3 con il goniometro tenuto da quattro
// magneti, il laser magnetico a più raggi, i pezzi del kit (acrilico trasparente o specchi) e le manopole per
// ruotarli. Tutto in metri. Sulla lavagna: u verso destra, v verso l'alto, origine al centro del goniometro;
// la superficie della lavagna è il piano z = 0 del mondo, centrata in (0, CY).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { THICK } from './shapes.js';

export const CY = 1.25;                       // altezza del centro della lavagna
export const BOARD = { w: 1.2, h: 0.8 };
export const PAPER = { w: 0.42, h: 0.297 };
export const Z_PIECE = 0.0006, Z_BEAM = 0.0009;
export const PROTRACTOR_R = 0.12;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

/** Il foglio goniometrico: quadretti di 1 cm, il goniometro di raggio 12 cm, gli angoli contati dalla normale. */
function protractorTexture() {
  const W = 4096, H = Math.round((W * PAPER.h) / PAPER.w), px = W / (PAPER.w * 1000);   // pixel per mm
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, X = (mm) => cx + mm * px, Y = (mm) => cy - mm * px;
    // quadretti
    for (let mm = -210; mm <= 210; mm += 10) {
      g.strokeStyle = mm % 50 === 0 ? 'rgba(60,110,170,0.26)' : 'rgba(60,110,170,0.12)'; g.lineWidth = mm % 50 === 0 ? 2.4 : 1.4;
      g.beginPath(); g.moveTo(X(mm), 0); g.lineTo(X(mm), H); g.stroke();
    }
    for (let mm = -150; mm <= 150; mm += 10) {
      g.strokeStyle = mm % 50 === 0 ? 'rgba(60,110,170,0.26)' : 'rgba(60,110,170,0.12)'; g.lineWidth = mm % 50 === 0 ? 2.4 : 1.4;
      g.beginPath(); g.moveTo(0, Y(mm)); g.lineTo(W, Y(mm)); g.stroke();
    }
    // disco del goniometro, appena più chiaro
    const R = PROTRACTOR_R * 1000;
    g.fillStyle = 'rgba(255,255,255,0.72)'; g.beginPath(); g.arc(cx, cy, R * px, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1b1d22'; g.lineWidth = 3.2; g.beginPath(); g.arc(cx, cy, R * px, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, (R - 16) * px, 0, Math.PI * 2); g.stroke();
    // tacche ogni grado, numeri ogni 10°: angoli misurati dalla normale (la retta orizzontale)
    g.fillStyle = '#1b1d22'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 360; d++) {
      const a = (d * Math.PI) / 180, len = d % 10 === 0 ? 11 : d % 5 === 0 ? 7 : 4;
      g.strokeStyle = '#1b1d22'; g.lineWidth = d % 10 === 0 ? 3 : 1.8;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R * px, cy - Math.sin(a) * R * px); g.lineTo(cx + Math.cos(a) * (R - len) * px, cy - Math.sin(a) * (R - len) * px); g.stroke();
      if (d % 10 === 0) {
        const v = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d;
        g.save(); g.translate(cx + Math.cos(a) * (R - 23) * px, cy - Math.sin(a) * (R - 23) * px); g.rotate(-a + Math.PI / 2);
        g.font = `600 ${v === 0 || v === 90 ? 64 : 52}px ${MONO}`; g.fillStyle = v === 0 ? '#c2331d' : '#1b1d22';
        g.fillText(String(v), 0, 0); g.restore();
      }
    }
    // la normale (orizzontale, tratteggiata) e la superficie di separazione (verticale)
    g.strokeStyle = '#c2331d'; g.lineWidth = 3; g.setLineDash([26, 16]);
    g.beginPath(); g.moveTo(X(-R + 2), cy); g.lineTo(X(R - 2), cy); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#1b1d22'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(cx, Y(R - 2)); g.lineTo(cx, Y(-R + 2)); g.stroke();
    g.beginPath(); g.arc(cx, cy, 2.2 * px, 0, Math.PI * 2); g.stroke();
    g.font = `500 40px ${MONO}`; g.fillStyle = '#c2331d'; g.textAlign = 'left';
    g.fillText('NORMALE', X(R + 6), cy - 26);
    g.fillStyle = '#1b1d22'; g.save(); g.translate(cx + 30, Y(R + 8)); g.fillText('SUPERFICIE', 0, 0); g.restore();
    // intestazione
    g.font = `600 58px ${FONT}`; g.fillStyle = '#1b1d22'; g.textAlign = 'left';
    g.fillText('Foglio goniometrico', X(-178), Y(136));
    g.font = `500 38px ${MONO}`; g.fillStyle = '#5a6270';
    g.fillText('quadretti di 1 cm · angoli dalla normale', X(-178), Y(127));
  }, { aniso: 16 });
}

function laserLabel() {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = '#1e2126'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c41a'; g.fillRect(0, 0, 24, h);
    g.fillStyle = '#f4f5f7'; g.font = `700 92px ${FONT}`; g.textBaseline = 'middle';
    g.fillText('LASER', 70, h / 2 - 30);
    g.font = `500 44px ${MONO}`; g.fillStyle = '#b9c0ca';
    g.fillText('1 · 3 · 5 raggi  ·  < 1 mW', 72, h / 2 + 52);
  });
}

export class Board {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'lavagna';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      white: new THREE.MeshPhysicalMaterial({ color: '#f6f7f8', roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18, emissive: '#ffffff', emissiveIntensity: 0.1 }),
      edge: new THREE.MeshPhysicalMaterial({ color: '#e4f3f6', roughness: 0.18, metalness: 0, transparent: true, opacity: 0.62, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
      alu: std({ color: '#c9ccd0', metalness: 1, roughness: 0.32 }),
      grey: std({ color: '#3a3f47', metalness: 0.4, roughness: 0.5 }),
      black: std({ color: '#121417', metalness: 0.3, roughness: 0.55 }),
      rubber: std({ color: '#151515', metalness: 0, roughness: 0.9 }),
      plastic: std({ color: '#2a2e35', metalness: 0.1, roughness: 0.45 }),
      chrome: std({ color: '#f1f3f5', metalness: 1, roughness: 0.04 }),
      acrylic: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.03, transmission: 1, thickness: THICK, ior: 1.49, attenuationColor: new THREE.Color('#d8eef2'), attenuationDistance: 0.25, specularIntensity: 1 }),
    };
    this._buildStand();
    this._buildPaper();
    this.laser = this._buildLaser();
    this.board.add(this.laser);
    this.pieces = new THREE.Group(); this.board.add(this.pieces);
    this.knob = this._buildKnob(); this.board.add(this.knob);
  }

  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── cavalletto e lavagna ─────────────────────────────
  _buildStand() {
    const M = this.M, { w, h } = BOARD;
    this.board = new THREE.Group(); this.board.position.y = CY; this.group.add(this.board);
    // la lastra bianca (fronte a z = 0) e la cornice d'alluminio
    this._mesh(new RoundedBoxGeometry(w, h, 0.018, 2, 0.003).translate(0, 0, -0.009), M.white, this.board);
    const f = 0.024, d = 0.03;
    for (const s of [-1, 1]) {
      this._mesh(new RoundedBoxGeometry(w + 2 * f, f, d, 2, 0.005).translate(0, s * (h / 2 + f / 2), -0.012), M.alu, this.board);
      this._mesh(new RoundedBoxGeometry(f, h + 2 * f, d, 2, 0.005).translate(s * (w / 2 + f / 2), 0, -0.012), M.alu, this.board);
      for (const t of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.03, 0.03, 0.034, 2, 0.006).translate(s * (w / 2 + f / 2), t * (h / 2 + f / 2), -0.012), M.grey, this.board);
    }
    // vaschetta dei pennarelli
    this._mesh(new RoundedBoxGeometry(0.5, 0.012, 0.06, 2, 0.004).translate(0, -h / 2 - f - 0.004, 0.012), M.alu, this.board);
    this._mesh(new RoundedBoxGeometry(0.5, 0.02, 0.006, 2, 0.002).translate(0, -h / 2 - f + 0.006, 0.04), M.alu, this.board);
    const marker = (x, col) => {
      const g = new THREE.Group(); g.position.set(x, -h / 2 - f + 0.012, 0.02); this.board.add(g);
      this._mesh(cyl(0.008, 0.008, 0.11, 20).rotateZ(Math.PI / 2), M.white, g);
      this._mesh(cyl(0.0085, 0.0085, 0.035, 20).rotateZ(Math.PI / 2).translate(0.07, 0, 0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }), g);
    };
    marker(-0.12, '#1b1d22'); marker(0.05, '#c2331d');
    // il cavalletto: due montanti su piedi a T con le ruote, una traversa in basso
    const top = CY + h / 2 + f + 0.06, X = w / 2 + f + 0.025;
    for (const s of [-1, 1]) {
      this._mesh(new RoundedBoxGeometry(0.035, top - 0.09, 0.035, 2, 0.006).translate(s * X, (top + 0.09) / 2, -0.04), M.alu);
      this._mesh(new RoundedBoxGeometry(0.06, 0.04, 0.62, 2, 0.008).translate(s * X, 0.07, -0.04), M.grey);
      for (const z of [-0.33, 0.25]) {
        this._mesh(cyl(0.026, 0.026, 0.022, 24).rotateZ(Math.PI / 2).translate(s * X, 0.026, z), M.rubber);
        this._mesh(new RoundedBoxGeometry(0.03, 0.03, 0.03, 2, 0.004).translate(s * X, 0.052, z), M.black);
      }
      for (const t of [-1, 1]) this._mesh(new RoundedBoxGeometry(0.05, 0.05, 0.03, 2, 0.006).translate(s * X, CY + t * (h / 2 + f / 2), -0.04), M.grey);
    }
    this._mesh(new RoundedBoxGeometry(2 * X, 0.03, 0.03, 2, 0.006).translate(0, 0.32, -0.04), M.alu);
  }

  _buildPaper() {
    const M = this.M;
    const tex = protractorTexture();
    this.paperMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(PAPER.w, PAPER.h), this.paperMat);
    p.position.z = 0.0003; p.receiveShadow = true; this.board.add(p);
    // quattro magneti agli angoli
    ['#c2331d', '#2c67dc', '#1f9d55', '#d99a12'].forEach((col, i) => {
      const x = (i % 2 ? 1 : -1) * (PAPER.w / 2 - 0.012), y = (i < 2 ? 1 : -1) * (PAPER.h / 2 - 0.012);
      const m = this._mesh(cyl(0.011, 0.012, 0.007, 32).rotateX(Math.PI / 2).translate(x, y, 0.0036), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1 }), this.board);
      m.userData.noOutline = true;
    });
    void M;
  }

  // ───────────────────────────── laser ─────────────────────────────
  /** Il laser: l'uscita dei raggi è l'origine del gruppo, i raggi vanno verso +x; il corpo sta dietro. */
  _buildLaser() {
    const M = this.M, g = new THREE.Group();
    const L = 0.13, Wy = 0.072, Hz = 0.026;
    const body = this._mesh(new RoundedBoxGeometry(L, Wy, Hz, 3, 0.006).translate(-L / 2 - 0.004, 0, Hz / 2 + 0.0004), M.plastic, g);
    body.userData.pick = 'laser';
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.0225), new THREE.MeshStandardMaterial({ map: laserLabel(), roughness: 0.5 }));
    label.position.set(-0.075, 0, Hz + 0.0006); g.add(label);
    // frontale con le feritoie
    this._mesh(new RoundedBoxGeometry(0.008, Wy + 0.004, Hz + 0.003, 2, 0.002).translate(-0.004, 0, Hz / 2 + 0.0004), M.black, g).userData.pick = 'laser';
    this.slitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.15), toneMapped: false });
    this.slits = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.0022, 0.0035).rotateY(Math.PI / 2), this.slitMat);
      s.position.set(0.0001, 0, 0.0035); g.add(s); this.slits.push(s);
    }
    // interruttore e spia
    this._mesh(new RoundedBoxGeometry(0.014, 0.01, 0.006, 2, 0.002).translate(-0.115, 0.022, Hz + 0.002), M.black, g);
    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 3, 0.4), toneMapped: false });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.0022, 16, 10).translate(-0.115, -0.022, Hz + 0.0008), this.ledMat));
    return g;
  }

  /** Una lavagna e un foglio bianchi restano bianchi: un poco di luce propria, che segue la luce della stanza. */
  setAmbient(a) { this.M.white.emissiveIntensity = 0.32 * a; this.paperMat.emissiveIntensity = 0.38 * a; }

  /** Posiziona il laser (u, v, angolo) e mostra le feritoie accese. offsets: posizioni dei raggi lungo la feritoia (m). */
  setLaser(u, v, phi, offsets, rgb) {
    this.laser.position.set(u, v, 0); this.laser.rotation.z = phi;
    this.slits.forEach((s, i) => { s.visible = i < offsets.length; if (s.visible) s.position.y = offsets[i]; });
    this.slitMat.color.setRGB(rgb[0] * 3, rgb[1] * 3, rgb[2] * 3);
  }

  // ───────────────────────────── pezzi del kit ─────────────────────────────
  /** Una THREE.Shape dal contorno del pezzo (segmenti e archi). */
  static shapeOf(edges) {
    const s = new THREE.Shape();
    edges.forEach((e, i) => {
      const st = e.type === 'seg' ? e.a : [e.c[0] + e.r * Math.cos(e.s), e.c[1] + e.r * Math.sin(e.s)];
      if (i === 0) s.moveTo(st[0], st[1]);
      if (e.type === 'seg') s.lineTo(e.b[0], e.b[1]);
      else s.absarc(e.c[0], e.c[1], e.r, e.s, e.e, !e.ccw);
    });
    return s;
  }

  /** Il pezzo in 3D: acrilico estruso, oppure corpo grigio con la faccia a specchio cromata. */
  makePiece(def) {
    const g = new THREE.Group();
    const ex = (shape, mat, z0 = Z_PIECE, h = THICK, bevel = 0.0005) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 96 });
      geo.translate(0, 0, z0 + bevel);
      const m = this._mesh(geo, mat, g, !def.medium);
      return m;
    };
    if (def.medium) {
      // facce di sopra e di sotto trasparenti, fianchi lucidi che prendono la luce (come i bordi dell'acrilico)
      ex(Board.shapeOf(def.edges), [this.M.acrylic, this.M.edge]);
    } else {
      ex(Board.shapeOf(def.edges), this.M.plastic);
      // la faccia lucida: una lamina sottile lungo il lato che riflette
      const e = def.edges.find((q) => q.kind === 'mirror');
      let band;
      if (e.type === 'seg') band = new THREE.Shape([new THREE.Vector2(e.a[0], e.a[1]), new THREE.Vector2(e.b[0], e.b[1]), new THREE.Vector2(e.b[0] + 0.0012, e.b[1]), new THREE.Vector2(e.a[0] + 0.0012, e.a[1])]);
      else {
        const dr = def.c > 0 ? 0.0012 : -0.0012;
        band = new THREE.Shape(); band.absarc(e.c[0], e.c[1], e.r, e.s, e.e, !e.ccw); band.absarc(e.c[0], e.c[1], e.r + dr, e.e, e.s, e.ccw);
      }
      ex(band, this.M.chrome, Z_PIECE + 0.0002, THICK + 0.0004, 0.0001);
    }
    g.traverse((o) => { if (o.isMesh) o.userData.pick = 'piece'; });
    return g;
  }

  // ───────────────────────────── manopola per ruotare ─────────────────────────────
  _buildKnob() {
    const g = new THREE.Group(); g.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({ color: '#e8452c', transparent: true, opacity: 0.55, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.0995, 0.1005, 128), ringMat);
    this.ring.position.z = 0.0007; this.ring.userData.noOutline = true; g.add(this.ring);
    this.handle = new THREE.Group(); g.add(this.handle);
    const h = this._mesh(cyl(0.0085, 0.0085, 0.008, 32).rotateX(Math.PI / 2).translate(0, 0, 0.0045), new THREE.MeshStandardMaterial({ color: '#e8452c', roughness: 0.35 }), this.handle);
    h.userData.pick = 'knob';
    this._mesh(cyl(0.004, 0.004, 0.0085, 24).rotateX(Math.PI / 2).translate(0, 0, 0.005), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), this.handle).userData.pick = 'knob';
    return g;
  }
  /** Manopola attorno al punto (u, v), sul cerchio di raggio rho, all'angolo a. */
  setKnob(on, u, v, rho, a) {
    this.knob.visible = on;
    if (!on) return;
    this.knob.position.set(u, v, 0);
    this.ring.scale.setScalar(rho / 0.1);
    this.handle.position.set(rho * Math.cos(a), rho * Math.sin(a), 0);
  }
}
