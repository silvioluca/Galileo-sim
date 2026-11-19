// rig.js — l'apparato: asta graduata su piede a botte, morsetto con braccio e sganci elettromagnetici,
// gli oggetti (pallina, piuma, martello), la piastra d'arrivo, il cronometro a LED e il metro a terra.
// Unità: metri. x = direzione del lancio, y = verticale, z = profondità (gli oggetti sono affiancati lungo z).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { revolveX, canvasTexture } from '../../../shared/js/geo.js';
import { BALL_R } from './fall.js';

export const GROUND = 0.003;                    // piano d'arrivo (sopra la piastra sensibile)
export const POLE = { x: -0.22, z: -0.34 };
const FOOT_H = 0.12;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
/** Solido di rivoluzione attorno all'asse verticale: profilo [r, y]. */
const lathe = (pts, seg = 64, crease = 0.5) => revolveX(pts.map(([r, y]) => [y, r]), seg, crease).rotateZ(Math.PI / 2);

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    alu: std({ color: '#c9ccd0', metalness: 1, roughness: 0.3 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
    black: std({ color: '#0e0f11', metalness: 0.7, roughness: 0.4 }),
    satin: std({ color: '#1d1f23', metalness: 0.6, roughness: 0.5 }),
    rubber: std({ color: '#121314', metalness: 0, roughness: 0.9 }),
    brass: std({ color: '#c9a24e', metalness: 1, roughness: 0.3 }),
    red: std({ color: '#b3261e', metalness: 0.2, roughness: 0.5 }),
    copper: std({ color: '#b8703f', metalness: 1, roughness: 0.35 }),
  };
}

const BALL_LOOK = {
  celluloide: { color: '#f5f2ea', metalness: 0, roughness: 0.42 },
  sughero: { color: '#b88a5a', metalness: 0, roughness: 0.92 },
  legno: { color: '#c79a63', metalness: 0, roughness: 0.6 },
  gomma: { color: '#d4402c', metalness: 0, roughness: 0.55 },
  alluminio: { color: '#c9cdd2', metalness: 1, roughness: 0.32 },
  acciaio: { color: '#e2e4e6', metalness: 1, roughness: 0.1 },
  piombo: { color: '#6f747b', metalness: 0.75, roughness: 0.45 },
  tungsteno: { color: '#8e9197', metalness: 1, roughness: 0.22 },
};

function poleScaleTexture(m0) {
  // un metro di scala: 0 in basso; tacche ogni centimetro, numeri ogni 10 cm
  const W = 160, H = 4096, pxcm = H / 100;
  return canvasTexture(W, H, (g) => {
    g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16181b'; g.textBaseline = 'middle';
    for (let cm = 0; cm <= 100; cm++) {
      const y = H - cm * pxcm, abs = m0 * 100 + cm;
      const len = abs % 10 === 0 ? 74 : abs % 5 === 0 ? 50 : 30;
      g.fillRect(0, y - (abs % 10 === 0 ? 2.4 : 1.4), len, abs % 10 === 0 ? 4.8 : 2.8);
      for (let mm = 1; mm < 10 && cm < 100; mm++) g.fillRect(0, y - mm * (pxcm / 10) - 0.7, 14, 1.4);
      if (abs % 10 === 0 && cm < 100 && abs > 0) {
        const metre = abs % 100 === 0;
        g.font = `${metre ? 700 : 600} ${metre ? 54 : 44}px ${FONT}`;
        g.fillStyle = metre ? '#c2331d' : '#16181b';
        g.fillText(metre ? `${abs / 100} m` : String(abs % 100), 82, y - 2);
        g.fillStyle = '#16181b';
      }
    }
  }, { aniso: 16 });
}

function tapeTexture(startCm, lengthCm) {
  const W = 4096, H = 156;
  return canvasTexture(W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f6cf2c'); grad.addColorStop(1, '#e9b70e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const px = W / (lengthCm * 10);
    g.fillStyle = '#1b1b1b';
    for (let mm = 0; mm <= lengthCm * 10; mm++) {
      const abs = startCm * 10 + mm, x = mm * px;
      const len = abs % 100 === 0 ? H * 0.62 : abs % 10 === 0 ? H * 0.42 : abs % 5 === 0 ? H * 0.28 : H * 0.17;
      g.fillRect(x - (abs % 10 === 0 ? 1.2 : 0.7), H - len, abs % 10 === 0 ? 2.4 : 1.4, len);
    }
    g.textBaseline = 'top';
    for (let cm = 0; cm <= lengthCm; cm++) {
      const abs = startCm + cm, x = cm * 10 * px;
      if (abs === 0) continue;
      if (abs % 10 === 0) {
        g.font = `700 74px ${FONT}`;
        const t = abs % 100 === 0 ? `${abs / 100} m` : String(abs);
        const tw = g.measureText(t).width;
        g.fillStyle = '#c8281e'; g.fillRect(x + 8, 8, tw + 22, 76);
        g.fillStyle = '#fff6da'; g.fillText(t, x + 19, 12);
      } else { g.font = `600 44px ${FONT}`; g.fillStyle = '#1b1b1b'; g.fillText(String(abs % 10), x + 7, 12); }
    }
  }, { aniso: 16 });
}

function featherTexture() {
  // vessillo di una remigante di falco: barbe fitte, bande scure trasversali, punta più chiara
  const W = 1024, H = 128;
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 900; i++) {
      const x0 = (i / 900) * W, band = Math.sin((x0 / W) * Math.PI * 9) > 0.35;
      const tone = band ? 70 + rnd() * 25 : 150 + rnd() * 40;
      g.strokeStyle = `rgba(${tone + 30},${tone + 10},${tone - 15},${0.55 + rnd() * 0.4})`;
      g.lineWidth = 1 + rnd() * 1.4;
      g.beginPath(); g.moveTo(x0, H); g.quadraticCurveTo(x0 + 30, H * 0.5, x0 + 62 + rnd() * 10, 4 + rnd() * 8); g.stroke();
    }
  }, { aniso: 8 });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'apparato';
    this.M = materials();
    this.dragTargets = [];
    this._buildStand();
    this._buildFloor();
    this._buildTimer();
    this.arm = new THREE.Group();
    this.group.add(this.arm);
    this.objects = {};
    this.ghosts = {};
    this.scaleKey = '';
  }

  _mesh(geo, mat, parent, drag) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    if (drag) { m.userData.drag = drag; this.dragTargets.push(m); }
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── asta e piede a botte ─────────────────────────────
  _buildStand() {
    const M = this.M, g = new THREE.Group();
    g.position.set(POLE.x, 0, POLE.z);
    // piede "a botte": ghisa smaltata, fianchi bombati, fascia cromata
    const prof = [[0, 0], [0.074, 0], [0.079, 0.006], [0.086, 0.03], [0.089, 0.06], [0.086, 0.09], [0.079, 0.114], [0.072, FOOT_H], [0.016, FOOT_H], [0, FOOT_H]];
    this._mesh(lathe(prof, 72, 0.35), M.iron, g);
    this._mesh(lathe([[0.0895, 0.052], [0.0905, 0.056], [0.0905, 0.066], [0.0895, 0.07]], 72), M.chrome, g);
    this._mesh(lathe([[0, -0.002], [0.07, -0.002], [0.07, 0.003], [0, 0.003]], 48), M.rubber, g);
    // vite di bloccaggio dell'asta
    this._mesh(cyl(0.005, 0.005, 0.05, 16).rotateX(Math.PI / 2).translate(0, FOOT_H - 0.02, 0.05), M.chrome, g);
    this._mesh(cyl(0.012, 0.012, 0.012, 24).rotateX(Math.PI / 2).translate(0, FOOT_H - 0.02, 0.078), M.black, g);
    this.pole = new THREE.Group();
    g.add(this.pole);
    this.group.add(g);
    this.stand = g;
  }

  /** Lunghezza dell'asta (m dal pavimento). La scala è a strisce di un metro. */
  setPoleHeight(top) {
    const key = top.toFixed(2);
    if (key === this.scaleKey) return;
    this.scaleKey = key;
    const M = this.M, p = this.pole;
    for (const c of [...p.children]) { p.remove(c); c.geometry.dispose(); }
    const r = 0.012, y0 = FOOT_H - 0.01;
    this._mesh(cyl(r, r, top - y0, 32).translate(0, (top + y0) / 2, 0), M.alu, p);
    this._mesh(cyl(r * 1.08, r * 1.08, 0.01, 32).translate(0, top + 0.005, 0), M.black, p);
    // striscia graduata rivolta verso gli oggetti (direzione +x+z)
    this.scaleMats = this.scaleMats || [];
    const n = Math.ceil(top);
    for (let k = 0; k < n; k++) {
      if (!this.scaleMats[k]) this.scaleMats[k] = new THREE.MeshStandardMaterial({ map: poleScaleTexture(k), roughness: 0.5, metalness: 0.1 });
      const ya = Math.max(k, FOOT_H), yb = Math.min(k + 1, top - 0.006);
      if (yb <= ya) continue;
      const geo = new THREE.PlaneGeometry(0.018, yb - ya);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? yb - k : ya - k);
      const m = new THREE.Mesh(geo, this.scaleMats[k]);
      m.position.set(0, (ya + yb) / 2, 0);
      const dir = new THREE.Vector3(-POLE.x, 0, -POLE.z + 0.5).normalize();
      m.position.addScaledVector(dir, r + 0.0006);
      m.lookAt(m.position.clone().add(dir));
      m.receiveShadow = true;
      p.add(m);
    }
  }

  // ───────────────────────────── piastra d'arrivo e metro ─────────────────────────────
  _buildFloor() {
    const M = this.M;
    // piastra sensibile: profonda 1 m nella geometria, scalata lungo z per coprire tutti gli oggetti
    this.pad = new THREE.Group();
    this._mesh(new THREE.BoxGeometry(0.5, GROUND, 1).translate(0.04, GROUND / 2, 0), M.rubber, this.pad);
    this._mesh(new THREE.BoxGeometry(0.46, 0.0006, 0.94).translate(0.04, GROUND + 0.0003, 0), new THREE.MeshStandardMaterial({ color: '#2a2f36', metalness: 0.6, roughness: 0.35 }), this.pad);
    this.group.add(this.pad);
    this.setPad(-0.24, 0.22);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshStandardMaterial({ map: tapeTexture(i * 100, 100), roughness: 0.42, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.019), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(i + 0.5, 0.0005, 0.3);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  /** La piastra d'arrivo copre l'intervallo [z0, z1]. */
  setPad(z0, z1) { this.pad.position.z = (z0 + z1) / 2; this.pad.scale.z = Math.max(z1 - z0, 0.3); }

  // ───────────────────────────── cronometro ─────────────────────────────
  _buildTimer() {
    const M = this.M, g = new THREE.Group();
    g.position.set(0.16, 0, -0.56);
    g.rotation.y = -0.3;
    this._mesh(new RoundedBoxGeometry(0.24, 0.085, 0.13, 3, 0.012).translate(0, 0.0425 + 0.004, 0), M.satin, g);
    for (const x of [-0.1, 0.1]) this._mesh(cyl(0.008, 0.009, 0.006, 16).translate(x, 0.003, 0.05), M.rubber, g);
    for (const x of [-0.1, 0.1]) this._mesh(cyl(0.008, 0.009, 0.006, 16).translate(x, 0.003, -0.05), M.rubber, g);
    // pulsanti e boccole
    for (const [x, mat] of [[-0.075, M.red], [-0.045, M.black]]) this._mesh(cyl(0.008, 0.008, 0.006, 20).translate(x, 0.092, 0.035), mat, g);
    for (const [x, col] of [[0.05, '#c62828'], [0.075, '#111']]) this._mesh(cyl(0.006, 0.006, 0.01, 16).rotateX(Math.PI / 2).translate(x, 0.03, -0.068), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }), g);
    this.lcdCanvas = document.createElement('canvas');
    this.lcdCanvas.width = 640; this.lcdCanvas.height = 200;
    this.lcdTex = new THREE.CanvasTexture(this.lcdCanvas);
    this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0625), new THREE.MeshBasicMaterial({ map: this.lcdTex, toneMapped: false, fog: false }));
    lcd.position.set(0, 0.046, 0.0655);
    g.add(lcd);
    this.timerGroup = g;
    this.group.add(g);
    // cavi: verso l'asta (elettromagneti) e verso la piastra
    const tube = (pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, 0.0025, 8);
    this._mesh(tube([[0.06, 0.03, -0.6], [-0.06, 0.004, -0.58], [-0.16, 0.004, -0.46], [POLE.x + 0.02, 0.06, POLE.z - 0.03], [POLE.x + 0.014, 0.12, POLE.z - 0.014]]), M.rubber);
    this._mesh(tube([[0.2, 0.02, -0.52], [0.24, 0.004, -0.4], [0.27, 0.0035, -0.24]]), M.rubber);
    this.setTimer(0, false);
  }

  /** Display a LED del cronometro: t in secondi; running = in corsa. */
  setTimer(t, running) {
    const txt = t.toFixed(3).replace('.', ',');
    const key = txt + running;
    if (key === this._lcdKey) return;
    this._lcdKey = key;
    const c = this.lcdCanvas.getContext('2d'), W = c.canvas.width, H = c.canvas.height;
    c.fillStyle = '#0c0606'; c.fillRect(0, 0, W, H);
    c.font = `600 132px ${MONO}`; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,60,40,0.10)'; c.fillText('8,888', W - 92, H / 2 + 8);
    c.shadowColor = 'rgba(255,50,30,0.85)'; c.shadowBlur = 18;
    c.fillStyle = '#ff4b33'; c.fillText(txt, W - 92, H / 2 + 8);
    c.shadowBlur = 0;
    c.font = `600 42px ${MONO}`; c.fillStyle = '#ff6a4f'; c.textAlign = 'left';
    c.fillText('s', W - 74, H / 2 + 30);
    c.fillStyle = running ? '#ff4b33' : '#4a1712';
    c.beginPath(); c.arc(30, 32, 9, 0, Math.PI * 2); c.fill();
    this.lcdTex.needsUpdate = true;
  }

  // ───────────────────────────── oggetti ─────────────────────────────
  /** Geometria di un oggetto: il punto più basso a y = 0, centrato in x e z. Restituisce [{geo, mat}]. */
  _objectParts(kind, look) {
    const M = this.M;
    if (kind === 'ball') {
      return [{ geo: new THREE.SphereGeometry(BALL_R, 48, 32).translate(0, BALL_R, 0), mat: new THREE.MeshStandardMaterial(BALL_LOOK[look] || BALL_LOOK.acciaio) }];
    }
    if (kind === 'feather') {
      if (!this._featherMat) this._featherMat = new THREE.MeshStandardMaterial({ map: featherTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
      const L = 0.28, parts = [];
      const curve = (u) => 0.012 * Math.sin(u * Math.PI);                 // lieve curvatura del rachide (in alto)
      const vane = (side) => {
        const pos = [], uv = [], idx = [];
        const N = 40;
        for (let i = 0; i <= N; i++) {
          const u = i / N, x = -L / 2 + 0.03 + u * (L - 0.03);
          // larghezza del vessillo: stretto alla base, pieno al centro, arrotondato in punta
          const w = (side > 0 ? 0.022 : 0.014) * Math.sin(Math.min(u * 1.25, 1) * Math.PI * 0.5) * (1 - Math.pow(u, 6) * 0.7);
          const y = curve(u) + 0.004;
          pos.push(x, y, 0, x + w * 0.25, y - w * 0.18, side * w);
          uv.push(u, 0, u + 0.06, 1);
          if (i < N) { const k = 2 * i; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        return geo;
      };
      parts.push({ geo: vane(1), mat: this._featherMat }, { geo: vane(-1), mat: this._featherMat });
      const pts = [];
      for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push(new THREE.Vector3(-L / 2 + u * L, curve(Math.max((u * L - 0.03) / (L - 0.03), 0)) + 0.004, 0)); }
      parts.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0012, 8), mat: new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.6 }) });
      return parts;
    }
    // martello da geologo: manico lungo x (gomma blu sull'impugnatura), testa lungo z
    const parts = [];
    const handle = new RoundedBoxGeometry(0.28, 0.024, 0.03, 3, 0.008).translate(-0.02, 0.0175, 0);
    parts.push({ geo: handle, mat: M.alu });
    parts.push({ geo: new RoundedBoxGeometry(0.13, 0.03, 0.036, 3, 0.012).translate(-0.095, 0.0175, 0), mat: new THREE.MeshStandardMaterial({ color: '#23408f', roughness: 0.65 }) });
    const face = cyl(0.016, 0.016, 0.07, 32).rotateX(Math.PI / 2).translate(0.115, 0.0175, 0.04);
    const neck = new RoundedBoxGeometry(0.034, 0.034, 0.05, 2, 0.006).translate(0.115, 0.0175, 0);
    const pick = new THREE.CylinderGeometry(0.003, 0.013, 0.07, 4, 1).rotateY(Math.PI / 4).rotateX(-Math.PI / 2).translate(0.115, 0.0175, -0.06);
    parts.push({ geo: mergeGeometries([face, neck, pick].map((gg) => { const q = gg.index ? gg.toNonIndexed() : gg; q.deleteAttribute('uv'); return q; })), mat: new THREE.MeshStandardMaterial({ color: '#b9bdc3', metalness: 1, roughness: 0.28 }) });
    return parts;
  }

  /**
   * Prepara gli oggetti attivi. list: [{key, kind, look, z, color, top}]
   * Ogni oggetto ha un gruppo (posizionato a ogni fotogramma) e un insieme di "fantasmi" per la foto stroboscopica.
   */
  setObjects(list) {
    const want = new Set(list.map((o) => o.key));
    for (const k of Object.keys(this.objects)) {
      if (!want.has(k) || this.objects[k].look !== list.find((o) => o.key === k)?.look) {
        const o = this.objects[k];
        this.group.remove(o.group, o.ghosts);
        o.group.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
        o.ghosts.geometry.dispose();
        delete this.objects[k];
      }
    }
    for (const spec of list) {
      let o = this.objects[spec.key];
      if (!o) {
        const parts = this._objectParts(spec.kind, spec.look);
        const group = new THREE.Group(), inner = new THREE.Group();
        group.add(inner);
        for (const p of parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; m.receiveShadow = true; inner.add(m); }
        const merged = mergeGeometries(parts.map((p) => { const gg = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); for (const a of Object.keys(gg.attributes)) if (a !== 'position' && a !== 'normal') gg.deleteAttribute(a); return gg; }));
        const ghosts = new THREE.InstancedMesh(merged, new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.3, depthWrite: false, fog: false }), 240);
        ghosts.count = 0; ghosts.frustumCulled = false; ghosts.userData.noAO = true; ghosts.renderOrder = 4;
        this.group.add(group, ghosts);
        o = this.objects[spec.key] = { group, inner, ghosts, look: spec.look, kind: spec.kind };
      }
      o.z = spec.z; o.top = spec.top;
    }
  }

  /** Braccio di sgancio all'altezza h (quota del punto più basso degli oggetti). */
  setArm(h, list) {
    const M = this.M, a = this.arm;
    for (const c of [...a.children]) { a.remove(c); c.geometry.dispose(); }
    this.dragTargets = this.dragTargets.filter((m) => m.userData.drag !== 'arm');
    const maxTop = Math.max(...list.map((o) => o.top), 0.04);
    const yb = GROUND + h + maxTop + 0.045;                       // asse del braccio
    const zMin = Math.min(POLE.z, Math.min(...list.map((o) => o.z)) - 0.04), zMax = Math.max(...list.map((o) => o.z)) + 0.04;
    // morsetto sull'asta
    this._mesh(new RoundedBoxGeometry(0.05, 0.055, 0.05, 2, 0.006).translate(POLE.x, yb, POLE.z), M.black, a, 'arm');
    this._mesh(cyl(0.004, 0.004, 0.04, 12).rotateZ(Math.PI / 2).translate(POLE.x - 0.042, yb, POLE.z), M.chrome, a, 'arm');
    this._mesh(cyl(0.011, 0.011, 0.012, 20).rotateZ(Math.PI / 2).translate(POLE.x - 0.066, yb, POLE.z), M.black, a, 'arm');
    // braccio lungo x, poi traversa lungo z sopra gli oggetti
    this._mesh(cyl(0.007, 0.007, -POLE.x, 20).rotateZ(Math.PI / 2).translate(POLE.x / 2, yb, POLE.z), M.chrome, a, 'arm');
    this._mesh(new RoundedBoxGeometry(0.032, 0.032, 0.032, 2, 0.005).translate(0, yb, POLE.z), M.black, a, 'arm');
    this._mesh(new RoundedBoxGeometry(0.022, 0.016, zMax - zMin, 2, 0.004).translate(0, yb, (zMin + zMax) / 2), M.black, a, 'arm');
    // per ogni oggetto: asticella e testa dell'elettromagnete (o pinzetta) appoggiata sopra
    for (const o of list) {
      const yTop = GROUND + h + o.top;
      const yHead = yTop + 0.009;
      this._mesh(cyl(0.003, 0.003, yb - yHead, 12).translate(0, (yb + yHead) / 2, o.z), M.chrome, a, 'arm');
      if (o.kind === 'ball') {
        this._mesh(cyl(0.011, 0.011, 0.018, 24).translate(0, yHead, o.z), M.copper, a, 'arm');
        this._mesh(cyl(0.0115, 0.0115, 0.004, 24).translate(0, yHead + 0.009, o.z), M.black, a, 'arm');
      } else {
        this._mesh(new RoundedBoxGeometry(0.02, 0.018, 0.012, 2, 0.003).translate(0, yHead, o.z), M.black, a, 'arm');
      }
    }
    this.armY = yb;
  }
}
