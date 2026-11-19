// incline.js — corpi su un piano inclinato: un carrello su ruote e un blocco che striscia.
//
// s è lo spazio percorso lungo il piano dal fermo in cima (positivo in discesa), misurato sul bordo anteriore
// del corpo. Forze lungo il piano: componente del peso m·g·sin α, attrito dell'aria, molla del dinamometro,
// respingente in fondo; perpendicolare al piano la reazione N = m·g·cos α.
//  - carrello: le ruote girano senza slittare; la loro inerzia vale k·m·r² in più (k piccolo), più un attrito
//    di rotolamento;
//  - blocco: attrito statico (fermo finché |F| ≤ μs·N) e dinamico (μd·N contro il moto).
// (I corpi che rotolano hanno un laboratorio tutto loro: labs/rotolamento.)
// Unità SI. Nessuna dipendenza: gira identico nel browser e in Node.

export const G = 9.81;
const RHO_AIR = 1.2;

/** Corpi. len: ingombro lungo il piano (quello che interrompe il raggio delle fotocellule). */
export const OBJECTS = {
  cart: { name: 'Carrello', kind: 'cart', len: 0.1, r: 0.012, wheels: 4, mWheel: 0.003, roll: 0.0025, area: 0.0025, Cd: 1.0, note: 'su ruote: quasi senza attrito' },
  block: { name: 'Blocco', kind: 'block', len: 0.08, area: 0.0024, Cd: 1.05, note: 'di legno, striscia sul fondo' },
};
/** Fondo del blocco sul legno del piano: attrito statico e dinamico. */
export const SURFACES = {
  wood: { name: 'Legno', ms: 0.5, mk: 0.35 },
  rubber: { name: 'Gomma', ms: 0.8, mk: 0.62 },
  felt: { name: 'Feltro', ms: 0.32, mk: 0.24 },
  ptfe: { name: 'Teflon', ms: 0.12, mk: 0.08 },
};

/** Massa, coefficiente d'inerzia delle ruote (solo il carrello) e attriti di un corpo. */
export function bodyOf(key, m, surf = 'wood') {
  const o = OBJECTS[key];
  const k = o.kind === 'cart' ? (o.wheels * 0.5 * o.mWheel) / m : 0;
  const fr = SURFACES[surf] || SURFACES.wood;
  return { key, o, m, k, ms: fr.ms, mk: fr.mk, len: o.len, surf };
}

/** Accelerazione teorica (senza aria) partendo da fermo, all'angolo α (rad). */
export function accel(B, a) {
  const s = Math.sin(a), c = Math.cos(a), o = B.o;
  if (o.kind === 'cart') return Math.max(0, (G * (s - o.roll * c)) / (1 + B.k));
  return s > B.ms * c ? Math.max(0, G * (s - B.mk * c)) : 0;
}

const BUMP_W = 700;                                   // pulsazione propria del respingente (rad/s)
/** Un corpo sulla tavola. */
export class Lane {
  /** cfg: { body, sEnd, gates: [s], bells: [s], spring: { k, sHook, string } | null } */
  constructor(cfg) {
    Object.assign(this, cfg);
    this.s = 0; this.v = 0; this.w = 0; this.phi = 0;
    this.held = true; this.stuck = true; this.frozen = false; this.t = 0;
    this.gateHits = (cfg.gates || []).map(() => ({ tin: null, tout: null }));
    this.rings = [];
    this.rec = { t: [0], s: [0], v: [0] };
    this.recAt = 0;
    this.f = { N: 0, Ff: 0, Fs: 0, Fb: 0, Fg: 0 };
    this.calm = 0;
  }
  release() { if (this.held) { this.held = false; this.t = 0; } }
  /** Fine della discesa: il corpo resta dov'è e il registro (quindi il grafico) si ferma. */
  freeze() { this.frozen = true; }

  /** Passo h a inclinazione a (rad). */
  step(h, a) {
    if (this.held || this.frozen) return;
    const B = this.body, m = B.m, o = B.o, sn = Math.sin(a), cs = Math.cos(a);
    const N = m * G * cs, Fg = m * G * sn;
    let F = Fg - 0.5 * RHO_AIR * o.Cd * o.area * Math.abs(this.v) * this.v;
    // molla del dinamometro (tira verso la cima, solo se tesa), con un poco d'attrito interno
    let Fs = 0;
    if (this.spring) {
      const e = this.s - B.len - this.spring.sHook - this.spring.string;
      if (e > 0) Fs = -Math.max(0, this.spring.k * e + 2 * 0.08 * Math.sqrt(this.spring.k * m) * this.v);
      this.ext = Math.max(0, e);
    }
    // respingente in fondo
    const pen = this.s - this.sEnd;
    const Fb = pen > 0 ? -Math.max(0, m * (BUMP_W * BUMP_W * pen + 2 * 0.45 * BUMP_W * this.v)) : 0;
    F += Fs + Fb;
    let acc = 0, Ff = 0;
    if (o.kind === 'cart') {
      // ruote: niente strisciamento; l'attrito di rotolamento può anche tenerlo fermo
      const Fr = o.roll * N;
      if (Math.abs(this.v) < 1e-4 && Math.abs(F) <= Fr) { this.v = 0; acc = 0; Ff = -F; this.stuck = true; } else {
        Ff = -Fr * Math.sign(this.v || F); acc = (F + Ff) / (m * (1 + B.k)); this.stuck = false;
      }
      this.w = this.v / o.r;
    } else {
      if (this.stuck) {
        if (Math.abs(F) > B.ms * N) this.stuck = false; else { acc = 0; this.v = 0; Ff = -F; }
      }
      if (!this.stuck) {
        const dir = this.v !== 0 ? Math.sign(this.v) : Math.sign(F);
        Ff = -B.mk * N * dir; acc = (F + Ff) / m;
        // si ferma se la velocità cambierebbe segno e l'attrito statico basta
        if (this.v !== 0 && Math.sign(this.v + acc * h) !== Math.sign(this.v) && Math.abs(F) <= B.ms * N) { this.v = 0; acc = 0; this.stuck = true; Ff = -F; }
      }
    }
    const s0 = this.s, wasStill = this.v === 0;
    this.v += acc * h; this.s += this.v * h; this.phi += this.w * h; this.t += h;
    this.acc = acc;
    // istante in cui si muove davvero (dopo essere stato fermo) e in cui tocca il respingente
    if (this.tMove == null && wasStill && this.v !== 0) this.tMove = this.t - h;
    if (this.arrive == null && this.s >= this.sEnd - 1e-4) this.arrive = this.t - h + (h * (this.sEnd - 1e-4 - s0)) / ((this.s - s0) || 1e-12);
    this.f = { N, Ff, Fs, Fb, Fg, F };
    // fotocellule (bordo anteriore che entra, posteriore che esce) e campanelli
    (this.gates || []).forEach((g, i) => {
      const hit = this.gateHits[i], tAt = (x) => this.t - h + (h * (x - s0)) / ((this.s - s0) || 1e-12);
      if (hit.tin === null && s0 < g && this.s >= g) hit.tin = tAt(g);
      if (hit.tin !== null && hit.tout === null && s0 - B.len < g && this.s - B.len >= g) hit.tout = tAt(g + B.len);
    });
    (this.bells || []).forEach((b, i) => { if (s0 < b && this.s >= b && !this.rings.some((x) => x.i === i)) this.rings.push({ i, t: this.t - h + (h * (b - s0)) / ((this.s - s0) || 1e-12), fresh: true }); });
    if (this.t - this.recAt >= 0.005) { this.recAt = this.t; this.rec.t.push(this.t); this.rec.s.push(this.s); this.rec.v.push(this.v); }
    // fermo: in fondo, contro il respingente, oppure trattenuto dall'attrito
    this.calm = Math.abs(this.v) < 2e-3 && Math.abs(acc) < 0.05 ? this.calm + h : 0;
  }
  /** Velocità misurata alla fotocellula i: ingombro / tempo d'oscuramento. */
  gateSpeed(i) { const g = this.gateHits[i]; return g && g.tout !== null ? this.body.len / (g.tout - g.tin) : null; }
}
