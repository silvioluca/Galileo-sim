// main.js — Il pendolo
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { G, BOBS, BODIES, BOB_R, holesOf, simpleSpec, physicalSpec, ampFactor, Pendulum } from './pendulum.js';
import { Rig, PIVOT_Y, ZB, COLUMN, BASE } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const PCOL = ['#e8452c', '#2c67dc'];                          // pendolo A e B nei grafici del moto
const FORCE = { w: '#e07b1f', c: '#efb26a', t: '#7a47cf' };
const BOB_TITLE = (k) => `${BOBS[k].name}: ${fmt.g(BOBS[k].rho * (4 / 3) * Math.PI * BOB_R ** 3)}`;

const state = {
  type: 'simple', L: 1, bob: 'lead', two: false, L2: 0.5, bob2: 'cork', body: 'rod', hole: 5, amp: 10, air: true, N: 5,
  harm: false, equiv: true, slow: 1, forces: false, comps: false, outline: false, labels: true, quality: 'low', plotKind: 'theta',
};
const BASE_STATE = { type: 'simple', L: 1, bob: 'lead', two: false, L2: 0.5, bob2: 'cork', body: 'rod', hole: 5, amp: 10, air: true, N: 5, harm: false, equiv: true, slow: 1, forces: false, comps: false, plotKind: 'theta' };
const REBUILD = new Set(['type', 'L', 'bob', 'two', 'L2', 'bob2', 'body', 'hole', 'air']);

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const MEASURE = [{ go: true }, { measure: true }];
const PRESETS = [
  ['iso', 'L\'isocronismo', 'Il pendolo di 50 cm lasciato da 5°, 15° e 30°: il periodo quasi non cambia, come notò Galileo. Da 60° e 90° invece si allunga', { type: 'simple', L: 0.5, bob: 'lead', N: 3, plotKind: 'amp' }, [5, 15, 30, 60, 90].flatMap((a) => [{ set: { amp: a } }, ...MEASURE]), 'front'],
  ['length', 'T² cresce come L: misura g', 'Lunghezze di 25, 50, 100 e 150 cm, da 8°: T² è proporzionale a L e la pendenza della retta è 4π²/g', { type: 'simple', bob: 'lead', amp: 8, N: 3, plotKind: 'law' }, [0.25, 0.5, 1, 1.5].flatMap((L) => [{ set: { L } }, ...MEASURE]), 'overview'],
  ['galileo', 'Piombo e sughero', 'Due pendoli di 1 m, una sfera di piombo e una di sughero, lasciati insieme da 30°: stesso periodo, ma il sughero si smorza prima (Galileo, Discorsi, 1638)', { type: 'simple', L: 1, bob: 'lead', two: true, L2: 1, bob2: 'cork', amp: 30, N: 5, plotKind: 'theta' }, [{ go: true }, { wait: 24 }], 'front'],
  ['ratio', 'Un quarto della lunghezza', 'Pendoli di 100 e di 25 cm: quello corto fa due oscillazioni mentre il lungo ne fa una', { type: 'simple', L: 1, bob: 'steel', two: true, L2: 0.25, bob2: 'brass', amp: 12, N: 3, plotKind: 'theta' }, [{ go: true }, { wait: 9 }], 'front'],
  ['rod', 'L\'asta e il suo perno', 'L\'asta appesa a fori sempre più lontani dal centro: il periodo scende, tocca il minimo a L/√12 ≈ 35 cm e poi risale', { type: 'physical', body: 'rod', amp: 6, N: 2, plotKind: 'law' }, [0, 1, 3, 5, 6, 7, 8, 10].flatMap((k) => [{ set: { hole: k } }, ...MEASURE]), 'overview'],
  ['center', 'Il centro di oscillazione', 'Appesa a 30 cm dal centro, l\'asta batte con il pendolo semplice di 70 cm; appesa al foro a 40 cm, dall\'altra parte del baricentro, ha lo stesso periodo (Huygens, Kater)', { type: 'physical', body: 'rod', hole: 5, amp: 8, N: 3, equiv: true, plotKind: 'law' }, [...MEASURE, { wait: 1 }, { set: { hole: 7 } }, ...MEASURE], 'front'],
  ['ring', 'L\'anello e il suo diametro', 'Un anello appeso al bordo oscilla come un pendolo semplice lungo quanto il suo diametro', { type: 'physical', body: 'ring', amp: 10, N: 5, equiv: true, plotKind: 'theta' }, MEASURE, 'front'],
  ['large', 'Le grandi ampiezze', 'Il disco lasciato da 160°, nel vuoto: il moto armonico delle piccole oscillazioni resta subito indietro e nello spazio delle fasi la curva non è più un\'ellisse', { type: 'physical', body: 'disk', hole: 6, amp: 160, N: 3, harm: true, air: false, plotKind: 'phase' }, [{ go: true }, { wait: 12 }], 'front'],
];
const VIEWS = [['overview', 'Panoramica'], ['front', 'Di fronte'], ['pivot', 'Il perno'], ['gate', 'La fotocellula']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.4, 4.2, 2.6], keyTarget: [0, 1.0, -0.1], shadowBox: [-1.3, 1.3, 2.4, -0.4], shadowFar: 9, fog: [10, 60] });
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
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, c, 0.016, 0.01);
    a.traverse((o) => { o.userData.noAO = true; o.userData.noOutline = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 9; });
    a.visible = false; scene.add(a);
    return a;
  };
  const arrows = { w: mkArrow(FORCE.w), ct: mkArrow(FORCE.c), cr: mkArrow(FORCE.c), t: mkArrow(FORCE.t) };

  // ───────────────────────── stato ─────────────────────────
  let pends = [], meas = [], running = false, finished = false, paused = false, tRun = 0, side = 1;
  let seq = null, pendingView = null, view = 'overview', drag = null, records = [], recId = 0, colorI = 0;
  let plotAt = 0, metricsAt = 0, fpsEma = 60, hudTimer = 0;
  const v3 = new THREE.Vector3(), dir = new THREE.Vector3();
  const ampMax = () => (state.type === 'simple' ? 90 : 170);
  const theta0 = () => side * Math.min(state.amp, ampMax()) * DEG;
  const holeD = () => { const h = holesOf(state.body); return h[Math.min(state.hole, h.length - 1)]; };
  const specA = () => (state.type === 'simple' ? simpleSpec(state.L, state.bob, state.air) : physicalSpec(state.body, holeD(), state.air));
  const specB = () => (state.type === 'simple' && state.two ? simpleSpec(state.L2, state.bob2, state.air) : null);

  /** Pendoli nuovi, fermi all'ampiezza scelta. */
  function build() {
    const sA = specA(), sB = specB();
    pends = [new Pendulum(sA)];
    if (sB) pends.push(new Pendulum(sB));
    rig.setPendulum(0, sA); rig.setPendulum(1, sB);
    rig.setHarmShape(sA);
    for (const P of pends) P.hold(theta0());
    meas = pends.map(() => ({ done: false, T: null }));
    running = false; finished = false; paused = false; tRun = 0;
    notes();
  }
  function go() {
    if (pends.some((P) => !P.held)) build();
    for (const P of pends) P.release(theta0());
    meas = pends.map(() => ({ done: false, T: null }));
    running = true; finished = false; tRun = 0;
  }
  const moving = () => running || !!seq;
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }
  /** Misura completa quando la fotocellula ha visto 2N + 1 passaggi: T = (t[2N] − t[0]) / N. */
  function checkMeasures() {
    pends.forEach((P, i) => {
      const m = meas[i], ps = P.passages, N = state.N;
      if (m.done || ps.length < 1 + 2 * N) return;
      m.done = true; m.T = (ps[2 * N].t - ps[0].t) / N;
      const S = P.S;
      records.push({ id: ++recId, color: COLORS[colorI++ % COLORS.length], i, kind: S.kind, key: S.key, name: S.name, L: S.L, d: S.d, amp: Math.abs(P.th0) / DEG, N, T: m.T, T0: S.T0, Tth: S.T0 * ampFactor(P.th0), air: state.air });
      if (records.length > 40) records.splice(0, records.length - 40);
    });
  }
  /** La sfera (o la linguetta) esce dal fascio con questa ampiezza? */
  const leavesBeam = (S, amp) => S.gateH * Math.sin(Math.min(amp, 90) * DEG) > S.chord / 2 + 0.002;

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); build(); ui.refresh(); ui.sync(); }
      if (st.go) go();
    }
    seq.t += dt;
    let done = false;
    if (st.set) done = seq.t > 0.6;
    else if (st.go) done = true;
    else if (st.measure) done = meas.every((m) => m.done) || seq.t > 70;
    else if (st.wait) done = seq.t >= st.wait;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  function notes() {
    const S = pends[0].S;
    if (S.kind === 'simple') {
      ui.setNote('#pend-note', `Sfera di ${BOBS[S.key].name.toLowerCase()}, 5 cm: massa <b>${fmt.g(S.mb)}</b> · T₀ = 2π·√(L/g) = <b>${fmt.num(2 * Math.PI * Math.sqrt(S.L / G), 3)} s</b>`);
    } else {
      const B = BODIES[S.key];
      ui.setNote('#pend-note', `${B.note} · massa <b>${fmt.g(S.m)}</b> · perno a <b>${fmt.cm(S.d)}</b> dal baricentro · lunghezza equivalente <b>${fmt.cm(S.Leq)}</b>`);
    }
    const a = Math.min(state.amp, ampMax());
    ui.setNote('#launch-note', !leavesBeam(S, a)
      ? 'Con un\'ampiezza così piccola il pendolo non esce dal fascio della fotocellula: allargala un poco.'
      : a <= 15 ? `Piccole oscillazioni: il periodo è quasi T₀ (×${fmt.num(ampFactor(a * DEG), 4)}).`
        : `A ${a}° il periodo è più lungo di T₀: ×${fmt.num(ampFactor(a * DEG), 3)}.`);
  }
  const ui = createUI(state, {
    bobs: Object.keys(BOBS).map((k) => [k, { name: BOBS[k].name, title: BOB_TITLE(k) }]), bodies: Object.entries(BODIES), presets: PRESETS, views: VIEWS,
    holeCount: () => holesOf(state.body).length,
    holeText: () => `d = ${fmt.num(holeD() * 100, 0)} cm <small>· dal centro ${state.body === 'rod' ? 'dell\'asta' : 'del disco'}</small>`,
    ampMax,
    lText: () => `T₀ ${fmt.num(2 * Math.PI * Math.sqrt(state.L / G), 3)} s`,
    l2Text: () => `T₀ ${fmt.num(2 * Math.PI * Math.sqrt(state.L2 / G), 3)} s`,
  }, (key, arg) => {
    if (REBUILD.has(key)) {
      seq = null;
      if (key === 'type' && state.amp > ampMax()) state.amp = ampMax();
      if (key === 'body') state.hole = Math.min(state.hole, holesOf(state.body).length - 1);
      build(); ui.refresh(); ui.sync();
      return;
    }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE_STATE, p[3]);
        side = 1;
        if (p[3].plotKind === 'law' || p[3].plotKind === 'amp') records = [];
        build(); ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'amp': seq = null; if (!running) for (const P of pends) P.hold(theta0()); notes(); break;
      case 'N': meas = pends.map((P, i) => ({ done: meas[i]?.done && P.passages.length >= 1 + 2 * state.N, T: null })); break;
      case 'go': seq = null; go(); break;
      case 'pause': togglePause(); break;
      case 'reset': seq = null; build(); break;
      case 'clear': seq = null; records = []; colorI = 0; break;
      case 'view': setView(arg); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      default: break;
    }
  });

  // ───────────────────────── geometria nel mondo ─────────────────────────
  const zOf = (i) => (i ? ZB : 0);
  /** Punto del pendolo i a distanza r dal perno lungo il corpo (verso il basso a θ = 0). */
  const along = (i, r, out) => { const th = pends[i].th; return out.set(r * Math.sin(th), PIVOT_Y - r * Math.cos(th), zOf(i)); };
  const reach = (S) => S.gateH + (S.kind === 'simple' ? BOB_R : S.key === 'rod' ? 0.04 : 0.012);

  // ───────────────────────── etichette ─────────────────────────
  const tAngle = tags.add('', 'nocase', (o) => o.set(0.16, PIVOT_Y - 0.25, -0.01));
  const tBody = [0, 1].map((i) => tags.add('', 'nocase', (o) => { along(i, pends[i].S.d, o); if (pends[i].S.kind === 'simple') o.y += 0.07; else o.x -= 0.1; }, () => !!pends[i]));
  tags.add('Fotocellula', '', (o) => o.set(0.06, PIVOT_Y - pends[0].S.gateH - 0.1, 0.06));
  tags.add('Cronometro', '', (o) => o.copy(rig.timerG.position).setY(0.13));
  const tEq = tags.add('', 'nocase', (o) => { const S = pends[0].S, th = pends[0].th; o.set(S.Leq * Math.sin(th) + 0.1, PIVOT_Y - S.Leq * Math.cos(th), 0.022); }, () => state.equiv && pends[0].S.kind === 'physical');
  tags.add('Goniometro', '', (o) => o.set(-0.17, PIVOT_Y - 0.2, -0.01), () => view === 'pivot');

  // ───────────────────────── inquadrature ─────────────────────────
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (W <= 860) return { x0: m, x1: W - m, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : W) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dirv, pts) {
    const cam = camera.clone(), rect = freeRect(), W = window.innerWidth, H = window.innerHeight;
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) { pv.copy(p).project(cam); if (pv.z > 1 || pv.z < -1) behind = true; const x = (pv.x * 0.5 + 0.5) * W, y = (-pv.y * 0.5 + 0.5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dirv, d); cam.lookAt(target); cam.updateMatrixWorld(); };
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
  /** Dove arriva il pendolo: perno, estremi dell'oscillazione, punto più basso (e, oltre 90°, la parte alta). */
  function swingPts() {
    const S = pends[0].S, R = reach(S), a = Math.min(state.amp, ampMax()) * DEG, z = pends[1] ? ZB : 0;
    const pts = [V(0, PIVOT_Y + 0.08, 0), V(0, PIVOT_Y - R - 0.04, 0.06), V(0, PIVOT_Y - R, z)];
    for (const s of [-1, 1]) pts.push(V(s * R * Math.sin(Math.min(a, Math.PI / 2)), PIVOT_Y - R * Math.cos(Math.min(a, Math.PI / 2)), 0));
    if (a > Math.PI / 2) pts.push(V(0, PIVOT_Y + R * Math.sin(a - Math.PI / 2), 0));
    if (S.kind === 'physical' && S.key === 'rod') pts.push(V(0, PIVOT_Y + BODIES.rod.L / 2 - S.yp, 0));
    return pts;
  }
  function viewPose(id) {
    const S = pends[0].S, yg = PIVOT_Y - S.gateH;
    switch (id) {
      case 'front': return fitPose(V(0, 0.06, 1).normalize(), swingPts());
      case 'pivot': return fitPose(V(0.35, 0.12, 1).normalize(), [V(-0.24, PIVOT_Y + 0.08, 0), V(0.24, PIVOT_Y - 0.26, 0), V(0, PIVOT_Y, -0.05)]);
      case 'gate': return fitPose(V(0.45, 0.32, 1).normalize(), [V(-0.16, yg - 0.1, 0.06), V(0.3, yg + 0.1, -0.06), V(0, yg, pends[1] ? ZB : 0)]);
      default: return fitPose(V(0.5, 0.2, 1).normalize(), [...swingPts(), V(BASE.x - BASE.w / 2, 0, BASE.z + BASE.d / 2), V(BASE.x + BASE.w / 2, 0, BASE.z - BASE.d / 2), V(COLUMN.x, BASE.h + 2.06, COLUMN.z), rig.timerG.position.clone()]);
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(7, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── trascinamento: sposti il pendolo, lo lasci e parte ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pickPend = () => { for (let i = 0; i < pends.length; i++) { if (raycaster.intersectObject(rig.pend[i].g, true).some((h) => h.object.visible)) return i; } return -1; };
  function dragTo(e) {
    ray(e);
    if (!raycaster.ray.intersectPlane(zPlane, v3)) return;
    let th = Math.atan2(v3.x, PIVOT_Y - v3.y);
    const lim = ampMax() * DEG;
    th = Math.max(-lim, Math.min(lim, th));
    side = th < 0 ? -1 : 1;
    state.amp = Math.max(1, Math.round(Math.abs(th) / DEG));
    ui.refresh('amp'); notes();
    for (const P of pends) P.hold(theta0());
  }
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    ray(e);
    const i = pickPend();
    if (i < 0) return;
    seq = null;
    if (pends.some((P) => !P.held)) build();
    zPlane.constant = -zOf(i);
    drag = { i };
    dragTo(e);
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) { dragTo(e); e.stopImmediatePropagation(); } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) { ray(e); canvas.classList.toggle('grab', pickPend() >= 0); }
  }, { capture: true });
  const endDrag = (e) => { if (!drag) return; drag = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); e.stopImmediatePropagation(); go(); };
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
  function setArrow(a, show, at, d, len) {
    a.visible = show && len > 0.004;
    if (!a.visible) return;
    a.position.copy(at); a.setDirection(d);
    const L = Math.min(len, 0.4), head = Math.min(0.016, L * 0.35);
    a.setLength(L, head, head * 0.6);
  }
  function placeForces() {
    const A = pends[0], S = A.S, th = A.th, w = A.w, al = A.held ? A.acc(th, 0) : A.acc(th, w);
    const m = S.m, k = 0.12 / (m * G), simple = S.kind === 'simple';
    const C = along(0, S.d, new THREE.Vector3()), rhat = V(Math.sin(th), -Math.cos(th), 0), that = V(Math.cos(th), Math.sin(th), 0);
    setArrow(arrows.w, state.forces || state.comps, C, V(0, -1, 0), m * G * k);
    setArrow(arrows.ct, state.comps, C, that.clone().multiplyScalar(-Math.sign(th) || 1), m * G * Math.abs(Math.sin(th)) * k);
    setArrow(arrows.cr, state.comps, C, rhat, m * G * Math.cos(th) * k);
    // tensione del filo (sulla sfera) o reazione del perno (sul corpo, nel perno): R = m·a_G − m·g
    const aG = that.clone().multiplyScalar(S.d * al).addScaledVector(rhat, -S.d * w * w);
    const R = aG.multiplyScalar(m).add(V(0, m * G, 0));
    if (simple) setArrow(arrows.t, state.forces, C, rhat.clone().negate(), Math.max(0, -R.dot(rhat)) * k);
    else setArrow(arrows.t, state.forces, V(0, PIVOT_Y, 0.012), R.clone().normalize(), R.length() * k);
  }
  function place() {
    pends.forEach((P, i) => rig.setAngle(i, P.th));
    const A = pends[0];
    rig.setStartIndex(A.held || drag ? theta0() : null);
    pends.forEach((P, i) => rig.setGate(i, PIVOT_Y - P.S.gateH, P.inBeam && !P.held));
    if (!pends[1]) rig.setGate(1, null);
    rig.setHarm(state.harm, A.held ? A.th0 : A.th0 * Math.cos(A.S.w0 * A.t));
    rig.setEquiv(state.equiv && A.S.kind === 'physical', A.S.Leq, A.th);
    placeForces();
    stage.outlined = state.outline ? pends.map((_, i) => rig.pend[i].g) : [];
  }

  const stopwatch = (P, m) => { const ps = P.passages; if (!ps.length) return 0; return (m.done ? ps[2 * state.N]?.t ?? P.t : P.t) - ps[0].t; };
  const periods = (P) => Math.max(0, Math.min(state.N, Math.floor((P.passages.length - 1) / 2)));
  function hud(now) {
    const A = pends[0], S = A.S, mA = meas[0];
    ui.setTitle('Cronometro', ` · ${state.N} ${state.N === 1 ? 'periodo' : 'periodi'}`);
    const sw = stopwatch(A, mA);
    ui.setClock(fmt.num(sw, 3), 's', running && !paused && A.passages.length > 0 && !mA.done);
    const last = A.passages[A.passages.length - 1];
    ui.setSide(`periodi ${periods(A)} di ${state.N}${pends[1] ? ` · secondo ${periods(pends[1])}` : ''}`,
      mA.done ? `T = ${fmt.num(mA.T, 4)} s${pends[1] && meas[1].done ? ` · secondo ${fmt.num(meas[1].T, 4)} s` : ''}` : last ? `passaggio ${fmt.num(last.dt * 1000, 1)} ms · v ${fmt.num(last.v, 3)} m/s` : 'fascio libero');
    let status;
    if (paused) status = 'in pausa';
    else if (drag) status = 'lo sposti';
    else if (A.held) status = 'pronto';
    else if (finished) status = 'fermo';
    else if (A.passages.length === 0 && A.inBeam && A.t > S.T0) status = 'non esce dal fascio';
    else if (meas.every((m) => m.done)) status = 'misurato';
    else if (A.passages.length) status = 'misura';
    else status = 'oscilla';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, running && !paused);
    ui.setGo(running || finished ? 'Di nuovo' : 'Via');
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    rig.setTimer(fmt.num(sw, 3));
    const rows = records.slice().reverse().slice(0, 14).map((r) => {
      const what = r.kind === 'simple' ? `${BOBS[r.key].name} · L ${fmt.num(r.L * 100, 0)} cm` : `${BODIES[r.key].name} · d ${fmt.num(r.d * 100, 0)} cm`;
      return { key: r.id, color: r.color, name: `${what}<small>${fmt.num(r.amp, 0)}° · ${r.N}T${r.air ? '' : ' · vuoto'}</small>`, t: `T ${fmt.num(r.T, 4)} s`, v: `teoria ${fmt.num(r.Tth, 4)}` };
    });
    ui.setRows(rows, 'Premi «Via» o trascina il pendolo e lascialo: la fotocellula conta i periodi e annota la misura.');
    if (now - metricsAt > 200) {
      metricsAt = now;
      const a = Math.min(state.amp, ampMax()), f = ampFactor(a * DEG), E0 = S.M * (1 - Math.cos(A.th0)), E = A.K + A.U;
      const simple = S.kind === 'simple';
      ui.setMetrics([
        simple
          ? { k: 'Lunghezza', v: `${fmt.num(S.L * 100, 0)} <small>cm</small>`, s: `massa ${fmt.g(S.m)}: non conta`, title: 'Dal punto di sospensione al centro della sfera' }
          : { k: 'Perno e baricentro', v: `${fmt.num(S.d * 100, 1)} <small>cm</small>`, s: `massa ${fmt.g(S.m)}`, title: 'Distanza d fra il perno e il baricentro del corpo' },
        simple
          ? { k: 'T₀ ideale', v: `${fmt.num(2 * Math.PI * Math.sqrt(S.L / G), 4)} <small>s</small>`, s: '2π·√(L/g)', title: 'Pendolo semplice ideale: massa puntiforme, filo senza massa, nel vuoto' }
          : { k: 'Momento d\'inerzia', v: `${fmt.num(S.I * 1000, 1)} <small>g·m²</small>`, s: 'I = I_G + m·d²', title: 'Rispetto al perno (teorema di Huygens–Steiner)' },
        { k: 'Periodo T₀', v: `${fmt.num(S.T0, 4)} <small>s</small>`, s: simple ? 'con la sfera, il filo e l\'aria' : '2π·√(I/(m·g·d))', title: 'Periodo delle piccole oscillazioni' },
        { k: `Periodo a ${a}°`, p: 2, v: `${fmt.num(S.T0 * f, 4)} <small>s</small>`, s: `T₀ × ${fmt.num(f, 4)}`, title: 'Periodo esatto per questa ampiezza: T₀ / agm(1, cos(θ₀/2))' },
        simple
          ? { k: 'Velocità in basso', p: 2, v: `${fmt.num(Math.sqrt(2 * G * S.L * (1 - Math.cos(a * DEG))), 3)} <small>m/s</small>`, s: '√(2·g·h)', title: 'Velocità della sfera nel punto più basso, senza attriti' }
          : { k: 'Lunghezza equivalente', p: 2, v: `${fmt.num(S.Leq * 100, 1)} <small>cm</small>`, s: 'I/(m·d)', title: 'Il pendolo semplice che ha lo stesso periodo' },
        { k: 'Ampiezza ora', p: 3, v: `${fmt.num(A.held ? a : A.amp / DEG, 1)} <small>°</small>`, s: A.held || E0 <= 0 ? 'energia iniziale' : `energia ${fmt.num((100 * E) / E0, 1)} %`, title: 'Dall\'energia meccanica che resta' },
      ]);
      tags.setText(tAngle, `θ = ${fmt.num(A.th / DEG, 1)}°`);
      pends.forEach((P, i) => tags.setText(tBody[i], P.S.kind === 'simple' ? `${BOBS[P.S.key].name} · ${fmt.g(P.S.m)}` : P.S.name));
      tags.setText(tEq, `Pendolo semplice equivalente · ${fmt.num(S.Leq * 100, 1)} cm`);
    }
  }

  function drawPlot() {
    const kind = state.plotKind, A = pends[0], S = A.S;
    const tNow = A.held ? 0 : A.t;
    if (kind === 'theta' || kind === 'energy') {
      const W = 20, X1 = Math.max(W, tNow), X0 = X1 - W;
      const series = [];
      if (kind === 'theta') {
        let Y = Math.max(5, ...pends.map((P) => Math.abs(P.th0) / DEG)) * 1.12;
        if (Y > 175) Y = 190;
        if (state.harm && !A.held) {
          const x = [], y = [];
          for (let t = Math.max(0, X0); t <= tNow; t += 0.02) { x.push(t); y.push((A.th0 * Math.cos(S.w0 * t)) / DEG); }
          series.push({ x, y, color: '#3a7bd5', width: 2, dash: [7, 6], alpha: 0.7 });
        }
        pends.forEach((P, i) => {
          const R = P.rec, k0 = R.t.findIndex((t) => t >= X0);
          if (k0 >= 0) series.push({ x: R.t.slice(k0), y: R.th.slice(k0).map((v) => v / DEG), color: PCOL[i], width: 3 });
        });
        const legend = pends.map((P, i) => [P.S.kind === 'simple' ? `${BOBS[P.S.key].name.toLowerCase()} ${fmt.num(P.S.L * 100, 0)} cm` : P.S.name.toLowerCase(), PCOL[i]]);
        if (state.harm) legend.push(['armonico', '#3a7bd5']);
        ui.drawPlot({ series, X0, X1, Y0: -Y, Y1: Y, xLabel: 't (s)', yLabel: 'θ (°)', legend });
      } else {
        const R = A.rec, k0 = Math.max(0, R.t.findIndex((t) => t >= X0)), t = R.t.slice(k0);
        const K = R.K.slice(k0).map((v) => v * 1000), U = R.U.slice(k0).map((v) => v * 1000), E = K.map((v, j) => v + U[j]);
        const E0 = S.M * (1 - Math.cos(A.th0)) * 1000;
        series.push({ x: t, y: E, color: '#15181c', width: 3 }, { x: t, y: U, color: '#e07b1f', width: 2.4 }, { x: t, y: K, color: '#2c67dc', width: 2.4 });
        ui.drawPlot({ series, X0, X1, Y0: 0, Y1: Math.max(E0, 1e-3) * 1.15, xLabel: 't (s)', yLabel: 'energia (mJ)', legend: [['cinetica', '#2c67dc'], ['potenziale', '#e07b1f'], ['totale', '#15181c']] });
      }
      return;
    }
    if (kind === 'phase') {
      // θ e ω negli ultimi 30 s: un'ellisse per le piccole oscillazioni, una spirale se si smorza
      const series = [], points = [];
      let X = 5, Y = 0.2;
      pends.forEach((P, i) => {
        const R = P.rec, k0 = Math.max(0, R.t.findIndex((t) => t >= tNow - 30));
        const x = R.th.slice(k0).map((v) => v / DEG), y = R.w.slice(k0);
        series.push({ x, y, color: PCOL[i], width: 2.6 });
        points.push({ x: P.th / DEG, y: P.w, color: PCOL[i], r: 7 });
        const a0 = Math.abs(P.th0);
        X = Math.max(X, (a0 / DEG) * 1.12); Y = Math.max(Y, 2 * Math.sqrt(P.S.M / P.S.I) * Math.sin(a0 / 2) * 1.15);
      });
      if (state.harm && !A.held) {
        const x = [], y = [];
        for (let k = 0; k <= 200; k++) { const p = (2 * Math.PI * k) / 200; x.push((A.th0 * Math.cos(p)) / DEG); y.push(-A.th0 * S.w0 * Math.sin(p)); }
        series.unshift({ x, y, color: '#3a7bd5', width: 2, dash: [7, 6], alpha: 0.7 });
        Y = Math.max(Y, Math.abs(A.th0) * S.w0 * 1.1);
      }
      ui.drawPlot({ series, points, X0: -Math.min(X, 190), X1: Math.min(X, 190), Y0: -Y, Y1: Y, xLabel: 'θ (°)', yLabel: 'ω (rad/s)' });
      return;
    }
    if (kind === 'amp') {
      // T/T₀ in funzione dell'ampiezza: la curva esatta e le misure
      const Xm = state.type === 'simple' ? 95 : 175, x = [], y = [];
      for (let d = 0; d <= Xm; d += 1) { x.push(d); y.push(ampFactor(d * DEG)); }
      const pts = records.map((r) => ({ x: r.amp, y: r.T / r.T0, color: r.color, r: 7 }));
      const Y1 = Math.max(1.25, ...y.filter((v, j) => x[j] <= Math.max(state.amp, ...records.map((r) => r.amp)) + 10)) * 1.04;
      ui.drawPlot({ series: [{ x, y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }], points: pts, X0: 0, X1: Xm, Y0: 0.96, Y1, xLabel: 'ampiezza θ₀ (°)', yLabel: 'T / T₀', legend: [['1/agm(1, cos θ₀/2)', '#15181c']] });
      return;
    }
    // leggi: T² e L per il pendolo semplice, T e d per i corpi rigidi
    if (state.type === 'simple') {
      const pts = records.filter((r) => r.kind === 'simple');
      const x = [0, 1.7], y = x.map((L) => (4 * Math.PI * Math.PI * L) / G);
      const legend = [['4π²·L/g', '#15181c']];
      if (new Set(pts.map((r) => r.L)).size >= 2) {
        const sxy = pts.reduce((s, r) => s + r.L * r.T * r.T, 0), sxx = pts.reduce((s, r) => s + r.L * r.L, 0);
        legend.push([`dalle misure g ≈ ${fmt.num((4 * Math.PI * Math.PI * sxx) / sxy, 2)} m/s²`, '#e8452c']);
      }
      ui.drawPlot({ series: [{ x, y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }], points: pts.map((r) => ({ x: r.L, y: r.T * r.T, color: r.color, r: 7 })), X0: 0, X1: 1.7, Y0: 0, Y1: 7.2, xLabel: 'L (m)', yLabel: 'T² (s²)', legend });
    } else {
      const key = state.body, H = holesOf(key);
      const x = [], y = [];
      if (key !== 'ring') for (let d = 0.01; d <= H[H.length - 1] + 0.005; d += 0.0025) { x.push(d * 100); y.push(physicalSpec(key, d, state.air).T0); }
      const pts = records.filter((r) => r.kind === 'physical' && r.key === key).map((r) => ({ x: r.d * 100, y: r.T, color: r.color, r: 7 }));
      const now = pends[0].S;
      pts.unshift({ x: now.d * 100, y: now.T0, color: '#15181c', r: 8, ring: true });
      let jmin = 0; y.forEach((v, j) => { if (v < y[jmin]) jmin = j; });
      const X1 = key === 'ring' ? 25 : x[x.length - 1] + 2, Y1 = key === 'ring' ? 2 : Math.min(4, Math.max(...y.filter((_, j) => x[j] > 3))) * 1.05;
      ui.drawPlot({ series: [{ x, y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }], points: pts, marks: x.length ? [{ x: x[jmin], color: 'rgba(12,157,143,0.7)' }] : [], X0: 0, X1, Y0: 0, Y1, xLabel: 'd (cm)', yLabel: 'T (s)', legend: x.length ? [[`minimo a ${fmt.num(x[jmin], 1)} cm`, '#0c9d8f']] : undefined });
    }
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
    if (running && dtSim > 0) {
      let left = dtSim;
      while (left > 1e-9) { const hs = Math.min(5e-4, left); for (const P of pends) P.step(hs); left -= hs; }
      tRun += dtSim;
      checkMeasures();
      // fermi del tutto (nell'aria, prima o poi): il moto e lo scorrimento dei grafici finiscono
      if (pends.every((P) => P.calm > 0.5)) { running = false; finished = true; }
    }
    place();
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
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico del moto', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, pends: () => pends, meas: () => meas, records: () => records, seq: () => seq, paused: () => paused, running: () => running, go, togglePause, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
