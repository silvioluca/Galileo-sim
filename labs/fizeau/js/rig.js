// rig.js — l'apparato di Fizeau ricostruito su due tavoli ottici. A Suresnes: lampada, condensatore,
// lamina semiriflettente, ruota dentata nel fuoco con il suo meccanismo e il contagiri, obiettivo, oculare.
// A Montmartre: obiettivo e specchio nel fuoco. In mezzo 8,6 km di aria, accorciati nella scena.
// Il fascio è fatto di tratti (coni e cilindri) con uno shader che calcola, punto per punto, quale vano
// della ruota ha attraversato quella luce: così, al rallentatore, si vedono gli impulsi andare e tornare.
// Unità: metri. Asse ottico lungo x, all'altezza Y0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { revolveX, canvasTexture } from '../../../shared/js/geo.js';

export const Y0 = 1.0;
export const F_OBJ = 0.42;                                       // focale dei due obiettivi
export const NEAR = { eye: -0.98, split: -0.72, wheel: -0.36, obj: -0.36 + F_OBJ };
export const LAMP = { x: NEAR.split, z: -0.3, cond: -0.17 };
export const FAR = { obj: 3.75, mirror: 3.75 + F_OBJ };
export const WHEEL = { R: 0.06, r0: 0.0535, rb: 0.057 };        // raggio, piede dei denti, raggio del fascio
export const WHEEL_M = { R: 0.2, r0: 0.193, rb: 0.197 };         // la ruota d'alluminio della versione moderna
export const BEAM_R = 0.03;                                      // raggio del fascio parallelo
export const BREAK_X = (NEAR.obj + FAR.obj) / 2;
const NA = BEAM_R / F_OBJ;
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    brass: std({ color: '#c9a24c', metalness: 1, roughness: 0.26 }),
    brassDark: std({ color: '#a0792f', metalness: 1, roughness: 0.38 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    black: std({ color: '#121315', metalness: 0.5, roughness: 0.42 }),
    iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
    walnut: phys({ color: '#5b3520', roughness: 0.48, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    walnutDark: phys({ color: '#3e2414', roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    glass: phys({ color: '#d8ecf0', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
    mirror: std({ color: '#f2f3f4', metalness: 1, roughness: 0.03 }),
    felt: std({ color: '#2d3a2f', metalness: 0, roughness: 1 }),
  };
}

// ───────────────────────────── luce: tratti di fascio con impulsi ─────────────────────────────
const BEAM_VS = /* glsl */ `
varying float vT; varying vec3 vN; varying vec3 vV;
void main() {
  vT = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = /* glsl */ `
uniform float uU, uK, uD2, uMix, uAvgOut, uAvgRet, uAvgEnd, uW, uDuty, uGain, uOn;
uniform float p0, p1, wOut, wRet, wEnd, chop;
uniform vec3 uColor;
varying float vT; varying vec3 vN; varying vec3 vV;
// trasmissione della ruota per la fase u (vano centrato sugli interi)
float G(float u) { float d = abs(fract(u + 0.5) - 0.5); return smoothstep(uDuty * 0.5 + uW, uDuty * 0.5 - uW, d); }
void main() {
  float p = mix(p0, p1, vT);
  float b;
  if (chop < 0.5) b = 1.0;
  else {
    float o = G(uU - uK * p), r = G(uU - uK * (uD2 - p)), e = G(uU - uK * uD2) * G(uU);
    o = mix(o, uAvgOut, uMix); r = mix(r, uAvgRet, uMix); e = mix(e, uAvgEnd, uMix);
    b = wOut * o + wRet * r + wEnd * e;
  }
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float a = b * uGain * uOn * pow(facing, 1.6);
  gl_FragColor = vec4(uColor * a, a);
}`;

/** Bagliore radiale (sprite). */
function glowTexture() {
  return canvasTexture(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,244,220,0.8)'); gr.addColorStop(0.5, 'rgba(255,220,170,0.18)'); gr.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}

/** Scala del contagiri (0..max giri al secondo). */
function dialTexture(max) {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#f1ebdc'; g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a14'; g.lineWidth = 8; g.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const step = max <= 40 ? 5 : max <= 100 ? 10 : max <= 200 ? 20 : 50;
    g.fillStyle = '#1d140a'; g.strokeStyle = '#1d140a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max + 1e-9; v += step / 5) {
      const a = a0 + ((a1 - a0) * v) / max, major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      g.lineWidth = major ? 6 : 3;
      g.beginPath(); g.moveTo(c + Math.cos(a) * (c - 20), c + Math.sin(a) * (c - 20)); g.lineTo(c + Math.cos(a) * (c - (major ? 62 : 42)), c + Math.sin(a) * (c - (major ? 62 : 42))); g.stroke();
      if (major) { g.font = `600 40px ${FONT}`; g.fillText(String(Math.round(v)), c + Math.cos(a) * (c - 105), c + Math.sin(a) * (c - 105)); }
    }
    g.font = `600 30px ${MONO}`; g.fillStyle = '#6a5636'; g.fillText('GIRI / s', c, c + 120);
  }, { aniso: 8 });
}

/** Piano forato del tavolo ottico: fori M6 ogni 25 mm (16 × 16 per piastrella di 40 cm). */
function breadboardTexture() {
  return canvasTexture(1024, 1024, (g, w) => {
    const gr = g.createLinearGradient(0, 0, w, w);
    gr.addColorStop(0, '#cdd1d6'); gr.addColorStop(1, '#bfc4ca');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.globalAlpha = 0.06; g.fillStyle = '#ffffff';
    for (let y = 0; y < w; y += 2) g.fillRect(0, y, w, 1);
    g.globalAlpha = 1;
    const p = w / 16;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      const cx = (i + 0.5) * p, cy = (j + 0.5) * p;
      g.fillStyle = '#8e949b'; g.beginPath(); g.arc(cx, cy, p * 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b2f34'; g.beginPath(); g.arc(cx + 0.6, cy + 0.6, p * 0.13, 0, Math.PI * 2); g.fill();
    }
  }, { aniso: 16, repeat: true });
}
/** Faccia della ruota tornita: anelli concentrici sottili. */
function latheTexture() {
  return canvasTexture(1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#d9dce0'; g.fillRect(0, 0, w, w);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let r = 4; r < c; r += 1.5) {
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(90,96,104,0.14)';
      g.lineWidth = 0.8 + rnd(); g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    }
  }, { aniso: 16 });
}

function labelTexture(text, bg, fg, w = 512, h = 96, size = 50) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `italic 600 ${size}px "Fraunces Variable", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Fizeau';
    this.M = materials();
    // valori comuni a tutti i tratti di fascio
    this.U = {
      uU: { value: 0 }, uK: { value: 0 }, uD2: { value: 17000 }, uMix: { value: 1 }, uAvgOut: { value: 0.5 }, uAvgRet: { value: 0.5 }, uAvgEnd: { value: 0.25 },
      uW: { value: 0.02 }, uDuty: { value: 0.5 }, uGain: { value: 1 }, uOn: { value: 1 }, uColor: { value: new THREE.Color('#ffe2b0') },
    };
    this.segs = [];
    this.glowTex = glowTexture();
    this.toothU = { uN: { value: 720 }, uDuty: { value: 0.5 }, uBlur: { value: 0 } };
    // due apparati sullo stesso asse ottico: quello di Fizeau (1849) e una versione moderna
    this.hist = new THREE.Group(); this.hist.name = 'Fizeau 1849';
    this.mod = new THREE.Group(); this.mod.name = 'versione moderna';
    this.group.add(this.hist, this.mod);
    this.root = this.hist;
    this._buildTables();
    this._buildLamp();
    this._buildSplitter();
    this._buildWheel();
    this._buildObjectives();
    this._buildEyepiece();
    this.root = this.mod;
    this._buildModern();
    this.root = this.group;
    this._buildGlows();
    this._buildBreak();
    this._buildBeams();
    this.setApparatus(false);
  }

  /** Corona dentata: i vani sono buchi calcolati nello shader (angolo nel piano y–z del gruppo). */
  _toothMat(color, roughness) {
    const tm = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, side: THREE.DoubleSide, transparent: true });
    tm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.toothU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; uniform float uN, uDuty, uBlur;')
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
          float uh = uN * atan(vLoc.z, vLoc.y) / 6.2831853;
          float dist = abs(fract(uh + 0.5) - 0.5);
          float w = max(fwidth(uh), uBlur);
          float tooth = smoothstep(uDuty * 0.5 - 0.5 * w, uDuty * 0.5 + 0.5 * w, dist);
          tooth = mix(tooth, 1.0 - uDuty, smoothstep(0.35, 0.8, w));
          diffuseColor.a *= tooth;
          if (diffuseColor.a < 0.02) discard;`);
    };
    return tm;
  }

  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.root).add(m);
    return m;
  }

  // ───────────────────────────── tavoli e binari ─────────────────────────────
  _table(x0, x1, z0, z1) {
    const M = this.M, top = Y0 - 0.2;
    this._mesh(new RoundedBoxGeometry(x1 - x0, 0.045, z1 - z0, 3, 0.008).translate((x0 + x1) / 2, top - 0.0225, (z0 + z1) / 2), M.walnut);
    this._mesh(new THREE.BoxGeometry(x1 - x0 - 0.12, 0.08, z1 - z0 - 0.12).translate((x0 + x1) / 2, top - 0.085, (z0 + z1) / 2), M.walnutDark);
    const legs = [[x0 + 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z0 + 0.08], [x1 - 0.08, z1 - 0.08]];
    const prof = [[0, 0], [0.032, 0], [0.034, 0.02], [0.026, 0.05], [0.022, 0.3], [0.028, 0.36], [0.03, 0.4], [0.024, 0.46], [0.022, top - 0.17], [0.03, top - 0.15], [0.03, top - 0.045], [0, top - 0.045]];
    const leg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    for (const [x, z] of legs) this._mesh(leg.clone().translate(x, 0, z), M.walnutDark);
    return top;
  }
  _rail(x0, x1, z, top, alongZ = false) {
    const g = alongZ ? new THREE.BoxGeometry(0.05, 0.025, x1 - x0).translate(z, top + 0.0125, (x0 + x1) / 2) : new THREE.BoxGeometry(x1 - x0, 0.025, 0.05).translate((x0 + x1) / 2, top + 0.0125, z);
    this._mesh(g, this.M.black);
  }
  /** Cavaliere sul binario con un'asta fino all'asse ottico. */
  _post(x, z, top, h = Y0 - 0.03, parent = null) {
    const M = this.M;
    this._mesh(new RoundedBoxGeometry(0.05, 0.022, 0.07, 2, 0.004).translate(x, top + 0.036, z), M.iron, parent);
    this._mesh(cyl(0.007, 0.007, h - top - 0.047, 16).translate(x, (h + top + 0.047) / 2, z), M.chrome, parent);
  }
  _buildTables() {
    this.topNear = this._table(-1.16, 0.2, -0.42, 0.3);
    this.topFar = this._table(FAR.obj - 0.28, FAR.mirror + 0.2, -0.3, 0.3);
    this._rail(-1.12, 0.16, 0, this.topNear);
    this._rail(-0.4, -0.06, LAMP.x, this.topNear, true);
    this._rail(FAR.obj - 0.22, FAR.mirror + 0.14, 0, this.topFar);
    // targhette dei due luoghi
    const plq = (text, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.05), new THREE.MeshStandardMaterial({ map: labelTexture(text, '#c9a24c', '#2a1d0a'), metalness: 0.8, roughness: 0.35 }));
      m.position.set(x, Y0 - 0.2 - 0.045, z + 0.0006); this.root.add(m);
    };
    plq('Suresnes', -0.5, 0.3); plq('Montmartre', (FAR.obj + FAR.mirror) / 2, 0.3);
  }

  // ───────────────────────────── lampada e condensatore ─────────────────────────────
  _buildLamp() {
    const M = this.M, g = new THREE.Group(), top = this.topNear;
    g.position.set(LAMP.x, 0, LAMP.z);
    this.root.add(g);
    this._post(0, 0, top, Y0 - 0.06, g);
    // corpo della lampada (verticale), camino, apertura verso +z
    this._mesh(cyl(0.042, 0.042, 0.12, 40).translate(0, Y0, 0), M.brassDark, g);
    this._mesh(cyl(0.02, 0.026, 0.07, 24).translate(0, Y0 + 0.095, 0), M.brassDark, g);
    for (let k = 0; k < 6; k++) this._mesh(new THREE.BoxGeometry(0.004, 0.012, 0.004).translate(0.022 * Math.cos(k), Y0 + 0.136, 0.022 * Math.sin(k)), M.black, g);
    this._mesh(cyl(0.017, 0.017, 0.03, 24).rotateX(Math.PI / 2).translate(0, Y0, 0.05), M.brass, g);
    this.lampFace = new THREE.Mesh(new THREE.CircleGeometry(0.014, 32), new THREE.MeshBasicMaterial({ color: '#fff3d8', toneMapped: false }));
    this.lampFace.position.set(0, Y0, 0.0651); g.add(this.lampFace);
    this.lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffe0b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.lampGlow.scale.setScalar(0.16); this.lampGlow.position.set(0, Y0, 0.07); this.lampGlow.userData.noAO = true;
    g.add(this.lampGlow);
    // condensatore
    const zc = LAMP.cond - LAMP.z;
    this._post(0, zc, top, Y0 - 0.04, g);
    this._lens(0.032, 0.012, [0, Y0, zc], 'z', g);
  }

  /** Lente biconvessa di raggio r e spessore t in una montatura d'ottone, con asse lungo 'x' o 'z'. */
  _lens(r, t, pos, axis, parent, mount) {
    const M = this.M, g = new THREE.Group();
    g.position.set(...pos);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    const prof = [];
    for (let i = 0; i <= 16; i++) { const y = (r * i) / 16; prof.push([-(t / 2) * (1 - (y / r) ** 2) - 0.0008, y]); }
    for (let i = 16; i >= 0; i--) { const y = (r * i) / 16; prof.push([(t / 2) * (1 - (y / r) ** 2) + 0.0008, y]); }
    const lens = new THREE.Mesh(revolveX(prof, 48, 0.4), M.glass); lens.renderOrder = 2;
    g.add(lens);
    this._mesh(revolveX([[-0.006, r - 0.001], [-0.006, r + 0.006], [0.006, r + 0.006], [0.006, r - 0.001]], 48, 0.6), mount || M.brass, g);
    (parent || this.root).add(g);
    return g;
  }

  // ───────────────────────────── lamina semiriflettente ─────────────────────────────
  _buildSplitter() {
    const M = this.M, g = new THREE.Group(), top = this.topNear;
    g.position.set(NEAR.split, Y0, 0);
    this.root.add(g);
    this._post(NEAR.split, 0, top, Y0 - 0.05);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.07, 0.07), new THREE.MeshPhysicalMaterial({ color: '#cfe6ee', metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.42, clearcoat: 1, depthWrite: false }));
    plate.rotation.y = -Math.PI / 4; plate.renderOrder = 3;
    g.add(plate);
    // cornice d'ottone
    const fr = new THREE.Group(); fr.rotation.y = -Math.PI / 4; g.add(fr);
    for (const s of [1, -1]) {
      this._mesh(new THREE.BoxGeometry(0.006, 0.006, 0.078).translate(0, s * 0.038, 0), M.brass, fr);
      this._mesh(new THREE.BoxGeometry(0.006, 0.078, 0.006).translate(0, 0, s * 0.038), M.brass, fr);
    }
    this._mesh(cyl(0.006, 0.006, 0.012, 12).translate(0, -0.044, 0), M.brass, g);
  }

  // ───────────────────────────── ruota dentata e meccanismo ─────────────────────────────
  _buildWheel() {
    const M = this.M, top = this.topNear, x = NEAR.wheel, yc = Y0 - WHEEL.rb;
    // la ruota: disco pieno d'ottone + corona dentata (shader)
    const wheel = new THREE.Group();
    wheel.position.set(x, yc, 0);
    this.root.add(wheel);
    this.wheel = wheel;
    this._mesh(cyl(WHEEL.r0, WHEEL.r0, 0.0012, 96).rotateZ(Math.PI / 2), M.brass, wheel);
    this._mesh(cyl(0.012, 0.012, 0.008, 32).rotateZ(Math.PI / 2), M.brassDark, wheel);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      this._mesh(cyl(0.0022, 0.0022, 0.0016, 12).rotateZ(Math.PI / 2).translate(0, 0.03 * Math.cos(a), 0.03 * Math.sin(a)), M.black, wheel);
    }
    const tm = this._toothMat('#c9a24c', 0.3);
    const ring = new THREE.Mesh(new THREE.RingGeometry(WHEEL.r0 - 0.0002, WHEEL.R, 720, 1).rotateY(Math.PI / 2), tm);
    ring.castShadow = true; ring.receiveShadow = true; ring.renderOrder = 1;
    wheel.add(ring);
    this.toothMat = tm;
    // albero e meccanismo a orologeria (cassetta di legno con ingranaggi e contagiri)
    this._mesh(cyl(0.004, 0.004, 0.06, 16).rotateZ(Math.PI / 2).translate(x - 0.03, yc, 0), M.chrome);
    const bx0 = x - 0.28, bx1 = x - 0.045, by0 = top + 0.01, by1 = Y0 - 0.03;
    this._mesh(new RoundedBoxGeometry(bx1 - bx0, by1 - by0, 0.12, 3, 0.006).translate((bx0 + bx1) / 2, (by0 + by1) / 2, 0), M.walnutDark);
    // ingranaggi sul fianco anteriore
    this.gears = [];
    for (const [gx, gy, r, n] of [[bx0 + 0.06, by0 + 0.06, 0.04, 40], [bx0 + 0.13, by1 - 0.045, 0.024, 24]]) {
      const gg = new THREE.Group(); gg.position.set(gx, gy, 0.061); this.root.add(gg);
      this._mesh(cyl(r, r, 0.004, n * 2).rotateX(Math.PI / 2), M.brass, gg);
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; this._mesh(new THREE.BoxGeometry(0.004, 0.006, 0.004).translate((r + 0.002) * Math.cos(a), (r + 0.002) * Math.sin(a), 0).rotateZ(0), M.brass, gg).castShadow = false; }
      for (let k = 0; k < 4; k++) this._mesh(new THREE.BoxGeometry(r * 1.6, 0.004, 0.0045).rotateZ((k * Math.PI) / 4), M.brassDark, gg);
      this._mesh(cyl(0.005, 0.005, 0.008, 16).rotateX(Math.PI / 2), M.chrome, gg);
      this.gears.push({ g: gg, r });
    }
    // contagiri
    const dc = new THREE.Vector3(bx1 - 0.06, (by0 + by1) / 2 - 0.005, 0.0605);
    this._mesh(cyl(0.046, 0.046, 0.006, 48).rotateX(Math.PI / 2).translate(dc.x, dc.y, dc.z - 0.002), M.brass);
    this.dialMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.041, 64), this.dialMat);
    face.position.set(dc.x, dc.y, dc.z + 0.0012); this.root.add(face);
    this.needle = new THREE.Group(); this.needle.position.set(dc.x, dc.y, dc.z + 0.0025); this.root.add(this.needle);
    this._mesh(new THREE.BoxGeometry(0.034, 0.0022, 0.0008).translate(0.014, 0, 0), new THREE.MeshStandardMaterial({ color: '#a8261a', roughness: 0.5 }), this.needle);
    this._mesh(cyl(0.004, 0.004, 0.002, 16).rotateX(Math.PI / 2), M.brassDark, this.needle);
    this.dialMax = 0;
    // supporto della cassetta sul binario
    this._mesh(new RoundedBoxGeometry(0.08, 0.022, 0.07, 2, 0.004).translate((bx0 + bx1) / 2, top + 0.036, 0), M.iron);
  }

  /** Bagliori comuni ai due apparati: sul dente colpito dalla luce di ritorno, sullo specchio, all'oculare. */
  _buildGlows() {
    const sprite = (pos, scale) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffe8c0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
      s.scale.setScalar(scale); s.position.set(...pos); s.userData.noAO = true;
      this.group.add(s);
      return s;
    };
    this.toothGlow = sprite([NEAR.wheel + 0.0015, Y0, 0], 0.035);
    this.mirrorGlow = sprite([FAR.mirror - 0.002, Y0, 0], 0.05);
    this.eyeGlow = sprite([NEAR.eye + 0.03, Y0, 0], 0.04);
  }

  /** Fase u della ruota (in passi; u intero = vano sul fascio), denti N, sfocatura del moto (passi per fotogramma). */
  setWheel(u, N, blur, f, fMax, slowGear) {
    this.toothU.uN.value = N; this.toothU.uBlur.value = blur;
    const a = (-2 * Math.PI * (((u % N) + N) % N)) / N;
    this.wheel.rotation.x = a;
    this.wheelM.rotation.x = Math.PI / 2 + a;
    // il LED del tachimetro si accende quando l'adesivo passa sotto il raggio
    const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    this.tachoLed.material.color.set(off < 0.06 || (f > 0 && blur > 2 && Math.random() < 0.3) ? '#ff3a24' : '#3a1010');
    this.setTacho(f);
    const max = Math.max(10, fMax);
    if (max !== this.dialMax) { this.dialMax = max; if (this.dialMat.map) this.dialMat.map.dispose(); this.dialMat.map = dialTexture(max); this.dialMat.needsUpdate = true; }
    this.needle.rotation.z = -(Math.PI * 0.75 + (Math.PI * 1.5 * Math.min(f, max)) / max);
    this.gears.forEach((g, i) => { g.g.rotation.z = slowGear * (i ? -2.4 : 1); });
  }

  // ───────────────────────────── obiettivi e specchio ─────────────────────────────
  _buildObjectives() {
    const M = this.M;
    // Suresnes: obiettivo con paraluce verso Montmartre
    this._post(NEAR.obj, 0, this.topNear, Y0 - 0.045);
    this._lens(0.034, 0.012, [NEAR.obj, Y0, 0], 'x');
    this._mesh(revolveX([[0.006, 0.041], [0.006, 0.044], [0.11, 0.044], [0.11, 0.041]], 48, 0.6).translate(NEAR.obj, Y0, 0), M.brassDark);
    // Montmartre: obiettivo, specchio nel fuoco
    const tf = this.topFar;
    this._post(FAR.obj, 0, tf, Y0 - 0.045);
    this._lens(0.034, 0.012, [FAR.obj, Y0, 0], 'x');
    this._mesh(revolveX([[-0.11, 0.041], [-0.11, 0.044], [-0.006, 0.044], [-0.006, 0.041]], 48, 0.6).translate(FAR.obj, Y0, 0), M.brassDark);
    this._post(FAR.mirror + 0.012, 0, tf, Y0 - 0.02);
    this._mesh(cyl(0.016, 0.016, 0.008, 40).rotateZ(Math.PI / 2).translate(FAR.mirror + 0.006, Y0, 0), M.brass);
    this._mesh(new THREE.CircleGeometry(0.012, 40).rotateY(-Math.PI / 2).translate(FAR.mirror + 0.0018, Y0, 0), M.mirror);
  }

  _buildEyepiece() {
    const M = this.M;
    this._post(NEAR.eye, 0, this.topNear, Y0 - 0.025);
    this._mesh(revolveX([[-0.06, 0], [-0.06, 0.016], [0.02, 0.016], [0.02, 0.019], [0.03, 0.019], [0.03, 0]], 40, 0.6).translate(NEAR.eye, Y0, 0), M.brass);
    this._mesh(revolveX([[-0.085, 0.011], [-0.085, 0.02], [-0.06, 0.02], [-0.06, 0.011]], 40, 0.6).translate(NEAR.eye, Y0, 0), M.black);
    this._mesh(new THREE.CircleGeometry(0.014, 32).rotateY(-Math.PI / 2).translate(NEAR.eye - 0.0605, Y0, 0), M.glass);
  }

  // ───────────────────────────── versione moderna ─────────────────────────────
  /** Tavolo ottico: piano d'alluminio forato (passo 25 mm) su un telaio d'acciaio. */
  _breadboard(x0, x1, z0, z1) {
    const top = Y0 - 0.2, w = x1 - x0, d = z1 - z0;
    const map = breadboardTexture(); map.repeat.set(w / 0.4, d / 0.4);
    const alu = new THREE.MeshStandardMaterial({ color: '#d4d7db', metalness: 0.85, roughness: 0.38 });
    const face = new THREE.MeshStandardMaterial({ map, metalness: 0.8, roughness: 0.42 });
    this._mesh(new THREE.BoxGeometry(w, 0.06, d).translate((x0 + x1) / 2, top - 0.03, (z0 + z1) / 2), [alu, alu, face, alu, alu, alu]);
    const steel = new THREE.MeshStandardMaterial({ color: '#25282d', metalness: 0.6, roughness: 0.45 });
    for (const [x, z] of [[x0 + 0.06, z0 + 0.06], [x0 + 0.06, z1 - 0.06], [x1 - 0.06, z0 + 0.06], [x1 - 0.06, z1 - 0.06]]) {
      this._mesh(new THREE.BoxGeometry(0.05, top - 0.07, 0.05).translate(x, (top - 0.06) / 2 + 0.01, z), steel);
      this._mesh(cyl(0.028, 0.03, 0.012, 24).translate(x, 0.006, z), this.M.black);
    }
    this._mesh(new THREE.BoxGeometry(w - 0.12, 0.04, 0.04).translate((x0 + x1) / 2, 0.2, z0 + 0.06), steel);
    this._mesh(new THREE.BoxGeometry(w - 0.12, 0.04, 0.04).translate((x0 + x1) / 2, 0.2, z1 - 0.06), steel);
    return top;
  }
  /** Colonnina moderna: base con morsetto, portacolonna nero, colonnina d'acciaio fino a h. */
  _postM(x, z, top, h) {
    const M = this.M;
    this._mesh(new RoundedBoxGeometry(0.05, 0.008, 0.06, 2, 0.002).translate(x, top + 0.004, z), M.black);
    this._mesh(cyl(0.0125, 0.0125, 0.06, 24).translate(x, top + 0.038, z), M.black);
    this._mesh(cyl(0.006, 0.006, h - top - 0.05, 16).translate(x, (h + top + 0.05) / 2, z), M.chrome);
  }
  /** Tubo di telescopio nero da x0 a x1, con due collari e i pomelli di bloccaggio. */
  _tube(x0, x1, r) {
    const M = this.M;
    const black = new THREE.MeshStandardMaterial({ color: '#16181b', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide });
    this._mesh(revolveX([[x0, r - 0.003], [x0, r], [x1, r], [x1, r - 0.003]], 64, 0.6).translate(0, Y0, 0), black);
    for (const xc of [x0 + 0.06, x1 - 0.06]) {
      this._mesh(revolveX([[xc - 0.018, r], [xc - 0.018, r + 0.008], [xc + 0.018, r + 0.008], [xc + 0.018, r]], 64, 0.6).translate(0, Y0, 0), M.black);
      this._mesh(cyl(0.004, 0.004, 0.02, 12).translate(xc, Y0 + r + 0.018, 0), M.chrome);
      this._mesh(cyl(0.011, 0.011, 0.006, 20).translate(xc, Y0 + r + 0.03, 0), M.black);
      this._mesh(new THREE.BoxGeometry(0.03, Y0 - r - (Y0 - 0.2) - 0.06, 0.03).translate(xc, (Y0 - r + Y0 - 0.2 + 0.06) / 2, 0), M.black);
      this._mesh(new RoundedBoxGeometry(0.05, 0.03, 0.09, 2, 0.004).translate(xc, Y0 - 0.2 + 0.045, 0), M.black);
    }
  }
  _buildModern() {
    const M = this.M, W = WHEEL_M, x = NEAR.wheel, zc = -W.rb;
    const top = this._breadboard(-1.2, 0.24, -0.52, 0.32);
    const topF = this._breadboard(FAR.obj - 0.3, FAR.mirror + 0.22, -0.3, 0.3);
    // laser verde a stato solido con il suo alimentatore
    this._postM(LAMP.x, -0.3, top, Y0 - 0.02);
    this._mesh(cyl(0.02, 0.02, 0.11, 32).rotateX(Math.PI / 2).translate(LAMP.x, Y0, -0.291), M.black);
    this._mesh(cyl(0.021, 0.021, 0.012, 32).rotateX(Math.PI / 2).translate(LAMP.x, Y0, -0.242), M.chrome);
    this._mesh(cyl(0.021, 0.021, 0.02, 32).rotateX(Math.PI / 2).translate(LAMP.x, Y0, -0.33), new THREE.MeshStandardMaterial({ color: '#2d8a4a', metalness: 0.5, roughness: 0.4 }));
    const ap = new THREE.Mesh(new THREE.CircleGeometry(0.006, 24), new THREE.MeshBasicMaterial({ color: '#b6ffc8', toneMapped: false }));
    ap.position.set(LAMP.x, Y0, -0.2355); this.root.add(ap);
    this.laserGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#8dffaa', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.laserGlow.scale.setScalar(0.07); this.laserGlow.position.set(LAMP.x, Y0, -0.232); this.laserGlow.userData.noAO = true;
    this.root.add(this.laserGlow);
    this._mesh(new RoundedBoxGeometry(0.12, 0.05, 0.08, 2, 0.005).translate(LAMP.x - 0.16, top + 0.025, -0.44), M.black);
    this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[LAMP.x, Y0, -0.35], [LAMP.x, Y0 - 0.02, -0.4], [LAMP.x - 0.05, top + 0.02, -0.43], [LAMP.x - 0.1, top + 0.03, -0.44]].map((p) => new THREE.Vector3(...p))), 30, 0.003, 8), M.black);
    // lente di focalizzazione e cubo divisore di fascio
    this._postM(LAMP.x, LAMP.cond, top, Y0 - 0.04);
    this._lens(0.03, 0.01, [LAMP.x, Y0, LAMP.cond], 'z', this.root, M.black);
    this._postM(NEAR.split, 0, top, Y0 - 0.03);
    this._mesh(new THREE.BoxGeometry(0.046, 0.006, 0.046).translate(NEAR.split, Y0 - 0.026, 0), M.black);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshPhysicalMaterial({ color: '#d6f2ea', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false }));
    cube.position.set(NEAR.split, Y0, 0); cube.renderOrder = 3; this.root.add(cube);
    const coat = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.04), new THREE.MeshPhysicalMaterial({ color: '#b9d6ff', metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    coat.rotation.y = Math.PI / 4; coat.position.set(NEAR.split, Y0, 0); coat.renderOrder = 3; this.root.add(coat);
    // telecamera industriale al posto dell'occhio
    this._postM(NEAR.eye - 0.08, 0, top, Y0 - 0.035);
    this._mesh(new RoundedBoxGeometry(0.11, 0.07, 0.075, 3, 0.006).translate(NEAR.eye - 0.085, Y0, 0), new THREE.MeshStandardMaterial({ color: '#e6e6e2', metalness: 0.15, roughness: 0.45 }));
    this._mesh(cyl(0.022, 0.022, 0.06, 32).rotateZ(Math.PI / 2).translate(NEAR.eye, Y0, 0), M.black);
    this._mesh(cyl(0.024, 0.024, 0.008, 32).rotateZ(Math.PI / 2).translate(NEAR.eye + 0.026, Y0, 0), M.chrome);
    this._mesh(new THREE.CircleGeometry(0.016, 32).rotateY(Math.PI / 2).translate(NEAR.eye + 0.0305, Y0, 0), M.glass);
    this._mesh(cyl(0.006, 0.006, 0.012, 16).rotateZ(Math.PI / 2).translate(NEAR.eye - 0.146, Y0 + 0.01, 0.02), M.chrome);
    this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[NEAR.eye - 0.152, Y0 + 0.01, 0.02], [NEAR.eye - 0.2, Y0 - 0.02, 0.05], [NEAR.eye - 0.18, top + 0.01, 0.12], [NEAR.eye + 0.1, top + 0.005, 0.2]].map((p) => new THREE.Vector3(...p))), 40, 0.0035, 8), M.black);
    // la ruota d'alluminio, verticale accanto al fascio: il bordo attraversa l'asse ottico nel fuoco
    const wheel = new THREE.Group();
    wheel.position.set(x, Y0, zc);
    this.root.add(wheel);
    this.wheelM = wheel;
    const disc = new THREE.MeshStandardMaterial({ map: latheTexture(), metalness: 0.95, roughness: 0.3, color: '#e3e6ea' });
    this._mesh(cyl(W.r0, W.r0, 0.004, 128).rotateZ(Math.PI / 2), disc, wheel);
    this._mesh(new THREE.RingGeometry(W.r0 - 0.0002, W.R, 1440, 1).rotateY(Math.PI / 2), this._toothMat('#dfe2e6', 0.28), wheel).castShadow = true;
    this._mesh(cyl(0.035, 0.035, 0.03, 48).rotateZ(Math.PI / 2), M.black, wheel);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; this._mesh(cyl(0.004, 0.004, 0.034, 12).rotateZ(Math.PI / 2).translate(0, 0.024 * Math.cos(a), 0.024 * Math.sin(a)), M.chrome, wheel); }
    // adesivo riflettente letto dal tachimetro
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.016).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f4f6f8', metalness: 0.9, roughness: 0.15, emissive: '#3a3a3a' }));
    tape.position.set(0.0025, -0.15, 0); wheel.add(tape);
    // albero e motore elettrico su una staffa
    this._mesh(cyl(0.006, 0.006, 0.09, 16).rotateZ(Math.PI / 2).translate(x - 0.06, Y0, zc), M.chrome);
    this._mesh(cyl(0.045, 0.045, 0.13, 48).rotateZ(Math.PI / 2).translate(x - 0.17, Y0, zc), new THREE.MeshStandardMaterial({ color: '#2a2e34', metalness: 0.6, roughness: 0.38 }));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; this._mesh(new THREE.BoxGeometry(0.11, 0.004, 0.004).translate(x - 0.17, Y0 + 0.046 * Math.cos(a), zc + 0.046 * Math.sin(a)), M.black).castShadow = false; }
    this._mesh(new THREE.BoxGeometry(0.012, Y0 - top - 0.02, 0.12).translate(x - 0.11, (Y0 - 0.02 + top) / 2, zc), M.black);
    this._mesh(new THREE.BoxGeometry(0.16, 0.012, 0.14).translate(x - 0.15, top + 0.006, zc), M.black);
    // tachimetro laser: testina che punta l'adesivo, raggio rosso, display sul tavolo
    const sx = x + 0.12, sz = zc - 0.15;
    this._postM(sx, sz, top, Y0 - 0.02);
    this._mesh(new RoundedBoxGeometry(0.06, 0.032, 0.036, 2, 0.004).translate(sx + 0.01, Y0, sz), new THREE.MeshStandardMaterial({ color: '#f0c419', metalness: 0.2, roughness: 0.45 }));
    this._mesh(cyl(0.008, 0.008, 0.01, 20).rotateZ(Math.PI / 2).translate(sx - 0.024, Y0, sz), M.black);
    const red = new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.85, toneMapped: false });
    const ray = new THREE.Mesh(cyl(0.0007, 0.0007, sx - 0.03 - (x + 0.003), 8).rotateZ(Math.PI / 2).translate((sx - 0.03 + x + 0.003) / 2, Y0, sz), red);
    ray.userData.noAO = true; this.root.add(ray);
    this.tachoDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ff3a24', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.tachoDot.scale.setScalar(0.02); this.tachoDot.position.set(x + 0.004, Y0, sz); this.tachoDot.userData.noAO = true;
    this.root.add(this.tachoDot);
    this.tachoLed = new THREE.Mesh(new THREE.SphereGeometry(0.003, 12, 8), new THREE.MeshBasicMaterial({ color: '#3a1010' }));
    this.tachoLed.position.set(sx + 0.03, Y0 + 0.017, sz + 0.01); this.root.add(this.tachoLed);
    const dx = -0.5, dz = 0.2;
    this._mesh(new RoundedBoxGeometry(0.17, 0.07, 0.1, 3, 0.006).translate(dx, top + 0.035, dz), new THREE.MeshStandardMaterial({ color: '#2b2f35', metalness: 0.4, roughness: 0.45 }));
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    this.tachoCtx = canvas.getContext('2d');
    this.tachoTex = new THREE.CanvasTexture(canvas); this.tachoTex.colorSpace = THREE.SRGBColorSpace; this.tachoTex.anisotropy = 8;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.047), new THREE.MeshBasicMaterial({ map: this.tachoTex, toneMapped: false }));
    disp.position.set(dx, top + 0.037, dz + 0.0505); this.root.add(disp);
    this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[sx + 0.04, Y0, sz], [sx + 0.07, Y0 - 0.05, sz + 0.02], [sx + 0.06, top + 0.006, sz + 0.1], [dx + 0.2, top + 0.005, dz - 0.1], [dx + 0.06, top + 0.02, dz - 0.05]].map((p) => new THREE.Vector3(...p))), 60, 0.0025, 8), M.black);
    this.tachoText = '';
    this.setTacho(0);
    // telescopi: obiettivi dentro tubi neri
    this._tube(NEAR.wheel + 0.05, NEAR.obj + 0.1, 0.065);
    this._mesh(revolveX([[NEAR.wheel + 0.05, 0.018], [NEAR.wheel + 0.05, 0.063], [NEAR.wheel + 0.054, 0.063], [NEAR.wheel + 0.054, 0.018]], 48, 0.6).translate(0, Y0, 0), M.black);
    this._lens(0.05, 0.014, [NEAR.obj, Y0, 0], 'x', this.root, M.black);
    this._tube(FAR.obj - 0.1, FAR.mirror + 0.035, 0.065);
    this._lens(0.05, 0.014, [FAR.obj, Y0, 0], 'x', this.root, M.black);
    this._mesh(revolveX([[FAR.mirror + 0.03, 0], [FAR.mirror + 0.03, 0.063], [FAR.mirror + 0.035, 0.063], [FAR.mirror + 0.035, 0]], 48, 0.6).translate(0, Y0, 0), M.black);
    this._mesh(new THREE.CircleGeometry(0.015, 40).rotateY(-Math.PI / 2).translate(FAR.mirror + 0.002, Y0, 0), M.mirror);
    void topF;
  }

  /** Lettura del tachimetro laser (giri al secondo e giri al minuto). */
  setTacho(f) {
    const text = `${f.toFixed(3)}`;
    if (text === this.tachoText) return;
    this.tachoText = text;
    const g = this.tachoCtx, w = 512, h = 160;
    g.fillStyle = '#0c1410'; g.fillRect(0, 0, w, h);
    g.font = `700 86px ${MONO}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(80,255,140,0.07)'; g.fillText('888.888', w - 96, 104);
    g.fillStyle = '#5dff93'; g.fillText(text.padStart(7, ' '), w - 96, 104);
    g.font = `600 34px ${MONO}`; g.fillText('Hz', w - 22, 104);
    g.font = `500 28px ${MONO}`; g.fillStyle = '#3fbf6c'; g.textAlign = 'left';
    g.fillText(`${(f * 60).toFixed(1)} rpm`, 24, 146);
    g.textAlign = 'right'; g.fillText('TACHIMETRO LASER', w - 22, 146);
    this.tachoTex.needsUpdate = true;
  }

  /** Apparato di Fizeau (false) o moderno (true): visibilità, colore della luce. */
  setApparatus(modern) {
    this.modern = modern;
    this.hist.visible = !modern; this.mod.visible = modern;
    this.U.uColor.value.set(modern ? '#4dff7e' : '#ffe2b0');
    for (const s of [this.toothGlow, this.mirrorGlow, this.eyeGlow]) s.material.color.set(modern ? '#a6ffbe' : '#ffe8c0');
  }

  /** Segno di interruzione del percorso: il fascio è molto più lungo di come appare. */
  _buildBreak() {
    const M = new THREE.MeshBasicMaterial({ color: '#4a5260', transparent: true, opacity: 0.85 });
    for (const dx of [-0.035, 0.035]) for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.07, 0.004).rotateZ(-0.45), M);
      m.position.set(BREAK_X + dx, Y0 + s * 0.07, 0); m.userData.noAO = true;
      this.group.add(m);
    }
  }

  // ───────────────────────────── i tratti del fascio ─────────────────────────────
  /** Tratto da a a b (cono di raggi r0→r1); half: 'up' | 'down' | null; cfg: p0, p1, pesi, chop. */
  _seg(a, b, r0, r1, half, cfg) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    dir.normalize();
    let ts = 0, tl = Math.PI * 2;
    if (half === 'up') { ts = Math.PI; tl = Math.PI; } else if (half === 'down') { ts = 0; tl = Math.PI; }
    const geo = new THREE.CylinderGeometry(r1, r0, len, 48, 1, true, ts, tl);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.U, p0: { value: cfg.p0 || 0 }, p1: { value: cfg.p1 || 0 }, wOut: { value: cfg.wOut || 0 }, wRet: { value: cfg.wRet || 0 }, wEnd: { value: cfg.wEnd || 0 }, chop: { value: cfg.chop ? 1 : 0 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.position.copy(A).addScaledVector(dir, len / 2);
    m.userData.noAO = true; m.renderOrder = 9; m.frustumCulled = false;
    this.group.add(m);
    this.segs.push({ m, cfg });
    return m;
  }
  _buildBeams() {
    // il cono converge sul bordo della ruota con apertura NA: raggio = NA × distanza dal fuoco
    const dSF = NEAR.wheel - NEAR.split, rF = 0.0006, rSplit = NA * dSF, rCond = NA * (dSF + Math.abs(LAMP.cond));
    // lampada → condensatore → lamina → fuoco sulla ruota: luce continua
    this._seg([LAMP.x, Y0, LAMP.z + 0.066], [LAMP.x, Y0, LAMP.cond], 0.012, rCond, null, { chop: false });
    this._seg([LAMP.x, Y0, LAMP.cond], [LAMP.x, Y0, 0], rCond, Math.abs(rSplit), null, { chop: false });
    this._seg([NEAR.split, Y0, 0], [NEAR.wheel, Y0, 0], Math.abs(rSplit), rF, null, { chop: false });
    // dal fuoco all'obiettivo (andata e ritorno nello stesso cono)
    this.segC = this._seg([NEAR.wheel, Y0, 0], [NEAR.obj, Y0, 0], rF, BEAM_R, null, { chop: true, p0: 0, p1: F_OBJ, wOut: 0.5, wRet: 0.5 });
    // il lungo tratto parallelo: sopra l'andata, sotto il ritorno (in realtà coincidono)
    this.segOut = this._seg([NEAR.obj, Y0, 0], [FAR.obj, Y0, 0], BEAM_R, BEAM_R, 'up', { chop: true, p0: F_OBJ, p1: 1, wOut: 1 });
    this.segRet = this._seg([NEAR.obj, Y0, 0], [FAR.obj, Y0, 0], BEAM_R, BEAM_R, 'down', { chop: true, p0: F_OBJ, p1: 1, wRet: 1 });
    // dall'obiettivo lontano allo specchio
    this.segE = this._seg([FAR.obj, Y0, 0], [FAR.mirror, Y0, 0], BEAM_R, rF, null, { chop: true, p0: 1, p1: 1, wOut: 0.5, wRet: 0.5 });
    // ritorno oltre la ruota, attraverso la lamina, all'oculare
    this._seg([NEAR.wheel, Y0, 0], [NEAR.split, Y0, 0], rF, Math.abs(rSplit), null, { chop: true, p0: 0, p1: 0, wEnd: 0.6 });
    this._seg([NEAR.split, Y0, 0], [NEAR.eye + 0.03, Y0, 0], Math.abs(rSplit), Math.abs(rSplit) * 1.6, null, { chop: true, p0: 0, p1: 0, wEnd: 0.6 });
  }

  /** Distanza vera d (m): aggiorna le coordinate di cammino dei tratti lunghi. */
  setPath(d) {
    this.U.uD2.value = 2 * d;
    this.segOut.material.uniforms.p1.value = d - F_OBJ; this.segRet.material.uniforms.p1.value = d - F_OBJ;
    this.segE.material.uniforms.p0.value = d - F_OBJ; this.segE.material.uniforms.p1.value = d;
  }
}
