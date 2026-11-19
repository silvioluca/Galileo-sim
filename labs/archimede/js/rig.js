// rig.js — l'apparato: sostegno con morsetto, dinamometro a molla (tubo trasparente, molla, indice, scala), corpo
// appeso al filo, becher graduato su una bilancia elettronica, vaso a sfioro su un elevatore con il becherino di
// raccolta sulla bilancia, secchiello di Archimede con il suo cilindro.
// Unità: metri. Il dinamometro e il recipiente stanno sull'asse verticale x = HOOK_X, z = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { TRAVEL } from './hydro.js';

export const HOOK_X = 0.06;
export const ROD = { x: -0.16, z: -0.075, top: 1.02 };
export const DYN = { len: 0.30, rest: 0.10 };          // gancio del morsetto → gancio del dinamometro; indice a riposo
export const THREAD = 0.045, THREAD_ARCH = 0.012, EYE = 0.008;
export const BAL = { w: 0.17, d: 0.19, top: 0.064 };
export const BEAKER = { R: 0.051, wall: 0.0022, H: 0.145, bottom: 0.004, Vliq: 0.6e-3, ml: 1000 };
export const CAN = { R: 0.045, wall: 0.0022, H: 0.155, bottom: 0.004, spout: 0.13, jack: 0.09 };
export const CATCH = { R: 0.033, wall: 0.0018, H: 0.095, bottom: 0.003, dx: 0.155, ml: 250 };
export const BUCKET = { wall: 0.0015, bottom: 0.003, bail: 0.03, gap: 0.022, clear: 0.0006 };
const SPOUT = { len: 0.1, tilt: 0.44, r: 0.0055 };          // beccuccio: lunghezza, inclinazione sotto l'orizzontale
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);

/** Fondo interno, raggio interno, orlo e (vaso a sfioro) quota del beccuccio del recipiente sotto il dinamometro. */
export function vesselGeo(app) {
  if (app === 'overflow') { const y0 = CAN.jack + CAN.bottom; return { y0, R: CAN.R, rim: CAN.jack + CAN.H, spout: y0 + CAN.spout }; }
  const y0 = BAL.top + BEAKER.bottom;
  return { y0, R: BEAKER.R, rim: BAL.top + BEAKER.H, spout: null };
}
/** Secchiello per il cilindro S: raggio e altezza interni (il volume interno è quello del cilindro). */
export function bucketGeo(S) {
  const Ri = S.R + BUCKET.clear, Hi = S.V / (Math.PI * Ri * Ri);
  return { Ri, Hi, Ro: Ri + BUCKET.wall, Ho: Hi + BUCKET.bottom };
}
/** Massa del secchiello d'ottone (con il manico). */
export function bucketMass(S) { const b = bucketGeo(S); return 8500 * Math.PI * (b.Ro * b.Ro * b.Ho - b.Ri * b.Ri * b.Hi) + 0.004; }
/** Dal baricentro del corpo (o del cilindro) al punto d'aggancio sotto il dinamometro. */
export function attachOffset(app, S) {
  if (app !== 'arch') return S.half + EYE;
  return S.half + BUCKET.gap + bucketGeo(S).Ho + BUCKET.bail;
}

// ───────────────────────────── trame dipinte ─────────────────────────────
/** Scala graduata di un becher, da stampare su una fascia curva: tacche ogni `minor` mL, numeri ogni `major`. */
function gradTexture(ml, minor, major, hPx = 1024) {
  const W = 256, H = hPx;
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#1d232b'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const pad = 18, y = (v) => H - pad - ((H - 2 * pad) * v) / ml;
    for (let v = minor; v <= ml + 1e-6; v += minor) {
      const big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      g.fillRect(40, y(v) - (big ? 2.5 : 1.5), big ? 74 : 42, big ? 5 : 3);
      if (big) { g.font = `600 ${hPx > 600 ? 30 : 22}px ${FONT}`; g.fillText(String(Math.round(v)), 122, y(v)); }
    }
    g.font = `600 ${hPx > 600 ? 26 : 20}px ${FONT}`; g.fillText('ml', 122, y(ml) + (hPx > 600 ? 44 : 32));
  }, { aniso: 16 });
}
/** Scala del dinamometro: da 0 (in alto) alla portata, una tacca per divisione; numeri ogni 10 divisioni
 *  (ogni 5 se le divisioni sono poche), tacca media a metà. */
function dynScaleTexture(range) {
  const W = 160, H = 1100, top = 50, len = 1000;              // 1000 px = corsa a fondo scala
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);                                   // stampata sul tubo trasparente: solo i segni
    g.fillStyle = '#16191e'; g.textBaseline = 'middle'; g.textAlign = 'right';
    const n = Math.round(range.F / range.div), every = n > 60 ? 10 : 5;
    for (let i = 0; i <= n; i++) {
      const y = top + (i / n) * len, big = i % every === 0, mid = !big && i % (every / 2) === 0;
      g.fillRect(W - (big ? 62 : mid ? 44 : 28), y - (big ? 2.5 : 1.5), big ? 62 : mid ? 44 : 28, big ? 5 : 3);
      if (big) {
        const v = i * range.div, txt = v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
        g.font = `700 ${txt.length > 3 ? 30 : 36}px ${FONT}`; g.fillText(txt, W - 70, y);
      }
    }
    g.textAlign = 'center'; g.font = `700 34px ${FONT}`; g.fillText(`${range.F} N`, W / 2, 22);
  }, { aniso: 16 });
}
function woodTexture() {
  return canvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#caa06a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * W, w = 1 + Math.random() * 3.5;
      g.strokeStyle = `rgba(${110 + Math.random() * 30}, ${68 + Math.random() * 20}, 30, ${0.16 + Math.random() * 0.22})`; g.lineWidth = w;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= H; y += 16) g.lineTo(x + 6 * Math.sin(y / 37 + i), y);
      g.stroke();
    }
  }, { repeat: true });
}
function corkTexture() {
  return canvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#b4875a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const d = Math.random() < 0.5;
      g.fillStyle = d ? `rgba(92, 58, 30, ${0.25 + Math.random() * 0.4})` : `rgba(222, 186, 140, ${0.2 + Math.random() * 0.35})`;
      g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 0.6 + Math.random() * 2.2, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: true });
}

/** Elica lunga L verso il basso (la molla a riposo; allungata si scala in altezza). */
class Helix extends THREE.Curve {
  constructor(r, turns, L) { super(); this.r = r; this.turns = turns; this.L = L; }
  getPoint(t, out = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2; return out.set(this.r * Math.cos(a), -t * this.L, this.r * Math.sin(a)); }
}
const SPRING0 = DYN.rest - 0.027;                               // lunghezza della molla scarica

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'archimede';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      black: std({ color: '#141518', metalness: 0.4, roughness: 0.45 }),
      rubber: std({ color: '#1a1b1d', metalness: 0, roughness: 0.9 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      steel: std({ color: '#d3d6da', metalness: 1, roughness: 0.22 }),
      plastic: std({ color: '#eceae5', metalness: 0, roughness: 0.5 }),
      dark: std({ color: '#2a2d33', metalness: 0.1, roughness: 0.55 }),
      red: std({ color: '#d4301f', metalness: 0, roughness: 0.4 }),
      brass: std({ color: '#d4ae5d', metalness: 1, roughness: 0.24 }),
      wire: std({ color: '#c3c6ca', metalness: 1, roughness: 0.28 }),
      cap: std({ color: '#3aa458', metalness: 0, roughness: 0.4 }),
    };
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: '#eaf3f6', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide, depthWrite: false });
    this.tubeMat = new THREE.MeshPhysicalMaterial({ color: '#f5f7f8', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.2, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    // il liquido: trasmissione con assorbimento lungo lo spessore (indice ridotto: la rifrazione approssimata
    // della trasmissione esagererebbe l'effetto lente); il mercurio è un metallo liquido, uno specchio
    this.liqMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.1, ior: 1.1, attenuationColor: new THREE.Color('#cfe8f2'), attenuationDistance: 0.6, specularIntensity: 0.7 });
    this.hgMat = new THREE.MeshStandardMaterial({ color: '#d4d7db', metalness: 1, roughness: 0.07 });
    this.liquids = [];                                         // mesh del liquido, per cambiare materiale insieme
    this._buildStand();
    this._buildDyn();
    this._buildThread();
    this.bodyG = new THREE.Group(); this.group.add(this.bodyG);
    this.archG = new THREE.Group(); this.group.add(this.archG);
    this._buildBeaker();
    this._buildCan();
    this._buildBalance();
    this.range = null; this.liqKey = '';
  }

  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent && !mat.transmission; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }
  _liquid(geo, parent) { const m = this._mesh(geo, this.liqMat, parent); m.castShadow = false; m.userData.noOutline = true; this.liquids.push(m); return m; }

  // ───────────────────────────── sostegno e morsetto ─────────────────────────────
  _buildStand() {
    const M = this.M;
    // piede del sostegno a sinistra della bilancia, con l'asta verso il fondo
    this._mesh(new RoundedBoxGeometry(0.2, 0.024, 0.26, 3, 0.007).translate(-0.15, 0.012, 0), M.iron);
    for (const [x, z] of [[-0.235, -0.115], [-0.235, 0.115], [-0.065, -0.115], [-0.065, 0.115]]) this._mesh(cyl(0.011, 0.013, 0.005, 20).translate(x, 0, z), M.rubber);
    this._mesh(cyl(0.0085, 0.0085, ROD.top - 0.024, 24).translate(ROD.x, (ROD.top + 0.024) / 2, ROD.z), M.chrome);
    this._mesh(cyl(0.011, 0.011, 0.012, 24).translate(ROD.x, ROD.top + 0.006, ROD.z), M.black);
    // morsetto che scorre sull'asta: noce, vite, braccio fino all'asse del dinamometro, gancio
    const cl = new THREE.Group(); this.group.add(cl); this.clampG = cl;
    const ay = 0.022;
    this.boss = this._mesh(new RoundedBoxGeometry(0.032, 0.032, 0.032, 2, 0.004).translate(ROD.x, ay, ROD.z), M.boss, cl);
    this._mesh(cyl(0.0045, 0.0045, 0.022, 12).rotateZ(Math.PI / 2).translate(ROD.x - 0.026, ay, ROD.z), M.chrome, cl);
    this._mesh(cyl(0.009, 0.009, 0.006, 20).rotateZ(Math.PI / 2).translate(ROD.x - 0.04, ay, ROD.z), M.black, cl);
    const dx = HOOK_X - ROD.x, dz = -ROD.z, L = Math.hypot(dx, dz);
    this.arm = this._mesh(cyl(0.005, 0.005, L, 16).rotateZ(Math.PI / 2), M.chrome, cl);
    this.arm.position.set((ROD.x + HOOK_X) / 2, ay, ROD.z / 2); this.arm.rotation.y = Math.atan2(-dz, dx);
    this._mesh(new THREE.SphereGeometry(0.0062, 16, 12).translate(HOOK_X, ay, 0), M.chrome, cl);
    // gancio a J che scende dal braccio fino all'anello del dinamometro (y = 0 del morsetto)
    this._mesh(cyl(0.0016, 0.0016, ay - 0.006, 8).translate(HOOK_X, (ay + 0.006) / 2, 0), M.chrome, cl);
    this._mesh(new THREE.TorusGeometry(0.0045, 0.0016, 8, 20, Math.PI * 1.3).rotateZ(Math.PI * 1.1).translate(HOOK_X - 0.0045, 0.006, 0), M.chrome, cl);
  }
  setClamp(y) { this.clampG.position.y = y; }

  // ───────────────────────────── dinamometro ─────────────────────────────
  _buildDyn() {
    const M = this.M, g = new THREE.Group(); this.clampG.add(g); this.dynG = g;
    const x = HOOK_X;
    this._mesh(new THREE.TorusGeometry(0.0055, 0.0014, 8, 24).translate(x, -0.0055, 0), M.chrome, g);
    this.capTop = this._mesh(cyl(0.0148, 0.0148, 0.016, 32).translate(x, -0.019, 0), M.cap, g);
    this._mesh(cyl(0.006, 0.006, 0.006, 16).translate(x, -0.009, 0), M.chrome, g);
    this.tube = this._mesh(cyl(0.0128, 0.0128, 0.236, 40, true).translate(x, -0.027 - 0.118, 0), this.tubeMat, g);
    this.tube.renderOrder = 5;
    this.capBot = this._mesh(cyl(0.0142, 0.0142, 0.01, 32).translate(x, -0.268, 0), M.cap, g);
    // scala stampata sul davanti del tubo (fascia curva), da 0 alla portata lungo la corsa della molla
    const arc = 1.5, sh = (TRAVEL * 1100) / 1000;
    // (la trama è alta 1100 px: lo zero sta 50 px sotto il bordo, il fondo scala 1000 px più in basso)
    this.scale = this._mesh(new THREE.CylinderGeometry(0.0131, 0.0131, sh, 24, 1, true, -arc / 2, arc), new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, alphaTest: 0.3, depthWrite: false }), g);
    this.scale.position.set(x, -DYN.rest + TRAVEL * 0.05 - sh / 2, 0);
    this.scale.renderOrder = 6; this.scale.castShadow = false;
    // parti che scorrono con l'allungamento: molla, indice, asta interna, gancio
    this.spring = this._mesh(new THREE.TubeGeometry(new Helix(0.0078, 22, SPRING0), 700, 0.00065, 5, false), M.wire, g);
    this.spring.position.set(x, -0.027, 0);
    this.slider = new THREE.Group(); g.add(this.slider);
    this._mesh(cyl(0.0118, 0.0118, 0.0022, 32), M.red, this.slider).position.set(x, 0, 0);
    this._mesh(cyl(0.0024, 0.0024, DYN.len - DYN.rest - 0.006, 12).translate(x, -(DYN.len - DYN.rest - 0.006) / 2, 0), M.chrome, this.slider);
    this._mesh(new THREE.TorusGeometry(0.0052, 0.0015, 8, 24, Math.PI * 1.35).rotateZ(Math.PI * 0.95).translate(x + 0.0052, -(DYN.len - DYN.rest) + 0.0052, 0), M.chrome, this.slider);
    this.dynTargets = [this.tube, this.capTop, this.capBot];
  }
  /** Portata del dinamometro: colore dei tappi e scala. */
  setRange(range) {
    if (this.range === range) return;
    this.range = range;
    this.M.cap.color.set(range.color);
    const m = this.scale.material;
    if (m.map) m.map.dispose();
    m.map = dynScaleTexture(range); m.needsUpdate = true;
  }
  /** Allungamento della molla (m): indice, molla e gancio scendono. */
  setDyn(ext) {
    const e = Math.min(ext, TRAVEL * 1.04);
    this.slider.position.y = -DYN.rest - e;
    this.spring.scale.y = (SPRING0 + e) / SPRING0;
  }
  /** Quota del gancio del dinamometro (mondo). */
  hookY(clampY, ext) { return clampY - DYN.len - Math.min(ext, TRAVEL * 1.04); }

  // ───────────────────────────── filo ─────────────────────────────
  _buildThread() {
    this.threadBuf = new SegBuffer(48);
    const line = new LineSegments2(this.threadBuf.geometry(), new LineMaterial({ color: 0x2c2f35, linewidth: 1.6, worldUnits: false }));
    line.frustumCulled = false; line.userData.noAO = true;
    this.group.add(line);
    this._white = new THREE.Color('#ffffff');
  }
  /** Filo dal gancio al punto d'aggancio: teso (dritto), lento (curvo di lato) o tagliato (un pezzo che pende). */
  setThread(hook, attach, length, cut) {
    const B = this.threadBuf, c = this._white;
    B.reset();
    if (cut) {
      B.push(hook.x, hook.y, hook.z, hook.x + 0.003, hook.y - 0.03, hook.z, c, 0, 0.03);
    } else {
      const d = hook.distanceTo(attach);
      const b = d < length ? Math.min(length / 2, Math.sqrt((3 * Math.max(d, 0.002) * (length - d)) / 8) * 1.2) : 0;
      const n = b > 0 ? 16 : 1;
      let px = hook.x, py = hook.y, pz = hook.z;
      for (let i = 1; i <= n; i++) {
        const t = i / n, s = 4 * t * (1 - t) * b;
        const x = hook.x + (attach.x - hook.x) * t + s, y = hook.y + (attach.y - hook.y) * t, z = hook.z + (attach.z - hook.z) * t + s * 0.4;
        B.push(px, py, pz, x, y, z, c, 0, 0);
        px = x; py = y; pz = z;
      }
    }
    B.commit();
  }

  // ───────────────────────────── materiali dei corpi ─────────────────────────────
  bodyMaterial(key) {
    const P = (o) => new THREE.MeshPhysicalMaterial(o);
    switch (key) {
      case 'alu': return P({ color: '#d4d7db', metalness: 1, roughness: 0.3 });
      case 'iron': return P({ color: '#6c7076', metalness: 0.9, roughness: 0.42 });
      case 'brass': return P({ color: '#d6b160', metalness: 1, roughness: 0.22 });
      case 'lead': return P({ color: '#7a7f88', metalness: 0.75, roughness: 0.55 });
      case 'glass': return P({ color: '#cfe4ea', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.5, clearcoat: 1 });
      case 'pvc': return P({ color: '#8e979f', metalness: 0, roughness: 0.42, clearcoat: 0.3 });
      case 'wood': return P({ map: woodTexture(), roughness: 0.72 });
      case 'ice': return P({ color: '#e6f4fa', metalness: 0, roughness: 0.16, transparent: true, opacity: 0.62, clearcoat: 1 });
      case 'cork': return P({ map: corkTexture(), roughness: 0.95 });
      default: return P({ color: '#cccccc' });
    }
  }
  _shapeGeo(S) {
    if (S.kind === 'cyl') return cyl(S.R, S.R, S.H, 48);
    if (S.kind === 'cube') return new RoundedBoxGeometry(S.a, S.a, S.a, 3, Math.min(0.0015, S.a * 0.04));
    return new THREE.SphereGeometry(S.r, 48, 32);
  }
  _clear(group) {
    for (const c of [...group.children]) {
      group.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
  }
  /** Il corpo (o il cilindro col secchiello) da appendere. */
  setBody(app, S, material) {
    this._clear(this.bodyG); this._clear(this.archG);
    const arch = app === 'arch', G = arch ? this.archG : this.bodyG;
    this.bodyG.visible = !arch; this.archG.visible = arch;
    const mat = this.bodyMaterial(material);
    const body = this._mesh(this._shapeGeo(S), mat, G); body.userData.own = true;
    // occhiello avvitato in cima
    this._mesh(cyl(0.0012, 0.0012, 0.004, 8).translate(0, S.half + 0.002, 0), this.M.wire, G);
    this._mesh(new THREE.TorusGeometry(0.0026, 0.0008, 6, 16).translate(0, S.half + EYE - 0.0026, 0), this.M.wire, G);
    this.body = body;
    if (!arch) return;
    // secchiello d'ottone sopra il cilindro: guscio, manico, gancio sotto il fondo, acqua
    const b = bucketGeo(S), y0 = S.half + BUCKET.gap;
    const prof = [[0, 0], [b.Ro - 0.0006, 0], [b.Ro, 0.0006], [b.Ro, b.Ho], [b.Ri, b.Ho], [b.Ri, BUCKET.bottom], [0, BUCKET.bottom]].map(([r, y]) => new THREE.Vector2(r, y));
    this._mesh(new THREE.LatheGeometry(prof, 64).translate(0, y0, 0), this.M.brass, G);
    this._mesh(new THREE.TorusGeometry(b.Ro, 0.0011, 6, 40, Math.PI).scale(1, BUCKET.bail / b.Ro, 1).translate(0, y0 + b.Ho, 0), this.M.wire, G);
    this._mesh(cyl(0.0009, 0.0009, BUCKET.gap - EYE + 0.002, 6).translate(0, S.half + EYE + (BUCKET.gap - EYE) / 2, 0), this.M.wire, G);
    this.bucketWater = this._liquid(cyl(b.Ri - 0.0002, b.Ri - 0.0002, 1, 48).translate(0, 0.5, 0), G);
    this.bucketWater.position.y = y0 + BUCKET.bottom;
    this.bucketWater.scale.y = 1e-4; this.bucketWater.visible = false;
    this.fillStream = this._liquid(cyl(0.0022, 0.0022, 1, 12).translate(0, 0.5, 0), G);
    this.fillStream.visible = false;
    this.bucket = { b, y0 };
  }
  /** Posizione del baricentro del corpo (o del cilindro) e inclinazione. */
  placeBody(y, th) {
    const G = this.bodyG.visible ? this.bodyG : this.archG;
    G.position.set(HOOK_X, y, 0); G.rotation.z = th;
  }
  /** Acqua nel secchiello (m³) e getto che lo riempie. */
  setBucket(Vb, filling) {
    if (!this.bucket) return;
    const { b, y0 } = this.bucket, h = Vb / (Math.PI * b.Ri * b.Ri);
    this.bucketWater.visible = h > 2e-4; this.bucketWater.scale.y = Math.max(h, 1e-4);
    this.fillStream.visible = !!filling;
    if (filling) { const top = y0 + b.Ho + 0.16, bot = y0 + BUCKET.bottom + h; this.fillStream.position.y = bot; this.fillStream.scale.y = top - bot; }
  }
  get movingParts() { return this.bodyG.visible ? this.bodyG : this.archG; }

  // ───────────────────────────── becher graduato ─────────────────────────────
  _glassVessel(R, wall, H, bottom, parent) {
    const Ro = R + wall;
    const glass = this._mesh(cyl(Ro, Ro, H, 72, true).translate(0, H / 2, 0), this.glassMat, parent); glass.renderOrder = 4;
    const inner = this._mesh(cyl(R, R, H - bottom, 72, true).translate(0, bottom + (H - bottom) / 2, 0), this.glassMat, parent); inner.renderOrder = 4;
    this._mesh(new THREE.TorusGeometry(R + wall / 2, wall / 2, 8, 72).rotateX(Math.PI / 2).translate(0, H, 0), this.glassMat, parent).renderOrder = 4;
    this._mesh(cyl(Ro, Ro, bottom, 72).translate(0, bottom / 2, 0), this.glassMat, parent).renderOrder = 4;
  }
  _decal(R, y0, h, tex, parent, arc = 1.1) {
    const m = this._mesh(new THREE.CylinderGeometry(R, R, h, 32, 1, true, -arc / 2, arc), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.5, depthWrite: false }), parent);
    m.position.y = y0 + h / 2; m.renderOrder = 6; m.castShadow = false;
    return m;
  }
  _buildBeaker() {
    const g = new THREE.Group(); g.position.set(HOOK_X, BAL.top, 0); this.group.add(g); this.beakerG = g;
    const B = BEAKER;
    this._glassVessel(B.R, B.wall, B.H, B.bottom, g);
    const hMarks = (B.ml * 1e-6) / (Math.PI * B.R * B.R), pad = (18 / 1024) * (hMarks / (1 - 36 / 1024));
    this._decal(B.R + B.wall + 0.0003, B.bottom - pad, hMarks + 2 * pad, gradTexture(B.ml, 50, 100), g);
    this.beakerLiq = this._liquid(cyl(B.R - 0.0003, B.R - 0.0003, 1, 72).translate(0, 0.5, 0), g);
    this.beakerLiq.position.y = B.bottom;
  }

  // ───────────────────────────── vaso a sfioro, elevatore, becherino ─────────────────────────────
  _buildCan() {
    const M = this.M, g = new THREE.Group(); this.group.add(g); this.canG = g;
    // elevatore da laboratorio: due piani e le forbici
    const J = CAN.jack;
    this._mesh(new RoundedBoxGeometry(0.13, 0.01, 0.13, 2, 0.003).translate(HOOK_X, 0.005, 0), M.steel, g);
    this._mesh(new RoundedBoxGeometry(0.13, 0.01, 0.13, 2, 0.003).translate(HOOK_X, J - 0.005, 0), M.steel, g);
    for (const z of [-0.055, 0.055]) for (const s of [1, -1]) {
      const L = Math.hypot(0.1, J - 0.02);
      const arm = this._mesh(new THREE.BoxGeometry(L, 0.006, 0.004), M.chrome, g);
      arm.position.set(HOOK_X, J / 2, z); arm.rotation.z = s * Math.atan2(J - 0.02, 0.1);
    }
    this._mesh(cyl(0.004, 0.004, 0.13, 12).rotateX(Math.PI / 2).translate(HOOK_X, J / 2, 0), M.chrome, g);
    this._mesh(cyl(0.01, 0.01, 0.012, 20).rotateX(Math.PI / 2).translate(HOOK_X, J / 2, 0.072), M.black, g);
    // il vaso di vetro con il beccuccio
    const cg = new THREE.Group(); cg.position.set(HOOK_X, J, 0); g.add(cg);
    this._glassVessel(CAN.R, CAN.wall, CAN.H, CAN.bottom, cg);
    // beccuccio: un tubo di vetro che parte dalla parete all'altezza dello sfioro e scende verso destra
    const sy = CAN.bottom + CAN.spout - SPOUT.r * 0.2;
    const sp = this._mesh(cyl(SPOUT.r, SPOUT.r, SPOUT.len, 24, true).rotateZ(Math.PI / 2), this.glassMat, cg);
    const c = Math.cos(SPOUT.tilt), s = Math.sin(SPOUT.tilt);
    sp.renderOrder = 4;
    sp.position.set(CAN.R - 0.004 + (SPOUT.len / 2) * c, sy - (SPOUT.len / 2) * s, 0);
    sp.rotation.z = -SPOUT.tilt;
    this.spoutOut = new THREE.Vector3(HOOK_X + CAN.R + SPOUT.len * c - 0.004, J + sy - SPOUT.len * s - SPOUT.r * 0.6, 0);
    this.canLiq = this._liquid(cyl(CAN.R - 0.0003, CAN.R - 0.0003, 1, 72).translate(0, 0.5, 0), cg);
    this.canLiq.position.y = CAN.bottom;
    // becherino di raccolta (sulla bilancia)
    const kg = new THREE.Group(); kg.position.set(HOOK_X + CATCH.dx, BAL.top, 0); g.add(kg); this.catchG = kg;
    this._glassVessel(CATCH.R, CATCH.wall, CATCH.H, CATCH.bottom, kg);
    const hMarks = (CATCH.ml * 1e-6) / (Math.PI * CATCH.R * CATCH.R), pad = (18 / 1024) * (hMarks / (1 - 36 / 1024));
    this._decal(CATCH.R + CATCH.wall + 0.0003, CATCH.bottom - pad, hMarks + 2 * pad, gradTexture(CATCH.ml, 25, 50), kg, 1.3);
    this.catchLiq = this._liquid(cyl(CATCH.R - 0.0003, CATCH.R - 0.0003, 1, 48).translate(0, 0.5, 0), kg);
    this.catchLiq.position.y = CATCH.bottom; this.catchLiq.visible = false;
    // getto dal beccuccio (si ricostruisce quando cambia la portata)
    this.stream = this._liquid(new THREE.BufferGeometry(), g); this.stream.visible = false; this.streamKey = '';
  }
  /** Liquido raccolto nel becherino (m³). */
  setCatch(V) {
    const h = V / (Math.PI * CATCH.R * CATCH.R);
    this.catchLiq.visible = h > 2e-4; this.catchLiq.scale.y = Math.max(h, 1e-4);
    this._catchTop = BAL.top + CATCH.bottom + h;
  }
  /** Getto dal beccuccio: portata q (m³/s); scende a parabola fino al pelo del becherino. */
  setStream(q, g) {
    if (q < 2e-7) { this.stream.visible = false; return; }
    // velocità nel beccuccio (portata / sezione, che il liquido riempie per metà) e spessore del getto
    const v0 = Math.min(0.45, Math.max(0.05, q / (0.5 * Math.PI * SPOUT.r * SPOUT.r)));
    const r = Math.max(0.0006, Math.min(SPOUT.r * 0.8, Math.sqrt(q / (Math.PI * (v0 + 0.6)))));
    const key = `${r.toFixed(4)}|${(this._catchTop || 0).toFixed(3)}`;
    this.stream.visible = true;
    if (key === this.streamKey) return;
    this.streamKey = key;
    const p0 = this.spoutOut, c = Math.cos(SPOUT.tilt), s = Math.sin(SPOUT.tilt), yEnd = (this._catchTop || BAL.top + CATCH.bottom) + 0.001;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * 0.35, x = p0.x + v0 * c * t, y = p0.y - v0 * s * t - 0.5 * g * t * t;
      pts.push(new THREE.Vector3(x, Math.max(y, yEnd), 0));
      if (y < yEnd) break;
    }
    this.stream.geometry.dispose();
    this.stream.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, r, 10, false);
  }

  // ───────────────────────────── bilancia elettronica ─────────────────────────────
  _buildBalance() {
    const M = this.M, g = new THREE.Group(); this.group.add(g); this.balG = g;
    const W = BAL.w, D = BAL.d, top = BAL.top;
    this._mesh(new RoundedBoxGeometry(W, 0.05, D, 3, 0.01).translate(0, 0.025, 0), M.plastic, g);
    this._mesh(new RoundedBoxGeometry(W - 0.03, 0.006, D - 0.05, 2, 0.002).translate(0, 0.051, -0.008), M.dark, g);
    this._mesh(cyl(0.012, 0.012, top - 0.058, 16).translate(0, (top + 0.054) / 2 - 0.002, -0.008), M.steel, g);
    this._mesh(cyl(0.072, 0.072, 0.004, 64).translate(0, top - 0.002, -0.008), M.steel, g);
    for (const [x, z] of [[-0.07, -0.08], [0.07, -0.08], [-0.07, 0.08], [0.07, 0.08]]) this._mesh(cyl(0.007, 0.008, 0.004, 16).translate(x, -0.0, z), M.rubber, g);
    // pannello frontale inclinato con il display e i tasti
    const panel = new THREE.Group(); panel.position.set(0, 0.03, D / 2 - 0.004); panel.rotation.x = -0.35; g.add(panel);
    this._mesh(new RoundedBoxGeometry(W - 0.02, 0.034, 0.012, 2, 0.003), M.dark, panel);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    this.lcd = c.getContext('2d');
    this.lcdTex = new THREE.CanvasTexture(c); this.lcdTex.colorSpace = THREE.SRGBColorSpace; this.lcdTex.anisotropy = 8;
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.0225), new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false }));
    lcd.position.set(-0.012, 0, 0.0062); panel.add(lcd);
    for (const [x, col] of [[0.05, '#e4e2dc'], [0.066, '#c8452f']]) this._mesh(cyl(0.0045, 0.0045, 0.003, 20).rotateX(Math.PI / 2).translate(x, 0, 0.007), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }), panel);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.008), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture(256, 52, (q) => { q.fillStyle = '#c9ccd2'; q.font = `700 30px ${FONT}`; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('TARA', 64, 28); q.fillText('ON', 192, 28); }) }));
    lab.position.set(0.058, -0.0115, 0.0062); panel.add(lab);
    this.lcdText = '';
    this.balanceDisplay = lcd;
  }
  /** Display della bilancia (testo già formattato). */
  setBalance(text, unit = 'g') {
    if (text === this.lcdText) return;
    this.lcdText = text;
    const g = this.lcd;
    g.fillStyle = '#b9c6b4'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(30, 40, 28, 0.08)'; g.font = `700 92px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText('8888,8', 430, 68);
    g.fillStyle = '#1b2219'; g.fillText(text, 430, 68);
    g.font = `700 46px ${MONO}`; g.textAlign = 'left'; g.fillText(unit, 444, 80);
    this.lcdTex.needsUpdate = true;
  }

  // ───────────────────────────── apparato e liquido ─────────────────────────────
  /** Apparato: becher (anche per il secchiello) oppure vaso a sfioro; la bilancia va sotto il recipiente giusto. */
  setApp(app) {
    const over = app === 'overflow';
    this.beakerG.visible = !over; this.canG.visible = over;
    this.balG.position.set(over ? HOOK_X + CATCH.dx : HOOK_X, 0, 0.008);
  }
  /** Livello del liquido nel recipiente sotto il dinamometro (mondo). */
  setLevel(app, level) {
    const v = vesselGeo(app), m = app === 'overflow' ? this.canLiq : this.beakerLiq;
    m.scale.y = Math.max(level - v.y0, 1e-4);
  }
  /** Colore e assorbimento del liquido, o il mercurio (uno specchio). */
  setLiquid(L) {
    const key = `${L.key}|${L.rho.toFixed(1)}`;
    if (key === this.liqKey) return;
    this.liqKey = key;
    const mat = L.metal ? this.hgMat : this.liqMat;
    if (!L.metal) { this.liqMat.attenuationColor.set(L.color); this.liqMat.attenuationDistance = 0.012 / Math.max(L.alpha, 0.02) ** 1.2; }
    for (const m of this.liquids) m.material = mat;
  }
  /** Le nuove mesh di liquido (secchiello) prendono il materiale attuale. */
  refreshLiquids(L) { this.liqKey = ''; this.setLiquid(L); }
}
