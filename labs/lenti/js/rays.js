// rays.js — i disegni sovrapposti alla scena, nel piano verticale che contiene l'asse ottico:
// i raggi principali della costruzione con la lente sottile (con i prolungamenti tratteggiati verso le immagini
// virtuali), i raggi veri seguiti attraverso le superfici della lente, l'asse, i fuochi, l'oggetto e l'immagine.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from '../../../shared/js/lines.js';

export const COL = {
  par: new THREE.Color('#e8452c'),        // parallelo all'asse → passa per F′
  ctr: new THREE.Color('#1f9d55'),        // per il centro: non deviato
  foc: new THREE.Color('#2c67dc'),        // per F → esce parallelo
  axis: new THREE.Color('#3a4250'),
  obj: new THREE.Color('#d99a12'),
  img: new THREE.Color('#c2331d'),
  mark: new THREE.Color('#15181c'),
};
const RGB = [new THREE.Color(1.6, 0.25, 0.18), new THREE.Color(0.3, 1.25, 0.35), new THREE.Color(0.3, 0.45, 1.7)];
const WARM = new THREE.Color(1.5, 1.25, 0.6);

export class Rays {
  constructor(axisH) {
    this.h = axisH;
    this.group = new THREE.Group();
    this.group.name = 'raggi';
    const mk = (buf, opts, order) => {
      const l = new LineSegments2(buf.geometry(), new LineMaterial({ vertexColors: true, transparent: true, depthWrite: false, ...opts }));
      l.frustumCulled = false; l.userData.noAO = true; l.userData.noOutline = true; l.renderOrder = order;
      this.group.add(l);
      return l;
    };
    this.solid = new SegBuffer(1200);
    this.solidL = mk(this.solid, { linewidth: 2.0, opacity: 0.95 }, 12);
    this.thin = new SegBuffer(3000);
    this.thinL = mk(this.thin, { linewidth: 1.2, opacity: 0.75 }, 11);
    this.dash = new SegBuffer(600);
    this.dashL = mk(this.dash, { linewidth: 1.5, opacity: 0.75, dashed: true, dashSize: 0.008, gapSize: 0.006 }, 12);
    this.fine = new SegBuffer(300);
    this.fineL = mk(this.fine, { linewidth: 1, opacity: 0.45, dashed: true, dashSize: 0.012, gapSize: 0.008 }, 10);
  }

  begin() { for (const b of [this.solid, this.thin, this.dash, this.fine]) b.reset(); }
  end() { for (const b of [this.solid, this.thin, this.dash, this.fine]) b.commit(); }

  /** Segmento nel piano dell'asse: (x, y) con y misurato dall'asse. kind: 'solid' | 'thin' | 'dash' | 'fine'. */
  seg(kind, x0, y0, x1, y1, color) {
    const b = this[kind], h = this.h, len = Math.hypot(x1 - x0, y1 - y0);
    b.push(x0, h + y0, 0, x1, h + y1, 0, color, 0, len);
  }
  /** Spezzata [[x, y], …]. */
  path(kind, pts, color) { for (let i = 1; i < pts.length; i++) this.seg(kind, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], color); }

  /** Freccia verticale da (x, 0) a (x, y): l'oggetto o l'immagine. */
  arrow(kind, x, y, color) {
    if (!isFinite(y) || Math.abs(y) < 1e-5) return;
    const s = Math.sign(y), k = Math.min(0.006, Math.abs(y) * 0.35);
    this.seg(kind, x, 0, x, y, color);
    this.seg(kind, x, y, x - k * 0.6, y - s * k, color);
    this.seg(kind, x, y, x + k * 0.6, y - s * k, color);
  }

  /** Tacca sull'asse (un fuoco, un punto doppio della focale). */
  tick(x, size, color) { this.seg('solid', x, -size, x, size, color); }

  static colors() { return { RGB, WARM }; }
}
