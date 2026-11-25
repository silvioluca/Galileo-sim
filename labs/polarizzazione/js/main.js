// main.js — La polarizzazione della luce
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { cssRGB } from '../../../shared/js/color.js';
import { SOURCES, LAMBDAS, K1, bench, chain, ellipse, describe, apply, rotator, rotation, GLASSES, fresnel, brewsterAngle, DISK, diskStress, centerOrder, photoLUT } from './optics.js';
import { Rig, H, BX, HB, LASER_EXIT, ARM, FY, FZ } from './rig.js';
import { createUI, fmt } from './ui.js';

const D2R = Math.PI / 180;
const LAMP_LUX = 1500, LASER_MW = 1;                  // la lampada sullo schermo senza filtri; la potenza dei laser
const LCOL = { red: [1, 0.12, 0.06], green: [0.2, 1, 0.25] };
const AMP = 0.018;                                     // lunghezza della freccia del campo per la luce piena (m)
const LAMBDA_VIS = 0.08, FREQ_VIS = 0.5;               // l'onda disegnata: lunghezza (m) e frequenza (Hz) di comodo

const state = {
  exp: 'bench', src: 'lamp', useP: true, p1: 0, mid: 'none', m: 45, conc: 0.3, useA: true, an: 0,
  th: 45, bp: 90, glass: 'crown',
  load: 300, pa: 0, aa: 90, circ: false, light: 'white',
  efield: true, ambient: 0.6, outline: false, labels: true, quality: 'low', plotKind: 'malus',
};
const BASE = {
  exp: 'bench', src: 'lamp', useP: true, p1: 0, mid: 'none', m: 45, conc: 0.3, useA: true, an: 0,
  th: 45, bp: 90, glass: 'crown', load: 300, pa: 0, aa: 90, circ: false, light: 'white', efield: true, plotKind: 'malus',
};
const steps = (key, list, dur = 0.6, w = 1.2) => list.flatMap((v) => [{ sweep: { [key]: v, dur } }, { wait: w }, { note: true }]);
const ANG = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
const TH_B = Math.round(brewsterAngle(GLASSES.crown.n) * 10) / 10;
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const PRESETS = [
  ['malus', 'La legge di Malus', 'Parigi, 1809. Dopo il polarizzatore si gira l\'analizzatore un passo alla volta e si annota il fotometro: l\'intensità segue I = I₀ cos² θ, ed è nulla con gli assi incrociati', { exp: 'bench', src: 'lamp', plotKind: 'malus' }, [{ wait: 1.5 }, ...steps('an', ANG)], 'overview'],
  ['three', 'Tre polarizzatori', 'Con polarizzatore e analizzatore incrociati lo schermo è buio. Se fra i due se ne mette un terzo a 45° la luce torna: un quarto di quella che esce dal primo. Allineato con uno dei due, di nuovo buio', { exp: 'bench', src: 'lamp', an: 90, mid: 'none', m: 45 }, [{ wait: 3 }, { set: { mid: 'pol' } }, { wait: 3.5 }, { sweep: { m: 90, dur: 3 } }, { wait: 2.5 }, { sweep: { m: 45, dur: 2.5 } }, { wait: 2 }], 'overview'],
  ['laser', 'Il laser è già polarizzato', 'Niente polarizzatore: il laser va dritto all\'analizzatore, e girandolo la luce si spegne a 90°. I laser a diodo emettono luce polarizzata', { exp: 'bench', src: 'red', useP: false, plotKind: 'malus' }, [{ wait: 1.5 }, ...steps('an', ANG)], 'overview'],
  ['quarter', 'Luce circolare', 'Una lamina a quarto d\'onda con l\'asse a 45° dalla polarizzazione: il campo elettrico gira come una vite. Girando l\'analizzatore l\'intensità non cambia più', { exp: 'bench', src: 'red', mid: 'quarter', m: 45, an: 0, efield: true }, [{ wait: 3 }, { sweep: { an: 180, dur: 8 } }, { wait: 2 }], 'field'],
  ['half', 'La lamina a mezz\'onda', 'Una lamina a mezz\'onda ruota la polarizzazione del doppio del suo angolo: con l\'asse a 22,5° la luce esce a 45°, con l\'asse a 45° esce orizzontale e passa l\'analizzatore incrociato', { exp: 'bench', src: 'red', mid: 'half', m: 0, an: 90, efield: true }, [{ wait: 2 }, { sweep: { m: 22.5, dur: 2 } }, { wait: 3 }, { sweep: { m: 45, dur: 2 } }, { wait: 3 }], 'field'],
  ['sugar', 'Lo zucchero ruota la luce', 'Biot, 1815. Laser verde, polarizzatori incrociati: aggiunto lo zucchero la luce torna, perché la soluzione ruota il piano di polarizzazione. Si gira l\'analizzatore finché si rispegne: lì si legge la rotazione', { exp: 'bench', src: 'green', mid: 'sugar', conc: 0, an: 90 }, [{ wait: 1.5 }, { sweep: { conc: 0.3, dur: 3 } }, { wait: 2.5 }, { sweep: { an: 90 + rotation(0.3, 532), dur: 4 } }, { wait: 3 }], 'overview'],
  ['colors', 'I colori dello zucchero', 'Con la luce bianca ogni colore ruota di un angolo diverso, il violetto quasi il doppio del rosso: girando l\'analizzatore lo schermo cambia colore, e non si spegne mai del tutto', { exp: 'bench', src: 'lamp', mid: 'sugar', conc: 0.5, an: 90, plotKind: 'spectrum' }, [{ wait: 2 }, { sweep: { an: 180, dur: 10 } }, { wait: 1 }], 'overview'],
  ['brewster', 'L\'angolo di Brewster', 'Brewster, 1815. La luce polarizzata nel piano d\'incidenza (p) a un certo angolo non si riflette più: quello per cui tan θ = n. Si gira il piatto un passo alla volta e si legge il rivelatore', { exp: 'brewster', th: 20, bp: 90, plotKind: 'R' }, [{ wait: 1.5 }, { note: true }, ...steps('th', [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80], 0.8, 1.2)], 'overview'],
  ['sp', 'Le due polarizzazioni', 'All\'angolo di Brewster si gira il laser sul suo asse: con la polarizzazione s, perpendicolare al piano d\'incidenza, il riflesso torna. Per questo gli occhiali polarizzati tolgono i riflessi', { exp: 'brewster', th: TH_B, bp: 90, plotKind: 'R' }, [{ wait: 2.5 }, { sweep: { bp: 0, dur: 5 } }, { wait: 3 }], 'laser'],
  ['photo', 'Le frange di sforzo', 'Un disco di policarbonato fra polarizzatori incrociati: senza carico è buio. Stringendo la pressa compaiono le frange colorate, che si addensano verso i punti di contatto dove lo sforzo è più grande', { exp: 'photo', load: 0, plotKind: 'N' }, [{ wait: 1.5 }, ...steps('load', [100, 200, 300, 400, 500, 600], 1.2, 1.8)], 'front'],
  ['isocline', 'Isocline e polariscopio circolare', 'Le bande nere che si spostano girando insieme polarizzatore e analizzatore sono le isocline, dove gli sforzi principali sono paralleli ai polarizzatori. Con le lamine a quarto d\'onda spariscono, e restano solo le frange', { exp: 'photo', load: 350 }, [{ wait: 2.5 }, { sweep: { pa: 45, aa: 135, dur: 6 } }, { wait: 1.5 }, { sweep: { pa: 0, aa: 90, dur: 4 } }, { wait: 1 }, { set: { circ: true } }, { wait: 4 }], 'front'],
  ['sodium', 'Luce monocromatica', 'Con la luce gialla del sodio le frange sono nere e nette, e si contano: l\'ordine al centro cresce in proporzione al carico, N = 8P / (π D fσ)', { exp: 'photo', light: 'sodium', circ: true, load: 0, plotKind: 'N' }, [{ wait: 1.5 }, ...steps('load', [150, 300, 450, 600, 750], 1.2, 1.8)], 'front'],
];
const VIEWS = () => (state.exp === 'bench' ? [['overview', 'Panoramica'], ['field', 'Il campo elettrico'], ['axis', 'Verso la sorgente']]
  : state.exp === 'brewster' ? [['overview', 'Panoramica'], ['top', 'Dall\'alto'], ['laser', 'Il laser']]
    : [['overview', 'Panoramica'], ['front', 'Attraverso l\'analizzatore'], ['disk', 'Il disco da vicino']]);
const MID_NAME = { pol: 'Terzo polarizzatore', half: 'Lamina λ/2', quarter: 'Lamina λ/4', sugar: 'Tubo con lo zucchero' };
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const wrap90 = (a) => ((((a + 90) % 180) + 180) % 180) - 90;

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.1, 2.6, 1.7], keyTarget: [0, 0.1, 0], shadowBox: [-1.0, 1.0, 1.0, -1.0], shadowFar: 7, fog: [6, 45] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 6;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));
  let paused = false, seq = null, pendingView = null, records = [], plotDirty = true, simT = 0, A = null;
  let B = null, benchKey = '', brewKey = '', lutKey = '', LUT = null;
  const isB = () => state.exp === 'bench', isR = () => state.exp === 'brewster', isP = () => state.exp === 'photo';
  const benchCfg = () => ({ src: state.src, useP: state.useP, p1: state.p1, mid: state.mid, m: state.m, conc: state.conc, useA: state.useA, an: state.an });
  const lamp = () => state.src === 'lamp';
  const readingOf = (frac) => (lamp() ? LAMP_LUX : LASER_MW) * frac;
  const readingTxt = (frac) => (lamp() ? fmt.num(readingOf(frac), 0) : fmt.num(readingOf(frac), 3));
  const unit = () => (lamp() ? 'lux' : 'mW');
  const n = () => GLASSES[state.glass].n;
  const brew = () => {
    const F = fresnel(state.th, n()), b = state.bp * D2R, dop = SOURCES.red.dop;
    return { ...F, R: dop * (F.Rs * Math.cos(b) ** 2 + F.Rp * Math.sin(b) ** 2) + (1 - dop) * (F.Rs + F.Rp) / 2 };
  };
  const lamPhoto = () => (state.light === 'sodium' ? 589 : 550);
  const Ncenter = () => centerOrder(state.load) * (550 / lamPhoto());

  function setup() {
    rig.setExp(state.exp);
    A = rig.anchors(state.exp);
    benchKey = brewKey = '';
    plotDirty = true;
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { const was = state.exp; Object.assign(state, st.set); ui.refresh(); ui.sync(); if (was !== state.exp) setup(); }
      if (st.note) note();
      if (st.sweep) { seq.from = {}; for (const k of Object.keys(st.sweep)) if (k !== 'dur') seq.from[k] = state[k]; }
    }
    seq.t += dt;
    if (st.sweep) {
      const k = Math.min(1, seq.t / st.sweep.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      for (const key of Object.keys(seq.from)) { state[key] = seq.from[key] + (st.sweep[key] - seq.from[key]) * e; ui.refresh(key); }
      if (k >= 1) { seq.i++; seq.started = false; }
    } else if (seq.t >= (st.wait || 0.02)) { seq.i++; seq.started = false; }
    if (seq && seq.i >= seq.list.length) seq = null;
  }
  function note() {
    if (isB()) {
      if (!B) return;
      const psi = ellipse(B.states[2]).psi;
      records.push({ exp: 'bench', src: state.src, an: state.an, c2: Math.cos((state.an - psi) * D2R) ** 2, y: readingOf(B.reading) });
    } else if (isR()) records.push({ exp: 'brewster', glass: state.glass, th: state.th, R: brew().R * 100 });
    else records.push({ exp: 'photo', light: state.light, P: state.load, N: Ncenter() });
    plotDirty = true;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    text: {
      conc: () => `${fmt.num(state.conc, 2)} g/mL <small>· ruota di ${fmt.num(rotation(state.conc, 589), 1)}° a 589 nm</small>`,
      load: () => `${fmt.num(state.load, 0)} N`,
      aa: () => { const d = Math.abs(wrap90(state.aa - state.pa)); return `${fmt.num(state.aa, state.aa % 1 ? 1 : 0)}° <small>${d > 89.5 ? '· incrociato' : d < 0.5 ? '· parallelo' : ''}</small>`; },
    },
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, { ambient: state.ambient }, p[3]);
        records = []; paused = false;
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
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'exp': seq = null; ui.sync(); setup(); setView('overview'); break;
      case 'mid': case 'src': case 'useP': case 'useA': seq = null; ui.refresh(); ui.sync(); plotDirty = true; break;
      default: seq = null; ui.refresh(); plotDirty = true; break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const vDet = new THREE.Vector3();
  tags.add('Lampada con il condensatore', '', (o) => o.copy(A.src), () => isB() && lamp());
  tags.add('Laser', '', (o) => o.copy(A.src), () => isB() && !lamp());
  tags.add('Polarizzatore', '', (o) => o.copy(A.P), () => isB() && state.useP);
  const tMid = tags.add('', '', (o) => o.copy(A.mid).setY(state.mid === 'sugar' ? H + 0.035 : A.mid.y), () => isB() && state.mid !== 'none');
  tags.add('Analizzatore', '', (o) => o.copy(A.A), () => isB() && state.useA);
  tags.add('Schermo con il fotodiodo', '', (o) => o.copy(A.scr), isB);
  tags.add('Fotometro', 'floor', (o) => o.copy(A.meter), () => !isP());
  tags.add('Laser', '', (o) => o.copy(A.laser), isR);
  tags.add('Lastra di vetro', '', (o) => o.copy(A.glass), isR);
  tags.add('Piatto graduato', 'floor alt', (o) => o.copy(A.table), isR);
  tags.add('Rivelatore', '', (o) => o.copy(vDet), isR);
  tags.add('Scatola luminosa', '', (o) => o.copy(A.box), isP);
  tags.add('Polarizzatore', '', (o) => o.copy(A.P), isP);
  tags.add('Analizzatore', '', (o) => o.copy(A.A), isP);
  tags.add('Pressa con il disco', '', (o) => o.copy(A.press), isP);
  tags.add('Carico', 'floor', (o) => o.copy(A.meter), isP);

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
    if (isB()) {
      if (id === 'field') return fitPose(V(0.18, 0.3, 1).normalize(), box(-0.29, H - 0.05, -0.04, 0.27, H + 0.05, 0.04));
      if (id === 'axis') return { pos: [0.62, H + 0.075, 0.17], target: [0.0, H - 0.01, -0.01] };
      return fitPose(V(0.12, 0.42, 1).normalize(), box(-0.56, 0, -0.06, 0.56, H + 0.08, 0.26));
    }
    if (isR()) {
      if (id === 'top') return fitPose(V(0.0001, 1, 0.2).normalize(), box(-0.5, 0, -0.16, 0.34, HB, 0.36));
      if (id === 'laser') return fitPose(V(-0.45, 0.4, 1).normalize(), box(-0.52, HB - 0.06, -0.04, 0.1, HB + 0.03, 0.14));
      return fitPose(V(0.15, 0.7, 1).normalize(), box(-0.52, 0, -0.16, 0.42, HB + 0.05, 0.36));
    }
    if (id === 'front') return fitPose(V(0.0001, 0.05, 1).normalize(), box(-0.075, FY - 0.075, FZ.A, 0.075, FY + 0.075, FZ.A));
    if (id === 'disk') return fitPose(V(0.0001, 0.03, 1).normalize(), box(-0.036, FY - 0.036, FZ.A, 0.036, FY + 0.036, FZ.A));
    return fitPose(V(0.8, 0.45, 1).normalize(), box(-0.2, 0, -0.17, 0.27, 0.42, 0.15));
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
      if (isB()) { state.an = Math.max(0, Math.min(180, Math.round((state.an + d * (e.shiftKey ? 0.5 : 5)) * 2) / 2)); ui.refresh('an'); }
      else if (isR()) { state.th = Math.max(10, Math.min(85, Math.round((state.th + d * (e.shiftKey ? 0.1 : 1)) * 10) / 10)); ui.refresh('th'); }
      else { state.load = Math.max(0, Math.min(800, state.load + d * (e.shiftKey ? 1 : 10))); ui.refresh('load'); }
      plotDirty = true;
    } else if (k >= '1' && k <= '3') setView(VIEWS()[Number(k) - 1][0]);
  });

  // ───────────────────────── il banco: fasci e campo ─────────────────────────
  const vx = (x) => V(x, H, 0);
  function benchBeams(cfg) {
    const lp = cfg.src === 'lamp', x0 = lp ? BX.exitLamp : BX.exitLaser, x1 = BX.scr - 0.0046;
    const col = (k) => (lp ? B.color[k].map((v) => v * 1.15) : LCOL[cfg.src].map((v) => v * B.I[k] * 2.6));
    const pieces = []; let x = x0;
    const cut = (xe, k) => { pieces.push([x, xe, k]); x = xe; };
    cut(BX.P, 0);
    if (cfg.mid === 'sugar') { cut(-BX.tube, 1); cut(BX.tube, 1); } else cut(BX.mid, 1);
    cut(BX.A, 2); cut(x1, 3);
    const segs = pieces.map(([a, b, k]) => ({ a: vx(a), b: vx(b), c0: col(k), c1: col(k) }));
    const spots = [];
    const I3 = Math.min(1, B.I[3]);
    if (!lp) spots.push({ p: vx(x1 - 0.004), c: col(3).map((v) => v * 0.5), size: 0.014 * (0.6 + 0.4 * Math.sqrt(I3)) });
    rig.setScreenSpot(lp ? B.color[3] : LCOL[cfg.src].map((v) => v * B.I[3]), lp ? 0.034 : 0.011);
    if (cfg.useP) spots.push({ p: vx(BX.P - 0.003), c: col(0).map((v) => v * 0.16), size: lp ? 0.04 : 0.01 });
    if (cfg.mid !== 'none' && cfg.mid !== 'sugar') spots.push({ p: vx(BX.mid - 0.003), c: col(1).map((v) => v * 0.16), size: lp ? 0.04 : 0.01 });
    if (cfg.useA) spots.push({ p: vx(BX.A - 0.003), c: col(2).map((v) => v * 0.16), size: lp ? 0.04 : 0.01 });
    rig.setBeams(segs, spots.filter((s) => Math.max(...s.c) > 0.004), lp);
  }
  /** Il campo elettrico in un punto: la parte polarizzata segue l'ellisse, quella non polarizzata cambia direzione a caso. */
  function efield(S, ph, i, t, out) {
    const e = ellipse(S), aP = AMP * Math.sqrt(Math.max(0, S[0] * e.dop)), aU = AMP * Math.sqrt(Math.max(0, S[0] * (1 - e.dop)));
    const ps = e.psi * D2R, ch = e.chi * D2R;
    const cu = aP * Math.cos(ch) * Math.cos(ph), cv = -aP * Math.sin(ch) * Math.sin(ph);
    let E1 = cu * Math.cos(ps) - cv * Math.sin(ps), E2 = cu * Math.sin(ps) + cv * Math.cos(ps);
    if (aU > 1e-4) {
      const b = Math.floor(t / 0.12), ra = rnd(i * 7.3 + b) * Math.PI, rp = rnd(i * 3.1 + b * 1.7 + 0.5) * Math.PI * 2;
      const c = aU * Math.cos(ph + rp);
      E1 += c * Math.cos(ra); E2 += c * Math.sin(ra);
    }
    return out.set(0, E1, -E2);       // e1 in alto, e2 alla destra di chi guarda verso la sorgente (−z)
  }
  function benchField(t) {
    const cfg = benchCfg(), lp = cfg.src === 'lamp', l0 = B.lambda, st = B.states;
    const x0 = (lp ? BX.exitLamp : BX.exitLaser) + 0.004, x1 = BX.scr - 0.008, kx = (2 * Math.PI) / LAMBDA_VIS, w = 2 * Math.PI * FREQ_VIS;
    const groups = [[]]; let seg = -1, i = 0;
    const rot = cfg.mid === 'sugar' ? rotation(cfg.conc, l0) : 0;
    for (let x = x0; x < x1; x += 0.012, i++) {
      let S, s;
      if (x < BX.P) { S = st[0]; s = 0; }
      else if (cfg.mid === 'sugar' && x >= -BX.tube && x < BX.tube) { S = apply(rotator(rot * ((x + BX.tube) / (2 * BX.tube))), st[1]); s = 1; }
      else if (x < (cfg.mid === 'sugar' ? BX.tube : BX.mid)) { S = st[1]; s = 1; }
      else if (x < BX.A) { S = st[2]; s = 2; }
      else { S = st[3]; s = 3; }
      if (s !== seg && groups[groups.length - 1].length) groups.push([]);
      seg = s;
      groups[groups.length - 1].push({ p: vx(x), e: efield(S, w * t - kx * x, i, t, new THREE.Vector3()) });
    }
    rig.setField(groups, true);
  }

  // ───────────────────────── Brewster: fasci e campo ─────────────────────────
  function brewParts() {
    const th = state.th * D2R, F = brew(), tt = F.tt * D2R;
    const o = V(0, HB, 0), r = V(-Math.cos(2 * th), 0, Math.sin(2 * th));
    const t = V(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(Math.cos(tt)).add(V(Math.sin(th), 0, Math.cos(th)).multiplyScalar(Math.sin(tt)));
    const e = o.clone().addScaledVector(t, 0.025 / Math.cos(tt));
    return { th, F, o, r, t, e };
  }
  function brewBeams() {
    const { F, o, r, e } = brewParts(), c = LCOL.red, k = (I) => c.map((v) => v * I * 2.6);
    const vis = Math.min(1, Math.sqrt(F.R) * 2.5);
    const end = o.clone().addScaledVector(r, ARM + 0.001);
    const segs = [
      { a: V(LASER_EXIT, HB, 0), b: o, c0: k(1), c1: k(1) },
      { a: o, b: end, c0: k(vis), c1: k(vis) },
      { a: o, b: e, c0: k(1 - F.R), c1: k(1 - F.R) },
      { a: e, b: V(0.36, HB, e.z), c0: k((1 - F.R) ** 2), c1: k((1 - F.R) ** 2) },
    ];
    const spots = [{ p: o.clone().addScaledVector(r, ARM - 0.001), c: k(vis * 0.6), size: 0.016 }, { p: o.clone().add(V(-0.002, 0, 0)), c: k(0.18), size: 0.012 }];
    rig.setBeams(segs, spots.filter((s) => Math.max(...s.c) > 0.004), false);
    vDet.copy(o).addScaledVector(r, ARM + 0.012).setY(HB + 0.045);
  }
  function brewField(t) {
    const { F, o, r } = brewParts(), b = state.bp * D2R, s = Math.cos(b), p = Math.sin(b);
    const kx = (2 * Math.PI) / LAMBDA_VIS, w = 2 * Math.PI * FREQ_VIS, inc = [], ref = [];
    for (let x = LASER_EXIT + 0.006; x < -0.004; x += 0.012) { const c = AMP * Math.cos(w * t - kx * (x - LASER_EXIT)); inc.push({ p: V(x, HB, 0), e: V(0, s * c, -p * c) }); }
    for (let u = 0.008; u < ARM - 0.008; u += 0.012) {
      const c = AMP * Math.cos(w * t - kx * (u - LASER_EXIT)), es = F.rs * s * c, ep = F.rp * p * c;
      ref.push({ p: o.clone().addScaledVector(r, u), e: V(ep * r.z, es, -ep * r.x) });
    }
    rig.setField([inc, ref], true);
  }

  // ───────────────────────── grafici ─────────────────────────
  const malusCache = new Map();
  function malusCurve() {
    const cfg = benchCfg(); delete cfg.an;
    const key = JSON.stringify(cfg);
    if (malusCache.has(key)) return malusCache.get(key);
    const psi = ellipse(bench({ ...cfg, an: 0 }).states[2]).psi, xs = [], ys = [], c2 = [];
    for (let a = 0; a <= 180; a += 2) { const r = bench({ ...cfg, an: a }); xs.push(a); ys.push(readingOf(r.reading)); c2.push(Math.cos((a - psi) * D2R) ** 2); }
    const out = { xs, ys, c2 };
    if (malusCache.size > 40) malusCache.clear();
    malusCache.set(key, out);
    return out;
  }
  function drawPlot() {
    plotDirty = false;
    const ring = (x, y) => ({ x, y, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' });
    if (isB()) {
      if (!B) return;
      const cur = readingOf(B.reading), recs = records.filter((r) => r.exp === 'bench' && r.src === state.src);
      if (state.plotKind === 'spectrum') {
        const cfg = benchCfg(), ys = LAMBDAS.map((l) => chain(cfg, l)[3][0] * 100), lc = lamp() ? '#2a2f36' : '#9aa1ab';
        const pts = lamp() ? [] : [ring(SOURCES[state.src].lambda, B.reading * 100)];
        ui.drawPlot({ series: [{ x: LAMBDAS, y: ys, color: lc, width: 2.6, dash: lamp() ? [] : [7, 6] }], points: pts, X0: 400, X1: 700, Y0: 0, Y1: 50, xLabel: 'lunghezza d\'onda (nm)', yLabel: 'luce che arriva allo schermo (%)', spectrum: true, legend: lamp() ? [['lampada', '#2a2f36']] : [['il laser', '#15181c'], ['con la luce bianca', '#9aa1ab']] });
        return;
      }
      const C = malusCurve(), Y1 = Math.max(lamp() ? 100 : 0.1, ...C.ys, ...recs.map((r) => r.y)) * 1.12;
      if (state.plotKind === 'cos2') {
        ui.drawPlot({
          series: [{ x: C.c2, y: C.ys, color: '#9aa1ab', width: 2, dash: [7, 6] }],
          points: recs.map((r) => ({ x: r.c2, y: r.y, color: '#e8452c', r: 6 })).concat([ring(Math.cos((state.an - ellipse(B.states[2]).psi) * D2R) ** 2, cur)]),
          X0: 0, X1: 1, Y0: 0, Y1, xLabel: 'cos² θ', yLabel: `fotometro (${unit()})`, legend: [['annotati', '#e8452c'], ['in teoria', '#9aa1ab']],
        });
        return;
      }
      ui.drawPlot({
        series: [{ x: C.xs, y: C.ys, color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: recs.map((r) => ({ x: r.an, y: r.y, color: '#e8452c', r: 6 })).concat([ring(state.an, cur)]),
        X0: 0, X1: 180, Y0: 0, Y1, xLabel: 'asse dell\'analizzatore (°)', yLabel: `fotometro (${unit()})`, legend: [['annotati', '#e8452c'], ['in teoria', '#9aa1ab']],
      });
      return;
    }
    if (isR()) {
      const nn = n(), xs = [], rs = [], rp = [], mx = [], dp = [], b = state.bp * D2R, dop = SOURCES.red.dop;
      for (let a = 0; a <= 89.5; a += 0.5) { const F = fresnel(a, nn); xs.push(a); rs.push(F.Rs * 100); rp.push(F.Rp * 100); mx.push((dop * (F.Rs * Math.cos(b) ** 2 + F.Rp * Math.sin(b) ** 2) + (1 - dop) * (F.Rs + F.Rp) / 2) * 100); dp.push(((F.Rs - F.Rp) / (F.Rs + F.Rp)) * 100); }
      const thB = brewsterAngle(nn), F = brew();
      if (state.plotKind === 'dop') {
        ui.drawPlot({ series: [{ x: xs, y: dp, color: '#2c67dc', width: 2.6 }], vlines: [{ x: thB, color: 'rgba(210,64,42,0.6)' }], points: [ring(state.th, ((F.Rs - F.Rp) / (F.Rs + F.Rp)) * 100)], X0: 0, X1: 90, Y0: 0, Y1: 105, xLabel: 'angolo d\'incidenza (°)', yLabel: 'riflesso polarizzato (%), con luce comune', legend: [[`θB = ${fmt.num(thB, 1)}°`, '#d2402a']] });
        return;
      }
      const recs = records.filter((r) => r.exp === 'brewster' && r.glass === state.glass);
      const Y1 = Math.min(100, Math.max(25, F.R * 100 * 1.3, ...recs.map((r) => r.R * 1.15)));
      ui.drawPlot({
        series: [{ x: xs, y: rs, color: '#2a2f36', width: 1.6 }, { x: xs, y: rp, color: '#2c67dc', width: 1.6 }, { x: xs, y: mx, color: '#9aa1ab', width: 2, dash: [7, 6] }],
        vlines: [{ x: thB, color: 'rgba(210,64,42,0.6)' }],
        points: recs.map((r) => ({ x: r.th, y: r.R, color: '#e8452c', r: 6 })).concat([ring(state.th, F.R * 100)]),
        X0: 0, X1: 90, Y0: 0, Y1, xLabel: 'angolo d\'incidenza (°)', yLabel: 'luce riflessa (%)', legend: [['Rs', '#2a2f36'], ['Rp', '#2c67dc'], ['il laser', '#9aa1ab'], ['annotati', '#e8452c']],
      });
      return;
    }
    const scale = 550 / lamPhoto();
    if (state.plotKind === 'profile') {
      const xs = [], yh = [], yv = [], k = (state.load * DISK.t) / DISK.fs * scale;
      for (let i = -59; i <= 59; i++) { const u = (i / 60) * DISK.R; xs.push(u * 1000); yh.push(diskStress(u, 0).ds * k); yv.push(diskStress(0, u).ds * k); }
      const Y1 = Math.max(2, Ncenter() * 3.2);
      ui.drawPlot({ series: [{ x: xs, y: yh, color: '#2c67dc', width: 2.6 }, { x: xs, y: yv, color: '#e8452c', width: 2.2, dash: [7, 6] }], points: [], X0: -30, X1: 30, Y0: 0, Y1, xLabel: 'posizione dal centro (mm)', yLabel: 'ordine di frangia N', legend: [['orizzontale', '#2c67dc'], ['verticale, verso i contatti', '#e8452c']] });
      return;
    }
    const recs = records.filter((r) => r.exp === 'photo' && r.light === state.light);
    ui.drawPlot({
      series: [{ x: [0, 800], y: [0, centerOrder(800) * scale], color: '#9aa1ab', width: 2, dash: [7, 6] }],
      points: recs.map((r) => ({ x: r.P, y: r.N, color: '#e8452c', r: 6 })).concat([ring(state.load, Ncenter())]),
      X0: 0, X1: 820, Y0: 0, Y1: centerOrder(800) * scale * 1.1, xLabel: 'carico P (N)', yLabel: 'ordine di frangia al centro', legend: [['annotati', '#e8452c'], ['8P / (π D fσ)', '#9aa1ab']],
    });
  }

  // ───────────────────────── misure ─────────────────────────
  function split(desc) {
    if (desc.startsWith('non polarizzata')) return ['non polarizzata', desc.slice(16)];
    const i = desc.indexOf(' '); return i < 0 ? [desc, ''] : [desc.slice(0, i), desc.slice(i + 1)];
  }
  function hud() {
    ui.setPause(paused ? 'Riprendi' : 'Pausa');
    const busy = !paused && !!seq;
    if (isB()) {
      if (!B) return;
      const cfg = benchCfg(), I = B.I, frac = B.reading, e2 = ellipse(B.states[2]);
      const col = lamp() ? cssRGB(B.color[3].map((v, i, a) => v / Math.max(1e-6, ...a))) : cssRGB(LCOL[state.src]);
      ui.setStatus(paused ? 'in pausa' : seq ? 'esperimento' : frac < 0.002 ? 'schermo buio' : 'luce sullo schermo', busy);
      ui.setClock(`${readingTxt(frac)} <small>${unit()}</small>`);
      const [kind, rest] = split(describe(B.states[3]));
      ui.setSide(`${fmt.num(frac * 100, frac < 0.1 ? 2 : 1)} % della sorgente`, `${kind} ${rest}`);
      // lo schema: la polarizzazione dopo ogni elemento
      const st = [{ name: lamp() ? 'la lampada' : 'il laser', S: B.states[0], I: I[0] }];
      if (cfg.useP) st.push({ name: 'polarizzatore', S: B.states[1], I: I[1], axis: cfg.p1, axisKind: 'pol' });
      if (cfg.mid !== 'none') st.push({ name: { pol: 'terzo polaroid', half: 'lamina λ/2', quarter: 'lamina λ/4', sugar: 'zucchero' }[cfg.mid], S: B.states[2], I: I[2], axis: cfg.mid === 'sugar' ? null : cfg.m, axisKind: cfg.mid === 'pol' ? 'pol' : 'fast', rot: cfg.mid === 'sugar' ? rotation(cfg.conc, B.lambda) : 0, rot0: ellipse(B.states[1]).psi });
      if (cfg.useA) st.push({ name: 'analizzatore', S: B.states[3], I: I[3], axis: cfg.an, axisKind: 'pol' });
      ui.drawBench({
        stages: st.map((s) => { const e = ellipse(s.S), [k, r] = split(describe(s.S)); return { ...s, dop: e.dop, psi: e.psi, chi: e.chi, kind: k, detail: r }; }),
        ph: 2 * Math.PI * FREQ_VIS * simT, col: lamp() ? '#2a2f36' : col,
      });
      tags.setText(tMid, MID_NAME[cfg.mid] || '');
      const linear = e2.dop > 0.9 && Math.abs(e2.chi) < 4, th = wrap90(cfg.an - e2.psi), Imax = I[2] * K1;
      const midS = cfg.mid === 'none' ? ['niente', 'fra polarizzatore e analizzatore'] : cfg.mid === 'pol' ? [`a ${fmt.num(cfg.m, 1)}°`, 'un terzo polarizzatore']
        : cfg.mid === 'half' ? [`λ/2 a ${fmt.num(cfg.m, 1)}°`, `per il rosso ruota la polarizzazione di ${fmt.num(2 * wrap90(cfg.m - ellipse(B.states[1]).psi), 1)}°`]
          : cfg.mid === 'quarter' ? [`λ/4 a ${fmt.num(cfg.m, 1)}°`, 'per il rosso: a 45° dalla polarizzazione la rende circolare']
            : [`${fmt.num(cfg.conc, 2)} g/mL`, `20 cm di saccarosio: ${fmt.num(rotation(cfg.conc, B.lambda), 1)}° a ${B.lambda} nm`];
      ui.setMetrics([
        { k: 'Fotometro', v: `${readingTxt(frac)} <small>${unit()}</small>`, s: `sullo schermo · ${fmt.num(frac * 100, frac < 0.1 ? 2 : 1)} % della sorgente` },
        { k: 'I / Imax', v: cfg.useA && I[2] > 1e-3 ? fmt.num(I[3] / Imax, 3) : '—', s: !cfg.useA ? 'senza analizzatore' : I[2] <= 1e-3 ? 'quasi nessuna luce prima dell\'analizzatore' : linear ? `cos² θ = ${fmt.num(Math.cos(th * D2R) ** 2, 3)}` : 'la luce non è lineare: cos² θ non basta' },
        { k: 'Angolo θ', v: cfg.useA && linear ? `${fmt.num(Math.abs(th), 1)}°` : '—', s: 'fra la polarizzazione e l\'analizzatore' },
        { k: 'Prima dell\'analizzatore', v: split(describe(B.states[2]))[0], s: `${split(describe(B.states[2]))[1] || '&nbsp;'}${lamp() ? ' · a 550 nm' : ''}` },
        { k: 'Al centro del banco', p: 2, v: midS[0], s: midS[1] },
      ]);
      rig.drawMeter(rig.meterBench, readingTxt(frac), unit());
      return;
    }
    if (isR()) {
      const F = brew(), thB = brewsterAngle(n()), uw = F.R * LASER_MW * 1000;
      ui.setStatus(paused ? 'in pausa' : seq ? 'esperimento' : F.R < 0.0005 ? 'nessun riflesso' : 'riflesso', busy);
      ui.setClock(`${fmt.num(F.R * 100, F.R < 0.01 ? 2 : 1)} <small>% riflessa</small>`);
      ui.setSide(`θ = ${fmt.num(state.th, 1)}°`, `θB = ${fmt.num(thB, 1)}°`);
      ui.drawBrewster({ th: state.th, tt: F.tt, n: n(), R: F.R, Rs: F.Rs, Rp: F.Rp, rs: F.rs, rp: F.rp, bp: state.bp, thB });
      ui.setMetrics([
        { k: 'Incidenza', v: `${fmt.num(state.th, 1)}°`, s: 'sul piatto graduato' },
        { k: 'Rifrazione', v: `${fmt.num(F.tt, 1)}°`, s: `sen θ = n sen θt, con n = ${fmt.num(n(), 2)}` },
        { k: 'Riflessa', v: `${fmt.num(F.R * 100, F.R < 0.01 ? 2 : 1)} <small>%</small>`, s: `${fmt.num(uw, 1)} µW sul rivelatore` },
        { k: 'Rs · Rp', v: `${fmt.num(F.Rs * 100, 1)} · ${fmt.num(F.Rp * 100, F.Rp < 0.01 ? 2 : 1)} <small>%</small>`, s: 's, verticale · p, nel piano d\'incidenza' },
        { k: 'Angolo di Brewster', p: 2, v: `${fmt.num(thB, 1)}°`, s: `tan θB = n: riflesso e rifratto a 90° (ora ${fmt.num(state.th + F.tt, 1)}°)` },
      ]);
      rig.drawMeter(rig.meterBrew, fmt.num(uw, 1), 'µW', 'RIVELATORE');
      return;
    }
    const N = Ncenter(), ds = (8 * state.load) / (Math.PI * 2 * DISK.R * DISK.t) / 1e6, sod = state.light === 'sodium';
    const crossed = Math.abs(wrap90(state.aa - state.pa)) > 89.5, parallel = Math.abs(wrap90(state.aa - state.pa)) < 0.5;
    ui.setStatus(paused ? 'in pausa' : seq ? 'esperimento' : state.load < 1 ? 'senza carico' : 'sotto carico', busy);
    ui.setClock(`N = ${fmt.num(N, 2)}`);
    ui.setSide(`${fmt.num(state.load, 0)} N`, `σ1 − σ2 = ${fmt.num(ds, 2)} MPa`);
    if (LUT) {
      const j = state.circ ? 0 : Math.floor(((((state.pa + 45) % 180) + 180) % 180) / 180 * LUT.nPhi) % LUT.nPhi;
      ui.drawPhoto({ strip: LUT.data.subarray(j * LUT.nN * 4, (j + 1) * LUT.nN * 4), nStrip: LUT.nN, maxN: LUT.maxN / (550 / lamPhoto()), N, P: state.load, ds, circ: state.circ, sodium: sod });
    }
    ui.setMetrics([
      { k: 'Carico', v: `${fmt.num(state.load, 0)} <small>N</small>`, s: 'sulla cella di carico della pressa' },
      { k: 'Ordine al centro', v: fmt.num(N, 2), s: `N = 8P / (π D fσ), a ${lamPhoto()} nm` },
      { k: 'σ1 − σ2 al centro', v: `${fmt.num(ds, 2)} <small>MPa</small>`, s: `8P / (π D t), D = ${fmt.num(DISK.R * 200, 0)} cm, t = ${fmt.num(DISK.t * 1000, 0)} mm` },
      { k: 'Polariscopio', v: state.circ ? 'circolare' : 'piano', s: `${crossed ? 'incrociato: fondo scuro' : parallel ? 'parallelo: fondo chiaro' : 'analizzatore girato'}${state.circ ? '' : ' · con le isocline'}` },
      { k: 'Luce', p: 2, v: sod ? 'sodio' : 'bianca', s: `fσ = ${fmt.num((DISK.fs * (lamPhoto() / 550)) / 1000, 2)} kN/m per il policarbonato` },
    ]);
    rig.drawMeter(rig.loadMeter, fmt.num(state.load, 0), 'N', 'CARICO');
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000, fpsEma = 60, hudTimer = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.05);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    if (!paused) { stepSeq(dt); simT += dt; }
    if (pendingView) { setView(pendingView); pendingView = null; }
    if (isB()) {
      const cfg = benchCfg(), key = JSON.stringify(cfg);
      if (key !== benchKey) { benchKey = key; B = bench(cfg); rig.setBench(cfg); benchBeams(cfg); plotDirty = true; }
      if (state.efield) benchField(simT); else rig.setField([], false);
    } else if (isR()) {
      const key = [state.th, state.bp, state.glass].join();
      if (key !== brewKey) { brewKey = key; rig.setBrewster(state.th, state.bp); brewBeams(); plotDirty = true; }
      if (state.efield) brewField(simT); else rig.setField([], false);
    } else {
      const pa = Math.round(state.pa * 2) / 2, aa = Math.round(state.aa * 2) / 2, key = [pa, aa, state.circ, state.light].join();
      if (key !== lutKey) { lutKey = key; LUT = photoLUT({ pa, aa, circ: state.circ, light: state.light }, 1024, 48); rig.setPhotoLUT(LUT); plotDirty = true; }
      rig.setPhoto({ pa: state.pa, aa: state.aa, load: state.load });
      rig.setBeams([], [], false); rig.setField([], false);
    }
    const ol = isB() ? [state.useP ? rig.P.rot : null, state.useA ? rig.A.rot : null, rig.mids[state.mid]?.rot || (state.mid === 'sugar' ? rig.mids.sugar.g : null)]
      : isR() ? [rig.table, rig.arm, rig.bLaser] : [rig.fP.rot, rig.fA.rot, rig.wheel];
    stage.outlined = state.outline ? ol.filter(Boolean) : [];
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
  setup();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  { const cfg = benchCfg(); B = bench(cfg); }
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, THREE, plotView, setView, records: () => records, seq: () => seq, bench: () => B, frame: () => simT };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
