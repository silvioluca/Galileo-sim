// main.js — Il moto di rotolamento
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { G, BODIES, GRIP, accel, slipAngle, Roller } from './rolling.js';
import { Rig, HINGE, BOARD, S_END, FINISH, NL, laneZ, SUPPORT, centerH, dotLocal } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const ORDER = ['sphere', 'cyl', 'hsphere', 'ring', 'wheel', 'slider'];
const COL = { sphere: '#e0301e', cyl: '#1f5fd6', hsphere: '#d6336c', ring: '#13914b', wheel: '#7a3fd0', slider: '#3d4654' };
const ARM = 0.07;                                             // i pioli rientrano in 70 ms, poi si parte

const state = {
  angle: 6, bodies: ['sphere', 'cyl', 'ring'], sel: 'sphere', v0: 0, spin: 'roll', rp: 100, trail: true, vel: false,
  slow: 1, outline: false, labels: true, quality: 'low', plotKind: 'traj',
};
const BASE = { angle: 6, bodies: ['sphere', 'cyl', 'ring'], sel: 'sphere', v0: 0, spin: 'roll', rp: 100, trail: true, vel: false, slow: 1, plotKind: 'traj' };
const REBUILD = new Set(['bodies']);

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const RUN1 = [{ go: true }, { finish: true }];
const PRESETS = [
  ['race', 'La gara in discesa', 'Sfera piena, cilindro, sfera cava, anello e pattino a 6°: vince chi ha il momento d\'inerzia più piccolo, in proporzione; massa e raggio non contano', { angle: 6, bodies: ['sphere', 'cyl', 'hsphere', 'ring', 'slider'], sel: 'sphere', plotKind: 's' }, [{ angle: 6 }, ...RUN1], 'overview'],
  ['cycloid', 'La cicloide', 'Un cilindro rotola in piano: il punto del bordo disegna archi di cicloide e si ferma ogni volta che tocca la tavola', { angle: 0, bodies: ['cyl'], sel: 'cyl', v0: 0.3, rp: 100, slow: 0.5, plotKind: 'traj' }, [{ angle: 0 }, ...RUN1], 'follow'],
  ['trochoid', 'Dentro e fuori dal bordo', 'Cilindro, anello e ruota in piano; il punto passa dal bordo (r = R) a metà raggio e poi all\'asse. Sulla ruota, che rotola sul suo asse sottile, il punto del disco fa dei cappi', { angle: 0, bodies: ['cyl', 'ring', 'wheel'], sel: 'wheel', v0: 0.25, rp: 100, plotKind: 'traj' }, [{ angle: 0 }, { go: true }, { wait: 3 }, { set: { rp: 50 } }, { wait: 2.5 }, { set: { rp: 0 } }, { wait: 1.5 }, { set: { rp: 100 } }, { finish: true }], 'front'],
  ['velocity', 'Il punto che sta fermo', 'Le velocità dei punti di un cilindro che rotola: crescono con la distanza dal punto di contatto, che è fermo; in cima il bordo va al doppio del centro', { angle: 0, bodies: ['cyl'], sel: 'cyl', v0: 0.3, vel: true, slow: 0.25, plotKind: 'v' }, [{ angle: 0 }, { go: true }, { wait: 1.1 }, { pause: true }], 'follow'],
  ['skid', 'Dallo strisciamento al rotolamento', 'Sfera, cilindro e anello lanciati a 1,6 m/s senza girare: l\'attrito li frena e li fa girare finché rotolano, a v₀/(1+k)', { angle: 0, bodies: ['sphere', 'cyl', 'ring'], v0: 1.6, spin: 'slide', slow: 0.25, plotKind: 'v' }, [{ angle: 0 }, ...RUN1], 'overview'],
  ['backspin', 'L\'effetto all\'indietro', 'Lanciati a 1,2 m/s girando all\'indietro: la sfera piena prosegue piano, il cilindro si ferma, l\'anello torna indietro', { angle: 0, bodies: ['sphere', 'cyl', 'ring'], sel: 'ring', v0: 1.2, spin: 'back', slow: 0.5, plotKind: 'v' }, [{ angle: 0 }, ...RUN1], 'overview'],
  ['maxwell', 'La ruota sui binari', 'A 8° la ruota, che rotola sul suo asse sottile, ha I ≈ 63·m·ρ²: scende quasi 50 volte più piano della sfera, e quasi tutta l\'energia va nella rotazione', { angle: 8, bodies: ['wheel', 'sphere'], sel: 'wheel', plotKind: 's' }, [{ angle: 8 }, ...RUN1], 'overview'],
  ['slip', 'Troppo ripido: striscia', 'A 38° sfera piena e cilindro rotolano ancora; sfera cava e anello non ce la fanno e strisciano (tan α > μs·(1+k)/k)', { angle: 38, bodies: ['sphere', 'cyl', 'hsphere', 'ring'], sel: 'ring', slow: 0.25, plotKind: 'v' }, [{ angle: 38 }, ...RUN1], 'overview'],
  ['law', 'a = g·sin α / (1 + k)', 'Cinque corpi a 4°, 8° e 12°: il grafico mette a/(g·sin α) contro k = I/(m·r²), sulla curva 1/(1+k)', { bodies: ['sphere', 'cyl', 'hsphere', 'ring', 'slider'], plotKind: 'k' }, [4, 8, 12].flatMap((a) => [{ angle: a }, ...RUN1]), 'overview'],
];
const VIEWS = [['overview', 'Panoramica'], ['front', 'Di fronte'], ['start', 'Partenza'], ['finish', 'Arrivo'], ['follow', 'Segui il corpo']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.2, 3.6, 2.8], keyTarget: [-0.25, 0.3, 0], shadowBox: [-1.6, 1.6, 1.4, -1.0], shadowFar: 8, fog: [10, 60] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // frecce delle velocità: centro, otto punti del bordo, il punto seguito
  const mkArrow = (c) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, c, 0.012, 0.008);
    a.traverse((o) => { o.userData.noAO = true; o.userData.noOutline = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 9; });
    a.visible = false; scene.add(a);
    return a;
  };
  const arrows = Array.from({ length: 10 }, (_, i) => mkArrow(i === 0 ? '#15181c' : i === 9 ? '#ffffff' : '#2c67dc'));

  // ───────────────────────── stato ─────────────────────────
  let lanes = [], alphaDeg = state.angle, running = false, finished = false, tRun = 0, paused = false, arming = 0, kickT = -1;
  let seq = null, pendingView = null, view = 'overview', drag = null, records = [], recId = 0;
  let plotAt = 0, metricsAt = 0, fpsEma = 60, hudTimer = 0, rpTraced = -1, trailN = [];
  const v3 = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const alpha = () => alphaDeg * DEG;
  const selIndex = () => Math.max(0, lanes.findIndex((L) => L.key === state.sel));
  const rpOf = (L) => (L.key === 'slider' ? 0 : (state.rp / 100) * L.B.R);

  /** Corpi nuovi sulle corsie, fermi in partenza dietro i pioli. */
  function build() {
    lanes = state.bodies.map((key) => new Roller({ key, sEnd: S_END, sFinish: FINISH }));
    for (let i = 0; i < NL; i++) {
      const k = state.bodies[i] || null;
      rig.setLane(i, k, k ? COL[k] : null);
      rig.trailReset(i); rig.setPiston(i, 0);
    }
    trailN = lanes.map(() => 0); rpTraced = -1;
    running = false; finished = false; tRun = 0; arming = 0; kickT = -1; paused = false;
    notes();
  }
  function go() {
    if (arming > 0) return;
    if (running || finished || lanes.some((L) => !L.held)) build();
    arming = ARM;
  }
  function releaseAll() {
    for (const L of lanes) L.release(state.v0, state.spin);
    running = true; tRun = 0; kickT = state.v0 > 0 ? 0 : -1;
  }
  function finish() {
    running = false; finished = true;
    for (const L of lanes) L.freeze();
    // dalla partenza da fermi sul piano inclinato: a = 2·s/t² al traguardo
    if (state.v0 === 0 && alphaDeg >= 1) {
      for (const L of lanes) if (L.finish !== null) records.push({ id: ++recId, key: L.key, k: L.B.k, deg: alphaDeg, frac: (2 * FINISH) / L.finish ** 2 / (G * Math.sin(alpha())), slipped: L.everSlip });
      if (records.length > 60) records.splice(0, records.length - 60);
    }
  }
  const moving = () => running || arming > 0 || !!seq;
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { const re = Object.keys(st.set).some((k) => REBUILD.has(k)); Object.assign(state, st.set); if (re) build(); ui.refresh(); ui.sync(); notes(); }
      if (st.angle !== undefined) { state.angle = st.angle; ui.refresh('angle'); }
      if (st.go) go();
      if (st.pause) paused = true;
    }
    seq.t += dt;
    let done = false;
    if (st.set) done = seq.t > 0.4;
    else if (st.angle !== undefined) done = Math.abs(alphaDeg - st.angle) < 0.01 && seq.t > 0.3;
    else if (st.go || st.pause) done = true;
    else if (st.finish) done = (!running && arming === 0) || seq.t > 70;
    else if (st.wait) done = seq.t >= st.wait;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  function notes() {
    const L = lanes[selIndex()], B = BODIES[state.sel];
    let t = `${B.note} · massa <b>${fmt.num(B.m * 1000, 0)} g</b>`;
    if (state.sel !== 'slider') t += ` · striscia oltre <b>${fmt.num(slipAngle(B) / DEG, 1)}°</b>`;
    ui.setNote('#body-note', L ? t : '');
    ui.setNote('#launch-note', state.v0 === 0
      ? (state.angle === 0 ? 'In piano un corpo fermo resta fermo: dai una <b>velocità di lancio</b>.' : 'Al via i pioli rientrano nella tavola e i corpi partono da fermi.')
      : {
        roll: 'Il lanciatore a molla dà a tutti la stessa velocità, già rotolando: in piano procedono insieme.',
        slide: 'Partono senza girare: strisciano finché l\'attrito li fa rotolare, a <b>v = v₀/(1+k)</b>.',
        back: 'Partono girando all\'indietro (ω₀ = −2·v₀/r): finiscono a <b>v = v₀·(1−2k)/(1+k)</b>; con k > ½ tornano indietro.',
      }[state.spin]);
    const wheel = state.bodies.includes('wheel');
    ui.setNote('#point-note', (state.rp === 100 ? 'Sul bordo: una <b>cicloide</b>, che si ferma (cuspide) ogni volta che il punto tocca la tavola.'
      : state.rp === 0 ? 'Sull\'asse: una retta, come il centro.'
        : 'Dentro il bordo: una <b>cicloide accorciata</b>, senza cuspidi.')
      + (wheel ? ' Sulla ruota il punto del disco sta più lontano dall\'asse che rotola: <b>cicloide allungata</b>, con i cappi.' : ''));
  }
  const ui = createUI(state, {
    bodies: ORDER.map((k) => [k, BODIES[k]]), colors: COL, maxBodies: NL, presets: PRESETS, views: VIEWS,
    angleText: () => `h ${fmt.num(FINISH * Math.sin(state.angle * DEG) * 100, 1)} cm fino al traguardo`,
    v0Text: () => (state.v0 === 0 ? 'da fermi' : 'con la molla'),
    rpText: () => {
      const L = lanes[selIndex()];
      if (!L) return '';
      if (L.key === 'slider') return 'il pattino non gira';
      const r = rpOf(L);
      return `${fmt.num(r * 100, r < 0.01 ? 2 : 1)} cm${L.key === 'wheel' ? ` · l'asse ha ρ ${fmt.num(L.B.rho * 100, 1)} cm` : ''}`;
    },
  }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, { bodies: [...BASE.bodies] }, p[3]);
        if (!state.bodies.includes(state.sel)) state.sel = state.bodies[0];
        if (state.plotKind === 'k') records = [];
        build(); ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'add': if (state.bodies.length < NL && !state.bodies.includes(arg)) { seq = null; state.bodies = [...state.bodies, arg]; state.sel = arg; build(); ui.refresh(); ui.sync(); } break;
      case 'remove': if (state.bodies.length > 1) { seq = null; state.bodies = state.bodies.filter((k) => k !== arg); if (state.sel === arg) state.sel = state.bodies[0]; build(); ui.refresh(); ui.sync(); } break;
      case 'sel': state.sel = arg; ui.sync(); ui.refresh('rp'); notes(); if (view === 'follow') setView('follow'); break;
      case 'angle': seq = null; notes(); break;
      case 'v0': case 'spin': ui.sync(); notes(); break;
      case 'rp': notes(); break;
      case 'go': seq = null; go(); break;
      case 'pause': togglePause(); break;
      case 'reset': seq = null; build(); break;
      case 'clear': seq = null; records = []; break;
      case 'view': setView(arg); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const tAngle = tags.add('', 'nocase', (o) => o.set(HINGE.x - 0.16 * Math.cos(alpha() + 0.25), HINGE.y + 0.16 * Math.sin(alpha() + 0.25), -(BOARD.W / 2 + 0.012)));
  const tBody = Array.from({ length: NL }, (_, i) => tags.add('', 'nocase', (o) => { const L = lanes[i]; rig.world(L.s, centerH(L.key) + L.B.R + 0.03, laneZ(i), o); }, () => !!lanes[i] && (view === 'start' || i === selIndex())));
  tags.add('Traguardo · 130 cm', '', (o) => rig.world(FINISH, 0.2, -BOARD.W / 2 - 0.014, o));
  tags.add('Cronometro', '', (o) => o.copy(rig.timerG.position).setY(0.08));
  tags.add('Goniometro', '', (o) => o.set(HINGE.x - 0.03, HINGE.y + 0.2, -(BOARD.W / 2 + 0.012)), () => view === 'finish');

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
  function viewPose(id) {
    const a = state.angle * DEG, c = Math.cos(a), s = Math.sin(a), Wh = BOARD.W / 2;
    // punto della tavola (s lungo la corsa, quota y, z) all'inclinazione verso cui si va
    const at = (sv, y, z) => { const d = BOARD.start - sv; return V(HINGE.x - d * c + y * s, HINGE.y + d * s + y * c, z); };
    switch (id) {
      case 'front': return fitPose(V(0, 0.22, 1).normalize(), [at(-0.08, 0, Wh), at(-0.08, 0.14, -Wh), at(S_END + 0.04, 0, Wh), at(S_END + 0.04, 0.14, -Wh)]);
      case 'start': return fitPose(V(0.35, 0.5, 1).normalize(), [at(-0.12, 0, Wh), at(-0.12, 0.14, -Wh), at(0.32, 0, Wh), at(0.32, 0.14, -Wh)]);
      case 'finish': return fitPose(V(-0.45, 0.5, 1).normalize(), [at(FINISH - 0.25, 0, Wh), at(FINISH - 0.25, 0.18, -Wh), at(S_END + 0.06, 0, Wh), at(S_END + 0.06, 0.18, -Wh)]);
      case 'follow': {
        const i = selIndex(), L = lanes[i], p = rig.world(L.s, centerH(L.key), laneZ(i), new THREE.Vector3()), d = L.key === 'wheel' ? 0.8 : 0.5;
        return { pos: [p.x + 0.06 * d, p.y + 0.26 * d, p.z + d], target: [p.x, p.y, p.z] };
      }
      default: {
        const top = at(-0.12, 0.1, 0);
        return fitPose(V(0.42, 0.45, 1).normalize(), [V(HINGE.x - BOARD.L - 0.1, 0, Wh + 0.06), V(HINGE.x + 0.2, 0, Wh + 0.24), top, V(top.x, top.y, Wh), V(top.x, top.y, -Wh), V(HINGE.x, HINGE.y + 0.18, -Wh), V(HINGE.x + SUPPORT.dx, 0.2, SUPPORT.z)]);
      }
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(6, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── clic su un corpo (lo segue), trascinamento della tavola (inclinazione) ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pickBody = () => { let best = null; lanes.forEach((L, i) => { const h = raycaster.intersectObject(rig.lanes[i].g, true)[0]; if (h && (!best || h.distance < best.d)) best = { d: h.distance, key: L.key }; }); return best; };
  const pickBoard = () => raycaster.intersectObject(rig.board.children[0], false)[0];
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    ray(e);
    const body = pickBody();
    if (body) { if (state.sel !== body.key) { state.sel = body.key; ui.sync(); ui.refresh('rp'); notes(); } e.stopImmediatePropagation(); return; }
    const hit = pickBoard();
    if (!hit) return;
    seq = null;
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
        state.angle = Math.min(Math.max(Math.round(d * 2) / 2, 0), 40);
        ui.refresh('angle'); notes();
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) {
      ray(e);
      const b = pickBody();
      canvas.classList.toggle('picking', !!b);
      canvas.classList.toggle('sliding', !b && !!pickBoard());
    }
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
  /** Traiettorie del punto: dai campioni registrati (φ compreso), così cambiando r si ridisegnano subito. */
  function traceTrails() {
    const re = rpTraced !== state.rp;
    rpTraced = state.rp;
    lanes.forEach((L, i) => {
      if (re) { rig.trailReset(i); trailN[i] = 0; }
      const rec = L.rec, n = rec.t.length;
      if (trailN[i] >= n) return;
      const [r, zd] = dotLocal(L.key, rpOf(L)), hC = centerH(L.key), z = laneZ(i) + zd;
      for (let j = trailN[i]; j < n; j++) { const ph = rec.phi[j]; tmp.set(rec.s[j] - r * Math.sin(ph), hC - r * Math.cos(ph), z); rig.trailAdd(i, tmp); }
      trailN[i] = n;
      rig.trailCommit(i);
    });
  }
  function setArrow(a, show, at, d, len) {
    a.visible = show && len > 0.004;
    if (!a.visible) return;
    a.position.copy(at); a.setDirection(d);
    const head = Math.min(0.011, len * 0.35);
    a.setLength(len, head, head * 0.65);
  }
  /** Velocità del centro e di otto punti del bordo del corpo seguito (più il punto scelto): v_P = v + ω × (P − C). */
  function placeArrows() {
    const i = selIndex(), L = lanes[i];
    if (!state.vel || !L || L.held) { for (const a of arrows) a.visible = false; return; }
    const key = L.key, B = L.B, hC = centerH(key), q = rig.board.quaternion, roll = key !== 'slider';
    const pts = [[0, 0]];
    for (let k = 0; k < 8; k++) pts.push([B.R, (k * Math.PI) / 4]);
    pts.push([rpOf(L), 0]);
    const vs = pts.map(([r, th]) => { const psi = -Math.PI / 2 - (L.phi + th), dx = r * Math.cos(psi), dy = r * Math.sin(psi); return { dx, dy, vx: L.v + L.w * dy, vy: -L.w * dx }; });
    const vmax = Math.max(...vs.map((p) => Math.hypot(p.vx, p.vy)));
    const sc = vmax > 1e-3 ? (2 * B.R) / vmax : 0;
    const zr = key === 'sphere' || key === 'hsphere' ? 0 : dotLocal(key, B.R)[1];
    arrows[9].setColor(COL[key]);
    vs.forEach((p, k) => {
      const show = k === 0 || (roll && (k < 9 || state.rp < 100));
      const z = k === 9 ? dotLocal(key, rpOf(L))[1] : k === 0 ? zr : zr;
      rig.world(L.s + p.dx, hC + p.dy, laneZ(i) + z, v3);
      dir.set(p.vx, p.vy, 0);
      const len = dir.length() * sc;
      if (len > 0) dir.normalize().applyQuaternion(q);
      setArrow(arrows[k], show, v3, dir, len);
    });
  }
  function place() {
    rig.setAngle(alpha());
    const showDot = state.trail || state.vel;
    lanes.forEach((L, i) => {
      rig.place(i, L.key, L.s, L.phi, rpOf(L), showDot);
      rig.lanes[i].trailLine.visible = state.trail;
    });
    // pioli: alzati coi corpi fermi in partenza, rientrano al via
    const pin = arming > 0 ? arming / ARM : lanes.every((L) => L.held) ? 1 : 0;
    lanes.forEach((_, i) => rig.setPin(i, pin));
    // pistoni dei lanciatori
    const k = kickT < 0 ? 0 : kickT < 0.02 ? kickT / 0.02 : Math.max(0, 1 - (kickT - 0.15) / 0.4);
    lanes.forEach((_, i) => rig.setPiston(i, k));
    placeArrows();
    stage.outlined = state.outline ? lanes.map((_, i) => rig.lanes[i].g) : [];
  }

  function laneState(L) {
    if (L.held) return arming > 0 ? 'via' : 'pronto';
    if (L.caughtF) return Math.abs(L.v) < 2e-3 && Math.abs(L.w * L.r) < 4e-3 ? 'in fondo' : 'urta il fermo';
    if (L.caughtB) return 'tornato indietro';
    if (L.calm > 0.05) return 'fermo';
    if (L.key === 'slider') return 'scivola';
    if (L.slipping) return 'striscia';
    return L.v < 0 ? 'rotola indietro' : 'rotola';
  }
  function hud(now) {
    const i = selIndex(), L = lanes[i], B = L.B, a = alpha();
    ui.setTitle('Cronometro', ' · traguardo a 130 cm');
    ui.setClock(fmt.num(tRun, 3), 's', running && !paused);
    const n = lanes.filter((x) => x.finish !== null).length;
    const f3 = (x) => fmt.num(Math.abs(x) < 5e-4 ? 0 : x, 3);
    ui.setSide(`v ${f3(L.v)} · ω·r ${f3(L.w * L.r)} m/s`, `${B.name.toLowerCase()}: ${laneState(L)} · al traguardo ${n} di ${lanes.length}`);
    let status;
    if (paused) status = 'in pausa';
    else if (arming > 0) status = 'via';
    else if (lanes.every((x) => x.held)) status = 'pronti';
    else if (running) status = 'in moto';
    else status = 'fermi';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, (running || arming > 0) && !paused);
    ui.setGo(running || finished || arming > 0 ? 'Di nuovo' : 'Via');
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    rig.setTimer(fmt.num(!running && L.finish !== null ? L.finish : tRun, 3));
    // una riga per corsia
    const rows = lanes.map((x, j) => {
      const name = `${x.B.name}<small>${x.B.short}</small>`;
      let t, v;
      if (x.finish !== null) { t = `${fmt.num(x.finish, 3)} s`; v = `v ${fmt.num(x.vFinish, 2)} m/s`; }
      else if (finished) { t = 'non arriva'; v = `fermo a ${fmt.num(Math.max(0, x.s) * 100, 0)} cm`; }
      else { t = laneState(x); v = x.held ? '' : `v ${fmt.num(x.v, 2)} m/s`; }
      return { key: `${x.key}${j}`, color: COL[x.key], name, t, v, sel: j === i };
    });
    ui.setRows(rows, '');
    if (now - metricsAt > 200) {
      metricsAt = now;
      const sn = Math.sin(a), k = B.k, acc = accel(B, a), roll = B.shape !== 'slider', P = L.point(rpOf(L)), vP = Math.hypot(P.vx, P.vy);
      ui.setMetrics([
        { k: 'Inclinazione', v: `${fmt.num(alphaDeg, 1)} <small>°</small>`, s: `sin α ${fmt.num(sn, 3)} · h ${fmt.num(FINISH * sn * 100, 1)} cm`, title: 'h: dislivello fino al traguardo, 130 cm più in basso lungo la tavola' },
        { k: 'k = I/(m·r²)', v: roll ? `${fmt.num(k, k > 5 ? 1 : 2)}` : '0', s: `${B.name.toLowerCase()} · ${B.short}`, title: 'Il momento d\'inerzia in unità di m·r², con r il raggio su cui rotola' },
        { k: 'Accelerazione', v: alphaDeg > 0 ? `${fmt.num(acc.a, 3)} <small>m/s²</small>` : '0', s: alphaDeg === 0 ? 'in piano: rotolando, v costante' : !roll ? 'a = g·sin α' : acc.rolls ? 'a = g·sin α / (1 + k)' : 'striscia: g·(sin α − μd·cos α)', title: 'Partendo da fermo, senza aria' },
        { k: 'Rotazione', p: 2, v: roll ? `${fmt.num((100 * k) / (1 + k), 0)} <small>%</small>` : '0 <small>%</small>', s: 'dell\'energia cinetica: k/(1+k)', title: 'Rotolando senza strisciare: k/(1+k) dell\'energia cinetica è nella rotazione' },
        { k: 'Striscia oltre', p: 3, v: roll ? `${fmt.num(slipAngle(B) / DEG, 1)} <small>°</small>` : '—', s: `tan α > μs·(1+k)/k · μs ${fmt.num(GRIP.ms, 2)}`, title: 'Oltre questo angolo l\'attrito statico non basta più a farlo rotolare senza strisciare' },
        { k: 'Il punto', v: `${fmt.num(vP < 5e-4 ? 0 : vP, 3)} <small>m/s</small>`, s: L.held || Math.abs(L.v) < 1e-3 ? `r ${fmt.num(rpOf(L) * 100, 1)} cm` : `${fmt.num(vP / Math.abs(L.v), 2)} × la velocità del centro`, title: 'Velocità del punto seguito, a distanza r dall\'asse' },
      ]);
      tags.setText(tAngle, `α = ${fmt.num(alphaDeg, 1)}°`);
      lanes.forEach((x, j) => tags.setText(tBody[j], x.B.name));
    }
  }

  function drawPlot() {
    const kind = state.plotKind;
    if (kind === 'k') {
      // a/(g·sin α) contro k: la curva 1/(1+k), i punti misurati (pieni) e le previsioni per i corpi in gara (vuoti)
      const x = [], y = [];
      for (let k = 0; k <= 1.05001; k += 0.01) { x.push(k); y.push(1 / (1 + k)); }
      const pts = records.filter((r) => r.k <= 1.1).map((r) => ({ x: r.k, y: r.frac, color: COL[r.key], r: 7 }));
      if (alphaDeg >= 1) for (const L of lanes) if (L.B.k <= 1.1) pts.unshift({ x: L.B.k, y: accel(L.B, alpha()).a / (G * Math.sin(alpha())), color: COL[L.key], r: 8, ring: true });
      ui.drawPlot({ series: [{ x, y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }], points: pts, X0: 0, X1: 1.05, Y0: 0, Y1: 1.1, xLabel: 'k = I/(m·r²)', yLabel: 'a / (g·sin α)', legend: [['1/(1+k)', '#15181c']] });
      return;
    }
    if (kind === 'traj') {
      // il punto, in vera forma (stessa scala sui due assi), in una finestra che segue il corpo scelto: larga almeno
      // due giri del corpo scelto e alta quanto serve; quello che avanza va in altezza
      const area = ui.plotArea();
      let top = 0.02;
      for (const L of lanes) top = Math.max(top, centerH(L.key) + (L.key === 'slider' ? 0.014 : L.B.R));
      const i = selIndex(), Ls = lanes[i], Ps = Ls.point(rpOf(Ls)), xf = (Ls.s + Ps.dx) * 100;
      const Y0 = -0.4, Yneed = top * 100 + 1.2, Wmin = Math.max(2 * 2 * Math.PI * Ls.r * 100, 2 * Yneed, 12);
      const px = Math.min(area.w / Wmin, area.h / Yneed), Wcm = area.w / px, Y1 = Y0 + area.h / px;
      let X1 = Math.max(xf + 0.3 * Wcm, Wcm - 6), X0 = X1 - Wcm;
      if (Wcm > 170) { X0 = -6; X1 = X0 + Wcm; }
      const series = [], points = [];
      lanes.forEach((L, j) => {
        const rec = L.rec, r = rpOf(L), hC = centerH(L.key) * 100, sx = [], sy = [];
        for (let k = 0; k < rec.t.length; k++) {
          const xx = (rec.s[k] - r * Math.sin(rec.phi[k])) * 100;
          if (xx < X0 - 3 || xx > X1 + 3) { if (sx.length && xx > X1 + 3) break; continue; }
          sx.push(xx); sy.push(hC - r * Math.cos(rec.phi[k]) * 100);
        }
        series.push({ x: sx, y: sy, color: COL[L.key], width: j === i ? 3 : 2, alpha: j === i ? 1 : 0.55 });
        const P = L.point(r);
        points.push({ x: (L.s + P.dx) * 100, y: hC + P.dy * 100, color: COL[L.key], r: j === i ? 7 : 5 });
      });
      const hl = lanes.some((L) => L.key === 'wheel') ? [{ y: 6.6, color: 'rgba(122,63,208,0.35)', dash: [6, 6] }] : [];
      ui.drawPlot({ series, points, hlines: hl, X0, X1, Y0, Y1, xLabel: 'x (cm)', yLabel: 'quota sopra la tavola (cm)' });
      return;
    }
    // s(t) oppure v(t) e ω·r(t)
    let T1 = 1;
    for (const L of lanes) T1 = Math.max(T1, L.rec.t[L.rec.t.length - 1]);
    const series = [];
    let Ya = 0, Yb = kind === 's' ? 20 : 0.2;
    const a = alpha();
    lanes.forEach((L, j) => {
      const sel = j === selIndex(), w = sel ? 3 : 2;
      if (kind === 's') {
        series.push({ x: L.rec.t, y: L.rec.s.map((s) => s * 100), color: COL[L.key], width: w });
        Yb = Math.max(Yb, ...L.rec.s.map((s) => s * 100));
        // la teoria, dove è semplice: da fermi sul piano inclinato, o lanciati rotolando
        const acc = accel(L.B, a).a, v0 = state.v0, ok = !L.held && (v0 === 0 ? alphaDeg >= 1 : state.spin === 'roll' || L.key === 'slider');
        if (ok && (acc > 0 || v0 > 0)) {
          const x = [], y = [];
          for (let k = 0; k <= 80; k++) { const t = (T1 * k) / 80, s = v0 * t + 0.5 * (alphaDeg > 0 ? acc : 0) * t * t; if (s > S_END) break; x.push(t); y.push(s * 100); }
          series.unshift({ x, y, color: COL[L.key], width: 1.6, dash: [6, 6], alpha: 0.55 });
        }
      } else {
        series.push({ x: L.rec.t, y: L.rec.v, color: COL[L.key], width: w });
        if (L.key !== 'slider') series.push({ x: L.rec.t, y: L.rec.wr, color: COL[L.key], width: w - 0.5, dash: [7, 5], alpha: 0.8 });
        for (const arr of [L.rec.v, L.rec.wr]) for (const v of arr) { Ya = Math.min(Ya, v); Yb = Math.max(Yb, v); }
      }
    });
    if (kind === 's') ui.drawPlot({ series, marks: [], hlines: [{ y: FINISH * 100, color: 'rgba(18,21,26,0.35)', dash: [3, 5] }], X0: 0, X1: T1 * 1.04, Y0: 0, Y1: Math.max(Yb, FINISH * 100) * 1.06, xLabel: 't (s)', yLabel: 's (cm)' });
    else { const pad = (Yb - Ya) * 0.08 || 0.05; ui.drawPlot({ series, X0: 0, X1: T1 * 1.04, Y0: Math.min(0, Ya - pad), Y1: Yb + pad, xLabel: 't (s)', yLabel: 'v (m/s)', legend: [['— v', '#6b7380'], ['- - ω·r', '#6b7380']] }); }
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
    if (arming > 0 && dtSim > 0) { arming -= dtSim; if (arming <= 0) { arming = 0; releaseAll(); } }
    if (running && dtSim > 0) {
      const a = alpha();
      let left = dtSim;
      while (left > 1e-9) { const hs = Math.min(5e-4, left); for (const L of lanes) L.step(hs, a); left -= hs; }
      tRun += dtSim;
      if (kickT >= 0) kickT += dtSim;
      // fine: tutti fermi (in fondo, tornati indietro o trattenuti)
      if (tRun > 0.2 && (lanes.every((L) => L.calm > 0.3) || tRun > 70)) finish();
    } else if (kickT >= 0 && dtSim > 0) kickT += dtSim;
    traceTrails();
    place();
    if (view === 'follow' && !paused && lanes.length) {
      const i = selIndex(), L = lanes[i], p = rig.world(L.s, centerH(L.key), laneZ(i), v3), k = Math.min(1, dt * 4);
      const dx = (p.x - stage.controls.target.x) * k, dy = (p.y - stage.controls.target.y) * k, dz = (p.z - stage.controls.target.z) * k;
      stage.controls.target.x += dx; stage.controls.target.y += dy; stage.controls.target.z += dz;
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
    }
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
  window.lab = { state, ui, stage, rig, lanes: () => lanes, records: () => records, seq: () => seq, paused: () => paused, alpha: () => alphaDeg, running: () => running, finished: () => finished, go, togglePause, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
