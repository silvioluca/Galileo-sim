// beams.js — la luce nell'aria. La fenditura è verticale, quindi ogni colore è un nastro verticale
// sottile, più intenso al centro e sfumato in alto e in basso; un filo luminoso al centro tiene
// visibile il percorso anche guardando dall'alto. Più le linee di costruzione: normali alle facce,
// direzione non deviata e arco dell'angolo di deviazione δ.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from '../../../shared/js/lines.js';

const MAX_Q = 3000;
const HALF_H = 0.011;                       // semi-altezza del fascio (m)
const NOTE = new THREE.Color('#2a323d');
const ACCENT = new THREE.Color('#0c9d8f');
const BOOST = 1.5;                          // i fasci sono sorgenti di luce: più chiari del bianco della carta

export class Beams {
  constructor(axisHeight) {
    this.h = axisHeight;
    this.group = new THREE.Group();
    this.group.name = 'luce';
    // ogni tratto: due quadrilateri (metà bassa e metà alta), alfa nullo ai bordi
    this.pos = new Float32Array(MAX_Q * 12 * 3); this.col = new Float32Array(MAX_Q * 12 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.ribbons = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.ribbons.frustumCulled = false; this.ribbons.userData.noAO = true; this.ribbons.renderOrder = 9;
    this.group.add(this.ribbons);

    const mk = (buf, opts) => {
      const l = new LineSegments2(buf.geometry(), new LineMaterial({ vertexColors: true, transparent: true, depthWrite: false, ...opts }));
      l.frustumCulled = false; l.userData.noAO = true;
      this.group.add(l);
      return l;
    };
    this.core = new SegBuffer(MAX_Q);
    this.coreLines = mk(this.core, { linewidth: 1.6, opacity: 0.95 });
    this.coreLines.renderOrder = 10;
    this.notes = new SegBuffer(400);
    this.noteLines = mk(this.notes, { linewidth: 1.1, opacity: 0.6, dashed: true, dashSize: 0.007, gapSize: 0.005 });
    this.noteLines.renderOrder = 7;
    this.solid = new SegBuffer(200);
    this.solidLines = mk(this.solid, { linewidth: 1.8, opacity: 0.95 });
    this.solidLines.renderOrder = 7;
    this.q = 0;
    this._c = new THREE.Color();
  }

  begin() { this.q = 0; this.core.reset(); this.notes.reset(); this.solid.reset(); }

  /**
   * Tratto di fascio da a a b (coordinate in pianta).
   * hue: colore (componente massima 1); alpha: opacità al centro; core: disegna anche il filo centrale.
   */
  ray(ax, ay, bx, by, hue, alpha, core = true, alphaEnd = alpha) {
    if (this.q >= MAX_Q || alpha <= 0.004) return;
    const h = this.h, P = this.pos, C = this.col, o = this.q * 36, oc = this.q * 48;
    const r = hue[0] * BOOST, g = hue[1] * BOOST, b = hue[2] * BOOST;
    // alfa: nullo in alto e in basso, massimo al centro; lungo il tratto va da alpha ad alphaEnd
    const rows = [[h - HALF_H, 0], [h, 1], [h + HALF_H, 0]];
    let k = 0, kc = 0;
    for (let s = 0; s < 2; s++) {
      const [y0, f0] = rows[s], [y1, f1] = rows[s + 1];
      const A0 = alpha * f0, A1 = alpha * f1, B0 = alphaEnd * f0, B1 = alphaEnd * f1;
      const v = [[ax, y0, ay, A0], [bx, y0, by, B0], [bx, y1, by, B1], [ax, y0, ay, A0], [bx, y1, by, B1], [ax, y1, ay, A1]];
      for (const [x, y, z, a] of v) {
        P[o + k++] = x; P[o + k++] = y; P[o + k++] = -z;
        C[oc + kc++] = r; C[oc + kc++] = g; C[oc + kc++] = b; C[oc + kc++] = a;
      }
    }
    this.q++;
    if (core) {
      this._c.setRGB(r, g, b);
      this.core.push(ax, h, -ay, bx, h, -by, this._c, 0, 1);
    }
  }

  /** Linea di costruzione: tratteggiata grigia, oppure piena nel colore d'accento. */
  note(ax, ay, bx, by, solid = false) {
    const len = Math.hypot(bx - ax, by - ay);
    if (solid) this.solid.push(ax, this.h, -ay, bx, this.h, -by, ACCENT, 0, len);
    else this.notes.push(ax, this.h, -ay, bx, this.h, -by, NOTE, 0, len);
  }

  end(showNotes) {
    const g = this.ribbons.geometry;
    g.setDrawRange(0, this.q * 12);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this.core.commit(); this.notes.commit(); this.solid.commit();
    this.noteLines.visible = showNotes; this.solidLines.visible = showNotes;
  }
}
