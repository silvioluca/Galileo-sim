// overlays.js — annotazioni nella scena: zona di profondità di campo sul pavimento, inquadratura sul
// piano a fuoco, piramide del campo visivo ed etichette agganciate ai punti 3D.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from './rays.js';
import { SENSOR_W, SENSOR_H } from './optics.js';

const FOCUS = new THREE.Color('#0c9d8f');
const FOCUS_SOFT = new THREE.Color('#58c4b9');
const GREY = new THREE.Color('#5d6875');
const FAR_LIMIT = 3.42;
const Y = 0.0009;

export class Overlays {
  constructor(axisHeight, labelRoot) {
    this.h = axisHeight;
    this.group = new THREE.Group();
    this.group.name = 'annotazioni';

    // zona nitida sul pavimento: trapezio fra limite vicino e lontano, dentro il campo inquadrato
    this.bandPos = new Float32Array(4 * 3);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bandPos, 3).setUsage(THREE.DynamicDrawUsage));
    bg.setIndex([0, 1, 2, 0, 2, 3]);
    this.band = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: FOCUS, transparent: true, opacity: 0.16, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.band.frustumCulled = false; this.band.userData.noAO = true; this.band.renderOrder = 5;
    this.group.add(this.band);

    const mk = (buf, opts) => {
      const l = new LineSegments2(buf.geometry(), new LineMaterial({ vertexColors: true, transparent: true, depthWrite: false, ...opts }));
      l.frustumCulled = false; l.userData.noAO = true; l.renderOrder = 6;
      this.group.add(l);
      return l;
    };
    this.strong = new SegBuffer(64);
    this.faint = new SegBuffer(64);
    this.strongLines = mk(this.strong, { linewidth: 1.8, opacity: 0.95 });
    this.faintLines = mk(this.faint, { linewidth: 1.0, opacity: 0.42, dashed: true, dashSize: 0.014, gapSize: 0.01 });

    this.root = labelRoot;
    this.tags = [];
    this._v = new THREE.Vector3();
  }

  addTag(text, cls, getPos, isVisible) {
    const el = document.createElement('div');
    el.className = `tag hidden ${cls || ''}`;
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    this.root.appendChild(el);
    const tag = { el, span: el.firstChild, getPos, isVisible, text };
    this.tags.push(tag);
    return tag;
  }

  /** Aggiorna geometrie ed etichette. opts: { dof, labels } */
  update(lens, opts, camera, width, height) {
    const h = this.h, { strong, faint } = this;
    strong.reset(); faint.reset();
    const xE = lens.xEP;
    const th = SENSOR_W / 2 / lens.ve, tv = SENSOR_H / 2 / lens.ve;       // tangenti del semicampo
    const hasPlane = lens.kappa > 1e-6 && lens.focusDist < FAR_LIMIT + 0.4 && !lens.isPinhole;
    let near = NaN, far = NaN;
    this.band.visible = false;
    if (opts.dof) {
      // bordi del campo sul pavimento
      for (const s of [-1, 1]) faint.push(xE, Y, 0, FAR_LIMIT, Y, s * (FAR_LIMIT - xE) * th, GREY, 0, FAR_LIMIT - xE);
      if (!lens.isPinhole) {
        const lim = lens.dofLimits();
        near = Math.max(lim.near, xE + 0.02); far = Math.min(lim.far, FAR_LIMIT);
        if (near < FAR_LIMIT) {
          const wn = (near - xE) * th, wf = (far - xE) * th;
          const p = this.bandPos;
          p.set([near, Y, -wn, near, Y, wn, far, Y, wf, far, Y, -wf]);
          this.band.geometry.attributes.position.needsUpdate = true;
          this.band.visible = true;
          strong.push(near, Y, -wn, near, Y, wn, FOCUS_SOFT, 0, 1);
          if (lim.far < FAR_LIMIT) strong.push(far, Y, -wf, far, Y, wf, FOCUS_SOFT, 0, 1);
        }
      }
      if (hasPlane) {
        // inquadratura: il rettangolo dello spazio oggetto coniugato al sensore
        const xf = lens.focusDist, d = xf - xE;
        const hw = d * th, hh = d * tv;
        const y0 = Math.max(h - hh, Y), y1 = h + hh;
        strong.push(xf, y0, -hw, xf, y0, hw, FOCUS, 0, 1);
        strong.push(xf, y1, -hw, xf, y1, hw, FOCUS, 0, 1);
        strong.push(xf, y0, -hw, xf, y1, -hw, FOCUS, 0, 1);
        strong.push(xf, y0, hw, xf, y1, hw, FOCUS, 0, 1);
        for (const sz of [-1, 1]) for (const sy of [-1, 1]) {
          const yc = h + sy * hh;
          if (yc > 0) faint.push(xE, h, 0, xf, yc, sz * hw, GREY, 0, d);
        }
        this.frame = { xf, hw, y1 };
      } else this.frame = null;
    }
    this.limits = { near, far: lens.isPinhole ? NaN : lens.dofLimits().far };
    strong.commit(); faint.commit();
    this.strongLines.visible = opts.dof; this.faintLines.visible = opts.dof;

    // etichette
    const v = this._v;
    for (const t of this.tags) {
      let show = opts.labels && (!t.isVisible || t.isVisible());
      if (show) {
        t.getPos(v);
        v.project(camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) show = false;
        else {
          const x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height;
          t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      if (show !== t.shown) { t.el.classList.toggle('hidden', !show); t.shown = show; }
    }
  }

  setTagText(tag, text) { if (tag.text !== text) { tag.text = text; tag.span.textContent = text; } }
}
