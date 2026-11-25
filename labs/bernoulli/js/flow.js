// flow.js — la fisica dei due apparati.
//
// Il tubo di Venturi. Dal serbatoio a livello costante (carico H sopra l'asse del tubo) l'acqua scorre nel tubo e
// esce dalla valvola. Lungo il tubo vale il bilancio dell'energia per unità di peso (Bernoulli con le perdite):
//     h + v²/2g = E(x),   E(0) = H − perdita d'imbocco,   dE/dx = −(attrito di Darcy) − (perdite localizzate)
// dove h = p/ρg è l'altezza nei tubicini piezometrici (sopra l'asse) e v = Q/A(x) per la continuità. L'attrito usa
// f = 64/Re in regime laminare e la formula di Blasius in quello turbolento; il divergente perde K·(v₁−v₂)²/2g, il
// restringimento brusco 0,42(1−β²)·v²/2g e l'allargamento brusco (v₁−v₂)²/2g (Borda–Carnot), distribuito lungo il
// tratto in cui la corrente si riattacca alla parete. La portata è quella per cui le perdite più il carico cinetico
// all'uscita fanno H. Con il fluido ideale restano solo la valvola e l'uscita: lungo il tubo vale Bernoulli esatto.
//
// La pallina nel getto. Il getto d'aria di un asciugacapelli: nucleo potenziale lungo circa 6 diametri, poi la
// velocità sull'asse cala come 1/s e il profilo trasversale è gaussiano, largo circa un decimo della distanza. Sulla
// pallina agiscono il peso, la resistenza dell'aria che la spinge lungo il getto e una forza laterale verso il lato
// dove l'aria corre più veloce (la differenza di pressione di Bernoulli fra i due fianchi, aiutata dall'effetto
// Coandă); in più piccoli colpi casuali della turbolenza.

export const G = 9.81, RHO_W = 998, NU_W = 1.0e-6, RHO_A = 1.2;

// ───────────────────────────── il tubo ─────────────────────────────
export const PIPE = { x0: -0.55, x1: 0.47, D1: 0.026, Y0: 0.32, wall: 0.003 };

/**
 * Il profilo del tubo: kind 'venturi' | 'step' | 'uniform', d diametro della gola (m).
 * @returns {{ kind, r(x), xs: number[] (tubicini), throatX, tap: number (indice del tubicino alla gola), regions }}
 */
export function makeProfile(kind, d) {
  const R1 = PIPE.D1 / 2, rt = Math.min(R1, d / 2);
  const P = { kind, R1, rt, D1: PIPE.D1 };
  if (kind === 'venturi') {
    const xc0 = -0.15, Lc = (R1 - rt) / Math.tan((10.5 * Math.PI) / 180), Lt = 0.04;
    const xt0 = xc0 + Lc, xt1 = xt0 + Lt, Ld = (R1 - rt) / Math.tan((3.5 * Math.PI) / 180), xd1 = xt1 + Ld;
    Object.assign(P, { xc0, xt0, xt1, xd1 });
    P.r = (x) => (x < xc0 ? R1 : x < xt0 ? R1 - ((x - xc0) / Lc) * (R1 - rt) : x < xt1 ? rt : x < xd1 ? rt + ((x - xt1) / Ld) * (R1 - rt) : R1);
    P.throatX = (xt0 + xt1) / 2;
    P.xs = [-0.42, xc0 - 0.04, (xc0 + xt0) / 2 - 0.004, P.throatX, xt1 + Ld * 0.3, Math.min(0.32, xd1 + 0.03), 0.4];
  } else if (kind === 'step') {
    const xs0 = -0.07, xs1 = 0.03;
    Object.assign(P, { xs0, xs1 });
    P.r = (x) => (x < xs0 || x >= xs1 ? R1 : rt);
    P.throatX = (xs0 + xs1) / 2;
    P.xs = [-0.42, -0.2, xs0 - 0.015, P.throatX, xs1 + 0.025, xs1 + 0.12, 0.4];
  } else {
    P.r = () => R1;
    P.throatX = 0;
    P.xs = [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.4];
  }
  P.tap = 3;
  P.area = (x) => Math.PI * P.r(x) ** 2;
  return P;
}

/** Fattore d'attrito di Darcy per un tubo liscio. */
export function darcy(Re) {
  if (Re < 1) return 64;
  const lam = 64 / Re, tur = 0.316 / Math.pow(Re, 0.25);
  if (Re < 2300) return lam;
  if (Re > 4000) return tur;
  const t = (Re - 2300) / 1700;
  return lam * (1 - t) + tur * t;
}

/** Coefficiente di perdita della valvola a sfera aperta per la frazione φ (riferito alla velocità nel tubo). */
export function valveK(phi) {
  const p = Math.max(0.003, Math.min(1, phi));
  const a = p * p * (3 - 2 * p);                      // area libera che cresce dolcemente
  const cc = 0.62 + 0.38 * p ** 3;                     // contrazione della vena
  return (1 / (cc * Math.max(a, 1e-4)) - 1) ** 2 + 0.05;
}

const N_GRID = 520;
/**
 * Carichi lungo il tubo per la portata Q (m³/s).
 * @returns {{ x: Float64Array, E, h, v, Re, Eout (carico prima della valvola) }}
 */
export function heads(P, Q, H, ideal) {
  const x = new Float64Array(N_GRID), E = new Float64Array(N_GRID), h = new Float64Array(N_GRID), v = new Float64Array(N_GRID), Re = new Float64Array(N_GRID);
  const dx = (PIPE.x1 - PIPE.x0) / (N_GRID - 1);
  const v1 = Q / (Math.PI * P.R1 * P.R1), vt = Q / (Math.PI * P.rt * P.rt), g2 = 2 * G;
  let e = H - (ideal ? 0 : 0.04 * (v1 * v1) / g2);          // imbocco arrotondato
  // perdite localizzate (fuori dal fluido ideale)
  const kDiv = 0.17, lam = 2 * P.D1;
  for (let i = 0; i < N_GRID; i++) {
    const xi = PIPE.x0 + i * dx, r = P.r(xi), A = Math.PI * r * r, vi = Q / A;
    x[i] = xi; v[i] = vi; Re[i] = (vi * 2 * r) / NU_W;
    if (i > 0 && !ideal) {
      const xm = xi - dx / 2, rm = P.r(xm), vm = Q / (Math.PI * rm * rm), Rem = (vm * 2 * rm) / NU_W;
      e -= darcy(Rem) * (dx / (2 * rm)) * (vm * vm) / g2;
    }
    let ek = 0;                                              // correzione del tratto di riattacco dopo un allargamento brusco
    if (!ideal) {
      if (P.kind === 'venturi') {
        // perdita del divergente, distribuita man mano che la velocità cala
        if (xi > P.xt1) { const vEnd = xi >= P.xd1 ? v1 : vi; ek = -kDiv * (vt - vEnd) ** 2 / g2; }
      } else if (P.kind === 'step') {
        if (xi >= P.xs0) ek -= 0.42 * (1 - (P.rt / P.R1) ** 2) * (vt * vt) / g2;          // imbocco della strozzatura
        if (xi >= P.xs1) {
          const xi1 = (xi - P.xs1) / lam, dE = (vt - v1) ** 2 / g2;
          ek -= dE * (1 - Math.exp(-xi1));
          // il getto si allarga a poco a poco: il carico cinetico resta alto subito dopo il gradino
          const kin = v1 * v1 / g2 + (vt * vt - v1 * v1) / g2 * Math.exp(-xi1);
          E[i] = e + ek; h[i] = E[i] - kin; continue;
        }
      }
    }
    E[i] = e + ek; h[i] = E[i] - (vi * vi) / g2;
  }
  return { x, E, h, v, Re, Eout: E[N_GRID - 1] };
}

/** Portata a regime per apertura φ della valvola, carico H, profilo P. */
export function solveQ(P, phi, H, ideal) {
  if (phi <= 0.002) return 0;
  const A1 = Math.PI * P.R1 * P.R1, K = valveK(phi);
  const F = (Q) => { const hd = heads(P, Q, H, ideal), v1 = Q / A1; return H - hd.Eout + (K + 1) * (v1 * v1) / (2 * G); };
  let lo = 0, hi = A1 * Math.sqrt(2 * G * H) * 1.01;
  for (let k = 0; k < 44; k++) { const m = (lo + hi) / 2; if (F(m) > H) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

/** Valore di una grandezza della griglia nel punto x (interpolazione lineare). */
export function at(arr, xs, x) {
  const n = xs.length, f = ((x - xs[0]) / (xs[n - 1] - xs[0])) * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(f))), t = f - i;
  return arr[i] * (1 - t) + arr[i + 1] * t;
}

// ───────────────────────────── il getto ─────────────────────────────
export const JET = { D0: 0.042, core: 6.2, spread: 0.105 };
/** Velocità del getto (m/s) a distanza s lungo l'asse e r di traverso dall'uscita dell'ugello. */
export function jetU(U0, s, r) {
  if (s < -0.005) return 0;
  const { D0, core, spread } = JET, s1 = Math.max(0, s);
  const Uc = s1 < core * D0 ? U0 : (U0 * core * D0) / s1;
  const b = Math.max(D0 * 0.46, spread * (s1 + 1.2 * D0));
  return Uc * Math.exp(-((r / b) ** 2));
}

export const BALLS = {
  pingpong: { name: 'Ping-pong', m: 0.0027, R: 0.02, Cd: 0.47 },
  poly: { name: 'Polistirolo', m: 0.0022, R: 0.03, Cd: 0.47 },
  heavy: { name: 'Ping-pong zavorrata', m: 0.0055, R: 0.02, Cd: 0.47 },
};

/** La pallina: stato nel piano del getto (x orizzontale, y in alto), con il getto che esce da N in direzione t. */
export class Ball {
  constructor() { this.p = [0, 0.5]; this.v = [0, 0]; this.spin = 0; this.kick = [0, 0]; this.kt = 0; this.F = { drag: [0, 0], lat: [0, 0], w: 0 }; }
  /**
   * env: { U0, N: [x,y] ugello, t: [tx,ty] direzione, ball, floorY }
   */
  step(dt, env) {
    const B = BALLS[env.ball], A = Math.PI * B.R * B.R, g = G;
    const [tx, ty] = env.t, nx = -ty, ny = tx;
    const sub = Math.max(1, Math.ceil(dt / 0.001)), h = dt / sub;
    for (let k = 0; k < sub; k++) {
      const dxp = this.p[0] - env.N[0], dyp = this.p[1] - env.N[1];
      const s = dxp * tx + dyp * ty, r = dxp * nx + dyp * ny;
      const u = jetU(env.U0, s, r);
      // resistenza: l'aria che corre lungo il getto contro la pallina
      const wx = u * tx - this.v[0], wy = u * ty - this.v[1], w = Math.hypot(wx, wy);
      const kd = 0.5 * RHO_A * B.Cd * A * w;
      let fx = kd * wx, fy = kd * wy;
      // forza laterale: verso il fianco dove l'aria è più veloce
      const ui = jetU(env.U0, s, r - B.R), uo = jetU(env.U0, s, r + B.R);
      const fl = -0.8 * 0.5 * RHO_A * A * (ui * ui - uo * uo);
      const lx = fl * nx, ly = fl * ny;
      fx += lx; fy += ly;
      // turbulenza: colpi casuali, correlati per qualche centesimo di secondo
      this.kt -= h;
      if (this.kt <= 0) { this.kt = 0.03 + Math.random() * 0.04; const q = 0.5 * RHO_A * A * u * u * 0.09; this.kick = [(Math.random() * 2 - 1) * q, (Math.random() * 2 - 1) * q * 0.6]; }
      fx += this.kick[0]; fy += this.kick[1];
      this.v[0] += (fx / B.m) * h; this.v[1] += (fy / B.m - g) * h;
      this.p[0] += this.v[0] * h; this.p[1] += this.v[1] * h;
      // pavimento
      if (this.p[1] < env.floorY + B.R) {
        this.p[1] = env.floorY + B.R;
        if (this.v[1] < 0) this.v[1] = -this.v[1] * 0.55;
        this.v[0] *= 0.985;
        if (Math.abs(this.v[1]) < 0.05) this.v[1] = 0;
      }
      // la pallina gira, trascinata dall'aria sul fianco più veloce
      this.spin += ((ui - uo) / B.R) * 0.02 * h - this.spin * 2 * h;
      this.F = { drag: [kd * wx, kd * wy], lat: [lx, ly], w, u, s, r, weight: B.m * g };
    }
  }
}
