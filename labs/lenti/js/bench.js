// bench.js — il banco ottico delle lenti: rotaia graduata (lo zero è sull'oggetto), lampada con la lastra (la F o
// il forellino) oppure con il collimatore (oggetto all'infinito), due portalenti, il diaframma a iride e lo
// schermo. Geometria in millimetri, gruppo in metri. Il vetro delle lenti ha la forma vera calcolata da optics.js
// e il materiale di render.js, che mostra quello che si vede attraverso.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { revolveX, bevelProfile, extrudeX, rectShape, roundedRectPath, canvasTexture } from '../../../shared/js/geo.js';
import { sag } from './optics.js';

export const AXIS_H = 0.25;                 // altezza dell'asse ottico sul pavimento (m)
export const RAIL = { x0: -0.24, x1: 1.7 };
const H = AXIS_H * 1000;
const RAIL_TOP = 46;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
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
    blade: std({ color: '#141518', metalness: 0.5, roughness: 0.55 }),
  };
}

const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

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
    g.fillStyle = '#23272e'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = `500 21px ${MONO}`;
    for (let mm = -150; mm <= 150; mm++) {
      const x = W / 2 + mm * px, len = mm % 10 === 0 ? 30 : mm % 5 === 0 ? 20 : 11;
      g.fillRect(x - 0.6, Hh - len, 1.2, len);
      if (mm % 10 === 0 && Math.abs(mm) < 150) g.fillText(String(mm / 10), x, Hh - 34);
    }
    g.textAlign = 'right'; g.fillText('cm', W - 10, Hh - 62);
  }, { aniso: 16 });
}

/** Il tappo col forellino: nero, con un punto di luce al centro (la texture copre 40 mm). */
function pinholeTexture() {
  return canvasTexture(512, 512, (g, W) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    const grd = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, 10);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.6, '#fff'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(W / 2, W / 2, 10, 0, Math.PI * 2); g.fill();
  }, { srgb: false });
}

export class Bench {
  /** lensMat: materiale del vetro (render.js); imageTex: l'immagine accumulata sullo schermo; fTex: la F. */
  constructor(lensMat, imageTex, fTex) {
    this.group = new THREE.Group();
    this.group.name = 'banco ottico';
    this.group.scale.setScalar(0.001);
    this.M = materials();
    this.lensMat = lensMat;
    this.dragTargets = [];
    this._buildRail();
    this.source = this._buildSource(fTex);
    this.lens1 = this._buildLensRider('lens1', true);
    this.lens2 = this._buildLensRider('lens2', false);
    this.screen = this._buildScreen(imageTex);
    this.group.add(this.source, this.lens1.group, this.lens2.group, this.screen);
  }

  _mesh(geo, mat, parent, opts = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = opts.cast !== false && !mat.transparent;
    m.receiveShadow = opts.receive !== false;
    if (parent) parent.add(m);
    return m;
  }

  // ───────────────────────────── rotaia ─────────────────────────────
  _buildRail() {
    const M = this.M, g = new THREE.Group();
    const X0 = RAIL.x0 * 1000, X1 = RAIL.x1 * 1000;
    const s = new THREE.Shape();
    // sezione a coda di rondine nel piano (u, v) = (−z, y)
    [[-38, 20], [38, 20], [38, 26], [26, 26], [31, RAIL_TOP], [4, RAIL_TOP], [4, 43.6], [-4, 43.6], [-4, RAIL_TOP], [-31, RAIL_TOP], [-26, 26], [-38, 26]]
      .forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
    s.closePath();
    this._mesh(extrudeX(s, X0, X1, { crease: 0.5 }), M.alu, g);
    for (const x of [X0 - 4, X1 - 4]) this._mesh(new RoundedBoxGeometry(8, 30, 80, 2, 1.5).translate(x + 4 + (x < 0 ? -4 : 4), 33, 0), M.satin, g);
    for (const x of [X0 + 70, X1 - 70]) {
      this._mesh(new RoundedBoxGeometry(64, 20, 150, 3, 4).translate(x, 10, 0), M.satin, g);
      for (const z of [-60, 60]) {
        this._mesh(cyl(7, 7, 9, 28).translate(x, 24.5, z), M.chrome, g);
        this._mesh(cyl(4.5, 4.5, 3, 20).translate(x, 30.5, z), M.chrome, g);
      }
    }
    // scala millimetrata: lo zero coincide con l'oggetto
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

  /** Cavaliere con portastelo e stelo (origine sull'asse della rotaia, a terra). */
  _carrier(postTop, key, wide = 44) {
    const M = this.M, g = new THREE.Group();
    const add = (geo, mat) => { const m = this._mesh(geo, mat, g); if (key) { m.userData.drag = key; this.dragTargets.push(m); } return m; };
    add(new RoundedBoxGeometry(wide, 21, 80, 3, 2.5).translate(0, RAIL_TOP + 10.7, 0), M.black);
    for (const z of [-36.5, 36.5]) add(new RoundedBoxGeometry(wide, 18, 7, 2, 1.5).translate(0, RAIL_TOP - 7.5, z), M.black);
    add(cyl(2.6, 2.6, 10, 16).rotateX(Math.PI / 2).translate(0, 38, 44), M.steel);
    add(cyl(9, 9, 11, 28).rotateX(Math.PI / 2).translate(0, 38, 53), M.satin);
    add(cyl(7, 9, 2.5, 28).rotateX(Math.PI / 2).translate(0, 38, 59.5), M.satin);
    add(new THREE.BoxGeometry(0.8, 0.5, 9).translate(0, RAIL_TOP + 0.4, 34.5), M.chrome);   // indice sulla scala
    add(cyl(12.5, 12.5, 56, 36).translate(0, RAIL_TOP + 21 + 28, 0), M.black);
    add(cyl(13.4, 13.4, 3.5, 36).translate(0, RAIL_TOP + 21 + 56, 0), M.chrome);
    add(cyl(2.2, 2.2, 12, 14).rotateX(Math.PI / 2).translate(0, RAIL_TOP + 62, 16), M.steel);
    add(cyl(5.5, 5.5, 7, 22).rotateX(Math.PI / 2).translate(0, RAIL_TOP + 62, 24), M.satin);
    const y0 = RAIL_TOP + 60;
    add(cyl(6, 6, postTop - y0, 28).translate(0, (postTop + y0) / 2, 0), M.steel);
    return g;
  }

  _cable(from) {
    const pts = [from, [from[0] - 26, from[1] - 6, 0], [from[0] - 46, from[1] - 90, 8], [from[0] - 52, 46, 26], [from[0] - 90, 6, 60], [from[0] - 210, 3.2, 96], [from[0] - 420, 3.2, 70]]
      .map((p) => new THREE.Vector3(...p));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 2.6, 10);
  }

  // ───────────────────────────── lampada con l'oggetto ─────────────────────────────
  _buildSource(fTex) {
    const M = this.M, g = new THREE.Group();
    const c = this._carrier(H - 56, null); c.position.x = -150; g.add(c);
    this._mesh(new RoundedBoxGeometry(112, 100, 100, 4, 7).translate(-150, H, 0), M.enamel, g);
    const fins = [];
    for (let k = -4; k <= 4; k++) fins.push(new THREE.BoxGeometry(96, 9, 3.2).translate(-150, H + 53, k * 10).toNonIndexed());
    this._mesh(mergeGeometries(fins), M.satin, g);
    this._mesh(new RoundedBoxGeometry(30, 12, 44, 2, 2).translate(-150, H - 54, 0), M.satin, g);
    this._mesh(cyl(6.5, 6.5, 10, 20).rotateZ(Math.PI / 2).translate(-211, H - 20, 0), M.rubber, g);
    this._mesh(this._cable([-215, H - 20, 0]), M.rubber, g);
    // davanti: il condensatore e il portadiapositive (F o forellino) …
    this.slide = new THREE.Group(); g.add(this.slide);
    this._mesh(new RoundedBoxGeometry(84, 66, 66, 3, 4).translate(-52, H, 0), M.black, this.slide);
    const fr = rectShape(-38, 38, H - 38, H + 38, 4);
    fr.holes.push(roundedRectPath(new THREE.Path(), -21, 21, H - 21, H + 21, 1.5));
    this._mesh(extrudeX(fr, -10, -0.6), M.black, this.slide);
    for (const z of [-30, 30]) this._mesh(new RoundedBoxGeometry(1.2, 22, 5, 1, 0.4).translate(-0.2, H + 22, z), M.chrome, this.slide);
    this.plateMat = new THREE.MeshBasicMaterial({ map: fTex, color: new THREE.Color(2.6, 2.4, 2.1), toneMapped: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateY(Math.PI / 2).translate(-1.2, H, 0), this.plateMat);
    plate.userData.noOutline = true;
    this.slide.add(plate);
    this.fTex = fTex; this.pinTex = pinholeTexture();
    // … oppure il collimatore: un tubo con una lente in fondo, la F (o il forellino) nel suo fuoco
    this.collimator = new THREE.Group(); g.add(this.collimator);
    this._mesh(revolveX(bevelProfile([[-96, 0], [-96, 31], [-2, 31], [-2, 0]], 1.2, 3), 64).translate(0, H, 0), M.black, this.collimator);
    this._mesh(revolveX(bevelProfile([[-2, 22.5], [0, 23], [0, 31.6], [-2, 31.6]], 0.4, 2), 64).translate(0, H, 0), M.chrome, this.collimator);
    this.collGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.7, 0.62), toneMapped: false });
    this.collimator.add(new THREE.Mesh(new THREE.CircleGeometry(22.5, 48).rotateY(Math.PI / 2).translate(-1.4, H, 0), this.collGlow));
    return g;
  }

  /** kind: 'F' | 'point' | 'farF' | 'beam'. */
  setObject(kind) {
    if (kind === this._kind) return;
    this._kind = kind;
    const far = kind === 'farF' || kind === 'beam';
    this.slide.visible = !far; this.collimator.visible = far;
    this.plateMat.map = kind === 'point' ? this.pinTex : this.fTex;
    this.plateMat.color.setRGB(...(kind === 'point' ? [4, 3.7, 3.2] : [2.6, 2.4, 2.1]));
    this.plateMat.needsUpdate = true;
    this.collGlow.color.setRGB(...(kind === 'beam' ? [1.1, 1.03, 0.92] : [0.75, 0.7, 0.62]));
  }

  // ───────────────────────────── portalenti ─────────────────────────────
  _buildLensRider(key, withIris) {
    const M = this.M, g = new THREE.Group();
    g.add(this._carrier(H - 46, key));
    const r = { group: g, key, glass: new THREE.Group(), ring: null, block: null, iris: null };
    g.add(r.glass);
    if (withIris) {
      r.iris = new THREE.Group(); g.add(r.iris);
      r.irisMesh = this._mesh(new THREE.BufferGeometry(), M.blade, r.iris);
      r.lever = this._mesh(new RoundedBoxGeometry(2.4, 12, 3.2, 1, 0.6), M.steel, r.iris);
    }
    return r;
  }

  /** Il vetro della lente (forma vera, in metri da optics.makeLens) e il suo anello. */
  setLens(rider, lens) {
    const M = this.M, mm = 1000, a = lens.a * mm;
    for (const c of [...rider.glass.children]) { rider.glass.remove(c); c.geometry.dispose(); }
    const n = 40;
    for (let i = 0; i < lens.surfaces.length - 1; i++) {
      const s0 = lens.surfaces[i], s1 = lens.surfaces[i + 1], prof = [];
      for (let k = 0; k <= n; k++) { const r = (a * k) / n; prof.push([s0.dx * mm + sag(s0.c, r / mm) * mm, r]); }
      for (let k = n; k >= 0; k--) { const r = (a * k) / n; prof.push([s1.dx * mm + sag(s1.c, r / mm) * mm, r]); }
      const m = new THREE.Mesh(revolveX(prof, 128, 0.35).translate(0, H, 0), this.lensMat);
      m.renderOrder = 2; m.userData.noOutline = true;
      rider.glass.add(m);
    }
    // anello: abbraccia il bordo del vetro
    const e0 = Math.min(...lens.surfaces.map((s) => s.dx * mm + sag(s.c, lens.a) * mm)) - 1.2;
    const e1 = Math.max(...lens.surfaces.map((s) => s.dx * mm + sag(s.c, lens.a) * mm)) + 1.2;
    const w0 = Math.min(e0, -4), w1 = Math.max(e1, 4);
    for (const m of [rider.ring, rider.lip, rider.block]) if (m) { rider.group.remove(m); m.geometry.dispose(); }
    this.dragTargets = this.dragTargets.filter((m) => m.parent);
    rider.ring = this._mesh(revolveX(bevelProfile([[w0, a + 0.2], [w1, a + 0.2], [w1, a + 9], [w0, a + 9]], 0.7, 3), 128).translate(0, H, 0), M.black, rider.group);
    rider.lip = this._mesh(revolveX([[w1, a - 0.8], [w1 + 0.8, a - 0.8], [w1 + 0.8, a + 3], [w1, a + 3]], 128).translate(0, H, 0), M.chrome, rider.group);
    const yb = H - a - 9;
    rider.block = this._mesh(new RoundedBoxGeometry(11, yb - (H - 47), 16, 2, 1.5).translate(0, (yb + H - 47) / 2 + 0.5, 0), M.black, rider.group);
    for (const m of [rider.ring, rider.block]) { m.userData.drag = rider.key; this.dragTargets.push(m); }
    rider.back = w1 + 0.8;
    rider.a = a;
  }

  /** Diaframma a iride sul lato dello schermo della prima lente: raggio d'apertura (m), o null se tutto aperto. */
  setIris(rM) {
    const r = this.lens1;
    const a = r.a, open = rM === null || rM * 1000 >= a - 0.05;
    r.iris.visible = !open;
    if (open) return;
    const key = `${rM}|${a}|${r.back}`;
    if (key === r.irisKey) return;
    r.irisKey = key;
    const R = Math.max(a + 9, 30), x = r.back + 1.5;
    const s = new THREE.Shape(); s.absarc(0, H, R, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, H, rM * 1000, 0, Math.PI * 2, true); s.holes.push(hole);
    r.irisMesh.geometry.dispose();
    r.irisMesh.geometry = extrudeX(s, x, x + 1.2, { curveSegments: 96 });
    r.lever.position.set(x + 0.6, H + R + 4, 0);
    r.irisX = (x + 0.6) / 1000;
  }

  // ───────────────────────────── schermo ─────────────────────────────
  _buildScreen(imageTex) {
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
    // la carta: luce della stanza più la luce che arriva dalla lente (texture emissiva accumulata)
    this.paper = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.95, metalness: 0, emissive: '#ffffff', emissiveMap: imageTex, emissiveIntensity: 0 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(300, 200).rotateY(-Math.PI / 2).translate(-0.02, H, 0), this.paper);
    face.receiveShadow = true;
    face.userData.drag = 'screen'; this.dragTargets.push(face);
    g.add(face);
    return g;
  }

  /** Dispone gli elementi lungo la rotaia (metri dall'oggetto). */
  layout({ x1, x2, lens2, xs, screen }) {
    this.lens1.group.position.x = x1 * 1000;
    this.lens2.group.visible = lens2;
    this.lens2.group.position.x = x2 * 1000;
    this.screen.visible = screen;
    this.screen.position.x = xs * 1000;
  }
}
