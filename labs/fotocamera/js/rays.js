// rays.js — fasci di raggi luminosi: da un punto del soggetto, attraverso ogni superficie
// dell'obiettivo (tracciamento reale), fino al sensore.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { SENSOR_W, SENSOR_H, WAVELENGTHS } from './optics.js';

export { SegBuffer };

const TWO_PI = Math.PI * 2;
export const EMITTER_COLORS = ['#ff4326', '#1f7cff', '#0fae6e'];
const WHITE_LIGHT = new THREE.Color('#2a323d');   // la luce bianca in arrivo, disegnata scura sul fondo chiaro
const SPECTRAL = [[WAVELENGTHS.r, new THREE.Color('#ff3b2f')], [WAVELENGTHS.g, new THREE.Color('#1fb85a')], [WAVELENGTHS.b, new THREE.Color('#2a63ff')]];

function dotMaterial(size, ring) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: !ring, fog: false,
    uniforms: { size: { value: size }, dpr: { value: 1 } },
    vertexShader: `attribute vec3 color; varying vec3 vC; uniform float size, dpr;
      void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * dpr; }`,
    fragmentShader: ring
      ? `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float edge = smoothstep(1.0, 0.86, d);
          vec3 c = mix(vec3(1.0), vC, smoothstep(0.66, 0.56, d));
          gl_FragColor = vec4(c, edge); }`
      : `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(vC, smoothstep(1.0, 0.7, d)); }`,
  });
}

export class RayViz {
  constructor(axisHeight) {
    this.h = axisHeight;
    this.group = new THREE.Group();
    this.group.name = 'raggi';
    this.emitters = [];

    this.pass = new SegBuffer(5000);
    this.stopd = new SegBuffer(5000);
    const mk = (buf, opts) => {
      const m = new LineMaterial({ vertexColors: true, transparent: true, depthWrite: false, worldUnits: false, ...opts });
      const l = new LineSegments2(buf.geometry(), m);
      l.frustumCulled = false; l.userData.noAO = true;
      this.group.add(l);
      return l;
    };
    this.passLines = mk(this.pass, { linewidth: 1.35, opacity: 0.62 });
    this.passLines.renderOrder = 10;
    this.stopLines = mk(this.stopd, { linewidth: 1.0, opacity: 0.17 });
    this.stopLines.renderOrder = 9;
    this.pulseLines = mk(this.pass, { linewidth: 2.6, opacity: 0.95, dashed: true, dashSize: 0.007, gapSize: 0.113, dashScale: 1 });
    this.pulseLines.renderOrder = 11;

    // punti d'arrivo sul sensore
    this.hitPos = new Float32Array(1500 * 3); this.hitCol = new Float32Array(1500 * 3);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(this.hitPos, 3).setUsage(THREE.DynamicDrawUsage));
    hg.setAttribute('color', new THREE.BufferAttribute(this.hitCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.hits = new THREE.Points(hg, dotMaterial(5.5, false));
    this.hits.frustumCulled = false; this.hits.renderOrder = 12;
    this.group.add(this.hits);

    // sorgenti
    this.emPos = new Float32Array(9); this.emCol = new Float32Array(9);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(this.emPos, 3).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('color', new THREE.BufferAttribute(this.emCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.emDots = new THREE.Points(eg, dotMaterial(15, true));
    this.emDots.frustumCulled = false; this.emDots.renderOrder = 13;
    this.group.add(this.emDots);

    // asse ottico
    const ag = new LineSegmentsGeometry();
    ag.setPositions([-0.03, axisHeight, 0, 3.5, axisHeight, 0]);
    this.axis = new LineSegments2(ag, new LineMaterial({ color: '#39424e', linewidth: 1, transparent: true, opacity: 0.42, dashed: true, dashSize: 0.012, gapSize: 0.008, depthWrite: false }));
    this.axis.computeLineDistances();
    this.axis.userData.noAO = true; this.axis.renderOrder = 8;
    this.group.add(this.axis);

    this._pts = new Float64Array(3 * 40);
    this._idx = new Float64Array(40);
    this.summary = [];
  }

  setDpr(dpr) { this.hits.material.uniforms.dpr.value = dpr; this.emDots.material.uniforms.dpr.value = dpr; }

  /** Aggiunge (o sostituisce a rotazione) una sorgente puntiforme agganciata a un oggetto della scena. */
  addEmitter(object, worldPoint, slot = null) {
    const local = object ? object.worldToLocal(worldPoint.clone()) : worldPoint.clone();
    const k = slot !== null ? slot : (this._next = ((this._next ?? -1) + 1) % EMITTER_COLORS.length);
    this.emitters[k] = { object, local, world: worldPoint.clone(), color: new THREE.Color(EMITTER_COLORS[k]), slot: k };
    return k;
  }
  removeEmitter(k) { delete this.emitters[k]; }
  clearEmitters() { this.emitters = []; this._next = -1; }

  /**
   * Ricalcola tutti i raggi.
   * opts: { visible, mode:'cone'|'fan', density:1..3, blocked:boolean, dispersion:boolean, pulses:boolean }
   */
  update(lens, opts, time) {
    const { pass, stopd } = this;
    pass.reset(); stopd.reset();
    this.group.visible = opts.visible;
    let nh = 0, ne = 0;
    this.summary.length = 0;
    if (opts.visible) {
      const h = this.h, pts = this._pts, idx = this._idx;
      const xiEP = -lens.xEP;
      const inv = 1 / Math.abs(lens.Af);
      const rIn = lens.rIn * inv, rC = lens.rEP, rMax = lens.rStopMax * inv;
      const m = [4, 6, 8][opts.density - 1] || 6;
      for (const em of this.emitters) {
        if (!em) continue;
        if (em.object) em.world.copy(em.local).applyMatrix4(em.object.matrixWorld);
        const E = em.world;
        this.emPos[ne * 3] = E.x; this.emPos[ne * 3 + 1] = E.y; this.emPos[ne * 3 + 2] = E.z;
        this.emCol[ne * 3] = em.color.r; this.emCol[ne * 3 + 1] = em.color.g; this.emCol[ne * 3 + 2] = em.color.b;
        ne++;
        const o = [-E.x, E.y - h, -E.z];
        const sum = { slot: em.slot, n: 0, total: 0, cy: 0, cz: 0, r2: 0, onSensor: false, object: em.object };
        if (o[0] >= xiEP - 0.01) { this.summary.push(sum); continue; }   // sorgente dietro l'obiettivo

        // bersagli sul piano della pupilla d'ingresso
        const targets = [];   // [η, ζ, deveBloccarsi]
        if (opts.mode === 'fan') {
          const l = Math.hypot(o[1], o[2]);
          const ey = l > 1e-6 ? o[1] / l : 1, ez = l > 1e-6 ? o[2] / l : 0;
          const n = 2 * m - 1;
          for (let i = 0; i < n; i++) { const t = (-1 + (2 * i) / (n - 1)) * 0.93 * rIn; targets.push([t * ey, t * ez, false]); }
          if (opts.blocked) {
            const rs = lens.isPinhole ? [0.004, 0.008, 0.012] : rMax > 1.18 * rC ? [rC + (rMax - rC) * 0.35, rC + (rMax - rC) * 0.7, rMax * 0.985] : [];
            for (const r of rs) for (const s of [-1, 1]) targets.push([s * r * ey, s * r * ez, true]);
          }
        } else {
          targets.push([0, 0, false]);
          const ring = (r, count, blk, ph = 0) => { for (let i = 0; i < count; i++) { const a = ph + (TWO_PI * i) / count; targets.push([r * Math.cos(a), r * Math.sin(a), blk]); } };
          ring(0.5 * rIn, m, false, 0.3);
          ring(0.93 * rIn, 2 * m, false, 0);
          if (opts.blocked) {
            if (lens.isPinhole) { ring(0.005, 2 * m, true, 0.2); ring(0.011, 2 * m, true, 0); }
            else if (rMax > 1.18 * rC) { ring(rC + (rMax - rC) * 0.5, 2 * m, true, 0.2); ring(rMax * 0.985, 2 * m, true, 0); }
          }
        }

        const lambdas = opts.dispersion ? SPECTRAL : [[WAVELENGTHS.g, em.color]];
        for (const [ty, tz] of targets) {
          let dx = xiEP - o[0], dy = ty - o[1], dz = tz - o[2];
          const il = 1 / Math.hypot(dx, dy, dz);
          dx *= il; dy *= il; dz *= il;
          for (let li = 0; li < lambdas.length; li++) {
            const [lambda, color] = lambdas[li];
            const st = lens.trace(o, [dx, dy, dz], lambda, pts, idx);
            if (st.n === 0) continue;
            let ok = st.status === 'ok';
            const last = (st.n - 1) * 3;
            if (ok && (Math.abs(pts[last + 1]) > SENSOR_H / 2 || Math.abs(pts[last + 2]) > SENSOR_W / 2)) ok = false;
            const buf = ok ? pass : stopd;
            let px = E.x, py = E.y, pz = E.z, d = 0;
            for (let i = 0; i < st.n; i++) {
              const qx = -pts[i * 3], qy = pts[i * 3 + 1] + h, qz = -pts[i * 3 + 2];
              const len = Math.hypot(qx - px, qy - py, qz - pz) * idx[i];
              // con la luce bianca il tratto in arrivo è unico; i colori si separano dalla prima rifrazione
              if (i === 0 && opts.dispersion) { if (li === 0) buf.push(px, py, pz, qx, qy, qz, WHITE_LIGHT, d, d + len); }
              else buf.push(px, py, pz, qx, qy, qz, color, d, d + len);
              d += len; px = qx; py = qy; pz = qz;
            }
            sum.total++;
            if (ok) {
              const ey = pts[last + 1], ez = pts[last + 2];
              sum.n++; sum.cy += ey; sum.cz += ez; sum.r2 += ey * ey + ez * ez;
              if (nh < 1500) {
                this.hitPos[nh * 3] = 0.00006; this.hitPos[nh * 3 + 1] = ey + h; this.hitPos[nh * 3 + 2] = -ez;
                this.hitCol[nh * 3] = color.r; this.hitCol[nh * 3 + 1] = color.g; this.hitCol[nh * 3 + 2] = color.b;
                nh++;
              }
            }
          }
        }
        if (sum.n) {
          sum.cy /= sum.n; sum.cz /= sum.n;
          sum.rms = Math.sqrt(Math.max(sum.r2 / sum.n - sum.cy * sum.cy - sum.cz * sum.cz, 0));
          sum.onSensor = true;
        }
        this.summary.push(sum);
      }
    }
    pass.commit(); stopd.commit();
    this.hits.geometry.setDrawRange(0, nh);
    this.hits.geometry.attributes.position.needsUpdate = true;
    this.hits.geometry.attributes.color.needsUpdate = true;
    this.emDots.geometry.setDrawRange(0, ne);
    this.emDots.geometry.attributes.position.needsUpdate = true;
    this.emDots.geometry.attributes.color.needsUpdate = true;
    this.stopLines.visible = opts.blocked;
    this.pulseLines.visible = opts.pulses;
    this.pulseLines.material.dashOffset = -time * 0.3;
    return this.summary;
  }
}
