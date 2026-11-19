// optics.js — modello ottico della fotocamera.
// Tracciamento sequenziale dei raggi attraverso superfici sferiche reali (legge di Snell
// in forma vettoriale), più l'analisi parassiale del sistema (matrici ABCD).
//
// Sistema di riferimento "ottico": asse ξ lungo la direzione di propagazione della luce,
// origine sul sensore (ξ = 0), spazio oggetto a ξ < 0. Coordinate trasverse (η, ζ).
// Unità: metri; lunghezze d'onda in micrometri.
//
// Nessuna dipendenza: il modulo gira identico nel browser e in Node (per i test).

export const SENSOR_W = 0.036;      // pieno formato 36 × 24 mm
export const SENSOR_H = 0.024;
export const COC = 0.00003;         // cerchio di confusione ammesso: 0,03 mm

export const WAVELENGTHS = { r: 0.610, g: 0.550, b: 0.465, d: 0.5876 };

// Vetri ottici: indice n_d e numero di Abbe V_d (catalogo Schott).
const GLASS = {
  SK2:  { nd: 1.60738, vd: 56.65 },
  SK16: { nd: 1.62041, vd: 60.32 },
  F5:   { nd: 1.60342, vd: 38.03 },
  BK7:  { nd: 1.51680, vd: 64.17 },
};

const LD = 0.5876, LF = 0.4861, LC = 0.6563;

/** Indice di rifrazione alla lunghezza d'onda data (dispersione di Cauchy a due termini). */
export function glassIndex(name, lambda) {
  if (!name) return 1;
  const g = GLASS[name];
  const B = ((g.nd - 1) / g.vd) / (1 / (LF * LF) - 1 / (LC * LC));
  const A = g.nd - B / (LD * LD);
  return A + B / (lambda * lambda);
}

// Schemi ottici (prescrizioni in millimetri alla focale di progetto).
// R > 0: centro di curvatura verso il sensore. t: distanza dalla superficie successiva.
const DESIGNS = {
  gauss: {
    label: 'Doppio Gauss',
    minN: 2.8, maxN: 22, blades: 9, sdScale: 1.09, maxExt: 0.2, chromatic: false,
    surfaces: [
      { R: 54.153,   t: 8.747,  glass: 'SK2',  sd: 29.225 },
      { R: 152.522,  t: 0.5,    glass: null,   sd: 28.141 },
      { R: 35.951,   t: 14.0,   glass: 'SK16', sd: 24.296 },
      { R: Infinity, t: 3.777,  glass: 'F5',   sd: 21.297 },
      { R: 22.270,   t: 14.253, glass: null,   sd: 14.919 },
      { stop: true,  t: 12.428, sd: 10.229 },
      { R: -25.685,  t: 3.777,  glass: 'F5',   sd: 13.188 },
      { R: Infinity, t: 10.834, glass: 'SK16', sd: 16.468 },
      { R: -36.980,  t: 0.5,    glass: null,   sd: 18.930 },
      { R: 196.417,  t: 6.858,  glass: 'SK16', sd: 21.311 },
      { R: -67.148,  t: 0,      glass: null,   sd: 21.646 },
    ],
  },
  singlet: {
    label: 'Lente singola',
    minN: 2.8, maxN: 22, blades: 9, sdScale: 1.0, maxExt: 0.2, chromatic: true,
    surfaces: [
      { R: 103.0,   t: 7.0, glass: 'BK7', sd: 20.5 },
      { R: -103.0,  t: 3.0, glass: null,  sd: 20.5 },
      { stop: true, t: 0,   sd: 18.5 },
    ],
  },
  pinhole: {
    label: 'Foro stenopeico',
    pinhole: true, blades: 0, chromatic: false,
    minDiam: 0.1e-3, maxDiam: 3e-3,
  },
};

export function designInfo(type) { return DESIGNS[type]; }

const TWO_PI = Math.PI * 2;

export class LensSystem {
  /**
   * @param {'gauss'|'singlet'|'pinhole'} type
   * @param {number} focalMm lunghezza focale (per lo stenopeico: distanza foro–sensore)
   */
  constructor(type, focalMm) {
    const D = DESIGNS[type];
    this.type = type;
    this.design = D;
    this.label = D.label;
    this.isPinhole = !!D.pinhole;
    this.blades = D.blades;
    this.bladePhase = Math.PI / 2;
    this.chromatic = !!D.chromatic;
    this.focalMm = focalMm;
    this.e = 0;

    if (this.isPinhole) {
      const v = focalMm * 1e-3;
      this.f = Infinity;
      this.fNominal = v;
      this.surf = [{ stop: true, R: Infinity, c: 0, z: 0, sd: 0.006, glass: null }];
      this.iStop = 0;
      this.L = 0;
      this.bfl = v;
      this.minN = v / D.maxDiam; this.maxN = v / D.minDiam;
      this.Af = 1; this.zEP = 0;
      this.zH = 0; this.zHp = 0;
      this.rStopMax = D.maxDiam / 2;
      this.rStop = 0.0002;
      this.elements = [];
      this.groups = [];
    } else {
      // 1) focale di progetto → fattore di scala
      let z = 0;
      const raw = D.surfaces.map((s) => {
        const o = { stop: !!s.stop, R: s.stop || !isFinite(s.R) ? Infinity : s.R, z, sd: s.sd, glass: s.glass || null };
        z += s.t || 0;
        return o;
      });
      const eflDesign = LensSystem._efl(raw);
      const k = (focalMm / eflDesign) * 1e-3;
      this.surf = raw.map((s) => ({
        stop: s.stop,
        R: isFinite(s.R) ? s.R * k : Infinity,
        c: isFinite(s.R) ? 1 / (s.R * k) : 0,
        z: s.z * k,
        sd: s.sd * k * (s.stop ? 1 : D.sdScale),
        glass: s.glass,
      }));
      this.iStop = this.surf.findIndex((s) => s.stop);
      this.L = this.surf[this.surf.length - 1].z;
      this.minN = D.minN; this.maxN = D.maxN;

      // 2) analisi parassiale (riga d)
      const M = this._matrix(LD);
      this.f = -1 / M.C;
      this.fNominal = this.f;
      this.bfl = -M.A / M.C;
      // piani principali, come distanze z dal primo vertice (verso il sensore)
      this.zHp = this.L + this.bfl - this.f;
      this.zH = -(1 - M.D) / M.C;
      // pupilla d'ingresso: immagine del diaframma data dal gruppo anteriore
      const F = this._matrixToStop(LD);
      this.Af = F.A;
      this.zEP = F.B / F.A;
      this.rStopMax = (this.f / (2 * this.minN)) * Math.abs(this.Af);
      this.rStop = this.rStopMax;

      // 3) elementi di vetro e gruppi incollati (per il modello 3D)
      this.elements = [];
      for (let i = 0; i < this.surf.length - 1; i++) {
        if (this.surf[i].glass) this.elements.push({ iFront: i, iBack: i + 1, glass: this.surf[i].glass });
      }
      this.groups = [];
      for (const el of this.elements) {
        const g = this.groups[this.groups.length - 1];
        if (g && g[g.length - 1].iBack === el.iFront) g.push(el); else this.groups.push([el]);
      }
    }
    this.N = this.minN;
    this._tables = null;
    this.update();
  }

  // ───────────────────────── ottica parassiale ─────────────────────────

  static _efl(raw) {
    let y = 1, u = 0, n = 1;
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!s.stop) {
        const n2 = glassIndex(s.glass, LD);
        const c = isFinite(s.R) ? 1 / s.R : 0;
        u = (n * u - y * c * (n2 - n)) / n2;
        n = n2;
      }
      if (i < raw.length - 1) y += (raw[i + 1].z - s.z) * u;
    }
    return -1 / u;
  }

  /** Propaga il raggio parassiale (y,u) dalle superfici 0…iEnd-1 fino al piano della superficie iEnd
   *  (iEnd = numero di superfici → subito dopo l'ultima rifrazione). */
  _parax(y, u, iEnd, lambda) {
    const S = this.surf;
    let n = 1;
    for (let i = 0; i < Math.min(iEnd, S.length); i++) {
      const s = S[i];
      if (!s.stop) {
        const n2 = glassIndex(s.glass, lambda);
        u = (n * u - y * s.c * (n2 - n)) / n2;
        n = n2;
      }
      if (i + 1 < S.length && i + 1 <= iEnd) y += (S[i + 1].z - s.z) * u;
    }
    return [y, u];
  }

  _matrix(lambda) {
    const n = this.surf.length;
    const [A, C] = this._parax(1, 0, n, lambda);
    const [B, D] = this._parax(0, 1, n, lambda);
    return { A, B, C, D };
  }

  _matrixToStop(lambda) {
    const [A, C] = this._parax(1, 0, this.iStop, lambda);
    const [B, D] = this._parax(0, 1, this.iStop, lambda);
    return { A, B, C, D };
  }

  /** Matrice dal piano della pupilla d'ingresso al sensore: restituisce κ (inverso della distanza
   *  del piano coniugato al sensore, misurata dalla pupilla) e v_e (distanza immagine efficace). */
  _conjugate(lambda) {
    if (this.isPinhole) return { kappa: -1 / this.fNominal, ve: this.fNominal };
    const M = this._matrix(lambda);
    const p = -this.zEP;                    // dalla pupilla al primo vertice
    const d = this.bfl + this.e;            // dall'ultimo vertice al sensore
    const As = M.A + d * M.C;
    const Bs = (M.A * p + M.B) + d * (M.C * p + M.D);
    return { kappa: -As / Bs, ve: Bs };
  }

  // ───────────────────────── stato (fuoco, diaframma) ─────────────────────────

  /** ξ (riferimento ottico) della superficie i con la messa a fuoco corrente. */
  xi(i) { return -(this.bfl + this.L - this.surf[i].z) - this.e; }
  /** Coordinata x di mondo (sensore in x = 0, soggetti a x > 0) di un punto a distanza z dal primo vertice. */
  xOfZ(z) { return this.bfl + this.L - z + this.e; }

  get xFront() { return this.xOfZ(0); }
  get xRear() { return this.xOfZ(this.L); }
  get xStop() { return this.xOfZ(this.surf[this.iStop].z); }
  get xEP() { return this.xOfZ(this.zEP); }
  get xH() { return this.xOfZ(this.zH); }
  get xHp() { return this.xOfZ(this.zHp); }
  get xF() { return this.isPinhole ? NaN : this.xH + this.f; }      // fuoco anteriore
  get xFp() { return this.isPinhole ? NaN : this.xHp - this.f; }    // fuoco posteriore

  get maxExtension() { return this.isPinhole ? 0 : this.design.maxExt * this.f; }

  /** Distanza minima di messa a fuoco, misurata dal piano del sensore. */
  get minFocusDist() {
    if (this.isPinhole) return 0;
    const e = this.maxExtension, f = this.f;
    return f * (f + e) / e + (this.bfl + this.L - this.zH) + e;
  }

  /** Mette a fuoco alla distanza d (m) dal sensore; Infinity = infinito. Sposta l'intero gruppo ottico. */
  setFocus(d) {
    if (this.isPinhole) { this.e = 0; this.focusSetting = Infinity; this.update(); return; }
    const f = this.f;
    let e = 0;
    if (isFinite(d)) {
      const a = d - (this.bfl + this.L - this.zH);
      const q = (a - f) * (a - f) - 4 * f * f;
      e = q <= 0 ? this.maxExtension : ((a - f) - Math.sqrt(q)) / 2;
    }
    this.e = Math.min(Math.max(e, 0), this.maxExtension);
    this.update();
  }

  /** Imposta il diaframma (numero f). Per lo stenopeico usare setPinhole. */
  setAperture(N) {
    if (this.isPinhole) return;
    this.N = Math.min(Math.max(N, this.minN), this.maxN);
    this.rStop = Math.min((this.f / (2 * this.N)) * Math.abs(this.Af), this.rStopMax);
    this.update();
  }

  /** Diametro del foro stenopeico (m). */
  setPinhole(diam) {
    if (!this.isPinhole) return;
    this.rStop = diam / 2;
    this.N = this.fNominal / diam;
    this.update();
  }

  update() {
    this._tables = null;
    const n = this.blades;
    const open = this.isPinhole || this.rStop >= this.rStopMax * 0.999;
    this.polygonal = !open && n >= 3;
    // poligono con la stessa area del cerchio nominale
    this.rIn = this.polygonal ? this.rStop * Math.sqrt(Math.PI / (n * Math.tan(Math.PI / n))) : this.rStop;
    this.rCirc = this.polygonal ? Math.min(this.rIn / Math.cos(Math.PI / n), this.rStopMax) : this.rStop;
    // chiudendosi, le lamelle ruotano: il poligono dell'apertura ruota con loro
    this.bladePhase = Math.PI / 2 + (this.polygonal ? 0.9 * Math.acos(Math.min(1, this.rIn / this.rStopMax)) : 0);

    const c = this._conjugate(LD);
    this.kappa = c.kappa;                 // 1 / distanza (pupilla → piano a fuoco); ≤ 0: nessun piano reale
    this.ve = c.ve;
    this.rEP = this.rStop / Math.abs(this.Af);
    this.rEPcirc = this.rCirc / Math.abs(this.Af);
    this.Neff = this.ve / (2 * this.rEP);  // numero f efficace (include il tiraggio)
    this.focusDist = this.kappa > 1e-9 ? 1 / this.kappa + this.xEP : Infinity;   // dal sensore
    this.mag = this.kappa > 0 ? this.ve * this.kappa : 0;                        // ingrandimento |m|
    // equazione delle lenti riferita ai piani principali
    if (!this.isPinhole) {
      this.sImg = this.xHp;                                   // s′ : da H′ al sensore
      this.sObj = isFinite(this.focusDist) ? this.focusDist - this.xH : Infinity;   // s : dal piano a fuoco ad H
    } else { this.sImg = this.fNominal; this.sObj = Infinity; }
  }

  // ───────────────────────── grandezze fotografiche ─────────────────────────

  /** Limiti della profondità di campo (distanze dal sensore). */
  dofLimits(coc = COC) {
    if (this.kappa <= 0 && !this.isPinhole) return { near: this._hyperNear(coc), far: Infinity };
    const D = 2 * this.rEP, ve = this.ve;
    const dn = ve * this.kappa * D + coc;
    const df = ve * this.kappa * D - coc;
    const near = dn > 0 ? ve * D / dn + this.xEP : Infinity;
    const far = df > 0 ? ve * D / df + this.xEP : Infinity;
    return { near, far };
  }
  _hyperNear(coc) { return this.ve * 2 * this.rEP / coc + this.xEP; }

  /** Distanza iperfocale (dal sensore). */
  get hyperfocal() { return this.isPinhole ? NaN : this.f * this.f / (this.N * COC) + this.f; }

  /** Diametro del cerchio di sfocatura sul sensore per un punto a distanza x (di mondo) dal sensore. */
  blurDiameter(x) {
    const u = x - this.xEP;
    if (u <= 0) return NaN;
    return 2 * this.rEP * this.ve * Math.abs(1 / u - this.kappa);
  }

  /** Diametro del disco di Airy sul sensore (diffrazione), λ in µm. */
  airyDiameter(lambda = 0.55) { return 2.44 * lambda * 1e-6 * this.Neff; }

  /** Angoli di campo (rad) orizzontale e verticale. */
  get fov() {
    return { h: 2 * Math.atan(SENSOR_W / 2 / this.ve), v: 2 * Math.atan(SENSOR_H / 2 / this.ve) };
  }

  // ───────────────────────── diaframma ─────────────────────────

  /** Il punto (η,ζ) sul piano del diaframma è dentro l'apertura? */
  apertureContains(eta, zeta) {
    const r2 = eta * eta + zeta * zeta;
    if (r2 > this.rStopMax * this.rStopMax) return false;
    if (!this.polygonal) return r2 <= this.rStop * this.rStop;
    const n = this.blades, rin = this.rIn;
    for (let k = 0; k < n; k++) {
      const a = this.bladePhase + (TWO_PI * k) / n;
      if (eta * Math.cos(a) + zeta * Math.sin(a) > rin) return false;
    }
    return true;
  }

  /** Vertici dell'apertura sul piano della pupilla d'ingresso (η,ζ), per disegno e campionamento. */
  pupilOutline(segments = 72) {
    const pts = [];
    const s = 1 / this.Af;
    if (!this.polygonal) {
      for (let i = 0; i < segments; i++) {
        const a = (TWO_PI * i) / segments;
        pts.push([this.rStop * Math.cos(a) * s, this.rStop * Math.sin(a) * s]);
      }
      return pts;
    }
    const n = this.blades, rc = this.rIn / Math.cos(Math.PI / n);
    for (let k = 0; k < n; k++) {
      const a = this.bladePhase + (TWO_PI * (k + 0.5)) / n;
      let r = rc;
      pts.push([r * Math.cos(a) * s, r * Math.sin(a) * s]);
    }
    return pts;
  }

  // ───────────────────────── tracciamento reale ─────────────────────────

  /**
   * Traccia un raggio reale dallo spazio oggetto al sensore.
   * @param {number[]} o origine [ξ,η,ζ]   @param {number[]} d direzione unitaria (d[0] > 0)
   * @param {number} lambda lunghezza d'onda (µm)
   * @param {Float64Array} pts riceve i punti del percorso (3 per punto), a partire dal primo impatto
   * @param {Float64Array} idx riceve l'indice di rifrazione del mezzo PRIMA di ciascun punto
   * @param {boolean} free ignora diaframma e montature (per l'analisi delle aberrazioni)
   * @returns {{status:string, n:number}} status: ok | stop | vignette | tir | miss
   */
  trace(o, d, lambda, pts, idx, free = false) {
    const S = this.surf;
    let ox = o[0], oy = o[1], oz = o[2];
    let dx = d[0], dy = d[1], dz = d[2];
    let n1 = 1, np = 0;
    const put = (x, y, z) => { pts[np * 3] = x; pts[np * 3 + 1] = y; pts[np * 3 + 2] = z; idx[np] = n1; np++; };

    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const xv = this.xi(i);
      let px, py, pz, nx = -1, ny = 0, nz = 0;
      let hit = true;
      if (s.c === 0) {
        const t = (xv - ox) / dx;
        if (!(t > 1e-12)) return { status: 'miss', n: np };
        px = xv; py = oy + t * dy; pz = oz + t * dz;
      } else {
        const R = s.R, cx = xv + R;
        const ocx = ox - cx;
        const b = ocx * dx + oy * dy + oz * dz;
        const cc = ocx * ocx + oy * oy + oz * oz - R * R;
        const disc = b * b - cc;
        if (disc < 0) hit = false;
        else {
          const sq = Math.sqrt(disc);
          const t = R > 0 ? -b - sq : -b + sq;
          if (!(t > 1e-12)) hit = false;
          else {
            px = ox + t * dx; py = oy + t * dy; pz = oz + t * dz;
            nx = (px - cx) / R; ny = py / R; nz = pz / R;
          }
        }
        if (!hit) {
          const t = (xv - ox) / dx;
          put(xv, oy + t * dy, oz + t * dz);
          return { status: 'vignette', n: np, surface: i };
        }
      }
      const r2 = py * py + pz * pz;
      if (s.stop) {
        put(px, py, pz);
        if (!free && !this.apertureContains(py, pz)) return { status: 'stop', n: np, surface: i };
        ox = px; oy = py; oz = pz;
        continue;
      }
      if (!free && r2 > s.sd * s.sd) {
        put(px, py, pz);
        return { status: 'vignette', n: np, surface: i };
      }
      put(px, py, pz);
      // rifrazione (Snell, forma vettoriale)
      const n2 = glassIndex(s.glass, lambda);
      const mu = n1 / n2;
      const cosI = -(nx * dx + ny * dy + nz * dz);
      const sin2T = mu * mu * (1 - cosI * cosI);
      if (sin2T > 1) return { status: 'tir', n: np, surface: i };
      const cosT = Math.sqrt(1 - sin2T);
      const g = mu * cosI - cosT;
      dx = mu * dx + g * nx; dy = mu * dy + g * ny; dz = mu * dz + g * nz;
      const inv = 1 / Math.hypot(dx, dy, dz);
      dx *= inv; dy *= inv; dz *= inv;
      ox = px; oy = py; oz = pz;
      n1 = n2;
    }
    // sensore: piano ξ = 0
    const t = -ox / dx;
    if (!(t > 0)) return { status: 'miss', n: np };
    put(0, oy + t * dy, oz + t * dz);
    return { status: 'ok', n: np };
  }

  // ───────────────────────── tabelle di pupilla (aberrazioni assiali) ─────────────────────────

  /**
   * Per ogni zona ρ della pupilla d'ingresso e per ogni colore, calcola con raggi reali
   * κ(ρ,λ) e v_e(ρ,λ): dove mette a fuoco davvero quella zona dell'obiettivo. È ciò che
   * porta nella fotografia l'aberrazione sferica e quella cromatica assiale.
   */
  pupilTables() {
    if (this._tables) return this._tables;
    const NODES = 12;
    const lambdas = this.chromatic ? [WAVELENGTHS.r, WAVELENGTHS.g, WAVELENGTHS.b] : [WAVELENGTHS.g];
    const rMax = Math.max(this.rEPcirc, 1e-7);
    const pts = new Float64Array(3 * (this.surf.length + 2));
    const idx = new Float64Array(this.surf.length + 2);
    const xiEP = -this.xEP;
    const back = Math.max(this.xFront - this.xEP, 0) + 0.02;
    const tables = lambdas.map((lambda) => {
      const par = this._conjugate(lambda);
      const kappa = new Float64Array(NODES), ve = new Float64Array(NODES);
      for (let j = 0; j < NODES; j++) {
        const rho = rMax * Math.max(j, 0.15) / (NODES - 1);
        const land = (tau) => {
          const inv = 1 / Math.hypot(1, tau);
          const st = this.trace([xiEP - back, rho - back * tau, 0], [inv, tau * inv, 0], lambda, pts, idx, true);
          return st.status === 'ok' ? pts[(st.n - 1) * 3 + 1] : NaN;
        };
        let tau = par.kappa * rho, slope = par.ve, ok = true;
        for (let it = 0; it < 6; it++) {
          const h = 1e-5;
          const y0 = land(tau), y1 = land(tau + h);
          if (!isFinite(y0) || !isFinite(y1)) { ok = false; break; }
          slope = (y1 - y0) / h;
          const dt = -y0 / slope;
          tau += dt;
          if (Math.abs(dt) < 1e-10) break;
        }
        kappa[j] = ok ? tau / rho : par.kappa;
        ve[j] = ok ? slope : par.ve;
      }
      return { lambda, kappa, ve, rMax };
    });
    this._tables = tables;
    return tables;
  }

  /** Interpola la tabella di pupilla alla zona ρ. */
  static lookup(table, rho, out) {
    const n = table.kappa.length;
    const x = Math.min(Math.max(rho / table.rMax, 0), 1) * (n - 1);
    const i = Math.min(Math.floor(x), n - 2), t = x - i;
    out.kappa = table.kappa[i] * (1 - t) + table.kappa[i + 1] * t;
    out.ve = table.ve[i] * (1 - t) + table.ve[i + 1] * t;
    return out;
  }
}
