// main.js — Caduta di una sfera in un fluido viscoso
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { G, FLUIDS, SPHERES, setup, terminal, stokesV, reynolds, tau, etaFromV, gamma, Drop } from './viscous.js';
import { Rig, TUBE, SURF, ROD } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const FORCE = { w: '#e07b1f', b: '#2c67dc', f: '#0c9d8f' };
const GH = 60;
const state = {
  fluid: 'glycerol', conc: 1, T: 20, ball: 'steel', d: 4, D: 60, h1: 70, h2: 20, timer: 'auto', wall: true,
  speed: 1, strobe: false, forces: true, outline: false, labels: true, quality: 'low', plotKind: 'v',
};
const BASE = { fluid: 'glycerol', conc: 1, T: 20, ball: 'steel', d: 4, D: 60, h1: 70, h2: 20, timer: 'auto', wall: true, speed: 1, strobe: false, forces: true, plotKind: 'v' };
const PHYS = new Set(['fluid', 'conc', 'T', 'ball', 'd', 'D']);
// [id, testo, descrizione, impostazioni, prove in sequenza (impostazioni di ciascuna), inquadratura]
const PRESETS = [
  ['stokes', 'La legge di Stokes', 'Sfere d\'acciaio da 2 a 6 mm in glicerina: la velocità limite cresce come il quadrato del raggio', { speed: 10, plotKind: 'r2' }, [2, 3, 4, 5, 6].map((d) => ({ d })), 'zone'],
  ['temp', 'La temperatura', 'La stessa sfera in glicerina a 15, 20, 25 e 30 °C: la viscosità si dimezza ogni 6 gradi circa', { d: 4, speed: 10, plotKind: 'v' }, [15, 20, 25, 30].map((T) => ({ T })), 'zone'],
  ['wall', 'Le pareti del tubo', 'Una sfera da 6 mm in tubi da 25, 40 e 100 mm: nel tubo stretto scende quasi a metà velocità', { d: 6, speed: 10, wall: false, plotKind: 'v' }, [25, 40, 100].map((D) => ({ D })), 'zone'],
  ['materials', 'Peso e spinta', 'Sfere da 6 mm di acciaio, vetro, alluminio e nylon: conta la differenza di densità, e il nylon galleggia', { d: 6, speed: 10, plotKind: 'v' }, ['steel', 'glass', 'alu', 'nylon'].map((ball) => ({ ball })), 'overview'],
  ['water', 'Nell\'acqua Stokes sbaglia', 'Una sfera d\'acciaio da 3 mm in acqua: numero di Reynolds di centinaia, la formula di Stokes dà una viscosità cento volte troppo grande', { fluid: 'water', d: 3, speed: 0.25, plotKind: 'v' }, [{}], 'overview'],
  ['hand', 'Cronometro a mano', 'Quattro lanci uguali misurati a mano: il tempo di reazione sparpaglia le misure; la media le raccoglie', { d: 6, timer: 'hand', speed: 1, plotKind: 'v' }, [{}, {}, {}, {}], 'zone'],
  ['honey', 'Il miele', 'Una sfera d\'acciaio da 8 mm nel miele a 20 °C, poi a 30 °C', { fluid: 'honey', d: 8, speed: 10, plotKind: 'v' }, [{ T: 20 }, { T: 30 }], 'zone'],
];
const VIEWS = [['overview', 'Panoramica'], ['zone', 'Tratto di misura'], ['top', 'Partenza'], ['bottom', 'Fondo'], ['follow', 'Segui la sfera']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.2, 3.4, 2.4], keyTarget: [0, 0.5, 0], shadowBox: [-1.1, 1.1, 1.6, -0.6], shadowFar: 7, fog: [10, 60] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── sfera, forze, immagini stroboscopiche ─────────────────────────
  let ball = null;
  const mkArrow = (c) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.1, c, 0.012, 0.008);
    a.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 9; });
    a.visible = false; scene.add(a);
    return a;
  };
  const arrows = { w: mkArrow(FORCE.w), b: mkArrow(FORCE.b), f: mkArrow(FORCE.f) };
  // le immagini stroboscopiche stanno dentro il liquido: si disegnano sopra (il liquido scrive la profondità)
  const ghostMat = new THREE.MeshStandardMaterial({ color: '#e8452c', transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, roughness: 0.4 });
  const ghosts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), ghostMat, GH);
  ghosts.count = 0; ghosts.frustumCulled = false; ghosts.userData.noAO = true; ghosts.renderOrder = 8;
  scene.add(ghosts);

  // ───────────────────────── stato ─────────────────────────
  let drop = null, running = false, paused = false, trials = [], trialId = 0, colorI = 0, seq = null, pendingView = null, view = 'overview';
  let fpsEma = 60, hudTimer = 0, plotAt = 0, ghostKey = '', strobeDt = 0.1, followY = SURF;
  let seed = 20251117;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd());
  const dummy = new THREE.Object3D(), v3 = new THREE.Vector3();

  const props = () => FLUIDS[state.fluid].props(state.T, state.conc);
  const sys = () => { const p = props(); return setup({ d: state.d / 1000, rhoS: SPHERES[state.ball].rho, eta: p.eta, rho: p.rho, D: state.D / 1000, wall: true }); };
  const markY = (h) => TUBE.bottom + h / 100;                 // quota di un segno del tratto di misura (mondo)
  const depthOf = (yw) => SURF - yw;                          // profondità dal pelo libero
  const yBotFor = (r) => SURF - TUBE.bottom - r;
  const startDepth = (r) => r + 0.002;

  // ───────────────────────── prove ─────────────────────────
  const kill = (b) => { scene.remove(b); b.geometry.dispose(); b.material.dispose(); };
  function release() {
    const S = sys();
    if (ball) kill(ball);
    ball = rig.makeBall(state.ball, S.r);
    drop = new Drop(S, yBotFor(S.r), startDepth(S.r));
    drop.cfg = { ...state };
    drop.color = COLORS[colorI++ % COLORS.length];
    drop.vt = terminal(S);
    // reazione di chi preme il cronometro: diversa a ogni lancio
    drop.react = [0.19 + 0.045 * gauss(), 0.15 + 0.05 * gauss()];
    const total = Math.abs(drop.vt) > 1e-9 ? Math.abs(yBotFor(S.r) / drop.vt) + 4.6 * tau(S, drop.vt) : 10;
    strobeDt = Math.max(0.01, total / 24);
    running = true; paused = false; ghostKey = '';
    ghostMat.color.set(drop.color);
    plotAt = 0;
  }
  function finish() {
    running = false; paused = false;
    const S = drop.S, c = drop.cfg;
    const y1 = depthOf(markY(c.h1)), y2 = depthOf(markY(c.h2)), L = (c.h1 - c.h2) / 100;
    // il passaggio del centro della sfera davanti ai due segni
    let t1 = drop.timeAt(y1), t2 = drop.timeAt(y2);
    const trial = { id: ++trialId, color: drop.color, cfg: c, S, rec: drop.rec, floating: drop.floating, vt: drop.vt, tEnd: drop.t };
    if (t1 !== null && t2 !== null) {
      if (c.timer === 'hand') { t1 += drop.react[0]; t2 += drop.react[1]; }
      const dt = c.timer === 'hand' ? Math.round((t2 - t1) * 100) / 100 : Math.round((t2 - t1) * 1e4) / 1e4;
      Object.assign(trial, { t1, t2, dt, L, v: L / dt });
    }
    trials.push(trial);
    if (trials.length > 40) trials.shift();
    if (!drop.floating) {
      const R = state.D / 2000 - S.r - 0.001, a = rnd() * Math.PI * 2, q = Math.sqrt(rnd()) * Math.max(R, 0);
      rig.addToPile(c.ball, S.r, TUBE.x + q * Math.cos(a), q * Math.sin(a));
      kill(ball); ball = null;
    }
  }
  /** Viscosità ricavata da una prova (con o senza correzione di parete, secondo l'interruttore). */
  const etaOf = (tr) => (tr.v ? etaFromV(tr.S, tr.v, state.wall) : null);

  // ───────────────────────── sequenze degli esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq || paused) return;
    if (seq.phase === 'apply') {
      Object.assign(state, seq.list[seq.i]);
      onPhys(); ui.refresh(); ui.sync();
      if (seq.i === 0 && seq.view) pendingView = seq.view;
      seq.phase = 'wait'; seq.t = 0;
    } else if (seq.phase === 'wait') {
      seq.t += dt;
      if (seq.t > (seq.i === 0 ? 1.2 : 0.6)) { release(); seq.phase = 'run'; }
    } else if (seq.phase === 'run' && !running) {
      seq.i++;
      if (seq.i >= seq.list.length) seq = null; else seq.phase = 'apply';
    }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  function onPhys() {
    if (running || (drop && drop.floating)) { running = false; paused = false; if (ball) { kill(ball); ball = null; } }
    drop = null;
    rig.setTube(state.D / 1000);
    const F = FLUIDS[state.fluid];
    rig.setFluid(F.color, F.alpha);
    rig.setThermo(state.T);
    if (state.h2 > state.h1 - 5) state.h2 = state.h1 - 5;
    const p = props(), S = sys(), vt = terminal(S);
    ui.setNote('#fluid-note', `η = <b>${fmt.eta(p.eta)}</b> · ρ = <b>${fmt.num(p.rho, 0)} kg/m³</b> a ${fmt.num(state.T, 1)} °C · ${F.note}`);
    ui.setNote('#ball-note', `Massa ${fmt.sig(S.m * 1000)} g · peso apparente ${fmt.sig(Math.abs(S.W) * 1000)} mN${S.W < 0 ? ' <b>verso l\'alto</b>: galleggia' : ''} · velocità limite <b>${fmt.speed(vt)}</b>`);
    ui.sync();
  }
  const ui = createUI(state, { fluids: Object.entries(FLUIDS), balls: Object.entries(SPHERES), presets: PRESETS, views: VIEWS }, (key, arg) => {
    if (PHYS.has(key)) { seq = null; onPhys(); return; }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        onPhys(); ui.refresh();
        seq = { list: p[4], i: 0, phase: 'apply', view: p[5] };
        break;
      }
      case 'view': setView(arg); break;
      case 'drop': seq = null; release(); break;
      case 'pause': togglePause(); break;
      case 'clear': seq = null; trials = []; rig.clearPile(); colorI = 0; break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'h1': case 'h2':
        if (state.h2 > state.h1 - 5) { if (key === 'h1') state.h2 = Math.max(5, state.h1 - 5); else state.h1 = Math.min(90, state.h2 + 5); }
        ui.refresh('h1'); ui.refresh('h2'); break;
      default: break;
    }
  });
  function togglePause() { if (running) paused = !paused; }

  // ───────────────────────── etichette ─────────────────────────
  // all'estremità sinistra del segno sul vetro (il segno copre 1,25 rad attorno al davanti del tubo)
  const tMark = [0, 1].map((i) => tags.add('', 'nocase', (o) => { const R = state.D / 2000 + TUBE.wall + 0.0004; o.set(TUBE.x - R * Math.sin(0.625), markY(i ? state.h2 : state.h1), R * Math.cos(0.625)); }));
  const tBall = tags.add('', 'nocase', (o) => o.copy(ball.position).add(v3.set(state.D / 2000 + 0.02, 0.01, 0)), () => !!ball);
  const tFluid = tags.add('', 'nocase', (o) => o.set(TUBE.x + state.D / 2000 + 0.03, SURF - 0.12, 0));
  tags.add('Termometro', '', (o) => o.set(0.16, 0.08, 0.06));
  tags.add('Tubetto di guida', '', (o) => o.set(TUBE.x, SURF + 0.13, 0), () => view === 'top');

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
  function viewPose(id) {
    const R = state.D / 2000 + 0.01;
    switch (id) {
      case 'zone': return fitPose(V(0.3, 0.12, 1).normalize(), [V(TUBE.x - R - 0.06, markY(state.h2) - 0.04, 0), V(TUBE.x + R + 0.1, markY(state.h1) + 0.04, 0), V(TUBE.x, markY(state.h1) + 0.04, R)]);
      case 'top': return { pos: [TUBE.x + 0.2, SURF + 0.14, 0.34], target: [TUBE.x, SURF - 0.02, 0] };
      case 'bottom': return { pos: [TUBE.x + 0.22, 0.16, 0.36], target: [TUBE.x, 0.06, 0] };
      case 'follow': return { pos: [TUBE.x + 0.24, followY + 0.06, 0.34], target: [TUBE.x, followY, 0] };
      default: return fitPose(V(0.35, 0.28, 1).normalize(), [V(-0.24, 0, 0.13), V(0.2, 0, 0.13), V(ROD.x, ROD.top + 0.02, ROD.z), V(TUBE.x, SURF + 0.14, 0), V(0.2, 0.06, 0.1)]);
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(6, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  canvas.addEventListener('pointerdown', () => stage.cancelTween(), { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); seq = null; release(); } else if (k === 'p') togglePause(); else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── disegno ─────────────────────────
  function setArrow(a, show, x, y, dir, len) {
    a.visible = show && len > 0.002;
    if (!a.visible) return;
    a.position.set(x, y, 0);
    a.setDirection(v3.set(0, dir, 0));
    const L = Math.min(len, 0.16), head = Math.min(0.012, L * 0.4);
    a.setLength(L, head, head * 0.7);
  }
  function recDepth(rec, t) {
    const T = rec.t; let lo = 0, hi = T.length - 1;
    if (t >= T[hi]) return rec.y[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return rec.y[lo] + ((rec.y[hi] - rec.y[lo]) * (t - T[lo])) / (T[hi] - T[lo] || 1);
  }
  function place() {
    const live = !!drop && (running || drop.floating);
    const S = live ? drop.S : sys();
    const yb = (y) => SURF - y;
    // la sfera: in caduta, oppure pronta nel tubetto di guida
    const ready = () => { const b = rig.makeBall(state.ball, state.d / 2000); b.userData.ready = true; b.userData.key = `${state.ball}|${state.d}`; scene.add(b); return b; };
    if (!ball) ball = ready();
    if (ball.userData.ready && ball.userData.key !== `${state.ball}|${state.d}`) { kill(ball); ball = ready(); }
    if (drop && (running || drop.floating)) { ball.userData.ready = false; ball.position.set(TUBE.x, yb(drop.y), 0); } else if (ball.userData.ready) ball.position.set(TUBE.x, yb(startDepth(state.d / 2000)), 0);
    if (!scene.children.includes(ball)) scene.add(ball);
    followY = ball.position.y;
    rig.setMarks(state.h1 / 100, state.h2 / 100);
    stage.outlined = state.outline ? [ball] : [];
    // forze: peso, spinta, attrito (lunghezze proporzionali, il peso vale 7 cm)
    const show = state.forces && !!ball;
    const k = 0.07 / (S.m * G), x0 = TUBE.x + state.D / 2000 + 0.03, y = ball.position.y;
    const v = live && running ? drop.v : 0, Fd = gamma(S, v) * Math.abs(v);
    setArrow(arrows.w, show, x0, y, -1, S.m * G * k);
    setArrow(arrows.b, show, x0 + 0.014, y, 1, S.rho * S.V * G * k);
    setArrow(arrows.f, show && Fd > 0, x0 + 0.028, y, v > 0 ? 1 : -1, Fd * k);
    // foto stroboscopica
    if (state.strobe && drop) {
      const n = Math.min(GH, Math.floor(drop.t / strobeDt) + 1), key = `${drop.color}:${n}`;
      if (key !== ghostKey) {
        ghostKey = key;
        for (let j = 0; j < n; j++) { dummy.position.set(TUBE.x, yb(recDepth(drop.rec, j * strobeDt)), 0); dummy.scale.setScalar(S.r); dummy.updateMatrix(); ghosts.setMatrixAt(j, dummy.matrix); }
        ghosts.count = n; ghosts.instanceMatrix.needsUpdate = true;
      }
    } else if (ghosts.count) ghosts.count = 0;
  }

  // ───────────────────────── cronometro, prove, misure ─────────────────────────
  function hud() {
    const S = drop ? drop.S : sys(), p = props(), vt = terminal(sys());
    ui.setClock(drop ? drop.t : 0, running && !paused, drop && drop.t > 99 ? 1 : 2);
    let status = paused ? 'in pausa' : running ? 'cade' : drop ? (drop.floating ? 'galleggia' : 'sul fondo') : 'pronto';
    if (seq) status += ` · ${seq.i + 1}/${seq.list.length}`;
    ui.setStatus(status, running && !paused);
    ui.setDrop(running ? 'Ricomincia' : 'Lascia cadere');
    ui.setPause(paused ? 'Riprendi' : 'Pausa', running);
    if (drop) ui.setSide(`v = ${fmt.speed(drop.v)} · ${fmt.num(Math.abs(drop.v / (drop.vt || 1)) * 100, 0)} % del limite`, `Re = ${fmt.sig(reynolds(S, drop.v), 2)} · profondità ${fmt.num(drop.y * 100, 1)} cm`);
    else ui.setSide(`velocità limite ${fmt.speed(vt)}`, `tratto di misura ${state.h1 - state.h2} cm`);
    // righe: prove dal più recente, più la media delle viscosità con il fluido attuale
    const same = trials.filter((t) => t.v && t.cfg.fluid === state.fluid && t.cfg.T === state.T && t.cfg.conc === state.conc);
    const rows = trials.slice().reverse().slice(0, 14).map((t) => {
      const c = t.cfg, eta = etaOf(t);
      return { key: t.id, color: t.color, name: `${SPHERES[c.ball].name} ${fmt.num(c.d, 1)} mm<small>${FLUIDS[c.fluid].name.toLowerCase()} ${fmt.num(c.T, 1)} °C · tubo ${c.D} mm</small>`, t: t.v ? (c.timer === 'hand' ? fmt.s(t.dt, 2) : fmt.s(t.dt, 4)) : t.floating ? 'galleggia' : '—', v: eta ? fmt.eta(eta) : '' };
    });
    if (same.length >= 2) {
      const e = same.map(etaOf), m = e.reduce((a, b) => a + b, 0) / e.length, sd = Math.sqrt(e.reduce((a, b) => a + (b - m) ** 2, 0) / (e.length - 1));
      rows.unshift({ key: `m${same.length}${state.wall}`, mean: true, color: '#15181c', name: `Media di ${same.length} prove<small>± ${fmt.eta(sd / Math.sqrt(e.length))}</small>`, t: `vera ${fmt.eta(p.eta)}`, v: fmt.eta(m) });
    }
    ui.setRows(rows, 'Premi «Lascia cadere» o la barra spaziatrice.');
    const last = [...trials].reverse().find((t) => t.v);
    const Re = reynolds(S, vt), tc = tau(S, vt);
    ui.setMetrics([
      { k: 'Velocità limite', v: fmt.speed(vt).replace(/ (mm\/s|m\/s)/, ' <small>$1</small>'), s: `Stokes: ${fmt.speed(stokesV(S))}`, title: 'Con la resistenza completa e l\'effetto delle pareti' },
      { k: 'Reynolds', v: fmt.sig(Re, 2), s: Re < 0.1 ? 'regime di Stokes' : Re < 1 ? 'Stokes quasi giusta' : Re < 1000 ? 'la scia conta' : 'resistenza quasi quadratica', title: 'Re = ρ·v·d / η alla velocità limite' },
      { k: 'Viscosità', v: fmt.eta(p.eta).replace(/ (mPa·s|Pa·s)/, ' <small>$1</small>'), s: `${FLUIDS[state.fluid].name.toLowerCase()} a ${fmt.num(state.T, 1)} °C` },
      { k: 'Densità', p: 2, v: `${fmt.num(p.rho, 0)} · ${fmt.num(SPHERES[state.ball].rho, 0)} <small>kg/m³</small>`, s: 'fluido · sfera' },
      { k: 'Costante di tempo', p: 2, v: tc < 1e-3 ? `${fmt.sig(tc * 1e6)} <small>µs</small>` : tc < 1 ? `${fmt.sig(tc * 1000)} <small>ms</small>` : `${fmt.sig(tc)} <small>s</small>`, s: `99 % del limite in ${fmt.sig(Math.abs(4.6 * tc * vt) * 1000)} mm`, title: 'τ = (m + massa aggiunta) / coefficiente di resistenza' },
      { k: 'Parete', p: 3, v: fmt.num(S.kw, 3), s: `d/D = ${fmt.num(state.d / state.D, 3)} · Francis`, title: 'Velocità nel tubo / velocità in un fluido illimitato' },
      { k: 'Ultima misura', p: 3, v: last ? fmt.eta(etaOf(last)).replace(/ (mPa·s|Pa·s)/, ' <small>$1</small>') : '—', s: last ? `${etaOf(last) >= last.S.eta ? '+' : '−'}${fmt.num(Math.abs(etaOf(last) / last.S.eta - 1) * 100, 1)} % sul vero` : 'η = 2r²(ρs − ρf)g / 9v' },
    ]);
    tags.setText(tMark[0], `${state.h1} cm`); tags.setText(tMark[1], `${state.h2} cm`);
    tags.setText(tFluid, `${FLUIDS[state.fluid].name}${state.fluid === 'glycerol' && state.conc < 1 ? ` ${Math.round(state.conc * 100)} %` : ''} · ${fmt.num(state.T, 1)} °C`);
    if (drop && ball) tags.setText(tBall, fmt.speed(drop.v));
  }

  function drawPlot() {
    const kind = state.plotKind;
    if (kind === 'r2') {
      // v misurata in funzione di r², per le prove con lo stesso fluido e materiale: una retta per l'origine
      const S0 = sys(), dRho = S0.rhoS - S0.rho;
      // con la correzione di parete i punti sono riportati al fluido illimitato (v / k)
      const pts = trials.filter((t) => t.v && t.cfg.fluid === state.fluid && t.cfg.T === state.T && t.cfg.conc === state.conc && t.cfg.ball === state.ball)
        .map((t) => ({ t, r2: (t.cfg.d / 2) ** 2, v: (state.wall ? t.v / t.S.kw : t.v) * 1000 }));
      let X1 = Math.max(4, (state.d / 2) ** 2 * 1.3), Y1 = 0;
      for (const p of pts) { X1 = Math.max(X1, p.r2 * 1.25); Y1 = Math.max(Y1, p.v * 1.15); }
      const slope = (2 * dRho * G) / (9 * S0.eta) * 1e-6 * 1000;          // mm/s per mm²
      const sx = [0, X1], line = { x: sx, y: sx.map((x) => slope * x), color: '#6b7380', width: 2, dash: [8, 6], alpha: 0.8 };
      // curva vera (pareti e Reynolds) per questo fluido e tubo
      const cx = [], cy = [];
      for (let i = 0; i <= 60; i++) { const d = Math.sqrt((X1 * i) / 60) * 2 / 1000; if (!d) { cx.push(0); cy.push(0); continue; } const p = props(); const S = setup({ d, rhoS: SPHERES[state.ball].rho, eta: p.eta, rho: p.rho, D: state.D / 1000 }); cx.push((d * 500) ** 2); cy.push(terminal(S) * 1000); }
      Y1 = Math.max(Y1, Math.min(slope * X1, Math.max(...cy) * 1.2), 1);
      let fit = '';
      if (pts.length >= 2) {
        const k = pts.reduce((a, p) => a + p.r2 * p.v, 0) / pts.reduce((a, p) => a + p.r2 * p.r2, 0);
        fit = ` · retta: η = ${fmt.eta((2 * dRho * G) / (9 * (k / 1000 / 1e-6)))}`;
      }
      const series = [line];
      if (!state.wall) series.push({ x: cx, y: cy, color: '#15181c', width: 2 });
      ui.drawPlot({ series, points: pts.map((p) => ({ x: p.r2, y: p.v, color: p.t.color, r: 7 })), X0: 0, X1, Y0: 0, Y1, xLabel: 'r² (mm²)', yLabel: `${state.wall ? 'v corretta' : 'v'} (mm/s)${fit}`, legend: state.wall ? [['Stokes', '#6b7380']] : [['Stokes', '#6b7380'], ['nel tubo', '#15181c']] });
      return;
    }
    const list = trials.slice(-6).map((t) => ({ rec: t.rec, color: t.color, cur: false }));
    if (drop && running) list.push({ rec: drop.rec, color: drop.color, cur: true });
    let T1 = 1, vmax = 0.001;
    for (const s of list) { T1 = Math.max(T1, s.rec.t[s.rec.t.length - 1]); for (const v of s.rec.v) vmax = Math.max(vmax, Math.abs(v)); }
    const mm = vmax < 0.1, k = kind === 'v' ? (mm ? 1000 : 1) : 100;
    const series = list.map((s, i) => ({ x: s.rec.t, y: (kind === 'v' ? s.rec.v : s.rec.y).map((v) => v * k), color: s.color, alpha: s.cur || i === list.length - 1 ? 1 : 0.45, width: s.cur ? 3 : 2 }));
    const Y1 = kind === 'v' ? vmax * k * 1.12 : (SURF - TUBE.bottom) * 100 * 1.05;
    const Y0 = kind === 'v' ? Math.min(0, ...list.map((s) => Math.min(...s.rec.v) * k)) * 1.1 : 0;
    const marks = [];
    if (drop && kind === 'y') for (const h of [state.h1, state.h2]) { const t = drop.timeAt(depthOf(markY(h))); if (t !== null) marks.push({ x: t, color: 'rgba(212,48,31,0.6)' }); }
    ui.drawPlot({ series, marks, X0: 0, X1: T1 * 1.04, Y0, Y1: Math.max(Y1, Y0 + 1e-6), xLabel: 't (s)', yLabel: kind === 'v' ? `velocità (${mm ? 'mm/s' : 'm/s'})` : 'profondità (cm)' });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (pendingView) { setView(pendingView); pendingView = null; }
    stepSeq(dt);
    if (running && drop && !paused) { drop.step(Math.min(dt, 0.05) * state.speed); if (drop.done) finish(); }
    place();
    if (view === 'follow') {
      const k = Math.min(1, dt * 4), dy = (followY - stage.controls.target.y) * k;
      stage.controls.target.y += dy; camera.position.y += dy;
    }
    stage.update(dt);
    hud();
    tags.update(camera, w, h, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 100) { plotAt = nowMs; drawPlot(); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  onPhys();
  ui.refresh(); ui.sync();
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico della caduta', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  setView('overview', true);
  window.lab = { state, ui, stage, rig, drop: () => drop, trials: () => trials, running: () => running, paused: () => paused, seq: () => seq, release, togglePause, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
