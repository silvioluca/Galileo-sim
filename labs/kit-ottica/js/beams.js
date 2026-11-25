// beams.js — i raggi laser come si vedono sulla lavagna: un filo brillante con un alone, steso sul foglio. Ogni
// tratto è un nastro piatto nel piano della lavagna; il colore è quello del laser, l'opacità segue l'intensità
// (così i riflessi deboli di Fresnel appaiono come tracce tenui). Si vedono anche attraverso l'acrilico: il
// fascio rasente attraversa i pezzi proprio sopra il foglio. In più, segni di costruzione: normali, archi degli
// angoli, prolungamenti tratteggiati, il fuoco.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { Z_BEAM } from './board.js';

const MAX = 1500;
const HALF_W = 0.0032;          // semi-larghezza dell'alone (m)

export class Beams {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'raggi';
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 4 * 3); this.side = new Float32Array(MAX * 4); this.inten = new Float32Array(MAX * 4);
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) { const o = i * 4; idx.set([o, o + 1, o + 2, o + 2, o + 1, o + 3], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(this.side, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aI', new THREE.BufferAttribute(this.inten, 1).setUsage(THREE.DynamicDrawUsage));
    this.uColor = { value: new THREE.Color(1.6, 0.06, 0.03) };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uColor: this.uColor },
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'attribute float aSide, aI; varying float vS, vI; void main(){ vS = aSide; vI = aI; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vS, vI;
        void main() {
          float s = abs(vS);
          float core = exp(-(s * s) / (0.13 * 0.13)), glow = exp(-(s * s) / (0.5 * 0.5));
          float a = clamp(vI, 0.0, 1.0) * (0.92 * core + 0.3 * glow);
          if (a < 0.003) discard;
          vec3 c = uColor * (1.0 + 1.4 * core * clamp(vI * 1.5, 0.0, 1.0));     // il centro del filo è più chiaro
          gl_FragColor = vec4(c, a);
        }`,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 20; this.mesh.userData.noAO = true; this.mesh.userData.noOutline = true;
    this.group.add(this.mesh);
    const mk = (buf, opts, order) => {
      const l = new LineSegments2(buf.geometry(), new LineMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, ...opts }));
      l.frustumCulled = false; l.userData.noAO = true; l.userData.noOutline = true; l.renderOrder = order;
      this.group.add(l);
      return l;
    };
    this.solid = new SegBuffer(400); this.solidL = mk(this.solid, { linewidth: 1.8, opacity: 0.9 }, 22);
    this.dash = new SegBuffer(400); this.dashL = mk(this.dash, { linewidth: 1.4, opacity: 0.85, dashed: true, dashSize: 0.004, gapSize: 0.003 }, 21);
    this.n = 0;
  }

  setColor(rgb) { this.uColor.value.setRGB(rgb[0], rgb[1], rgb[2]); }

  /** Tratti di raggio { ax, ay, bx, by, I } in coordinate della lavagna; ox, oy: posizione della lavagna nel mondo. */
  setRays(segs, oy) {
    let n = 0;
    for (const s of segs) {
      if (n >= MAX) break;
      const dx = s.bx - s.ax, dy = s.by - s.ay, l = Math.hypot(dx, dy);
      if (l < 1e-6) continue;
      const nx = (-dy / l) * HALF_W, ny = (dx / l) * HALF_W, o = n * 12, k = n * 4;
      const P = this.pos;
      P[o] = s.ax + nx; P[o + 1] = oy + s.ay + ny; P[o + 2] = Z_BEAM;
      P[o + 3] = s.ax - nx; P[o + 4] = oy + s.ay - ny; P[o + 5] = Z_BEAM;
      P[o + 6] = s.bx + nx; P[o + 7] = oy + s.by + ny; P[o + 8] = Z_BEAM;
      P[o + 9] = s.bx - nx; P[o + 10] = oy + s.by - ny; P[o + 11] = Z_BEAM;
      this.side.set([1, -1, 1, -1], k);
      this.inten.fill(s.I, k, k + 4);
      n++;
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, n * 6);
    for (const a of ['position', 'aSide', 'aI']) g.attributes[a].needsUpdate = true;
    this.n = n;
  }

  // segni di costruzione
  beginMarks() { this.solid.reset(); this.dash.reset(); }
  mark(kind, ax, ay, bx, by, color, oy) {
    const b = kind === 'dash' ? this.dash : this.solid, len = Math.hypot(bx - ax, by - ay);
    b.push(ax, oy + ay, Z_BEAM + 0.0002, bx, oy + by, Z_BEAM + 0.0002, color, 0, len);
  }
  arcMark(kind, cx, cy, r, a0, a1, color, oy) {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * 24));
    for (let i = 0; i < n; i++) {
      const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
      this.mark(kind, cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1), color, oy);
    }
  }
  endMarks() { this.solid.commit(); this.dash.commit(); }
}
