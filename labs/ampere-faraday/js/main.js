// main.js — Le esperienze di Ampère e di Faraday
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { G, MU0, SWING, MAGNET, ROD_Y, STRIPS, Swing, Strips, swingForce, stripsEquilibrium } from './physics.js';
import { Rig, MID_Y } from './rig.js';
import { createUI, fmt } from './ui.js';

const state = {
  exp: 'faraday', on: true, I: 0, rev: false, nMag: 2, flip: false, Ia: 0, mode: 'opp',
  vectors: true, lines: false, outline: false, labels: true, quality: 'low', plotKind: 'FI',
};
const BASE = { exp: 'faraday', on: true, I: 0, rev: false, nMag: 2, flip: false, Ia: 0, mode: 'opp', vectors: true, lines: false, plotKind: 'FI' };
const steps = (key, list, w = 3.5) => list.flatMap((v) => [{ sweep: { key, to: v, dur: 0.6 } }, { wait: w }, { note: true }]);
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const PRESETS = [
  ['swing', 'L\'altalena di Faraday', 'Londra, 1821: un magnete spinge un filo percorso da corrente. Accesa la corrente, l\'altalena si sposta fra i poli; invertendo la corrente si sposta dall\'altra parte', { exp: 'faraday', nMag: 3 }, [{ wait: 1.5 }, { sweep: { key: 'I', to: 8, dur: 0.5 } }, { wait: 4 }, { set: { rev: true } }, { wait: 4 }], 'overview'],
  ['rule', 'La regola della mano destra', 'F = I L × B: la forza è perpendicolare sia al filo sia al campo. Capovolgendo i magneti il campo si inverte, e con lui la forza', { exp: 'faraday', nMag: 3, I: 8, vectors: true }, [{ wait: 4 }, { set: { flip: true } }, { wait: 4 }], 'close'],
  ['FI', 'La forza e la corrente', 'Due magneti; si aumenta la corrente un passo alla volta e si legge l\'angolo sul goniometro: F = mg tan θ cresce in proporzione alla corrente', { exp: 'faraday', nMag: 2, plotKind: 'FI' }, steps('I', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'side'],
  ['FL', 'La forza e la lunghezza', 'Con la stessa corrente, uno, due e tre magneti affiancati: il tratto di filo nel campo è lungo 4, 8 e 12 cm, e la forza raddoppia e triplica', { exp: 'faraday', nMag: 1, I: 8, plotKind: 'FL' }, [{ wait: 4 }, { note: true }, { set: { nMag: 2 } }, { wait: 4 }, { note: true }, { set: { nMag: 3 } }, { wait: 4 }, { note: true }], 'side'],
  ['opp', 'Correnti opposte', 'Parigi, 1820: in serie la corrente scende in una striscia e sale nell\'altra. Due correnti di verso opposto si respingono: le strisce si allargano', { exp: 'ampere', mode: 'opp', plotKind: 'gap' }, [{ wait: 1.5 }, { sweep: { key: 'Ia', to: 35, dur: 4 } }, { wait: 3 }], 'overview'],
  ['same', 'Correnti concordi', 'In parallelo la corrente scende in tutte e due le strisce: correnti dello stesso verso si attraggono. Più si avvicinano più la forza cresce, finché si chiudono di colpo', { exp: 'ampere', mode: 'same', plotKind: 'gap' }, [{ wait: 1.5 }, { sweep: { key: 'Ia', to: 16, dur: 3 } }, { wait: 3 }, { sweep: { key: 'Ia', to: 24, dur: 3 } }, { wait: 3 }], 'side'],
  ['field', 'Il campo delle due correnti', 'Sul foglio a metà altezza le linee di campo: con versi opposti si addensano fra le strisce e le spingono via; con lo stesso verso girano attorno a tutte e due e le tengono insieme', { exp: 'ampere', mode: 'opp', Ia: 25, lines: true }, [{ wait: 4 }, { set: { mode: 'same', Ia: 12 } }, { wait: 4 }], 'close'],
  ['gap', 'La distanza e la corrente', 'Strisce in serie: a ogni passo di corrente si legge sul righello la distanza a metà altezza. La forza per metro, μ0 I² / 2πd, la contrasta la tensione delle strisce', { exp: 'ampere', mode: 'opp', plotKind: 'gap' }, steps('Ia', [5, 10, 15, 20, 25, 30, 35, 40], 2.5), 'side'],
];
const VIEWS = () => (state.exp === 'faraday' ? [['overview', 'Panoramica'], ['side', 'Il goniometro'], ['close', 'Fra i poli']] : [['overview', 'Panoramica'], ['side', 'Le strisce'], ['close', 'Il campo a metà altezza']]);

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.1, 2.6, 1.7], keyTarget: [0, 0.2, 0], shadowBox: [-1.0, 1.0, 1.0, -1.0], shadowFar: 7, fog: [6, 45] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 6;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));
  const swing = new Swing(), strips = new Strips();
  let paused = false, seq = null, pendingView = null, records = [], plotDirty = true, sliceGap = -1, sliceMode = '', A = null;
  const isF = () => state.exp === 'faraday';
  const Icur = () => (state.on ? state.I * (state.rev ? -1 : 1) : 0);           // corrente nell'altalena (lungo x)
  const Isup = () => (state.on ? state.Ia : 0);
  const Ip = () => (state.mode === 'opp' ? Isup() : Isup() / 2);                 // corrente in ciascuna striscia
  const thDeg = () => (swing.th * 180) / Math.PI;
  const shownTh = () => Math.round(thDeg() * 10) / 10;                          // il goniometro si legge al decimo di grado
  const shownGap = () => Math.round(strips.gap() * 2000) / 2;                    // il righello al mezzo millimetro (mm)

  function setup() {
    rig.wire(state.exp, state.rev, state.mode);
    A = rig.anchors(state.exp);
    sliceGap = -1;
    plotDirty = true;
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { const was = [state.exp, state.mode, state.rev].join(); Object.assign(state, st.set); ui.refresh(); ui.sync(); if (was !== [state.exp, state.mode, state.rev].join()) setup(); }
      if (st.note) note();
      if (st.sweep) seq.from = state[st.sweep.key];
    }
    seq.t += dt;
    if (st.sweep) {
      const k = Math.min(1, seq.t / st.sweep.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      state[st.sweep.key] = seq.from + (st.sweep.to - seq.from) * e; ui.refresh(st.sweep.key);
      if (k >= 1) { seq.i++; seq.started = false; }
    } else if (seq.t >= (st.wait || 0.02)) { seq.i++; seq.started = false; }
    if (seq && seq.i >= seq.list.length) seq = null;
  }
  function note() {
    if (isF()) records.push({ exp: 'faraday', I: Icur(), n: state.nMag, flip: state.flip, th: shownTh() });
    else records.push({ exp: 'ampere', Is: Isup(), Ip: Ip(), mode: state.mode, d: shownGap(), stuck: strips.stuck });
    plotDirty = true;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    text: {
      I: () => `${fmt.num(state.I, 2)} A`,
      Ia: () => `${fmt.num(state.Ia, 1)} A <small>· ${fmt.num(state.mode === 'opp' ? state.Ia : state.Ia / 2, 1)} A per striscia</small>`,
    },
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        records = []; paused = false; swing.th = swing.w = 0; strips.reset();
        ui.refresh(); ui.sync(); setup();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'pause': paused = !paused; break;
      case 'note': note(); break;
      case 'clear': records = []; plotDirty = true; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'exp': seq = null; ui.sync(); setup(); setView('overview'); break;
      case 'rev': case 'mode': seq = null; ui.refresh(); setup(); break;
      case 'I': case 'Ia': case 'on': case 'nMag': case 'flip': seq = null; ui.refresh(); plotDirty = true; break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  tags.add('Alimentatore per correnti forti', '', (o) => o.copy(A.supply));
  tags.add('L\'altalena', '', (o) => o.copy(A.app), isF);
  tags.add('Magneti a U', 'floor', (o) => o.copy(A.magnet), isF);
  tags.add('Goniometro', 'floor alt', (o) => o.copy(A.prot), isF);
  tags.add('Strisce di alluminio', '', (o) => o.copy(A.strips), () => !isF());
  tags.add('Righello', 'floor alt', (o) => o.copy(A.ruler), () => !isF());

  // ───────────────────────── inquadrature ─────────────────────────
  const DEG = Math.PI / 180;
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
    if (isF()) {
      if (id === 'side') return fitPose(V(1, 0.1, 0.0001).normalize(), box(0.11, 0.12, -0.18, 0.13, SWING.pivotY + 0.02, 0.18));
      if (id === 'close') return fitPose(V(0.45, 0.5, 1).normalize(), box(-0.1, ROD_Y - 0.04, -0.07, 0.1, ROD_Y + 0.04, 0.06));
      return fitPose(V(0.35, 0.42, 1).normalize(), box(-0.55, 0, -0.18, 0.2, SWING.pivotY + 0.04, 0.13));
    }
    if (id === 'side') return fitPose(V(0.25, 0.2, 1).normalize(), box(-0.05, MID_Y - 0.14, -0.02, 0.05, MID_Y + 0.14, 0.02));
    if (id === 'close') return fitPose(V(0.1, 1, 0.45).normalize(), box(-0.08, MID_Y, -0.06, 0.08, MID_Y, 0.06));
    return fitPose(V(0.32, 0.3, 1).normalize(), box(-0.55, 0, -0.1, 0.16, STRIPS.top + 0.05, 0.1));
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
    if (k === 'p') paused = !paused;
    else if (k === 'a') note();
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault(); seq = null; const d = k === 'arrowright' ? 1 : -1;
      if (isF()) { state.I = Math.max(0, Math.min(10, Math.round((state.I + d * (e.shiftKey ? 0.1 : 0.5)) * 100) / 100)); ui.refresh('I'); }
      else { state.Ia = Math.max(0, Math.min(40, Math.round((state.Ia + d * (e.shiftKey ? 0.2 : 1)) * 10) / 10)); ui.refresh('Ia'); }
      plotDirty = true;
    } else if (k >= '1' && k <= '3') setView(VIEWS()[Number(k) - 1][0]);
  });

  // ───────────────────────── grafici ─────────────────────────
  const eqCache = {};
  function gapCurve(mode) {
    if (eqCache[mode]) return eqCache[mode];
    const xs = [], ys = [];
    for (let i = 0; i <= 40; i++) { const Is = i; xs.push(Is); ys.push(stripsEquilibrium(mode === 'opp' ? Is : Is / 2, mode) * 1000); }
    return (eqCache[mode] = { xs, ys });
  }
  function drawPlot() {
    plotDirty = false;
    const ring = (x, y) => ({ x, y, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' });
    const mg = SWING.m * G;
    if (state.plotKind === 'FI') {
      const recs = records.filter((r) => r.exp === 'faraday'), L = state.nMag * MAGNET.a;
      const pts = recs.map((r) => ({ x: Math.abs(r.I), y: mg * Math.tan((Math.abs(r.th) * Math.PI) / 180) * 1000, color: ['#2c67dc', '#e8452c', '#1f9e6e'][r.n - 1], r: 6 }));
      const Y1 = Math.max(20, MAGNET.B0 * 10 * L * 1000, ...pts.map((p) => p.y)) * 1.1;
      ui.drawPlot({
        series: [1, 2, 3].map((n) => ({ x: [0, 10], y: [0, MAGNET.B0 * 10 * n * MAGNET.a * 1000], color: ['#2c67dc', '#e8452c', '#1f9e6e'][n - 1], width: n === state.nMag ? 2.2 : 1.2, dash: [7, 6] })),
        points: pts.concat([ring(Math.abs(Icur()), mg * Math.tan(Math.abs(swing.th)) * 1000)]), X0: 0, X1: 10.5, Y0: 0, Y1, xLabel: 'corrente I (A)', yLabel: 'forza F = mg tan θ (mN)',
        legend: [['1 magnete', '#2c67dc'], ['2', '#e8452c'], ['3', '#1f9e6e'], ['— B I L', '#9aa1ab']],
      });
    } else if (state.plotKind === 'FL') {
      const recs = records.filter((r) => r.exp === 'faraday'), I = Math.abs(Icur());
      const pts = recs.map((r) => ({ x: r.n * MAGNET.a * 100, y: mg * Math.tan((Math.abs(r.th) * Math.PI) / 180) * 1000, color: '#e8452c', r: 6 }));
      const Y1 = Math.max(20, MAGNET.B0 * Math.max(I, 1) * 0.13 * 1000, ...pts.map((p) => p.y)) * 1.1;
      ui.drawPlot({
        series: [{ x: [0, 13], y: [0, MAGNET.B0 * I * 0.13 * 1000], color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: pts.concat([ring(state.nMag * MAGNET.a * 100, mg * Math.tan(Math.abs(swing.th)) * 1000)]), X0: 0, X1: 13, Y0: 0, Y1, xLabel: 'tratto di filo nel campo L (cm)', yLabel: 'forza F (mN)',
        legend: [['annotati', '#e8452c'], [`B I L, con I = ${fmt.num(I, 1)} A`, '#9aa1ab']],
      });
    } else if (state.plotKind === 'gap') {
      const recs = records.filter((r) => r.exp === 'ampere');
      const cur = gapCurve(state.mode);
      const pts = recs.map((r) => ({ x: r.Is, y: r.d, color: r.mode === 'opp' ? '#e8452c' : '#2c67dc', r: 6 }));
      const Y1 = Math.max(20, ...cur.ys, ...pts.map((p) => p.y)) * 1.08;
      ui.drawPlot({
        series: [{ x: cur.xs, y: cur.ys, color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: pts.concat([ring(Isup(), shownGap())]), X0: 0, X1: 41, Y0: 0, Y1, xLabel: 'corrente dell\'alimentatore (A)', yLabel: 'distanza a metà altezza (mm)',
        legend: [['in serie', '#e8452c'], ['in parallelo', '#2c67dc'], ['in teoria', '#9aa1ab']],
      });
    } else {
      // la forma: lo spostamento di una striscia lungo l'altezza
      const n = STRIPS.N, xs = [], ys = [];
      for (let i = 0; i <= n; i++) { xs.push((STRIPS.L * (n - i)) / n * 100); ys.push(strips.u[i] * 1000); }
      const m = Math.max(2, ...ys.map(Math.abs)) * 1.2;
      ui.drawPlot({
        series: [{ x: xs, y: ys, color: '#2c67dc', width: 2.6 }],
        points: [], X0: 0, X1: 50, Y0: -Math.max(m, STRIPS.d0 * 500 + 1), Y1: m, xLabel: 'altezza sulla molletta (cm)', yLabel: 'spostamento verso l\'esterno (mm)',
        legend: [[state.mode === 'opp' ? 'si respingono' : 'si attraggono', '#2c67dc']],
      });
    }
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    ui.setPause(paused ? 'Riprendi' : 'Pausa');
    if (isF()) {
      const I = Icur(), th = shownTh(), L = state.nMag * MAGNET.a, F = SWING.m * G * Math.tan(Math.abs(swing.th));
      const moving = Math.abs(swing.w) > 0.01;
      ui.setStatus(paused ? 'in pausa' : moving ? 'oscilla' : Math.abs(th) > 0.05 ? 'deviata' : 'ferma', !paused && moving);
      ui.setClock(`${fmt.num(Math.abs(th), 1)}° <small>${Math.abs(th) < 0.05 ? '' : th > 0 ? 'fuori' : 'dentro'}</small>`);
      ui.setSide(`mg tan θ = ${fmt.num(F * 1000, 1)} mN`, `B I L = ${fmt.num(MAGNET.B0 * Math.abs(I) * L * 1000, 1)} mN`);
      ui.drawFaraday({ th: swing.th, I, flip: state.flip, F: swing.F, Fscale: 1500, B: MAGNET.B0, L });
      const Bm = Math.abs(I) > 0.05 && Math.abs(th) > 0.05 ? F / (Math.abs(I) * L) : NaN;
      ui.setMetrics([
        { k: 'Corrente', v: `${fmt.num(I, 2).replace('-', '−')} <small>A</small>`, s: state.on ? (state.rev ? 'invertita' : 'nel filo, da sinistra a destra') : 'alimentatore spento' },
        { k: 'Angolo', v: `${fmt.num(Math.abs(th), 1)}°`, s: 'sul goniometro' },
        { k: 'Forza', v: `${fmt.num(F * 1000, 1)} <small>mN</small>`, s: `F = mg tan θ, con m = ${fmt.num(SWING.m * 1000, 0)} g` },
        { k: 'Campo ricavato', v: isFinite(Bm) ? `${fmt.num(Bm * 1000, 0)} <small>mT</small>` : '—', s: `B = F / (I L) · fra i poli ${fmt.num(MAGNET.B0 * 1000, 0)} mT` },
        { k: 'Filo nel campo', p: 2, v: `${fmt.num(L * 100, 0)} <small>cm</small>`, s: `${state.nMag} ${state.nMag === 1 ? 'magnete' : 'magneti'} da ${fmt.num(MAGNET.a * 100, 0)} cm` },
      ]);
    } else {
      const Is = Isup(), I1 = Ip(), d = shownGap(), dm = strips.gap(), f = (MU0 * I1 * I1) / (2 * Math.PI * dm);
      const moving = strips.v.some((v) => Math.abs(v) > 0.002);
      ui.setStatus(paused ? 'in pausa' : strips.stuck ? 'chiuse' : moving ? 'si muovono' : Is > 0 ? 'ferme' : 'corrente spenta', !paused && moving);
      ui.setClock(`${fmt.num(d, 1)} <small>mm</small>`);
      ui.setSide(`${fmt.num(I1, 1)} A per striscia`, strips.stuck ? 'si sono toccate' : `F/L = ${fmt.num(f * 1000, 2)} mN/m`);
      ui.drawAmpere({ u: strips.u, d0: STRIPS.d0, L: STRIPS.L, same: state.mode === 'same', Ip: I1, gap: dm, f });
      ui.setMetrics([
        { k: 'Alimentatore', v: `${fmt.num(Is, 1)} <small>A</small>`, s: state.mode === 'opp' ? 'strisce in serie' : 'strisce in parallelo' },
        { k: 'In ogni striscia', v: `${fmt.num(I1, 1)} <small>A</small>`, s: state.mode === 'opp' ? 'versi opposti' : 'stesso verso' },
        { k: 'Distanza', v: `${fmt.num(d, 1)} <small>mm</small>`, s: `a metà altezza; a riposo ${fmt.num(STRIPS.d0 * 1000, 0)} mm` },
        { k: 'Forza per metro', v: `${fmt.num(f * 1000, 2)} <small>mN/m</small>`, s: 'μ0 I1 I2 / (2π d), a metà altezza' },
        { k: 'Le strisce', p: 2, v: strips.stuck ? 'chiuse' : state.mode === 'opp' ? 'si respingono' : 'si attraggono', s: `lunghe ${fmt.num(STRIPS.L * 100, 0)} cm, tese da ${fmt.num(STRIPS.T * 1000, 0)} mN` },
      ]);
    }
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000, fpsEma = 60, hudTimer = 0, supTimer = 1;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.05);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    if (!paused) {
      stepSeq(dt);
      if (isF()) swing.step(dt, Icur(), state.nMag, state.flip); else strips.step(dt, Ip(), state.mode);
    }
    if (pendingView) { setView(pendingView); pendingView = null; }
    const V3 = THREE.Vector3;
    if (isF()) {
      rig.setFaraday(swing.th, state.nMag, state.flip);
      // le frecce: la corrente lungo il filo, il campo fra i poli, la forza
      const zc = SWING.l * Math.sin(swing.th), yc = SWING.pivotY - SWING.l * Math.cos(swing.th), I = Icur();
      rig.setArrow(rig.arrows.I, state.vectors, new V3(-0.04 * Math.sign(I || 1), yc + 0.009, zc), new V3(0.08 * Math.sign(I), 0, 0));
      rig.setArrow(rig.arrows.B, state.vectors, new V3(0, ROD_Y + (state.flip ? -0.011 : 0.011), -0.035), new V3(0, state.flip ? 0.022 : -0.022, 0));
      rig.setArrow(rig.arrows.F, state.vectors, new V3(0, yc, zc), new V3(0, 0, swing.F * 0.9));
      for (const a of ['I2', 'F2', 'B2']) rig.arrows[a].visible = false;
    } else {
      rig.setStrips(strips.u);
      const d = strips.gap(), I1 = Ip(), f = (MU0 * I1 * I1) / (2 * Math.PI * d), sgn = state.mode === 'opp' ? 1 : -1, yi = STRIPS.top - 0.08;
      rig.setArrow(rig.arrows.I, state.vectors && I1 > 0.05, new V3(-d / 2 - 0.016, yi + 0.03, 0), new V3(0, -0.06, 0));
      rig.setArrow(rig.arrows.I2, state.vectors && I1 > 0.05, new V3(d / 2 + 0.016, state.mode === 'opp' ? yi - 0.03 : yi + 0.03, 0), new V3(0, state.mode === 'opp' ? 0.06 : -0.06, 0));
      const fl = Math.min(0.05, f * 3);
      rig.setArrow(rig.arrows.F, state.vectors && I1 > 0.05, new V3(-d / 2 - 0.002 * sgn, MID_Y + 0.02, 0.012), new V3(-sgn * fl, 0, 0));
      rig.setArrow(rig.arrows.F2, state.vectors && I1 > 0.05, new V3(d / 2 + 0.002 * sgn, MID_Y + 0.02, 0.012), new V3(sgn * fl, 0, 0));
      rig.arrows.B.visible = rig.arrows.B2.visible = false;
      if (state.lines && (Math.abs(d - sliceGap) > 0.0004 || sliceMode !== state.mode)) { sliceGap = d; sliceMode = state.mode; rig.setSlice(true, d, state.mode === 'same'); }
      if (!state.lines) rig.setSlice(false);
    }
    supTimer += dt;
    if (supTimer > 0.3) {
      supTimer = 0;
      if (isF()) rig.drawSupply({ V: Math.abs(Icur()) * 0.06, I: Math.abs(Icur()), on: state.on, Iset: state.I, Imax: 10 });
      else rig.drawSupply({ V: Isup() * (state.mode === 'opp' ? 0.05 : 0.025), I: Isup(), on: state.on, Iset: state.Ia, Imax: 40 });
      plotDirty = true;
    }
    stage.outlined = state.outline ? (isF() ? [rig.swing] : rig.strips) : [];
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud(); if (plotDirty) drawPlot(); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  setup();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, THREE, plotView, setView, swing, strips, records: () => records, seq: () => seq, swingForce };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
