// main.js — Il moto circolare
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { Motor, Puck, Gate, uniform, G, DISC_Y } from './circ.js';
import { Rig, ARM_Y, GATE } from './rig.js';
import { createUI, fmt } from './ui.js';

const TWO_PI = Math.PI * 2;
const COL = { A: '#e8452c', B: '#d99a12' };
const VEC = { v: '#0c9d8f', a: '#7a47cf', F: '#2c67dc', cf: '#e07b1f', cor: '#d6336c', eul: '#8a8f98' };
const SUB = 1 / 1000;                       // passo d'integrazione (s)
const REC = 1 / 120;                        // campionamento per grafici e traiettorie (s)
const SPAN = 8;                             // secondi visibili nel grafico

const state = {
  rpm: 30, dir: 1, alpha: 3,
  rA: 0.3, mA: 0.2, useB: false, rB: 0.15, mB: 0.2,
  frame: 'lab', slow: 1,
  trail: true, vVec: true, aVec: false, fVec: false, shadow: false, outline: false, labels: true, quality: 'low', plotKind: 'F',
};
const BASE = { dir: 1, alpha: 3, useB: false, frame: 'lab', trail: true, vVec: true, aVec: false, fVec: false, shadow: false, plotKind: 'F' };
// [id, testo, descrizione, impostazioni, {start, release: secondi dopo il regime, view}]
const PRESETS = [
  ['uniform', 'Moto circolare uniforme', 'Velocità costante in modulo, accelerazione verso il centro', { rpm: 30, rA: 0.3, mA: 0.2, aVec: true }, { start: true }],
  ['tangent', 'Sganciato: via per la tangente', 'Senza più forza verso il centro il disco va dritto', { rpm: 45, rA: 0.3, mA: 0.2 }, { start: true, release: 1.5, view: 'top' }],
  ['radius', 'Raggio doppio', 'Stessa velocità angolare: velocità e forza doppie', { rpm: 40, useB: true, rA: 0.2, mA: 0.2, rB: 0.4, mB: 0.2, fVec: true, vVec: true }, { start: true, view: 'top' }],
  ['mass', 'Massa doppia', 'Stesso raggio: la forza raddoppia, la velocità no', { rpm: 40, useB: true, rA: 0.3, mA: 0.1, rB: 0.3, mB: 0.2, fVec: true, vVec: false }, { start: true }],
  ['shm', 'L\'ombra: moto armonico', 'La proiezione di un moto circolare uniforme', { rpm: 30, rA: 0.3, mA: 0.2, shadow: true, plotKind: 'x', vVec: false }, { start: true, view: 'screen' }],
  ['coriolis', 'Sulla piattaforma', 'Forza centrifuga e di Coriolis viste da chi ruota', { rpm: 30, rA: 0.25, mA: 0.2, frame: 'rot', fVec: true, vVec: false }, { start: true, release: 2.5, view: 'top' }],
  ['spinup', 'Avvio del motore', 'Accelerazione tangenziale e centripeta insieme', { rpm: 60, alpha: 0.8, rA: 0.35, mA: 0.2, aVec: true, vVec: true }, { start: true }],
];
const VIEWS = [['overview', 'Panoramica'], ['top', 'Dall\'alto'], ['side', 'Di lato'], ['screen', 'Schermo'], ['gate', 'Fotocellula']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-2.4, 5.5, 3.6], keyTarget: [0, 0.4, 0], shadowBox: [-2.4, 2.4, 2.4, -2.4], shadowFar: 16, fog: [10, 90] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  // tutto il laboratorio sta in un gruppo: per l'osservatore sulla piattaforma è il laboratorio a girare
  const world = new THREE.Group();
  scene.add(world);
  world.add(stage.floor);
  const rig = new Rig();
  world.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  const motor = new Motor();
  const pucks = { A: new Puck(0), B: new Puck(Math.PI) };
  const gate = new Gate(Math.PI / 2);

  // traiettorie: nel riferimento del laboratorio (nel gruppo del mondo) e in quello della piattaforma (nel disco)
  const mkLine = (parent, width, opacity) => {
    const buf = new SegBuffer(1300);
    const line = new LineSegments2(buf.geometry(), new LineMaterial({ vertexColors: true, linewidth: width, transparent: true, opacity, depthWrite: false }));
    line.frustumCulled = false; line.userData.noAO = true; line.renderOrder = 5;
    parent.add(line);
    return { buf, line };
  };
  const trails = { A: { lab: mkLine(world, 2.2, 0.85), rot: mkLine(rig.disc, 2.2, 0.85) }, B: { lab: mkLine(world, 2.2, 0.85), rot: mkLine(rig.disc, 2.2, 0.85) } };
  // vettori: velocità, accelerazione, forza vera; centrifuga, Coriolis ed Euler solo sulla piattaforma
  const arrows = {};
  for (const k of ['A', 'B']) {
    arrows[k] = {};
    for (const [n, c] of Object.entries(VEC)) {
      const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, c, 0.035, 0.022);
      a.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 7; });
      a.visible = false;
      world.add(a);
      arrows[k][n] = a;
    }
  }

  // ───────────────────────── stato ─────────────────────────
  let motorOn = false, paused = false, simT = 0, recT = 0, regimeT = null, autoRelease = null, pendingView = null;
  const hist = { t: [], FA: [], FB: [], vA: [], vB: [], sA: [], sB: [] };
  const path = { A: [], B: [] };            // [x, y, z, xr, zr] per campione
  let fpsEma = 60, hudTimer = 0, vecScale = { v: 1, a: 1, F: 1 };

  const active = () => (state.useB ? ['A', 'B'] : ['A']);
  const targetOmega = () => (state.dir * state.rpm * TWO_PI) / 60;

  function applyGeometry() {
    pucks.A.r = state.rA; pucks.A.m = state.mA; pucks.B.r = state.rB; pucks.B.m = state.mB;
    rig.setArms(active().map((k) => ({ phi: pucks[k].phi, r: pucks[k].r, color: COL[k] })));
    rig.setPucks(active().map((k) => ({ key: k, m: pucks[k].m, color: COL[k] })));
    rig.setGate(state.rA);
    for (const k of active()) if (pucks[k].state === 'arm') pucks[k].attach(motor);
    // scale dei vettori: le lunghezze sono confrontabili fra i due dischi e restano leggibili
    const w = Math.max(Math.abs(targetOmega()), 0.5);
    let vm = 0, am = 0, Fm = 0;
    for (const k of active()) { const U = uniform(w, pucks[k].r, pucks[k].m); vm = Math.max(vm, U.v); am = Math.max(am, U.a); Fm = Math.max(Fm, U.F); }
    vecScale = { v: 0.24 / vm, a: 0.24 / am, F: 0.24 / Fm };
    rig.setShadowRig(state.shadow);
  }

  function reset() {
    motor.stopNow(); motorOn = false;
    for (const k of ['A', 'B']) pucks[k].attach(motor);
    gate.reset();
    for (const key of Object.keys(hist)) hist[key].length = 0;
    path.A.length = 0; path.B.length = 0;
    simT = 0; recT = 0; regimeT = null; autoRelease = null; paused = false;
    ui.setMotor(false);
  }

  function release() { paused = false; for (const k of active()) pucks[k].release(); }

  // ───────────────────────── simulazione ─────────────────────────
  function step(dt) {
    let left = dt;
    while (left > 1e-12) {
      const h = Math.min(SUB, left);
      const th0 = motor.theta;
      motor.step(h);
      simT += h; left -= h;
      for (const k of active()) pucks[k].step(h, motor);
      if (pucks.A.state === 'arm' && motor.omega !== 0) gate.check(th0 + pucks.A.phi, motor.theta + pucks.A.phi, simT, h);
      if (simT - recT >= REC) { recT = simT; record(); }
    }
    // sgancio automatico (esperimenti classici): qualche istante dopo aver raggiunto il regime
    if (motorOn && regimeT === null && motor.omega === motor.target && motor.target !== 0) regimeT = simT;
    if (autoRelease !== null && regimeT !== null && simT - regimeT >= autoRelease) { release(); autoRelease = null; }
  }

  function record() {
    const t = simT, th = motor.theta, c = Math.cos(th), s = Math.sin(th);
    hist.t.push(t);
    for (const k of ['A', 'B']) {
      const p = pucks[k];
      const on = k === 'A' || state.useB;
      hist['F' + k].push(on ? p.Fr : null);
      hist['v' + k].push(on ? p.speed : null);
      hist['s' + k].push(on && p.state !== 'rest' && p.state !== 'floor' ? -p.p.z : null);
      if (on) {
        path[k].push([p.p.x, p.p.y, p.p.z, p.p.x * c - p.p.z * s, p.p.x * s + p.p.z * c]);
        if (path[k].length > 1200) path[k].shift();
      }
    }
    while (hist.t.length && hist.t[0] < t - SPAN - 1) for (const key of Object.keys(hist)) hist[key].shift();
  }

  // ───────────────────────── disegno ─────────────────────────
  const v3 = new THREE.Vector3(), o3 = new THREE.Vector3();
  function setArrow(a, show, origin, vx, vz, len) {
    a.visible = show && len > 0.004;
    if (!a.visible) return;
    a.position.copy(origin);
    a.setDirection(v3.set(vx, 0, vz).normalize());
    const L = Math.min(len, 0.7);
    a.setLength(L, Math.min(0.04, L * 0.35), Math.min(0.024, L * 0.22));
  }

  function draw() {
    const rot = state.frame === 'rot';
    rig.disc.rotation.y = motor.theta;
    world.rotation.y = rot ? -motor.theta : 0;
    const w = motor.omega, al = motor.alpha;
    const shadows = [];
    for (const k of ['A', 'B']) {
      const p = pucks[k], on = active().includes(k);
      if (on) {
        rig.placePuck(k, p.p, p.state === 'arm' ? p.spin : p.spinFree ?? (p.spinFree = p.spin));
        if (p.state === 'arm') p.spinFree = undefined;
        shadows.push({ y: p.p.y, h: rig.pucks[k].height, z: p.p.z });
      }
      // traiettorie
      for (const fr of ['lab', 'rot']) {
        const T = trails[k][fr];
        T.buf.reset();
        if (on && state.trail && fr === (rot ? 'rot' : 'lab')) {
          const pts = path[k], c = new THREE.Color(COL[k]);
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            if (fr === 'lab') T.buf.push(a[0], a[1] + 0.012, a[2], b[0], b[1] + 0.012, b[2], c, 0, 1);
            else T.buf.push(a[3], a[1] + 0.012, a[4], b[3], b[1] + 0.012, b[4], c, 0, 1);
          }
        }
        T.buf.commit();
      }
      // vettori, applicati al centro del disco poco sopra la piattaforma
      const A = arrows[k];
      const live = on && p.state !== 'rest';
      o3.set(p.p.x, p.p.y + 0.03, p.p.z);
      setArrow(A.v, live && state.vVec && !rot, o3, p.v.x, p.v.z, p.speed * vecScale.v);
      setArrow(A.a, live && state.aVec && !rot && p.state === 'arm', o3, p.a.x, p.a.z, Math.hypot(p.a.x, p.a.z) * vecScale.a);
      const Fx = p.m * p.a.x, Fz = p.m * p.a.z;
      setArrow(A.F, live && state.fVec && p.state === 'arm', o3, Fx, Fz, Math.hypot(Fx, Fz) * vecScale.F);
      // forze apparenti, viste da chi ruota con la piattaforma
      const showFict = live && state.fVec && rot && (p.state === 'arm' || p.state === 'free');
      const m = p.m, x = p.p.x, z = p.p.z;
      setArrow(A.cf, showFict, o3, x, z, m * w * w * Math.hypot(x, z) * vecScale.F);
      const vrx = p.v.x - w * z, vrz = p.v.z + w * x;
      const cx = -2 * m * w * vrz, cz = 2 * m * w * vrx;
      setArrow(A.cor, showFict && p.state === 'free', o3, cx, cz, Math.hypot(cx, cz) * vecScale.F);
      const ex = -m * al * z, ez = m * al * x;
      setArrow(A.eul, showFict && p.state === 'arm' && al !== 0, o3, ex, ez, Math.hypot(ex, ez) * vecScale.F);
    }
    if (state.shadow) rig.placeShadows(shadows);
    gate.flash = Math.max(0, gate.flash - 0.08);
    rig.setGateFlash(gate.flash);
    rig.setDisplay((motor.omega * 60) / TWO_PI, Math.sign(motor.omega));
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    const A = pucks.A, w = motor.omega;
    const attached = active().some((k) => pucks[k].state === 'arm');
    ui.setForce(A.Fr, motorOn && A.state === 'arm');
    const T = gate.period;
    ui.setSide(`periodo misurato ${isFinite(T) && A.state === 'arm' && Math.abs(w) > 0.05 ? fmt.s(T) : '—'}`, `ω ${fmt.num(Math.abs(w), 2)} rad/s · ${gate.count} passaggi`);
    const status = paused ? 'in pausa' : !attached ? 'sganciato' : !motorOn && w === 0 ? 'fermo' : motor.alpha !== 0 ? (Math.abs(motor.target) > Math.abs(w) ? 'accelera' : 'rallenta') : 'a regime';
    ui.setStatus(status, motor.alpha !== 0 && !paused);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    ui.setReleaseEnabled(attached);
    ui.setRows(active().map((k) => {
      const p = pucks[k];
      const where = { arm: '', free: ' · libero', air: ' · in volo', floor: ' · a terra', rest: ' · fermo a terra' }[p.state];
      return { key: k, color: COL[k], name: `Disco ${k}<small>r ${fmt.cm(p.r)} · ${fmt.g(p.m)}${where}</small>`, t: p.state === 'arm' ? fmt.N(p.Fr) : '0 N', v: fmt.ms(p.speed) };
    }));
  }

  function metrics() {
    const w = motor.omega, A = pucks.A, U = uniform(w, A.r, A.m), UB = state.useB ? uniform(w, pucks.B.r, pucks.B.m) : null;
    const cells = [
      { k: 'Periodo', v: isFinite(U.T) ? `${fmt.num(U.T, 3)} <small>s</small>` : '—', s: `f ${fmt.num(U.f, 3)} Hz · ${fmt.num(U.rpm, 1)} giri/min`, title: 'Tempo per un giro: T = 2π/ω' },
      { k: 'Velocità angolare', p: 2, v: `${fmt.num(Math.abs(w), 3)} <small>rad/s</small>`, s: 'ω = 2π/T' },
      { k: 'Velocità', v: `${fmt.num(U.v, 3)} <small>m/s</small>`, s: UB ? `B ${fmt.num(UB.v, 3)} · v = ω·r` : 'v = ω·r', title: 'Velocità del disco A lungo il cerchio' },
      { k: 'Accel. centripeta', v: `${fmt.num(U.a, 2)} <small>m/s²</small>`, s: `${fmt.num(U.a / G, 2)} g · a = ω²·r`, title: 'Accelerazione verso il centro del disco A' },
      { k: 'Forza centripeta', v: `${fmt.num(U.F, 3)} <small>N</small>`, s: UB ? `B ${fmt.num(UB.F, 3)} · F = m·ω²·r` : 'F = m·ω²·r', title: 'Forza che il braccio esercita sul disco A verso il centro' },
    ];
    if (motor.alpha !== 0) cells.push({ k: 'Accel. tangenziale', p: 3, v: `${fmt.num(Math.abs(motor.alpha) * A.r, 2)} <small>m/s²</small>`, s: 'aₜ = α·r, durante l\'avvio' });
    ui.setMetrics(cells);
    ui.setFrameNote(state.frame === 'rot'
      ? 'Ruoti con la piattaforma: il disco agganciato ti sembra fermo. Per spiegarlo servono le forze apparenti: <b>centrifuga</b> (arancione) e, dopo lo sgancio, <b>di Coriolis</b> (rosa).'
      : 'Sei fermo nel laboratorio: un sistema di riferimento inerziale.');
  }

  function drawPlot() {
    const kind = state.plotKind, keys = active();
    const series = keys.map((k) => ({ color: COL[k], y: hist[(kind === 'F' ? 'F' : kind === 'v' ? 'v' : 's') + k] }));
    let lo = 0, hi = 0.1;
    if (kind === 'x') { const r = Math.max(...keys.map((k) => pucks[k].r)) * 1.25; lo = -Math.max(r, 0.7); hi = -lo; } else {
      for (const s of series) for (const v of s.y) if (v !== null && isFinite(v)) hi = Math.max(hi, v);
      const w = Math.max(Math.abs(targetOmega()), Math.abs(motor.omega));
      for (const k of keys) { const U = uniform(w, pucks[k].r, pucks[k].m); hi = Math.max(hi, kind === 'F' ? U.F : U.v); }
      hi *= 1.2;
    }
    ui.drawPlot({ kind, t: hist.t, series, span: SPAN, lo, hi, now: Math.max(simT, SPAN) });
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, { presets: PRESETS, views: VIEWS }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        reset();
        ui.refresh(); ui.sync();
        applyGeometry(); metrics();
        if (p[4].start) { motorOn = true; motor.target = targetOmega(); motor.alphaMax = state.alpha; ui.setMotor(true); }
        autoRelease = p[4].release ?? null;
        pendingView = p[4].view || 'overview';
        break;
      }
      case 'motor':
        motorOn = !motorOn; paused = false;
        if (motorOn && active().every((k) => pucks[k].state !== 'arm')) { for (const k of active()) pucks[k].attach(motor); gate.reset(); }
        motor.target = motorOn ? targetOmega() : 0; regimeT = null;
        ui.setMotor(motorOn);
        break;
      case 'release': release(); break;
      case 'pause': togglePause(); break;
      case 'reset': reset(); applyGeometry(); break;
      case 'rpm': case 'dir': if (motorOn) motor.target = targetOmega(); regimeT = null; applyGeometry(); metrics(); break;
      case 'alpha': motor.alphaMax = state.alpha; break;
      case 'rA': case 'mA': case 'rB': case 'mB': case 'useB':
        ui.sync();
        if (key === 'useB' && state.useB) pucks.B.attach(motor);
        applyGeometry(); metrics(); break;
      case 'frame': metrics(); break;
      case 'shadow': rig.setShadowRig(state.shadow); break;
      case 'plotKind': ui.sync(); break;
      case 'view': setView(arg); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      default: break;
    }
  });
  /** C'è qualcosa in moto: la piattaforma gira, o un disco sganciato scivola o vola. */
  const moving = () => motorOn || motor.omega !== 0 || active().some((k) => pucks[k].state === 'free' || pucks[k].state === 'air' || pucks[k].state === 'floor');
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }

  // ───────────────────────── etichette ─────────────────────────
  const tSensor = tags.add('', 'nocase', (o) => o.set(0.11 * Math.cos(motor.theta), ARM_Y + 0.012, -0.11 * Math.sin(motor.theta)).applyMatrix4(world.matrixWorld), () => pucks.A.state === 'arm');
  tags.add('Fotocellula', '', (o) => o.copy(rig.gateTip).setY(GATE.y + 0.03).applyMatrix4(world.matrixWorld));
  tags.add('Piattaforma rotante', '', (o) => o.set(0.42, DISC_Y, 0.42).applyMatrix4(world.matrixWorld), () => state.frame === 'lab');
  tags.add('Schermo', '', (o) => o.set(-1.2, 1.17, 0.55).applyMatrix4(world.matrixWorld), () => state.shadow);
  tags.add('Lampada', '', (o) => o.set(2.05, 0.92, 0).applyMatrix4(world.matrixWorld), () => state.shadow);

  // ───────────────────────── inquadrature ─────────────────────────
  function viewPose(id) {
    const k = Math.max(1, Math.min(2.4, 1.15 / camera.aspect));
    const P = (pos, target) => ({ pos: pos.map((p, i) => target[i] + (p - target[i]) * k), target });
    switch (id) {
      case 'top': return P([0.02, 3.9, 0.45], [0.05, DISC_Y, 0.05]);
      case 'side': return P([0.25, 1.0, 2.05], [0, 0.82, 0]);
      case 'screen': return P([2.75, 1.6, 1.05], [-0.45, 0.86, 0]);
      case 'gate': return P([0.6, 1.2, 0.05], [0, 0.92, -0.45]);
      default: return P([1.35, 1.8, 1.9], [0, 0.72, 0]);
    }
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); document.getElementById('motor').click(); } else if (k === 's') release(); else if (k === 'p') togglePause();
    else if (k === 'r') { reset(); applyGeometry(); } else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000, metricsT = 0, plotT = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (pendingView) { setView(pendingView); pendingView = null; }
    motor.alphaMax = state.alpha;
    // tutto fermo (motore spento, piattaforma ferma, dischi agganciati o a terra fermi): il tempo non scorre,
    // e con lui i grafici
    const idle = !motorOn && motor.omega === 0 && active().every((k) => pucks[k].state === 'arm' || pucks[k].state === 'rest');
    if (!paused && !idle) step(dt * state.slow);
    draw();
    stage.outlined = state.outline ? active().map((k) => rig.pucks[k]?.group) : [];
    stage.update(dt);
    world.updateMatrixWorld();
    hud();
    tags.setText(tSensor, `Sensore · ${fmt.N(pucks.A.Fr)}`);
    tags.update(camera, w, h, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt; metricsT += dt; plotT += dt;
    if (metricsT > 0.1) { metricsT = 0; metrics(); }
    if (plotT > 0.05) { plotT = 0; drawPlot(); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  applyGeometry(); reset(); metrics();
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico nel tempo', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, motor, pucks, gate, release, reset, togglePause, paused: () => paused, setView, plotView, simT: () => simT, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
