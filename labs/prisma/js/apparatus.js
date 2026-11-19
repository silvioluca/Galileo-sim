// apparatus.js — gli strumenti: lampada spettrale (o laser), piattaforma girevole con il prisma,
// schermo ad arco graduato e spettroscopio a prisma (collimatore, cerchio graduato, cannocchiale).
// Geometria in millimetri, gruppo in metri. In pianta gli angoli crescono in senso antiorario e il
// fascio incidente viaggia lungo +x: la direzione φ corrisponde a (cos φ, 0, −sin φ) nel mondo.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { revolveX, bevelProfile, canvasTexture } from '../../../shared/js/geo.js';

export const AXIS_H = 0.2;                 // altezza del fascio sul pavimento (m)
export const ARC_PHI0 = (-12 * Math.PI) / 180, ARC_PHI1 = (128 * Math.PI) / 180;   // estensione dello schermo ad arco
export const PRISM_H = 0.036;              // altezza del prisma (m)
const H = AXIS_H * 1000;
export const TABLE_TOP = (H - 18) / 1000;      // piano della piattaforma (m)
const TT = H - 18;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const TWO_PI = Math.PI * 2;
const cyl = (r0, r1, h, seg = 36) => new THREE.CylinderGeometry(r0, r1, h, seg);
/** Solido di rivoluzione attorno all'asse verticale: profilo [r, y]. */
const lathe = (pts, seg = 64, crease = 0.5) => revolveX(pts.map(([r, y]) => [y, r]), seg, crease).rotateZ(Math.PI / 2);

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glass = (tint, opacity = 0.07) => new THREE.MeshPhysicalMaterial({
    color: '#0b1a20', roughness: 0.02, metalness: 0, ior: 1.6, specularIntensity: 1, specularColor: tint,
    transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.6,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  return {
    alu: std({ color: '#c6c9cd', metalness: 1, roughness: 0.34 }),
    black: std({ color: '#0e0f11', metalness: 0.75, roughness: 0.38 }),
    satin: std({ color: '#1d1f23', metalness: 0.6, roughness: 0.5 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    steel: std({ color: '#c9ccd0', metalness: 1, roughness: 0.24 }),
    brass: std({ color: '#c9a24e', metalness: 1, roughness: 0.28 }),
    rubber: std({ color: '#0b0b0c', metalness: 0, roughness: 0.86 }),
    enamel: std({ color: '#27303a', metalness: 0.35, roughness: 0.42 }),
    cast: std({ color: '#191b1f', metalness: 0.45, roughness: 0.58 }),
    board: std({ color: '#d9dbde', metalness: 0, roughness: 0.7 }),
    frost: std({ color: '#eef3f6', roughness: 0.92, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false }),
    glass, prism: glass('#d6ecff', 0.08), lens: glass('#c9b4ff', 0.05),
  };
}

function ringScaleTexture() {
  const S = 2048;
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#d5d7da'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.fillStyle = '#16181b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 360; d++) {
      g.save();
      g.rotate((-d * Math.PI) / 180);                   // gradi crescenti in senso antiorario visti dall'alto
      const len = d % 10 === 0 ? 62 : d % 5 === 0 ? 44 : 28;
      g.fillRect(S / 2 - 8 - len, -1.6, len, 3.2);
      if (d % 10 === 0) { g.translate(S / 2 - 108, 0); g.rotate(Math.PI / 2); g.font = `600 44px ${FONT}`; g.fillText(String(d), 0, 0); }
      g.restore();
    }
  }, { aniso: 16 });
}

function arcPaperTexture() {
  const W = 4096, Hh = 620, span = 140;
  return canvasTexture(W, Hh, (g) => {
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, W, Hh);
    const px = W / span;
    g.fillStyle = '#23272e'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (let k = 0; k <= span * 2; k++) {
      // visto dall'interno dell'arco gli angoli crescono verso sinistra: la scala va disegnata da destra
      const d = -12 + k / 2, x = W - k * px * 0.5;
      const whole = k % 2 === 0, major = whole && d % 10 === 0, mid = whole && d % 5 === 0;
      const len = major ? 62 : mid ? 46 : whole ? 30 : 16;
      g.fillRect(x - (major ? 1.6 : 0.9), Hh - len, major ? 3.2 : 1.8, len);
      if (major) { g.font = `600 44px ${MONO}`; g.fillStyle = d === 0 ? '#c2331d' : '#23272e'; g.fillText(`${d}°`, x + (d === 0 ? 0 : 0), Hh - 70); g.fillStyle = '#23272e'; }
    }
    g.strokeStyle = 'rgba(40,46,56,0.16)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, Hh * 0.5); g.lineTo(W, Hh * 0.5); g.stroke();
  }, { aniso: 16 });
}

export class Apparatus {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'strumenti';
    this.group.scale.setScalar(0.001);
    this.M = materials();
    this.dragTargets = [];
    this.simple = new THREE.Group(); this.spectro = new THREE.Group();
    this.lamp = this._buildLamp();
    this.laser = this._buildLaser();
    this.table = this._buildTable();
    this._buildSimple();
    this._buildSpectro();
    this.group.add(this.lamp, this.laser, this.table, this.simple, this.spectro);
  }

  _mesh(geo, mat, parent, drag) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    if (mat.transparent) m.userData.noAO = true;
    if (drag) { m.userData.drag = drag; this.dragTargets.push(m); }
    if (parent) parent.add(m);
    return m;
  }

  _stand(parent, x, z, top, r = 48) {
    const M = this.M;
    this._mesh(lathe([[0, 0], [r, 0], [r, 7], [r - 9, 13], [10, 16], [10, 22], [0, 22]], 48).translate(x, 0, z), M.cast, parent);
    this._mesh(cyl(6, 6, top - 20, 24).translate(x, (top + 20) / 2, z), M.steel, parent);
  }

  // ───────────────────────────── sorgenti ─────────────────────────────
  /** Lampada spettrale con fenditura d'uscita: il fronte è in x = 0 (locale), l'asse ad altezza H. */
  _buildLamp() {
    const M = this.M, g = new THREE.Group();
    this._mesh(new RoundedBoxGeometry(110, 128, 96, 4, 8).translate(-125, H + 6, 0), M.enamel, g);
    const fins = [];
    for (let k = -4; k <= 4; k++) fins.push(new THREE.BoxGeometry(92, 9, 3.2).translate(-125, H + 73, k * 10).toNonIndexed());
    this._mesh(mergeGeometries(fins), M.satin, g);
    this._mesh(revolveX(bevelProfile([[-72, 17], [-3, 17], [-3, 23], [-72, 23]], 0.8, 2), 56).translate(0, H, 0), M.black, g);
    // piastra con la fenditura verticale
    this._mesh(new RoundedBoxGeometry(3, 46, 46, 2, 1).translate(-1.5, H, 0), M.satin, g);
    this.slitGlow = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false });
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 26).rotateY(Math.PI / 2).translate(0.08, H, 0), this.slitGlow));
    // finestra laterale da cui si vede brillare il gas
    this._mesh(revolveX([[0, 15], [3, 15], [3, 19], [0, 19]], 40).rotateY(-Math.PI / 2).translate(-125, H + 14, 48), M.chrome, g);
    g.add(new THREE.Mesh(new THREE.CircleGeometry(15, 32).translate(-125, H + 14, 48.6), this.slitGlow));
    // targhetta con il simbolo dell'elemento
    this.plateMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(54, 26).translate(-125, H - 34, 48.3), this.plateMat);
    plate.receiveShadow = true;
    g.add(plate);
    this._stand(g, -125, 0, H - 56, 56);
    this._mesh(new RoundedBoxGeometry(34, 10, 40, 2, 2).translate(-125, H - 60, 0), M.satin, g);
    const cable = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-180, H - 30, 0], [-204, H - 40, 0], [-222, 110, 10], [-230, 30, 30], [-270, 5, 60], [-420, 3.2, 90], [-620, 3.2, 60]].map((p) => new THREE.Vector3(...p))), 64, 2.6, 10);
    this._mesh(cable, M.rubber, g);
    return g;
  }

  _buildLaser() {
    const M = this.M, g = new THREE.Group();
    this._mesh(revolveX(bevelProfile([[-134, 0], [-134, 19], [-5, 19], [-5, 0]], 1.4, 3), 64).translate(0, H, 0), M.black, g);
    this._mesh(revolveX(bevelProfile([[-5, 3.4], [0, 4.6], [0, 18.4], [-5, 19.05]], 0.5, 2), 64).translate(0, H, 0), M.chrome, g);
    for (const x of [-122, -24]) this._mesh(revolveX([[x, 19.02], [x + 4, 19.02], [x + 4, 19.7], [x, 19.7]], 64).translate(0, H, 0), M.chrome, g);
    this._mesh(revolveX(bevelProfile([[-82, 19.1], [-58, 19.1], [-58, 23.5], [-82, 23.5]], 0.6, 2), 64).translate(0, H, 0), M.satin, g);
    this._mesh(new RoundedBoxGeometry(24, 26, 30, 2, 2).translate(-70, H - 32, 0), M.satin, g);
    this._stand(g, -70, 0, H - 44, 50);
    this.laserGlow = new THREE.MeshBasicMaterial({ color: '#ff2a1a', fog: false });
    g.add(new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateY(Math.PI / 2).translate(-2.2, H, 0), this.laserGlow));
    return g;
  }

  /** Colore e sigla della sorgente. rgb: colore lineare del fascio; symbol: testo della targhetta. */
  setSource(mono, rgb, symbol, name) {
    this.lamp.visible = !mono; this.laser.visible = mono;
    const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
    const c = rgb.map((v) => Math.max(v, 0) / m);
    this.slitGlow.color.setRGB(c[0] * 2.6, c[1] * 2.6, c[2] * 2.6);
    this.laserGlow.color.setRGB(c[0] * 3, c[1] * 3, c[2] * 3);
    if (this.plateMat.map) this.plateMat.map.dispose();
    this.plateMat.map = canvasTexture(512, 246, (g, w, h) => {
      g.fillStyle = '#e9e7e1'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1a1c20'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#15171a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 118px ${FONT}`; g.fillText(symbol, w / 2, h / 2 - 22);
      g.font = `500 34px ${MONO}`; g.fillText(name.toUpperCase(), w / 2, h - 50);
    });
    this.plateMat.needsUpdate = true;
  }

  // ───────────────────────────── piattaforma e prisma ─────────────────────────────
  _buildTable() {
    const M = this.M, g = new THREE.Group();
    this._mesh(lathe([[0, TT - 7], [42.4, TT - 7], [43, TT - 6.4], [43, TT - 0.6], [42.4, TT], [0, TT]], 72), M.black, g, 'prism');
    const top = new THREE.Mesh(new THREE.RingGeometry(27, 42, 96).rotateX(-Math.PI / 2).translate(0, TT + 0.06, 0), new THREE.MeshStandardMaterial({ map: this._tableScale(), metalness: 0.6, roughness: 0.4 }));
    top.receiveShadow = true;
    g.add(top);
    for (let k = 0; k < 3; k++) { const a = (TWO_PI * k) / 3 + 0.5; this._mesh(cyl(3.2, 3.2, 5, 16).translate(36 * Math.cos(a), TT - 9.5, 36 * Math.sin(a)), M.brass, g); }
    this._mesh(cyl(9, 9, 14, 28).translate(0, TT - 14, 0), M.satin, g);
    this.prismGroup = new THREE.Group();
    g.add(this.prismGroup);
    return g;
  }

  _tableScale() {
    const S = 1024;
    return canvasTexture(S, S, (g) => {
      g.fillStyle = '#cfd1d4'; g.fillRect(0, 0, S, S);
      g.translate(S / 2, S / 2);
      g.fillStyle = '#16181b';
      for (let d = 0; d < 360; d += 2) { g.save(); g.rotate((d * Math.PI) / 180); const len = d % 10 === 0 ? 50 : 26; g.fillRect(S / 2 - 6 - len, -2, len, 4); g.restore(); }
    });
  }

  /** Ricostruisce il prisma dalla sezione (vertici in metri, antiorari) e dal materiale. */
  setPrism(verts, tint) {
    const M = this.M, grp = this.prismGroup;
    for (const c of [...grp.children]) { grp.remove(c); c.geometry.dispose(); }
    const y0 = TT + 0.2, y1 = y0 + PRISM_H * 1000;
    const P = verts.map(([x, y]) => [x * 1000, -y * 1000]);          // (x, z) nel mondo
    const side = [], cap = [];
    for (let i = 0; i < 3; i++) {
      const a = P[i], b = P[(i + 1) % 3];
      side.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]);
    }
    for (const y of [y0, y1]) cap.push(P[0][0], y, P[0][1], P[1][0], y, P[1][1], P[2][0], y, P[2][1]);
    const mk = (arr) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals(); return geo; };
    M.prism.specularColor.set(tint);
    const faces = this._mesh(mk(side), M.prism, grp, 'prism');
    faces.renderOrder = 2;
    const caps = this._mesh(mk(cap), M.frost, grp);
    caps.renderOrder = 1;
    // spigoli: un filo di luce che disegna la forma del vetro
    const e = [];
    for (let i = 0; i < 3; i++) { const a = P[i], b = P[(i + 1) % 3]; e.push(a[0], y0, a[1], b[0], y0, b[1], a[0], y1, a[1], b[0], y1, b[1], a[0], y0, a[1], a[0], y1, a[1]); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(e, 3));
    grp.add(new THREE.LineSegments(lg, this._edgeMat || (this._edgeMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false }))));
    this.dragTargets = this.dragTargets.filter((m) => m.parent);
  }

  // ───────────────────────────── prisma e schermo ─────────────────────────────
  _buildSimple() {
    const g = this.simple;
    this._stand(g, 0, 0, TT - 18, 58);
    this.arc = new THREE.Group();
    g.add(this.arc);
    // materiale dello schermo: carta graduata + spettro (texture 1D) limitato alla fascia illuminata
    this.specUniforms = { tSpec: { value: null }, band: { value: new THREE.Vector2(0.5, 0.06) }, specGain: { value: 1 } };
    this.paper = new THREE.MeshStandardMaterial({ map: arcPaperTexture(), roughness: 0.95, metalness: 0, emissive: '#ffffff', side: THREE.DoubleSide });
    this.paper.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.specUniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tSpec; uniform vec2 band; uniform float specGain;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = texture2D( tSpec, vec2( 1.0 - vMapUv.x, 0.5 ) ).rgb * specGain * ( 1.0 - smoothstep( band.y * 0.9, band.y * 1.1, abs( vMapUv.y - band.x ) ) );');
    };
  }

  /** Schermo ad arco di raggio R (m), centrato sulla piattaforma. */
  setArc(R) {
    const M = this.M, grp = this.arc;
    for (const c of [...grp.children]) { grp.remove(c); c.geometry.dispose(); }
    const r = R * 1000, N = 160, y0 = H - 110, y1 = H + 110, t = 4;
    const pos = [], uv = [], idx = [], back = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N, phi = ARC_PHI0 + (ARC_PHI1 - ARC_PHI0) * f, c = Math.cos(phi), s = -Math.sin(phi);
      pos.push(r * c, y0, r * s, r * c, y1, r * s); uv.push(1 - f, 0, 1 - f, 1);
      back.push((r + t) * c, y0, (r + t) * s, (r + t) * c, y1, (r + t) * s);
      if (i < N) { const k = 2 * i; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const face = new THREE.BufferGeometry();
    face.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    face.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    face.setIndex(idx); face.computeVertexNormals();
    const fm = new THREE.Mesh(face, this.paper);
    fm.receiveShadow = true;
    grp.add(fm);
    // dorso e bordo
    const shell = new THREE.BufferGeometry();
    const sp = back.concat(pos), si = [];
    const n2 = 2 * (N + 1);
    for (let i = 0; i < N; i++) {
      const k = 2 * i;
      si.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);                             // dorso
      si.push(k + 1, k + 3, n2 + k + 1, n2 + k + 1, k + 3, n2 + k + 3);         // bordo alto
      si.push(k, n2 + k, k + 2, k + 2, n2 + k, n2 + k + 2);                     // bordo basso
    }
    shell.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    shell.setIndex(si); shell.computeVertexNormals();
    this._mesh(shell, M.board, grp);
    // sostegni
    for (const d of [-6, 58, 122]) {
      const phi = (d * Math.PI) / 180, x = (r + 16) * Math.cos(phi), z = -(r + 16) * Math.sin(phi);
      this._mesh(cyl(5, 5, y0 + 40, 20).translate(x, (y0 + 40) / 2, z), M.steel, grp);
      this._mesh(lathe([[0, 0], [44, 0], [44, 6], [36, 11], [0, 11]], 40).translate(x, 0, z), M.cast, grp);
      this._mesh(new THREE.BoxGeometry(22, 14, 12).translate(r + 8, y0 + 26, 0).rotateY(phi), M.satin, grp);
    }
  }

  // ───────────────────────────── spettroscopio ─────────────────────────────
  _buildSpectro() {
    const M = this.M, g = this.spectro;
    // base e colonna
    this._mesh(lathe([[0, 0], [118, 0], [124, 5], [124, 14], [96, 26], [40, 34], [26, 44], [26, 112], [0, 112]], 96), M.cast, g);
    for (let k = 0; k < 3; k++) { const a = (TWO_PI * k) / 3 + 0.3; this._mesh(cyl(9, 9, 6, 24).translate(104 * Math.cos(a), 31, 104 * Math.sin(a)), M.brass, g); }
    // cerchio graduato
    this._mesh(lathe([[0, 112], [118, 112], [118, 119], [0, 119]], 128), M.alu, g);
    const scale = new THREE.Mesh(new THREE.RingGeometry(74, 117, 160).rotateX(-Math.PI / 2).translate(0, 119.08, 0), new THREE.MeshStandardMaterial({ map: ringScaleTexture(), metalness: 0.55, roughness: 0.42 }));
    scale.receiveShadow = true;
    g.add(scale);
    this._mesh(cyl(30, 34, 46, 48).translate(0, 119 + 23, 0), M.satin, g);
    this._mesh(cyl(12, 12, TT - 7 - 165, 28).translate(0, (TT - 7 + 165) / 2, 0), M.steel, g);

    // collimatore (fisso): fenditura verso la lampada, lente verso il prisma
    const coll = new THREE.Group();
    this._tube(coll, -268, -88, false);
    this._mesh(new RoundedBoxGeometry(16, 12, 150, 2, 2).rotateY(Math.PI / 2).translate(-150, H - 34, 0), M.satin, coll);
    for (const x of [-222, -120]) this._mesh(new RoundedBoxGeometry(12, 22, 16, 2, 2).translate(x, H - 24, 0), M.satin, coll);
    this._mesh(new RoundedBoxGeometry(14, 30, 22, 2, 2).translate(-52, H - 52, 0), M.satin, coll);
    this._mesh(new RoundedBoxGeometry(60, 12, 16, 2, 2).translate(-62, H - 34, 0), M.satin, coll);
    // unità della fenditura con vite micrometrica
    this._mesh(new RoundedBoxGeometry(9, 44, 44, 2, 1.5).translate(-272, H, 0), M.black, coll);
    for (const z of [-7, 7]) this._mesh(new THREE.BoxGeometry(1.2, 30, 11).translate(-277, H, z), M.chrome, coll);
    this._mesh(cyl(6, 6, 12, 24).rotateX(Math.PI / 2).translate(-272, H, 30), M.brass, coll);
    this._mesh(cyl(1.6, 1.6, 10, 12).rotateX(Math.PI / 2).translate(-272, H, 20), M.steel, coll);
    g.add(coll);

    // cannocchiale: ruota attorno all'asse verticale insieme al nonio
    const tel = new THREE.Group();
    this._tube(tel, 88, 258, true);
    this._mesh(new RoundedBoxGeometry(16, 12, 190, 2, 2).rotateY(Math.PI / 2).translate(128, H - 34, 0), M.satin, tel, 'telescope');
    for (const x of [112, 224]) this._mesh(new RoundedBoxGeometry(12, 22, 16, 2, 2).translate(x, H - 24, 0), M.satin, tel, 'telescope');
    this._mesh(new RoundedBoxGeometry(14, 36, 22, 2, 2).translate(46, H - 52, 0), M.satin, tel, 'telescope');
    // oculare
    this._mesh(revolveX(bevelProfile([[258, 9], [296, 9], [296, 13], [258, 13]], 0.6, 2), 48).translate(0, H, 0), M.black, tel, 'telescope');
    this._mesh(revolveX(bevelProfile([[268, 13.1], [282, 13.1], [282, 15.5], [268, 15.5]], 0.5, 2), 48).translate(0, H, 0), M.brass, tel, 'telescope');
    this._mesh(revolveX(bevelProfile([[296, 8], [306, 11], [306, 16], [296, 14]], 0.6, 2), 48).translate(0, H, 0), M.rubber, tel, 'telescope');
    // braccio e nonio sul cerchio
    this._mesh(new RoundedBoxGeometry(70, 6, 30, 2, 1.5).translate(88, 123.5, 0), M.satin, tel, 'telescope');
    this._mesh(new THREE.BoxGeometry(24, 0.6, 1.2).translate(104, 126.8, 0), M.chrome, tel);
    this._mesh(cyl(7, 7, 14, 24).translate(118, 133, 0), M.brass, tel, 'telescope');
    g.add(tel);
    this.telescope = tel;
  }

  /** Tubo ottico lungo x (collimatore o cannocchiale) con la lente dalla parte del prisma. */
  _tube(parent, x0, x1, drag) {
    const M = this.M, key = drag ? 'telescope' : null;
    const inner = Math.abs(x0) < Math.abs(x1) ? x0 : x1, s = Math.sign(inner) || 1;
    this._mesh(revolveX(bevelProfile([[x0, 14.5], [x1, 14.5], [x1, 17], [x0, 17]], 0.6, 2), 64).translate(0, H, 0), M.black, parent, key);
    for (const x of [x0 + 6, x1 - 10]) this._mesh(revolveX([[x, 17.02], [x + 4, 17.02], [x + 4, 17.8], [x, 17.8]], 64).translate(0, H, 0), M.chrome, parent, key);
    // lente acromatica vicino all'estremità interna
    const prof = [], Rc = 60, ra = 13.6;
    const sag = (r) => Rc - Math.sqrt(Rc * Rc - r * r);
    const t = sag(ra) + 0.8, xc = inner + s * 7;
    for (let k = 0; k <= 16; k++) { const r = (ra * k) / 16; prof.push([xc + t - sag(r), r]); }
    for (let k = 16; k >= 0; k--) { const r = (ra * k) / 16; prof.push([xc - t + sag(r), r]); }
    const lens = this._mesh(revolveX(prof, 56, 0.4).translate(0, H, 0), M.lens, parent);
    lens.renderOrder = 2;
  }

  /** mode: 'screen' | 'spectro'; psi: rotazione del prisma; theta: angolo del cannocchiale (rad). */
  layout({ mode, psi, theta }) {
    const spectro = mode === 'spectro';
    this.simple.visible = !spectro; this.spectro.visible = spectro;
    this.table.rotation.y = psi;
    this.telescope.rotation.y = theta;
    const x = spectro ? -284 : -170;
    this.lamp.position.x = x; this.laser.position.x = x;
  }
}
