// rig.js — l'apparato: piedistallo con motore, piattaforma rotante a cuscino d'aria, bracci con sensore
// di forza, dischi con masse a fessura, fotocellula su un'asta, lampada e schermo per l'ombra, centralina.
// Unità: metri. La piattaforma ruota attorno all'asse y passante per l'origine.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { revolveX, canvasTexture } from '../../../shared/js/geo.js';
import { DISC_R, DISC_Y, PUCK_R } from './circ.js';

export const ARM_Y = DISC_Y + 0.062;           // quota dei bracci
export const GATE = { z: -0.98, y: 0.98 };     // asta della fotocellula, dietro la piattaforma
export const SCREEN_X = -1.2, LAMP_X = 2.05;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const TWO_PI = Math.PI * 2;
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const lathe = (pts, seg = 64, crease = 0.5) => revolveX(pts.map(([r, y]) => [y, r]), seg, crease).rotateZ(Math.PI / 2);
const WEIGHT_H = 0.0022, PUCK_H = 0.022;

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    alu: std({ color: '#c9ccd0', metalness: 1, roughness: 0.3 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    black: std({ color: '#0e0f11', metalness: 0.7, roughness: 0.4 }),
    satin: std({ color: '#1d1f23', metalness: 0.6, roughness: 0.5 }),
    cast: std({ color: '#262c35', metalness: 0.5, roughness: 0.5 }),
    rubber: std({ color: '#121314', metalness: 0, roughness: 0.9 }),
    brass: std({ color: '#c9a24e', metalness: 1, roughness: 0.3 }),
    white: std({ color: '#f1f2f3', metalness: 0, roughness: 0.55 }),
    board: std({ color: '#d9dbde', metalness: 0, roughness: 0.7 }),
    enamel: std({ color: '#27303a', metalness: 0.35, roughness: 0.42 }),
  };
}

function discTexture() {
  const S = 2048, c = S / 2, px = S / (2 * DISC_R);            // pixel per metro
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#eef0f2'; g.fillRect(0, 0, S, S);
    // fori del cuscino d'aria
    g.fillStyle = 'rgba(40,46,56,0.22)';
    const step = 0.025 * px;
    for (let y = c % step; y < S; y += step) for (let x = c % step; x < S; x += step) {
      if (Math.hypot(x - c, y - c) < (DISC_R - 0.02) * px && Math.hypot(x - c, y - c) > 0.07 * px) { g.beginPath(); g.arc(x, y, 1.6, 0, TWO_PI); g.fill(); }
    }
    // cerchi ogni 5 cm, più marcati ogni 10 cm
    for (let r = 0.05; r < DISC_R - 0.01; r += 0.05) {
      const major = Math.round(r * 100) % 10 === 0;
      g.strokeStyle = major ? 'rgba(30,36,44,0.55)' : 'rgba(30,36,44,0.22)'; g.lineWidth = major ? 3 : 1.6;
      g.beginPath(); g.arc(c, c, r * px, 0, TWO_PI); g.stroke();
    }
    // raggi ogni 30°
    g.strokeStyle = 'rgba(30,36,44,0.22)'; g.lineWidth = 1.6;
    for (let d = 0; d < 360; d += 30) { const a = (d * Math.PI) / 180; g.beginPath(); g.moveTo(c + 0.05 * px * Math.cos(a), c - 0.05 * px * Math.sin(a)); g.lineTo(c + (DISC_R - 0.03) * px * Math.cos(a), c - (DISC_R - 0.03) * px * Math.sin(a)); g.stroke(); }
    // bordo graduato in gradi
    g.fillStyle = '#20252c'; g.beginPath(); g.arc(c, c, DISC_R * px, 0, TWO_PI); g.arc(c, c, (DISC_R - 0.028) * px, 0, TWO_PI, true); g.fill();
    g.strokeStyle = '#eef0f2'; g.lineWidth = 2.4;
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180, r0 = (DISC_R - 0.028) * px, r1 = r0 + (d % 30 === 0 ? 0.016 : 0.009) * px;
      g.beginPath(); g.moveTo(c + r0 * Math.cos(a), c - r0 * Math.sin(a)); g.lineTo(c + r1 * Math.cos(a), c - r1 * Math.sin(a)); g.stroke();
    }
    // etichette dei raggi lungo la direzione 15°
    g.fillStyle = 'rgba(30,36,44,0.75)'; g.font = `600 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const la = (15 * Math.PI) / 180;
    for (let r = 0.1; r < DISC_R - 0.05; r += 0.1) g.fillText(`${Math.round(r * 100)} cm`, c + r * px * Math.cos(la) + 24, c - r * px * Math.sin(la) - 14);
  }, { aniso: 16 });
}

function screenTexture() {
  const W = 2048, H = 704, span = 1.6, px = W / span;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(40,46,56,0.1)'; g.lineWidth = 1.5;
    for (let cm = -80; cm <= 80; cm += 10) { const x = W / 2 + (cm / 100) * px; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.fillStyle = '#23272e'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = `500 26px ${MONO}`;
    for (let cm = -80; cm <= 80; cm++) {
      const x = W / 2 + (cm / 100) * px, len = cm % 10 === 0 ? 40 : cm % 5 === 0 ? 26 : 14;
      g.fillRect(x - 1, H - len, 2, len);
      if (cm % 10 === 0 && Math.abs(cm) < 80) g.fillText(String(cm), x, H - 46);
    }
    g.textAlign = 'right'; g.fillText('cm', W - 12, H - 86);
  }, { aniso: 16 });
}

function silhouetteTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.filter = 'blur(6px)';
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(24, 24, w - 48, h - 48);
    g.filter = 'none';
  }, { srgb: false });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'apparato';
    this.M = materials();
    this.dragTargets = [];
    this._buildPedestal();
    this.disc = new THREE.Group();
    this.group.add(this.disc);
    this._buildDisc();
    this.arms = new THREE.Group();
    this.disc.add(this.arms);
    this._buildGate();
    this._buildLampScreen();
    this._buildController();
    this.pucks = {};
  }

  _mesh(geo, mat, parent, drag) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    if (drag) { m.userData.drag = drag; this.dragTargets.push(m); }
    (parent || this.group).add(m);
    return m;
  }

  _buildPedestal() {
    const M = this.M;
    this._mesh(lathe([[0, 0], [0.3, 0], [0.31, 0.012], [0.3, 0.035], [0.12, 0.05], [0, 0.05]], 72), M.cast);
    this._mesh(cyl(0.055, 0.065, 0.62, 40).translate(0, 0.05 + 0.31, 0), M.satin);
    this._mesh(lathe([[0, 0.66], [0.15, 0.66], [0.155, 0.672], [0.155, 0.742], [0.15, DISC_Y - 0.034], [0, DISC_Y - 0.034]], 72), M.enamel);
    this._mesh(cyl(0.03, 0.03, 0.026, 32).translate(0, DISC_Y - 0.021, 0), M.chrome);
    for (let k = 0; k < 6; k++) { const a = (TWO_PI * k) / 6; this._mesh(cyl(0.006, 0.006, 0.004, 12).rotateZ(Math.PI / 2).rotateY(-a).translate(0.156 * Math.cos(a), 0.71, -0.156 * Math.sin(a)), M.chrome); }
    // targhetta del motore
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.032), new THREE.MeshStandardMaterial({
      map: canvasTexture(400, 128, (g, w, h) => { g.fillStyle = '#d8dadd'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181b'; g.font = `700 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MOTORE', w / 2, h / 2 - 12); g.font = `500 26px ${MONO}`; g.fillText('0–120 giri/min', w / 2, h / 2 + 30); }),
      roughness: 0.5, metalness: 0.4,
    }));
    plate.position.set(0, 0.707, 0.1555); plate.receiveShadow = true;
    this.group.add(plate);
  }

  _buildDisc() {
    const M = this.M, d = this.disc;
    this._mesh(cyl(DISC_R, DISC_R, 0.02, 128).translate(0, DISC_Y - 0.01, 0), M.satin, d);
    const top = new THREE.Mesh(new THREE.CircleGeometry(DISC_R, 128).rotateX(-Math.PI / 2).translate(0, DISC_Y + 0.0004, 0), new THREE.MeshStandardMaterial({ map: discTexture(), roughness: 0.38, metalness: 0.05 }));
    top.receiveShadow = true;
    d.add(top);
    this._mesh(lathe([[0, DISC_Y], [0.05, DISC_Y], [0.05, DISC_Y + 0.07], [0.044, DISC_Y + 0.08], [0, DISC_Y + 0.08]], 48), M.black, d);
    this._mesh(cyl(0.02, 0.02, 0.006, 32).translate(0, DISC_Y + 0.083, 0), M.chrome, d);
  }

  /** Bracci: [{phi, r, color}] (angolo nel riferimento della piattaforma, raggio del disco portato). */
  setArms(list) {
    const M = this.M, a = this.arms;
    for (const c of [...a.children]) { a.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.sensorPos = [];
    for (const o of list) {
      const g = new THREE.Group();
      g.rotation.y = o.phi;
      const L = o.r - 0.05;
      this._mesh(new RoundedBoxGeometry(L, 0.012, 0.012, 2, 0.002).translate(0.05 + L / 2, ARM_Y, 0), M.alu, g);
      // sensore di forza vicino al mozzo, con un anello del colore del disco
      this._mesh(cyl(0.012, 0.012, 0.06, 28).rotateZ(Math.PI / 2).translate(0.11, ARM_Y, 0), M.black, g);
      this._mesh(cyl(0.0125, 0.0125, 0.008, 28).rotateZ(Math.PI / 2).translate(0.125, ARM_Y, 0), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.45 }), g);
      // morsetto all'estremità, attorno al perno del disco
      this._mesh(new RoundedBoxGeometry(0.026, 0.014, 0.03, 2, 0.003).translate(o.r, ARM_Y, 0), M.black, g);
      a.add(g);
      this.sensorPos.push(0.11);
    }
  }

  /** Dischi: [{key, m, color}]. Un disco base da 50 g più masse a fessura da 50 g. */
  setPucks(list) {
    const M = this.M;
    for (const k of Object.keys(this.pucks)) { const p = this.pucks[k]; this.group.remove(p.group); p.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); delete this.pucks[k]; }
    for (const o of list) {
      const g = new THREE.Group(), inner = new THREE.Group();
      g.add(inner);
      const top = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.4, metalness: 0.1 });
      this._mesh(lathe([[0, 0.001], [PUCK_R - 0.002, 0.001], [PUCK_R, 0.004], [PUCK_R, 0.014], [PUCK_R - 0.004, PUCK_H], [0, PUCK_H]], 56), M.white, inner);
      this._mesh(cyl(PUCK_R - 0.006, PUCK_R - 0.006, 0.002, 48).translate(0, PUCK_H + 0.0005, 0), top, inner);
      this._mesh(cyl(0.004, 0.004, 0.055, 16).translate(0, PUCK_H + 0.0275, 0), M.chrome, inner);
      const n = Math.max(0, Math.round((o.m - 0.05) / 0.05));
      const ws = [];
      for (let i = 0; i < n; i++) {
        const y = PUCK_H + 0.001 + i * (WEIGHT_H + 0.0003);
        ws.push(lathe([[0.0048, y], [0.026, y], [0.026, y + WEIGHT_H], [0.0048, y + WEIGHT_H]], 40));
      }
      if (ws.length) this._mesh(mergeGeometries(ws), M.brass, inner);
      this.group.add(g);
      this.pucks[o.key] = { group: g, inner, height: PUCK_H + 0.001 + n * (WEIGHT_H + 0.0003) };
    }
  }

  placePuck(key, p, spin) {
    const o = this.pucks[key];
    if (!o) return;
    o.group.position.set(p.x, p.y, p.z);
    o.inner.rotation.y = spin;
  }

  // ───────────────────────────── fotocellula ─────────────────────────────
  _buildGate() {
    const M = this.M, g = new THREE.Group();
    g.position.set(0, 0, GATE.z);
    this._mesh(lathe([[0, 0], [0.12, 0], [0.125, 0.01], [0.11, 0.025], [0.02, 0.03], [0, 0.03]], 48), M.cast, g);
    this._mesh(cyl(0.01, 0.01, GATE.y + 0.02, 24).translate(0, (GATE.y + 0.02) / 2, 0), M.alu, g);
    this._mesh(new RoundedBoxGeometry(0.04, 0.04, 0.04, 2, 0.005).translate(0, GATE.y, 0), M.black, g);
    this.gateArm = new THREE.Group();
    g.add(this.gateArm);
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.group.add(g);
    this.gateGroup = g;
  }

  /** Posiziona la fotocellula sopra il cerchio di raggio r (dietro la piattaforma, a θ = 90°). */
  setGate(r) {
    const M = this.M, a = this.gateArm;
    for (const c of [...a.children]) { a.remove(c); c.geometry.dispose(); }
    const L = -GATE.z - r;                                    // dall'asta al punto sopra il cerchio
    this._mesh(cyl(0.007, 0.007, L, 20).rotateX(Math.PI / 2).translate(0, GATE.y, L / 2), M.alu, a);
    this._mesh(new RoundedBoxGeometry(0.04, 0.03, 0.05, 2, 0.005).translate(0, GATE.y - 0.03, L), M.black, a);
    this._mesh(cyl(0.006, 0.006, 0.006, 16).translate(0, GATE.y - 0.048, L), new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2a12', emissiveIntensity: 1.2 }), a);
    const beamH = GATE.y - 0.05 - DISC_Y;
    const beam = new THREE.Mesh(cyl(0.0012, 0.0012, beamH, 8).translate(0, DISC_Y + beamH / 2, L), this.beamMat);
    beam.userData.noAO = true; beam.renderOrder = 6;
    a.add(beam);
    this.gateTip = new THREE.Vector3(0, GATE.y - 0.03, GATE.z + L);
  }
  setGateFlash(f) { this.beamMat.opacity = 0.35 + 0.65 * f; this.beamMat.color.setRGB(1, 0.19 + 0.5 * f, 0.12 + 0.4 * f); }

  // ───────────────────────────── lampada e schermo ─────────────────────────────
  _buildLampScreen() {
    const M = this.M;
    const lamp = new THREE.Group();
    lamp.position.set(LAMP_X, 0, 0);
    this._mesh(lathe([[0, 0], [0.13, 0], [0.135, 0.01], [0.12, 0.024], [0.02, 0.028], [0, 0.028]], 48), M.cast, lamp);
    this._mesh(cyl(0.01, 0.01, DISC_Y - 0.03, 20).translate(0, (DISC_Y - 0.03) / 2, 0), M.alu, lamp);
    this._mesh(new RoundedBoxGeometry(0.2, 0.12, 0.12, 3, 0.012).translate(0.03, DISC_Y + 0.04, 0), M.enamel, lamp);
    this._mesh(revolveX([[-0.13, 0.045], [-0.07, 0.045], [-0.07, 0.052], [-0.13, 0.052]], 40).translate(0, DISC_Y + 0.04, 0), M.black, lamp);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.044, 32).rotateY(-Math.PI / 2).translate(-0.131, DISC_Y + 0.04, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.6), fog: false }));
    lamp.add(glow);
    const screen = new THREE.Group();
    screen.position.set(SCREEN_X, 0, 0);
    const W = 1.6, H = 0.55, y0 = 0.6;
    this._mesh(new RoundedBoxGeometry(0.02, H + 0.03, W + 0.03, 2, 0.004).translate(-0.012, y0 + H / 2, 0), M.black, screen);
    // lo schermo guarda la lampada, non la luce principale: la luce della lampada è resa come emissione diffusa
    const sTex = screenTexture();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateY(Math.PI / 2).translate(0, y0 + H / 2, 0), new THREE.MeshStandardMaterial({ map: sTex, emissiveMap: sTex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.92 }));
    face.receiveShadow = true;
    screen.add(face);
    for (const z of [-0.7, 0.7]) {
      this._mesh(cyl(0.01, 0.01, y0, 16).translate(-0.012, y0 / 2, z), M.alu, screen);
      this._mesh(lathe([[0, 0], [0.09, 0], [0.09, 0.012], [0.015, 0.02], [0, 0.02]], 40).translate(-0.012, 0, z), M.cast, screen);
    }
    this.shadowMat = new THREE.MeshBasicMaterial({ map: silhouetteTexture(), color: '#000', transparent: true, opacity: 0.68, depthWrite: false, fog: false, toneMapped: false });
    this.shadows = new THREE.Group();
    screen.add(this.shadows);
    this.lamp = lamp; this.screen = screen;
    this.group.add(lamp, screen);
    this.screenRange = { y0, y1: y0 + H, z: W / 2 };
  }

  setShadowRig(on) { this.lamp.visible = on; this.screen.visible = on; }

  /** Ombre dei dischi sullo schermo (luce parallela lungo −x): la coordinata z del disco, la sua quota. */
  placeShadows(list) {
    const sh = this.shadows;
    while (sh.children.length < list.length) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), this.shadowMat); m.userData.noAO = true; m.renderOrder = 5; sh.add(m); }
    sh.children.forEach((m, i) => {
      const o = list[i];
      if (!o || o.y + o.h < this.screenRange.y0 || Math.abs(o.z) > this.screenRange.z + 0.05) { m.visible = false; return; }
      m.visible = true;
      m.position.set(0.0015, o.y + o.h / 2, o.z);
      m.scale.set(1, o.h * 1.25, 2 * PUCK_R * 1.18);
    });
  }

  // ───────────────────────────── centralina ─────────────────────────────
  _buildController() {
    const M = this.M, g = new THREE.Group();
    g.position.set(-0.62, 0, 0.62);
    g.rotation.y = 0.35;
    this._mesh(new RoundedBoxGeometry(0.24, 0.085, 0.14, 3, 0.012).translate(0, 0.046, 0), M.satin, g);
    this._mesh(cyl(0.016, 0.016, 0.012, 28).translate(0.085, 0.094, 0.02), M.black, g);
    this._mesh(cyl(0.008, 0.008, 0.006, 20).translate(-0.085, 0.092, 0.035), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.5 }), g);
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 640; this.lcdCanvas.height = 200;
    this.lcdTex = new THREE.CanvasTexture(this.lcdCanvas);
    this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false, fog: false }));
    lcd.position.set(0, 0.046, 0.0705);
    g.add(lcd);
    const tube = (pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, 0.0025, 8);
    this._mesh(tube([[-0.5, 0.03, 0.52], [-0.38, 0.004, 0.38], [-0.2, 0.004, 0.22], [-0.09, 0.04, 0.09], [-0.06, 0.1, 0.04]]), M.rubber);
    this.group.add(g);
    this.setDisplay(0, 0);
  }

  /** Display della centralina: giri al minuto e verso. */
  setDisplay(rpm, dir) {
    const txt = Math.abs(rpm).toFixed(1).replace('.', ',');
    const key = txt + dir;
    if (key === this._lcdKey) return;
    this._lcdKey = key;
    const c = this.lcdCanvas.getContext('2d'), W = c.canvas.width, H = c.canvas.height;
    c.fillStyle = '#060c08'; c.fillRect(0, 0, W, H);
    c.font = `600 116px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(60,255,120,0.08)'; c.fillText('888,8', W - 150, H / 2 + 6);
    c.shadowColor = 'rgba(60,255,120,0.8)'; c.shadowBlur = 16;
    c.fillStyle = '#5dff8c'; c.fillText(txt, W - 150, H / 2 + 6);
    c.shadowBlur = 0;
    c.font = `600 30px ${MONO}`; c.fillStyle = '#5dff8c'; c.textAlign = 'left';
    c.fillText('giri', W - 136, H / 2 - 12); c.fillText('/min', W - 136, H / 2 + 24);
    c.font = `600 40px ${MONO}`; c.textAlign = 'left';
    c.fillText(dir > 0 ? '↺' : dir < 0 ? '↻' : '', 22, H / 2 + 4);
    this.lcdTex.needsUpdate = true;
  }
}
