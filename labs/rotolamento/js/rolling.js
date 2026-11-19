// rolling.js — corpi che rotolano su un piano, orizzontale o inclinato.
//
// Ogni corpo ha massa m, raggio di rotolamento ρ (quello che tocca: il raggio esterno, o l'asse sottile della
// ruota che corre sui binari) e momento d'inerzia I = k·m·ρ². s è la posizione del centro lungo il piano dalla
// linea di partenza (positiva in discesa), v la sua velocità, ω la velocità angolare (positiva se gira nel verso
// del rotolamento in avanti), φ l'angolo di cui ha girato.
//  - rotola senza strisciare (v = ω·ρ) finché l'attrito che serve, k/(1+k) della forza lungo il piano, resta sotto
//    μs·N: allora a = g·sin α/(1+k);
//  - altrimenti striscia: l'attrito dinamico μd·N agisce contro lo strisciamento del punto di contatto, frena (o
//    spinge) il centro e fa girare il corpo, finché v = ω·ρ e torna a rotolare. Così una palla lanciata strisciando
//    finisce per rotolare a v₀/(1+k), e un anello con abbastanza effetto all'indietro torna indietro;
//  - il pattino non gira e non ha attrito: il riferimento, a = g·sin α.
// In fondo alla corsa e dietro, contro il lanciatore, i fermi sono imbottiti e col velcro: il corpo che li tocca
// resta lì (niente rimbalzi) e lo sfregamento sulla faccia ne ferma presto la rotazione.
// La velocità di un punto del corpo è quella del centro più la rotazione: v_P = v + ω × (P − C); il punto di
// contatto di un corpo che rotola è fermo, quello in cima va al doppio.
// Unità SI. Nessuna dipendenza: gira identico nel browser e in Node.

export const G = 9.81;
const RHO_AIR = 1.2;

/** Corpi. R: raggio esterno; rho: raggio di rotolamento; k: I/(m·ρ²). */
export const BODIES = {
  sphere: { name: 'Sfera piena', shape: 'sphere', R: 0.022, k: 2 / 5, m: 0.35, w: 0.044, area: 0.0015, Cd: 0.47, short: 'I = ⅖·m·R²', note: 'Sfera piena d\'acciaio · I = ⅖·m·R²' },
  cyl: { name: 'Cilindro pieno', shape: 'cyl', R: 0.022, w: 0.05, k: 1 / 2, m: 0.205, area: 0.0022, Cd: 1.0, short: 'I = ½·m·R²', note: 'Cilindro pieno d\'alluminio · I = ½·m·R²' },
  hsphere: { name: 'Sfera cava', shape: 'hsphere', R: 0.022, k: 2 / 3, m: 0.03, w: 0.044, area: 0.0015, Cd: 0.47, short: 'I = ⅔·m·R²', note: 'Sfera cava, un guscio sottile di plastica · I = ⅔·m·R²' },
  ring: { name: 'Anello', shape: 'ring', R: 0.022, ri: 0.0198, w: 0.03, k: (1 + 0.9 * 0.9) / 2, m: 0.074, area: 0.0013, Cd: 1.0, short: 'I ≈ 0,9·m·R²', note: 'Anello d\'ottone, con il foro grande · I = ½·m·(R² + Ri²) ≈ 0,9·m·R²' },
  wheel: { name: 'Ruota su binari', shape: 'wheel', R: 0.06, rho: 0.005, wd: 0.012, wa: 0.09, k: 0, m: 0, area: 0.0015, Cd: 1.1, short: 'I ≈ 63·m·ρ²', note: 'Disco d\'alluminio (R 6 cm) su un asse d\'acciaio sottile (ρ 5 mm) che rotola sui binari' },
  slider: { name: 'Pattino', shape: 'slider', R: 0.022, k: 0, m: 0.12, w: 0.05, area: 0.0011, Cd: 1.0, short: 'non gira', note: 'Pattino senza attrito: non gira, è il riferimento · a = g·sin α' },
};
// la ruota: disco d'alluminio (R 6 cm, 12 mm) e asse d'acciaio (ρ 5 mm, 9 cm) che appoggia sui binari
{
  const W = BODIES.wheel, md = 2700 * Math.PI * W.R ** 2 * W.wd, ma = 7850 * Math.PI * W.rho ** 2 * W.wa;
  W.m = md + ma;
  W.k = (0.5 * md * W.R ** 2 + 0.5 * ma * W.rho ** 2) / (W.m * W.rho ** 2);
  W.note = `${W.note} · I/(m·ρ²) ≈ ${Math.round(W.k)}`;
}
/** Presa sul legno della tavola (e dell'asse sui binari): attrito statico e dinamico; rotolamento. */
export const GRIP = { ms: 0.3, mk: 0.2, roll: 0.0012 };
export const rhoOf = (B) => B.rho || B.R;
/** Velocità e rotazione iniziali: rotolando, strisciando (ω = 0), con effetto all'indietro (ω = −2·v₀/ρ). */
export function launch(B, v0, spin) {
  if (B.shape === 'slider') return { v: v0, w: 0 };
  const r = rhoOf(B);
  return { v: v0, w: spin === 'roll' ? v0 / r : spin === 'back' ? (-2 * v0) / r : 0 };
}
/** Accelerazione partendo da fermo, all'angolo α (rad), e se rotola. */
export function accel(B, a) {
  const s = Math.sin(a), c = Math.cos(a);
  if (B.shape === 'slider') return { a: G * s, rolls: false };
  if (Math.tan(a) <= (GRIP.ms * (1 + B.k)) / B.k) return { a: Math.max(0, (G * (s - GRIP.roll * c)) / (1 + B.k)), rolls: true };
  return { a: G * (s - GRIP.mk * c), rolls: false };
}
/** Angolo oltre il quale non ce la fa più a rotolare senza strisciare (rad). */
export const slipAngle = (B) => (B.shape === 'slider' ? 0 : Math.atan((GRIP.ms * (1 + B.k)) / B.k));

const BUMP_W = 600, BUMP_Z = 1, BUMP_MU = 0.6, REC_MAX = 9000;   // fermi imbottiti col velcro: trattengono il corpo e ne frenano la rotazione
/** Un corpo sulla sua corsia. */
export class Roller {
  /** cfg: { key, sEnd (faccia del respingente), sFinish (traguardo, per il centro) }. Il lanciatore sta subito
   *  dietro il corpo: la sua faccia è a R (più 1,5 mm) dietro il centro di partenza. */
  constructor(cfg) {
    Object.assign(this, cfg);
    this.B = BODIES[cfg.key];
    this.r = rhoOf(this.B);
    this.sBack = -this.B.R - 0.0015;
    this.s = 0; this.v = 0; this.w = 0; this.phi = 0; this.t = 0;
    this.held = true; this.frozen = false; this.slip = false; this.stuck = true; this.caughtF = false; this.caughtB = false;
    this.calm = 0; this.acc = 0;
    this.rec = { t: [0], s: [0], v: [0], wr: [0], phi: [0] }; this.recAt = 0; this.recS = 0; this.recPhi = 0;
    this.finish = null; this.vFinish = null; this.everSlip = false;
  }
  release(v0, spin) {
    if (!this.held) return;
    const L = launch(this.B, v0, spin);
    this.held = false; this.v = L.v; this.w = L.w; this.t = 0;
    this.slip = this.B.shape !== 'slider' && Math.abs(L.v - L.w * this.r) > 1e-9;
    this.stuck = L.v === 0;
    this.rec.wr[0] = L.w * this.r; this.rec.v[0] = L.v;
  }
  freeze() { this.frozen = true; }

  step(h, a) {
    if (this.held || this.frozen) return;
    const B = this.B, m = B.m, r = this.r, sn = Math.sin(a), cs = Math.cos(a);
    const N = m * G * cs;
    let F = m * G * sn - 0.5 * RHO_AIR * B.Cd * B.area * Math.abs(this.v) * this.v;
    // fermo in fondo e lanciatore dietro: imbottiti e col velcro, trattengono il corpo che li tocca (niente rimbalzi)
    const pf = this.s + B.R - this.sEnd, pb = this.sBack - (this.s - B.R);
    if (pf > 0) this.caughtF = true;
    if (pb > 0) this.caughtB = true;
    let Fb = 0;
    if (this.caughtF) { const f = m * (BUMP_W * BUMP_W * pf + 2 * BUMP_Z * BUMP_W * this.v); F -= f; Fb += Math.abs(f); }
    if (this.caughtB) { const f = m * (BUMP_W * BUMP_W * pb - 2 * BUMP_Z * BUMP_W * this.v); F += f; Fb += Math.abs(f); }
    let acc;
    if (B.shape === 'slider') {
      acc = F / m; this.w = 0;
    } else {
      const I = B.k * m * r * r, Fr = GRIP.roll * N;
      if ((this.caughtF || this.caughtB) && Math.abs(this.v) > 0.03) this.slip = true;     // l'urto fa strisciare
      acc = 0;
      if (!this.slip) {
        // rotolamento puro: l'attrito statico che serve
        if (Math.abs(this.v) < 1e-4 && Math.abs(F) <= Fr) { this.v = 0; this.stuck = true; } else {
          const aR = (F - Fr * Math.sign(this.v || F)) / (m * (1 + B.k)), fReq = F - m * aR;
          if (Math.abs(fReq) <= GRIP.ms * N) { acc = aR; this.stuck = false; } else this.slip = true;
        }
        if (!this.slip) this.w = this.v / r;
      }
      if (this.slip) {
        // strisciamento: l'attrito dinamico va contro la velocità del punto di contatto
        const vs = this.v - this.w * r, moving = Math.abs(vs) > 1e-7, dir = moving ? Math.sign(vs) : Math.sign(F) || 1;
        const Ff = -GRIP.mk * N * dir;
        acc = (F + Ff) / m;
        // la faccia del respingente (o del lanciatore) sfrega sul bordo del corpo che gira
        const wdot = (-Ff * r - (Math.abs(this.w) > 1e-6 ? Math.sign(this.w) * BUMP_MU * Fb * B.R : 0)) / I;
        const vs2 = this.v + acc * h - (this.w + wdot * h) * r;
        this.w += wdot * h;
        if (moving && Math.sign(vs2) !== dir) { this.w = (this.v + acc * h) / r; this.slip = false; }
        else if (!moving && Fb > 0 && Math.abs(this.w) < 0.05 && Math.abs(this.v) < 1e-3) { this.w = 0; this.v = 0; this.slip = false; acc = 0; }
        this.stuck = false;
        if (this.finish === null) this.everSlip = this.everSlip || Math.abs(vs) > 2e-3;
      }
    }
    const s0 = this.s;
    this.v += acc * h; this.s += this.v * h; this.phi += this.w * h; this.t += h; this.acc = acc;
    // traguardo: il centro passa la linea
    if (this.finish === null && s0 < this.sFinish && this.s >= this.sFinish) {
      this.finish = this.t - h + (h * (this.sFinish - s0)) / (this.s - s0); this.vFinish = this.v;
    }
    // registrazione: ogni 20 ms, o ogni 1,5 mm di strada, o ogni 0,1 rad di rotazione (le cuspidi restano nette)
    if ((this.t - this.recAt >= 0.02 || Math.abs(this.s - this.recS) >= 0.0015 || Math.abs(this.phi - this.recPhi) >= 0.1) && this.rec.t.length < REC_MAX) {
      this.recAt = this.t; this.recS = this.s; this.recPhi = this.phi;
      const R = this.rec; R.t.push(this.t); R.s.push(this.s); R.v.push(this.v); R.wr.push(this.w * r); R.phi.push(this.phi);
    }
    this.calm = Math.abs(this.v) < 2e-3 && Math.abs(acc) < 0.05 && Math.abs(this.w * r) < 4e-3 ? this.calm + h : 0;
  }
  /** Strisciando davvero (non solo appoggiato al respingente). */
  get slipping() { return this.slip && Math.abs(this.v - this.w * this.r) > 2e-3; }
  /** Punto del corpo a distanza rp dall'asse, partito dal punto di contatto: scostamento dal centro (x lungo
   *  il piano, y perpendicolare) e sua velocità. */
  point(rp) {
    const psi = -Math.PI / 2 - this.phi, dx = rp * Math.cos(psi), dy = rp * Math.sin(psi);
    return { dx, dy, vx: this.v + this.w * dy, vy: -this.w * dx };
  }
}
