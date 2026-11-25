// circuit.js — il circuito: alimentatore, amperometro in serie, componente, voltmetro in parallelo.
//
// L'alimentatore da laboratorio tiene la tensione impostata finché la corrente non arriva al limite; da lì in poi
// tiene la corrente (CC) e la tensione cala. L'amperometro ha una piccola resistenza interna (1 Ω sulla portata dei
// milliampere, 0,05 Ω su quella degli ampere), il voltmetro 10 MΩ. Con il voltmetro «a valle» dell'amperometro, cioè
// direttamente ai capi del componente, l'amperometro conta anche la corrente del voltmetro; «a monte», il voltmetro
// misura anche la caduta di tensione sull'amperometro. Con strumenti ideali le due inserzioni danno lo stesso.
//
// I componenti. I resistori (tolleranza 5 %, coefficiente di temperatura 200 ppm/K) si scaldano con la potenza e
// bruciano se restano troppo caldi. La lampadina ha un filamento di tungsteno: la resistenza cresce con la temperatura
// come T^1,2, e la temperatura viene dal bilancio fra potenza elettrica e potenza irraggiata (σT⁴), con un'inerzia di
// qualche centesimo di secondo: da freddo la resistenza è dodici volte più piccola. Il LED segue la legge del diodo,
// I = Iₛ(e^{V/nV_T} − 1), con una resistenza in serie, e brucia sopra i 50 mA. I fili della seconda legge hanno
// R = ρL/S (più il contatto della pinza), un coefficiente di temperatura proprio e si scaldano se la corrente è forte.

export const T0 = 293.15;
const VT = 0.025852;

export const COMPONENTS = {
  r10: { name: '10 Ω', kind: 'R', R: 10, Pmax: 2, bands: ['brown', 'black', 'black', 'gold'] },
  r47: { name: '47 Ω', kind: 'R', R: 47, Pmax: 2, bands: ['yellow', 'violet', 'black', 'gold'] },
  r100: { name: '100 Ω', kind: 'R', R: 100, Pmax: 2, bands: ['brown', 'black', 'brown', 'gold'] },
  r220: { name: '220 Ω', kind: 'R', R: 220, Pmax: 2, bands: ['red', 'red', 'brown', 'gold'] },
  lamp: { name: 'Lampadina', kind: 'lamp', Vn: 6, In: 0.3 },
  led: { name: 'LED rosso', kind: 'led' },
};
export const MATERIALS = {
  costantana: { name: 'costantana', rho: 4.9e-7, alpha: 1e-5, color: '#c9a979' },
  nichelcromo: { name: 'nichelcromo', rho: 1.1e-6, alpha: 4e-4, color: '#a9adb3' },
  ferro: { name: 'ferro', rho: 1.0e-7, alpha: 6e-3, color: '#7d8188' },
};
export const WIRES = [
  { id: 'c25', mat: 'costantana', d: 0.25e-3 },
  { id: 'c35', mat: 'costantana', d: 0.35e-3 },
  { id: 'c50', mat: 'costantana', d: 0.5e-3 },
  { id: 'n35', mat: 'nichelcromo', d: 0.35e-3 },
  { id: 'n50', mat: 'nichelcromo', d: 0.5e-3 },
  { id: 'f35', mat: 'ferro', d: 0.35e-3 },
];
export const wireName = (w) => `${MATERIALS[w.mat].name} ⌀ ${(w.d * 1000).toFixed(2).replace('.', ',')} mm`;

/** Il valore vero di ogni resistore (dentro la tolleranza), sempre lo stesso per lo stesso resistore. */
const TRUE_R = { r10: 9.86, r47: 47.9, r100: 98.6, r220: 222.4 };

/**
 * Lo stato termico e le proprietà del componente collegato.
 */
export class Part {
  constructor(key, wire = null, L = 1) {
    this.key = key; this.wire = wire; this.L = L;
    this.T = T0; this.burnt = false; this.smoke = 0; this.tBurn = 0;
    const c = key === 'wire' ? null : COMPONENTS[key];
    this.kind = c ? c.kind : 'wire';
    if (this.kind === 'R') { this.R0 = TRUE_R[key]; this.Rth = 60; this.tau = 12; }
    if (this.kind === 'lamp') {
      const Rhot = c.Vn / c.In, Thot = 2650;
      this.Rcold = Rhot * Math.pow(T0 / Thot, 1.2);
      this.K = (c.Vn * c.In) / (Thot ** 4 - T0 ** 4);          // σεA del filamento
      this.C = 4 * this.K * Thot ** 3 * 0.045;                  // capacità termica: ~45 ms a caldo
    }
    if (this.kind === 'led') { this.n = 2; this.Is = 0.02 / Math.exp(1.85 / (2 * VT)); this.Rs = 9; this.tau = 0.4; this.Tj = T0; }
    if (this.kind === 'wire') {
      const m = MATERIALS[wire.mat], S = (Math.PI * wire.d * wire.d) / 4;
      this.rho = m.rho; this.alpha = m.alpha; this.S = S;
      this.hEff = 28;                                           // W/m²K: convezione e irraggiamento, linearizzati
    }
  }
  /** Resistenza «lineare» del componente adesso (per resistori, lampadina, filo); null per il LED. */
  R() {
    if (this.burnt) return Infinity;
    if (this.kind === 'R') return this.R0 * (1 + 2e-4 * (this.T - T0));
    if (this.kind === 'lamp') return this.Rcold * Math.pow(this.T / T0, 1.2);
    if (this.kind === 'wire') return (this.rho * this.L) / this.S * (1 + this.alpha * (this.T - T0)) + 0.012;
    return null;
  }
  /** Corrente nel componente per la tensione V ai suoi capi. */
  I(V) {
    if (this.burnt) return 0;
    if (this.kind === 'led') return ledCurrent(this, V);
    return V / this.R();
  }
  /** Evoluzione termica per dt con la potenza P dissipata. */
  heat(dt, P) {
    if (this.burnt) { this.T += (T0 - this.T) * Math.min(1, dt / 8); this.smoke = Math.max(0, this.smoke - dt * 0.15); return; }
    if (this.kind === 'R') {
      const Tss = T0 + P * this.Rth; this.T += (Tss - this.T) * (1 - Math.exp(-dt / this.tau));
      this.smoke = this.T > 560 ? Math.min(1, (this.T - 560) / 120) : Math.max(0, this.smoke - dt * 0.3);
      if (this.T > 700) this.burn();
    } else if (this.kind === 'lamp') {
      const sub = Math.max(1, Math.ceil(dt / 0.002)), h = dt / sub;
      for (let k = 0; k < sub; k++) this.T = Math.max(T0, this.T + ((P - this.K * (this.T ** 4 - T0 ** 4)) / this.C) * h);
      if (this.T > 3450) this.burn();
    } else if (this.kind === 'led') {
      const Tss = T0 + P * 900; this.T += (Tss - this.T) * (1 - Math.exp(-dt / this.tau));
      if (this.T > 470) this.burn();
    } else {
      // il tratto di filo percorso dalla corrente: P per metro contro lo scambio con l'aria
      const perL = P / Math.max(0.01, this.L), loss = this.hEff * Math.PI * this.wire.d;
      const Tss = T0 + perL / loss, tau = (7800 * 460 * this.S) / loss;
      this.T += (Tss - this.T) * (1 - Math.exp(-dt / Math.max(0.05, tau)));
      if (this.T > 1500) this.burn();
    }
  }
  burn() { this.burnt = true; this.tBurn = 0; this.smoke = 1; }
}

function ledCurrent(p, V) {
  if (V >= 0) {
    // V = Vd + I·Rs: si risolve per bisezione su Vd
    let lo = 0, hi = Math.max(0, V);
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2, i = p.Is * (Math.exp(m / (p.n * VT)) - 1); if (m + i * p.Rs > V) hi = m; else lo = m; }
    const vd = (lo + hi) / 2;
    return p.Is * (Math.exp(vd / (p.n * VT)) - 1);
  }
  // in inversa: una corrente minuscola, poi la rottura a −5 V
  return V > -5 ? -p.Is - V * 1e-9 : -p.Is + (V + 5) / 30;
}

/**
 * Il circuito in un istante. s: { Vset, Ilim, on, flip (polarità invertita), mode: 'valle'|'monte', ideal }
 * @returns {{ V1 (ai capi del componente), I (nel componente), Is (dall'alimentatore), Vout, cc, Vm, Im (letture), RA, range }}
 */
export function solve(part, s) {
  const sg = s.flip ? -1 : 1, gV = s.ideal ? 0 : 1 / 10e6, Rc = 0.04, Vs = s.on ? Math.max(0, s.Vset) : 0;
  // si lavora con u ≥ 0, la tensione ai capi del componente nel verso dell'alimentatore; il segno si rimette alla fine
  const Ip = (u) => sg * part.I(sg * u);
  const at = (u, ra) => {
    const Il = Ip(u);
    if (s.mode === 'valle') { const Is = Il + u * gV; return { Il, Is, Vout: Is * (Rc + ra) + u, Ia: Is, Vm: u }; }
    const v2 = u + Il * ra, Is = Il + v2 * gV;
    return { Il, Is, Vout: Is * Rc + v2, Ia: Il, Vm: v2 };
  };
  const raOf = (I) => (s.ideal ? 0 : Math.abs(I) < 0.2 ? 1.0 : 0.05);    // portata automatica dell'amperometro
  let ra = raOf(part.lastI ?? 0), res = null;
  for (let pass = 0; pass < 3; pass++) {
    // tensione costante: Vout(u) cresce con u, si cerca Vout = Vs
    let lo = 0, hi = Vs;
    for (let k = 0; k < 64; k++) { const m = (lo + hi) / 2; if (at(m, ra).Vout > Vs) hi = m; else lo = m; }
    let u = lo, r = at(u, ra), cc = false;
    if (r.Is > s.Ilim) {
      // corrente costante: l'alimentatore abbassa la tensione finché la corrente è quella del limite
      cc = true;
      let a = 0, b = u;
      for (let k = 0; k < 64; k++) { const m = (a + b) / 2; if (at(m, ra).Is > s.Ilim) b = m; else a = m; }
      u = a; r = at(u, ra);
    }
    res = { V1: sg * u, I: sg * r.Il, Is: sg * r.Is, Vout: sg * r.Vout, cc, Vm: sg * r.Vm, Im: sg * r.Ia, RA: ra, range: Math.abs(r.Ia) < 0.2 ? 'mA' : 'A' };
    const ra2 = raOf(r.Ia);
    if (ra2 === ra) break;
    ra = ra2;
  }
  part.lastI = res.Im;
  return res;
}

/** Caratteristica teorica I(V) del componente in regime (per la lampadina a temperatura d'equilibrio). */
export function steadyIV(key, V, wire = null, L = 1) {
  const p = new Part(key, wire, L);
  if (p.kind === 'R' || p.kind === 'wire') {
    // con il riscaldamento: qualche iterazione
    let I = V / p.R();
    for (let k = 0; k < 30; k++) { p.heat(60, Math.abs(V * I)); I = V / p.R(); if (p.burnt) return NaN; }
    return I;
  }
  if (p.kind === 'lamp') {
    // bilancio: V²/R(T) = K(T⁴ − T0⁴)
    let lo = T0, hi = 3600;
    for (let k = 0; k < 60; k++) { const T = (lo + hi) / 2, R = p.Rcold * Math.pow(T / T0, 1.2); if ((V * V) / R > p.K * (T ** 4 - T0 ** 4)) lo = T; else hi = T; }
    const T = (lo + hi) / 2;
    return V / (p.Rcold * Math.pow(T / T0, 1.2));
  }
  return ledCurrent(p, V);
}
