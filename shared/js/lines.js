// lines.js — segmenti per le linee "spesse" di three.js (larghezza in pixel), con buffer preallocati
// da riempire a ogni fotogramma: posizioni, colori e distanza lungo il percorso (per i tratteggi).
import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/** Buffer preallocato di segmenti per le linee spesse (posizioni, colori, cammino ottico). */
export class SegBuffer {
  constructor(max) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6); this.dist = new Float32Array(max * 2);
    this.bPos = new THREE.InstancedInterleavedBuffer(this.pos, 6, 1);
    this.bCol = new THREE.InstancedInterleavedBuffer(this.col, 6, 1);
    this.bDist = new THREE.InstancedInterleavedBuffer(this.dist, 2, 1);
    for (const b of [this.bPos, this.bCol, this.bDist]) b.setUsage(THREE.DynamicDrawUsage);
  }
  geometry() {
    const g = new LineSegmentsGeometry();
    g.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.bPos, 3, 0));
    g.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.bPos, 3, 3));
    g.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(this.bCol, 3, 0));
    g.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(this.bCol, 3, 3));
    g.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(this.bDist, 1, 0));
    g.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(this.bDist, 1, 1));
    g.instanceCount = 0;
    (this.geos || (this.geos = [])).push(g);
    return g;
  }
  reset() { this.n = 0; }
  push(ax, ay, az, bx, by, bz, c, d0, d1) {
    if (this.n >= this.max) return;
    const i = this.n * 6;
    this.pos[i] = ax; this.pos[i + 1] = ay; this.pos[i + 2] = az; this.pos[i + 3] = bx; this.pos[i + 4] = by; this.pos[i + 5] = bz;
    this.col[i] = c.r; this.col[i + 1] = c.g; this.col[i + 2] = c.b; this.col[i + 3] = c.r; this.col[i + 4] = c.g; this.col[i + 5] = c.b;
    this.dist[this.n * 2] = d0; this.dist[this.n * 2 + 1] = d1;
    this.n++;
  }
  commit() {
    this.bPos.needsUpdate = true; this.bCol.needsUpdate = true; this.bDist.needsUpdate = true;
    for (const g of this.geos) g.instanceCount = this.n;
  }
  /** Come commit(), ma porta sulla GPU solo i segmenti dal numero n0 in poi (per le scie che crescono). */
  commitFrom(n0) {
    if (this.n > n0) for (const [b, k] of [[this.bPos, 6], [this.bCol, 6], [this.bDist, 2]]) { b.addUpdateRange(n0 * k, (this.n - n0) * k); b.needsUpdate = true; }
    for (const g of this.geos) g.instanceCount = this.n;
  }
}
