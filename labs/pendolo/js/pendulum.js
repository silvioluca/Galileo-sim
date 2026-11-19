// pendulum.js — pendoli semplici e fisici.
//
// Ogni pendolo è un corpo rigido che gira attorno a un perno orizzontale: I·θ'' = −M·sin θ − attriti, con I il
// momento d'inerzia rispetto al perno e M = m·g·d il momento del peso a corpo orizzontale (d: dal perno al
// baricentro). Il pendolo semplice è il caso con tutta la massa in un punto a distanza L: I = m·L², M = m·g·L, e
// quindi T₀ = 2π·√(L/g), indipendente dalla massa. Qui però la sfera ha un raggio e il filo un poco di massa: le
// piccole correzioni ci sono.
// Per le piccole oscillazioni T₀ = 2π·√(I/M) = 2π·√(L_eq/g), con L_eq = I/(m·d) la lunghezza del pendolo semplice
// equivalente; con ampiezza θ₀ il periodo esatto è T₀/agm(1, cos(θ₀/2)) (media aritmetico-geometrica).
// Nell'aria: spinta di Archimede (riduce M), massa aggiunta (aumenta I), resistenza ∝ v² più un piccolo termine ∝ v;
// il perno (morsetto del filo o perno nel foro) dissipa poco, con un fattore di qualità fisso.
// La fotocellula in basso segna l'istante e la durata di ogni passaggio: da lì periodo e velocità.
// Unità SI, angoli in radianti. Nessuna dipendenza: gira identico nel browser e in Node.

export const G = 9.81;
const RHO_AIR = 1.2, MU_AIR = 1.8e-5;
export const BOB_R = 0.025;
export const THREAD = { mu: 0.0003, d: 0.0005 };            // filo: 0,3 g/m, mezzo millimetro
export const BOBS = {
  lead: { name: 'Piombo', rho: 11340 },
  brass: { name: 'Ottone', rho: 8500 },
  steel: { name: 'Acciaio', rho: 7850 },
  wood: { name: 'Legno', rho: 650 },
  cork: { name: 'Sughero', rho: 240 },
};
export const BODIES = {
  rod: { name: 'Asta forata', short: 'asta', L: 1.2, w: 0.03, t: 0.006, rho: 2700, hole: 0.0045, note: 'Asta d\'alluminio lunga 120 cm, con un foro ogni 5 cm' },
  disk: { name: 'Disco forato', short: 'disco', R: 0.15, t: 0.008, rho: 2700, hole: 0.0045, note: 'Disco d\'alluminio di 30 cm, con un foro ogni 2 cm lungo un raggio' },
  ring: { name: 'Anello', short: 'anello', R: 0.2, tr: 0.012, t: 0.008, rho: 8500, note: 'Anello d\'ottone di 40 cm, appeso per il bordo interno' },
};
/** Distanze dei fori dal centro del corpo (m). */
export function holesOf(key) {
  if (key === 'rod') return Array.from({ length: 11 }, (_, i) => 0.05 * (i + 1));
  if (key === 'disk') return Array.from({ length: 7 }, (_, i) => 0.02 * (i + 1));
  return [BODIES.ring.R - BODIES.ring.tr];
}
const Q_PIVOT = { simple: 6000, physical: 4000 };
/** Linguetta sotto il disco e l'anello, per la fotocellula. */
export const TAB = { w: 0.004, len: 0.02 };

/** Media aritmetico-geometrica; T/T₀ per l'ampiezza θ₀ è 1/agm(1, cos(θ₀/2)). */
export function agm(a, b) { for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15; i++) { const m = (a + b) / 2; b = Math.sqrt(a * b); a = m; } return a; }
export const ampFactor = (th0) => 1 / agm(1, Math.cos(Math.min(Math.abs(th0), 3.1415) / 2));

/** Il pendolo semplice: sfera di materiale bob (raggio 2,5 cm) a distanza L dal punto di sospensione (al centro). */
export function simpleSpec(L, bob, air = true) {
  const r = BOB_R, V = (4 / 3) * Math.PI * r ** 3, mb = BOBS[bob].rho * V, Lt = Math.max(0, L - r), mt = THREAD.mu * Lt;
  const ra = air ? RHO_AIR : 0;
  const m = mb + mt;
  let I = mb * (L * L + 0.4 * r * r) + (mt * Lt * Lt) / 3;
  const M = G * (mb * L + (mt * Lt) / 2 - ra * V * L);
  I += 0.5 * ra * V * L * L;                                  // massa aggiunta dell'aria trascinata
  const c2 = 0.5 * ra * (0.47 * Math.PI * r * r * L ** 3 + (1.2 * THREAD.d * Lt ** 4) / 4);
  const blin = air ? 3 * 6 * Math.PI * MU_AIR * r * L * L : 0;
  const s = {
    kind: 'simple', key: bob, name: `Sfera di ${BOBS[bob].name.toLowerCase()}`, L, r, m, mb, mt, I, M, c2, blin,
    d: L, gateH: L, Lideal: L,
    inside: (x, y) => x * x + (y + L) * (y + L) <= r * r,
  };
  return finish(s, 'simple');
}
/** Il pendolo fisico: corpo key appeso al foro a distanza yp dal suo centro (per l'anello: il bordo interno). */
export function physicalSpec(key, yp, air = true) {
  const B = BODIES[key], ra = air ? RHO_AIR : 0, rh = B.hole || 0;
  let A, S1 = 0, J0, inside, gateH, front;
  if (key === 'rod') {
    const holes = holesOf('rod').flatMap((y) => [y, -y]);
    A = B.L * B.w - holes.length * Math.PI * rh * rh;
    J0 = (B.L * B.w * (B.L * B.L + B.w * B.w)) / 12 - holes.reduce((s, y) => s + Math.PI * rh * rh * (rh * rh / 2 + y * y), 0);
    inside = (x, y) => Math.abs(x) <= B.w / 2 && Math.abs(y + yp) <= B.L / 2;
    gateH = yp + B.L / 2 - 0.04;
    front = [B.L / 2 - yp, B.L / 2 + yp];
  } else if (key === 'disk') {
    const holes = holesOf('disk');
    A = Math.PI * B.R * B.R - holes.length * Math.PI * rh * rh;
    S1 = -holes.reduce((s, y) => s + Math.PI * rh * rh * y, 0);
    J0 = (Math.PI * B.R ** 4) / 2 - holes.reduce((s, y) => s + Math.PI * rh * rh * (rh * rh / 2 + y * y), 0);
    gateH = yp + B.R + TAB.len / 2;
  } else {
    const Ri = B.R - B.tr;
    yp = Ri;
    A = Math.PI * (B.R * B.R - Ri * Ri);
    J0 = (Math.PI * (B.R ** 4 - Ri ** 4)) / 2;
    gateH = Ri + B.R + TAB.len / 2;
  }
  // disco e anello hanno in basso una linguetta sottile che taglia il fascio (il bordo largo non ne uscirebbe)
  if (key !== 'rod') { const y0 = yp + B.R; inside = (x, y) => Math.abs(x) <= TAB.w / 2 && -y >= y0 - 0.002 && -y <= y0 + TAB.len; }
  const m = B.rho * B.t * A, V = B.t * A;
  const yc = S1 / A, d = yp - yc;                              // baricentro (i fori lo spostano appena)
  let I = B.rho * B.t * (J0 - 2 * yp * S1 + A * yp * yp);
  const M = G * (m - ra * V) * d;
  I += 0;                                                      // lastra di taglio: massa aggiunta trascurabile
  const Rb = key === 'rod' ? 0 : B.R;
  const c2 = key === 'rod'
    ? (0.5 * ra * 1.0 * B.t * (front[0] ** 4 + front[1] ** 4)) / 4
    : 0.5 * ra * 1.0 * B.t * 2 * Rb * (d * d + (Rb * Rb) / 2) ** 1.5;
  const s = { kind: 'physical', key, name: B.name, m, I, M, c2, blin: 0, d, yp, gateH, inside };
  return finish(s, 'physical');
}
function finish(s, kind) {
  s.T0 = 2 * Math.PI * Math.sqrt(s.I / s.M);
  s.w0 = (2 * Math.PI) / s.T0;
  s.Leq = (G * s.I) / s.M;                                     // il pendolo semplice equivalente
  s.b = s.blin + (s.I * s.w0) / Q_PIVOT[kind];
  // larghezza del corpo attraverso il fascio della fotocellula, a corpo fermo in basso (calcolata alla prima richiesta)
  let chord = null;
  Object.defineProperty(s, 'chord', {
    get() { if (chord === null) { let n = 0; for (let x = -0.4; x <= 0.4; x += 0.0001) if (s.inside(x, -s.gateH)) n++; chord = n * 0.0001; } return chord; },
  });
  return s;
}

/** Un pendolo che oscilla. */
export class Pendulum {
  constructor(spec) {
    this.S = spec;
    this.th = 0; this.w = 0; this.t = 0; this.held = true; this.th0 = 0;
    this.rec = { t: [], th: [], w: [], K: [], U: [] }; this.recAt = -1;
    this.passages = []; this.inBeam = false; this.tIn = 0;
    this.calm = 0;
  }
  hold(th) { this.held = true; this.th = th; this.w = 0; this.th0 = th; }
  release(th0) {
    this.held = false; this.th = th0; this.th0 = th0; this.w = 0; this.t = 0;
    this.rec = { t: [], th: [], w: [], K: [], U: [] }; this.recAt = -1;
    this.passages = []; this.inBeam = this.inGate(th0); this.calm = 0;
    this.sample();
  }
  acc(th, w) { const S = this.S; return (-S.M * Math.sin(th) - S.c2 * w * Math.abs(w) - S.b * w) / S.I; }
  inGate(th) { const h = this.S.gateH; return this.S.inside(-h * Math.sin(th), -h * Math.cos(th)); }
  get K() { return 0.5 * this.S.I * this.w * this.w; }
  get U() { return this.S.M * (1 - Math.cos(this.th)); }
  /** Ampiezza dall'energia (rad); oltre il giro completo, π. */
  get amp() { const c = 1 - (this.K + this.U) / this.S.M; return c <= -1 ? Math.PI : Math.acos(c); }
  sample() {
    if (this.t - this.recAt < 0.01 - 1e-9) return;
    this.recAt = this.t;
    const R = this.rec;
    R.t.push(this.t); R.th.push(this.th); R.w.push(this.w); R.K.push(this.K); R.U.push(this.U);
    if (R.t.length > 16000) for (const k of Object.keys(R)) R[k].splice(0, 2000);
  }
  step(h) {
    if (this.held) return;
    const th = this.th, w = this.w;
    const k1t = w, k1w = this.acc(th, w);
    const k2t = w + 0.5 * h * k1w, k2w = this.acc(th + 0.5 * h * k1t, k2t);
    const k3t = w + 0.5 * h * k2w, k3w = this.acc(th + 0.5 * h * k2t, k3t);
    const k4t = w + h * k3w, k4w = this.acc(th + h * k3t, k4t);
    this.th = th + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    this.w = w + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    const t0 = this.t;
    this.t += h;
    // fotocellula: inizio e fine dell'interruzione, trovati per bisezione dentro il passo
    const inside = this.inGate(this.th);
    if (inside !== this.inBeam) {
      let a = 0, b = 1;
      for (let i = 0; i < 14; i++) { const c = (a + b) / 2; if (this.inGate(th + (this.th - th) * c) === inside) b = c; else a = c; }
      const tx = t0 + h * b;
      if (inside) this.tIn = tx;
      else { const dt = tx - this.tIn; this.passages.push({ t: (this.tIn + tx) / 2, dt, dir: Math.sign(this.w), v: this.S.chord / dt }); }
      this.inBeam = inside;
    }
    this.sample();
    this.calm = this.amp < 0.0009 ? this.calm + h : 0;
  }
}
