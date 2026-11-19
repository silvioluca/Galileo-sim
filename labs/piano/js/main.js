// main.js — Il piano inclinato
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { G, OBJECTS, SURFACES, bodyOf, accel, Lane } from './incline.js';
import { Rig, HINGE, BOARD, RUN, SUPPORT, DYN, STRING } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const OBJ_COL = { cart: '#2a5fb8', block: '#a8744a' };
const SURF_COL = { wood: null, rubber: '#1d1e20', felt: '#56635a', ptfe: '#f2f1ec' };
const FORCE = { w: '#e07b1f', c: '#efb26a', n: '#7a47cf', f: '#0c9d8f', s: '#2c67dc' };
// dinamometri della serie scolastica (come nel laboratorio di Archimede)
const RANGES = [
  { F: 1, div: 0.02, res: 0.01, color: '#ece9e0' }, { F: 2, div: 0.02, res: 0.01, color: '#efc31c' }, { F: 5, div: 0.05, res: 0.02, color: '#3aa458' },
  { F: 10, div: 0.1, res: 0.05, color: '#d6422e' }, { F: 20, div: 0.2, res: 0.1, color: '#2d6bd0' },
];
const pickRange = (W) => RANGES.find((r) => r.F >= W * 1.08) || RANGES[RANGES.length - 1];
const BELLS = { squares: [1, 4, 9, 16, 25].map((k) => k * 0.04), equal: [0.2, 0.4, 0.6, 0.8, 1.0] };
const HC = { cart: 0.022, block: 0.016 };                     // quota del baricentro sopra il piano (gli altri: il raggio)

const state = {
  angle: 15, objA: 'cart', mA: 0.5, surfA: 'wood',
  instr: 'gates', g1: 30, g2: 90, bellMode: 'squares',
  slow: 1, forces: true, comps: false, outline: false, sound: true, labels: true, quality: 'low', plotKind: 's',
};
const BASE = { angle: 15, objA: 'cart', mA: 0.5, surfA: 'wood', instr: 'gates', g1: 30, g2: 90, bellMode: 'squares', slow: 1, forces: true, comps: false, plotKind: 's' };
const PHYS = new Set(['objA', 'mA', 'surfA', 'instr', 'g1', 'g2', 'bellMode']);

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const RUN1 = [{ go: true }, { finish: true }];
const PRESETS = [
  ['dyn', 'Il carrello e il dinamometro', 'Lo stesso carrello a 10°, 20°, 30° e 45°: il dinamometro segna m·g·sin α', { objA: 'cart', mA: 0.5, instr: 'dyn', angle: 30, plotKind: 'law' }, [10, 20, 30, 45].flatMap((a) => [{ angle: a }, { settle: true }]), 'top'],
  ['steep', 'Più ripido, più veloce', 'Il carrello a 5°, 10°, 15° e 20°: l\'accelerazione cresce come sin α', { objA: 'cart', mA: 0.5, instr: 'gates', plotKind: 'law' }, [5, 10, 15, 20].flatMap((a) => [{ angle: a }, ...RUN1]), 'overview'],
  ['mass', 'La massa non conta', 'Il carrello con 1 kg e poi con 0,2 kg: quasi la stessa accelerazione (conta un poco l\'inerzia delle ruote)', { objA: 'cart', mA: 1, angle: 10, instr: 'gates', plotKind: 's' }, [{ angle: 10 }, ...RUN1, { set: { mA: 0.2 } }, ...RUN1], 'overview'],
  ['limit', 'L\'angolo limite', 'Il piano si alza piano piano finché il blocco si stacca: tan α = μs. Legno, gomma, teflon', { objA: 'block', mA: 0.3, instr: 'gates', plotKind: 'law' }, ['wood', 'rubber', 'ptfe'].flatMap((s) => [{ set: { surfA: s } }, { tilt: true }, { finish: true }]), 'top'],
  ['friction', 'L\'attrito che frena', 'Blocchi con il fondo di teflon, feltro e legno a 35°: accelerazioni diverse', { objA: 'block', mA: 0.3, angle: 35, instr: 'gates', plotKind: 'v' }, ['ptfe', 'felt', 'wood'].flatMap((s) => [{ set: { surfA: s } }, { angle: 35 }, ...RUN1]), 'overview'],
  ['bells', 'I campanelli di Galileo', 'Campanelli a distanze 1, 4, 9, 16, 25: il carrello li suona a tempi uguali. Equidistanti, il ritmo accelera', { objA: 'cart', mA: 0.5, instr: 'bells', bellMode: 'squares', angle: 4, plotKind: 's' }, [{ angle: 4 }, ...RUN1, { wait: 0.6 }, { set: { bellMode: 'equal' } }, ...RUN1], 'overview'],
];
const VIEWS = [['overview', 'Panoramica'], ['side', 'Di fronte'], ['top', 'Partenza'], ['bottom', 'Arrivo'], ['follow', 'Segui il corpo']];

// ───────────────────────── suono dei campanelli ─────────────────────────
let ac = null;
function audioInit() {
  try { if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); } if (ac && ac.state === 'suspended') ac.resume(); } catch { ac = null; }
}
/** Un campanello: parziali inarmoniche che si spengono in fretta. */
function bellSound(f = 1480) {
  if (!ac || ac.state !== 'running') return;
  const t0 = ac.currentTime, out = ac.createGain();
  out.gain.value = 0.22; out.connect(ac.destination);
  for (const [r, g, d] of [[1, 1, 1.3], [2.76, 0.45, 0.7], [5.4, 0.22, 0.35], [8.93, 0.1, 0.2]]) {
    const o = ac.createOscillator(), e = ac.createGain();
    o.frequency.value = f * r;
    e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(g, t0 + 0.003); e.gain.exponentialRampToValueAtTime(1e-4, t0 + d);
    o.connect(e).connect(out); o.start(t0); o.stop(t0 + d + 0.05);
  }
}

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.4, 3.4, 2.6], keyTarget: [-0.05, 0.3, 0], shadowBox: [-1.2, 1.2, 1.3, -0.6], shadowFar: 8, fog: [10, 60] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  const mkArrow = (c) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, c, 0.014, 0.009);
    a.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 9; });
    a.visible = false; scene.add(a);
    return a;
  };
  const arrows = { w: mkArrow(FORCE.w), cp: mkArrow(FORCE.c), cn: mkArrow(FORCE.c), n: mkArrow(FORCE.n), f: mkArrow(FORCE.f), s: mkArrow(FORCE.s) };

  // ───────────────────────── stato ─────────────────────────
  let lanes = [], alphaDeg = state.angle, running = false, finished = false, tRun = 0, paused = false, tilt = null;
  let seq = null, pendingView = null, view = 'overview', drag = null, range = RANGES[2], dynLast = null;
  let records = [], recId = 0, colorI = 0, plotAt = 0, metricsAt = 0, fpsEma = 60, hudTimer = 0, refreshAt = 0;
  const v3 = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3(), Hk = new THREE.Vector3();
  const alpha = () => alphaDeg * DEG;
  const dyn = () => state.instr === 'dyn';
  const readRound = (F) => Math.round(F / range.res) * range.res;
  const readText = (F) => fmt.num(readRound(F), range.res >= 0.1 ? 1 : 2);

  /** Corpi nuovi sulle corsie, pronti in cima (o appesi al dinamometro). */
  function build() {
    const gates = state.instr === 'gates' ? [state.g1 / 100, state.g2 / 100] : [];
    const bells = state.instr === 'bells' ? BELLS[state.bellMode] : [];
    const BA = bodyOf(state.objA, state.mA, state.surfA);
    range = pickRange(BA.m * G * Math.sin(60 * DEG));
    const spring = dyn() ? { k: range.F / DYN.travel, sHook: DYN.anchor + DYN.len, string: STRING } : null;
    lanes = [new Lane({ body: BA, sEnd: RUN, gates, bells, spring })];
    if (spring) { const L = lanes[0]; L.held = false; L.stuck = false; L.s = BA.len + spring.sHook + spring.string + (BA.m * G * Math.sin(alpha())) / spring.k; }
    rig.setObject(0, state.objA, state.mA, state.surfA, SURF_COL[state.surfA]);
    rig.setGates(state.instr === 'gates', gates);
    rig.setBells(state.instr === 'bells', bells);
    rig.setRange(range);
    running = false; finished = false; tRun = 0; tilt = null; paused = false; dynLast = null;
    notes();
  }
  function go() {
    audioInit();
    if (dyn()) { recordDyn(); return; }
    if (running || finished || lanes.some((L) => !L.held)) build();
    for (const L of lanes) L.release();
    running = true; finished = false; tRun = 0;
  }
  function startTilt() {
    if (dyn()) return;
    audioInit();
    build(); state.angle = 0; ui.refresh('angle');
    tilt = { phase: 'down' };
  }
  const moving = () => running || !!tilt || !!seq || (dyn() && lanes[0] && lanes[0].calm < 0.3);
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }

  // ───────────────────────── misure ─────────────────────────
  function recordRun(L, i) {
    // i tempi contano da quando il corpo parte da fermo (dopo l'angolo limite: da quando si è staccato)
    const B = L.body, gh = L.gateHits, t0 = L.t0 || 0;
    let aMeas = null;
    if (L.gates.length) { const k = gh[1] && gh[1].tin !== null ? 1 : gh[0] && gh[0].tin !== null ? 0 : -1; if (k >= 0) aMeas = (2 * L.gates[k]) / (gh[k].tin - t0) ** 2; }
    if (L.bells.length && L.rings.length) { const r = L.rings[L.rings.length - 1]; aMeas = (2 * L.bells[r.i]) / (r.t - t0) ** 2; }
    records.push({
      id: ++recId, color: COLORS[colorI++ % COLORS.length], kind: 'run', lane: i, obj: B.key, name: B.o.name, m: B.m, surf: B.surf,
      deg: alphaDeg, aMeas, aTh: accel(B, alpha()), moved: L.s > 0.005, arrive: L.arrive,
      t1: gh[0] && gh[0].tin !== null ? gh[0].tin - t0 : null, t2: gh[1] && gh[1].tin !== null ? gh[1].tin - t0 : null, v1: L.gateSpeed(0), v2: L.gateSpeed(1),
      rings: L.rings.map((r) => r.t - t0), bellMode: L.bells.length ? state.bellMode : null, rec: L.rec, fromLimit: t0 > 0,
    });
  }
  function recordDyn() {
    const L = lanes[0], F = readRound(L.spring.k * L.ext);
    records.push({ id: ++recId, color: COLORS[colorI++ % COLORS.length], kind: 'dyn', obj: L.body.key, name: L.body.o.name, m: L.body.m, surf: L.body.surf, deg: alphaDeg, F, aMeas: F / L.body.m });
    dynLast = alphaDeg;
  }
  function recordLimit(L) {
    records.push({ id: ++recId, color: COLORS[colorI++ % COLORS.length], kind: 'limit', obj: L.body.key, name: L.body.o.name, surf: L.body.surf, m: L.body.m, deg: alphaDeg });
  }
  function finish() {
    running = false; finished = true;
    for (const L of lanes) L.freeze();
    lanes.forEach((L, i) => recordRun(L, i));
    if (records.length > 40) records.splice(0, records.length - 40);
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); build(); ui.refresh(); ui.sync(); }
      if (st.angle !== undefined) { state.angle = st.angle; ui.refresh('angle'); }
      if (st.go) go();
      if (st.tilt) startTilt();
    }
    seq.t += dt;
    let done = false;
    if (st.set) done = seq.t > 0.5;
    else if (st.angle !== undefined) done = Math.abs(alphaDeg - st.angle) < 0.01 && seq.t > 0.3;
    else if (st.go) done = true;
    else if (st.tilt) done = !tilt;
    else if (st.finish) done = (!running && !tilt) || seq.t > 40;
    else if (st.settle) done = dynLast !== null && Math.abs(dynLast - alphaDeg) < 0.05;
    else if (st.wait) done = seq.t >= st.wait;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  function notes() {
    const B = bodyOf(state.objA, state.mA, state.surfA), o = B.o;
    let t = `${o.note} · massa <b>${fmt.kg(B.m)}</b>`;
    if (o.kind === 'block') t += ` · angolo limite <b>${fmt.num(Math.atan(B.ms) / DEG, 1)}°</b> (tan α = μs = ${fmt.num(B.ms, 2)})`;
    ui.setNote('#obj-note', t);
    ui.setNote('#instr-note', {
      gates: 'Il cronometro parte quando si abbassano i fermi; ogni fotocellula segna quando arriva il bordo del corpo e quanto in fretta passa.',
      bells: 'I campanelli suonano quando il corpo tocca il loro filo. Con le distanze 1 · 4 · 9 · 16 · 25 i colpi sono a tempi uguali.',
      dyn: 'Il dinamometro, parallelo al piano, tiene fermo il corpo: segna la componente del peso lungo il piano (meno l\'attrito, se c\'è).',
    }[state.instr]);
  }
  const ui = createUI(state, {
    objects: Object.entries(OBJECTS), surfaces: Object.entries(SURFACES), presets: PRESETS, views: VIEWS,
    angleText: () => `h ${fmt.num(RUN * Math.sin(state.angle * DEG) * 100, 1)} cm · pendenza ${fmt.num(Math.tan(state.angle * DEG) * 100, 0)} %`,
    platesText: (m) => { const n = Math.round((m - 0.1) / 0.1); return n ? `${n} ${n === 1 ? 'disco' : 'dischi'} da 100 g` : 'senza dischi'; },
  }, (key, arg) => {
    if (PHYS.has(key)) { seq = null; build(); ui.refresh(); ui.sync(); return; }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        build(); ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        audioInit();
        break;
      }
      case 'angle': seq = null; tilt = null; break;
      case 'go': seq = null; go(); break;
      case 'pause': togglePause(); break;
      case 'reset': seq = null; build(); break;
      case 'clear': seq = null; records = []; colorI = 0; break;
      case 'tilt': seq = null; if (tilt) tilt = null; else startTilt(); break;
      case 'view': setView(arg); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'sound': if (state.sound) audioInit(); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const tAngle = tags.add('', 'nocase', (o) => o.set(HINGE.x - 0.16 * Math.cos(alpha() + 0.25), HINGE.y + 0.16 * Math.sin(alpha() + 0.25), -(BOARD.W / 2 + 0.012)));
  const tObj = [0].map((i) => tags.add('', 'nocase', (o) => { const L = lanes[i]; rig.world(L.s - L.body.len / 2, 0.08, i, o); }, () => !!lanes[i]));
  const tGate = [0, 1].map((i) => tags.add('', 'nocase', (o) => rig.world(i ? state.g2 / 100 : state.g1 / 100, 0.1, 1, o), () => state.instr === 'gates'));
  tags.add('Cronometro', '', (o) => o.copy(rig.timerG.position).setY(0.08));
  const tDyn = tags.add('', 'nocase', (o) => rig.world(DYN.anchor + 0.15, 0.06, 0, o), () => dyn());
  tags.add('Goniometro', '', (o) => o.set(HINGE.x - 0.03, HINGE.y + 0.2, -(BOARD.W / 2 + 0.012)), () => view === 'side' || view === 'bottom');

  // ───────────────────────── inquadrature ─────────────────────────
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (W <= 860) return { x0: m, x1: W - m, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : W) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dir, pts) {
    const cam = camera.clone(), rect = freeRect(), W = window.innerWidth, H = window.innerHeight;
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) { pv.copy(p).project(cam); if (pv.z > 1 || pv.z < -1) behind = true; const x = (pv.x * 0.5 + 0.5) * W, y = (-pv.y * 0.5 + 0.5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.05, hi = 40;
      for (let k = 0; k < 30; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / H;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  const V = (...p) => new THREE.Vector3(...p);
  function boardPts(a) {
    // la tavola all'inclinazione a (quella verso cui sta andando), più base e cronometro
    const c = Math.cos(a), s = Math.sin(a), top = V(HINGE.x - BOARD.L * c, HINGE.y + BOARD.L * s + 0.05, 0);
    return [V(HINGE.x - 1.3, 0, 0.17), V(HINGE.x + 0.18, 0, 0.32), top, V(top.x, top.y, BOARD.W / 2 + 0.03), V(HINGE.x + 0.05, HINGE.y + 0.12, 0), V(HINGE.x + SUPPORT.dx, 0.2, SUPPORT.z)];
  }
  function viewPose(id) {
    const a = state.angle * DEG;
    switch (id) {
      case 'side': return fitPose(V(0, 0.08, 1).normalize(), boardPts(a));
      case 'top': {
        // la cima della tavola: fermi, primo tratto e dinamometro (all'inclinazione verso cui si va)
        const c = Math.cos(a), s = Math.sin(a), at = (sv, y, z) => { const d = BOARD.start - sv; return V(HINGE.x - d * c + y * s, HINGE.y + d * s + y * c, z); };
        return fitPose(V(0.3, 0.38, 1).normalize(), [at(-0.1, 0, 0.12), at(-0.1, 0.09, -0.12), at(0.55, 0, 0.12), at(0.55, 0.09, -0.12)]);
      }
      case 'bottom': return { pos: [HINGE.x + 0.12, HINGE.y + 0.22, 0.62], target: [HINGE.x - 0.16, HINGE.y + 0.04, 0.02] };
      case 'follow': { const L = lanes[0], p = rig.world(L.s - L.body.len / 2, 0, 0, new THREE.Vector3()); return { pos: [p.x + 0.15, p.y + 0.2, p.z + 0.55], target: [p.x, p.y, p.z - 0.03] }; }
      default: return fitPose(V(0.42, 0.32, 1).normalize(), boardPts(a));
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(6, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── trascinamento della tavola (cambia l'inclinazione) ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pick = (e) => { ray(e); return raycaster.intersectObject(rig.board.children[0], false)[0]; };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) return;
    seq = null; tilt = null;
    zPlane.constant = -hit.point.z;
    drag = true;
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      ray(e);
      if (raycaster.ray.intersectPlane(zPlane, v3)) {
        const d = Math.atan2(v3.y - HINGE.y, HINGE.x - v3.x) / DEG;
        state.angle = Math.min(Math.max(Math.round(d * 2) / 2, 0), 60);
        ui.refresh('angle');
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !!pick(e));
  }, { capture: true });
  const endDrag = (e) => { if (!drag) return; drag = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); e.stopImmediatePropagation(); };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); seq = null; go(); } else if (k === 'p') togglePause(); else if (k === 'r') { seq = null; build(); }
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── disegno ─────────────────────────
  function setArrow(a, show, at, dir, len) {
    a.visible = show && len > 0.004;
    if (!a.visible) return;
    a.position.copy(at); a.setDirection(dir);
    const L = Math.min(len, 0.3), head = Math.min(0.016, L * 0.4);
    a.setLength(L, head, head * 0.6);
  }
  function place() {
    const a = alpha();
    rig.setAngle(a);
    lanes.forEach((L, i) => rig.placeObject(i, L.s, L.body.len, L.phi, true));
    rig.setStoppers([!lanes[0].held]);
    // raggi delle fotocellule interrotti
    if (state.instr === 'gates') [state.g1 / 100, state.g2 / 100].forEach((g, i) => rig.setGateLit(i, [0, 1].map((k) => { const L = lanes[k]; return !!L && L.s >= g && L.s - L.body.len < g; })));
    const L = lanes[0], B = L.body;
    rig.setDyn(dyn(), L.ext || 0, L.s - B.len, rig.lanes[0].hookY || 0.02);
    // forze sul corpo; il peso vale 12 cm
    const k = 0.12 / (B.m * G), hc = HC[B.key] ?? 0.016, d = v3.set(Math.cos(a), -Math.sin(a), 0).clone(), n = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
    rig.world(L.s - B.len / 2, hc, 0, C); rig.world(L.s - B.len / 2, 0, 0, P); rig.world(L.s - B.len, rig.lanes[0].hookY || 0.02, 0, Hk);
    const f = L.held ? { N: B.m * G * Math.cos(a), Ff: 0, Fs: 0 } : L.f;
    setArrow(arrows.w, state.forces || state.comps, C, V(0, -1, 0), B.m * G * k);
    setArrow(arrows.cp, state.comps, C, d, B.m * G * Math.sin(a) * k);
    setArrow(arrows.cn, state.comps, C, n.clone().negate(), B.m * G * Math.cos(a) * k);
    setArrow(arrows.n, state.forces, P, n, (f.N || 0) * k);
    setArrow(arrows.f, state.forces && Math.abs(f.Ff || 0) > 1e-4, P, (f.Ff || 0) > 0 ? d : d.clone().negate(), Math.abs(f.Ff || 0) * k);
    setArrow(arrows.s, state.forces && dyn(), Hk, d.clone().negate(), Math.abs(f.Fs || 0) * k);
    stage.outlined = state.outline ? lanes.map((_, i) => rig.lanes[i].g) : [];
  }

  function hud(now) {
    const L = lanes[0], B = L.body, a = alpha();
    if (dyn()) {
      const F = L.spring.k * (L.ext || 0);
      ui.setTitle('Dinamometro', ` · ${range.F} N`);
      ui.setClock(readText(F), 'N', L.calm < 0.3 && !paused);
      ui.setSide(`m·g·sin α = ${fmt.N(B.m * G * Math.sin(a))}`, `portata ${range.F} N · divisione ${fmt.num(range.div, 2)} N`);
    } else {
      ui.setTitle('Cronometro', state.instr === 'bells' ? ' · campanelli' : ' · fotocellule');
      ui.setClock(fmt.num(tRun, 3), 's', running && !paused);
      ui.setSide(`v ${fmt.ms(Math.max(0, L.v))} · s ${fmt.cm(Math.min(Math.max(L.s, 0), RUN))}`, state.instr === 'bells'
        ? `campanelli suonati ${L.rings.length} di 5`
        : L.gateHits.map((g, i) => `t${'₁₂'[i]} ${g.tin !== null ? fmt.num(g.tin, 3) : '—'}`).join(' · '));
    }
    // stato
    let status;
    if (paused) status = 'in pausa';
    else if (tilt) status = tilt.phase === 'down' ? 'abbasso il piano' : 'si inclina';
    else if (dyn()) status = L.calm > 0.3 ? 'tiene fermo' : 'oscilla';
    else if (lanes.every((x) => x.held)) status = 'pronto';
    else if (running) status = lanes.every((x) => x.stuck && x.s < 0.002) ? 'resta fermo' : 'scende';
    else status = L.s < 0.002 ? 'resta fermo' : 'arrivato';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, (running || !!tilt) && !paused);
    ui.setGo(dyn() ? 'Annota' : running || finished ? 'Di nuovo' : 'Via');
    ui.setTilt(tilt ? 'Si inclina…' : 'Inclina finché scivola', !!tilt);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    // cronometro sul banco: il tempo che scorre, poi quello dell'ultima fotocellula
    const g2 = L.gateHits[1];
    rig.setTimer(dyn() ? '-,---' : fmt.num(g2 && g2.tin !== null ? g2.tin : tRun, 3));
    // misure annotate
    const rows = records.slice().reverse().slice(0, 14).map((r) => {
      const mass = r.obj === 'cart' || r.obj === 'block' ? ` ${fmt.kg(r.m)}` : '';
      const surf = r.obj === 'block' ? ` · ${SURFACES[r.surf].name.toLowerCase()}` : '';
      if (r.kind === 'dyn') return { key: r.id, color: r.color, name: `${r.name}${mass}<small>${fmt.num(r.deg, 1)}° · dinamometro</small>`, t: `F ${fmt.num(r.F, range.res >= 0.1 ? 1 : 2)} N`, v: `F/m ${fmt.num(r.aMeas, 2)} N/kg` };
      if (r.kind === 'limit') return { key: r.id, color: r.color, name: `${r.name}${surf}<small>angolo limite</small>`, t: `${fmt.num(r.deg, 1)}°`, v: `tan α = ${fmt.num(Math.tan(r.deg * DEG), 3)}` };
      const name = `${r.name}${mass}${surf}<small>${fmt.num(r.deg, 1)}°</small>`;
      if (!r.moved) return { key: r.id, color: r.color, name, t: 'resta fermo', v: 'attrito statico' };
      if (r.bellMode) {
        const d = r.rings.map((t, i) => t - (i ? r.rings[i - 1] : 0));
        const even = d.length > 1 && Math.max(...d) - Math.min(...d) < 0.01;
        return { key: r.id, color: r.color, name, t: even ? `Δt ${fmt.num(d[0], 2)} s ×${d.length}` : d.length ? `Δt ${fmt.num(d[0], 2)} → ${fmt.num(d[d.length - 1], 2)} s` : '—', v: r.aMeas ? `a ${fmt.num(r.aMeas, 3)} m/s²` : '' };
      }
      return { key: r.id, color: r.color, name, t: r.t2 !== null ? `t₂ ${fmt.num(r.t2, 3)} s` : r.t1 !== null ? `t₁ ${fmt.num(r.t1, 3)} s` : '—', v: r.aMeas ? `a ${fmt.num(r.aMeas, 3)} m/s²` : '' };
    });
    ui.setRows(rows, 'Premi «Via» (barra spaziatrice): ogni discesa si annota da sola.');
    if (now - metricsAt > 200) {
      metricsAt = now;
      const sn = Math.sin(a), cs = Math.cos(a), aTh = accel(B, a), o = B.o;
      const formula = o.kind === 'cart' ? 'a ≈ g·sin α (ruote)' : Math.tan(a) > B.ms ? 'a = g·(sin α − μd·cos α)' : 'tan α ≤ μs: resta fermo';
      ui.setMetrics([
        { k: 'Inclinazione', v: `${fmt.num(alphaDeg, 1)} <small>°</small>`, s: `sin α ${fmt.num(sn, 3)} · h ${fmt.num(RUN * sn * 100, 1)} cm`, title: 'h: dislivello lungo la corsa di 105 cm' },
        { k: 'Peso lungo il piano', v: `${fmt.num(B.m * G * sn, 3)} <small>N</small>`, s: 'm·g·sin α', title: 'Componente del peso parallela al piano (corpo davanti)' },
        { k: 'Peso contro il piano', p: 2, v: `${fmt.num(B.m * G * cs, 3)} <small>N</small>`, s: 'm·g·cos α = N', title: 'Componente perpendicolare, bilanciata dalla reazione del piano' },
        { k: 'Accelerazione', v: `${fmt.num(aTh, 3)} <small>m/s²</small>`, s: formula, title: 'Accelerazione teorica del corpo davanti, senza aria' },
        { k: 'Tempo di discesa', p: 2, v: aTh > 0 ? `${fmt.num(Math.sqrt((2 * RUN) / aTh), 3)} <small>s</small>` : '—', s: 't = √(2·s / a) su 105 cm' },
        { k: 'Velocità in fondo', p: 3, v: aTh > 0 ? `${fmt.num(Math.sqrt(2 * aTh * RUN), 2)} <small>m/s</small>` : '—', s: `√(2·g·h) = ${fmt.num(Math.sqrt(2 * G * RUN * sn), 2)} m/s`, title: 'Senza attrito e senza rotazione sarebbe √(2·g·h)' },
      ]);
      tags.setText(tAngle, `α = ${fmt.num(alphaDeg, 1)}°`);
      lanes.forEach((x, i) => tags.setText(tObj[i], `${x.body.o.name} · ${fmt.kg(x.body.m)}`));
      tags.setText(tGate[0], `Fotocellula 1 · ${state.g1} cm`); tags.setText(tGate[1], `Fotocellula 2 · ${state.g2} cm`);
      tags.setText(tDyn, `Dinamometro · ${range.F} N`);
    }
  }

  function drawPlot() {
    const kind = state.plotKind;
    if (kind === 'law') {
      // a misurata (o F/m del dinamometro) in funzione di sin α, con le curve teoriche dei corpi in gioco
      const pts = records.filter((r) => (r.kind === 'run' && r.moved && r.aMeas) || r.kind === 'dyn');
      const keyOf = (r) => (r.kind === 'dyn' ? 'g' : r.obj === 'block' ? `block:${r.surf}` : r.obj);
      const keys = [...new Set([...pts.map(keyOf), dyn() ? 'g' : state.objA === 'block' ? `block:${state.surfA}` : state.objA])];
      const series = [], legend = [];
      let Y1 = 1;
      for (const key of keys) {
        const [obj, surf] = key.split(':'), x = [], y = [];
        const B = key === 'g' ? null : bodyOf(obj, 0.5, surf || 'wood');
        for (let d = 0; d <= 60; d += 0.5) { x.push(Math.sin(d * DEG)); y.push(B ? accel(B, d * DEG) : G * Math.sin(d * DEG)); }
        const col = key === 'g' ? '#15181c' : OBJ_COL[obj];
        series.push({ x, y, color: col, width: 2, dash: [8, 6], alpha: 0.75 });
        legend.push([key === 'g' ? 'g·sin α' : surf ? `blocco ${SURFACES[surf].name.toLowerCase()}` : OBJECTS[obj].name.toLowerCase(), col]);
        Y1 = Math.max(Y1, ...y);
      }
      ui.drawPlot({ series, points: pts.map((r) => ({ x: Math.sin(r.deg * DEG), y: r.aMeas, color: r.color, r: 7 })), X0: 0, X1: 0.9, Y0: 0, Y1: Y1 * 1.1, xLabel: 'sin α', yLabel: 'a o F/m (m/s²)', legend: legend.slice(-4) });
      return;
    }
    // s(t) o v(t): le ultime discese e quelle in corso, con la teoria del corpo davanti
    const runs = records.filter((r) => r.kind === 'run' && r.moved && r.rec).slice(-6);
    const list = runs.map((r) => ({ rec: r.rec, color: r.color, cur: false }));
    if (!finished) lanes.forEach((L, i) => { if (!L.held) list.push({ rec: L.rec, color: i ? '#2c67dc' : '#e8452c', cur: true }); });
    let T1 = 1, Y1 = kind === 's' ? RUN * 100 : 0.5;
    for (const s of list) { T1 = Math.max(T1, s.rec.t[s.rec.t.length - 1]); if (kind === 'v') for (const v of s.rec.v) Y1 = Math.max(Y1, v * 1.1); }
    const series = list.map((s, i) => ({ x: s.rec.t, y: kind === 's' ? s.rec.s.map((x) => Math.min(x, RUN) * 100) : s.rec.v, color: s.color, width: s.cur ? 3 : 2, alpha: s.cur || i === list.length - 1 ? 1 : 0.45 }));
    const aTh = accel(lanes[0].body, alpha());
    if (aTh > 0 && !dyn()) {
      const T = Math.sqrt((2 * RUN) / aTh), x = [], y = [];
      for (let i = 0; i <= 80; i++) { const t = (T * i) / 80; x.push(t); y.push(kind === 's' ? 50 * aTh * t * t : aTh * t); }
      series.unshift({ x, y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.5 });
      if (kind === 'v') Y1 = Math.max(Y1, aTh * T * 1.1);
    }
    const marks = (lanes[0].rings || []).map((r) => ({ x: r.t, color: 'rgba(212,160,40,0.75)' }));
    ui.drawPlot({ series, marks, X0: 0, X1: T1 * 1.04, Y0: 0, Y1, xLabel: 't (s)', yLabel: kind === 's' ? 's (cm)' : 'v (m/s)' });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (pendingView) { setView(pendingView); pendingView = null; }
    if (paused && !moving()) paused = false;
    const dtSim = paused ? 0 : Math.min(dt, 0.05) * state.slow;
    if (!paused) stepSeq(dt);
    // la tavola segue l'inclinazione scelta (al più 25° al secondo)
    if (!paused) { const step = 25 * dt; alphaDeg += Math.max(-step, Math.min(step, state.angle - alphaDeg)); if (Math.abs(state.angle - alphaDeg) < 1e-6) alphaDeg = state.angle; }
    // angolo limite: il piano sale finché il corpo parte
    if (tilt && dtSim > 0) {
      if (tilt.phase === 'down') { if (Math.abs(alphaDeg) < 0.01) { for (const L of lanes) L.release(); running = true; tRun = 0; tilt.phase = 'up'; } }
      else {
        state.angle = Math.min(60, state.angle + 3 * dtSim); alphaDeg = state.angle;
        if (nowMs - refreshAt > 120) { refreshAt = nowMs; ui.refresh('angle'); }
        const L = lanes[0];
        if (!L.stuck && L.v > 1e-4) { recordLimit(L); L.t0 = L.tMove ?? L.t; tilt = null; ui.refresh('angle'); } else if (state.angle >= 60) tilt = null;
      }
    }
    if (dtSim > 0) {
      const a = alpha();
      let left = dtSim;
      while (left > 1e-9) { const hs = Math.min(5e-4, left); for (const L of lanes) L.step(hs, a); left -= hs; }
      if (running) tRun += dtSim;
      for (const L of lanes) for (const r of L.rings) if (r.fresh) { r.fresh = false; rig.ringBell(r.i); if (state.sound) bellSound(1480); }
      // fine della discesa: tutti fermi (in fondo o trattenuti dall'attrito)
      if (running && !tilt && tRun > 0.2 && (lanes.every((L) => L.calm > 0.35) || tRun > 40)) finish();
      // dinamometro: annota da solo quando il corpo è fermo a un angolo nuovo
      if (dyn() && lanes[0].calm > 0.6 && Math.abs(alphaDeg - state.angle) < 1e-6 && (dynLast === null || Math.abs(alphaDeg - dynLast) > 0.2)) recordDyn();
    }
    rig.update(dt);
    place();
    if (view === 'follow' && !paused) { const L = lanes[0], p = rig.world(L.s - L.body.len / 2, 0, 0, new THREE.Vector3()), k = Math.min(1, dt * 4); const dx = (p.x - stage.controls.target.x) * k, dy = (p.y - stage.controls.target.y) * k; stage.controls.target.x += dx; stage.controls.target.y += dy; camera.position.x += dx; camera.position.y += dy; }
    hud(nowMs);
    stage.update(dt);
    tags.update(camera, w, h, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 100) { plotAt = nowMs; drawPlot(); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  build();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  rig.setAngle(alpha());
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico del moto', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, lanes: () => lanes, records: () => records, seq: () => seq, paused: () => paused, alpha: () => alphaDeg, go, togglePause, startTilt, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
