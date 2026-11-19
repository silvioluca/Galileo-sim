// hydro.js — l'idrostatica del laboratorio: liquidi e materiali, forma dei corpi, volume immerso, dinamometro a
// molla, livello del liquido, vaso a sfioro, secchiello di Archimede.
//
// Il corpo appeso al filo resta dritto: il volume immerso e il suo baricentro sono esatti (cilindro, cubo,
// calotta sferica). Tagliato il filo, cilindri e cubi possono inclinarsi: volume immerso e momenti si leggono da
// tabelle calcolate una volta per forma, integrando la sezione del corpo su una griglia fine (la terza dimensione
// entra come spessore esatto di ogni cella). Così un cubo di legno trova da solo il suo assetto: di spigolo.
// Il livello del liquido sale con il volume immerso (il volume di liquido si conserva); dal vaso a sfioro il
// liquido in più esce dal beccuccio con la legge dello stramazzo.
// Unità SI; le quote y sono del mondo (metri, pavimento a 0). Nessuna dipendenza: gira anche in Node.

export const GRAVITY = {
  earth: { name: 'Terra', g: 9.81 },
  moon: { name: 'Luna', g: 1.62 },
  mars: { name: 'Marte', g: 3.71 },
};

/** Liquidi a 20 °C: densità (kg/m³), viscosità (Pa·s), aspetto. */
export const LIQUIDS = {
  water: { name: 'Acqua', rho: 998.2, mu: 1.0e-3, color: '#cfe8f2', alpha: 0.16, note: 'distillata, a 20 °C' },
  salt: { name: 'Acqua salata', rho: null, mu: 1.1e-3, color: '#d3e9ec', alpha: 0.18, note: 'acqua e sale da cucina' },
  alcohol: { name: 'Alcol', rho: 789.3, mu: 1.2e-3, color: '#eef2f4', alpha: 0.08, note: 'etanolo puro' },
  oil: { name: 'Olio', rho: 915, mu: 0.081, color: '#d9c44a', alpha: 0.55, note: 'olio d\'oliva' },
  glycerol: { name: 'Glicerina', rho: 1261, mu: 1.41, color: '#f1ecd4', alpha: 0.18, note: 'pura: densa e vischiosa' },
  mercury: { name: 'Mercurio', rho: 13534, mu: 1.53e-3, metal: true, note: 'un metallo liquido, tossico: qui non fa male' },
};
/** Acqua e cloruro di sodio: c in percento in massa, da 0 alla saturazione (26 %). */
export const saltRho = (c) => 998.2 + 7.15 * c + 0.018 * c * c;
export function liquid(key, salt = 3.5) {
  const L = LIQUIDS[key];
  return { ...L, key, rho: key === 'salt' ? saltRho(salt) : L.rho };
}

/** Materiali dei corpi (kg/m³). */
export const MATERIALS = {
  alu: { name: 'Alluminio', rho: 2700 },
  iron: { name: 'Ferro', rho: 7870 },
  brass: { name: 'Ottone', rho: 8500 },
  lead: { name: 'Piombo', rho: 11340 },
  glass: { name: 'Vetro', rho: 2500 },
  pvc: { name: 'Plastica', rho: 1380, note: 'PVC' },
  wood: { name: 'Legno', rho: 520, note: 'pino' },
  ice: { name: 'Ghiaccio', rho: 917 },
  cork: { name: 'Sughero', rho: 240 },
};

/** Dinamometri a molla della serie scolastica: portata, divisione della scala, risoluzione di lettura, colore. */
export const RANGES = [
  { F: 1, div: 0.02, res: 0.01, color: '#ece9e0' },
  { F: 2, div: 0.02, res: 0.01, color: '#efc31c' },
  { F: 5, div: 0.05, res: 0.02, color: '#3aa458' },
  { F: 10, div: 0.1, res: 0.05, color: '#d6422e' },
  { F: 20, div: 0.2, res: 0.1, color: '#2d6bd0' },
  { F: 50, div: 0.5, res: 0.2, color: '#2a2c30' },
];
export const TRAVEL = 0.10;                    // corsa della molla a fondo scala (m)
/** Il dinamometro più sensibile che regge il carico (con un po' di margine). */
export const pickRange = (W) => RANGES.find((r) => r.F >= W * 1.08) || RANGES[RANGES.length - 1];

// ───────────────────────────── forma dei corpi ─────────────────────────────
/** Cilindro alto una volta e mezza il diametro, cubo, sfera: dimensioni dal volume V (m³). */
export function shape(kind, V) {
  if (kind === 'cyl') { const R = Math.cbrt(V / (3 * Math.PI)); return { kind, V, R, H: 3 * R, A: Math.PI * R * R, half: 1.5 * R, D: 2 * R, Cd: 0.9 }; }
  if (kind === 'cube') { const a = Math.cbrt(V); return { kind, V, a, H: a, A: a * a, half: a / 2, D: a, Cd: 1.05 }; }
  const r = Math.cbrt((3 * V) / (4 * Math.PI));
  return { kind: 'sphere', V, r, H: 2 * r, A: Math.PI * r * r, half: r, D: 2 * r, Cd: 0.47 };
}
/** Corpo dritto immerso per h dal fondo: volume immerso e quota del suo baricentro sopra il fondo del corpo. */
export function subUpright(S, h) {
  if (h <= 0) return { V: 0, yc: 0 };
  if (S.kind === 'sphere') {
    const r = S.r, x = Math.min(h, 2 * r);
    return { V: (Math.PI * x * x * (3 * r - x)) / 3, yc: (x * (8 * r - 3 * x)) / (12 * r - 4 * x) };
  }
  const x = Math.min(h, S.H);
  return { V: S.A * x, yc: x / 2 };
}
/** Momento d'inerzia attorno a un asse orizzontale per il baricentro, per unità di massa. */
export function inertia(S) {
  if (S.kind === 'cyl') return (3 * S.R * S.R + S.H * S.H) / 12;
  if (S.kind === 'cube') return (S.a * S.a) / 6;
  return (2 * S.r * S.r) / 5;
}
/** Spigoli della sezione del corpo inclinato di th (rotazione attorno all'asse z), rispetto al baricentro;
 *  per la sfera il solo punto più basso. Servono per l'appoggio sul fondo. */
export function corners(S, th) {
  if (S.kind === 'sphere') return [{ dx: 0, dy: -S.r }];
  const X = S.kind === 'cyl' ? S.R : S.a / 2, Y = S.H / 2, c = Math.cos(th), s = Math.sin(th);
  return [[X, Y], [X, -Y], [-X, Y], [-X, -Y]].map(([x, y]) => ({ dx: x * c - y * s, dy: x * s + y * c }));
}
/** Punto più basso del corpo inclinato. */
export function lowest(S, th) { return corners(S, th).reduce((a, b) => (b.dy < a.dy ? b : a)); }

// ───────────────────────────── corpi inclinati: tabelle ─────────────────────────────
const tables = new Map();
/**
 * Volume immerso e suoi momenti (orizzontale e verticale, rispetto al baricentro) in funzione dell'inclinazione
 * e della quota d del pelo libero sopra il baricentro. La sezione nel piano xy (asse del corpo lungo y) è divisa
 * in n×n celle; ogni cella pesa il suo spessore in z (corda del cerchio per il cilindro, il lato per il cubo).
 */
export function tiltTable(S) {
  const key = `${S.kind}:${S.V.toPrecision(6)}`;
  if (tables.has(key)) return tables.get(key);
  const cyl = S.kind === 'cyl', X = cyl ? S.R : S.a / 2, Y = S.H / 2;
  const P = cyl ? Math.PI : Math.PI / 2, NT = cyl ? 73 : 37, step = P / (NT - 1);
  const E = Math.hypot(X, Y) * 1.002, ND = 241, n = 110;
  const dx = (2 * X) / n, dy = (2 * Y) / n, N = n * n;
  const xs = new Float64Array(N), ys = new Float64Array(N), ws = new Float64Array(N);
  let tot = 0;
  for (let i = 0; i < n; i++) {
    const x = -X + (i + 0.5) * dx, w = (cyl ? 2 * Math.sqrt(Math.max(0, X * X - x * x)) : 2 * X) * dx * dy;
    for (let j = 0; j < n; j++) { const k = i * n + j; xs[k] = x; ys[k] = -Y + (j + 0.5) * dy; ws[k] = w; tot += w; }
  }
  const norm = S.V / tot;
  const V = new Float32Array(NT * ND), Mx = new Float32Array(NT * ND), My = new Float32Array(NT * ND);
  const dV = new Float64Array(ND), dX = new Float64Array(ND), dY = new Float64Array(ND);
  for (let t = 0; t < NT; t++) {
    const c = Math.cos(t * step), s = Math.sin(t * step);
    dV.fill(0); dX.fill(0); dY.fill(0);
    for (let k = 0; k < N; k++) {
      const xp = xs[k] * c - ys[k] * s, yp = xs[k] * s + ys[k] * c, w = ws[k] * norm;
      const u = ((yp + E) / (2 * E)) * (ND - 1), i0 = Math.min(ND - 2, Math.floor(u)), f = u - i0;
      dV[i0] += w * (1 - f); dV[i0 + 1] += w * f;
      dX[i0] += w * xp * (1 - f); dX[i0 + 1] += w * xp * f;
      dY[i0] += w * yp * (1 - f); dY[i0 + 1] += w * yp * f;
    }
    let a = 0, bx = 0, by = 0;
    for (let j = 0; j < ND; j++) {
      const o = t * ND + j;
      V[o] = a + 0.5 * dV[j]; Mx[o] = bx + 0.5 * dX[j]; My[o] = by + 0.5 * dY[j];
      a += dV[j]; bx += dX[j]; by += dY[j];
    }
  }
  const T = { NT, ND, step, E, P, V, Mx, My };
  tables.set(key, T);
  return T;
}
/** Lettura bilineare della tabella: d = quota del pelo libero sopra il baricentro. */
export function subTilted(T, th, d) {
  let a = th % T.P; if (a < 0) a += T.P;
  const kt = a / T.step, t0 = Math.min(T.NT - 2, Math.floor(kt)), ft = kt - t0;
  const u = Math.min(Math.max(((d + T.E) / (2 * T.E)) * (T.ND - 1), 0), T.ND - 1 - 1e-9);
  const j0 = Math.floor(u), fu = u - j0;
  const at = (A) => {
    const r0 = t0 * T.ND + j0, r1 = r0 + T.ND;
    return (A[r0] * (1 - fu) + A[r0 + 1] * fu) * (1 - ft) + (A[r1] * (1 - fu) + A[r1 + 1] * fu) * ft;
  };
  return { V: Math.max(0, at(T.V)), mx: at(T.Mx), my: at(T.My) };
}

// ───────────────────────────── simulazione ─────────────────────────────
const CONTACT_W = 1500;                         // pulsazione propria del contatto col fondo (rad/s)
export const SPOUT_STOP = 4e-4;                 // il vaso a sfioro smette di gocciolare 0,4 mm sopra il beccuccio
const SPOUT_W = 0.04;                           // larghezza efficace del beccuccio (m)
/**
 * Un corpo (o il cilindro col secchiello) appeso alla molla di un dinamometro, sopra un recipiente.
 * cfg: { S, rhoB, liq:{rho,mu}, g, range, yClamp, dynLen, thread, attach, mExtra, arch,
 *        vessel:{ y0, R, Vliq, spout? }, catcher? }
 *  - yClamp: quota del gancio del morsetto; dynLen: dal gancio del morsetto al gancio del dinamometro a molla scarica
 *  - attach: distanza del punto d'attacco del filo sopra il baricentro del corpo
 *  - arch: secchiello (massa mExtra, volume interno uguale a quello del cilindro)
 *  - vessel.spout: quota del beccuccio (vaso a sfioro); il liquido che ne esce finisce nel bicchiere di raccolta
 */
export class Hydro {
  constructor(c) {
    Object.assign(this, c);
    this.rho = c.liq.rho; this.mu = c.liq.mu;
    this.A = Math.PI * c.vessel.R * c.vessel.R;
    this.Vliq = c.vessel.Vliq;                       // liquido nel recipiente
    this.Vcoll = 0; this.q = 0;                      // raccolto dal beccuccio, portata
    this.Vb = 0; this.filling = 0;                   // acqua nel secchiello, versamento in corso (m³/s)
    this.k = c.range.F / TRAVEL;                     // costante della molla
    this.mBody = c.rhoB * c.S.V;
    this.Iu = inertia(c.S);
    this.free = false; this.th = 0; this.w = 0;
    this.target = c.yClamp; this.speed = 0.05; this.vClamp = 0;
    this.t = 0; this.a = 0;
    this.T = 0; this.Fb = 0; this.Fd = 0; this.Fam = 0; this.N = 0; this.ext = 0; this.bx = 0; this.by = 0; this.Vsub = 0;
    this.y = this.restY();
    this.v = 0;
    this.level = this.levelAt(this.y, 0);
  }

  get mass() { return this.mBody + (this.mExtra || 0) + this.rho * this.Vb; }
  get weight() { return this.mass * this.g; }
  get hookRest() { return this.yClamp - this.dynLen; }

  /** Volume immerso e centro di spinta (scostamenti dal baricentro) col pelo libero alla quota L. */
  submerged(L, y, th) {
    const S = this.S;
    if (!this.free || S.kind === 'sphere') {
      const s = subUpright(S, L - (y - S.half));
      return { V: s.V, bx: 0, by: s.V > 0 ? s.yc - S.half : 0 };
    }
    const t = subTilted(tiltTable(S), th, L - y);
    return { V: t.V, bx: t.V > 1e-12 ? t.mx / t.V : 0, by: t.V > 1e-12 ? t.my / t.V : 0 };
  }
  /** Livello del liquido: il volume del liquido più quello immerso, nella sezione del recipiente. */
  levelAt(y, th) {
    const v = this.vessel;
    let L = v.y0 + this.Vliq / this.A;
    for (let i = 0; i < 5; i++) L = v.y0 + (this.Vliq + this.submerged(L, y, th).V) / this.A;
    return L;
  }
  /** Allungamento della molla con il corpo in y (negativo: filo lento). */
  stretch(y) { return this.hookRest - this.thread - (y + this.attach); }

  /** Quota d'equilibrio del corpo appeso (con il livello che si adegua), per bisezione. */
  restY() {
    const top = this.hookRest - this.thread - this.attach, g = this.g, W = this.weight;
    const f = (y) => {
      const L = this.levelAt(y, 0), e = this.stretch(y);
      const low = y - this.S.half - this.vessel.y0;
      return this.k * Math.max(0, e) + this.rho * g * this.submerged(L, y, 0).V + (low < 0 ? -low * 2e5 : 0) - W;
    };
    let lo = this.vessel.y0 - 0.02, hi = top + 0.4;
    if (f(hi) > 0) return hi;
    for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  cut() {
    if (this.free || this.arch) return;
    this.free = true;
    this.th = this.S.kind === 'sphere' ? 0 : (Math.random() < 0.5 ? -1 : 1) * 0.012;
    this.w = 0;
  }
  rehook() { this.free = false; this.th = 0; this.w = 0; this.v = 0; this.y = this.restY(); }

  step(dt) {
    let left = dt;
    while (left > 1e-12) { const h = Math.min(4e-4, left); this._sub(h); left -= h; }
  }

  _sub(h) {
    const S = this.S, g = this.g, m = this.mass, rho = this.rho;
    // il morsetto scorre verso la quota scelta
    const dc = this.target - this.yClamp, mv = this.speed * h;
    const yc0 = this.yClamp;
    this.yClamp = Math.abs(dc) <= mv ? this.target : this.yClamp + Math.sign(dc) * mv;
    this.vClamp = (this.yClamp - yc0) / h;
    // livello, spinta, centro di spinta
    const L = this.levelAt(this.y, this.th);
    const sub = this.submerged(L, this.y, this.th);
    const Fb = rho * g * sub.V, fs = sub.V / S.V, v = this.v;
    // massa aggiunta: il liquido spostato accelera con il corpo
    const Ca = S.kind === 'sphere' ? 0.5 : 0.35, mA = Ca * rho * sub.V;
    // resistenza: quadratica (scia) più viscosa (conta nella glicerina), solo per la parte immersa; un corpo che
    // attraversa la superficie perde energia anche nelle onde che solleva (smorzamento di circa il 18 %)
    const wave = fs > 0.002 && fs < 0.998 ? 2 * 0.18 * Math.sqrt(rho * g * S.A * (m + mA)) : 0;
    const Fd = -fs * (0.5 * rho * S.Cd * S.A * Math.abs(v) * v + 3 * Math.PI * this.mu * S.D * v) - wave * v;
    // filo e molla: tirano solo; la molla del dinamometro ha un po' di attrito interno
    let T = 0, e = 0;
    if (!this.free) {
      e = this.stretch(this.y);
      if (e > 0) T = Math.max(0, this.k * e + 2 * 0.1 * Math.sqrt(this.k * m) * (this.vClamp - v));
    }
    // fondo del recipiente: contatto rigido smorzato in ogni spigolo che lo tocca (due spigoli: appoggio su una
    // faccia). Rigidezza in proporzione alla massa: il passo resta stabile anche per un sughero di pochi grammi
    let N = 0, tauN = 0;
    const cs = corners(S, this.th), share = cs.length > 1 ? 0.5 : 1;
    for (const p of cs) {
      const pen = this.vessel.y0 - (this.y + p.dy);
      if (pen <= 0) continue;
      const n = Math.max(0, share * m * (CONTACT_W * CONTACT_W * pen - 1.2 * CONTACT_W * (v + this.w * p.dx)));
      N += n; tauN += n * p.dx;
    }
    const a = (-m * g + T + Fb + Fd + N) / (m + mA);
    this.v += a * h; this.y += this.v * h; this.a = a;
    if (this.free && S.kind !== 'sphere') {
      // rotazione: momento della spinta (applicata nel centro di spinta) e del contatto col fondo; attrito del
      // liquido e onde, come per il moto verticale
      const Lc = S.D, I = m * this.Iu + 0.25 * rho * sub.V * this.Iu;
      const waveR = fs > 0.002 && fs < 0.998 ? 2 * 0.18 * Math.sqrt(((rho * g * S.A * Lc * Lc) / 12) * I) : 0;
      const tau = Fb * sub.bx + tauN - (0.6 * rho * fs * Lc ** 5 * Math.abs(this.w) + 8 * this.mu * Lc ** 3 + 2e-6 * m + waveR) * this.w;
      this.w += (tau / I) * h; this.th += this.w * h;
    }
    // vaso a sfioro: il liquido sopra il beccuccio esce come da uno stramazzo; sotto SPOUT_STOP la tensione
    // superficiale lo trattiene (il vaso si prepara così: riempito finché smette di gocciolare)
    if (this.vessel.spout) {
      const dh = L - this.vessel.spout;
      this.q = dh > SPOUT_STOP ? 0.6 * (2 / 3) * Math.sqrt(2 * g) * SPOUT_W * dh ** 1.5 : 0;
      const dV = Math.min(this.q * h, Math.max(0, (dh - SPOUT_STOP) * this.A));
      if (dV <= 0) this.q = 0;
      this.Vliq -= dV; this.Vcoll += dV;
    }
    // secchiello di Archimede: si riempie fino all'orlo
    if (this.filling) {
      this.Vb = Math.min(this.S.V, this.Vb + this.filling * h);
      if (this.Vb >= this.S.V) this.filling = 0;
    }
    this.level = L; this.Vsub = sub.V; this.bx = sub.bx; this.by = sub.by;
    this.T = T; this.ext = Math.max(0, e); this.Fb = Fb; this.Fd = Fd; this.N = N; this.Fam = -mA * a;
    this.t += h;
  }

  /** Lettura del dinamometro (N): la posizione dell'indice sulla scala. */
  get reading() { return this.k * this.ext; }
  /** Forza che il liquido (e il corpo appoggiato) scarica sul recipiente, oltre al peso del recipiente pieno. */
  get onVessel() { return this.Fb + this.Fd + this.Fam + this.N; }
  /** Fermo: velocità, rotazione e travaso trascurabili. */
  get settled() { return Math.abs(this.v) < 1.5e-4 && Math.abs(this.w) < 2e-3 && Math.abs(this.yClamp - this.target) < 1e-6 && this.q < 2e-8 && !this.filling; }
}
