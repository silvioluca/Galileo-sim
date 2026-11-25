// main.js — La rifrazione della luce
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { MEDIA, LASERS, nOf, fresnel, critical, trace } from './optics.js';
import { tankScene, discScene, TANK, DISC, tankY0, jetPath } from './scenes.js';
import { Rig, BEAM_Z } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const state = {
  app: 'tank', color: 'red', on: true,
  mode: 'top', angTop: 45, angSide: 40, liquid: 'water', level: 15, oil: false, milk: true, smoke: true,
  block: 'pmma', side: 'flat', angDisc: 30,
  ambient: 0.6, protractor: true, labels: true, quality: 'low', plotKind: 'angles',
};
const BASE = { app: 'tank', color: 'red', on: true, mode: 'top', angTop: 45, angSide: 40, liquid: 'water', level: 15, oil: false, milk: true, smoke: true, block: 'pmma', side: 'flat', angDisc: 30, protractor: true, plotKind: 'angles' };
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
// passi: {set} · {wait: s} · {note} annota · {sweep: {key, to, dur}} porta un angolo a «to» in dur secondi
const PRESETS = [
  ['airwater', 'Dall\'aria all\'acqua', 'Il laser dall\'alto a 45°: in acqua il fascio si avvicina alla normale, a 32°. Una piccola parte la superficie la riflette', { app: 'tank', mode: 'top', angTop: 45 }, [], 'front'],
  ['snell', 'La legge di Snell', 'Sul disco, il plexiglas dalla parte piana: si annotano gli angoli ogni 10°. I seni stanno su una retta, e la pendenza dà l\'indice di rifrazione', { app: 'disc', block: 'pmma', side: 'flat', angDisc: 10, plotKind: 'snell' }, [10, 20, 30, 40, 50, 60, 70, 80].flatMap((a) => [{ sweep: { key: 'angDisc', to: a, dur: 0.7 } }, { wait: 0.5 }, { note: true }]), 'front'],
  ['waterair', 'Dall\'acqua all\'aria', 'Il laser dal fianco: uscendo dall\'acqua il fascio si allontana dalla normale, e più l\'angolo cresce più esce radente', { app: 'tank', mode: 'side', angSide: 78 }, [{ wait: 1 }, { sweep: { key: 'angSide', to: 63, dur: 6 } }], 'front'],
  ['tir', 'La riflessione totale', 'Oltre l\'angolo limite (48,7° per l\'acqua) il fascio non esce più: la superficie lo riflette tutto, come uno specchio perfetto, e lo rimanda giù verso il fondo', { app: 'tank', mode: 'side', angSide: 56 }, [], 'front'],
  ['critical', 'L\'angolo limite', 'Sul disco, dalla parte curva: avvicinandosi a 42° il fascio che esce diventa radente, e la parte riflessa cresce fino al 100 %', { app: 'disc', block: 'pmma', side: 'curved', angDisc: 25, plotKind: 'fresnel' }, [{ wait: 1 }, { sweep: { key: 'angDisc', to: 46, dur: 8 } }], 'front'],
  ['gems', 'Perché brillano le gemme', 'Nella zirconia cubica (n = 2,17) l\'angolo limite è di soli 27°: quasi tutta la luce che entra resta intrappolata e rimbalza. Nel diamante ancora di più', { app: 'disc', block: 'zirconia', side: 'curved', angDisc: 12 }, [{ wait: 1 }, { sweep: { key: 'angDisc', to: 34, dur: 7 } }], 'front'],
  ['fountain', 'La fontana luminosa', 'Colladon, 1842: la luce entra nel getto d\'acqua e lo segue mentre curva, rimbalzando per riflessione totale sulla sua superficie. È il principio delle fibre ottiche', { app: 'tank', mode: 'fountain', smoke: false, ambient: 0.35 }, [], 'overview'],
  ['oil', 'Olio sull\'acqua', 'Uno strato d\'olio sull\'acqua: il fascio si piega due volte, ma in acqua ha lo stesso angolo che avrebbe senza l\'olio, perché n·sin θ si conserva', { app: 'tank', mode: 'top', angTop: 55, oil: true }, [], 'close'],
  ['colors', 'I colori', 'Vetro flint a 70°: rosso, verde e viola si piegano in modo un po\' diverso. È la dispersione, che nel prisma separa i colori', { app: 'disc', block: 'flint', side: 'flat', angDisc: 70, plotKind: 'angles' }, [{ set: { color: 'red' } }, { wait: 1.5 }, { note: true }, { set: { color: 'green' } }, { wait: 1.5 }, { note: true }, { set: { color: 'violet' } }, { wait: 1.5 }, { note: true }], 'close'],
];
const VIEWS = [['overview', 'Panoramica'], ['front', 'Di fronte'], ['close', 'Da vicino']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.2, 2.6, 2.0], keyTarget: [0, 0.25, 0], shadowBox: [-1, 1, 1, -1], shadowFar: 6, fog: [6, 50] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 5;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── il fascio ─────────────────────────
  let S = null, R = null, main = null, main2 = null, jetInfo = null, records = [], seq = null, pendingView = null;
  let fpsEma = 60, hudTimer = 0, dirty = true, plotDirty = true;
  const lam = () => LASERS[state.color].nm;
  const tank = () => state.app === 'tank';

  function compute() {
    dirty = false;
    if (tank()) S = tankScene({ level: state.level / 100, liquid: state.liquid, oil: state.oil, mode: state.mode, angle: state.mode === 'top' ? state.angTop : state.angSide });
    else S = discScene({ block: state.block, side: state.side, angle: state.angDisc });
    const mu = (m) => (m === 'air' ? 0 : tank() && state.milk ? 1.4 : 0.15);
    R = trace(S.scene, S.o, S.d, lam(), { atten: mu, imin: 0.004, far: 2.5 });
    const prim = R.events.filter((e) => e.primary && S.mainTags.includes(e.tag));
    main = prim[0] || null; main2 = prim[1] || null;
    jetInfo = null;
    if (tank() && state.mode === 'fountain') {
      const jp = jetPath(state.level / 100), tir = R.events.filter((e) => e.tag === 'jet' && e.tir).length;
      const basin = R.spots.filter((s) => s.tag === 'basin').reduce((a, s) => a + s.I, 0);
      const firstJet = R.events.find((e) => e.tag === 'jet' && e.primary && e.m1 !== 'air');
      jetInfo = { v0: jp.v0, tir, basin, first: firstJet };
    }
    // in 3D
    const z = tank() ? 0 : BEAM_Z, col = LASERS[state.color].color;
    const vis = (s) => {
      if (!tank()) return 0.85;
      if (s.medium === 'air') return state.smoke ? 0.4 : 0.03;
      if (s.region && (s.region.id === 'bottom' || s.region.id === 'wallL' || s.region.id === 'wallR')) return 0.3;
      return state.milk ? 0.9 : 0.12;
    };
    const segs = state.on ? R.segs.map((s) => ({ a: s.a, b: s.b, I0: s.I0, I1: s.I1, vis: vis(s) })) : [];
    const spots = [];
    if (state.on) {
      for (const s of R.spots) spots.push({ p: s.p, I: s.I, size: tank() ? 0.03 : 0.022 });
      if (tank()) for (const e of R.events) if (e.primary && (e.tag === 'wall' || e.tag === 'glass') && e.m1 === 'air') spots.push({ p: e.p, I: 0.2 * e.I, size: 0.014 });
      spots.sort((a, b) => b.I - a.I);
    }
    rig.setBeams(segs, z, col, spots.slice(0, 40));
    rig.setLaserOn(state.on);
    rig.placeLaser(S.laser.x, S.laser.y, S.laser.dx, S.laser.dy, z, !tank(), col);
    if (!tank()) rig.setDiscArm(state.side === 'flat' ? state.angDisc * DEG : Math.PI - state.angDisc * DEG);
    if (tank()) rig.setProtractor(state.protractor && state.mode !== 'fountain' && !!main, main ? main.p[0] : 0, main ? main.p[1] : 0);
    plotDirty = true;
  }

  function rebuild() {
    rig.setApparatus(state.app);
    if (tank()) rig.setTank({ level: state.level / 100, liquid: state.liquid, oil: state.oil, fountain: state.mode === 'fountain', milk: state.milk });
    else rig.setBlock(state.block);
    dirty = true;
  }

  // ───────────────────────── misure e annotazioni ─────────────────────────
  function note() {
    if (!main) return;
    records.push({ m1: main.m1, m2: main.m2, th1: main.th1, th2: main.th2, color: state.color, nm: lam() });
    plotDirty = true;
  }
  const mname = (m) => MEDIA[m].name.toLowerCase();

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); ui.refresh(); ui.sync(); dirty = true; }
      if (st.note) note();
      if (st.sweep) seq.from = state[st.sweep.key];
    }
    seq.t += dt;
    if (st.sweep) {
      const k = Math.min(1, seq.t / st.sweep.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      state[st.sweep.key] = seq.from + (st.sweep.to - seq.from) * e; ui.refresh('ang'); dirty = true;
      if (k >= 1) { seq.i++; seq.started = false; }
    } else if (seq.t >= (st.wait || 0.02)) { seq.i++; seq.started = false; }
    if (seq && seq.i >= seq.list.length) seq = null;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const angKey = () => (tank() ? (state.mode === 'top' ? 'angTop' : 'angSide') : 'angDisc');
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    angRange: () => (tank() ? (state.mode === 'top' ? [0, 80, 0.1] : [5, 80, 0.1]) : [0, 89, 0.1]),
    angGet: () => state[angKey()], angSet: (v) => { state[angKey()] = v; },
    angLabel: () => (tank() ? (state.mode === 'top' ? 'Angolo d\'incidenza' : state.mode === 'side' ? 'Inclinazione del laser' : 'Il laser') : 'Angolo d\'incidenza'),
    angText: () => (tank() && state.mode === 'fountain' ? 'orizzontale, verso il foro' : `${fmt.num(state[angKey()], 1)}°${tank() && state.mode === 'side' ? ' <small>sull\'orizzontale</small>' : ' <small>dalla normale</small>'}`),
    levelText: () => `${fmt.num(state.level, 1)} cm`,
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, { ambient: state.ambient }, p[3]);
        if (p[3].ambient !== undefined) stage.setAmbient(0.04 + 0.96 * state.ambient);
        records = [];
        ui.refresh(); ui.sync(); rebuild();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'go': state.on = !state.on; dirty = true; break;
      case 'note': note(); break;
      case 'clear': records = []; plotDirty = true; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'app': seq = null; ui.sync(); ui.refresh(); rebuild(); setView('overview'); break;
      case 'mode': seq = null; ui.refresh(); rebuild(); break;
      case 'liquid': case 'level': case 'oil': case 'milk': seq = null; rebuild(); break;
      case 'block': seq = null; rebuild(); break;
      case 'ang': case 'side': case 'color': case 'smoke': case 'protractor': seq = null; ui.refresh('ang'); dirty = true; break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const lp = new THREE.Vector3();
  tags.add('Laser', '', (o) => o.copy(rig.laser.position).add(lp.set(-S.laser.dx * 0.08, -S.laser.dy * 0.08 + 0.025, 0)), () => !!S);
  tags.add('Sollevatore', '', (o) => o.set(0.15, TANK.PLAT * 0.55, 0.1), () => tank());
  const tLiq = tags.add('', '', (o) => o.set(0.13, tankY0() + (state.level / 100) * 0.35, TANK.Z + 0.006), () => tank());
  tags.add('Olio', 'floor alt', (o) => o.set(0.17, tankY0() + state.level / 100 - 0.012, TANK.Z + 0.006), () => tank() && state.oil);
  tags.add('Il getto', 'floor', (o) => { const j = jetPath(state.level / 100), q = j.pts[Math.round(j.pts.length * 0.45)]; return o.set(q.x, q.y + 0.01, 0.005); }, () => tank() && state.mode === 'fountain');
  tags.add('Disco ottico di Hartl', '', (o) => o.set(DISC.R * 0.62, DISC.YC + DISC.R * 0.78, 0.01), () => !tank());
  const tBlock = tags.add('', 'floor alt', (o) => o.set(DISC.RB * 0.55, DISC.YC - DISC.RB * 0.45, DISC.T + 0.002), () => !tank());

  // ───────────────────────── inquadrature ─────────────────────────
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function freeRect() {
    const Wd = window.innerWidth, Hh = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (Wd <= 860) return { x0: m, x1: Wd - m, y0: 96, y1: (live.height ? live.top : Hh) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : Wd) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dirv, pts) {
    const cam = camera.clone(), rect = freeRect(), Wd = window.innerWidth, Hh = window.innerHeight;
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) { pv.copy(p).project(cam); if (pv.z > 1 || pv.z < -1) behind = true; const x = (pv.x * 0.5 + 0.5) * Wd, y = (-pv.y * 0.5 + 0.5) * Hh; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dirv, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 1;
    for (let it = 0; it < 3; it++) {
      let lo = 0.02, hi = 20;
      for (let k = 0; k < 32; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / Hh;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  const box = (x0, y0, z0, x1, y1, z1) => { const o = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) o.push(V(x, y, z)); return o; };
  function viewPose(id) {
    if (tank()) {
      const W = TANK.X0 + TANK.G, top = TANK.PLAT + TANK.H;
      const pts = box(-W, 0, -TANK.Z, W, top, TANK.Z);
      if (S) pts.push(V(S.laser.x - S.laser.dx * 0.15, S.laser.y - S.laser.dy * 0.15, 0));
      if (state.mode === 'fountain') { const j = jetPath(state.level / 100); pts.push(V(j.pts[j.pts.length - 1].x + 0.09, 0, 0)); }
      if (id === 'front') return fitPose(V(0, 0.07, 1).normalize(), pts.filter((p) => p.z >= 0).concat(box(-W, TANK.PLAT, 0.09, W, top, 0.09)));
      if (id === 'close') { const p = main ? main.p : [0, tankY0() + state.level / 100]; return { pos: [p[0] + 0.03, p[1] + 0.05, 0.42], target: [p[0], p[1], 0] }; }
      return fitPose(V(0.42, 0.36, 1).normalize(), pts.concat(box(-0.32, 0, -0.34, -0.2, 0.05, -0.14)));
    }
    const { YC, R } = DISC;
    if (id === 'front') return fitPose(V(0, 0.03, 1).normalize(), box(-R - 0.02, YC - R - 0.02, 0, R + 0.02, YC + R + 0.02, 0.01));
    if (id === 'close') return fitPose(V(0.12, 0.1, 1).normalize(), box(-0.11, YC - 0.11, 0, 0.11, YC + 0.11, 0.02));
    const pts = box(-R, 0, -0.12, R, YC + R, 0.04);
    if (S) pts.push(V(S.laser.x - S.laser.dx * 0.15, S.laser.y - S.laser.dy * 0.15, 0));
    return fitPose(V(0.38, 0.28, 1).normalize(), pts);
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }
  function onResize() {
    const w = window.innerWidth, hh = window.innerHeight, r = freeRect();
    stage.resize(w, hh, Math.round((r.x0 + r.x1) / 2 - w / 2), Math.round(hh / 2 - (r.y0 + r.y1) / 2));
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); document.getElementById('go').click(); }
    else if (k === 'a') note();
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault(); seq = null;
      const [a, b] = tank() ? (state.mode === 'top' ? [0, 80] : [5, 80]) : [0, 89], key = angKey();
      state[key] = Math.max(a, Math.min(b, state[key] + (k === 'arrowright' ? 0.5 : -0.5))); ui.refresh('ang'); dirty = true;
    } else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  // ───────────────────────── grafico ─────────────────────────
  function pair() {
    if (main) return { n1: main.n1, n2: main.n2, m1: main.m1, m2: main.m2 };
    if (!tank()) return { n1: 1.000277, n2: nOf(state.block, lam()), m1: 'air', m2: state.block };
    return { n1: 1.000277, n2: nOf(state.liquid, lam()), m1: 'air', m2: state.liquid };
  }
  function drawPlot() {
    plotDirty = false;
    const P = pair(), r12 = P.n1 / P.n2, crit = critical(P.n1, P.n2), col = '#e8452c';
    const recs = records.filter((q) => q.m1 === P.m1 && q.m2 === P.m2);
    const lc = { red: '#e8452c', green: '#1f9d4a', violet: '#7a3fc0' };
    const th = [], t2 = [];
    for (let i = 0; i <= 180; i++) { const a = (i / 180) * 90; th.push(a); const s = r12 * Math.sin(a * DEG); t2.push(s <= 1 ? Math.asin(s) / DEG : NaN); }
    const cur = main ? [main.th1 / DEG, main.th2 === null ? null : main.th2 / DEG] : null;
    const bands = crit ? [{ x0: crit / DEG, x1: 90, color: 'rgba(232,69,44,0.07)', text: 'riflessione totale' }] : [];
    if (state.plotKind === 'angles') {
      ui.drawPlot({
        series: [{ x: [0, 90], y: [0, 90], color: '#9aa1ab', width: 1.6, dash: [6, 6] }, { x: th, y: t2, color: '#2c67dc', width: 2.4 }],
        bands, vlines: crit ? [{ x: crit / DEG, color: 'rgba(232,69,44,0.6)', dash: [6, 5] }] : [],
        points: recs.filter((q) => q.th2 !== null).map((q) => ({ x: q.th1 / DEG, y: q.th2 / DEG, color: lc[q.color], r: 6 })).concat(cur && cur[1] !== null ? [{ x: cur[0], y: cur[1], color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' }] : []),
        X0: 0, X1: 90, Y0: 0, Y1: 90, xDeg: true, yDeg: true, xLabel: 'θ₁ incidenza', yLabel: `θ₂ rifrazione · ${mname(P.m1)} → ${mname(P.m2)}`, legend: [['teoria', '#2c67dc'], ['θ₂ = θ₁', '#9aa1ab']],
      });
    } else if (state.plotKind === 'snell') {
      const xs = [0, Math.min(1, 1 / r12)], ys = xs.map((x) => r12 * x);
      // pendenza misurata (retta per l'origine) e indice relativo
      let sxx = 0, sxy = 0; for (const q of recs) if (q.th2 !== null && q.nm === lam()) { const x = Math.sin(q.th1), y = Math.sin(q.th2); sxx += x * x; sxy += x * y; }
      const slope = sxx ? sxy / sxx : null;
      const leg = [['n₁/n₂', '#2c67dc']];
      if (slope) leg.unshift([`misura: n₂/n₁ = ${fmt.num(1 / slope, 3)}`, col]);
      ui.drawPlot({
        series: [{ x: xs, y: ys, color: '#2c67dc', width: 2.4 }],
        bands: crit ? [{ x0: Math.sin(crit), x1: 1, color: 'rgba(232,69,44,0.07)', text: 'riflessione totale' }] : [],
        points: recs.filter((q) => q.th2 !== null).map((q) => ({ x: Math.sin(q.th1), y: Math.sin(q.th2), color: lc[q.color], r: 6 })).concat(cur && cur[1] !== null ? [{ x: Math.sin(main.th1), y: Math.sin(main.th2), color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' }] : []),
        X0: 0, X1: 1, Y0: 0, Y1: 1, xLabel: 'sin θ₁', yLabel: `sin θ₂ · ${mname(P.m1)} → ${mname(P.m2)}`, legend: leg,
      });
    } else {
      const Rs = [], Rp = [], Ra = [];
      for (const a of th) { const F = fresnel(P.n1, P.n2, a * DEG); Rs.push(F.rs * 100); Rp.push(F.rp * 100); Ra.push(F.R * 100); }
      const pts = cur ? [{ x: cur[0], y: fresnel(P.n1, P.n2, main.th1).R * 100, color: col, r: 7 }] : [];
      ui.drawPlot({
        series: [{ x: th, y: Rs, color: '#9aa1ab', width: 1.6, dash: [6, 5] }, { x: th, y: Rp, color: '#b07a1f', width: 1.6, dash: [2, 4] }, { x: th, y: Ra, color: '#2c67dc', width: 2.6 }],
        bands, vlines: crit ? [{ x: crit / DEG, color: 'rgba(232,69,44,0.6)', dash: [6, 5] }] : [],
        points: pts, X0: 0, X1: 90, Y0: 0, Y1: 100, xDeg: true, xLabel: 'θ₁ incidenza', yLabel: `luce riflessa (%) · ${mname(P.m1)} → ${mname(P.m2)}`,
        legend: [['media', '#2c67dc'], ['s', '#9aa1ab'], ['p', '#b07a1f']],
      });
    }
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    ui.setStatus(state.on ? (seq ? 'esperimento' : 'acceso') : 'spento', state.on);
    ui.setGo(state.on ? 'Spegni' : 'Accendi', state.on);
    tLiq.span.textContent = MEDIA[state.liquid].name;
    tBlock.span.textContent = MEDIA[state.block].name;
    const lnm = lam(), cssCol = { red: '#e8452c', green: '#1f9d4a', violet: '#7a3fc0' }[state.color];
    if (jetInfo) {
      const e = jetInfo.first, n = nOf(state.liquid, lnm), crit = critical(n, 1.000277);
      ui.setClock(`${jetInfo.tir} <small>riflessioni totali</small>`);
      ui.setSide(`nel getto · luce al catino ${Math.round(jetInfo.basin * 100)} %`, `getto a ${fmt.num(jetInfo.v0, 2)} m/s (Torricelli)`);
      ui.drawSchema(e ? { th1: e.th1, th2: e.tir ? null : e.th2, R: e.R, fromAbove: false, m1: MEDIA[e.m1].name, m2: MEDIA[e.m2].name, n1: e.n1, n2: e.n2, color: cssCol, crit } : { empty: 'il fascio non arriva al getto' });
      ui.setMetrics([
        { k: 'Il getto', v: `${fmt.num(jetInfo.v0, 2)} <small>m/s</small>`, s: 'all\'uscita: v = √(2gh)' },
        { k: 'Riflessioni totali', v: `${jetInfo.tir}`, s: 'sulla superficie del getto' },
        { k: 'Primo rimbalzo', v: e ? fmt.deg(e.th1) : '—', s: e ? 'oltre l\'angolo limite: la luce resta dentro' : '' },
        { k: 'Angolo limite', v: crit ? fmt.deg(crit) : '—', s: `${mname(state.liquid)} → aria` },
        { k: 'Luce al catino', p: 2, v: `${Math.round(jetInfo.basin * 100)} <small>%</small>`, s: 'il resto esce dove il getto curva troppo' },
        { k: 'Indice', p: 3, v: fmt.num(n, 3), s: `${MEDIA[state.liquid].name.toLowerCase()} · λ = ${lnm} nm` },
      ]);
      return;
    }
    const e = main;
    if (!e) {
      ui.setClock('—'); ui.setSide('il fascio non arriva alla superficie', '');
      ui.drawSchema({ empty: 'il fascio non arriva alla superficie' });
      ui.setMetrics([{ k: 'Incidenza', v: '—', s: '' }, { k: 'Rifrazione', v: '—', s: '' }, { k: 'Indici', v: '—', s: '' }, { k: 'Snell', v: '—', s: '' }, { k: 'Angolo limite', p: 2, v: '—', s: '' }, { k: 'Riflessa', p: 3, v: '—', s: '' }]);
      return;
    }
    const crit = critical(e.n1, e.n2), tir = e.tir, toward = e.n2 > e.n1;
    ui.setClock(tir ? `${fmt.deg(e.th1)} <small>↩</small>` : `${fmt.deg(e.th1)} <small>→</small> ${fmt.deg(e.th2)}`);
    let side2 = tir ? 'riflessione totale' : toward ? 'verso la normale' : 'via dalla normale';
    if (main2 && !tir && main2.th2 !== null) side2 = `in ${mname(main2.m2)} ${fmt.deg(main2.th2)}`;
    ui.setSide(`${mname(e.m1)} → ${mname(e.m2)}`, side2);
    const fromAbove = e.d[1] < 0;
    ui.drawSchema({ th1: e.th1, th2: tir ? null : e.th2, R: e.R, fromAbove, m1: MEDIA[e.m1].name, m2: MEDIA[e.m2].name, n1: e.n1, n2: e.n2, color: cssCol, crit });
    ui.setMetrics([
      { k: 'Incidenza θ₁', v: fmt.deg(e.th1), s: `in ${mname(e.m1)}, dalla normale` },
      { k: 'Rifrazione θ₂', v: tir ? '—' : fmt.deg(e.th2), s: tir ? 'riflessione totale: non esce' : toward ? 'si avvicina alla normale' : 'si allontana dalla normale' },
      { k: 'Indici', v: `${fmt.num(e.n1, 3)} <small>→</small> ${fmt.num(e.n2, 3)}`, s: `${mname(e.m1)} → ${mname(e.m2)} · ${lnm} nm` },
      { k: 'n · sin θ', v: fmt.num(e.n1 * Math.sin(e.th1), 3), s: tir ? `oltre n₂ = ${fmt.num(e.n2, 3)}: non c'è θ₂` : 'uguale dalle due parti (Snell)', title: 'La legge di Snell: n₁ sin θ₁ = n₂ sin θ₂' },
      { k: 'Angolo limite', p: 2, v: crit ? fmt.deg(crit) : '—', s: crit ? `${mname(e.m1)} → ${mname(e.m2)}: sin θₗ = n₂/n₁` : 'c\'è solo verso un mezzo meno denso' },
      { k: 'Riflessa', p: 3, v: `${fmt.num(e.R * 100, e.R > 0.995 ? 0 : 1)} <small>%</small>`, s: tir ? 'tutta' : `trasmessa ${fmt.num((1 - e.R) * 100, 1)} %` },
    ]);
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    stepSeq(dt);
    if (dirty) compute();
    if (pendingView) { setView(pendingView); pendingView = null; }
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud(); if (plotDirty) drawPlot(); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  rebuild(); compute();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, THREE, plotView, setView, get main() { return main; }, get R() { return R; }, records: () => records, seq: () => seq };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
