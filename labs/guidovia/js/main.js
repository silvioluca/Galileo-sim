// main.js — La guidovia
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { Sim, TRACK, CART, BUMPERS, PULLEY, HOOK, G, sinTilt, idealAccel } from './track.js';
import { Rig, YB, Y, BENCH, PAD, CART_COL, TIMER } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const VEC = { v: '#0c9d8f', p: '#7a47cf', F: '#e07b1f', cm: '#d99a12' };
const BLAST = 0.015;                         // compressione della molla nell'esplosione
const T_MAX = 40;                            // durata massima di una prova libera
const GH = 120;                              // immagini stroboscopiche al massimo, per carrello
const MAX_RUNS = 4;

const state = {
  air: true, bands: true, shim: 0,
  n: 2, mA: 0.2, mB: 0.2, vA: 0.4, vB: 0, xA: 0.35, xB: 1.0,
  bumper: 'spring', blast: false,
  pull: false, mh: 0.02, drop: 0.5,
  gates: 2, g1: 0.6, gsp: 0.6, flag: 0.05,
  slow: 1,
  strobe: false, strobeHz: 5, vVec: true, pVec: false, fVec: false, cm: false, keep: true, outline: false, labels: true,
  quality: 'low', plotKind: 'v',
};
const BASE = { air: true, bands: true, shim: 0, n: 2, mA: 0.2, mB: 0.2, vA: 0.4, vB: 0, xA: 0.35, xB: 1.0, bumper: 'spring', blast: false, pull: false, mh: 0.02, drop: 0.5, gates: 2, g1: 0.6, gsp: 0.6, flag: 0.05, strobe: false, strobeHz: 5, vVec: true, pVec: false, fVec: false, cm: false, keep: true, plotKind: 'v' };
const PHYS = new Set(['air', 'bands', 'shim', 'n', 'mA', 'mB', 'vA', 'vB', 'xA', 'xB', 'bumper', 'blast', 'pull', 'mh', 'drop', 'gates', 'g1', 'gsp', 'flag']);
// [id, testo, descrizione, impostazioni, {seq: prove in sequenza (impostazioni e durata), view}]
const PRESETS = [
  ['uniform', 'Moto rettilineo uniforme', 'Rotaia in piano e una spinta: spazi uguali in tempi uguali', { n: 1, vA: 0.3, xA: 0.25, gates: 4, g1: 0.5, gsp: 0.4, strobe: true, strobeHz: 2, plotKind: 'x' }, { seq: [{ dur: 5.2 }], view: 'side' }],
  ['incline', 'Piano inclinato', 'Due spessori da 1 cm, partenza da ferma: la velocità cresce in proporzione al tempo', { n: 1, shim: 20, vA: 0, xA: 0.2, gates: 4, g1: 0.45, gsp: 0.4, strobe: true, strobeHz: 2, plotKind: 'v' }, { seq: [{ dur: 4.85 }], view: 'side' }],
  ['pull', 'Pesetto e carrucola', 'Un pesetto da 20 g tira un carrello da 200 g; quando tocca terra il moto diventa uniforme', { n: 1, pull: true, mh: 0.02, drop: 0.5, vA: 0, xA: 0.2, gates: 4, g1: 0.45, gsp: 0.4, plotKind: 'v' }, { seq: [{ dur: 2.25 }], view: 'overview' }],
  ['newton', 'Seconda legge di Newton', 'Stessa forza, massa doppia: l\'accelerazione si dimezza', { n: 1, pull: true, mh: 0.02, drop: 0.5, vA: 0, xA: 0.2, gates: 2, g1: 0.4, gsp: 0.4, plotKind: 'v', keep: true }, { seq: [{ mA: 0.2, dur: 2.0 }, { mA: 0.4, dur: 2.6 }], view: 'overview' }],
  ['elastic', 'Urto elastico, masse uguali', 'A colpisce B fermo: A si ferma, B parte con la velocità di A', { n: 2, bumper: 'spring', vA: 0.4, vB: 0, xA: 0.3, xB: 1.0, gates: 2, g1: 0.7, gsp: 0.6, cm: true, plotKind: 'v' }, { seq: [{ dur: 3.3 }], view: 'side' }],
  ['masses', 'Urto elastico, masse diverse', 'Il carrello pesante spinge avanti il leggero; il leggero rimbalza sul pesante', { n: 2, bumper: 'spring', vA: 0.4, vB: 0, xA: 0.3, xB: 1.0, gates: 2, g1: 0.7, gsp: 0.6, plotKind: 'v', keep: true }, { seq: [{ mA: 0.4, mB: 0.2, dur: 2.9 }, { mA: 0.2, mB: 0.4, dur: 2.9 }], view: 'side' }],
  ['velcro', 'Urto anelastico', 'Con il velcro i carrelli restano uniti: la quantità di moto si conserva, metà dell\'energia cinetica no', { n: 2, bumper: 'velcro', vA: 0.4, vB: 0, xA: 0.3, xB: 1.0, gates: 2, g1: 0.7, gsp: 0.6, cm: true, plotKind: 'E' }, { seq: [{ dur: 3.6 }], view: 'side' }],
  ['headon', 'Urto frontale', 'Due carrelli uguali si vengono incontro alla stessa velocità: rimbalzano indietro, il centro di massa resta fermo', { n: 2, bumper: 'spring', vA: 0.35, vB: -0.35, xA: 0.4, xB: 1.4, gates: 0, cm: true, plotKind: 'x' }, { seq: [{ dur: 3.0 }], view: 'side' }],
  ['blast', 'Esplosione', 'Una molla compressa fra due carrelli fermi: si separano con quantità di moto uguali e opposte', { n: 2, bumper: 'spring', blast: true, mA: 0.2, mB: 0.4, xA: 0.85, gates: 0, cm: true, pVec: true, vVec: false, plotKind: 'p' }, { seq: [{ dur: 1.3 }], view: 'side' }],
  ['noair', 'Senza cuscino d\'aria', 'La stessa spinta con la soffiante accesa e poi spenta: l\'attrito radente ferma il carrello in pochi centimetri', { n: 1, vA: 0.5, xA: 0.3, gates: 1, g1: 0.5, plotKind: 'v', keep: true }, { seq: [{ air: true, dur: 2.5 }, { air: false, dur: 1.0 }], view: 'side' }],
];
const VIEWS = [['overview', 'Panoramica'], ['side', 'Di fronte'], ['gates', 'Fotocellula'], ['hit', 'Urto'], ['follow', 'Segui A']];
const PLOTS = { x: 'x(t)', v: 'v(t)', a: 'a(t)', p: 'p(t)', E: 'E(t)' };

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-0.6, 4.6, 2.6], keyTarget: [0.9, 0.6, 0], shadowBox: [-2.0, 2.0, 1.7, -1.7], shadowFar: 9, fog: [14, 80] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── vettori, centro di massa, filo dell'esplosione, immagini stroboscopiche ─────────────────────────
  const mkArrow = (c) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, c, 0.02, 0.012);
    a.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 7; });
    a.visible = false;
    rig.trk.add(a);
    return a;
  };
  const arrows = [0, 1].map(() => ({ v: mkArrow(VEC.v), p: mkArrow(VEC.p), F: mkArrow(VEC.F) }));
  const cmMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.009), new THREE.MeshStandardMaterial({ color: VEC.cm, metalness: 0.3, roughness: 0.4, emissive: VEC.cm, emissiveIntensity: 0.25 }));
  cmMark.userData.noAO = true; cmMark.visible = false;
  rig.trk.add(cmMark);
  const cmLine = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 1, 6), new THREE.MeshBasicMaterial({ color: VEC.cm, transparent: true, opacity: 0.6 }));
  cmLine.userData.noAO = true; cmLine.visible = false;
  rig.trk.add(cmLine);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 1, 6).rotateZ(Math.PI / 2), rig.M.string);
  thread.visible = false;
  rig.trk.add(thread);
  // immagini stroboscopiche: il piano superiore e la bandierina di ogni carrello, semitrasparenti
  const plateGeo = new THREE.BoxGeometry(CART.L, 0.004, 0.056).translate(0, Y.plate - 0.002, 0);
  const flagGeo = new THREE.BoxGeometry(1, Y.flagH, 0.002).translate(0, Y.flag0 + Y.flagH / 2, 0);
  const ghosts = [0, 1].map((i) => [plateGeo, flagGeo].map((geo, k) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: k ? '#15181c' : CART_COL[i], transparent: true, opacity: k ? 0.2 : 0.38, depthWrite: false, roughness: 0.5 }), GH);
    m.count = 0; m.frustumCulled = false; m.userData.noAO = true; m.renderOrder = 4;
    rig.trk.add(m);
    return m;
  }));

  // ───────────────────────── stato della prova ─────────────────────────
  let sim = null, running = false, paused = false, tLimit = T_MAX, runs = [], seq = null, dirty = true;
  let view = 'overview', pendingView = null, drag = null, fpsEma = 60, hudTimer = 0, plotAt = 0, ghostKey = '';
  const dummy = new THREE.Object3D(), v3 = new THREE.Vector3();

  const ext = () => BUMPERS[state.bumper].ext;
  const sinT = () => sinTilt(state.shim / 1000);
  const gateXs = () => { const out = []; for (let i = 0; i < state.gates; i++) { const x = state.g1 + i * state.gsp; if (x <= 1.85) out.push(Math.round(x * 1000) / 1000); } return out; };
  const masses = () => (state.n === 2 ? [state.mA, state.mB] : [state.mA]);

  /** Posizioni di partenza ammesse: dentro gli elastici, B a destra di A (a contatto e compressi nell'esplosione). */
  function fixPositions(moved) {
    const lo = 0.15, hi = 1.85, gap = CART.L + 2 * ext(), mm = (x) => Math.round(x * 1000) / 1000;
    state.xA = mm(Math.min(Math.max(state.xA, lo), hi));
    state.xB = mm(state.xB);
    if (state.n === 1) return;
    if (state.blast) {
      state.xA = Math.min(state.xA, hi - gap + BLAST);
      state.xB = state.xA + gap - BLAST;
      return;
    }
    state.xB = Math.min(Math.max(state.xB, lo), hi);
    if (state.xB - state.xA < gap + 0.005) {
      if (moved === 'xA') state.xB = state.xA + gap + 0.005; else state.xA = state.xB - gap - 0.005;
      if (state.xB > hi) { state.xB = hi; state.xA = hi - gap - 0.005; }
      if (state.xA < lo) { state.xA = lo; state.xB = lo + gap + 0.005; }
    }
  }

  function makeSim() {
    const carts = [{ key: 'A', m: state.mA, x: state.xA, v: state.blast ? 0 : state.vA }];
    if (state.n === 2) carts.push({ key: 'B', m: state.mB, x: state.xB, v: state.blast ? 0 : state.vB });
    return new Sim({ air: state.air, bands: state.bands, sinT: sinT(), carts, bumper: state.bumper, pull: state.pull ? { m: state.mh, drop: state.drop } : null, gates: gateXs(), flag: state.flag });
  }

  function go(dur) {
    sim = makeSim();
    running = true; paused = false;
    tLimit = dur || T_MAX;
    if (!state.keep) runs = [];
    runs.push({ sim, n: state.n });
    while (runs.length > MAX_RUNS) runs.shift();
    ghostKey = ''; plotAt = 0;
  }
  function stopRun() { sim = null; running = false; paused = false; ghostKey = ''; }
  /** Pausa: il tempo si ferma (anche le sequenze degli esperimenti); di nuovo per riprendere. */
  function togglePause() { if (running) paused = !paused; }

  // ───────────────────────── previsioni e note ─────────────────────────
  /** Velocità dopo l'urto secondo la teoria (e = restituzione; velcro: e = 0). */
  function predictHit() {
    if (state.n !== 2) return null;
    const mA = state.mA, mB = state.mB;
    if (state.blast) {
      const E = 0.5 * BUMPERS.spring.k * BLAST * BLAST * BUMPERS.spring.e;
      const vB = Math.sqrt((2 * E * mA) / (mB * (mA + mB)));
      return { vA: (-mB * vB) / mA, vB, blast: true, E };
    }
    const vA = state.vA, vB = state.vB;
    if (vA <= vB) return { none: true };
    const B = BUMPERS[state.bumper], e = B.stick ? 0 : B.e, P = mA * vA + mB * vB;
    return { vA: (P - mB * e * (vA - vB)) / (mA + mB), vB: (P + mA * e * (vA - vB)) / (mA + mB), e };
  }
  function pulledAccel() {
    const sT = sinT();
    if (!state.pull) return G * sT;
    const M = state.n === 2 ? state.mB : state.mA;
    return idealAccel(M, state.mh, sT);
  }

  function resolve() {
    rig.setTilt(state.shim / 1000);
    rig.setAir(state.air);
    rig.setBandsOn(state.bands);
    rig.setGates(gateXs());
    rig.setPull(state.pull, state.mh);
    for (let i = 0; i < 2; i++) {
      rig.setCart(i, {
        visible: i < state.n, m: i ? state.mB : state.mA, flag: state.flag, bumper: state.bumper,
        facing: state.n === 2 ? (i ? -1 : 1) : 0, hook: state.pull && i === state.n - 1,
      });
    }
    const sT = sinT();
    ui.setNote('#tilt-note', state.shim ? `La rotaia sale di <b>${state.shim} mm</b> su <b>150 cm</b> fra i piedi: g·sin θ = <b>${fmt.num(G * sT, 3)} m/s²</b>.` : '');
    const P = predictHit();
    let hn = '';
    if (P && P.blast) hn = `Energia della molla ≈ <b>${fmt.num(P.E * 1000, 1)} mJ</b>. Previsione: A a <b>${fmt.sgn(P.vA)} m/s</b>, B a <b>${fmt.sgn(P.vB)} m/s</b>.`;
    else if (P && P.none) hn = 'Con queste spinte i carrelli non si raggiungono.';
    else if (P) hn = `Previsione dopo l'urto${P.e ? ` (e = ${fmt.num(P.e, 2)})` : ''}: A a <b>${fmt.sgn(P.vA)} m/s</b>, B a <b>${fmt.sgn(P.vB)} m/s</b>.`;
    ui.setNote('#hit-note', hn);
    if (state.pull) {
      const a = pulledAccel(), v = Math.sqrt(2 * a * state.drop);
      ui.setNote('#pull-note', `a = (m·g${state.shim ? ' + M·g·sin θ' : ''}) / (M + m) = <b>${fmt.num(a, 3)} m/s²</b>; dopo ${fmt.cm(state.drop)} il pesetto tocca terra e il carrello prosegue a <b>${fmt.num(v, 3)} m/s</b> (senza attriti).`);
    } else ui.setNote('#pull-note', '');
    ui.sync();
    ghostKey = '';
  }

  // ───────────────────────── sequenze degli esperimenti classici ─────────────────────────
  function stepSeq(dtReal) {
    if (!seq || paused) return;
    const item = seq.list[seq.i];
    if (seq.phase === 'apply') {
      const { dur, ...patch } = item;
      void dur;
      Object.assign(state, patch);
      fixPositions();
      resolve(); ui.refresh(); ui.sync();
      stopRun();
      if (seq.i === 0 && seq.view) pendingView = seq.view;
      seq.phase = 'wait'; seq.t = 0;
    } else if (seq.phase === 'wait') {
      seq.t += dtReal;
      if (seq.t > (seq.i === 0 ? 1.1 : 0.6)) { go(item.dur); seq.phase = 'run'; }
    } else if (seq.phase === 'run' && !running) {
      seq.i++;
      if (seq.i >= seq.list.length) seq = null; else seq.phase = 'apply';
    }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, { feet: TRACK.feet, bumpers: Object.entries(BUMPERS), presets: PRESETS, views: VIEWS }, (key, arg) => {
    if (PHYS.has(key)) {
      seq = null;
      if (key === 'bumper' && state.bumper !== 'spring') state.blast = false;
      fixPositions(key);
      stopRun();
      dirty = true;
      ui.refresh();
      return;
    }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        stopRun(); runs = [];
        Object.assign(state, BASE, p[3]);
        fixPositions();
        ui.refresh(); resolve();
        seq = { list: p[4].seq, i: 0, phase: 'apply', view: p[4].view };
        break;
      }
      case 'view': setView(arg); break;
      case 'go': seq = null; go(); break;
      case 'pause': togglePause(); break;
      case 'reset': seq = null; stopRun(); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'keep': if (!state.keep) runs = runs.slice(-1); plotAt = 0; break;
      case 'strobe': case 'strobeHz': ui.sync(); ghostKey = ''; break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const cartX = (i) => (sim ? sim.carts[i]?.x ?? (i ? state.xB : state.xA) : i ? state.xB : state.xA);
  // carrelli vicini: una sola etichetta a metà, con tutte e due le velocità
  const close = () => state.n === 2 && cartX(1) - cartX(0) < 0.3;
  const cartTags = [0, 1].map((i) => tags.add('', 'nocase', (o) => rig.toWorld(i === 0 && close() ? (cartX(0) + cartX(1)) / 2 : cartX(i), Y.flag0 + Y.flagH + 0.075, 0, o), () => i < state.n && !(i === 1 && close())));
  const tShim = tags.add('', 'nocase', (o) => o.set(TRACK.footL, YB + state.shim / 1000 + 0.012, 0.06), () => state.shim > 0);
  const tMass = tags.add('', 'nocase', (o) => o.copy(rig.hanger.position).add(v3.set(0.02, 0.04, 0)), () => state.pull);
  const tCm = tags.add('CM', 'nocase', (o) => o.copy(cmMark.getWorldPosition(v3)).add(new THREE.Vector3(0, 0.02, 0)), () => state.cm && state.n === 2);
  const tHit = tags.add('', 'nocase', (o) => { const h = lastHit(); const xm = h.x; rig.toWorld(xm, Y.nose + 0.05, 0, o); }, () => { const h = lastHit(); return !!h && sim.t - h.t1 < 2.5; });
  function lastHit() {
    if (!sim || !sim.hits.length) return null;
    const h = sim.hits[sim.hits.length - 1];
    if (h.x === undefined) { const i = sim.rec.t.findIndex((t) => t >= h.t0); h.x = i >= 0 && sim.rec.x[1] ? (sim.rec.x[0][i] + sim.rec.x[1][i]) / 2 : sim.carts[0].x; }
    return h;
  }

  // ───────────────────────── inquadrature ─────────────────────────
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (W <= 860) return { x0: m, x1: W - m, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : W) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dir, pts) {
    const cam = camera.clone(), rect = freeRect(), W = window.innerWidth, H = window.innerHeight;
    const box = new THREE.Box3().setFromPoints(pts), target = box.getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) {
        pv.copy(p).project(cam);
        if (pv.z > 1 || pv.z < -1) behind = true;
        const x = (pv.x * 0.5 + 0.5) * W, y = (-pv.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.1, hi = 60;
      for (let k = 0; k < 30; k++) {
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
  const V = (...p) => new THREE.Vector3(...p);
  function viewPose(id) {
    const B = BENCH, top = YB + 0.24;
    switch (id) {
      case 'side': return fitPose(V(0, 0.2, 1).normalize(), [V(-0.07, YB, 0.06), V(2.07, YB, 0.06), V(-0.07, top, 0), V(2.08, top, 0)]);
      case 'gates': {
        const xs = gateXs(), x = xs.length ? xs[0] : 1;
        return { pos: [x + 0.32, YB + 0.42, 0.62], target: [x, YB + 0.17, 0] };
      }
      case 'hit': {
        const xm = state.n === 2 ? (cartX(0) + cartX(1)) / 2 : cartX(0) + 0.3;
        return { pos: [xm + 0.18, YB + 0.36, 0.6], target: [xm, YB + 0.16, 0] };
      }
      case 'follow': { const x = cartX(0); return { pos: [x + 0.35, YB + 0.42, 0.9], target: [x, YB + 0.15, 0] }; }
      default: {
        // il piano del banco con la rotaia; il pavimento solo se c'è il pesetto
        const pts = [V(-0.42, YB - 0.03, B.z1), V(B.x1 + 0.05, YB - 0.03, B.z1), V(-0.42, YB + 0.18, TIMER.z), V(B.x1 + 0.08, top, 0), V(0.4, YB + 0.25, B.z0 + 0.1)];
        if (state.pull) pts.push(V(PAD.x, 0, 0.08));
        return fitPose(V(0.16, 0.5, 1).normalize(), pts);
      }
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    // su schermi stretti la panoramica sta più lontana: la telecamera deve poterci arrivare
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(9, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── trascinamento dei carrelli ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), inv = new THREE.Matrix4();
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pick = (e) => { ray(e); return raycaster.intersectObjects(rig.dragTargets.filter((m) => m.userData.drag < state.n), false)[0]; };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) return;
    // durante una prova il carrello si prende dov'è
    if (sim && !state.blast) { state.xA = sim.carts[0].x; if (state.n === 2) state.xB = sim.carts[1].x; fixPositions(); ui.refresh('xA'); ui.refresh('xB'); }
    seq = null; stopRun(); dirty = true;
    const i = hit.object.userData.drag;
    rig.trk.updateWorldMatrix(true, false); inv.copy(rig.trk.matrixWorld).invert();
    const local = hit.point.clone().applyMatrix4(inv);
    drag = { i, off: local.x - (i ? state.xB : state.xA) };
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      ray(e);
      if (raycaster.ray.intersectPlane(plane, v3)) {
        const x = Math.round((v3.applyMatrix4(inv).x - drag.off) * 200) / 200, key = drag.i ? 'xB' : 'xA';
        if (state.blast && drag.i === 1) state.xA = x - (CART.L + 2 * ext() - BLAST); else state[key] = x;
        fixPositions(drag.i && !state.blast ? 'xB' : 'xA');
        ui.refresh('xA'); ui.refresh('xB'); dirty = true;
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
    if (k === ' ') { e.preventDefault(); seq = null; go(); } else if (k === 'r') { seq = null; stopRun(); } else if (k === 'p') togglePause(); else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── disegno di un istante ─────────────────────────
  function setArrow(a, show, x, y, z, dir, len) {
    a.visible = show && Math.abs(len) > 0.002;
    if (!a.visible) return;
    a.position.set(x, y, z);
    a.setDirection(v3.set(Math.sign(dir) || 1, 0, 0));
    const L = Math.min(Math.abs(len), 0.45), head = Math.min(0.018, L * 0.4);
    a.setLength(L, head, head * 0.65);
  }
  /** Stato interpolato dalla registrazione all'istante t. */
  function recAt(s, i, t) {
    const T = s.rec.t;
    let lo = 0, hi = T.length - 1;
    if (t >= T[hi]) return s.rec.x[i][hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    const f = (t - T[lo]) / (T[hi] - T[lo] || 1);
    return s.rec.x[i][lo] + (s.rec.x[i][hi] - s.rec.x[i][lo]) * f;
  }

  function place() {
    const n = state.n, L2 = CART.L / 2;
    const xs = [0, 1].map((i) => cartX(i));
    // respingenti compressi (metà ciascuno), elastici deformati
    let comp = 0;
    if (n === 2 && state.bumper !== 'velcro') comp = Math.max(0, xs[0] + L2 + ext() - (xs[1] - L2 - ext())) / 2;
    for (let i = 0; i < n; i++) rig.placeCart(i, xs[i], comp);
    const right = xs[n - 1];
    rig.setBands(TRACK.bandL - (xs[0] - L2 - CART.nose), right + L2 + CART.nose - TRACK.bandR);
    // filo che tiene unita la coppia prima dell'esplosione
    thread.visible = n === 2 && state.blast && !sim;
    if (thread.visible) { const a = xs[0] + L2 - 0.004, b = xs[1] - L2 + 0.004; thread.position.set((a + b) / 2, Y.plate + 0.026, 0); thread.scale.set(1, b - a, 1); }
    // pesetto e carrucola
    if (state.pull) {
      const d = sim && sim.pull ? sim.pull.d : 0;
      rig.placePull(right + L2 + HOOK, PAD.top + state.drop - d, d / PULLEY.r);
    }
    // fotocellule
    for (let g = 0; g < rig.gates.length; g++) rig.setGateLed(g, sim ? sim.gates[g]?.blocked.some(Boolean) : xs.slice(0, n).some((x) => Math.abs(x - rig.gates[g].x) < state.flag / 2));
    const lp = sim && sim.passes.length ? sim.passes[sim.passes.length - 1] : null;
    rig.setTimer(lp ? lp.dt.toFixed(4) : '0.0000');
    // vettori
    const ms = masses();
    for (let i = 0; i < 2; i++) {
      const on = i < n, v = sim ? sim.carts[i]?.v ?? 0 : state.blast ? 0 : i ? state.vB : state.vA;
      const a = sim ? sim.carts[i]?.a ?? 0 : 0, m = ms[i] || 0;
      setArrow(arrows[i].v, on && state.vVec, xs[i], Y.flag0 + Y.flagH + 0.022, 0, v, v * 0.3);
      setArrow(arrows[i].p, on && state.pVec, xs[i], Y.flag0 + Y.flagH + (state.vVec ? 0.046 : 0.022), 0, v, m * v * 1.6);
      setArrow(arrows[i].F, on && state.fVec && !!sim, xs[i], Y.plate - 0.02, 0.075, a, m * a * 0.25);
    }
    // centro di massa
    const show = state.cm && n === 2;
    cmMark.visible = cmLine.visible = show;
    if (show) {
      const xc = (ms[0] * xs[0] + ms[1] * xs[1]) / (ms[0] + ms[1]);
      cmMark.position.set(xc, Y.flag0 + Y.flagH + 0.012, 0); cmMark.rotation.y += 0.02;
      cmLine.position.set(xc, (Y.apex + Y.flag0 + Y.flagH) / 2, 0); cmLine.scale.set(1, Y.flag0 + Y.flagH - Y.apex, 1);
    }
    // foto stroboscopica
    if (state.strobe && sim) {
      const every = 1 / state.strobeHz, k = Math.floor(sim.t / every) + 1, key = `${runs.length}:${k}:${n}`;
      if (key !== ghostKey) {
        ghostKey = key;
        for (let i = 0; i < 2; i++) {
          const [gp, gf] = ghosts[i];
          if (i >= sim.n) { gp.count = gf.count = 0; continue; }
          const k0 = Math.max(0, k - GH);
          for (let j = k0; j < k; j++) {
            const x = recAt(sim, i, j * every);
            dummy.position.set(x, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); gp.setMatrixAt(j - k0, dummy.matrix);
            dummy.scale.set(state.flag, 1, 1); dummy.updateMatrix(); gf.setMatrixAt(j - k0, dummy.matrix);
          }
          gp.count = gf.count = k - k0; gp.instanceMatrix.needsUpdate = gf.instanceMatrix.needsUpdate = true;
        }
      }
    } else if (ghostKey !== 'off') { ghostKey = 'off'; ghosts.flat().forEach((g) => { g.count = 0; }); }
  }

  // ───────────────────────── cronometro, righe, misure ─────────────────────────
  function rowsData() {
    if (!sim) return [];
    const out = [], last = {};
    for (const p of sim.passes) {
      const mid = (p.tIn + p.tOut) / 2, prev = last[p.cart];
      let extra = `t ${fmt.num(p.tIn, 3)} s`;
      if (prev && prev.gate !== p.gate) extra += ` · a ${fmt.sgn((p.v - prev.v) / (mid - prev.mid), 3)} m/s²`;
      last[p.cart] = { gate: p.gate, v: p.v, mid };
      out.push({ t0: p.tIn, key: `p${p.gate}-${p.tIn.toFixed(5)}`, color: CART_COL[p.cart], name: `F${p.gate + 1} · ${p.key}<small>${extra}</small>`, t: fmt.ms(p.v), v: `Δt ${fmt.num(p.dt, 4)} s` });
    }
    const ms = sim.carts.map((c) => c.m), Ek = (vs) => vs.reduce((s, v, i) => s + 0.5 * ms[i] * v * v, 0);
    for (const h of sim.hits) {
      const blast = Math.abs(h.before[0] - h.before[1]) < 1e-6;
      const loss = Ek(h.before) > 0 ? (1 - Ek(h.after) / Ek(h.before)) * 100 : 0;
      const dur = `${fmt.num((h.t1 - h.t0) * 1000, 0)} ms · F max ${fmt.num(h.Fmax, 2)} N`;
      const name = h.stick ? `Urto · uniti<small>insieme a ${fmt.sgn(h.after[0])} m/s</small>` : blast ? `Esplosione<small>${dur}</small>` : `Urto<small>${dur}</small>`;
      const e = blast ? 0 : (h.after[1] - h.after[0]) / (h.before[0] - h.before[1]);
      out.push({ t0: h.t0, key: `h${h.t0.toFixed(5)}`, color: VEC.F, hit: true, name, t: h.stick ? `E −${fmt.num(loss, 0)} %` : `J ${fmt.num(h.J, 4)} N·s`, v: h.stick ? 'e 0' : blast ? `+${fmt.num(Ek(h.after) * 1000, 1)} mJ` : `e ${fmt.num(e, 2)}` });
    }
    return out.sort((a, b) => b.t0 - a.t0).slice(0, 12);
  }

  function hud() {
    const t = sim ? sim.t : 0;
    ui.setClock(t, running && !paused);
    let status = paused ? 'in pausa' : seq ? (seq.phase === 'run' ? 'in corsa' : 'preparo') : sim ? (running ? 'in corsa' : 'fermo') : 'pronto';
    if (seq) status += ` · ${seq.i + 1}/${seq.list.length}`;
    ui.setStatus(status, running && !paused);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', running);
    const lp = sim && sim.passes.length ? sim.passes[sim.passes.length - 1] : null;
    if (lp) ui.setSide(`F${lp.gate + 1} · ${lp.key} · Δt ${fmt.num(lp.dt, 4)} s`, `v = ${fmt.num(Math.abs(lp.v), 3)} m/s`);
    else if (sim && sim.pull && sim.pull.landed) ui.setSide('pesetto a terra', `dopo ${fmt.s(sim.pull.tLand)}`);
    else ui.setSide(state.gates ? `${gateXs().length} fotocellul${gateXs().length > 1 ? 'e' : 'a'}` : 'nessuna fotocellula', `bandierina ${fmt.cm(state.flag)}`);
    ui.setRows(rowsData(), !state.gates && !(sim && sim.hits.length) ? 'Aggiungi una fotocellula, poi premi «Via».' : 'Premi «Via» o la barra spaziatrice.');
    ui.setGo(sim && running ? 'Da capo' : 'Via');
    // misure
    const ms = masses(), vs = [0, 1].slice(0, state.n).map((i) => (sim ? sim.carts[i].v : state.blast ? 0 : i ? state.vB : state.vA));
    let p = 0, E = 0, M = 0;
    vs.forEach((v, i) => { p += ms[i] * v; E += 0.5 * ms[i] * v * v; M += ms[i]; });
    const p0 = sim ? sim.rec.v.reduce((s, arr, i) => s + ms[i] * arr[0], 0) : p;
    const E0 = sim ? sim.rec.v.reduce((s, arr, i) => s + 0.5 * ms[i] * arr[0] ** 2, 0) : E;
    const h = sim && sim.hits.length ? sim.hits[sim.hits.length - 1] : null;
    let Es = 'E = ½·m·v²';
    if (h) {
      const Eb = h.before.reduce((s, v, i) => s + 0.5 * ms[i] * v * v, 0), Ea = h.after.reduce((s, v, i) => s + 0.5 * ms[i] * v * v, 0);
      Es = Eb < 1e-9 ? `dalla molla +${fmt.num(Ea * 1000, 1)} mJ` : `nell'urto ${Ea <= Eb ? '−' : '+'}${fmt.num(Math.abs(1 - Ea / Eb) * 100, 1)} %`;
    }
    const a = pulledAccel(), sT = sinT();
    ui.setMetrics([
      { k: state.pull ? 'Accelerazione prevista' : 'Accelerazione', v: `${fmt.num(a, 3)} <small>m/s²</small>`, s: state.pull ? 'a = m·g / (M + m)' : state.shim ? 'a = g·sin θ' : 'nessuna forza: moto uniforme', title: 'Senza attriti. Il cuscino d\'aria la riduce di qualche percento' },
      { k: 'Velocità', v: vs.length === 2 ? `${fmt.sgn(vs[0], 2)} · ${fmt.sgn(vs[1], 2)} <small>m/s</small>` : `${fmt.sgn(vs[0], 3)} <small>m/s</small>`, s: vs.length === 2 ? 'A · B' : 'carrello A' },
      { k: 'Quantità di moto', p: 2, v: `${fmt.sgn(p, 4)} <small>kg·m/s</small>`, s: sim ? `alla partenza ${fmt.sgn(p0, 4)}` : 'p = Σ m·v', title: 'Somma di m·v dei carrelli' },
      { k: 'Energia cinetica', p: 2, v: `${fmt.num(E * 1000, 2)} <small>mJ</small>`, s: h ? Es : sim ? `alla partenza ${fmt.num(E0 * 1000, 2)} mJ` : Es },
      { k: 'Centro di massa', p: 3, v: `${fmt.sgn(p / M, 3)} <small>m/s</small>`, s: 'v = p / M', title: 'Velocità del centro di massa dei carrelli' },
      { k: 'Inclinazione', p: 3, v: `${fmt.num(Math.asin(sT) / DEG, 2)}°`, s: `g·sin θ = ${fmt.num(G * sT, 3)} m/s²` },
      { k: 'Masse', p: 3, v: state.n === 2 ? `${fmt.num(state.mA * 1000, 0)} · ${fmt.num(state.mB * 1000, 0)} <small>g</small>` : `${fmt.num(state.mA * 1000, 0)} <small>g</small>`, s: state.pull ? `pesetto ${fmt.g(state.mh)}` : state.n === 2 ? 'A · B' : 'carrello A' },
    ]);
    tags.setText(cartTags[0], close() ? `A ${fmt.sgn(vs[0])} · B ${fmt.sgn(vs[1])} m/s` : `A · ${fmt.ms(vs[0])}`);
    if (state.n === 2) tags.setText(cartTags[1], `B · ${fmt.ms(vs[1])}`);
    tags.setText(tShim, `spessori ${state.shim} mm`);
    tags.setText(tMass, `pesetto ${fmt.g(state.mh)}`);
    const lh = lastHit();
    if (lh) tags.setText(tHit, lh.stick ? 'uniti dal velcro' : `urto · ${fmt.num((lh.t1 - lh.t0) * 1000, 0)} ms · ${fmt.num(lh.Fmax, 2)} N`);
    void tCm;
  }

  /** Il grafico: la prova in corso e (se conservate) le precedenti, sbiadite. */
  function drawPlot() {
    const kind = state.plotKind, series = [], marks = [], dots = [];
    let T1 = 1, lo = Infinity, hi = -Infinity;
    const list = runs.length ? runs : [];
    list.forEach((r, k) => {
      const s = r.sim, cur = s === sim, alpha = cur ? 1 : 0.4, width = cur ? 3 : 2, dash = cur ? [] : [8, 6];
      const T = s.rec.t, ms = s.carts.map((c) => c.m);
      T1 = Math.max(T1, s.t);
      const push = (y, color, w = width) => { series.push({ x: T, y, color, alpha, width: w, dash }); for (const v of y) { if (v < lo) lo = v; if (v > hi) hi = v; } };
      if (kind === 'x' || kind === 'v' || kind === 'a') s.carts.forEach((c, i) => push(s.rec[kind][i], CART_COL[i]));
      else if (kind === 'p') {
        const tot = T.map((_, j) => s.carts.reduce((acc, c, i) => acc + ms[i] * s.rec.v[i][j], 0));
        if (s.n === 2) s.carts.forEach((c, i) => push(s.rec.v[i].map((v) => ms[i] * v), CART_COL[i], cur ? 2 : 1.5));
        push(tot, '#15181c');
      } else {
        const Ec = (j) => s.carts.reduce((acc, c, i) => acc + 0.5 * ms[i] * s.rec.v[i][j] ** 2, 0) * 1000;
        if (s.n === 2) s.carts.forEach((c, i) => push(s.rec.v[i].map((v) => 500 * ms[i] * v * v), CART_COL[i], cur ? 2 : 1.5));
        push(T.map((_, j) => Ec(j) + (s.pull ? 500 * s.pull.m * s.rec.vd[j] ** 2 : 0)), '#15181c');
      }
      if (cur) for (const h of s.hits) marks.push({ x: h.t0, color: 'rgba(224,123,31,0.6)' });
      void k;
    });
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (kind === 'x') { lo = 0; hi = TRACK.L; }
    const span = Math.max(hi - lo, kind === 'a' ? 0.2 : kind === 'E' ? 1 : kind === 'p' ? 0.02 : 0.1);
    let Y0 = lo - span * 0.08, Y1 = hi + span * 0.1;
    if (kind === 'E') Y0 = 0;
    if (kind !== 'x' && Y0 > 0) Y0 = 0;
    if (kind !== 'x' && Y1 < 0) Y1 = 0;
    if (sim) sim.carts.forEach((c, i) => {
      const j = sim.rec.t.length - 1;
      if (kind === 'x' || kind === 'v' || kind === 'a') dots.push({ x: sim.rec.t[j], y: sim.rec[kind][i][j], color: CART_COL[i] });
    });
    const labels = { x: 'posizione x (m)', v: 'velocità (m/s)', a: 'accelerazione (m/s²)', p: 'quantità di moto (kg·m/s)', E: 'energia cinetica (mJ)' };
    const legend = state.n === 2 || kind === 'p' || kind === 'E' ? (kind === 'p' || kind === 'E' ? [['A', CART_COL[0]], ['B', CART_COL[1]], ['totale', '#15181c']].slice(state.n === 2 ? 0 : 2) : [['A', CART_COL[0]], ['B', CART_COL[1]]]) : null;
    ui.drawPlot({ series, marks, dots, X0: 0, X1: Math.max(T1 * 1.04, 1), Y0, Y1, xLabel: 't (s)', yLabel: labels[kind], legend });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (dirty) { dirty = false; resolve(); }
    if (pendingView) { setView(pendingView); pendingView = null; }
    stepSeq(dt);
    if (running && sim && !paused) {
      sim.step(Math.min(dt, 0.05) * state.slow);
      if (sim.t >= tLimit - 1e-9 || (sim.still && sim.t > 0.4)) running = false;
    }
    place();
    if (view === 'follow') {
      const x = cartX(0), k = Math.min(1, dt * 5);
      rig.toWorld(x, Y.apex, 0, v3);
      const dx = (v3.x - stage.controls.target.x) * k;
      stage.controls.target.x += dx; camera.position.x += dx;
    }
    stage.update(dt);
    hud();
    // contorno: i carrelli sulla rotaia e il pesetto appeso
    stage.outlined = state.outline ? [...rig.carts.map((c) => c.g), state.pull ? rig.hanger : null] : [];
    tags.update(camera, w, h, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 60) { plotAt = nowMs; drawPlot(); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  fixPositions();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  resolve(); dirty = false;
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico del moto', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, sim: () => sim, runs: () => runs, running: () => running, go, stopRun, setView, plotView, seq: () => seq, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
