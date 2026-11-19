// circ.js — la fisica del moto circolare: un motore che porta in rotazione una piattaforma, bracci che
// trascinano dei dischi a cuscino d'aria (senza attrito), lo sgancio, il volo oltre il bordo e la caduta.
//
// Coordinate orizzontali (x, z) come nella scena 3D; l'angolo θ cresce in senso antiorario visto
// dall'alto e un punto al raggio r e all'angolo θ sta in (r·cos θ, −r·sin θ). y è la quota. Unità SI.
// Nessuna dipendenza: gira identico in Node (per i test).

export const DISC_R = 0.6;          // raggio della piattaforma (m)
export const DISC_Y = 0.8;          // quota della superficie della piattaforma (m)
export const PUCK_R = 0.035;        // raggio del disco a cuscino d'aria (m)
export const G = 9.81;
const MU_FLOOR = 0.3;               // attrito del disco sul pavimento, dopo la caduta
const TWO_PI = Math.PI * 2;

/** Motore: la velocità angolare raggiunge quella richiesta con accelerazione costante (in modulo). */
export class Motor {
  constructor() { this.theta = 0; this.omega = 0; this.target = 0; this.alphaMax = 3; this.alpha = 0; }
  step(dt) {
    const d = this.target - this.omega, s = this.alphaMax * dt;
    const w0 = this.omega;
    if (Math.abs(d) <= s) { this.omega = this.target; this.alpha = 0; } else { this.omega += Math.sign(d) * s; this.alpha = Math.sign(d) * this.alphaMax; }
    this.theta += 0.5 * (w0 + this.omega) * dt;
  }
  stopNow() { this.omega = 0; this.target = 0; this.alpha = 0; }
}

/** Posizione e velocità dei punti di un corpo rigido in rotazione: aiuto per chi disegna. */
export const polar = (r, th) => [r * Math.cos(th), -r * Math.sin(th)];

/**
 * Un disco a cuscino d'aria. Stati: 'arm' trascinato dal braccio · 'free' scivola sulla piattaforma
 * senza attrito · 'air' è uscito dal bordo e cade · 'floor' striscia sul pavimento · 'rest' fermo.
 */
export class Puck {
  constructor(phi) {
    this.phi = phi;             // angolo del braccio rispetto al riferimento della piattaforma
    this.r = 0.3; this.m = 0.2;
    this.state = 'arm';
    this.p = { x: 0, y: DISC_Y, z: 0 }; this.v = { x: 0, y: 0, z: 0 }; this.a = { x: 0, y: 0, z: 0 };
    this.Fr = 0; this.Ft = 0;   // forza sul disco: componente verso il centro e tangenziale (N)
    this.spin = 0;              // orientamento del disco attorno al proprio asse
  }

  /** Riporta il disco sul braccio. */
  attach(motor) { this.state = 'arm'; this._arm(motor); }

  /** Sgancia: da questo istante nessuna forza orizzontale. */
  release() { if (this.state === 'arm') { this.state = 'free'; this.Fr = 0; this.Ft = 0; this.a.x = 0; this.a.z = 0; } }

  _arm(motor) {
    const th = motor.theta + this.phi, w = motor.omega, al = motor.alpha, r = this.r;
    const c = Math.cos(th), s = Math.sin(th);
    this.p.x = r * c; this.p.y = DISC_Y; this.p.z = -r * s;
    // velocità tangenziale ω·r; accelerazione: centripeta ω²·r più tangenziale α·r
    this.v.x = -w * r * s; this.v.y = 0; this.v.z = -w * r * c;
    this.a.x = -w * w * r * c - al * r * s; this.a.y = 0; this.a.z = w * w * r * s - al * r * c;
    this.Fr = this.m * w * w * r; this.Ft = this.m * al * r;
    this.spin = th;
  }

  step(dt, motor) {
    const p = this.p, v = this.v;
    switch (this.state) {
      case 'arm': this._arm(motor); break;
      case 'free':
        p.x += v.x * dt; p.z += v.z * dt;
        if (Math.hypot(p.x, p.z) > DISC_R) this.state = 'air';            // il centro del disco ha superato il bordo
        break;
      case 'air':
        v.y -= G * dt;
        p.x += v.x * dt; p.y += v.y * dt - 0.5 * G * dt * dt; p.z += v.z * dt;
        if (p.y <= 0) { p.y = 0; v.y = 0; this.state = 'floor'; }
        break;
      case 'floor': {
        const sp = Math.hypot(v.x, v.z), dv = MU_FLOOR * G * dt;
        if (sp <= dv) { v.x = 0; v.z = 0; this.state = 'rest'; break; }
        v.x *= (sp - dv) / sp; v.z *= (sp - dv) / sp;
        p.x += v.x * dt; p.z += v.z * dt;
        break;
      }
      default: break;
    }
  }
  get speed() { return Math.hypot(this.v.x, this.v.z, this.v.y); }
}

/**
 * Fotocellula ferma nel laboratorio all'angolo thetaGate: registra gli istanti in cui il disco (sul braccio)
 * le passa sotto e ne ricava il periodo.
 */
export class Gate {
  constructor(thetaGate) { this.th = thetaGate; this.reset(); }
  reset() { this.times = []; this.n = 0; this.dir = 0; this.flash = 0; }
  /** Chiamata a ogni passo con l'angolo del braccio prima e dopo, e l'istante finale. */
  check(th0, th1, t1, dt) {
    const k0 = Math.floor((th0 - this.th) / TWO_PI), k1 = Math.floor((th1 - this.th) / TWO_PI);
    if (k0 !== k1) {
      // se il verso di rotazione cambia, il passaggio precedente non chiude un giro: si ricomincia a contare il periodo
      const d = Math.sign(th1 - th0);
      if (d !== this.dir) { this.times.length = 0; this.dir = d; }
      const target = this.th + TWO_PI * Math.max(k0, k1);
      const f = (target - th0) / (th1 - th0);                         // interpolazione lineare dentro il passo
      this.times.push(t1 - dt + f * dt);
      if (this.times.length > 50) this.times.shift();
      this.n++;
      this.flash = 1;
    }
  }
  get period() { const n = this.times.length; return n >= 2 ? this.times[n - 1] - this.times[n - 2] : NaN; }
  get count() { return this.n; }
}

/** Grandezze del moto circolare uniforme al raggio r con velocità angolare ω e massa m. */
export function uniform(omega, r, m) {
  const w = Math.abs(omega);
  return { T: w > 0 ? TWO_PI / w : Infinity, f: w / TWO_PI, rpm: (w * 60) / TWO_PI, v: w * r, a: w * w * r, F: m * w * w * r };
}
