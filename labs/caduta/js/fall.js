// fall.js — la fisica della caduta: pianeti, oggetti, equazioni del moto con gravità, attrito
// dell'aria (resistenza quadratica) e spinta di Archimede, integrate con Runge–Kutta del 4° ordine;
// l'istante d'impatto è trovato per bisezione dentro l'ultimo passo.
//
// Coordinate: x orizzontale (direzione del lancio), y verticale; y = 0 è il piano d'arrivo e y è la
// quota del punto più basso dell'oggetto. Unità SI. Nessuna dipendenza: gira identico in Node.

export const PLANETS = {
  earth: { name: 'Terra', g: 9.81, rho: 1.225, color: '#2c67dc', note: 'aria al livello del mare', sky: ['#e6e9ee', '#c3cbd6'], floor: '#e2e4e8' },
  moon: { name: 'Luna', g: 1.62, rho: 0, color: '#7a828c', note: 'nessuna atmosfera', sky: ['#dcdcdd', '#8d9198'], floor: '#d8d8d6' },
  mars: { name: 'Marte', g: 3.71, rho: 0.020, color: '#d9542b', note: 'atmosfera tenue di anidride carbonica', sky: ['#efdfd0', '#d8b79a'], floor: '#e5d1c1' },
  venus: { name: 'Venere', g: 8.87, rho: 65, color: '#d6a21e', note: 'aria 53 volte più densa che sulla Terra', sky: ['#f0e5c4', '#d9c48f'], floor: '#e5dabb' },
  jupiter: { name: 'Giove', g: 24.79, rho: 0.16, color: '#a8744a', note: 'alla quota in cui la pressione è 1 bar', sky: ['#ede5d8', '#d2c1a6'], floor: '#e6ded1' },
  titan: { name: 'Titano', g: 1.352, rho: 5.3, color: '#e0862c', note: 'luna di Saturno: aria fredda e densa', sky: ['#efdcbd', '#d7ae76'], floor: '#e5d5bc' },
  mercury: { name: 'Mercurio', g: 3.70, rho: 0, color: '#4f5a69', note: 'nessuna atmosfera', sky: ['#e0dedb', '#9d9a96'], floor: '#dcdad6' },
};

export const BALL_R = 0.02;                                    // pallina di 4 cm di diametro
const BALL_V = (4 / 3) * Math.PI * BALL_R ** 3;

/** Materiale plausibile per una pallina di 4 cm con la massa data (kg). */
export function ballMaterial(m) {
  const rho = m / BALL_V;
  if (rho < 150) return { name: 'celluloide', note: 'come una pallina da ping-pong (cava)', rho };
  if (rho < 500) return { name: 'sughero', rho };
  if (rho < 1000) return { name: 'legno', rho };
  if (rho < 2000) return { name: 'gomma', rho };
  if (rho < 4500) return { name: 'alluminio', rho };
  if (rho < 9500) return { name: 'acciaio', rho };
  if (rho < 15000) return { name: 'piombo', rho };
  return { name: 'tungsteno', rho };
}

/**
 * Proprietà aerodinamiche e geometriche di un oggetto.
 * m massa (kg) · V volume (m³, per la spinta di Archimede) · Cd coefficiente di resistenza ·
 * A area esposta al moto (m²) · top altezza dell'oggetto sopra il suo punto più basso (m) · width ingombro laterale (m)
 */
export function body(kind, mass) {
  switch (kind) {
    case 'ball': return { kind, m: mass, V: BALL_V, Cd: 0.47, A: Math.PI * BALL_R ** 2, top: 2 * BALL_R, width: 2 * BALL_R };
    // piuma remigante di falco: 28 cm × 3,5 cm, mezzo grammo; plana e oscilla, resistenza molto alta
    case 'feather': return { kind, m: 0.0005, V: 4e-7, Cd: 1.3, A: 0.009, top: 0.008, width: 0.05 };
    // martello da geologo in alluminio, come quello dell'Apollo 15 (1,32 kg), tenuto orizzontale
    case 'hammer': return { kind, m: 1.32, V: 1.32 / 2700, Cd: 1.0, A: 0.0127, top: 0.035, width: 0.17 };
    default: throw new Error(kind);
  }
}

/** Velocità limite (m/s) nell'atmosfera; Infinity senza aria, 0 se l'oggetto galleggia. */
export function terminalVelocity(b, g, rho) {
  if (!(rho > 0)) return Infinity;
  const w = (b.m - rho * b.V) * g;
  return w > 0 ? Math.sqrt((2 * w) / (rho * b.Cd * b.A)) : 0;
}

/** Moto nel vuoto: tempo di volo, velocità d'impatto, gittata, quota massima. */
export function vacuum(h, v0, angle, g) {
  const vx = v0 * Math.cos(angle), vy = v0 * Math.sin(angle);
  const t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
  return { t, v: Math.sqrt(v0 * v0 + 2 * g * h), range: vx * t, apex: h + (vy > 0 ? (vy * vy) / (2 * g) : 0), vx, vy };
}

/**
 * Integra il moto di un oggetto.
 * @returns {{dt:number, n:number, t:Float64Array, x:Float64Array, y:Float64Array, vx:Float64Array, vy:Float64Array,
 *            tLand:number|null, xLand:number, vLand:number, floats:boolean}}
 */
export function integrate(b, { g, rho, h, v0, angle }) {
  const k = rho > 0 ? (0.5 * rho * b.Cd * b.A) / b.m : 0;
  const gEff = g * (1 - (rho * b.V) / b.m);                    // gravità meno spinta di Archimede
  const acc = (vx, vy, out) => { const s = Math.hypot(vx, vy); out[0] = -k * s * vx; out[1] = -gEff - k * s * vy; };
  // passo: qualche migliaio di passi sul tempo di volo previsto
  const vac = vacuum(h, v0, angle, Math.max(gEff, 1e-3));
  const vt = terminalVelocity(b, g, rho);
  const Test = Math.max(vac.t, isFinite(vt) && vt > 0 ? (h + vac.apex) / vt : 0, 0.05);
  const dt = Math.min(Math.max(Test / 4000, 5e-5), 4e-3);
  const TMAX = 120, cap = Math.ceil(Math.min(Test * 1.6 + 1, TMAX) / dt) + 8;
  let size = Math.min(cap, 400000);
  let T = new Float64Array(size), X = new Float64Array(size), Y = new Float64Array(size), VX = new Float64Array(size), VY = new Float64Array(size);
  const grow = () => {
    size *= 2;
    const g2 = (a) => { const b2 = new Float64Array(size); b2.set(a); return b2; };
    T = g2(T); X = g2(X); Y = g2(Y); VX = g2(VX); VY = g2(VY);
  };
  const a1 = [0, 0], a2 = [0, 0], a3 = [0, 0], a4 = [0, 0];
  const s = [0, 0, 0, 0];
  /** Un passo di RK4 di ampiezza dt dallo stato (x, y, vx, vy); il risultato va in s. */
  const rk4 = (x, y, vx, vy, d) => {
    acc(vx, vy, a1);
    const vx2 = vx + 0.5 * d * a1[0], vy2 = vy + 0.5 * d * a1[1]; acc(vx2, vy2, a2);
    const vx3 = vx + 0.5 * d * a2[0], vy3 = vy + 0.5 * d * a2[1]; acc(vx3, vy3, a3);
    const vx4 = vx + d * a3[0], vy4 = vy + d * a3[1]; acc(vx4, vy4, a4);
    s[0] = x + (d / 6) * (vx + 2 * vx2 + 2 * vx3 + vx4);
    s[1] = y + (d / 6) * (vy + 2 * vy2 + 2 * vy3 + vy4);
    s[2] = vx + (d / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
    s[3] = vy + (d / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
  };
  let n = 0, x = 0, y = h, vx = v0 * Math.cos(angle), vy = v0 * Math.sin(angle), t = 0;
  T[0] = 0; X[0] = x; Y[0] = y; VX[0] = vx; VY[0] = vy; n = 1;
  let tLand = null, floats = false;
  while (t < TMAX) {
    rk4(x, y, vx, vy, dt);
    if (s[1] <= 0) {
      // impatto dentro questo passo: bisezione sull'ampiezza del passo
      let lo = 0, hi = dt;
      for (let i = 0; i < 48; i++) { const mid = 0.5 * (lo + hi); rk4(x, y, vx, vy, mid); if (s[1] > 0) lo = mid; else hi = mid; }
      rk4(x, y, vx, vy, hi);
      t += hi;
      if (n >= size) grow();
      T[n] = t; X[n] = s[0]; Y[n] = 0; VX[n] = s[2]; VY[n] = s[3]; n++;
      tLand = t;
      break;
    }
    x = s[0]; y = s[1]; vx = s[2]; vy = s[3]; t += dt;
    if (n >= size) grow();
    T[n] = t; X[n] = x; Y[n] = y; VX[n] = vx; VY[n] = vy; n++;
    if (gEff <= 0 && vy >= 0 && y > h + 1.2) { floats = true; break; }  // più leggero dell'aria: sale, e lo lascio salire un po'
    if (y > h + 400) break;
  }
  const L = n - 1;
  return { dt, n, t: T, x: X, y: Y, vx: VX, vy: VY, tLand, xLand: X[L], vLand: Math.hypot(VX[L], VY[L]), floats, gEff, vt };
}

/** Stato interpolato all'istante t (fermo all'ultimo campione dopo l'impatto). */
export function sampleAt(r, t, out) {
  if (t <= 0) { out.x = r.x[0]; out.y = r.y[0]; out.vx = r.vx[0]; out.vy = r.vy[0]; return out; }
  const last = r.n - 1;
  if (t >= r.t[last]) { out.x = r.x[last]; out.y = r.y[last]; out.vx = r.vx[last]; out.vy = r.vy[last]; out.end = true; return out; }
  let i = Math.min(Math.floor(t / r.dt), last - 1);
  while (i > 0 && r.t[i] > t) i--;
  while (i < last - 1 && r.t[i + 1] < t) i++;
  const f = (t - r.t[i]) / (r.t[i + 1] - r.t[i]);
  out.x = r.x[i] + (r.x[i + 1] - r.x[i]) * f; out.y = r.y[i] + (r.y[i + 1] - r.y[i]) * f;
  out.vx = r.vx[i] + (r.vx[i + 1] - r.vx[i]) * f; out.vy = r.vy[i] + (r.vy[i + 1] - r.vy[i]) * f;
  out.end = false;
  return out;
}
