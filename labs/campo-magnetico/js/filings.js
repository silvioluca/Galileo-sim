// filings.js — la limatura di ferro sulla lastra.
//
// Sparsa, ogni granello (1–2,5 mm) ha posizione e orientamento a caso. Picchiettando la lastra i granelli saltellano:
// dove il campo li magnetizza abbastanza (sopra qualche decimo di millitesla) si girano lungo il campo e si attaccano
// in catene, che seguono le linee di campo; dove il campo è debole restano dove sono, solo un po' rimescolati.
// Le catene vengono dalle linee di campo ugualmente spaziate (Jobard–Lefer) del calcolo: lungo ciascuna si mettono
// granelli in fila, con qualche buco; vicino ai poli, dove il campo è più forte, se ne trattengono di più. Dove il
// campo è quasi verticale, sopra i poli, i granelli si rizzano.
import * as THREE from 'three';
import { PLATE, sample } from './field.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const B_ALIGN = [2e-5, 2.5e-4];          // T: sotto non si girano, sopra si girano del tutto
const B_STAND = [6e-4, 8e-3];            // T: si rizzano dove il campo verticale è forte

export class Filings {
  constructor(n) {
    this.n = n;
    const F = () => new Float32Array(n);
    this.sx = F(); this.sz = F(); this.sa = F(); this.tx = F(); this.tz = F(); this.ta = F(); this.len = F();
    this.al = F(); this.al0 = F(); this.al1 = F(); this.chain = new Uint8Array(n);
    this.count = 0; this.anim = null; this.dirty = false;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._o = [0, 0, 0];
  }

  /**
   * Prepara le catene dalle linee di campo e sparge la limatura. holes: [[x, z, r]] dove non può stare
   * (i conduttori che attraversano la lastra), avoid: cerchi da lasciare liberi (le bussole).
   */
  setup(lines, holes, avoid = [], bAt = null) {
    const slots = [];
    for (const L of lines) {
      const n = L.length / 3; if (n < 3) continue;
      let i = 0, rem = 0;
      const cum = [0]; for (let k = 1; k < n; k++) cum.push(cum[k - 1] + Math.hypot(L[k * 3] - L[k * 3 - 3], L[k * 3 + 1] - L[k * 3 - 2]));
      const total = cum[n - 1];
      let s = Math.random() * 0.002;
      while (s < total - 0.001) {
        const len = 0.0011 + Math.random() * 0.0013, c = s + len / 2;
        while (i < n - 2 && cum[i + 1] < c) i++;
        const f = (c - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]);
        const x = L[i * 3] + (L[i * 3 + 3] - L[i * 3]) * f, z = L[i * 3 + 1] + (L[i * 3 + 4] - L[i * 3 + 1]) * f;
        const B = L[i * 3 + 2];
        slots.push([x, z, Math.atan2(-(L[i * 3 + 4] - L[i * 3 + 1]), L[i * 3 + 3] - L[i * 3]), len, B]);
        s += len + 0.0002 + Math.random() * 0.0004 + (Math.random() < 0.12 ? 0.0015 + Math.random() * 0.003 : 0);
        rem++;
      }
    }
    // più granelli dove il campo è forte
    const Bs = slots.map((s) => s[4]).sort((a, b) => a - b), Bref = Bs.length ? Bs[Math.floor(Bs.length * 0.85)] : 1;
    let chosen = slots.filter((s) => Math.random() < Math.min(1, 0.3 + 0.7 * Math.pow(s[4] / Bref, 0.4)));
    const blocked = (x, z) => holes.some(([hx, hz, r]) => (x - hx) ** 2 + (z - hz) ** 2 < r * r) || avoid.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < r * r);
    chosen = chosen.filter((s) => !blocked(s[0], s[1]));
    const maxChain = Math.floor(this.n * 0.74);
    if (chosen.length > maxChain) { for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; } chosen.length = maxChain; }
    const X = PLATE.w / 2 - 0.004, Z = PLATE.d / 2 - 0.004;
    let k = 0;
    for (const s of chosen) {
      this.tx[k] = s[0]; this.tz[k] = s[1]; this.ta[k] = s[2]; this.len[k] = s[3]; this.chain[k] = 1; k++;
    }
    // gli altri granelli sparsi un po' dappertutto, ma ammucchiati dove il campo è forte: sopra i poli, attorno ai fili
    const Bhi = 0.35 * (Bs.length ? Bs[Bs.length - 1] : 1);
    for (; k < this.n; k++) {
      let x, z, tries = 0;
      do { x = (Math.random() * 2 - 1) * X; z = (Math.random() * 2 - 1) * Z; } while ((blocked(x, z) || (bAt && Math.random() > 0.1 + 0.9 * Math.pow(Math.min(1, bAt(x, z) / Bhi), 0.9))) && ++tries < 60);
      this.tx[k] = x; this.tz[k] = z; this.ta[k] = 0; this.len[k] = 0.001 + Math.random() * 0.0014; this.chain[k] = 0;
    }
    this.count = this.n;
    this.sprinkle(holes, avoid);
  }
  /** Sparge di nuovo la limatura: posizioni e orientamenti a caso, vicino a dove poi andrà. */
  sprinkle(holes = [], avoid = []) {
    const X = PLATE.w / 2 - 0.003, Z = PLATE.d / 2 - 0.003;
    const blocked = (x, z) => holes.some(([hx, hz, r]) => (x - hx) ** 2 + (z - hz) ** 2 < r * r) || avoid.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < r * r);
    for (let i = 0; i < this.n; i++) {
      if (this.chain[i]) {
        let x, z, t = 0;
        do { x = this.tx[i] + gauss() * 0.0022; z = this.tz[i] + gauss() * 0.0022; } while (blocked(x, z) && ++t < 10);
        this.sx[i] = Math.max(-X, Math.min(X, x)); this.sz[i] = Math.max(-Z, Math.min(Z, z));
      } else { this.sx[i] = this.tx[i]; this.sz[i] = this.tz[i]; }
      this.sa[i] = Math.random() * Math.PI * 2;
      this.al[i] = this.al0[i] = this.al1[i] = 0;
    }
    this.anim = null; this.dirty = true;
  }
  /** Un colpo sulla lastra: g, scale per il campo attuale. Restituisce la durata dell'animazione. */
  tap(g, scale) {
    const o = this._o;
    for (let i = 0; i < this.count; i++) {
      sample(g, this.tx[i], this.tz[i], scale, o);
      const w = smooth(B_ALIGN[0], B_ALIGN[1], Math.hypot(o[0], o[1], o[2]));
      this.al0[i] = this.al[i];
      this.al1[i] = Math.min(1, this.al[i] + 0.42 * w);
      if (w < 0.6) {
        // nel campo debole i granelli saltellano e basta
        const j = (1 - w) * 0.0007;
        this.sx[i] += (Math.random() - 0.5) * j; this.sz[i] += (Math.random() - 0.5) * j; this.sa[i] += (Math.random() - 0.5) * (1 - w) * 1.4;
      }
    }
    this.anim = { t: 0, dur: 0.34 };
    return this.anim.dur;
  }
  /** Avanza l'animazione; true se i granelli si sono mossi. */
  step(dt) {
    if (!this.anim) { const d = this.dirty; return d; }
    this.anim.t += dt;
    const k = Math.min(1, this.anim.t / this.anim.dur), e = k * k * (3 - 2 * k);
    for (let i = 0; i < this.count; i++) this.al[i] = this.al0[i] + (this.al1[i] - this.al0[i]) * e;
    if (k >= 1) this.anim = null;
    return true;
  }
  /** Scrive le matrici dei granelli nel mesh (coordinate della lastra), con il campo g × scale. */
  write(mesh, g, scale) {
    const o = this._o, m = this._m, q = this._q, eu = this._e, p = this._p, s = this._s;
    for (let i = 0; i < this.count; i++) {
      const a = this.al[i], e = a * a * (3 - 2 * a);
      const x = this.sx[i] + (this.tx[i] - this.sx[i]) * e * this.chain[i], z = this.sz[i] + (this.tz[i] - this.sz[i]) * e * this.chain[i];
      sample(g, x, z, scale, o);
      const bh = Math.hypot(o[0], o[2]), B = Math.hypot(bh, o[1]);
      // il verso del campo nel piano (il granello non ha verso: si prende quello più vicino all'orientamento a caso)
      let yawB = bh > 1e-12 ? Math.atan2(-o[2], o[0]) : this.sa[i];
      if (this.chain[i] && e > 0.5) yawB = this.ta[i];
      if (Math.abs(angDiff(this.sa[i], yawB)) > Math.PI / 2) yawB += Math.PI;
      const yaw = this.sa[i] + angDiff(this.sa[i], yawB) * e;
      // si rizzano dove il campo è quasi verticale e forte; si solleva l'estremo verso cui il campo sale
      let tilt = Math.min(1.2, Math.atan2(Math.abs(o[1]), bh)) * e * smooth(B_STAND[0], B_STAND[1], B);
      const dx = Math.cos(yaw), dz = -Math.sin(yaw), upx = o[0] * Math.sign(o[1] || 1), upz = o[2] * Math.sign(o[1] || 1);
      if (dx * upx + dz * upz < 0) tilt = -tilt;
      const L = this.len[i];
      eu.set(0, yaw, tilt, 'YZX'); q.setFromEuler(eu);
      p.set(x, 0.00016 + (L / 2) * Math.abs(Math.sin(tilt)), z); s.set(L, 0.00022, 0.00034);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    }
    mesh.count = this.count; mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
}
