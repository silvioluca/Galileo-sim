// main.js — Il moto parabolico
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { PLANETS, BALLS, CAN, GAL, F116V, ballSpec, vacuum, envelope, aimAngles, simulate, flight, stepFor, sampleAt, rampRun, rampPath, rollRadius } from './proj.js';
import { Rig, PIT, TWIN_Z, TAPE_Z, ROD, STAND_Z } from './rig.js';
import { GAL_BASE, GAL_RAMP } from './galileo.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const VEC = { v: '#0c9d8f', vx: '#2c67dc', vy: '#7a47cf', g: '#e07b1f' };
const MAX_SHOTS = 8;
const GH = 300;                                  // immagini stroboscopiche al massimo, per oggetto

const state = {
  app: 'spring', Hr: GAL.Hmax,
  v0: 5, angle: 30, h: 1, ball: 'steel', twin: false, bounce: true,
  target: 'none', D: 3, H: 1.6,
  planet: 'earth', air: true, slow: 1,
  trail: true, keep: true, strobe: false, strobeHz: 10, vVec: true, comps: false, gVec: false, proj: false,
  predict: false, vacuumRef: false, env: false, outline: false, labels: true, quality: 'low', plotKind: 'xy',
};
const BASE = { app: 'spring', Hr: GAL.Hmax, v0: 5, angle: 30, h: 1, ball: 'steel', twin: false, bounce: true, target: 'none', planet: 'earth', air: true, strobe: false, strobeHz: 10, vVec: true, comps: false, gVec: false, proj: false, predict: false, vacuumRef: false, env: false, keep: true, plotKind: 'xy' };
const r3 = (v) => Math.round(v * 1000) / 1000;
// [id, testo, descrizione, impostazioni, {seq: lanci in sequenza (ognuno può cambiare le impostazioni o mirare), view}]
const PRESETS = [
  ['horizontal', 'Lancio orizzontale', 'Moto uniforme in orizzontale, caduta libera in verticale', { h: 1.2, angle: 0, v0: 3, strobe: true, strobeHz: 10, proj: true, comps: true, plotKind: 'xt' }, { seq: [{}], view: 'side' }],
  ['together', 'Caduta e lancio insieme', 'Una pallina lanciata e una lasciata cadere: arrivano insieme', { h: 1.2, angle: 0, v0: 2.5, twin: true, strobe: true, strobeHz: 10, air: false }, { seq: [{}], view: 'side' }],
  ['fan', 'Alzo e gittata: 45°', 'Da terra, la stessa velocità con cinque alzi diversi', { h: 0, v0: 6, air: false }, { seq: [15, 30, 45, 60, 75].map((a) => ({ angle: a })), view: 'side' }],
  ['complementary', 'Alzi complementari', '30° e 60° arrivano nello stesso punto', { h: 0, v0: 5, air: false, strobe: true, strobeHz: 10 }, { seq: [{ angle: 30 }, { angle: 60 }], view: 'side' }],
  ['envelope', 'La parabola di sicurezza', 'Ogni traiettoria la tocca in un punto', { h: 1, v0: 5, air: false, env: true }, { seq: [0, 15, 30, 45, 60, 75].map((a) => ({ angle: a })), view: 'side' }],
  ['air', 'Ping-pong: l\'aria accorcia', 'Con l\'aria la parabola si chiude e l\'alzo migliore scende sotto i 45°', { h: 0, v0: 12, ball: 'pingpong', air: true, vacuumRef: true }, { seq: [{ angle: 45 }, { angle: 35 }, { angle: 25 }], view: 'side' }],
  ['target', 'Centra il bersaglio', 'Due alzi per lo stesso punto: tiro teso e tiro a campanile', { h: 0.8, v0: 5, target: 'floor', D: 3.2 }, { seq: [{ aim: 'low' }, { aim: 'high' }], view: 'overview' }],
  ['hunter', 'Il cacciatore e la scimmia', 'Mira dritto al barattolo che cade: lo colpisce a qualunque velocità', { h: 0.4, target: 'drop', D: 3, H: 1.6, v0: 8, strobe: true, strobeHz: 20, air: false }, { seq: [{ v0: 8, aim: 'can' }, { v0: 6.2, aim: 'can' }], view: 'side' }],
  ['moon', 'Sulla Terra e sulla Luna', 'Lo stesso lancio, con un sesto della gravità', { h: 0, v0: 4, angle: 45 }, { seq: [{ planet: 'earth' }, { planet: 'moon' }], view: 'side' }],
  ['f116v', 'Galileo, foglio 116v', 'Il piano di Galileo con le cinque partenze del 1608 (300, 600, 800, 828, 1000 punti): la distanza cresce come √H', { app: 'galileo', ball: 'steel', bounce: false, plotKind: 'g116' }, { seq: F116V.rows.map(([p]) => ({ Hr: r3((p / 1000) * GAL.Hmax) })), view: 'side' }],
  ['galmoon', 'Il piano di Galileo sulla Luna', 'Dalla stessa altezza la pallina arriva nello stesso punto: sulla Luna ci mette più tempo', { app: 'galileo', ball: 'steel', Hr: GAL.Hmax, bounce: false, strobe: true, strobeHz: 20 }, { seq: [{ planet: 'earth' }, { planet: 'moon' }], view: 'side' }],
];
const VIEWS = [['overview', 'Panoramica'], ['side', 'Di lato'], ['launcher', 'Partenza'], ['landing', 'Arrivo'], ['follow', 'Segui la pallina']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-3.2, 7.5, 4.8], keyTarget: [1, 0, 0], shadowBox: [-4, 4, 4, -4], shadowFar: 24, fog: [16, 160] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.setFloorHole(PIT.x0, PIT.z0, PIT.x1, PIT.z1);
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── linee, vettori, immagini stroboscopiche ─────────────────────────
  const mkLine = (cap, width, opacity, dashed) => {
    const buf = new SegBuffer(cap);
    const mat = new LineMaterial({ vertexColors: true, linewidth: width, transparent: true, opacity, depthWrite: false, dashed: !!dashed, dashSize: 0.05, gapSize: 0.035 });
    const line = new LineSegments2(buf.geometry(), mat);
    line.frustumCulled = false; line.userData.noAO = true; line.renderOrder = 5;
    scene.add(line);
    return { buf, line, mat };
  };
  const curves = { pred: mkLine(700, 1.6, 0.75, true), vac: mkLine(400, 1.6, 0.8, true), env: mkLine(400, 2, 0.9, true) };
  const guides = mkLine(16, 1.3, 0.7, true);
  const apexLine = mkLine(2, 1.3, 0.7, true);

  const arrows = {};
  for (const [n, c] of Object.entries(VEC)) {
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, c, 0.035, 0.022);
    a.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 7; });
    a.visible = false;
    scene.add(a);
    arrows[n] = a;
  }

  // immagini stroboscopiche: semitrasparenti, del colore del lancio
  const ghostMat = () => new THREE.MeshStandardMaterial({ color: '#e8452c', roughness: 0.45, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false });
  const mkInst = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, GH); m.count = 0; m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 4; scene.add(m); return m; };
  const ghosts = {
    ball: mkInst(rig.ballGeometry(0.0127), ghostMat()),
    twin: mkInst(rig.ballGeometry(0.0127), ghostMat()),
    can: mkInst(rig.canGhostGeo, new THREE.MeshStandardMaterial({ color: '#c8281e', transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.5 })),
    // segni delle proiezioni: tacche trasversali sul metro e sull'asta
    tape: mkInst(new THREE.PlaneGeometry(0.011, 0.06).rotateX(-Math.PI / 2),new THREE.MeshBasicMaterial({ color: '#e8452c', transparent: true, opacity: 0.9, depthWrite: false })),
    rod: mkInst(new THREE.PlaneGeometry(0.06, 0.007), new THREE.MeshBasicMaterial({ color: '#e8452c', transparent: true, opacity: 0.9, depthWrite: false })),
  };
  const dot = (geo) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#e8452c', depthWrite: false })); m.userData.noAO = true; m.renderOrder = 6; m.visible = false; scene.add(m); return m; };
  const tapeDot = dot(new THREE.RingGeometry(0.008, 0.014, 32).rotateX(-Math.PI / 2));
  const rodDot = dot(new THREE.RingGeometry(0.008, 0.014, 32));

  // ───────────────────────── stato ─────────────────────────
  let shots = [], shotId = 0, colorI = 0, clock = 0, lastFireReal = -10, reloadAt = 0, reloadSim = 0, seq = null, paused = false;
  let pred = null, vac = null, dirty = true, aimAt = 0, aimSol = null, worldS = 0;
  let barrelAngle = state.angle, canShot = null, view = 'overview', pendingView = null, drag = null;
  let fpsEma = 60, hudTimer = 0, plotAt = 0;
  const tmp = {}, tmp2 = {}, dummy = new THREE.Object3D(), v3 = new THREE.Vector3();
  const fxPool = [];

  const env = () => { const P = PLANETS[state.planet]; return { g: P.g, rho: state.air ? P.rho : 0 }; };
  const spec = () => ballSpec(state.ball);
  const gal = () => state.app === 'galileo';
  const tgt = () => (gal() ? 'none' : state.target);            // sul piano di Galileo non ci sono bersagli
  const projOn = () => state.proj && !gal();
  const envOn = () => state.env && !gal();
  const twinOn = () => state.twin && state.h >= 0.005 && !gal();

  // ───────────────────────── parametri del lancio: dal lanciatore o dalla rampa di Galileo ─────────────────────────
  const rampCache = new Map();
  function rampFor(ball, planet, air, Hr) {
    const P = PLANETS[planet], E = { g: P.g, rho: air ? P.rho : 0 }, key = `${ball}|${planet}|${E.rho}|${Hr}`;
    let R = rampCache.get(key);
    if (!R) { if (rampCache.size > 80) rampCache.clear(); R = rampRun(ballSpec(ball), E, Hr); rampCache.set(key, R); }
    return R;
  }
  /** h e v0 del volo, alzo, quota del piano d'arrivo (base) e del centro alla partenza (P). */
  function launchOf(st) {
    const r = ballSpec(st.ball).r;
    if (st.app !== 'galileo') return { gal: false, h: st.h, v0: st.v0, v0vac: st.v0, angle: st.angle, base: 0, P: st.h + r };
    const R = rampFor(st.ball, st.planet, st.air, st.Hr), Rv = st.air && PLANETS[st.planet].rho > 0 ? rampFor(st.ball, st.planet, false, st.Hr) : R;
    return { gal: true, h: R.y0 - r - GAL.floor, v0: R.v, v0vac: Rv.v, angle: 0, base: GAL.floor, P: R.y0, ramp: R };
  }
  let lp = launchOf(state);

  // ───────────────────────── previsione, curve, misure ─────────────────────────
  function resolve() {
    const sp = spec(), E = env();
    if (!gal() && state.h < 0.005 && state.angle < 0) { state.angle = 0; ui.refresh('angle'); }
    lp = launchOf(state);
    pred = flight(sp, E, lp.h, lp.v0, lp.angle * DEG, 2500, lp.base);
    vac = vacuum(lp.h, lp.v0vac, lp.angle * DEG, E.g);
    rig.setApparatus(lp.gal);
    if (lp.gal) stage.setFloorHole(0, 0, 0, 0); else stage.setFloorHole(PIT.x0, PIT.z0, PIT.x1, PIT.z1);
    rig.setBallKind(state.ball, sp.r);
    if (lp.gal) rig.gal.setRelease(state.Hr);
    rig.setTwin(twinOn());
    if (reloadAt || reloadSim) { rig.twinLoaded.visible = false; if (rig.gal) rig.gal.loaded.visible = false; }
    rig.setTarget(tgt(), state.D, state.H);
    if (!canShot) rig.placeCan(state.D, state.H, 0, 0);
    rig.setTape(lp.gal ? 2 : Math.max(maxX(), 2));
    rig.setRod(projOn(), Math.max(pred.apex.y, lp.P, ...shots.map((s) => s.ball.apex.y)) + 0.35);
    fitWorld();
    drawCurves();
    metrics();
    const P = PLANETS[state.planet];
    ui.setPlanetNote(`<b>g = ${fmt.num(P.g, 2)} m/s²</b> · ${P.rho > 0 ? `aria ${fmt.num(P.rho, P.rho < 1 ? 3 : 1)} kg/m³` : 'nessuna aria'} · ${P.note}`);
    if (lp.gal) ui.setAppNote(`Il bordo della rampa è a <b>h = ${fmt.m(lp.h)}</b> dalla base; la pallina esce in orizzontale a <b>${fmt.ms(lp.v0)}</b>.`);
    stage.setPalette(P.sky[0], P.sky[1], P.floor);
    aimAt = performance.now() + 140;           // i pulsanti di mira si ricalcolano poco dopo l'ultima modifica
    ui.sync();
  }

  function maxX() {
    let x = Math.max(pred.land.x, 0.5);
    if (state.vacuumRef) x = Math.max(x, vac.range);
    if (envOn()) x = Math.max(x, vac.rangeMax);
    if (tgt() !== 'none') x = Math.max(x, state.D + 0.3);
    for (const s of shots) x = Math.max(x, s.ball.land.x, s.ball.x[s.ball.n - 1]);
    return x;
  }

  function fillCurve(C, pts, color, show) {
    const c = new THREE.Color(color);
    C.buf.reset();
    if (show) {
      let d = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        C.buf.push(a[0], a[1], 0, b[0], b[1], 0, c, d, d + L);
        d += L;
      }
    }
    C.buf.commit();
  }
  function drawCurves() {
    const r = spec().r, E = env(), P = lp.P;
    const pts = [];
    const step = Math.max(1, Math.floor(pred.n / 600));
    for (let i = 0; i < pred.n; i += step) pts.push([pred.x[i], pred.y[i]]);
    pts.push([pred.x[pred.n - 1], pred.y[pred.n - 1]]);
    fillCurve(curves.pred, pts, '#15181c', state.predict);
    const vp = [];
    for (let i = 0; i <= 200; i++) { const t = (vac.t * i) / 200; vp.push([vac.vx * t, P + vac.vy * t - 0.5 * E.g * t * t]); }
    fillCurve(curves.vac, vp, '#6b7380', state.vacuumRef);
    const ep = [];
    for (let i = 0; i <= 200; i++) { const x = (vac.rangeMax * i) / 200; ep.push([x, envelope(x, lp.h, lp.v0, E.g) + r + lp.base]); }
    fillCurve(curves.env, ep, VEC.g, envOn());
  }

  const unit = (txt) => txt.replace(/ (m|cm|s|m\/s)$/, ' <small>$1</small>');
  function metrics() {
    const P = PLANETS[state.planet], E = env(), r = spec().r, air = E.rho > 0;
    if (lp.gal) {
      const R = lp.ramp, H = state.Hr;
      ui.setMetrics([
        { k: 'Distanza', v: unit(fmt.m(pred.land.x)), s: air ? `nel vuoto ${fmt.m(vac.range)}` : 'd = 2·√(h·H / (1+k))', title: 'Dal bordo della rampa al primo contatto con la base' },
        { k: 'Tempo di volo', v: unit(fmt.s(pred.tLand)), s: air ? `nel vuoto ${fmt.s(vac.t)}` : 't = √(2h / g)' },
        { k: 'Uscita', v: unit(fmt.ms(lp.v0)), s: `√(2gH) = ${fmt.ms(Math.sqrt(2 * E.g * H))}`, title: 'Velocità al bordo: v = √(2gH / (1+k)). Una pallina che strisciasse senza attrito uscirebbe a √(2gH)' },
        { k: 'Discesa', p: 2, v: unit(fmt.s(R.T)), s: 'da ferma al bordo' },
        { k: 'Rotolamento', p: 2, v: `1 + k = ${fmt.num(1 + R.k, 3)}`, s: `ρ ${fmt.num(R.rho * 1000, 1)} · r ${fmt.num(r * 1000, 1)} mm`, title: 'k = I/(m·ρ²): nella scanalatura la pallina rotola sui due spigoli, con un raggio ρ minore del suo' },
        { k: 'Altezze', p: 3, v: `${fmt.num(H * 100, 1)} · ${fmt.num(lp.h * 100, 1)} <small>cm</small>`, s: 'partenza H · bordo h' },
        { k: 'd / √H', p: 3, v: `${fmt.num(pred.land.x / Math.sqrt(H), 3)} <small>√m</small>`, s: 'costante: d cresce come √H', title: 'La legge del foglio 116v di Galileo (1608)' },
      ]);
      return;
    }
    const vI = Math.hypot(pred.land.vx, pred.land.vy), aI = Math.atan2(-pred.land.vy, pred.land.vx) / DEG;
    const ground = state.h < 0.005;
    ui.setMetrics([
      { k: 'Gittata', v: unit(fmt.m(pred.land.x)), s: air ? `nel vuoto ${fmt.m(vac.range)}` : ground ? 'R = v₀²·sin 2θ / g' : 'x = vₓ · t', title: 'Distanza orizzontale dal punto di lancio al primo contatto con il pavimento' },
      { k: 'Tempo di volo', v: unit(fmt.s(pred.tLand)), s: air ? `nel vuoto ${fmt.s(vac.t)}` : ground ? 't = 2·v_y / g' : 'h + v_y·t − ½·g·t² = 0' },
      { k: 'Quota massima', v: unit(fmt.m(pred.apex.y - r)), s: air ? `nel vuoto ${fmt.m(vac.apex)}` : 'h + v_y² / 2g', title: 'Altezza massima del punto più basso della pallina' },
      { k: 'Componenti', p: 2, v: `${fmt.num(vac.vx, 2)} · ${fmt.num(vac.vy, 2)} <small>m/s</small>`, s: 'vₓ = v₀·cos θ · v_y = v₀·sin θ', title: 'Componenti orizzontale e verticale della velocità di uscita' },
      { k: 'Alzo migliore', p: 2, v: fmt.deg(vac.best / DEG), s: `gittata ${fmt.m(vac.rangeMax)} nel vuoto`, title: 'Nel vuoto: tan θ = v₀ / √(v₀² + 2gh). Da terra è 45°' },
      { k: 'Impatto', p: 3, v: unit(fmt.ms(vI)), s: `${fmt.deg(aI)} sotto l'orizzontale` },
      { k: 'Gravità', p: 3, v: `${fmt.num(P.g, 2)} <small>m/s²</small>`, s: P.name },
    ]);
  }

  // ───────────────────────── mira ─────────────────────────
  function canAim() { const P = state.h + spec().r; return Math.atan2(state.H - P, state.D) / DEG; }
  function updateAim() {
    if (tgt() === 'floor') {
      const E = env();
      aimSol = aimAngles(spec(), E, state.h, state.v0, state.D).map((a) => Math.round((a / DEG) * 10) / 10);
      if (!aimSol.length) {
        ui.setAim([], `Fuori portata: a ${fmt.ms(state.v0)} la pallina arriva al massimo a ${fmt.m(vacuum(state.h, state.v0, 0, E.g).rangeMax)}${E.rho > 0 ? ' nel vuoto, meno con l\'aria' : ''}. Aumenta la velocità.`);
        return;
      }
      const list = aimSol.length === 1 ? [['low', `Alzo <b>${fmt.deg(aimSol[0])}</b>`]] : [['low', `Tiro teso <b>${fmt.deg(aimSol[0])}</b>`], ['high', `A campanile <b>${fmt.deg(aimSol[1])}</b>`]];
      ui.setAim(list, `Gli alzi che portano la pallina al centro${E.rho > 0 ? ', calcolati con l\'aria' : ''}.`);
    } else if (tgt() === 'drop') {
      const a = Math.round(canAim() * 10) / 10, P = state.h + spec().r;
      const reach = (state.D - CAN.r) / Math.max(state.v0 * Math.cos(a * DEG), 1e-6), fall = Math.sqrt((2 * Math.max(state.H - CAN.hh, 0)) / env().g);
      ui.setAim([['can', `Punta al barattolo <b>${fmt.deg(a)}</b>`]], reach < fall
        ? 'Punta la canna dritta al barattolo: si stacca quando la pallina parte e cade della stessa quantità.'
        : `Troppo lenta: il barattolo arriva a terra prima della pallina (servono più di ${fmt.ms((state.D - CAN.r) / (fall * Math.cos(a * DEG)))}).`);
      void P;
    }
  }
  function aimFor(id) {
    if (id === 'can') return Math.round(canAim() * 10) / 10;
    const sol = aimAngles(spec(), env(), state.h, state.v0, state.D).map((a) => Math.round((a / DEG) * 10) / 10);
    if (!sol.length) return state.angle;
    return id === 'high' ? sol[sol.length - 1] : sol[0];
  }

  // ───────────────────────── lanci ─────────────────────────
  function takeFx() {
    if (fxPool.length) return fxPool.pop();
    const f = { trail: mkLine(1500, 2.4, 0.9), trail2: mkLine(500, 2.2, 0.8), segT: [], segT2: [] };
    f.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    f.ring.userData.noAO = true; f.ring.renderOrder = 6;
    scene.add(f.ring);
    // sul piano di Galileo gli arrivi sono vicini: solo l'etichetta dell'ultimo lancio
    f.tag = tags.add('', 'nocase', (o) => o.copy(f.ring.position), () => f.shot && f.ring.visible && (f.shot.cfg.app !== 'galileo' || f.shot === cur()));
    return f;
  }
  function releaseFx(f) {
    f.shot = null; f.ring.visible = false;
    for (const L of [f.trail, f.trail2]) { L.buf.reset(); L.buf.commit(); }
    fxPool.push(f);
  }
  function fillTrail(L, segT, tr, color) {
    const c = new THREE.Color(color), T = tr.t[tr.n - 1], N = Math.min(L.buf.max, 1400);
    L.buf.reset(); segT.length = 0;
    let px = tr.x[0], py = tr.y[0];
    for (let j = 1; j <= N; j++) {
      const t = (T * j) / N, q = sampleAt(tr, t, tmp);
      L.buf.push(px, py, tr.z, q.x, q.y, tr.z, c, 0, 1);
      segT.push(t); px = q.x; py = q.y;
    }
    L.buf.commit();
    L.line.geometry.instanceCount = 0;
  }
  function plotData(tr, base = 0) {
    const r = tr.spec.r || 0, T = tr.tLand ?? tr.t[tr.n - 1], N = 260, o = { t: [], x: [], y: [], vx: [], vy: [] };
    for (let i = 0; i <= N; i++) { const t = (T * i) / N, q = sampleAt(tr, t, tmp); o.t.push(t); o.x.push(q.x); o.y.push(q.y - r - base); o.vx.push(q.vx); o.vy.push(q.vy); }
    return o;
  }

  function fire() {
    const now = performance.now() / 1000;
    if (now - lastFireReal < 0.4) return false;
    lastFireReal = now;
    paused = false;
    barrelAngle = state.angle;
    const sp = spec(), E = env(), L = launchOf(state), th = L.angle * DEG;
    const twin = twinOn(), drop = tgt() === 'drop';
    let res, ramp = null;
    if (L.gal) {
      // la discesa sulla rampa è già calcolata; il volo parte dal bordo con la rotazione del rotolamento
      ramp = L.ramp;
      res = simulate({
        g: E.g, rho: E.rho, dt: stepFor(L.h, L.v0, 0, E.g), bounce: state.bounce, tMax: 40,
        floor: GAL.floor, walls: { x0: GAL.wall0, x1: GAL.wall1, e: GAL.eWall },
        bodies: [{ key: 'ball', spec: sp, x: 0, y: L.P, vx: L.v0, vy: 0, w: -L.v0 / ramp.rho, rot: ramp.track.rot[ramp.track.n - 1], z: 0 }],
      });
    } else {
      const bodies = [{ key: 'ball', spec: sp, x: 0, y: L.P, vx: L.v0 * Math.cos(th), vy: L.v0 * Math.sin(th), z: 0 }];
      if (twin) bodies.push({ key: 'twin', spec: sp, x: 0, y: L.P, vx: 0, vy: 0, z: TWIN_Z });
      if (drop) bodies.push({ key: 'can', spec: CAN, x: state.D, y: state.H, vx: 0, vy: 0, z: 0 });
      res = simulate({ g: E.g, rho: E.rho, bodies, dt: stepFor(L.h, L.v0, th, E.g), collide: drop, bounce: state.bounce, tMax: 40 });
    }
    const shot = {
      id: ++shotId, color: COLORS[colorI++ % COLORS.length], t0: clock + (ramp ? ramp.T : 0), spec: sp,
      ramp: ramp ? ramp.track : null, Tr: ramp ? ramp.T : 0,
      cfg: { app: state.app, Hr: state.Hr, v0: L.v0, angle: L.angle, h: L.h, base: L.base, ball: state.ball, planet: state.planet, air: E.rho > 0, target: tgt(), D: state.D, H: state.H },
      ball: res[0], twin: twin ? res[1] : null, can: drop ? res[res.length - 1] : null,
    };
    shot.end = Math.max(...res.map((r) => r.t[r.n - 1]));
    shot.pl = plotData(shot.ball, L.base);
    if (shot.twin) shot.pl2 = plotData(shot.twin);
    if (!state.keep) while (shots.length) removeShot(shots[0]);
    while (shots.length >= MAX_SHOTS) removeShot(shots[0]);
    const f = takeFx();
    f.shot = shot; shot.fx = f;
    fillTrail(f.trail, f.segT, shot.ball, shot.color);
    if (shot.twin) fillTrail(f.trail2, f.segT2, shot.twin, shot.color); else { f.trail2.buf.reset(); f.trail2.buf.commit(); f.segT2.length = 0; }
    f.ring.material.color.set(shot.color);
    f.ring.scale.setScalar(sp.r);
    f.ring.position.set(shot.ball.land.x, L.base + 0.0018, 0);
    for (const x of shots) tags.setText(x.fx.tag, landText(x, false));
    tags.setText(f.tag, landText(shot, true));
    shot.mesh = rig.makeBall(state.ball, sp.r); scene.add(shot.mesh);
    if (shot.twin) { shot.mesh2 = rig.makeBall(state.ball, sp.r); scene.add(shot.mesh2); }
    shots.push(shot);
    if (drop) canShot = shot;
    if (L.gal) rig.gal.release(); else rig.kick();
    rig.loaded.visible = false; rig.twinLoaded.visible = false;
    if (rig.gal) rig.gal.loaded.visible = false;
    // il lanciatore si ricarica in tempo reale; sul piano di Galileo la pallina nuova arriva quando il fermo è tornato giù
    reloadAt = L.gal ? 0 : now + 0.7;
    reloadSim = L.gal ? clock + 0.9 : 0;
    ghosts.ball.geometry = rig.ballGeometry(sp.r); ghosts.twin.geometry = rig.ballGeometry(sp.r);
    // immagini più scure della scia, così si distinguono sopra la linea dello stesso colore
    for (const k of ['ball', 'twin']) ghosts[k].material.color.set(shot.color).lerp(new THREE.Color('#15181c'), 0.35);
    for (const k of ['tape', 'rod']) ghosts[k].material.color.set(shot.color);
    tapeDot.material.color.set(shot.color); rodDot.material.color.set(shot.color);
    ghostKey = '';
    if (!L.gal) rig.setTape(Math.max(maxX(), 2));
    plotAt = 0;
    return true;
  }
  function removeShot(s) {
    scene.remove(s.mesh); if (s.mesh2) scene.remove(s.mesh2);
    releaseFx(s.fx);
    if (canShot === s) { canShot = null; rig.placeCan(state.D, state.H, 0, 0); }
    shots.splice(shots.indexOf(s), 1);
  }
  function clearShots() {
    while (shots.length) removeShot(shots[0]);
    seq = null; canShot = null; colorI = 0; paused = false; rig.placeCan(state.D, state.H, 0, 0); dirty = true;
    // palline di nuovo pronte alla partenza
    reloadAt = reloadSim = 0;
    rig.loaded.visible = true; rig.twinLoaded.visible = twinOn();
    if (rig.gal) { rig.gal.loaded.visible = true; rig.gal.pinT = 1; rig.gal.setRelease(state.Hr, true); }
  }

  function result(s) {
    const c = s.cfg;
    if (c.target === 'floor') {
      const dx = s.ball.land.x - c.D;
      return Math.abs(dx) <= 0.2 ? (Math.abs(dx) < 0.005 ? 'centro' : `centro, a ${fmt.m(Math.abs(dx))}`) : dx < 0 ? `corto di ${fmt.m(-dx)}` : `lungo di ${fmt.m(dx)}`;
    }
    if (c.target === 'drop') return s.ball.hits.length ? `colpito a ${fmt.m(s.ball.hits[0].cy)}` : 'mancato';
    return '';
  }
  /** Etichetta del punto d'arrivo: completa per l'ultimo lancio, solo l'alzo per i precedenti (non si sovrappongono). */
  function landText(s, last) {
    const head = s.cfg.app === 'galileo' ? `H ${fmt.m(s.cfg.Hr)}` : fmt.deg(s.cfg.angle);
    if (!last) return head;
    const r = result(s);
    return `${head} · ${fmt.m(s.ball.land.x)}${r && s.cfg.target === 'floor' ? ` · ${r}` : ''}`;
  }

  // ───────────────────────── sequenze degli esperimenti classici ─────────────────────────
  /** Traiettorie previste di tutta la sequenza, perché l'inquadratura le comprenda fin dall'inizio. */
  function previewSeq(list) {
    const saved = { ...state }, pts = [];
    for (const e of list) {
      const { aim, ...patch } = e;
      Object.assign(state, patch);
      if (aim) state.angle = aimFor(aim);
      const L = launchOf(state), tr = flight(spec(), env(), L.h, L.v0, L.angle * DEG, 600, L.base);
      for (let i = 0; i <= 16; i++) { const q = sampleAt(tr, (tr.tLand * i) / 16, tmp); pts.push([q.x, q.y, 0]); }
      pts.push([tr.land.x, L.base, L.gal ? GAL_BASE.z1 : TAPE_Z]);
    }
    Object.assign(state, saved);
    return pts;
  }
  function stepSeq(dtReal) {
    if (!seq || paused) return;
    if (seq.phase === 'apply') {
      const { aim, ...patch } = seq.list[seq.i];
      Object.assign(state, patch);
      resolve();
      if (aim) { state.angle = aimFor(aim); resolve(); }
      ui.refresh(); ui.sync();
      if (seq.view && seq.i === 0) pendingView = seq.view;
      seq.phase = 'aim'; seq.t = 0;
    } else if (seq.phase === 'aim') {
      seq.t += dtReal;
      if (Math.abs(barrelAngle - state.angle) < 0.05 && seq.t > (seq.i === 0 ? 1.1 : 0.45)) {
        if (fire()) { seq.phase = 'fly'; seq.shot = shots[shots.length - 1]; }
      }
    } else if (seq.phase === 'fly') {
      const s = seq.shot, tau = clock - s.t0;
      const done = tau > s.ball.tLand + 0.6 && (!s.can || tau > (s.can.tLand ?? 0) + 0.3) && (!s.twin || tau > s.twin.tLand + 0.3);
      if (done) { seq.i++; if (seq.i >= seq.list.length) seq = null; else seq.phase = 'apply'; }
    }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, { balls: Object.entries(BALLS), planets: Object.entries(PLANETS), presets: PRESETS, views: VIEWS, gal: { Hmin: GAL.Hmin, Hmax: GAL.Hmax } }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        clearShots();
        const wasGal = gal();
        Object.assign(state, BASE, p[3]);
        if (wasGal !== gal()) worldS = 0;
        ui.refresh(); ui.sync();
        resolve(); dirty = false;
        barrelAngle = state.angle;
        pendingView = p[4].view || 'overview';
        seq = { list: p[4].seq, i: 0, phase: 'apply', view: p[4].view, pts: previewSeq(p[4].seq) };
        break;
      }
      case 'view': setView(arg); break;
      case 'fire': seq = null; fire(); break;
      case 'pause': togglePause(); break;
      case 'clear': clearShots(); break;
      case 'aim': seq = null; state.angle = aimFor(arg); ui.refresh('angle'); dirty = true; break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'slow': case 'labels': case 'trail': case 'outline': break;
      case 'strobe': case 'strobeHz': ui.sync(); ghostKey = ''; break;
      case 'vVec': case 'comps': case 'gVec': break;
      case 'keep': if (!state.keep) while (shots.length > 1) removeShot(shots[0]); break;
      case 'target': case 'D': case 'H':
        seq = null;
        if (canShot) { canShot = null; }
        ui.sync(); dirty = true; break;
      case 'h': ui.refresh('angle'); seq = null; dirty = true; break;
      case 'app':
        // apparato nuovo: via i lanci, la scena si riadatta e l'inquadratura si ricalcola
        seq = null; clearShots(); worldS = 0;
        if (!gal() && state.plotKind === 'g116') state.plotKind = 'xy';
        resolve(); dirty = false; plotAt = 0;
        pendingView = view;
        break;
      default: seq = null; dirty = true; break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const P0 = () => lp.P;
  const tAngle = tags.add('', 'nocase', (o) => o.set(-0.13, P0() + 0.215, 0.05), () => !gal());
  const tH = tags.add('', 'nocase', (o) => o.set(0.07, Math.max(P0() * 0.5, 0.1), 0.05), () => !gal() && state.h >= 0.15);
  const tHr = tags.add('', 'nocase', (o) => { const c = rig.gal.center; o.set(c.x - 0.03, c.y + 0.06, 0.04); }, () => gal() && !!rig.gal);
  const tApex = tags.add('', 'nocase', (o) => { const s = cur(); o.set(s.ball.apex.x, s.ball.apex.y + 0.04, 0); }, () => { const s = cur(); return !!s && s.ball.apex.t > 0 && clock - s.t0 >= s.ball.apex.t; });
  const tTarget = tags.add('', 'nocase', (o) => o.set(state.D, 0, 0.28), () => tgt() === 'floor');
  tags.add('Barattolo', '', (o) => o.copy(rig.can.position).setY(rig.can.position.y + 0.07), () => tgt() === 'drop');
  const tHit = tags.add('Colpito!', '', (o) => { const h = cur().ball.hits[0]; o.set(h.cx, h.cy + 0.09, 0); }, () => { const s = cur(); return !!s && s.ball.hits.length > 0 && clock - s.t0 >= s.ball.hits[0].t; });
  tags.add('Metro a nastro', '', (o) => o.set(Math.min(1.5, maxX() * 0.5), 0, TAPE_Z), () => projOn());
  tags.add('Asta graduata', '', (o) => o.set(ROD.x, 0.7, ROD.z), () => projOn());
  void tHit;
  const cur = () => shots[shots.length - 1];

  // ───────────────────────── inquadrature ─────────────────────────
  function bbox() {
    const r = spec().r, P = lp.P, E = env();
    let xmax = Math.max(0.6, pred.land.x + 0.35), ymax = Math.max(P + 0.32, pred.apex.y + 0.25);
    if (lp.gal) { xmax = Math.max(xmax, GAL_BASE.x1 + 0.1); ymax = Math.max(ymax, 0.8); }
    if (state.vacuumRef) { xmax = Math.max(xmax, vac.range + 0.35); ymax = Math.max(ymax, lp.base + vac.apex + r + 0.25); }
    if (envOn()) { xmax = Math.max(xmax, vac.rangeMax + 0.35); ymax = Math.max(ymax, state.h + (state.v0 * state.v0) / (2 * E.g) + 0.3); }
    if (tgt() !== 'none') xmax = Math.max(xmax, state.D + 0.45);
    if (tgt() === 'drop') ymax = Math.max(ymax, state.H + 0.35);
    for (const s of shots) { xmax = Math.max(xmax, s.ball.land.x + 0.35); ymax = Math.max(ymax, s.ball.apex.y + 0.25); }
    return { xmin: projOn() ? ROD.x - 0.2 : lp.gal ? GAL_BASE.x0 - 0.1 : -0.5, xmax: Math.min(xmax, 400), ymax: Math.min(ymax, 150), zmin: ROD.z, zmax: TAPE_Z + 0.1 };
  }
  /** Punti che l'inquadratura deve contenere: apparato, traiettorie (prevista e lanciate), bersagli, aste. */
  function keyPoints() {
    const r = spec().r, P = lp.P, E = env(), B = GAL_BASE;
    const pts = lp.gal
      ? [[B.x0 - 0.07, 0, B.z1], [B.x0 + 0.04, 0.78, B.z0], [B.x1 + 0.07, 0, B.z1], [B.x1, 0.26, B.z0]]
      : [[-0.4, 0, 0.1], [-0.36, P + 0.22, 0], [0.05, P + 0.05, 0.06]];
    const zl = lp.gal ? B.z1 : TAPE_Z;
    const addTrack = (tr, n = 24) => { const T = tr.tLand ?? tr.t[tr.n - 1]; for (let i = 0; i <= n; i++) { const q = sampleAt(tr, (T * i) / n, tmp); pts.push([q.x, q.y, 0]); } pts.push([tr.land.x, lp.base, zl]); };
    addTrack(pred);
    for (const s of shots) addTrack(s.ball, 12);
    if (state.vacuumRef) pts.push([vac.range, lp.base, 0], [vac.xApex, lp.base + vac.apex + r, 0]);
    if (envOn()) pts.push([vac.rangeMax, 0, 0], [0, state.h + (state.v0 * state.v0) / (2 * E.g) + r, 0]);
    if (tgt() === 'floor') pts.push([state.D + 0.22, 0, 0], [state.D - 0.22, 0, 0.22]);
    if (tgt() === 'drop') pts.push([state.D, state.H + 0.2, 0], [state.D + 0.1, 0, STAND_Z], [state.D, 0, 0.1]);
    if (projOn()) pts.push([ROD.x, 0, ROD.z], [ROD.x, Math.max(pred.apex.y, P) + 0.2, ROD.z]);
    if (seq && seq.pts) pts.push(...seq.pts);
    // con il bersaglio che cade, la pallina di solito si ferma contro il barattolo: non serve inquadrare il volo libero oltre
    const xCap = tgt() === 'drop' ? state.D + 0.6 : Infinity;
    return pts.filter((p) => p[0] <= xCap).map((p) => new THREE.Vector3(...p));
  }
  /** Zona dello schermo libera da pannello, suggerimenti, cronometro e misure (pixel CSS). */
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (W <= 860) return { x0: m + 16, x1: W - m - 44, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 30, x1: (live.height ? live.left : W) - m - 60, y0: 84, y1: lay.metricsTop - m };
  }
  /** Distanza e bersaglio perché i punti stiano nella zona libera, guardando lungo dir. */
  function fitPose(dir, pts) {
    const cam = camera.clone(), rect = freeRect(), W = window.innerWidth, H = window.innerHeight;
    const box = new THREE.Box3().setFromPoints(pts), target = box.getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) {
        pv.copy(p).project(cam);
        if (pv.z > 1 || pv.z < -1) behind = true;               // dietro la telecamera: non va bene
        const x = (pv.x * 0.5 + 0.5) * W, y = (-pv.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.2, hi = 3000;
      for (let k = 0; k < 34; k++) {
        const d = Math.sqrt(lo * hi); put(d);
        const b = bounds();
        if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d;
      }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / H;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  function viewPose(id) {
    const P = lp.P, yb = lp.base;
    switch (id) {
      case 'side': return fitPose(new THREE.Vector3(0, 0.16, 1).normalize(), keyPoints());
      case 'launcher': {
        if (!lp.gal) return { pos: [0.55, P + 0.2, 0.85], target: [-0.1, P - 0.05, 0] };
        const R = GAL_RAMP, f = GAL.floor;
        return fitPose(new THREE.Vector3(0.55, 0.22, 1).normalize(), [[R.x0, f, R.z1], [R.x0, R.top + 0.13, R.z0], [R.x0, f, R.z0], [0.1, f, R.z1], [0.1, P + 0.04, 0]].map((p) => new THREE.Vector3(...p)));
      }
      case 'landing': { const s = cur(), xl = s ? s.ball.land.x : pred.land.x, k = Math.max(1, xl / 6); return { pos: [xl + 0.55 * k, yb + 0.4 * k, 1.15 * k], target: [xl, yb + 0.05, 0] }; }
      case 'follow': return lp.gal ? { pos: [0.35, P + 0.15, 1.0], target: [-0.1, P, 0] } : { pos: [0.6, P + 0.3, 1.6], target: [0, P, 0] };
      default: return fitPose(new THREE.Vector3(0.24, 0.34, 1).normalize(), keyPoints());
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    // la telecamera deve poter stare a quella distanza (i limiti seguono la grandezza della scena)
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(stage.controls.maxDistance, dist * 1.6);
    if (camera.far < dist * 12) { camera.far = dist * 12; camera.updateProjectionMatrix(); }
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  /** Adatta luce, ombre, nebbia, pavimento e limiti della telecamera alla grandezza della scena. */
  function fitWorld() {
    const b = bbox(), S = Math.max(b.xmax - b.xmin, b.ymax, 2.5);
    if (worldS && Math.abs(S - worldS) / worldS < 0.08) return;
    worldS = S;
    const k = Math.max(1, S / 7), cx = (b.xmin + b.xmax) / 2;
    stage.controls.maxDistance = Math.max(9, S * 3.5, camera.position.distanceTo(stage.controls.target) * 1.2);
    camera.far = Math.max(150, S * 40); camera.near = S > 40 ? 0.05 : 0.01; camera.updateProjectionMatrix();
    scene.fog.near = Math.max(16, S * 3); scene.fog.far = Math.max(160, S * 30);
    stage.sky.scale.setScalar(Math.max(1, (camera.far * 0.45) / 90));
    stage.floor.scale.setScalar(Math.max(1, (scene.fog.far * 1.2) / 120));
    stage.key.target.position.set(cx, 0, 0);
    stage.key.position.set(cx - 3.2 * k, 7.5 * k, 4.8 * k);
    // sul piano di Galileo la scena è piccola: ombre più fitte
    const sc = stage.key.shadow.camera, half = Math.max(lp.gal ? 1.4 : 4, S * 0.62);
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.far = 24 * k + half; sc.updateProjectionMatrix();
    for (const C of Object.values(curves).concat([guides, apexLine])) { C.mat.dashSize = 0.012 * S; C.mat.gapSize = 0.008 * S; }
  }

  // ───────────────────────── trascinamento: canna (alzo) e forcella (altezza) ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane();
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pick = (e) => { ray(e); return raycaster.intersectObjects(rig.grabbable, false)[0]; };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) return;
    const kind = hit.object.userData.drag;
    if (kind === 'angle' || kind === 'release') plane.set(new THREE.Vector3(0, 0, 1), 0);
    else plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(v3).setY(0).normalize(), hit.point);
    drag = { kind, offset: hit.point.y - state.h };
    seq = null;
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      ray(e);
      if (raycaster.ray.intersectPlane(plane, v3)) {
        if (drag.kind === 'angle') {
          const a = Math.round(Math.atan2(P0() - v3.y, -v3.x) / DEG);
          const lo = state.h < 0.005 ? 0 : -45, ang = Math.min(Math.max(a, lo), 90);
          if (ang !== state.angle) { state.angle = ang; barrelAngle = ang; ui.refresh('angle'); dirty = true; }
        } else if (drag.kind === 'release') {
          // il punto del percorso della pallina più vicino al puntatore, arrotondato a 5 mm di dislivello
          const R = rampPath(rollRadius(spec().r));
          let best = 0, bd = Infinity;
          for (let i = 0; i < R.n; i += 2) { const d = (R.x[i] - v3.x) ** 2 + (R.y[i] - v3.y) ** 2; if (d < bd) { bd = d; best = i; } }
          const H = Math.min(Math.max(Math.round((R.y[best] - R.y[0]) * 200) / 200, GAL.Hmin), GAL.Hmax);
          if (H !== state.Hr) { state.Hr = H; ui.refresh('Hr'); dirty = true; }
        } else {
          const h = Math.min(Math.max(Math.round((v3.y - drag.offset) * 100) / 100, 0), 3);
          if (h !== state.h) { state.h = h; ui.refresh('h'); ui.refresh('angle'); dirty = true; }
        }
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !!pick(e));
  }, { capture: true });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); seq = null; fire(); } else if (k === 'p') togglePause(); else if (k === 'r') clearShots(); else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── disegno di un istante ─────────────────────────
  function setArrow(a, show, ox, oy, oz, vx, vy, len, S) {
    a.visible = show && len > 1e-4;
    if (!a.visible) return;
    a.position.set(ox, oy, oz);
    a.setDirection(v3.set(vx, vy, 0).normalize());
    const head = Math.min(0.012 * S, len * 0.35);
    a.setLength(len, head, head * 0.6);
  }
  let ghostKey = '';
  function setGhosts(m, list, scaleY) {
    list.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, 0, p[3] || 0); dummy.scale.set(1, scaleY || 1, 1);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.count = list.length; m.instanceMatrix.needsUpdate = true;
  }

  function place() {
    for (const s of shots) {
      const tau = Math.min(Math.max(clock - s.t0, 0), s.end), f = s.fx;
      // sul piano di Galileo, prima del volo la pallina scende lungo la rampa
      const q = s.ramp && clock < s.t0 ? sampleAt(s.ramp, clock - s.t0, tmp) : sampleAt(s.ball, tau, tmp);
      s.mesh.position.set(q.x, q.y, 0); s.mesh.rotation.set(0, 0, q.rot);
      let k = 0; while (k < f.segT.length && f.segT[k] <= tau) k++;
      f.trail.line.geometry.instanceCount = state.trail ? k : 0;
      f.trail.mat.opacity = state.strobe && s === shots[shots.length - 1] ? 0.4 : 0.9;
      f.ring.visible = tau >= s.ball.tLand;
      if (s.twin) {
        const q2 = sampleAt(s.twin, tau, tmp2);
        s.mesh2.position.set(q2.x, q2.y, TWIN_Z); s.mesh2.rotation.set(0, 0, q2.rot);
        let k2 = 0; while (k2 < f.segT2.length && f.segT2[k2] <= tau) k2++;
        f.trail2.line.geometry.instanceCount = state.trail ? k2 : 0;
      }
      if (s === canShot) { const c = sampleAt(s.can, tau, tmp2); rig.placeCan(c.x, c.y, 0, c.rot); }
    }
    const s = cur(), E = env(), S = worldS || 3, r = spec().r;
    const vs = (0.1 * Math.min(S, 12)) / Math.max(lp.v0, 1);
    // vettori: sulla pallina (sulla rampa o in volo), oppure alla partenza prima del lancio
    let ox, oy, vx, vy, show;
    if (s && s.ramp && clock < s.t0) { const q = sampleAt(s.ramp, clock - s.t0, tmp); ox = q.x; oy = q.y; vx = q.vx; vy = q.vy; show = true; } else if (s && clock - s.t0 < s.ball.tLand) { const q = sampleAt(s.ball, clock - s.t0, tmp); ox = q.x; oy = q.y; vx = q.vx; vy = q.vy; show = true; } else { const a = lp.gal ? 0 : barrelAngle * DEG; ox = 0; oy = P0(); vx = lp.v0 * Math.cos(a); vy = lp.v0 * Math.sin(a); show = !s || clock - s.t0 >= s.ball.tLand; }
    const sp = Math.hypot(vx, vy);
    setArrow(arrows.v, show && state.vVec, ox, oy, 0, vx, vy, sp * vs, S);
    setArrow(arrows.vx, show && state.comps, ox, oy, 0, Math.sign(vx) || 1, 0, Math.abs(vx) * vs, S);
    setArrow(arrows.vy, show && state.comps, ox, oy, 0, 0, Math.sign(vy) || 1, Math.abs(vy) * vs, S);
    setArrow(arrows.g, show && state.gVec && !!s && clock - s.t0 < s.ball.tLand, ox, oy, 0, 0, -1, 0.07 * Math.min(S, 12) * (E.g / 9.81) ** 0.5, S);
    // proiezioni sugli assi
    guides.buf.reset();
    const gc = new THREE.Color('#6b7380');
    const showProj = projOn() && (!s || clock - s.t0 < s.ball.tLand + 0.4);
    let px = 0, py = P0();
    if (s && clock - s.t0 > 0) { const q = sampleAt(s.ball, Math.min(clock - s.t0, s.ball.tLand), tmp); px = q.x; py = q.y; }
    tapeDot.visible = rodDot.visible = showProj;
    if (showProj) {
      tapeDot.position.set(px, 0.0022, TAPE_Z);
      rodDot.position.set(ROD.x, py, ROD.z + 0.0136);
      guides.buf.push(px, py, 0, px, 0.001, 0, gc, 0, py);
      guides.buf.push(px, 0.001, 0, px, 0.001, TAPE_Z, gc, 0, TAPE_Z);
      guides.buf.push(px, py, 0, ROD.x, py, ROD.z + 0.012, gc, 0, Math.hypot(px - ROD.x, ROD.z));
    }
    guides.buf.commit();
    // quota massima del lancio corrente
    apexLine.buf.reset();
    if (s && state.labels && s.ball.apex.t > 0 && clock - s.t0 >= s.ball.apex.t) {
      const a = s.ball.apex, yb = s.cfg.base;
      apexLine.buf.push(a.x, a.y - s.spec.r, 0, a.x, yb + 0.001, 0, new THREE.Color(s.color), 0, a.y - yb);
      tags.setText(tApex, `quota max ${fmt.m(a.y - s.spec.r - yb)}`);
    }
    apexLine.buf.commit();
    // foto stroboscopica e segni delle proiezioni
    if (state.strobe && s) {
      const tau = clock - s.t0, every = 1 / state.strobeHz;
      const n = Math.max(0, Math.min(GH, Math.floor(Math.min(tau, s.ball.tLand) / every) + 1));
      const key = `${s.id}:${n}:${projOn()}`;
      if (key !== ghostKey) {
        ghostKey = key;
        const pts = [], tp = [], rp = [];
        for (let i = 0; i < n; i++) {
          const q = sampleAt(s.ball, i * every, tmp);
          pts.push([q.x, q.y, 0, q.rot]); tp.push([q.x, 0.0015, TAPE_Z]); rp.push([ROD.x, q.y, ROD.z + 0.0135]);
        }
        setGhosts(ghosts.ball, pts);
        setGhosts(ghosts.tape, projOn() ? tp : []);
        setGhosts(ghosts.rod, projOn() ? rp : []);
        if (s.twin) {
          const m = Math.min(GH, Math.floor(Math.min(tau, s.twin.tLand) / every) + 1), p2 = [];
          for (let i = 0; i < m; i++) { const q = sampleAt(s.twin, i * every, tmp); p2.push([q.x, q.y, TWIN_Z, 0]); }
          setGhosts(ghosts.twin, p2);
        } else ghosts.twin.count = 0;
        if (s.can) {
          const tEnd = s.ball.hits.length ? s.ball.hits[0].t : s.can.tLand ?? 0;
          const m = Math.min(GH, Math.floor(Math.min(tau, tEnd) / every) + 1), p3 = [];
          for (let i = 0; i < m; i++) { const q = sampleAt(s.can, i * every, tmp); p3.push([q.x, q.y, 0, q.rot]); }
          setGhosts(ghosts.can, p3);
        } else ghosts.can.count = 0;
      }
    } else if (ghostKey !== 'off') { ghostKey = 'off'; for (const g of Object.values(ghosts)) g.count = 0; }
    void r;
  }

  // ───────────────────────── pausa e contorno ─────────────────────────
  /** Qualcosa è in moto: l'ultimo lancio non è ancora fermo (discesa sulla rampa compresa). */
  const moving = () => { const s = cur(); return !!s && clock - s.t0 < s.end; };
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }
  /** Il protagonista: la pallina dell'ultimo lancio (e la gemella, e il barattolo), o quella pronta a partire. */
  function outlined() {
    if (!state.outline) return [];
    const s = cur();
    if (s) return [s.mesh, s.mesh2, s === canShot ? rig.can : null];
    return lp.gal ? [rig.gal && rig.gal.loaded] : [rig.loaded, rig.twinLoaded];
  }

  // ───────────────────────── cronometro, righe, grafico ─────────────────────────
  function hud() {
    const s = cur(), E = env(), r = spec().r;
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    if (!s) {
      ui.setClock(0, false);
      ui.setStatus(seq ? 'prende la mira' : 'pronto', !!seq);
      ui.setSide(`previsione ${fmt.m(pred.land.x)}`, E.rho > 0 ? `nel vuoto ${fmt.m(vac.range)}` : `in ${fmt.s(pred.tLand)}`);
    } else if (s.ramp && clock < s.t0) {
      // sul piano di Galileo: la discesa prima del volo (il cronometro parte al bordo)
      const q = sampleAt(s.ramp, clock - s.t0, tmp);
      ui.setClock(0, false);
      ui.setStatus(paused ? 'in pausa' : seq ? `scende · ${seq.i + 1}/${seq.list.length}` : 'scende sul piano', !paused);
      ui.setSide(`discesa ${fmt.s(s.Tr + clock - s.t0)}`, `v ${fmt.ms(Math.hypot(q.vx, q.vy))}`);
    } else {
      const tau = clock - s.t0, b = s.ball, flying = tau < b.tLand, R = s.spec.r, yb = s.cfg.base;
      ui.setClock(Math.min(tau, b.tLand), flying);
      const res = result(s);
      const status = paused ? 'in pausa' : flying ? 'in volo' : res || (tau < b.tRest ? 'rimbalza' : 'a terra');
      ui.setStatus(seq ? `${status} · ${seq.i + 1}/${seq.list.length}` : status, flying && !paused);
      if (flying) { const q = sampleAt(b, tau, tmp); ui.setSide(`x ${fmt.m(q.x)} · y ${fmt.m(q.y - R - yb)}`, `v ${fmt.ms(Math.hypot(q.vx, q.vy))}`); }
      else if (s.ramp) ui.setSide(`distanza ${fmt.m(b.land.x)}`, `uscita ${fmt.ms(s.cfg.v0)} · discesa ${fmt.s(s.Tr)}`);
      else ui.setSide(`gittata ${fmt.m(b.land.x)}`, `quota max ${fmt.m(b.apex.y - R)}`);
    }
    ui.setRows(shots.slice().reverse().map((x) => {
      const tau = clock - x.t0, landed = tau >= x.ball.tLand, c = x.cfg, g = c.app === 'galileo';
      const extra = [BALLS[c.ball].name.toLowerCase()];
      if (!g) extra.push(c.h < 0.005 ? 'da terra' : `h ${fmt.m(c.h)}`);
      if (c.planet !== 'earth') extra.push(PLANETS[c.planet].name);
      if (!c.air) extra.push('vuoto');
      const name = g ? `H ${fmt.m(c.Hr)} · ${fmt.ms(c.v0)}` : `${fmt.deg(c.angle)} · ${fmt.ms(c.v0)}`;
      return { key: x.id, color: x.color, name: `${name}<small>${extra.join(' · ')}</small>`, t: landed ? fmt.m(x.ball.land.x) : '…', v: landed ? fmt.s(x.ball.tLand) : '', done: landed };
    }));
    ui.setFireEnabled(performance.now() / 1000 - lastFireReal >= 0.4);
    tags.setText(tAngle, `alzo ${fmt.deg(state.angle)}`);
    tags.setText(tH, `h = ${fmt.m(state.h)}`);
    tags.setText(tHr, `partenza H = ${fmt.m(state.Hr)}`);
    tags.setText(tTarget, `Bersaglio · ${fmt.m(state.D)}`);
    void r;
  }

  function drawPlot() {
    const s = cur(), E = env(), kind = state.plotKind;
    if (kind === 'g116' && lp.gal) {
      // distanza in funzione dell'altezza di partenza: teoria, lanci, e i numeri di Galileo riportati in scala
      const sc = GAL.Hmax / 1000, k = lp.ramp.k, h = lp.h, th = { x: [], y: [] }, sl = { x: [], y: [] };
      for (let i = 0; i <= 120; i++) { const H = (GAL.Hmax * 1.06 * i) / 120; th.x.push(H * 100); th.y.push(200 * Math.sqrt((h * H) / (1 + k))); sl.x.push(H * 100); sl.y.push(200 * Math.sqrt(h * H)); }
      const points = F116V.rows.map(([pH, pD]) => ({ x: pH * sc * 100, y: pD * sc * 100, color: '#6b7380', hollow: true, r: 9 }));
      for (const x of shots) if (x.cfg.app === 'galileo' && clock - x.t0 >= x.ball.tLand) points.push({ x: x.cfg.Hr * 100, y: x.ball.land.x * 100, color: x.color, r: 6 });
      ui.drawPlot({
        kind, series: [], points, refs: [{ color: '#9aa1ab', x: sl.x, y: sl.y }, { color: '#15181c', x: th.x, y: th.y, dash: [] }],
        X0: 0, X1: GAL.Hmax * 106, Y0: 0, Y1: sl.y[sl.y.length - 1] * 1.08, xLabel: 'H (cm)', yLabel: 'd (cm)',
        legend: [['○ Galileo 1608', '#6b7380'], ['rotola', '#15181c'], ['striscia', '#9aa1ab']],
      });
      return;
    }
    if (kind === 'xy' || kind === 'g116') {
      let X1 = Math.max(pred.land.x, 0.5), Y1 = Math.max(pred.apex.y - spec().r - lp.base, lp.h, 0.3);
      const series = [], refs = [], marks = [];
      for (const x of shots) {
        const tau = clock - x.t0, p = x.pl;
        let n = 0; while (n < p.t.length && p.t[n] <= tau) n++;
        series.push({ color: x.color, x: p.x.slice(0, n), y: p.y.slice(0, n), alpha: x === s ? 1 : 0.55, width: x === s ? 3 : 2.2 });
        X1 = Math.max(X1, x.ball.land.x); Y1 = Math.max(Y1, x.ball.apex.y - x.spec.r - x.cfg.base);
      }
      const r = spec().r, P = lp.h;
      if (state.predict || !shots.length) {
        const st = Math.max(1, Math.floor(pred.n / 300)), px = [], py = [];
        for (let i = 0; i < pred.n; i += st) { px.push(pred.x[i]); py.push(pred.y[i] - r - lp.base); }
        refs.push({ color: '#15181c', x: px, y: py });
      }
      if (state.vacuumRef) { const px = [], py = []; for (let i = 0; i <= 160; i++) { const t = (vac.t * i) / 160; px.push(vac.vx * t); py.push(P + vac.vy * t - 0.5 * E.g * t * t); } refs.push({ color: '#6b7380', x: px, y: py }); X1 = Math.max(X1, vac.range); Y1 = Math.max(Y1, vac.apex); }
      if (envOn()) { const px = [], py = []; for (let i = 0; i <= 160; i++) { const x = (vac.rangeMax * i) / 160; px.push(x); py.push(envelope(x, P, state.v0, E.g)); } refs.push({ color: VEC.g, x: px, y: py, dash: [10, 6] }); X1 = Math.max(X1, vac.rangeMax); Y1 = Math.max(Y1, P + (state.v0 * state.v0) / (2 * E.g)); }
      if (tgt() !== 'none') { marks.push({ x: state.D, color: 'rgba(200,40,30,0.55)' }); X1 = Math.max(X1, state.D); }
      let d = null;
      if (s) { const q = sampleAt(s.ball, Math.min(Math.max(clock - s.t0, 0), s.ball.tLand), tmp); d = { x: q.x, y: q.y - s.spec.r - s.cfg.base, color: s.color }; }
      ui.drawPlot({ kind, series, refs, marks, dot: d, X0: Math.min(0, -0.02 * X1), X1: X1 * 1.06, Y0: 0, Y1: Y1 * 1.12, xLabel: 'x (m)', yLabel: 'quota (m)' });
      return;
    }
    // x(t), y(t) oppure vₓ(t), v_y(t) del lancio corrente (o della previsione)
    const cfg = s ? s.cfg : { h: lp.h, v0: lp.v0, angle: lp.angle, planet: state.planet }, g = PLANETS[cfg.planet].g, th = cfg.angle * DEG;
    const V = vacuum(cfg.h, cfg.v0, th, g), T = s ? s.ball.tLand : pred.tLand;
    const tau = s ? Math.max(clock - s.t0, 0) : 0;
    const p = s ? s.pl : (() => { const o = { t: [], x: [], y: [], vx: [], vy: [] }, r = spec().r; for (let i = 0; i < pred.n; i += Math.max(1, Math.floor(pred.n / 260))) { o.t.push(pred.t[i]); o.x.push(pred.x[i]); o.y.push(pred.y[i] - r - lp.base); o.vx.push(pred.vx[i]); o.vy.push(pred.vy[i]); } return o; })();
    let n = s ? 0 : p.t.length; if (s) while (n < p.t.length && p.t[n] <= tau) n++;
    const rt = []; for (let i = 0; i <= 120; i++) rt.push((Math.max(T, V.t) * i) / 120);
    const C1 = VEC.vx, C2 = VEC.vy;
    if (kind === 'xt') {
      const series = [{ color: C1, x: p.t.slice(0, n), y: p.x.slice(0, n) }, { color: C2, x: p.t.slice(0, n), y: p.y.slice(0, n) }];
      const refs = s || state.air ? [{ color: C1, x: rt, y: rt.map((t) => (t <= V.t ? V.vx * t : null)) }, { color: C2, x: rt, y: rt.map((t) => (t <= V.t ? cfg.h + V.vy * t - 0.5 * g * t * t : null)) }] : [];
      const Y1 = Math.max(...p.x, ...p.y, V.range, V.apex, 0.2);
      const dots = s && n ? [{ x: p.t[n - 1], y: p.x[n - 1], color: C1 }, { x: p.t[n - 1], y: p.y[n - 1], color: C2 }] : null;
      ui.drawPlot({ kind, series, refs, dot: dots, X0: 0, X1: Math.max(T, V.t) * 1.06, Y0: 0, Y1: Y1 * 1.1, xLabel: 't (s)', yLabel: 'posizione (m)', legend: [['x(t)', C1], ['y(t)', C2]] });
    } else {
      const series = [{ color: C1, x: p.t.slice(0, n), y: p.vx.slice(0, n) }, { color: C2, x: p.t.slice(0, n), y: p.vy.slice(0, n) }];
      const refs = [{ color: C1, x: rt, y: rt.map((t) => (t <= V.t ? V.vx : null)) }, { color: C2, x: rt, y: rt.map((t) => (t <= V.t ? V.vy - g * t : null)) }];
      const lo = Math.min(0, ...p.vy, V.vy - g * V.t), hi = Math.max(0.5, ...p.vx, ...p.vy, V.vx, V.vy);
      const dots = s && n ? [{ x: p.t[n - 1], y: p.vx[n - 1], color: C1 }, { x: p.t[n - 1], y: p.vy[n - 1], color: C2 }] : null;
      ui.drawPlot({ kind, series, refs, dot: dots, X0: 0, X1: Math.max(T, V.t) * 1.06, Y0: lo * 1.1, Y1: hi * 1.12, xLabel: 't (s)', yLabel: 'velocità (m/s)', legend: [['vₓ', C1], ['v_y', C2]] });
    }
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (dirty) { dirty = false; resolve(); }
    if (aimAt && nowMs > aimAt) { aimAt = 0; updateAim(); }
    if (pendingView) { setView(pendingView); pendingView = null; }
    stepSeq(dt);
    const dtSim = paused ? 0 : dt * state.slow;
    clock += dtSim;
    if (reloadAt && now > reloadAt) { reloadAt = 0; rig.loaded.visible = true; rig.twinLoaded.visible = twinOn(); if (rig.gal) rig.gal.loaded.visible = true; }
    if (reloadSim && clock > reloadSim) { reloadSim = 0; rig.loaded.visible = true; if (rig.gal) rig.gal.loaded.visible = true; }
    if (rig.gal) rig.gal.update(dtSim);
    // la canna ruota verso l'alzo scelto
    const da = state.angle - barrelAngle, rate = 120 * dt;
    barrelAngle = Math.abs(da) <= rate ? state.angle : barrelAngle + Math.sign(da) * rate;
    rig.setLauncher(P0(), barrelAngle * DEG);
    rig.update(dt);
    place();
    if (view === 'follow') {
      const s = cur();
      let tx = 0, ty = P0();
      if (s) { const q = s.ramp && clock < s.t0 ? sampleAt(s.ramp, clock - s.t0, tmp) : sampleAt(s.ball, Math.min(clock - s.t0, s.end), tmp); tx = q.x; ty = q.y; }
      const k = Math.min(1, dt * 5), dx = (tx - stage.controls.target.x) * k, dy = (ty - stage.controls.target.y) * k;
      stage.controls.target.x += dx; stage.controls.target.y += dy; camera.position.x += dx; camera.position.y += dy;
    }
    stage.update(dt);
    hud();
    stage.outlined = outlined();
    tags.update(camera, w, h, state.labels);
    stage.render();

    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 60) { plotAt = nowMs; drawPlot(); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  resolve(); dirty = false;
  updateAim();
  rig.setLauncher(P0(), barrelAngle * DEG);
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico del moto', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, shots: () => shots, fire, clearShots, togglePause, paused: () => paused, setView, plotView, clock: () => clock, pred: () => pred, seq: () => seq, lp: () => lp, GAL, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
