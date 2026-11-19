// rig.js — l'apparato: banco di laboratorio, guidovia triangolare a cuscino d'aria (piedi di livello,
// spessori, elastici alle estremità, scala millimetrata), carrelli con bandierina, pesetti e respingenti,
// fotocellule su supporti con cronometro digitale, carrucola con pesetto appeso, soffiante con tubo.
// Unità: metri. La rotaia vive nel gruppo `trk` (x lungo la rotaia da 0 a 2 m, y sopra il piano del banco):
// il gruppo ruota attorno ai piedi di destra quando si mettono spessori sotto quello di sinistra.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { TRACK, CART, BUMPERS, PULLEY, HOOK } from './track.js';

export const YB = 0.8;                                         // piano del banco
/** Quote nel riferimento della rotaia (sopra il piano del banco). */
export const Y = { beam: 0.05, body0: 0.07, body1: 0.11, apex: 0.15, plate: 0.159, flag0: 0.161, flagH: 0.058, nose: 0.172, string: 0.185 };
export const GATE_Z = -0.17;                                   // aste delle fotocellule, dietro la rotaia
export const TIMER = { x: -0.33, z: -0.13 };
export const BENCH = { x0: -0.55, x1: 2.02, z0: -0.38, z1: 0.38 };
export const PAD = { x: PULLEY.x + PULLEY.r, top: 0.022 };     // tappetino sotto il pesetto
export const CART_COL = ['#e8452c', '#2c67dc'];
const PULLEY_Y = Y.string - PULLEY.r;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 24) => new THREE.CylinderGeometry(r0, r1, h, seg);
const FLAG_T = 0.0016, DISC = { r: 0.013, h: 0.0085 };

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    alu: std({ color: '#cfd2d6', metalness: 1, roughness: 0.28 }),
    brushed: std({ color: '#c3c6ca', metalness: 0.85, roughness: 0.36 }),
    anod: std({ color: '#1d2024', metalness: 0.55, roughness: 0.38 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    black: std({ color: '#0e0f11', metalness: 0.4, roughness: 0.45 }),
    rubber: std({ color: '#141516', metalness: 0, roughness: 0.92 }),
    brass: std({ color: '#c9a24c', metalness: 1, roughness: 0.27 }),
    nylon: std({ color: '#f1ede4', metalness: 0, roughness: 0.4 }),
    steel: std({ color: '#3a3f46', metalness: 0.7, roughness: 0.42 }),
    iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
    top: std({ color: '#26292e', metalness: 0.05, roughness: 0.62 }),
    foam: std({ color: '#3b3f45', metalness: 0, roughness: 1 }),
    hose: std({ color: '#2f3237', metalness: 0.1, roughness: 0.6 }),
    band: std({ color: '#d8532a', metalness: 0, roughness: 0.6 }),
    velcro: std({ color: '#5d6168', metalness: 0, roughness: 1 }),
    shim: std({ color: '#d9c39a', metalness: 0, roughness: 0.7 }),
    string: std({ color: '#f2efe6', metalness: 0, roughness: 0.8 }),
  };
}

// ───────────────────────────── texture ─────────────────────────────
/** Una fila di fori ogni 2 cm sulle due facce del tetto (u lungo la rotaia, v attraverso la faccia). */
function holesTexture() {
  const t = canvasTexture(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#d9dcdf'); gr.addColorStop(1, '#c4c8cc');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.1; g.fillStyle = '#ffffff';
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    g.globalAlpha = 1;
    for (const v of [0.34, 0.68]) {
      g.fillStyle = '#4c5258'; g.beginPath(); g.arc(w / 2, h * v, 3.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1c1f23'; g.beginPath(); g.arc(w / 2 + 0.6, h * v + 0.6, 2.3, 0, Math.PI * 2); g.fill();
    }
  }, { aniso: 16, repeat: true });
  t.repeat.set(TRACK.L / 0.02, 1);
  return t;
}

/** Scala millimetrata di un metro (da start cm), stampata sul fianco della rotaia. */
function rulerTexture(startCm) {
  const W = 4096, H = 120, px = W / 1000;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16181b';
    for (let mm = 0; mm <= 1000; mm++) {
      const abs = startCm * 10 + mm, x = mm * px;
      const len = abs % 100 === 0 ? H * 0.6 : abs % 10 === 0 ? H * 0.42 : abs % 5 === 0 ? H * 0.28 : H * 0.17;
      g.fillRect(x - (abs % 10 === 0 ? 1.2 : 0.7), 0, abs % 10 === 0 ? 2.4 : 1.4, len);
    }
    g.textBaseline = 'bottom';
    for (let cm = 0; cm < 100; cm += 10) {
      const abs = startCm + cm, x = cm * 10 * px;
      // all'inizio del pezzo la scritta va a destra della tacca, se no sarebbe tagliata
      g.textAlign = cm === 0 ? 'left' : 'center';
      g.font = `${abs % 100 === 0 ? 700 : 600} ${abs % 100 === 0 ? 46 : 38}px ${FONT}`;
      g.fillStyle = abs % 100 === 0 ? '#c2331d' : '#16181b';
      g.fillText(abs % 100 === 0 && abs ? `${abs / 100} m` : String(abs), x + (cm === 0 ? 8 : 0), H - 6);
    }
  }, { aniso: 16 });
}

function labelTexture(text, bg, fg, w = 256, h = 96, size = 54) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `700 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

// ───────────────────────────── l'apparato ─────────────────────────────
export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'guidovia';
    this.M = materials();
    this.dragTargets = [];
    this._buildBench();
    // perno sui piedi di destra: la rotaia si inclina attorno a loro
    this.pivot = new THREE.Group();
    this.pivot.position.set(TRACK.footR, YB, 0);
    this.group.add(this.pivot);
    this.trk = new THREE.Group();
    this.trk.position.set(-TRACK.footR, 0, 0);
    this.pivot.add(this.trk);
    this._buildTrack();
    this._buildBands();
    this._buildPulley();
    this.carts = [0, 1].map((i) => this._buildCart(i));
    this._buildShims();
    this._buildTimer();
    this._buildBlower();
    this._buildHanger();
    this.gates = [];
    this.gateKey = '';
    this.tilt = -1;
    this.setTilt(0);
  }

  _mesh(geo, mat, parent, drag) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    if (drag !== undefined) { m.userData.drag = drag; this.dragTargets.push(m); }
    (parent || this.group).add(m);
    return m;
  }

  /** Da coordinate della rotaia a coordinate del mondo. */
  toWorld(x, y, z = 0, out = new THREE.Vector3()) { this.trk.updateWorldMatrix(true, false); return out.set(x, y, z).applyMatrix4(this.trk.matrixWorld); }

  // ───────────────────────────── banco ─────────────────────────────
  _buildBench() {
    const M = this.M, B = BENCH, w = B.x1 - B.x0, d = B.z1 - B.z0;
    this._mesh(new RoundedBoxGeometry(w, 0.035, d, 3, 0.006).translate((B.x0 + B.x1) / 2, YB - 0.0175, 0), M.top);
    const legs = [[B.x0 + 0.07, B.z0 + 0.07], [B.x0 + 0.07, B.z1 - 0.07], [B.x1 - 0.07, B.z0 + 0.07], [B.x1 - 0.07, B.z1 - 0.07]];
    for (const [x, z] of legs) {
      this._mesh(new THREE.BoxGeometry(0.05, YB - 0.035 - 0.012, 0.05).translate(x, (YB - 0.035 + 0.012) / 2, z), M.steel);
      this._mesh(cyl(0.022, 0.025, 0.012).translate(x, 0.006, z), M.rubber);
    }
    // telaio sotto il piano e traverse basse
    for (const z of [B.z0 + 0.07, B.z1 - 0.07]) {
      this._mesh(new THREE.BoxGeometry(w - 0.14, 0.06, 0.03).translate((B.x0 + B.x1) / 2, YB - 0.065, z), M.steel);
      this._mesh(new THREE.BoxGeometry(w - 0.14, 0.03, 0.03).translate((B.x0 + B.x1) / 2, 0.14, z), M.steel);
    }
    for (const x of [B.x0 + 0.07, B.x1 - 0.07]) this._mesh(new THREE.BoxGeometry(0.03, 0.06, d - 0.14).translate(x, YB - 0.065, 0), M.steel);
  }

  // ───────────────────────────── rotaia ─────────────────────────────
  _buildTrack() {
    const M = this.M, T = this.trk, L = TRACK.L;
    // trave di sostegno e camera d'aria
    this._mesh(new THREE.BoxGeometry(L + 0.02, 0.04, 0.05).translate(L / 2, Y.beam - 0.0, 0), M.anod, T);
    this._mesh(new THREE.BoxGeometry(L, Y.body1 - Y.body0, 0.08).translate(L / 2, (Y.body0 + Y.body1) / 2, 0), M.brushed, T);
    // le due facce del tetto con i fori
    const holes = holesTexture();
    const face = new THREE.MeshStandardMaterial({ map: holes, metalness: 0.75, roughness: 0.3, color: '#ffffff' });
    const fw = Math.hypot(0.04, Y.apex - Y.body1);
    for (const s of [1, -1]) {
      const g = new THREE.PlaneGeometry(L, fw).rotateX(s > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4).translate(L / 2, (Y.body1 + Y.apex) / 2, 0.02 * s);
      this._mesh(g, face, T);
    }
    this._mesh(cyl(0.0016, 0.0016, L, 8).rotateZ(Math.PI / 2).translate(L / 2, Y.apex, 0), M.alu, T);
    // scala millimetrata sul fianco
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.026), new THREE.MeshStandardMaterial({ map: rulerTexture(i * 100), roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.position.set(i + 0.5, (Y.body0 + Y.body1) / 2, 0.0402); m.receiveShadow = true;
      T.add(m);
    }
    // testate, attacco dell'aria a sinistra
    for (const x of [-0.015, L + 0.015]) this._mesh(new RoundedBoxGeometry(0.03, 0.115, 0.1, 2, 0.004).translate(x, 0.0875, 0), M.anod, T);
    this._mesh(cyl(0.013, 0.013, 0.035, 24).rotateZ(Math.PI / 2).translate(-0.045, Y.beam + 0.035, 0), M.chrome, T);
    // piede singolo a sinistra, traversa con due piedi a destra
    const foot = (x, z) => {
      this._mesh(cyl(0.005, 0.005, 0.035, 12).translate(x, 0.0175 + 0.004, z), M.chrome, T);
      this._mesh(cyl(0.013, 0.013, 0.008, 24).translate(x, 0.02, z), M.black, T);
      this._mesh(cyl(0.016, 0.017, 0.006, 24).translate(x, 0.003, z), M.rubber, T);
    };
    foot(TRACK.footL, 0);
    this._mesh(new THREE.BoxGeometry(0.04, 0.02, 0.22).translate(TRACK.footR, Y.beam - 0.03, 0), M.anod, T);
    for (const z of [-0.09, 0.09]) foot(TRACK.footR, z);
    // targhetta
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.026), new THREE.MeshStandardMaterial({ map: labelTexture('GUIDOVIA', '#1d2024', '#e8e6df', 384, 90, 46), roughness: 0.5 }));
    plq.position.set(L + 0.0302, 0.0875, 0); plq.rotation.y = Math.PI / 2;
    T.add(plq);
  }

  // ───────────────────────────── elastici alle estremità ─────────────────────────────
  _buildBands() {
    const M = this.M;
    this.bands = [];
    for (const [x, s] of [[TRACK.bandL, -1], [TRACK.bandR, 1]]) {
      const T = new THREE.Group();                 // paletti, staffe ed elastico di un'estremità (si possono togliere)
      this.trk.add(T);
      for (const z of [-0.055, 0.055]) {
        this._mesh(cyl(0.004, 0.004, 0.13, 12).translate(x, 0.13, z), M.chrome, T);
        this._mesh(new THREE.BoxGeometry(Math.abs(x - (s < 0 ? 0 : TRACK.L)) + 0.02, 0.012, 0.012).translate((x + (s < 0 ? 0 : TRACK.L)) / 2, 0.075, z), M.anod, T);
      }
      const segs = [0, 1].map(() => this._mesh(cyl(0.0018, 0.0018, 1, 8), M.band, T));
      this.bands.push({ x, s, segs, group: T });
    }
    this.setBands(0, 0);
  }

  /** Elastici montati o tolti. */
  setBandsOn(on) { for (const b of this.bands) b.group.visible = on; }

  /** Deformazione degli elastici (m): a sinistra spinto verso −x, a destra verso +x. */
  setBands(dl, dr) {
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.bands.forEach((b, k) => {
      const d = k === 0 ? dl : dr;
      const mid = new THREE.Vector3(b.x + b.s * Math.max(d, 0), Y.nose, 0);
      [-0.055, 0.055].forEach((z, i) => {
        v0.set(b.x, Y.nose, z); v1.copy(mid).sub(v0);
        const len = v1.length(), m = b.segs[i];
        m.position.copy(v0).addScaledVector(v1, 0.5);
        m.scale.set(1, len, 1);
        m.quaternion.setFromUnitVectors(up, v1.normalize());
      });
    });
  }

  // ───────────────────────────── carrucola ─────────────────────────────
  _buildPulley() {
    const M = this.M, T = this.trk, g = new THREE.Group();
    g.visible = false;
    T.add(g);
    this.pulleyGroup = g;
    for (const z of [-0.009, 0.009]) this._mesh(new THREE.BoxGeometry(0.05, 0.05, 0.004).translate(PULLEY.x - 0.012, PULLEY_Y - 0.004, z), M.anod, g);
    this._mesh(cyl(0.003, 0.003, 0.024, 12).rotateX(Math.PI / 2).translate(PULLEY.x, PULLEY_Y, 0), M.chrome, g);
    const prof = [[0, 0.004], [0.027, 0.004], [0.027, 0.0025], [0.024, 0.0005], [0.024, -0.0005], [0.027, -0.0025], [0.027, -0.004], [0, -0.004]];
    const wheel = new THREE.Group();
    wheel.position.set(PULLEY.x, PULLEY_Y, 0);
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48).rotateX(Math.PI / 2);
    this._mesh(lathe, M.alu, wheel);
    for (let k = 0; k < 3; k++) this._mesh(new THREE.BoxGeometry(0.036, 0.004, 0.0085).rotateZ((k * Math.PI) / 3), M.anod, wheel);
    g.add(wheel);
    this.wheel = wheel;
  }

  // ───────────────────────────── carrelli ─────────────────────────────
  _buildCart(i) {
    const M = this.M, L = CART.L, g = new THREE.Group();
    this.trk.add(g);
    const col = new THREE.MeshStandardMaterial({ color: CART_COL[i], metalness: 0.62, roughness: 0.34 });
    const off = 0.0018, apexOut = Y.apex + off * Math.SQRT2;
    for (const s of [1, -1]) {
      const cz = s * 0.025 * Math.SQRT1_2, cy = apexOut - 0.025 * Math.SQRT1_2;
      this._mesh(new THREE.BoxGeometry(L, 0.003, 0.05).rotateX(s > 0 ? Math.PI / 4 : (3 * Math.PI) / 4).translate(0, cy, cz), col, g, i);
    }
    this._mesh(new THREE.BoxGeometry(L, 0.004, 0.056).translate(0, Y.plate - 0.002, 0), col, g, i);
    // staffe alle estremità (portano respingenti, naso, gancio)
    for (const s of [1, -1]) this._mesh(new THREE.BoxGeometry(0.004, 0.032, 0.03).translate(s * (L / 2 - 0.002), Y.plate + 0.016, 0), M.anod, g, i);
    // bandierina (larghezza scalata in x)
    const flag = this._mesh(new THREE.BoxGeometry(1, Y.flagH, FLAG_T).translate(0, Y.flag0 + Y.flagH / 2, 0), M.black, g, i);
    this._mesh(new THREE.BoxGeometry(0.016, 0.008, 0.012).translate(0, Y.plate + 0.004, 0), M.anod, g, i);
    // lettera del carrello sul piano superiore
    const lt = new THREE.MeshStandardMaterial({ map: labelTexture(i ? 'B' : 'A', CART_COL[i], '#ffffff', 96, 96, 64), roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const x of [-0.052, 0.052]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02).rotateX(-Math.PI / 2), lt);
      p.position.set(x, Y.plate + 0.0002, 0);
      g.add(p);
    }
    // supporti dei pesetti ai lati
    for (const s of [1, -1]) {
      this._mesh(new THREE.BoxGeometry(0.02, 0.004, 0.03).translate(0, Y.plate - 0.002, s * 0.04), M.anod, g, i);
      this._mesh(cyl(0.003, 0.003, 0.03, 10).translate(0, Y.plate + 0.015, s * 0.05), M.chrome, g, i);
    }
    const discs = new THREE.Group();
    g.add(discs);
    // nasi d'arresto (toccano gli elastici), gancio per il filo
    const noses = [1, -1].map((s) => this._mesh(new THREE.BoxGeometry(CART.nose, 0.012, 0.016).translate(s * (L / 2 + CART.nose / 2), Y.nose, 0), M.nylon, g, i));
    const hook = new THREE.Group();
    this._mesh(cyl(0.0015, 0.0015, HOOK, 8).rotateZ(Math.PI / 2).translate(L / 2 + HOOK / 2 - 0.003, Y.string, 0), M.chrome, hook, i);
    this._mesh(new THREE.TorusGeometry(0.0035, 0.0009, 8, 20).translate(L / 2 + HOOK, Y.string, 0), M.chrome, hook, i);
    g.add(hook);
    // respingenti delle due estremità (costruiti da setCart)
    const bump = [new THREE.Group(), new THREE.Group()];
    bump[0].position.set(L / 2, Y.nose, 0); bump[1].position.set(-L / 2, Y.nose, 0); bump[1].scale.x = -1;
    g.add(...bump);
    return { g, col, flag, discs, noses, hook, bump, key: '' };
  }

  /** Aspetto di un carrello: massa (dischi sui perni), bandierina, respingente rivolto all'altro carrello, gancio. */
  setCart(i, { m, flag, bumper, facing, hook, visible = true }) {
    const c = this.carts[i];
    c.g.visible = visible;
    if (!visible) return;
    c.flag.scale.x = flag;
    c.hook.visible = !!hook;
    const key = `${m}|${bumper}|${facing}`;
    if (key === c.key) return;
    c.key = key;
    const M = this.M;
    // dischi da 50 g: metà per lato
    for (const ch of [...c.discs.children]) c.discs.remove(ch);
    const n = Math.max(0, Math.round((m - CART.base) / 0.05)), per = Math.ceil(n / 2);
    for (const s of [1, -1]) {
      const k = s > 0 ? per : n - per;
      for (let j = 0; j < k; j++) this._mesh(cyl(DISC.r, DISC.r, DISC.h * 0.94, 32).translate(0, Y.plate + DISC.h * (j + 0.5), s * 0.05), M.brass, c.discs, i);
    }
    // respingenti: facing = 1 se l'altro carrello è a destra, −1 a sinistra, 0 nessuno
    c.noses[0].visible = facing !== 1; c.noses[1].visible = facing !== -1;
    for (const [k, grp] of c.bump.entries()) {
      for (const ch of [...grp.children]) grp.remove(ch);
      const towards = k === 0 ? 1 : -1;
      if (facing !== towards) continue;
      const B = BUMPERS[bumper];
      if (bumper === 'spring') {
        // molla a U di acciaio armonico
        const pts = [];
        for (let a = 0; a <= 24; a++) { const t = -Math.PI / 2 + (Math.PI * a) / 24; pts.push(new THREE.Vector3(B.ext * Math.cos(t), 0, 0.013 * Math.sin(t))); }
        this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0011, 8), M.chrome, grp);
        for (const z of [-0.013, 0.013]) this._mesh(new THREE.BoxGeometry(0.004, 0.006, 0.004).translate(0.002, 0, z), M.anod, grp);
      } else if (bumper === 'rubber') {
        this._mesh(cyl(0.009, 0.009, B.ext, 24).rotateZ(Math.PI / 2).translate(B.ext / 2, 0, 0), M.rubber, grp);
      } else {
        this._mesh(new RoundedBoxGeometry(B.ext, 0.026, 0.026, 2, 0.002).translate(B.ext / 2, 0, 0), M.velcro, grp);
      }
    }
  }

  /** Posizione del carrello lungo la rotaia; comp = compressione del suo respingente (m). */
  placeCart(i, x, comp = 0) {
    const c = this.carts[i];
    c.g.position.set(x, 0, 0);
    for (const grp of c.bump) if (grp.children.length) grp.scale.x = Math.sign(grp.scale.x) * Math.max(0.15, 1 - comp / 0.022);
  }

  // ───────────────────────────── spessori sotto il piede sinistro ─────────────────────────────
  _buildShims() {
    this.shims = new THREE.Group();
    this.group.add(this.shims);
  }

  /** Spessori alti h (m): la rotaia ruota attorno ai piedi di destra. */
  setTilt(h) {
    if (h === this.tilt) return;
    this.tilt = h;
    const s = h / TRACK.feet;
    this.pivot.rotation.z = -Math.asin(s);
    const S = this.shims;
    for (const ch of [...S.children]) { S.remove(ch); ch.geometry.dispose(); }
    let y = YB, left = h;
    while (left > 1e-6) {
      const t = Math.min(0.01, left);
      this._mesh(new THREE.BoxGeometry(0.06 - (y - YB) * 0.4, t * 0.985, 0.05 - (y - YB) * 0.4).translate(TRACK.footL, y + t / 2, 0), this.M.shim, S);
      y += t; left -= t;
    }
    this._hose();
  }

  // ───────────────────────────── fotocellule e cronometro ─────────────────────────────
  _buildTimer() {
    const M = this.M, g = new THREE.Group();
    g.position.set(TIMER.x, YB, TIMER.z);
    g.rotation.y = 0.32;
    this.group.add(g);
    this._mesh(new RoundedBoxGeometry(0.2, 0.075, 0.13, 3, 0.008).translate(0, 0.0375, 0), M.anod, g);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    this.timerCtx = canvas.getContext('2d');
    this.timerTex = new THREE.CanvasTexture(canvas); this.timerTex.colorSpace = THREE.SRGBColorSpace; this.timerTex.anisotropy = 8;
    // display sul fronte, in una cornice nera
    this._mesh(new RoundedBoxGeometry(0.166, 0.046, 0.004, 2, 0.0015).translate(0, 0.04, 0.065), M.black, g);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.152, 0.038), new THREE.MeshBasicMaterial({ map: this.timerTex, toneMapped: false }));
    disp.position.set(0, 0.04, 0.0672);
    g.add(disp);
    for (let k = 0; k < 4; k++) this._mesh(cyl(0.006, 0.006, 0.004, 16).translate(-0.06 + k * 0.04, 0.077, -0.035), k ? M.black : new THREE.MeshStandardMaterial({ color: '#c8281e', roughness: 0.5 }), g);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.016), new THREE.MeshStandardMaterial({ map: labelTexture('CRONOMETRO', '#1d2024', '#bfc3c9', 384, 76, 40), roughness: 0.5 }));
    lbl.rotation.x = -Math.PI / 2; lbl.position.set(0.04, 0.0752, -0.012);
    g.add(lbl);
    this.timerText = '';
    this.setTimer('0.0000');
  }

  /** Testo del display (cifre rosse su fondo scuro). */
  setTimer(text) {
    if (text === this.timerText) return;
    this.timerText = text;
    const g = this.timerCtx, w = 512, h = 128;
    g.fillStyle = '#16100f'; g.fillRect(0, 0, w, h);
    g.font = `700 92px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,60,40,0.08)'; g.fillText('8888.8888'.slice(-text.length), w - 26, h / 2 + 4);
    g.fillStyle = '#ff4a32'; g.fillText(text, w - 26, h / 2 + 4);
    this.timerTex.needsUpdate = true;
  }

  /** Fotocellule alle posizioni xs (m lungo la rotaia): supporti, forcelle, cavi verso il cronometro. */
  setGates(xs) {
    const key = xs.map((x) => x.toFixed(3)).join() + '|' + this.tilt;
    if (key === this.gateKey) return;
    this.gateKey = key;
    const M = this.M;
    for (const gt of this.gates) { this.group.remove(gt.g); gt.g.traverse((o) => o.geometry && o.geometry.dispose()); }
    this.gates = xs.map((x, i) => {
      const g = new THREE.Group();
      this.group.add(g);
      const beam = this.toWorld(x, Y.flag0 + Y.flagH * 0.55, 0);      // altezza del raggio infrarosso
      const top = beam.y + 0.045;
      // base, asta, braccio, forcella
      const zf = -0.03;
      this._mesh(new RoundedBoxGeometry(0.08, 0.012, 0.06, 2, 0.003).translate(x, YB + 0.006, GATE_Z - 0.01), M.iron, g);
      this._mesh(cyl(0.006, 0.006, top - YB, 16).translate(x, (top + YB) / 2, GATE_Z), M.alu, g);
      this._mesh(cyl(0.005, 0.005, Math.abs(GATE_Z - zf), 12).rotateX(Math.PI / 2).translate(x, top, (GATE_Z + zf) / 2), M.alu, g);
      this._mesh(new RoundedBoxGeometry(0.03, 0.012, 0.07, 2, 0.003).translate(x, top, 0), M.anod, g);
      for (const z of [-0.027, 0.027]) this._mesh(new RoundedBoxGeometry(0.03, top - beam.y + 0.022, 0.01, 2, 0.003).translate(x, (top + beam.y - 0.022) / 2, z), M.anod, g);
      for (const z of [-0.0215, 0.0215]) this._mesh(new THREE.BoxGeometry(0.006, 0.006, 0.002).translate(x, beam.y, z), M.black, g);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 16, 10).translate(x, top + 0.007, 0.02), new THREE.MeshBasicMaterial({ color: '#2fd06b' }));
      g.add(led);
      // targhetta col numero
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.012), new THREE.MeshStandardMaterial({ map: labelTexture(`F${i + 1}`, '#1d2024', '#ffffff', 128, 70, 48), roughness: 0.5 }));
      n.position.set(x, top - 0.012, 0.0325); g.add(n);
      // cavo fino al cronometro, lungo il fondo del banco
      const p0 = new THREE.Vector3(x, YB + 0.004, GATE_Z - 0.035), p3 = new THREE.Vector3(TIMER.x + 0.07, YB + 0.02, TIMER.z - 0.05);
      const zb = GATE_Z - 0.09 - 0.012 * i;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, top - 0.03, GATE_Z - 0.006), new THREE.Vector3(x + 0.01, YB + 0.05, GATE_Z - 0.015), p0, new THREE.Vector3(x - 0.05, YB + 0.003, zb), new THREE.Vector3(p3.x + 0.12, YB + 0.003, zb), new THREE.Vector3(p3.x + 0.03, YB + 0.004, p3.z - 0.01), p3]);
      this._mesh(new THREE.TubeGeometry(curve, 60 + Math.round(Math.abs(x - TIMER.x) * 40), 0.0022, 6), M.rubber, g).castShadow = false;
      return { g, x, led, beam };
    });
  }
  setGateLed(i, blocked) { const g = this.gates[i]; if (g) g.led.material.color.set(blocked ? '#ff3b2a' : '#2fd06b'); }

  // ───────────────────────────── soffiante ─────────────────────────────
  _buildBlower() {
    const M = this.M, g = new THREE.Group();
    g.position.set(-0.32, 0, -0.12);
    this.group.add(g);
    this._mesh(new RoundedBoxGeometry(0.32, 0.26, 0.22, 4, 0.03).translate(0, 0.13 + 0.02, 0), new THREE.MeshStandardMaterial({ color: '#d8dade', metalness: 0.3, roughness: 0.4 }), g);
    for (const [x, z] of [[-0.12, -0.08], [-0.12, 0.08], [0.12, -0.08], [0.12, 0.08]]) this._mesh(cyl(0.015, 0.015, 0.02, 16).translate(x, 0.01, z), M.rubber, g);
    for (let k = 0; k < 9; k++) this._mesh(new THREE.BoxGeometry(0.004, 0.12, 0.002).translate(-0.08 + k * 0.02, 0.15, 0.111), M.anod, g);
    this._mesh(cyl(0.03, 0.03, 0.04, 24).translate(0.09, 0.3, 0), M.anod, g);
    this.blowerLed = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 10).translate(0.11, 0.24, 0.111), new THREE.MeshBasicMaterial({ color: '#2fd06b' }));
    g.add(this.blowerLed);
    this.blower = g;
  }
  setAir(on) { this.blowerLed.material.color.set(on ? '#2fd06b' : '#3a3d42'); }

  /** Tubo dalla soffiante all'attacco della rotaia (si rifà quando la rotaia si inclina). */
  _hose() {
    if (this.hoseMesh) { this.group.remove(this.hoseMesh); this.hoseMesh.geometry.dispose(); }
    const inlet = this.toWorld(-0.062, Y.beam + 0.035, 0);
    const b = this.blower.position;
    const pts = [[b.x + 0.09, 0.32, b.z], [b.x + 0.09, 0.5, b.z - 0.1], [b.x + 0.05, YB - 0.04, BENCH.z0 - 0.06], [b.x + 0.1, YB + 0.08, BENCH.z0 + 0.02], [inlet.x - 0.12, inlet.y + 0.02, -0.08], [inlet.x - 0.03, inlet.y, 0], [inlet.x, inlet.y, 0]].map((p) => new THREE.Vector3(...p));
    this.hoseMesh = this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.014, 14), this.M.hose, this.group);
  }

  // ───────────────────────────── pesetto appeso ─────────────────────────────
  _buildHanger() {
    const M = this.M, g = new THREE.Group();
    g.visible = false;
    this.group.add(g);
    this.hangGroup = g;
    // tappetino sul pavimento
    this._mesh(new RoundedBoxGeometry(0.14, PAD.top, 0.14, 2, 0.006).translate(PAD.x, PAD.top / 2, 0), M.foam, g);
    const hanger = new THREE.Group();
    g.add(hanger);
    this.hanger = hanger;
    this.hangDiscs = new THREE.Group();
    hanger.add(this.hangDiscs);
    // portapesi: piattello, asta, gancio (origine sul fondo)
    this._mesh(cyl(0.017, 0.017, 0.003, 32).translate(0, 0.0015, 0), M.brass, hanger);
    this._mesh(cyl(0.002, 0.002, 0.07, 10).translate(0, 0.035, 0), M.brass, hanger);
    this._mesh(new THREE.TorusGeometry(0.004, 0.0009, 8, 20, Math.PI * 1.6).rotateZ(-0.3).translate(0, 0.074, 0), M.brass, hanger);
    // filo: tratto orizzontale (nella rotaia) e verticale (nel mondo)
    const sm = M.string;
    this.strH = this._mesh(cyl(0.0006, 0.0006, 1, 6), sm, this.trk); this.strH.visible = false;
    this.strV = this._mesh(cyl(0.0006, 0.0006, 1, 6), sm, g);
    this.strH.castShadow = this.strV.castShadow = false;
  }

  /** Pesetto di massa m (5 g il portapesi + dischi da 5 g). */
  setPull(on, m) {
    this.pulleyGroup.visible = on; this.hangGroup.visible = on; this.strH.visible = on;
    if (!on) return;
    const n = Math.max(0, Math.round((m - 0.005) / 0.005));
    if (this.hangDiscs.children.length === n) return;
    for (const ch of [...this.hangDiscs.children]) this.hangDiscs.remove(ch);
    for (let k = 0; k < n; k++) {
      const geo = cyl(0.016, 0.016, 0.0028, 32).translate(0, 0.003 + 0.003 * k + 0.0014, 0);
      this._mesh(geo, this.M.brass, this.hangDiscs);
    }
  }

  /** hookX: gancio del carrello (m lungo la rotaia); bottom: quota del fondo del pesetto (mondo); turn: giri della carrucola. */
  placePull(hookX, bottom, turn) {
    const top = new THREE.Vector3(), side = new THREE.Vector3();
    // tratto orizzontale, dal gancio alla sommità della carrucola
    const a = hookX + 0.0035, b = PULLEY.x, len = Math.max(b - a, 0.001);
    this.strH.position.set((a + b) / 2, Y.string, 0); this.strH.scale.set(1, len, 1); this.strH.rotation.set(0, 0, Math.PI / 2);
    // tratto verticale dal lato destro della ruota al gancio del portapesi
    this.toWorld(PULLEY.x + PULLEY.r, PULLEY_Y, 0, side);
    this.hanger.position.set(side.x, bottom, side.z);
    const yHook = bottom + 0.074;
    const L = Math.max(side.y - yHook, 0.001);
    this.strV.position.set(side.x, yHook + L / 2, side.z); this.strV.scale.set(1, L, 1);
    this.wheel.rotation.z = -turn;
    void top;
  }
}
