// scenes.js — le due scene nel piano del fascio (coordinate in metri: x verso destra, y in alto).
// La vasca: un acquario di vetro su un sollevatore, con l'acqua (o un altro liquido), a scelta uno strato d'olio,
// e per la fontana luminosa un foro nella parete di destra da cui esce un getto. Il disco ottico di Hartl: un disco
// graduato verticale con un mezzo cilindro di materiale trasparente al centro e il laser sul bordo.
import { Scene, nOf } from './optics.js';

const DEG = Math.PI / 180;
// ── la vasca ──
export const TANK = { X0: 0.2, G: 0.006, PLAT: 0.2, H: 0.26, Z: 0.08, OIL: 0.025, HOLE: 0.03, HOLE_R: 0.0035, BASIN_TOP: 0.07 };
export const tankY0 = () => TANK.PLAT + TANK.G;                       // fondo interno
const TARGET = 0.12;                                                   // dal fianco: il fascio arriva in superficie a 12 cm dalla parete
// ── il disco ──
export const DISC = { YC: 0.33, R: 0.2, RB: 0.08, T: 0.02 };

/** Il getto della fontana: linea d'asse e raggio, dalla parete al catino (legge di Torricelli). */
export function jetPath(level) {
  const { X0, G, HOLE, HOLE_R, BASIN_TOP } = TANK, g = 9.81;
  const y0 = tankY0() + HOLE, v0 = Math.sqrt(2 * g * Math.max(0.005, level - HOLE));
  const tEnd = Math.sqrt((2 * (y0 - BASIN_TOP)) / g), pts = [];
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const t = (tEnd * i) / N, vy = -g * t, sp = Math.hypot(v0, vy);
    const r = HOLE_R * 0.82 * Math.sqrt(v0 / sp);                       // vena contratta, poi si assottiglia accelerando
    pts.push({ x: X0 + G + v0 * t, y: y0 - 0.5 * g * t * t, tx: v0 / sp, ty: vy / sp, r });
  }
  return { pts, v0, y0 };
}

/**
 * La vasca. p: { level (m sopra il fondo), liquid, oil (bool), mode: 'top' | 'side' | 'fountain', angle (°) }
 * @returns {{ scene, o, d, laser: {x, y, dx, dy}, mainTags, focus: [x, y], jet }}
 */
export function tankScene(p) {
  const { X0, G, PLAT, H, OIL, HOLE, HOLE_R, BASIN_TOP } = TANK, Y0 = tankY0(), ys = Y0 + p.level;
  const S = new Scene('air');
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // vetro: fondo e pareti
  S.add({ id: 'bottom', medium: 'crown', shape: { poly: rect(-X0 - G, PLAT, X0 + G, Y0) }, scatter: 0.25 }, 'glass');
  S.add({ id: 'wallL', medium: 'crown', shape: { poly: rect(-X0 - G, PLAT, -X0, PLAT + H) }, scatter: 0.25 }, 'wall');
  S.add({ id: 'wallR', medium: 'crown', shape: { poly: rect(X0, PLAT, X0 + G, PLAT + H) }, scatter: 0.25 }, 'wall');
  // il liquido (e l'olio, più leggero, sopra)
  S.add({ id: 'liquid', medium: p.liquid, shape: { poly: rect(-X0, Y0, X0, ys) }, scatter: 1, prio: 10 }, ['wbottom', 'wright', 'surface', 'wleft']);
  if (p.oil) S.add({ id: 'oil', medium: 'oil', shape: { poly: rect(-X0, ys - OIL, X0, ys) }, scatter: 0.7, prio: 11 }, ['oilwater', 'wright', 'surface', 'wleft']);
  let jet = null;
  if (p.mode === 'fountain') {
    jet = jetPath(p.level);
    // il getto attraversa il foro della parete e scende fino al catino
    const up = [], dn = [];
    const yh = Y0 + HOLE;
    up.push([X0 - 0.001, yh + HOLE_R]); dn.push([X0 - 0.001, yh - HOLE_R]);
    up.push([X0 + G, yh + HOLE_R]); dn.push([X0 + G, yh - HOLE_R]);
    for (const q of jet.pts) { up.push([q.x - q.ty * q.r, q.y + q.tx * q.r]); dn.push([q.x + q.ty * q.r, q.y - q.tx * q.r]); }
    S.add({ id: 'jet', medium: p.liquid, shape: { poly: up.concat(dn.reverse()) }, scatter: 1, prio: 12 }, 'jet');
    const end = jet.pts[jet.pts.length - 1];
    S.stop([end.x - 0.06, BASIN_TOP - 0.0005], [end.x + 0.06, BASIN_TOP - 0.0005], true, 'basin');
  }
  // dove il fascio si ferma: il piano del sollevatore sotto la vasca, il pavimento
  S.stop([-X0 - G, PLAT - 0.0002], [X0 + G, PLAT - 0.0002], true, 'plate');
  S.stop([-3, 0], [3, 0], true, 'floor');
  // la sorgente
  let o, d, mainTags;
  if (p.mode === 'top') {
    const th = p.angle * DEG, P = [-0.03, ys];
    d = [Math.sin(th), -Math.cos(th)];
    o = [P[0] - d[0] * 0.16, P[1] - d[1] * 0.16];
    mainTags = ['surface'];
  } else {
    // dal fianco: il laser, inclinato di α, entra dalla parete a un'altezza tale da incontrare la superficie
    // sempre nello stesso punto, a TARGET dalla parete (come farebbe chi lo punta)
    const al = p.mode === 'fountain' ? 0 : p.angle * DEG;
    let yE = Y0 + HOLE;
    if (p.mode === 'side') {
      const nl = nOf(p.oil ? 'water' : p.liquid, 589), beta = Math.asin(Math.min(0.999, Math.sin(al) / nl));
      yE = Math.max(Y0 + 0.008, ys - (p.oil ? OIL : 0) - TARGET * Math.tan(beta));
    }
    const E = [-X0 - G, yE];
    d = [Math.cos(al), Math.sin(al)];
    o = [E[0] - d[0] * 0.06, E[1] - d[1] * 0.06];
    mainTags = p.mode === 'fountain' ? ['jet'] : ['surface', 'oilwater'];
  }
  return { scene: S, o, d, laser: { x: o[0], y: o[1], dx: d[0], dy: d[1] }, mainTags, surfaceY: ys, jet };
}

/**
 * Il disco ottico. p: { block (mezzo), side: 'flat' | 'curved', angle (°, con segno: positivo da sinistra) }
 */
export function discScene(p) {
  const { YC, R, RB } = DISC, S = new Scene('air');
  S.add({ id: 'block', medium: p.block, shape: { d: { cx: 0, cy: YC, R: RB, ux: 0, uy: -1 } }, scatter: 0.75 }, ['flat', 'curve']);
  S.stopCircle([0, YC], R - 0.012, true, 'rim');
  const th = p.angle * DEG, RL = R - 0.035;
  const o = p.side === 'flat' ? [-RL * Math.sin(th), YC + RL * Math.cos(th)] : [-RL * Math.sin(th), YC - RL * Math.cos(th)];
  const d = [(0 - o[0]) / RL, (YC - o[1]) / RL];
  return { scene: S, o, d, laser: { x: o[0], y: o[1], dx: d[0], dy: d[1] }, mainTags: ['flat'] };
}
