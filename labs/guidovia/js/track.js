// track.js — la fisica della guidovia a cuscino d'aria. Moto lungo la rotaia (coordinata x, in metri
// dall'estremità sinistra) di uno o due carrelli, con:
//   · peso lungo il piano inclinato (spessori sotto il piede sinistro), spinta nulla del cuscino d'aria;
//   · attrito viscoso del cuscino e resistenza dell'aria, oppure, a soffiante spenta, attrito radente;
//   · urti fra i carrelli come contatti molla–smorzatore (durata, forza e impulso reali) o velcro che li unisce;
//   · elastici alle due estremità; filo con pesetto appeso sulla carrucola (il filo si allenta, il pesetto
//     si ferma sul tappetino);
//   · fotocellule che misurano il tempo di oscuramento della bandierina.
// Integrazione con Runge–Kutta del 4° ordine a passi di 0,25 ms. Nessuna dipendenza: gira identico in Node.

export const G = 9.81;
export const TRACK = { L: 2.0, bandL: 0.045, bandR: 1.955, feet: 1.5, footL: 0.25, footR: 1.75 };
export const CART = { L: 0.16, nose: 0.008, base: 0.2 };
/** Respingenti fra i carrelli: sporgenza, rigidezza, coefficiente di restituzione. */
export const BUMPERS = {
  spring: { name: 'Elastico', sub: 'respingenti a molla', ext: 0.022, k: 380, e: 0.95 },
  rubber: { name: 'Parz. elastico', sub: 'tamponi di gomma', ext: 0.012, k: 2600, e: 0.55 },
  velcro: { name: 'Anelastico', sub: 'velcro: restano uniti', ext: 0.006, stick: true },
};
export const BAND = { k: 160, e: 0.8, max: 0.035, hard: 30000 };
/**
 * Senza elastici il carrello batte sulle testate d'alluminio: urto duro e breve, poco elastico.
 * e è il parametro dello smorzatore; dato che il contatto non può tirare, la restituzione effettiva è ≈ 0,2.
 */
export const CAP = { k: 20000, e: 0.05 };
export const AIR = { b: 0.0012, rho: 1.2, Cd: 0.8, A: 0.0025, mu: 0.22, mus: 0.3 };
export const STRING = { k: 4000, zeta: 0.9 };
export const PULLEY = { x: TRACK.L + 0.045, r: 0.025 };
export const HOOK = 0.012;                 // gancio del filo oltre l'estremità destra del carrello

const DT = 2.5e-4, REC = 0.002;

/** Smorzamento che dà il coefficiente di restituzione e a un contatto di rigidezza k e massa ridotta mu. */
export function damping(e, k, mu) {
  if (e >= 1) return 0;
  const l = Math.log(Math.max(e, 1e-4)), zeta = -l / Math.sqrt(Math.PI * Math.PI + l * l);
  return 2 * zeta * Math.sqrt(k * mu);
}
/** Seno dell'inclinazione con spessori alti h (m) sotto il piede sinistro. */
export const sinTilt = (h) => h / TRACK.feet;

/** Accelerazione ideale (senza attriti) di un carrello di massa M tirato da un pesetto m, su un piano inclinato. */
export function idealAccel(M, m, sinT, g = G) { return (m * g + M * g * sinT) / (M + m); }

/**
 * Una prova sulla guidovia, simulata a passi dal chiamante (step) o tutta insieme (run).
 * cfg: {g, sinT, air, carts:[{key, m, x, v, flag}], bumper, bands (false: senza elastici), pull:{m, drop}|null, gates:[x], flag}
 */
export class Sim {
  constructor(cfg) {
    this.cfg = cfg;
    this.g = cfg.g ?? G;
    this.sinT = cfg.sinT || 0; this.cosT = Math.sqrt(1 - this.sinT * this.sinT);
    this.carts = cfg.carts.map((c) => ({ key: c.key, m: c.m, x: c.x, v: c.v, flag: c.flag ?? cfg.flag ?? 0.05, F: 0, a: 0 }));
    this.n = this.carts.length;
    this.bump = BUMPERS[cfg.bumper || 'spring'];
    this.bands = cfg.bands !== false;
    this.stuck = false;
    this.t = 0;
    // filo: attaccato al carrello più a destra
    this.pull = cfg.pull ? { m: cfg.pull.m, drop: cfg.pull.drop, i: this.n - 1, d: 0, vd: 0, landed: false, T: 0 } : null;
    if (this.pull) {
      const c = this.carts[this.pull.i], M = c.m, m = this.pull.m;
      this.pull.x0 = c.x;
      // filo già teso sotto il carico: niente vibrazioni alla partenza
      this.pull.d = (m * M * this.g * (1 - this.sinT)) / (M + m) / STRING.k;
      this.pull.c = 2 * STRING.zeta * Math.sqrt(STRING.k * ((m * M) / (m + M)));
    }
    if (this.n === 2) {
      const [A, B] = this.carts, mu = (A.m * B.m) / (A.m + B.m);
      this.cPair = this.bump.stick ? 0 : damping(this.bump.e, this.bump.k, mu);
    }
    // una bandierina già dentro il raggio alla partenza non dà una misura alla prima uscita
    this.gates = (cfg.gates || []).map((x, i) => ({ i, x, blocked: this.carts.map((c) => Math.abs(c.x - x) < c.flag / 2), tIn: this.carts.map(() => NaN), passes: [] }));
    this.passes = [];
    this.hits = [];                 // urti fra i carrelli: {t0, t1, Fmax, J, before:[vA, vB], after:[vA, vB]}
    this.contact = null;
    this.Fc = 0;
    // registrazione per i grafici
    this.rec = { t: [], x: this.carts.map(() => []), v: this.carts.map(() => []), a: this.carts.map(() => []), F: [], d: [], vd: [] };
    this.recAt = 0;
    this._s = new Float64Array(6); this._k = [0, 1, 2, 3].map(() => new Float64Array(6)); this._tmp = new Float64Array(6);
    this.record();
  }

  /** Pack/unpack dello stato: [xA, vA, xB, vB, d, vd]. */
  _pack(s) { this.carts.forEach((c, i) => { s[2 * i] = c.x; s[2 * i + 1] = c.v; }); if (this.pull) { s[4] = this.pull.d; s[5] = this.pull.vd; } }
  _unpack(s) { this.carts.forEach((c, i) => { c.x = s[2 * i]; c.v = s[2 * i + 1]; }); if (this.pull) { this.pull.d = s[4]; this.pull.vd = s[5]; } }

  /** Derivate dello stato; scrive anche le forze di contatto e la tensione correnti. */
  deriv(s, out) {
    const { g, sinT, cosT, carts, n } = this, L2 = CART.L / 2;
    const F = [0, 0];
    for (let i = 0; i < n; i++) {
      const x = s[2 * i], v = s[2 * i + 1], m = carts[i].m;
      let f = m * g * sinT;
      if (this.cfg.air) f -= AIR.b * v + 0.5 * AIR.rho * AIR.Cd * AIR.A * v * Math.abs(v);
      // elastici alle estremità (massa del gruppo se i carrelli sono uniti); il sinistro lo tocca solo
      // il carrello di sinistra, il destro solo quello di destra
      const mg = this.stuck ? carts[0].m + carts[1].m : m;
      if (this.bands) {
        if (i === 0) {
          const dl = TRACK.bandL - (x - L2 - CART.nose);
          if (dl > 0) f += Math.max(0, BAND.k * dl - damping(BAND.e, BAND.k, mg) * v + (dl > BAND.max ? BAND.hard * (dl - BAND.max) : 0));
        }
        if (i === n - 1) {
          const dr = x + L2 + CART.nose - TRACK.bandR;
          if (dr > 0) f -= Math.max(0, BAND.k * dr + damping(BAND.e, BAND.k, mg) * v + (dr > BAND.max ? BAND.hard * (dr - BAND.max) : 0));
        }
      } else {
        // testate: il corpo del carrello batte contro il blocco di fine corsa
        const c = damping(CAP.e, CAP.k, mg);
        if (i === 0 && x - L2 < 0) f += Math.max(0, CAP.k * (L2 - x) - c * v);
        if (i === n - 1 && x + L2 > TRACK.L) f -= Math.max(0, CAP.k * (x + L2 - TRACK.L) + c * v);
      }
      F[i] = f;
    }
    // urto fra i carrelli
    this.Fc = 0;
    if (n === 2 && !this.stuck && !this.bump.stick) {
      const d = s[0] + L2 + this.bump.ext - (s[2] - L2 - this.bump.ext);
      if (d > 0) {
        const f = Math.max(0, this.bump.k * d + this.cPair * (s[1] - s[3]));
        F[0] -= f; F[1] += f; this.Fc = f;
      }
    }
    // filo e pesetto
    let ad = 0;
    if (this.pull) {
      const P = this.pull, i = P.i, u = s[2 * i] - P.x0, ext = s[4] - u;
      const T = ext > 0 ? Math.max(0, STRING.k * ext + P.c * (s[5] - s[2 * i + 1])) : 0;
      F[i] += T; P.T = T;
      ad = g - T / P.m;
      if (s[4] >= P.drop - 1e-9 && ad > 0) ad = 0;        // appoggiato sul tappetino
    }
    // attrito radente a soffiante spenta (statico se fermo)
    const fric = (f, v, m) => {
      const N = m * g * cosT;
      if (Math.abs(v) > 1e-4) return f - AIR.mu * N * Math.sign(v);
      return Math.abs(f) <= AIR.mus * N ? 0 : f - AIR.mu * N * Math.sign(f);
    };
    if (this.stuck) {
      const M = carts[0].m + carts[1].m;
      let f = F[0] + F[1];
      if (!this.cfg.air) f = fric(f, s[1], M);
      const a = f / M;
      out[0] = s[1]; out[1] = a; out[2] = s[3]; out[3] = a;
    } else {
      for (let i = 0; i < n; i++) {
        let f = F[i];
        if (!this.cfg.air) f = fric(f, s[2 * i + 1], carts[i].m);
        out[2 * i] = s[2 * i + 1]; out[2 * i + 1] = f / carts[i].m;
      }
    }
    if (this.pull) { out[4] = s[5]; out[5] = ad; }
  }

  /** Avanza di tau secondi (a passi fissi). */
  step(tau) {
    const end = this.t + tau;
    while (this.t < end - 1e-12) this._sub(Math.min(DT, end - this.t));
  }

  _sub(h) {
    const s = this._s, [k1, k2, k3, k4] = this._k, tmp = this._tmp, N = 6;
    this._pack(s);
    const prev = this.carts.map((c) => c.x), prevV = this.carts.map((c) => c.v);
    this.deriv(s, k1);
    for (let j = 0; j < N; j++) tmp[j] = s[j] + 0.5 * h * k1[j];
    this.deriv(tmp, k2);
    for (let j = 0; j < N; j++) tmp[j] = s[j] + 0.5 * h * k2[j];
    this.deriv(tmp, k3);
    for (let j = 0; j < N; j++) tmp[j] = s[j] + h * k3[j];
    this.deriv(tmp, k4);
    for (let j = 0; j < N; j++) s[j] += (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    this._unpack(s);
    const t0 = this.t;
    this.t += h;
    const { carts, n } = this;
    // senza aria l'attrito radente ferma il carrello: se rallentando la velocità cambia segno o scende sotto
    // quello che l'attrito toglie in un passo, è fermo
    if (!this.cfg.air) {
      const vStop = 1.5 * AIR.mu * this.g * h;
      carts.forEach((c, i) => { if (prevV[i] !== 0 && (Math.sign(c.v) !== Math.sign(prevV[i]) || (Math.abs(c.v) < vStop && Math.abs(c.v) < Math.abs(prevV[i])))) c.v = 0; });
    }
    if (this.stuck && carts[0].v !== carts[1].v) carts[1].v = carts[0].v;
    this._pack(s);
    this.deriv(s, k1);                              // forze e tensione nello stato finale del passo
    // pesetto sul tappetino
    if (this.pull) {
      const P = this.pull;
      if (P.d >= P.drop) { P.d = P.drop; if (P.vd > 0) { P.vd = 0; if (!P.landed) { P.landed = true; P.tLand = this.t; } } }
    }
    // velcro: al contatto i carrelli si uniscono
    if (n === 2 && this.bump.stick && !this.stuck) {
      const [A, B] = carts, gap = B.x - CART.L / 2 - this.bump.ext - (A.x + CART.L / 2 + this.bump.ext);
      if (gap <= 0 && A.v > B.v) {
        const before = [A.v, B.v], v = (A.m * A.v + B.m * B.v) / (A.m + B.m);
        A.v = v; B.v = v; B.x = A.x + CART.L + 2 * this.bump.ext;
        this.stuck = true;
        this.hits.push({ t0: this.t, t1: this.t, Fmax: Infinity, J: A.m * (before[0] - v), before, after: [v, v], stick: true });
      }
    }
    // urto con contatto continuo: inizio, fine, forza massima, impulso
    if (this.Fc > 0 || this.contact) {
      const f = this.Fc;
      if (f > 0 && !this.contact) this.contact = { t0: t0, Fmax: 0, J: 0, before: prevV.slice() };
      if (this.contact) {
        this.contact.Fmax = Math.max(this.contact.Fmax, f);
        this.contact.J += f * h;
        if (f <= 0) {
          const c = this.contact;
          this.hits.push({ t0: c.t0, t1: this.t, Fmax: c.Fmax, J: c.J, before: c.before, after: carts.map((q) => q.v) });
          this.contact = null;
        }
      }
    }
    // fotocellule: bordi della bandierina che attraversano il raggio
    for (const gt of this.gates) {
      for (let i = 0; i < n; i++) {
        const c = carts[i], w = c.flag / 2, inside = Math.abs(c.x - gt.x) < w;
        if (inside === gt.blocked[i]) continue;
        // istante esatto per interpolazione lineare dentro il passo
        const x0 = prev[i], x1 = c.x;
        const edge = inside ? (x1 > x0 ? gt.x + w : gt.x - w) : (x1 > x0 ? gt.x - w : gt.x + w);
        const f = Math.abs(x1 - x0) > 1e-15 ? Math.min(Math.max((edge - x0) / (x1 - x0), 0), 1) : 1;
        const tc = t0 + f * h;
        gt.blocked[i] = inside;
        if (inside) gt.tIn[i] = tc;
        else if (Number.isFinite(gt.tIn[i])) {
          const dt = tc - gt.tIn[i], p = { gate: gt.i, cart: i, key: c.key, tIn: gt.tIn[i], tOut: tc, dt, v: (2 * w) / dt * Math.sign(x1 - x0 || 1) };
          gt.passes.push(p); this.passes.push(p);
        }
      }
    }
    if (this.t >= this.recAt - 1e-12) this.record();
  }

  record() {
    const r = this.rec, s = this._s, k = this._k[0];
    this._pack(s); this.deriv(s, k);
    r.t.push(this.t);
    this.carts.forEach((c, i) => { r.x[i].push(c.x); r.v[i].push(c.v); r.a[i].push(k[2 * i + 1]); c.a = k[2 * i + 1]; });
    r.F.push(this.Fc);
    r.d.push(this.pull ? this.pull.d : 0);
    r.vd.push(this.pull ? this.pull.vd : 0);
    this.recAt = this.t + REC;
  }

  /** Quantità di moto ed energia cinetica totali (più quella del pesetto). */
  totals() {
    let p = 0, E = 0, M = 0, X = 0;
    for (const c of this.carts) { p += c.m * c.v; E += 0.5 * c.m * c.v * c.v; M += c.m; X += c.m * c.x; }
    const Eh = this.pull ? 0.5 * this.pull.m * this.pull.vd ** 2 : 0;
    return { p, E, Eh, vcm: p / M, xcm: X / M };
  }

  /** Tutti fermi (o quasi) e nessun contatto in corso. */
  get still() { return this.carts.every((c) => Math.abs(c.v) < 1e-3) && !this.contact && (!this.pull || Math.abs(this.pull.vd) < 1e-3); }
}
