// viscous.js — la caduta di una sfera in un fluido viscoso. Forze sulla sfera (verso il basso positivo):
//   peso − spinta di Archimede − resistenza del fluido, con la massa aggiunta (metà della massa di fluido
//   spostato) che si muove insieme alla sfera.
// La resistenza vale 3π·η·d·v (legge di Stokes) moltiplicata per un fattore φ(Re) che la estende ai numeri
// di Reynolds grandi (correlazione di Clift e Gauvin) e per il fattore di parete di Francis (tubo stretto).
// Viscosità e densità dei fluidi dipendono dalla temperatura (glicerina e miscele con acqua: Cheng 2008).
// Integrazione esponenziale: esatta per una resistenza lineare e stabile anche quando la costante di tempo
// (decimi di millisecondo per una sferetta nel miele) è molto più piccola del passo.
// Unità SI. Nessuna dipendenza: gira identico nel browser e in Node.

export const G = 9.81;

/** Viscosità dell'acqua (Pa·s) e della glicerina pura (Pa·s), T in °C (Cheng 2008). */
const etaWater = (T) => 1.79e-3 * Math.exp(((-1230 - T) * T) / (36100 + 360 * T));
const etaGly = (T) => 12.1 * Math.exp(((-1233 + T) * T) / (9900 + 70 * T));
const rhoWater = (T) => 1000 * (1 - Math.abs((T - 4) / 622) ** 1.7);
const rhoGly = (T) => 1273.3 - 0.6121 * T;
/** Andrade/Arrhenius: η(T) = η20 · exp(B·(1/T − 1/293,15)). */
const arr = (eta20, B) => (T) => eta20 * Math.exp(B * (1 / (T + 273.15) - 1 / 293.15));

/** I fluidi: densità e viscosità in funzione della temperatura (°C) e, per la glicerina, della concentrazione. */
export const FLUIDS = {
  glycerol: {
    name: 'Glicerina', color: '#f3eed2', alpha: 0.32, note: 'miscela con acqua, il classico del laboratorio',
    props(T, c = 1) {
      // Cheng (2008): μ = μ_w^α · μ_g^(1−α), con c frazione in massa di glicerina
      const a = 0.705 - 0.0017 * T, b = (4.9 + 0.036 * T) * a ** 2.5;
      const alpha = 1 - c + (a * b * c * (1 - c)) / (a * c + b * (1 - c));
      const eta = etaWater(T) ** alpha * etaGly(T) ** (1 - alpha);
      const rho = 1 / (c / rhoGly(T) + (1 - c) / rhoWater(T));
      return { eta, rho };
    },
  },
  castor: { name: 'Olio di ricino', color: '#efcf6c', alpha: 0.5, note: 'denso e giallo, molto sensibile alla temperatura', props: (T) => ({ eta: arr(0.986, 7290)(T), rho: 961 - 0.66 * (T - 20) }) },
  silicone: { name: 'Olio di silicone', color: '#e9f0f4', alpha: 0.24, note: '1000 cSt: la viscosità cambia poco con la temperatura', props: (T) => ({ eta: arr(0.97, 1360)(T), rho: 970 - 0.9 * (T - 20) }) },
  honey: { name: 'Miele', color: '#c7861a', alpha: 0.78, note: 'millefiori: viscosissimo, dimezza ogni 5 °C', props: (T) => ({ eta: arr(8, 10000)(T), rho: 1420 - 0.5 * (T - 20) }) },
  water: { name: 'Acqua', color: '#d6edf7', alpha: 0.18, note: 'mille volte meno viscosa della glicerina', props: (T) => ({ eta: etaWater(T), rho: rhoWater(T) }) },
};

/** Sfere: densità (kg/m³), aspetto. */
export const SPHERES = {
  steel: { name: 'Acciaio', rho: 7800, note: 'sfere da cuscinetto' },
  brass: { name: 'Ottone', rho: 8500 },
  glass: { name: 'Vetro', rho: 2500 },
  alu: { name: 'Alluminio', rho: 2700 },
  ptfe: { name: 'Teflon', rho: 2200 },
  nylon: { name: 'Nylon', rho: 1140, note: 'più leggero della glicerina: galleggia' },
};

/** Fattore di parete di Francis (1933): velocità nel tubo / velocità in un fluido illimitato, λ = d/D. */
export const wallFactor = (lambda) => (lambda >= 0.97 ? 0 : ((1 - lambda) / (1 - 0.475 * lambda)) ** 4);

/**
 * Resistenza / resistenza di Stokes in funzione del numero di Reynolds: la curva standard della sfera
 * (Clift, Grace e Weber, 1978), che per Re → 0 tende alla correzione di Oseen 1 + 3·Re/16.
 */
export function phi(Re) {
  if (Re <= 0) return 1;
  const w = Math.log10(Re), cd = (lg) => (10 ** lg * Re) / 24;
  if (Re < 0.01) return 1 + (3 * Re) / 16;
  if (Re <= 20) return 1 + 0.1315 * Re ** (0.82 - 0.05 * w);
  if (Re <= 260) return 1 + 0.1935 * Re ** 0.6305;
  if (Re <= 1500) return cd(1.6435 - 1.1242 * w + 0.1558 * w * w);
  if (Re <= 1.2e4) return cd(-2.4571 + 2.5558 * w - 0.9295 * w * w + 0.1049 * w ** 3);
  if (Re <= 4.4e4) return cd(-1.9181 + 0.637 * w - 0.0636 * w * w);
  return cd(-4.339 + 1.5809 * w - 0.1546 * w * w);
}

/**
 * Tutto ciò che serve per una sfera di diametro d e densità rhoS in un fluido (eta, rho), in un tubo di diametro D.
 * wall: applica la correzione di parete (alla parte viscosa).
 */
export function setup({ d, rhoS, eta, rho, D, wall = true }) {
  const r = d / 2, V = (4 / 3) * Math.PI * r ** 3, m = rhoS * V;
  const kw = wall && D ? wallFactor(d / D) : 1;
  return { d, r, V, m, M: m + 0.5 * rho * V, W: (m - rho * V) * G, eta, rho, kw, rhoS };
}
/** Coefficiente di resistenza lineare γ(v): F = γ·v. */
export function gamma(S, v) {
  const Re = (S.rho * Math.abs(v) * S.d) / S.eta;
  // la parete rallenta soprattutto il moto viscoso: il suo fattore pesa sulla parte di Stokes
  return 3 * Math.PI * S.eta * S.d * (1 / Math.max(S.kw, 1e-6) - 1 + phi(Re));
}
/** Velocità limite: W = γ(v)·v, per bisezione sul logaritmo. Negativa se la sfera sale. */
export function terminal(S) {
  if (S.W === 0) return 0;
  const W = Math.abs(S.W);
  let lo = 1e-12, hi = 100;
  for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (gamma(S, m) * m > W) hi = m; else lo = m; }
  return Math.sign(S.W) * Math.sqrt(lo * hi);
}
/** La previsione di Stokes, senza correzioni: v = 2·r²·(ρs − ρf)·g / (9·η). */
export const stokesV = (S) => (2 * S.r * S.r * (S.rhoS - S.rho) * G) / (9 * S.eta);
/** Numero di Reynolds a velocità v. */
export const reynolds = (S, v) => (S.rho * Math.abs(v) * S.d) / S.eta;
/** Costante di tempo dell'avvicinamento alla velocità limite (vicino a v). */
export const tau = (S, v) => S.M / gamma(S, v);
/** Viscosità ricavata da una velocità misurata con la formula di Stokes (eventualmente corretta per la parete). */
export const etaFromV = (S, v, wall) => ((2 * S.r * S.r * (S.rhoS - S.rho) * G) / (9 * v)) * (wall ? S.kw : 1);

/**
 * Un lancio: la sfera parte ferma con il centro a quota y0 (profondità sotto il pelo libero, verso il basso positiva)
 * e si ferma sul fondo, a profondità yBot (centro). Se è più leggera del fluido risale e galleggia.
 */
export class Drop {
  constructor(S, yBot, y0 = 0) {
    this.S = S; this.yBot = yBot;
    this.y = y0; this.v = 0; this.t = 0; this.a = 0;
    this.done = false; this.floating = false;
    this.rec = { t: [0], y: [y0], v: [0] };
    this.recAt = 0;
  }
  /** Avanza di dt con passi esponenziali (γ congelato su ogni sotto-passo). */
  step(dt) {
    const S = this.S;
    let left = dt;
    while (left > 1e-12 && !this.done) {
      const g = gamma(S, this.v), tc = S.M / g, vt = S.W / g;
      const h = Math.min(left, 0.002);
      const e = Math.exp(-h / tc);
      const v1 = vt + (this.v - vt) * e;
      let y1 = this.y + vt * h + (this.v - vt) * tc * (1 - e);
      this.a = (v1 - this.v) / h;
      this.t += h; left -= h;
      if (y1 >= this.yBot) {
        // tocca il fondo: istante esatto per interpolazione
        const f = (this.yBot - this.y) / (y1 - this.y);
        this.t -= h * (1 - f); y1 = this.yBot;
        this.v = 0; this.y = y1; this.done = true;
      } else if (y1 <= 0 && S.W < 0) {
        this.y = 0; this.v = 0; this.done = true; this.floating = true;
      } else { this.y = y1; this.v = v1; }
      if (this.t >= this.recAt || this.done) { this.rec.t.push(this.t); this.rec.y.push(this.y); this.rec.v.push(this.v); this.recAt = this.t + Math.max(0.002, this.t * 0.004); }
    }
  }
  /** Istante in cui il centro passa alla profondità yc (interpolato sulla registrazione), o null. */
  timeAt(yc) {
    const { t, y } = this.rec;
    for (let i = 1; i < t.length; i++) if (y[i - 1] < yc && y[i] >= yc) return t[i - 1] + ((yc - y[i - 1]) / (y[i] - y[i - 1])) * (t[i] - t[i - 1]);
    return null;
  }
}
