// bench.js — il banco ottico: rotaia graduata, cavalieri, sorgenti (laser e proiettore a luce bianca),
// lente, portadiapositive con l'elemento diffrangente e schermo. Geometria in millimetri, gruppo in metri.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { revolveX, bevelProfile, extrudeX, rectShape, roundedRectPath, canvasTexture } from '../../../shared/js/geo.js';

export const AXIS_H = 0.25;                 // altezza dell'asse ottico sul pavimento (m)
const H = AXIS_H * 1000;
const RAIL_TOP = 46;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const TWO_PI = Math.PI * 2;

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glass = (tint, opacity = 0.06) => new THREE.MeshPhysicalMaterial({
    color: '#0b1a20', roughness: 0.02, metalness: 0, ior: 1.52, specularIntensity: 1, specularColor: tint,
    transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.2,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  return {
    alu: std({ color: '#c3c6ca', metalness: 1, roughness: 0.36 }),
    black: std({ color: '#0e0f11', metalness: 0.75, roughness: 0.38 }),
    satin: std({ color: '#1d1f23', metalness: 0.6, roughness: 0.5 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    steel: std({ color: '#c9ccd0', metalness: 1, roughness: 0.24 }),
    rubber: std({ color: '#0b0b0c', metalness: 0, roughness: 0.86 }),
    enamel: std({ color: '#27303a', metalness: 0.35, roughness: 0.42 }),
    board: std({ color: '#d9dbde', metalness: 0, roughness: 0.7 }),
    frame: std({ color: '#2a2d32', metalness: 0.7, roughness: 0.45 }),
    slide: std({ color: '#0a0b0d', metalness: 0.55, roughness: 0.22 }),
    obstacle: std({ color: '#101113', metalness: 0.8, roughness: 0.35 }),
    glass: glass('#bfe6ff'),
    lensGlass: glass('#c9b4ff', 0.05),
  };
}

const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

/** Toppa curva per un'etichetta sul fianco di un cilindro con asse X: il testo corre lungo l'asse. */
function labelPatch(x0, x1, r, phi0, phi1, seg = 24) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const t = j / seg, phi = phi0 + (phi1 - phi0) * t;
    pos.push(x0, r * Math.cos(phi), r * Math.sin(phi), x1, r * Math.cos(phi), r * Math.sin(phi));
    uv.push(0, 1 - t, 1, 1 - t);
    if (j < seg) { const k = j * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function scaleTexture(startMm, lengthMm) {
  const W = 4096, Hh = 164;
  return canvasTexture(W, Hh, (g) => {
    g.fillStyle = '#d7d9dc'; g.fillRect(0, 0, W, Hh);
    const px = W / lengthMm;
    g.textBaseline = 'top'; g.textAlign = 'left';
    for (let mm = 0; mm <= lengthMm; mm++) {
      const abs = startMm + mm;
      if (abs < 0) continue;
      const x = mm * px;
      const len = abs % 100 === 0 ? Hh * 0.62 : abs % 10 === 0 ? Hh * 0.44 : abs % 5 === 0 ? Hh * 0.3 : Hh * 0.18;
      g.fillStyle = '#16181b';
      g.fillRect(x - (abs % 10 === 0 ? 1.3 : 0.8), Hh - len, abs % 10 === 0 ? 2.6 : 1.6, len);
      if (abs % 10 === 0 && mm < lengthMm) {
        const big = abs % 100 === 0;
        g.font = `${big ? 700 : 500} ${big ? 60 : 40}px ${FONT}`;
        g.fillStyle = big ? '#c2331d' : '#16181b';
        g.fillText(String(abs / 10), x + 6, big ? 6 : 14);
      }
    }
  }, { aniso: 16 });
}

function paperTexture() {
  const W = 1536, Hh = 1024;
  return canvasTexture(W, Hh, (g) => {
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, W, Hh);
    const px = W / 300;                                   // pixel per millimetro
    g.strokeStyle = 'rgba(40,46,56,0.10)'; g.lineWidth = 1;
    for (let cm = -15; cm <= 15; cm++) { const x = W / 2 + cm * 10 * px; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
    for (let cm = -10; cm <= 10; cm++) { const y = Hh / 2 + cm * 10 * px; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = 'rgba(40,46,56,0.28)';
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, Hh); g.moveTo(0, Hh / 2); g.lineTo(W, Hh / 2); g.stroke();
    // righello in basso
    g.fillStyle = '#23272e'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = `500 21px ${MONO}`;
    for (let mm = -150; mm <= 150; mm++) {
      const x = W / 2 + mm * px, len = mm % 10 === 0 ? 30 : mm % 5 === 0 ? 20 : 11;
      g.fillRect(x - 0.6, Hh - len, 1.2, len);
      if (mm % 10 === 0 && Math.abs(mm) < 150) g.fillText(String(mm / 10), x, Hh - 34);
    }
    g.textAlign = 'right'; g.fillText('cm', W - 10, Hh - 62);
  }, { aniso: 16 });
}

export class Bench {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'banco ottico';
    this.group.scale.setScalar(0.001);
    this.M = materials();
    this.dragTargets = [];
    this._buildRail();
    this.laser = this._buildLaser();
    this.lamp = this._buildLamp();
    this.lens = this._buildLens();
    this.mask = this._buildMaskHolder();
    this.screen = this._buildScreen();
    this.group.add(this.laser, this.lamp, this.lens, this.mask, this.screen);
  }

  _mesh(geo, mat, parent, opts = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.cast !== false && !mat.transparent;
    m.receiveShadow = opts.receive !== false;
    if (mat.transparent) m.userData.noAO = true;
    if (parent) parent.add(m);
    return m;
  }

  // ───────────────────────────── rotaia ─────────────────────────────
  _buildRail() {
    const M = this.M, g = new THREE.Group();
    const X0 = -160, X1 = 1650;
    const s = new THREE.Shape();
    // sezione a coda di rondine nel piano (u, v) = (−z, y)
    [[-38, 20], [38, 20], [38, 26], [26, 26], [31, RAIL_TOP], [4, RAIL_TOP], [4, 43.6], [-4, 43.6], [-4, RAIL_TOP], [-31, RAIL_TOP], [-26, 26], [-38, 26]]
      .forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
    s.closePath();
    this._mesh(extrudeX(s, X0, X1, { crease: 0.5 }), M.alu, g);
    // testate e piedini
    for (const x of [X0 - 4, X1 - 4]) this._mesh(new RoundedBoxGeometry(8, 30, 80, 2, 1.5).translate(x + 4 + (x < 0 ? -4 : 4), 33, 0), M.satin, g);
    for (const x of [X0 + 70, X1 - 70]) {
      this._mesh(new RoundedBoxGeometry(64, 20, 150, 3, 4).translate(x, 10, 0), M.satin, g);
      for (const z of [-60, 60]) {
        this._mesh(cyl(7, 7, 9, 28).translate(x, 24.5, z), M.chrome, g);
        this._mesh(cyl(4.5, 4.5, 3, 20).translate(x, 30.5, z), M.chrome, g);
      }
    }
    // scala millimetrata: lo zero coincide con l'uscita della sorgente
    for (let k = 0; k < 6; k++) {
      const start = -150 + k * 300;
      const mat = new THREE.MeshStandardMaterial({ map: scaleTexture(start, 300), metalness: 0.55, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(300, 12), mat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(start + 150, RAIL_TOP + 0.05, 20);
      strip.receiveShadow = true;
      g.add(strip);
    }
    this.group.add(g);
  }

  /** Cavaliere con portastelo e stelo: restituisce il gruppo (origine sull'asse della rotaia, a terra). */
  _carrier(postTop, key, wide = 44) {
    const M = this.M, g = new THREE.Group();
    const parts = [];
    const add = (geo, mat) => { const m = this._mesh(geo, mat, g); if (key) { m.userData.drag = key; parts.push(m); } return m; };
    add(new RoundedBoxGeometry(wide, 21, 80, 3, 2.5).translate(0, RAIL_TOP + 10.7, 0), M.black);
    for (const z of [-36.5, 36.5]) add(new RoundedBoxGeometry(wide, 18, 7, 2, 1.5).translate(0, RAIL_TOP - 7.5, z), M.black);
    // manopola di bloccaggio
    add(cyl(2.6, 2.6, 10, 16).rotateX(Math.PI / 2).translate(0, 38, 44), M.steel);
    add(cyl(9, 9, 11, 28).rotateX(Math.PI / 2).translate(0, 38, 53), M.satin);
    add(cyl(7, 9, 2.5, 28).rotateX(Math.PI / 2).translate(0, 38, 59.5), M.satin);
    // indice di lettura sulla scala
    add(new THREE.BoxGeometry(0.8, 0.5, 9).translate(0, RAIL_TOP + 0.4, 34.5), M.chrome);
    // portastelo
    add(cyl(12.5, 12.5, 56, 36).translate(0, RAIL_TOP + 21 + 28, 0), M.black);
    add(cyl(13.4, 13.4, 3.5, 36).translate(0, RAIL_TOP + 21 + 56, 0), M.chrome);
    add(cyl(2.2, 2.2, 12, 14).rotateX(Math.PI / 2).translate(0, RAIL_TOP + 62, 16), M.steel);
    add(cyl(5.5, 5.5, 7, 22).rotateX(Math.PI / 2).translate(0, RAIL_TOP + 62, 24), M.satin);
    const y0 = RAIL_TOP + 60;
    add(cyl(6, 6, postTop - y0, 28).translate(0, (postTop + y0) / 2, 0), M.steel);
    if (key) this.dragTargets.push(...parts);
    return g;
  }

  _cable(from) {
    const pts = [from, [from[0] - 26, from[1] - 6, 0], [from[0] - 46, from[1] - 90, 8], [from[0] - 52, 46, 26], [from[0] - 90, 6, 60], [from[0] - 210, 3.2, 96], [from[0] - 420, 3.2, 70]]
      .map((p) => new THREE.Vector3(...p));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 2.6, 10);
  }

  // ───────────────────────────── laser ─────────────────────────────
  _buildLaser() {
    const M = this.M, g = new THREE.Group();
    g.add(this._carrier(H - 44, null));
    g.children[0].position.x = -70;
    const tube = revolveX(bevelProfile([[-134, 0], [-134, 19], [-5, 19], [-5, 0]], 1.4, 3), 64).translate(0, H, 0);
    this._mesh(tube, M.black, g);
    this._mesh(revolveX(bevelProfile([[-5, 3.4], [0, 4.6], [0, 18.4], [-5, 19.05]], 0.5, 2), 64).translate(0, H, 0), M.chrome, g);
    for (const x of [-122, -24]) this._mesh(revolveX([[x, 19.02], [x + 4, 19.02], [x + 4, 19.7], [x, 19.7]], 64).translate(0, H, 0), M.chrome, g);
    // supporto
    this._mesh(revolveX(bevelProfile([[-82, 19.1], [-58, 19.1], [-58, 23.5], [-82, 23.5]], 0.6, 2), 64).translate(0, H, 0), M.satin, g);
    this._mesh(new RoundedBoxGeometry(24, 26, 30, 2, 2).translate(-70, H - 32, 0), M.satin, g);
    this._mesh(cyl(6.5, 6.5, 10, 20).rotateZ(Math.PI / 2).translate(-139, H, 0), M.rubber, g);
    this._mesh(this._cable([-143, H, 0]), M.rubber, g);
    // etichetta
    this.laserLabel = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
    const lab = new THREE.Mesh(labelPatch(-108, -34, 19.08, (20 * Math.PI) / 180, (160 * Math.PI) / 180).translate(0, H, 0), this.laserLabel);
    lab.receiveShadow = true;
    g.add(lab);
    // bagliore all'uscita
    this.laserGlow = new THREE.MeshBasicMaterial({ color: '#ff2a1a', fog: false });
    g.add(new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateY(Math.PI / 2).translate(-2.2, H, 0), this.laserGlow));
    return g;
  }

  setLaserLabel(nm, rgb) {
    if (this.laserLabel.map) this.laserLabel.map.dispose();
    this.laserLabel.map = canvasTexture(1024, 400, (c, w, h) => {
      c.fillStyle = '#f2c41a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 14, w, 14);
      // simbolo di pericolo laser
      c.save(); c.translate(150, h / 2 + 6);
      c.beginPath(); c.moveTo(0, -112); c.lineTo(118, 92); c.lineTo(-118, 92); c.closePath(); c.lineWidth = 16; c.lineJoin = 'round'; c.strokeStyle = '#111'; c.stroke();
      c.beginPath(); c.arc(0, 28, 15, 0, TWO_PI); c.fillStyle = '#111'; c.fill();
      c.lineWidth = 6;
      for (let i = 0; i < 12; i++) { const a = (TWO_PI * i) / 12, r1 = 24, r2 = i % 2 ? 44 : 58; c.beginPath(); c.moveTo(r1 * Math.cos(a), 28 + r1 * Math.sin(a)); c.lineTo(r2 * Math.cos(a), 28 + r2 * Math.sin(a)); c.stroke(); }
      c.restore();
      c.fillStyle = '#111'; c.textBaseline = 'alphabetic';
      c.font = `800 118px ${FONT}`; c.fillText('LASER', 316, 176);
      c.font = `600 60px ${MONO}`; c.fillText(`λ = ${nm} nm`, 320, 266);
      c.font = `500 44px ${MONO}`; c.fillText('1 mW · CLASSE 2', 320, 332);
    });
    this.laserLabel.needsUpdate = true;
    this.laserGlow.color.setRGB(rgb[0] * 3, rgb[1] * 3, rgb[2] * 3);
  }

  // ───────────────────────────── proiettore a luce bianca ─────────────────────────────
  _buildLamp() {
    const M = this.M, g = new THREE.Group();
    g.add(this._carrier(H - 56, null));
    g.children[0].position.x = -128;
    this._mesh(new RoundedBoxGeometry(112, 100, 100, 4, 7).translate(-128, H, 0), M.enamel, g);
    const fins = [];
    for (let k = -4; k <= 4; k++) fins.push(new THREE.BoxGeometry(96, 9, 3.2).translate(-128, H + 53, k * 10).toNonIndexed());
    this._mesh(mergeGeometries(fins), M.satin, g);
    this._mesh(revolveX(bevelProfile([[-74, 20.5], [-3, 20.5], [-3, 27], [-74, 27]], 0.8, 2), 64).translate(0, H, 0), M.black, g);
    this._mesh(revolveX(bevelProfile([[-3, 18], [0, 18.6], [0, 27.4], [-3, 27.4]], 0.5, 2), 64).translate(0, H, 0), M.chrome, g);
    this._mesh(new RoundedBoxGeometry(30, 12, 44, 2, 2).translate(-128, H - 54, 0), M.satin, g);
    // condensatore e filamento visti attraverso la lente frontale
    const prof = [];
    for (let k = 0; k <= 20; k++) { const r = (20 * k) / 20; prof.push([-9 + (70 - Math.sqrt(4900 - r * r)), r]); }
    prof.push([-14, 20], [-14, 0]);
    const lens = this._mesh(revolveX(prof, 64, 0.4).translate(0, H, 0), M.glass, g);
    lens.renderOrder = 2;
    this.lampGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.6), fog: false });
    g.add(new THREE.Mesh(new THREE.CircleGeometry(15, 32).rotateY(Math.PI / 2).translate(-24, H, 0), this.lampGlow));
    this._mesh(cyl(6.5, 6.5, 10, 20).rotateZ(Math.PI / 2).translate(-189, H - 20, 0), M.rubber, g);
    this._mesh(this._cable([-193, H - 20, 0]), M.rubber, g);
    return g;
  }

  // ───────────────────────────── lente ─────────────────────────────
  _buildLens() {
    const M = this.M, g = new THREE.Group();
    g.add(this._carrier(H - 40, 'lens'));
    const Rc = 80, ra = 21.5, n = 26;
    const sag = (r) => Rc - Math.sqrt(Rc * Rc - r * r);
    const t = sag(ra) + 1.1, prof = [];
    for (let k = 0; k <= n; k++) { const r = (ra * k) / n; prof.push([t - sag(r), r]); }
    for (let k = n; k >= 0; k--) { const r = (ra * k) / n; prof.push([-t + sag(r), r]); }
    const lens = this._mesh(revolveX(prof, 96, 0.4).translate(0, H, 0), M.lensGlass, g);
    lens.renderOrder = 2;
    const ring = (geo, mat) => { const m = this._mesh(geo, mat, g); m.userData.drag = 'lens'; this.dragTargets.push(m); };
    ring(revolveX(bevelProfile([[-5.5, 21.2], [5.5, 21.2], [5.5, 30], [-5.5, 30]], 0.7, 3), 96).translate(0, H, 0), M.black);
    ring(revolveX([[5.5, 21.6], [6.6, 21.6], [6.6, 25.5], [5.5, 25.5]], 96).translate(0, H, 0), M.chrome);
    ring(new RoundedBoxGeometry(11, 14, 16, 2, 1.5).translate(0, H - 35, 0), M.black);
    return g;
  }

  // ───────────────────────────── portadiapositive ed elemento diffrangente ─────────────────────────────
  _buildMaskHolder() {
    const M = this.M, g = new THREE.Group();
    g.add(this._carrier(H - 42, 'mask'));
    const fr = rectShape(-37, 37, H - 37, H + 37, 4);
    fr.holes.push(roundedRectPath(new THREE.Path(), -22, 22, H - 22, H + 22, 1.5));
    const frame = this._mesh(extrudeX(fr, -3, 3), M.black, g);
    frame.userData.drag = 'mask'; this.dragTargets.push(frame);
    this._mesh(new RoundedBoxGeometry(10, 8, 16, 2, 1.5).translate(0, H - 40.5, 0), M.black, g);
    for (const z of [-30, 30]) this._mesh(new RoundedBoxGeometry(1.2, 20, 5, 1, 0.4).translate(-3.5, H + 18, z), M.chrome, g);
    // diapositiva: lastra opaca (fenditure, fori) oppure vetro trasparente (ostacoli, reticolo)
    this.slideMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.5, roughness: 0.24 });
    this.slideOpaque = new THREE.Group();
    this._mesh(new THREE.BoxGeometry(1.5, 50, 50).translate(0, H, 0), M.slide, this.slideOpaque);
    for (const s of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(50, 50).rotateY(s * Math.PI / 2).translate(s * 0.78, H, 0), this.slideMat);
      face.receiveShadow = true;
      this.slideOpaque.add(face);
    }
    this.slideClear = new THREE.Group();
    const plate = this._mesh(new THREE.BoxGeometry(1.5, 50, 50).translate(0, H, 0), M.glass, this.slideClear);
    plate.renderOrder = 2;
    this.obstacle = this._mesh(new THREE.BufferGeometry(), M.obstacle, this.slideClear, { cast: false });
    this.gratingMat = new THREE.MeshPhysicalMaterial({ color: '#8fa3b8', metalness: 0.2, roughness: 0.25, transparent: true, opacity: 0.38, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessMinimum: 200, iridescenceThicknessMaximum: 900, side: THREE.DoubleSide, depthWrite: false });
    this.grating = new THREE.Mesh(new THREE.PlaneGeometry(26, 26).rotateY(-Math.PI / 2).translate(-0.8, H, 0), this.gratingMat);
    this.grating.userData.noAO = true; this.grating.renderOrder = 3;
    this.slideClear.add(this.grating);
    g.add(this.slideOpaque, this.slideClear);
    // linguetta con la sigla
    this.tagMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
    this._mesh(new RoundedBoxGeometry(1.2, 13, 46, 1, 0.5).translate(0, H + 43, 0), this.tagMat, g);
    return g;
  }

  /** Aggiorna l'aspetto della diapositiva. el: descrizione dell'elemento (metri), label: testo della linguetta. */
  setElement(el, label) {
    const opaque = el.kind === 'slits' || el.kind === 'holes';
    this.mask.visible = el.kind !== 'none';
    this.slideOpaque.visible = opaque; this.slideClear.visible = !opaque;
    for (const m of [this.slideMat, this.tagMat]) if (m.map) { m.map.dispose(); m.map = null; }
    const mm = 1000;
    if (opaque) {
      // la lastra è disegnata in scala reale: 1024 px = 50 mm (le aperture più fini restano quasi invisibili, come dal vero)
      this.slideMat.map = canvasTexture(1024, 1024, (c, w) => {
        const px = w / 50;
        c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, w, w);
        c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 2; c.strokeRect(60, 60, w - 120, w - 120);
        c.fillStyle = '#f4f6fa';
        for (let j = 0; j < el.n; j++) {
          const x = w / 2 + (j - (el.n - 1) / 2) * el.d * mm * px;
          if (el.kind === 'slits') { const a = Math.max(el.a * mm * px, 1.2); c.fillRect(x - a / 2, w / 2 - 9 * px, a, 18 * px); } else { c.beginPath(); c.arc(x, w / 2, Math.max((el.a / 2) * mm * px, 1.1), 0, TWO_PI); c.fill(); }
        }
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = `500 30px ${MONO}`; c.textAlign = 'center';
        c.fillText(label, w / 2, w - 90);
      });
      this.slideMat.needsUpdate = true;
    } else {
      this.grating.visible = el.kind === 'grating';
      this.obstacle.visible = el.kind === 'wire' || el.kind === 'disc';
      this.obstacle.geometry.dispose();
      if (el.kind === 'wire') this.obstacle.geometry = cyl(Math.max(el.a * mm / 2, 0.03), Math.max(el.a * mm / 2, 0.03), 44, 12).translate(-0.9, H, 0);
      else if (el.kind === 'disc') this.obstacle.geometry = cyl(Math.max(el.a * mm / 2, 0.03), Math.max(el.a * mm / 2, 0.03), 0.3, 40).rotateZ(Math.PI / 2).translate(-0.95, H, 0);
      else this.obstacle.geometry = new THREE.BufferGeometry();
    }
    this.tagMat.map = canvasTexture(512, 144, (c, w, h) => {
      c.fillStyle = '#f3f2ee'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#15181c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 ${label.length > 22 ? 34 : 42}px ${FONT}`;
      c.fillText(label, w / 2, h / 2 + 2);
    });
    this.tagMat.needsUpdate = true;
  }

  // ───────────────────────────── schermo ─────────────────────────────
  _buildScreen() {
    const M = this.M, g = new THREE.Group();
    const c = this._carrier(H - 118, 'screen', 56);
    c.position.x = 9;
    g.add(c);
    const board = this._mesh(new RoundedBoxGeometry(7, 224, 324, 2, 2).translate(3.6, H, 0), M.board, g);
    board.userData.drag = 'screen'; this.dragTargets.push(board);
    const bars = [
      new THREE.BoxGeometry(9, 6, 330).translate(3.6, H + 115, 0), new THREE.BoxGeometry(9, 6, 330).translate(3.6, H - 115, 0),
      new THREE.BoxGeometry(9, 224, 6).translate(3.6, H, 165), new THREE.BoxGeometry(9, 224, 6).translate(3.6, H, -165),
    ].map((b) => b.toNonIndexed());
    this._mesh(mergeGeometries(bars), M.frame, g);
    this._mesh(new RoundedBoxGeometry(14, 16, 40, 2, 2).translate(9, H - 118, 0), M.frame, g);
    // superficie su cui si forma la figura: carta bianca + luce che arriva (texture emissiva calcolata)
    this.paper = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.95, metalness: 0, emissive: '#ffffff', emissiveIntensity: 1 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(300, 200).rotateY(-Math.PI / 2).translate(-0.02, H, 0), this.paper);
    face.receiveShadow = true;
    face.userData.drag = 'screen'; this.dragTargets.push(face);
    g.add(face);
    return g;
  }

  /** Dispone gli elementi lungo la rotaia (coordinate in metri dall'uscita della sorgente). */
  layout({ kind, lensOn, xLens, xMask, xScreen }) {
    this.laser.visible = kind === 'laser'; this.lamp.visible = kind !== 'laser';
    this.lens.visible = lensOn;
    this.lens.position.x = xLens * 1000;
    this.mask.position.x = xMask * 1000;
    this.screen.position.x = xScreen * 1000;
  }
}
