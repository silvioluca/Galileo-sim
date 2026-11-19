// proj.js — la fisica del moto parabolico: pianeti, proiettili, equazioni del moto con gravità,
// resistenza dell'aria quadratica e spinta di Archimede (Runge–Kutta del 4° ordine), rimbalzi e
// rotolamento sul pavimento, urto fra la pallina e un bersaglio che cade. Gli istanti degli eventi
// (impatti, urti) sono cercati per bisezione dentro il passo.
//
// Coordinate: x orizzontale nella direzione del lancio, y verticale (quota del CENTRO dell'oggetto),
// z profondità (costante per ogni oggetto). Il pavimento è y = 0. Unità SI. Nessuna dipendenza: gira
// identico nel browser e in Node.

export const PLANETS = {
  earth: { name: 'Terra', g: 9.81, rho: 1.225, color: '#2c67dc', note: 'aria al livello del mare', sky: ['#e6e9ee', '#c3cbd6'], floor: '#e2e4e8' },
  moon: { name: 'Luna', g: 1.62, rho: 0, color: '#7a828c', note: 'nessuna atmosfera', sky: ['#dcdcdd', '#8d9198'], floor: '#d8d8d6' },
  mars: { name: 'Marte', g: 3.71, rho: 0.020, color: '#d9542b', note: 'atmosfera tenue di anidride carbonica', sky: ['#efdfd0', '#d8b79a'], floor: '#e5d1c1' },
  venus: { name: 'Venere', g: 8.87, rho: 65, color: '#d6a21e', note: 'aria 53 volte più densa che sulla Terra', sky: ['#f0e5c4', '#d9c48f'], floor: '#e5dabb' },
  jupiter: { name: 'Giove', g: 24.79, rho: 0.16, color: '#a8744a', note: 'alla quota in cui la pressione è 1 bar', sky: ['#ede5d8', '#d2c1a6'], floor: '#e6ded1' },
  titan: { name: 'Titano', g: 1.352, rho: 5.3, color: '#e0862c', note: 'luna di Saturno: aria fredda e densa', sky: ['#efdcbd', '#d7ae76'], floor: '#e5d5bc' },
  mercury: { name: 'Mercurio', g: 3.70, rho: 0, color: '#4f5a69', note: 'nessuna atmosfera', sky: ['#e0dedb', '#9d9a96'], floor: '#dcdad6' },
};

/** Palline che entrano nella canna del lanciatore (alesaggio 43 mm). e = coefficiente di restituzione sul pavimento gommato. */
export const BALLS = {
  steel: { name: 'Acciaio', d: 0.0254, m: 0.0674, e: 0.45, hollow: false, note: 'Ø 25,4 mm · 67 g' },
  nylon: { name: 'Nylon', d: 0.0254, m: 0.0098, e: 0.6, hollow: false, note: 'Ø 25,4 mm · 9,8 g' },
  cork: { name: 'Sughero', d: 0.0254, m: 0.0021, e: 0.5, hollow: false, note: 'Ø 25,4 mm · 2,1 g' },
  pingpong: { name: 'Ping-pong', d: 0.040, m: 0.0027, e: 0.78, hollow: true, note: 'Ø 40 mm · 2,7 g, cava' },
};

/** Proprietà meccaniche e aerodinamiche di una pallina. spinK = I/(m r²): 2/5 piena, 2/3 cava. */
export function ballSpec(key) {
  const B = BALLS[key], r = B.d / 2;
  return { kind: 'ball', key, r, m: B.m, V: (4 / 3) * Math.PI * r ** 3, Cd: 0.47, A: Math.PI * r * r, e: B.e, mu: 0.35, roll: 0.12, spinK: B.hollow ? 2 / 3 : 2 / 5 };
}

/** Il bersaglio che cade: un barattolo di latta chiuso, appeso per il coperchio (cade lungo l'asse). */
export const CAN = { kind: 'can', r: 0.033, hh: 0.046, m: 0.12, Cd: 0.85, A: Math.PI * 0.033 ** 2, V: Math.PI * 0.033 ** 2 * 0.092, e: 0.15, mu: 0.45 };

const E_HIT = 0.35;          // restituzione nell'urto pallina–barattolo
const V_REST = 0.2;          // sotto questa velocità verticale dopo un rimbalzo la pallina rotola (rimbalzo < 2 mm)

/** Mezza estensione verticale di un oggetto ruotato di rot (per il contatto col pavimento). */
function extent(spec, rot) {
  if (spec.kind === 'ball') return spec.r;
  return spec.r * Math.abs(Math.sin(rot)) + spec.hh * Math.abs(Math.cos(rot));
}

/** Moto nel vuoto da quota h (punto più basso dell'oggetto), con velocità v0 e alzo th (rad). */
export function vacuum(h, v0, th, g) {
  const vx = v0 * Math.cos(th), vy = v0 * Math.sin(th);
  const t = (vy + Math.sqrt(Math.max(vy * vy + 2 * g * h, 0))) / g;
  const vyI = Math.sqrt(Math.max(vy * vy + 2 * g * h, 0));
  const best = Math.atan(v0 / Math.sqrt(v0 * v0 + 2 * g * h));
  return {
    vx, vy, t, range: vx * t,
    apex: h + (vy > 0 ? (vy * vy) / (2 * g) : 0), tApex: vy > 0 ? vy / g : 0, xApex: vy > 0 ? (vx * vy) / g : 0,
    vImpact: Math.sqrt(v0 * v0 + 2 * g * h), angImpact: Math.atan2(vyI, vx),
    best, rangeMax: (v0 / g) * Math.sqrt(v0 * v0 + 2 * g * h),
  };
}

/** Parabola di sicurezza: la quota più alta raggiungibile alla distanza x (qualunque alzo). */
export const envelope = (x, h, v0, g) => h + (v0 * v0) / (2 * g) - (g * x * x) / (2 * v0 * v0);

/** Alzi (rad) che nel vuoto portano a terra alla distanza D: [teso, a campanile], o [] se fuori portata. */
export function aimVacuum(h, v0, g, D) {
  if (D <= 1e-6) return [Math.PI / 2];
  const a = (g * D * D) / (2 * v0 * v0), disc = D * D - 4 * a * (a - h);
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [Math.atan((D - s) / (2 * a)), Math.atan((D + s) / (2 * a))];
}

/** Passo d'integrazione adatto a un lancio: qualche migliaio di passi sul tempo di volo nel vuoto. */
export function stepFor(h, v0, th, g, fine = 2500) {
  const T = Math.max(vacuum(Math.max(h, 0), v0, th, g).t, 0.05);
  return Math.min(Math.max(T / fine, 2e-4), 4e-3);
}

/**
 * Simula insieme più oggetti.
 * bodies: [{key, spec, x, y, vx, vy, z, w}] — tutti lasciati liberi all'istante 0 (w: rotazione iniziale, rad/s).
 * collide: urti fra il primo oggetto 'ball' e il primo 'can' con la stessa z.
 * bounce = false: l'oggetto si ferma al primo contatto col pavimento. stopAtLand: finisce al primo contatto del primo oggetto.
 * floor: quota del piano d'arrivo. walls: {x0, x1, e} sponde verticali per le palline (x0 ≤ x ≤ x1).
 * @returns tracce per oggetto: {t, x, y, vx, vy, rot, n, z, tLand, land:{x,vx,vy}, apex:{t,x,y}, tRest, hits:[{t,x,y}]}
 */
export function simulate({ g, rho, bodies, dt, tMax = 40, bounce = true, stopAtLand = false, collide = false, floor = 0, walls = null }) {
  const B = bodies.map((b) => {
    const s = b.spec;
    const st = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, rot: b.rot || 0, w: b.w || 0, mode: 'fly' };
    const o = {
      key: b.key, spec: s, z: b.z ?? 0, st,
      k: rho > 0 ? (0.5 * rho * s.Cd * s.A) / s.m : 0, gEff: g * (1 - (rho * s.V) / s.m),
      T: [], X: [], Y: [], VX: [], VY: [], R: [],
      tLand: null, land: null, apex: null, tRest: null, hits: [],
    };
    // già appoggiato al pavimento e non diretto verso l'alto: parte rotolando
    if (st.y <= floor + extent(s, st.rot) + 1e-9 && st.vy <= 0) {
      st.y = floor + extent(s, st.rot); o.tLand = 0; o.land = { x: st.x, vx: st.vx, vy: st.vy }; o.apex = { t: 0, x: st.x, y: st.y };
      if (!bounce) { st.mode = 'rest'; o.tRest = 0; } else { st.vy = 0; toGround(o, st, g); }
    }
    return o;
  });
  const ball = collide ? B.find((o) => o.spec.kind === 'ball') : null;
  const can = ball ? B.find((o) => o.spec.kind === 'can' && Math.abs(o.z - ball.z) < 1e-6) : null;

  // ── integrazione di un singolo oggetto per un tempo tau ──
  const a1 = [0, 0], a2 = [0, 0], a3 = [0, 0], a4 = [0, 0];
  const accel = (o, vx, vy, out) => { const sp = Math.hypot(vx, vy); out[0] = -o.k * sp * vx; out[1] = -o.gEff - o.k * sp * vy; };
  function adv(o, s, tau, out) {
    out.mode = s.mode; out.w = s.w;
    if (s.mode === 'fly') {
      accel(o, s.vx, s.vy, a1);
      const vx2 = s.vx + 0.5 * tau * a1[0], vy2 = s.vy + 0.5 * tau * a1[1]; accel(o, vx2, vy2, a2);
      const vx3 = s.vx + 0.5 * tau * a2[0], vy3 = s.vy + 0.5 * tau * a2[1]; accel(o, vx3, vy3, a3);
      const vx4 = s.vx + tau * a3[0], vy4 = s.vy + tau * a3[1]; accel(o, vx4, vy4, a4);
      out.x = s.x + (tau / 6) * (s.vx + 2 * vx2 + 2 * vx3 + vx4);
      out.y = s.y + (tau / 6) * (s.vy + 2 * vy2 + 2 * vy3 + vy4);
      out.vx = s.vx + (tau / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
      out.vy = s.vy + (tau / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
      out.rot = s.rot + s.w * tau;
    } else if (s.mode === 'roll' || s.mode === 'slide') {
      // decelerazione costante (attrito volvente o radente) fino a fermarsi
      const dec = (s.mode === 'roll' ? o.spec.roll : o.spec.mu) * g;
      const sp = Math.abs(s.vx), sg = Math.sign(s.vx), ts = sp / dec, tt = Math.min(tau, ts);
      out.x = s.x + sg * (sp * tt - 0.5 * dec * tt * tt);
      out.vx = tt >= ts ? 0 : sg * (sp - dec * tt);
      out.y = s.y; out.vy = 0;
      if (s.mode === 'roll') { out.w = -out.vx / o.spec.r; out.rot = s.rot - (out.x - s.x) / o.spec.r; } else out.rot = s.rot;
      if (out.vx === 0) out.mode = 'rest';
    } else { out.x = s.x; out.y = s.y; out.vx = 0; out.vy = 0; out.rot = s.rot; }
    return out;
  }
  const floorGap = (o, s) => s.y - floor - extent(o.spec, s.rot);
  // distanza dalle sponde (solo palline): positiva dentro
  const wallGap = (o, s, side) => (side ? walls.x1 - s.x - o.spec.r : s.x - o.spec.r - walls.x0);

  // ── distanza fra la pallina e il barattolo (rettangolo ruotato nel piano x–y) ──
  function contact(sb, sc) {
    const dx = sb.x - sc.x, dy = sb.y - sc.y, c = Math.cos(sc.rot), s = Math.sin(sc.rot);
    const lx = c * dx + s * dy, ly = -s * dx + c * dy;                  // nel riferimento del barattolo
    const qx = Math.min(Math.max(lx, -CAN.r), CAN.r), qy = Math.min(Math.max(ly, -CAN.hh), CAN.hh);
    let nx = lx - qx, ny = ly - qy, d = Math.hypot(nx, ny);
    if (d < 1e-12) { nx = lx; ny = ly; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L; d = 0; } else { nx /= d; ny /= d; }
    return { d: d - ball.spec.r, nx: c * nx - s * ny, ny: s * nx + c * ny, qx: c * qx - s * qy, qy: s * qx + c * qy };
  }

  // ── eventi ──
  function onFloor(o, s, t) {
    const sp = o.spec;
    if (o.tLand === null) { o.tLand = t; o.land = { x: s.x, vx: s.vx, vy: s.vy }; }
    if (!bounce) { s.mode = 'rest'; s.vx = 0; s.vy = 0; s.w = 0; s.y = floor + extent(sp, s.rot); o.tRest = t; return; }
    const vin = -s.vy;
    if (sp.kind === 'can') {
      // si appoggia sul fianco o sul fondo, quello più vicino all'orientazione dell'urto
      const q = Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2);
      s.rot = q; s.w = 0; s.y = floor + extent(sp, q);
      const vout = sp.e * vin;
      if (vout < 0.5) { s.vy = 0; s.mode = Math.abs(s.vx) > 1e-4 ? 'slide' : 'rest'; if (s.mode === 'rest') o.tRest = t; } else s.vy = vout;
      return;
    }
    // pallina: restituzione verticale; attrito nel punto di contatto finché non rotola senza strisciare
    const slip = s.vx + s.w * sp.r;
    if (Math.abs(slip) > 1e-9) {
      const dv = Math.min(sp.mu * (1 + sp.e) * vin, (Math.abs(slip) * sp.spinK) / (1 + sp.spinK));
      s.vx -= Math.sign(slip) * dv;
      s.w -= (Math.sign(slip) * dv) / (sp.spinK * sp.r);
    }
    const vout = sp.e * vin;
    s.y = floor + sp.r;
    if (vout < V_REST) { s.vy = 0; toGround(o, s, g); if (s.mode === 'rest') o.tRest = t; } else s.vy = vout;
  }
  function toGround(o, s) { s.w = -s.vx / o.spec.r; s.mode = Math.abs(s.vx) > 1e-4 ? 'roll' : 'rest'; }
  // sponda di legno: la componente orizzontale si inverte e si riduce
  function onWall(o, s, side, t) {
    s.x = side ? walls.x1 - o.spec.r : walls.x0 + o.spec.r;
    s.vx = -walls.e * s.vx;
    if (s.mode === 'roll') { s.w = -s.vx / o.spec.r; if (Math.abs(s.vx) < 1e-3) { s.mode = 'rest'; s.vx = 0; o.tRest = t; } }
  }

  function onHit(sb, sc, t, C) {
    const mb = ball.spec.m, free = sc.mode === 'fly';
    const mc = CAN.m, Ic = (CAN.m * (3 * CAN.r * CAN.r + 4 * CAN.hh * CAN.hh)) / 12;
    const rx = C.qx, ry = C.qy;                                        // dal centro del barattolo al punto di contatto
    const vcx = sc.vx - sc.w * ry, vcy = sc.vy + sc.w * rx;
    const vrel = (sb.vx - vcx) * C.nx + (sb.vy - vcy) * C.ny;
    if (vrel >= 0) return false;
    const rn = rx * C.ny - ry * C.nx;
    const J = (-(1 + E_HIT) * vrel) / (1 / mb + (free ? 1 / mc + (rn * rn) / Ic : 0));
    sb.vx += (J * C.nx) / mb; sb.vy += (J * C.ny) / mb;
    if (free) { sc.vx -= (J * C.nx) / mc; sc.vy -= (J * C.ny) / mc; sc.w -= (rn * J) / Ic; }
    ball.hits.push({ t, x: sb.x, y: sb.y, cx: sc.x, cy: sc.y });
    return true;
  }

  // ── registrazione ──
  const rec = (t) => {
    for (const o of B) { const s = o.st; o.T.push(t); o.X.push(s.x); o.Y.push(s.y); o.VX.push(s.vx); o.VY.push(s.vy); o.R.push(s.rot); }
  };
  let t = 0;
  rec(0);
  const trial = B.map(() => ({})), sub = B.map(() => ({}));
  let guard = 0;
  while (t < tMax && guard++ < 400000) {
    if (B.every((o) => o.st.mode === 'rest')) break;
    if (stopAtLand && B[0].tLand !== null) break;
    // in volo passi fini; quando tutto è a terra bastano passi da 1/120 s
    const h = B.some((o) => o.st.mode === 'fly') ? dt : Math.max(dt, 1 / 120);
    B.forEach((o, i) => adv(o, o.st, h, trial[i]));
    // il primo evento dentro il passo
    let tau = Infinity, ev = null;
    B.forEach((o, i) => {
      if (o.st.mode !== 'fly' || floorGap(o, trial[i]) > 0) return;
      let lo = 0, hi = h;
      for (let k = 0; k < 50; k++) { const m = 0.5 * (lo + hi); if (floorGap(o, adv(o, o.st, m, sub[i])) > 0) lo = m; else hi = m; }
      if (hi < tau) { tau = hi; ev = { type: 'floor', o }; }
    });
    if (walls) {
      B.forEach((o, i) => {
        if (o.spec.kind !== 'ball' || o.st.mode === 'rest') return;
        for (const side of [0, 1]) {
          if (wallGap(o, trial[i], side) >= 0 || wallGap(o, o.st, side) < -1e-9) continue;
          let lo = 0, hi = h;
          for (let k = 0; k < 50; k++) { const m = 0.5 * (lo + hi); if (wallGap(o, adv(o, o.st, m, sub[i]), side) > 0) lo = m; else hi = m; }
          if (hi < tau) { tau = hi; ev = { type: 'wall', o, side }; }
        }
      });
    }
    if (can) {
      const ib = B.indexOf(ball), ic = B.indexOf(can);
      if (contact(trial[ib], trial[ic]).d < 0 && contact(ball.st, can.st).d >= -1e-9) {
        let lo = 0, hi = h;
        for (let k = 0; k < 50; k++) { const m = 0.5 * (lo + hi); if (contact(adv(ball, ball.st, m, sub[ib]), adv(can, can.st, m, sub[ic])).d > 0) lo = m; else hi = m; }
        if (hi < tau) { tau = hi; ev = { type: 'hit' }; }
      }
    }
    if (ev) {
      B.forEach((o, i) => Object.assign(o.st, adv(o, o.st, tau, sub[i])));
      t += tau;
      if (ev.type === 'floor') onFloor(ev.o, ev.o.st, t);
      else if (ev.type === 'wall') onWall(ev.o, ev.o.st, ev.side, t);
      else onHit(ball.st, can.st, t, contact(ball.st, can.st));
    } else {
      B.forEach((o, i) => {
        const s = o.st, n = trial[i];
        // quota massima: dove la velocità verticale cambia segno (prima del primo contatto)
        if (o.apex === null && o.tLand === null && s.mode === 'fly' && s.vy > 0 && n.vy <= 0) {
          const f = s.vy / (s.vy - n.vy);
          o.apex = { t: t + f * h, x: s.x + f * (n.x - s.x), y: s.y + 0.5 * s.vy * f * h };
        }
        Object.assign(s, n);
        if (s.mode === 'rest' && o.tRest === null) o.tRest = t + h;
      });
      t += h;
    }
    rec(t);
  }
  return B.map((o) => {
    const n = o.T.length;
    if (o.apex === null) o.apex = { t: 0, x: o.X[0], y: o.Y[0] };
    return {
      key: o.key, spec: o.spec, z: o.z, n,
      t: Float64Array.from(o.T), x: Float64Array.from(o.X), y: Float64Array.from(o.Y), vx: Float64Array.from(o.VX), vy: Float64Array.from(o.VY), rot: Float64Array.from(o.R),
      tLand: o.tLand, land: o.land, apex: o.apex, tRest: o.tRest ?? o.T[n - 1], hits: o.hits, gEff: o.gEff,
    };
  });
}

/** Stato interpolato all'istante t (fermo agli estremi). */
export function sampleAt(r, t, out) {
  const last = r.n - 1;
  if (t <= r.t[0]) { out.x = r.x[0]; out.y = r.y[0]; out.vx = r.vx[0]; out.vy = r.vy[0]; out.rot = r.rot[0]; out.i = 0; return out; }
  if (t >= r.t[last]) { out.x = r.x[last]; out.y = r.y[last]; out.vx = r.vx[last]; out.vy = r.vy[last]; out.rot = r.rot[last]; out.i = last; return out; }
  let lo = 0, hi = last;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.t[m] <= t) lo = m; else hi = m; }
  const dt = r.t[hi] - r.t[lo], f = dt > 0 ? (t - r.t[lo]) / dt : 0;
  out.x = r.x[lo] + (r.x[hi] - r.x[lo]) * f; out.y = r.y[lo] + (r.y[hi] - r.y[lo]) * f;
  out.vx = r.vx[lo] + (r.vx[hi] - r.vx[lo]) * f; out.vy = r.vy[lo] + (r.vy[hi] - r.vy[lo]) * f;
  out.rot = r.rot[lo] + (r.rot[hi] - r.rot[lo]) * f; out.i = lo;
  return out;
}

/** Solo il volo fino al primo contatto col pavimento (per le previsioni e la mira). base: quota del piano d'arrivo. */
export function flight(spec, env, h, v0, th, fine = 2500, base = 0) {
  const dt = stepFor(h, v0, th, env.g, fine);
  return simulate({ g: env.g, rho: env.rho, dt, bounce: false, stopAtLand: true, floor: base, bodies: [{ key: 'p', spec, x: 0, y: base + h + spec.r, vx: v0 * Math.cos(th), vy: v0 * Math.sin(th) }] })[0];
}

/**
 * Alzi (rad) che portano la pallina a toccare terra alla distanza D, con l'aria se c'è.
 * Nel vuoto la soluzione è esatta; con l'aria si cercano i cambi di segno di gittata(θ) − D e si
 * affinano per bisezione. Restituisce [teso, a campanile] (uno solo se coincidono), o [] se fuori portata.
 */
export function aimAngles(spec, env, h, v0, D) {
  if (!(env.rho > 0)) return aimVacuum(h, v0, env.g, D);
  const R = (th) => flight(spec, env, h, v0, th, 900).land.x - D;
  const DEG = Math.PI / 180, out = [];
  let a0 = (h > 0.005 ? -45 : 0) * DEG, f0 = R(a0);
  for (let d = (h > 0.005 ? -43 : 2); d <= 89; d += 2) {
    const a1 = d * DEG, f1 = R(a1);
    if ((f0 <= 0) !== (f1 <= 0)) {
      let lo = a0, hi = a1, flo = f0;
      for (let k = 0; k < 24; k++) { const m = 0.5 * (lo + hi), fm = R(m); if ((fm <= 0) === (flo <= 0)) { lo = m; flo = fm; } else hi = m; }
      out.push(0.5 * (lo + hi));
    }
    a0 = a1; f0 = f1;
  }
  return out.length > 2 ? [out[0], out[out.length - 1]] : out;
}

// ───────────────────────────── il piano di Galileo ─────────────────────────────
/**
 * L'apparato in legno del Museo Galileo (XVIII secolo): una rampa curva con una scanalatura lancia la
 * pallina in orizzontale davanti a una tavola su cui è tracciata la parabola. Coordinate del mondo: la
 * pallina esce in x = 0 e atterra sulla base, a quota `floor`. Il bordo della scanalatura è un quarto
 * d'ellisse, E(φ) = (−a·sin φ, yE + b·(1 − cos φ)), orizzontale all'uscita e quasi verticale in cima.
 * Le proporzioni seguono il foglio 116v di Galileo (1608): bordo a 0,828 dell'altezza di partenza massima.
 */
export const GAL = {
  floor: 0.056,              // piano della base, dove la pallina atterra
  yE: 0.356,                 // spigoli della scanalatura all'uscita
  a: 0.30, b: 0.43, phiMax: (84 * Math.PI) / 180,
  groove: 0.012,             // larghezza della scanalatura: la pallina poggia sui due spigoli
  crr: 0.0015,               // attrito volvente di una sfera dura nel legno lucidato
  wall0: 0, wall1: 0.78,     // faccia della rampa e sponda della cassetta in fondo
  eWall: 0.5,
  Hmin: 0.02, Hmax: 0.36,
  board: 0.62,               // lunghezza della tavola con la parabola
};
/** Foglio 116v: altezze di partenza e distanze misurate da Galileo, in punti (1 punto ≈ 0,94 mm); tavolo alto 828 punti. */
export const F116V = { table: 828, rows: [[300, 800], [600, 1172], [800, 1328], [828, 1340], [1000, 1500]] };

/** Raggio di rotolamento nella scanalatura: la distanza del centro dalla retta dei due spigoli. */
export const rollRadius = (r) => Math.sqrt(r * r - (GAL.groove / 2) ** 2);

const pathCache = new Map();
/**
 * Percorso del CENTRO della pallina sulla rampa (curva parallela al bordo, a distanza ρ), tabulato
 * dall'uscita (i = 0) alla cima: x, y, ascissa curvilinea s, inclinazione ang, curvatura kap.
 */
export function rampPath(rho) {
  const key = rho.toFixed(7);
  if (pathCache.has(key)) return pathCache.get(key);
  const { a, b, yE, phiMax } = GAL, N = 2000;
  const P = { n: N + 1, x: new Float64Array(N + 1), y: new Float64Array(N + 1), s: new Float64Array(N + 1), ang: new Float64Array(N + 1), kap: new Float64Array(N + 1), ex: new Float64Array(N + 1), ey: new Float64Array(N + 1), nx: new Float64Array(N + 1), ny: new Float64Array(N + 1) };
  for (let i = 0; i <= N; i++) {
    const p = (phiMax * i) / N, tx = -a * Math.cos(p), ty = b * Math.sin(p), L = Math.hypot(tx, ty);
    const nx = ty / L, ny = -tx / L;                       // normale verso il lato concavo
    P.ex[i] = -a * Math.sin(p); P.ey[i] = yE + b * (1 - Math.cos(p)); P.nx[i] = nx; P.ny[i] = ny;
    P.x[i] = P.ex[i] + rho * nx; P.y[i] = P.ey[i] + rho * ny;
    P.ang[i] = Math.atan2(ty, -tx);                        // inclinazione sull'orizzontale
    if (i) P.s[i] = P.s[i - 1] + Math.hypot(P.x[i] - P.x[i - 1], P.y[i] - P.y[i - 1]);
  }
  for (let i = 0; i <= N; i++) {
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, N);
    P.kap[i] = (P.ang[i1] - P.ang[i0]) / (P.s[i1] - P.s[i0]);
  }
  pathCache.set(key, P);
  return P;
}

/** Punto del percorso all'ascissa s (interpolato). */
export function rampAt(P, s, out = {}) {
  let lo = 0, hi = P.n - 1;
  if (s <= 0) hi = 1; else if (s >= P.s[hi]) lo = hi - 1;
  else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.s[m] <= s) lo = m; else hi = m; }
  const f = Math.min(Math.max((s - P.s[lo]) / (P.s[hi] - P.s[lo]), 0), 1);
  for (const k of ['x', 'y', 'ang', 'kap', 'ex', 'ey', 'nx', 'ny']) out[k] = P[k][lo] + (P[k][hi] - P[k][lo]) * f;
  out.s = s;
  return out;
}

/** Ascissa s alla quale il centro sta H più in alto che all'uscita. */
export function rampS(P, H) {
  const y = P.y[0] + H;
  let lo = 0, hi = P.n - 1;
  if (y >= P.y[hi]) return P.s[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.y[m] <= y) lo = m; else hi = m; }
  return P.s[lo] + ((y - P.y[lo]) / (P.y[hi] - P.y[lo])) * (P.s[hi] - P.s[lo]);
}

/**
 * La discesa sulla rampa, da ferma, partendo con il centro H più in alto che all'uscita.
 * La pallina rotola senza strisciare sui due spigoli: ω = v/ρ, quindi l'inerzia vale m·(1 + k) con
 * k = I/(m·ρ²) = spinK·(r/ρ)². Agiscono peso e spinta di Archimede, resistenza dell'aria e attrito volvente
 * (proporzionale alla forza normale, che sulla curva comprende la parte centripeta). Runge–Kutta 4.
 * @returns {v, T, k, rho, y0, s0, track:{n, t (da −T a 0), x, y, vx, vy, rot}}
 */
export function rampRun(spec, env, H) {
  const rho = rollRadius(spec.r), P = rampPath(rho), k = spec.spinK * (spec.r / rho) ** 2;
  const gEff = env.g * (1 - ((env.rho || 0) * spec.V) / spec.m), kd = env.rho > 0 ? (0.5 * env.rho * spec.Cd * spec.A) / spec.m : 0;
  const s0 = rampS(P, H), q = {};
  const acc = (s, v) => {
    rampAt(P, s, q);
    return (gEff * Math.sin(q.ang) - kd * v * v - GAL.crr * (gEff * Math.cos(q.ang) + q.kap * v * v) * Math.sign(v)) / (1 + k);
  };
  const dt = 2e-4 * Math.min(Math.sqrt(9.81 / env.g), 4);
  const T = [0], X = [], Y = [], VX = [], VY = [], R = [];
  const push = (s, v) => { rampAt(P, s, q); X.push(q.x); Y.push(q.y); VX.push(v * Math.cos(q.ang)); VY.push(-v * Math.sin(q.ang)); R.push(-(s0 - s) / rho); };
  let s = s0, v = 0, t = 0;
  push(s, v);
  for (let it = 0; it < 400000; it++) {
    // ds/dt = −v (si scende verso l'uscita), dv/dt = a(s, v)
    const a1 = acc(s, v), s2 = s - 0.5 * dt * v, v2 = v + 0.5 * dt * a1;
    const a2 = acc(s2, v2), s3 = s - 0.5 * dt * v2, v3 = v + 0.5 * dt * a2;
    const a3 = acc(s3, v3), s4 = s - dt * v3, v4 = v + dt * a3;
    const a4 = acc(s4, v4);
    const sn = s - (dt / 6) * (v + 2 * v2 + 2 * v3 + v4), vn = v + (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    if (sn <= 0) {
      const f = s / (s - sn);
      t += f * dt; v += f * (vn - v); s = 0;
      T.push(t); push(0, v);
      break;
    }
    s = sn; v = vn; t += dt;
    if (it % 4 === 3) { T.push(t); push(s, v); }
  }
  const n = T.length;
  return {
    v, T: t, k, rho, y0: P.y[0], s0,
    track: { n, t: Float64Array.from(T, (x) => x - t), x: Float64Array.from(X), y: Float64Array.from(Y), vx: Float64Array.from(VX), vy: Float64Array.from(VY), rot: Float64Array.from(R) },
  };
}
