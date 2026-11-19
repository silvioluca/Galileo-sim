// main.js — Interferenza e diffrazione
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { Bench, AXIS_H } from './bench.js';
import { PatternField, LightSheet } from './pattern.js';
import { solveScreen, buildSheet } from './solver.js';
import { displayRGB, effectiveScale, transmittedFraction, beamAt, isLinear } from './wave.js';
import { createUI, fmt, niceStep } from './ui.js';

const state = {
  source: 'laser', lambda: 633, beam: 3.0,
  element: 'slits', count: 2, obstacle: 'disc',
  slitA: 40, slitD: 250, holeA: 100, holeD: 400, wireA: 100, discA: 2000, lines: 100,
  xMask: 0.3, lensOn: false, focal: 200, xLens: 0.15, xScreen: 1.3,
  ev: 0, ambient: 0.6, sheet: true, labels: true, quality: 'low',
  zoomAuto: true, zoomIndex: 10, plotLog: false,
};

const PRESETS = [
  ['young', 'Young', 'Doppia fenditura: le frange d\'interferenza', { source: 'laser', lambda: 633, beam: 3, element: 'slits', count: 2, slitA: 40, slitD: 250, xMask: 0.3, lensOn: false, xScreen: 1.3 }],
  ['single', 'Fenditura singola', 'Un massimo centrale largo il doppio degli altri', { source: 'laser', lambda: 633, beam: 3, element: 'slits', count: 1, slitA: 60, xMask: 0.3, lensOn: false, xScreen: 1.3 }],
  ['grating', 'Reticolo e spettro', 'La luce bianca si apre nei suoi colori', { source: 'white', beam: 3, element: 'grating', lines: 100, xMask: 0.3, lensOn: false, xScreen: 0.9 }],
  ['airy', 'Disco di Airy', 'Un foro circolare: anelli concentrici', { source: 'laser', lambda: 532, beam: 2, element: 'holes', count: 1, holeA: 100, xMask: 0.3, lensOn: false, xScreen: 1.3 }],
  ['arago', 'Macchia di Arago', 'Un punto luminoso al centro dell\'ombra di un disco', { source: 'laser', lambda: 633, beam: 6, element: 'obstacle', obstacle: 'disc', discA: 2000, xMask: 0.3, lensOn: false, xScreen: 1.3 }],
  ['hair', 'Capello', 'Babinet: un filo diffrange come una fenditura', { source: 'laser', lambda: 633, beam: 2, element: 'obstacle', obstacle: 'wire', wireA: 80, xMask: 0.3, lensOn: false, xScreen: 1.3 }],
  ['fourier', 'Lente di Fourier', 'Sul piano focale di una lente c\'è già il campo lontano', { source: 'laser', lambda: 633, beam: 2, element: 'slits', count: 2, slitA: 60, slitD: 300, xMask: 0.3, lensOn: true, focal: 300, xLens: 0.45, xScreen: 0.75 }],
];
const VIEWS = [['overview', 'Panoramica'], ['screen', 'Schermo'], ['element', 'Elemento'], ['top', 'Dall\'alto'], ['source', 'Dalla sorgente']];
const QUALITY = { low: { lam: 20, radial: 512 }, medium: { lam: 32, radial: 1024 }, high: { lam: 48, radial: 2048 } };
const ZOOMS = [0.0005, 0.001, 0.0015, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.15];
const TARGET = 1.6;                 // luminanza di riferimento della figura con esposizione automatica
const MIN_GAP = 0.05;               // distanza minima fra due cavalieri (m)

const cssColor = (nm) => { const c = displayRGB(nm).map((v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))); return `rgb(${c[0]},${c[1]},${c[2]})`; };

function elementOf(s) {
  switch (s.element) {
    case 'slits': return { kind: 'slits', n: s.count, a: s.slitA * 1e-6, d: Math.max(s.slitD, s.slitA * 1.2) * 1e-6 };
    case 'holes': return { kind: 'holes', n: s.count, a: s.holeA * 1e-6, d: Math.max(s.holeD, s.holeA * 1.2) * 1e-6 };
    case 'obstacle': return s.obstacle === 'wire' ? { kind: 'wire', a: s.wireA * 1e-6 } : { kind: 'disc', a: s.discA * 1e-6 };
    case 'grating': return { kind: 'grating', lines: s.lines };
    default: return { kind: 'none' };
  }
}
const config = () => ({
  source: { kind: state.source, lambda: state.lambda * 1e-9, w0: state.beam * 0.5e-3 },
  lens: { on: state.lensOn, f: state.focal * 1e-3, x: state.xLens },
  element: elementOf(state), xMask: state.xMask, xScreen: state.xScreen,
});
function elementName(el) {
  if (el.kind === 'slits') return ['Fenditura singola', 'Doppia fenditura', 'Tripla fenditura'][el.n - 1];
  if (el.kind === 'holes') return ['Foro circolare', 'Due fori', 'Tre fori'][el.n - 1];
  if (el.kind === 'wire') return 'Filo';
  if (el.kind === 'disc') return 'Disco opaco';
  if (el.kind === 'grating') return `Reticolo ${el.lines}/mm`;
  return 'Nessun elemento';
}
function slideLabel(el) {
  if (el.kind === 'slits') return el.n > 1 ? `${el.n} fenditure · a ${fmt.len(el.a)} · d ${fmt.len(el.d)}` : `fenditura · a ${fmt.len(el.a)}`;
  if (el.kind === 'holes') return el.n > 1 ? `${el.n} fori · D ${fmt.len(el.a)} · d ${fmt.len(el.d)}` : `foro · D ${fmt.len(el.a)}`;
  if (el.kind === 'wire') return `filo · ${fmt.len(el.a)}`;
  if (el.kind === 'disc') return `disco · ${fmt.len(el.a)}`;
  if (el.kind === 'grating') return `reticolo · ${el.lines} righe/mm`;
  return '';
}

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyTarget: [0.75, 0, 0] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera, renderer } = stage;
  const bench = new Bench();
  scene.add(bench.group);
  const field = new PatternField(renderer);
  bench.paper.emissiveMap = field.rt.texture;
  bench.paper.needsUpdate = true;
  const sheet = new LightSheet(AXIS_H);
  scene.add(sheet.mesh);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── stato derivato ─────────────────────────
  let cfg = config();
  let result = null;
  const view = { cx: 0, cy: 0, hx: 0.04, hy: 0.0225 };
  let dirty = true, refineAt = 0, sheetJob = null, sheetPending = false, sheetTouched = false;
  let draftLam = 10;
  let plotDirty = true, metricsDirty = true, dressAt = 1, lastDress = '';
  let photoRect = null, hover = null;
  let fpsEma = 60, hudTimer = 0;
  let dprCap = Infinity, perfAcc = 0, perfN = 0, lastScaleChange = 0;

  const markDirty = () => { dirty = true; };

  /** Tiene gli elementi in ordine sul banco e a distanza di sicurezza l'uno dall'altro. */
  function normalize(moved) {
    const hasMask = state.element !== 'none';
    const others = Math.max(hasMask ? state.xMask : 0, state.lensOn ? state.xLens : 0);
    if (moved === 'xScreen') state.xScreen = Math.max(state.xScreen, others + 0.06);
    const lim = state.xScreen - 0.06;
    state.xMask = Math.min(Math.max(state.xMask, 0.06), Math.max(lim, 0.06));
    state.xLens = Math.min(Math.max(state.xLens, 0.05), Math.max(lim, 0.05));
    if (hasMask && state.lensOn && Math.abs(state.xLens - state.xMask) < MIN_GAP) {
      const fix = moved === 'xMask' ? 'xLens' : 'xMask', ref = moved === 'xMask' ? state.xMask : state.xLens;
      const side = state[fix] >= ref ? 1 : -1;
      let v = ref + side * MIN_GAP;
      if (v > lim || v < 0.05) v = ref - side * MIN_GAP;
      state[fix] = v;
    }
  }

  /** Semi-larghezza della vista ingrandita: abbastanza per vedere la figura per intero. */
  function autoZoom() {
    const el = cfg.element;
    const lam = state.source === 'laser' ? cfg.source.lambda : 550e-9;
    const e = effectiveScale(cfg, lam), lamB = Math.abs(e.lamB), A = Math.abs(e.Ap);
    let half;
    if (el.kind === 'slits') half = Math.max((1.75 * lamB) / el.a, 1.6 * A * ((el.n - 1) * el.d + el.a) * 0.5);
    else if (el.kind === 'holes') half = Math.max((2.3 * lamB) / el.a, 1.6 * A * ((el.n - 1) * el.d + el.a) * 0.5);
    else if (el.kind === 'wire') half = Math.max((1.75 * lamB) / el.a, 1.9 * e.ws);
    else if (el.kind === 'disc') half = Math.max(1.9 * e.ws, 1.3 * A * el.a * 0.5);
    else if (el.kind === 'grating') {
      const s = (lam * el.lines * 1e3) * (state.source === 'laser' ? 1 : 700 / 550);
      half = Math.max(e.lens ? (1.5 * lamB * el.lines * 1e3) : (s < 0.95 ? 1.35 * Math.abs(e.B) * Math.tan(Math.asin(s)) : 0.15), 1.9 * e.ws);
    } else half = 2.6 * e.ws;
    let i = ZOOMS.findIndex((z) => z >= half);
    if (i < 0) i = ZOOMS.length - 1;
    return i;
  }

  function resolve(full) {
    cfg = config();
    const t0 = performance.now();
    if (state.zoomAuto) state.zoomIndex = autoZoom();
    view.hx = ZOOMS[state.zoomIndex];
    view.hy = view.hx * (photoRect && photoRect.w > 1 ? photoRect.h / photoRect.w : 9 / 16);
    const white = state.source === 'white', q = QUALITY[state.quality];
    result = solveScreen(cfg, field, view, white ? (full ? q.lam : draftLam) : 1, full ? q.radial : 512);
    field.uniforms.exposure.value = (TARGET / Math.max(result.ref, 1e-30)) * 2 ** state.ev;
    field.commit();
    const dt = performance.now() - t0;
    if (!full && white) { if (dt > 40 && draftLam > 4) draftLam -= 2; else if (dt < 14 && draftLam < 12) draftLam++; }
    plotDirty = metricsDirty = true;
    return dt;
  }

  /** Aggiorna l'aspetto degli oggetti sul banco (etichette, diapositiva): solo quando serve. */
  function dress() {
    const el = cfg.element, key = JSON.stringify([el, state.lambda, state.source]);
    if (key === lastDress) return;
    lastDress = key;
    bench.setElement(el, slideLabel(el));
    if (state.source === 'laser') bench.setLaserLabel(state.lambda, displayRGB(state.lambda));
  }

  function viewPose(id) {
    const xs = state.xScreen, xm = state.element === 'none' ? xs * 0.4 : state.xMask;
    switch (id) {
      case 'screen': return { pos: [xs - 0.62, AXIS_H + 0.06, 0.2], target: [xs, AXIS_H, 0] };
      case 'element': return { pos: [xm - 0.24, AXIS_H + 0.1, 0.27], target: [xm, AXIS_H - 0.01, 0] };
      case 'top': return { pos: [xs * 0.5, 1.15 + xs * 0.75, 0.02], target: [xs * 0.5, 0, 0] };
      case 'source': return { pos: [-0.5, AXIS_H + 0.14, 0.2], target: [xs * 0.6, AXIS_H - 0.02, 0] };
      default:
        // su schermi verticali si guarda lungo il banco, così sorgente e schermo stanno entrambi nell'inquadratura
        if (camera.aspect < 0.8) return { pos: [-0.3 - xs * 0.12, 0.34 + xs * 0.1, 0.2 + xs * 0.07], target: [xs * 0.6, AXIS_H - 0.03, 0] };
        return { pos: [-0.36 - xs * 0.2, 0.42 + xs * 0.25, 0.6 + xs * 0.6], target: [xs * 0.385, AXIS_H - 0.11, -0.05] };
    }
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    const k = Math.max(1, Math.min(2.6, 1.15 / camera.aspect));
    const pos = v.pos.map((p, i) => v.target[i] + (p - v.target[i]) * k);
    if (instant) { camera.position.set(...pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(pos, v.target);
  }

  function applyQuality() {
    stage.setQuality(state.quality, dprCap);
    refineAt = performance.now() + 50;
  }

  function caption() {
    const src = state.source === 'laser' ? `laser ${state.lambda} nm` : 'luce bianca';
    const el = cfg.element.kind === 'none' ? 'fascio libero' : slideLabel(cfg.element);
    return `${el} · ${src}${state.lensOn ? ` · lente f ${state.focal} mm` : ''} · schermo a ${fmt.cm(state.xScreen)}`;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, { presets: PRESETS, views: VIEWS, cssColor }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, p[3], { zoomAuto: true, ev: 0 });
        normalize(); ui.refresh(); ui.sync(); markDirty();
        break;
      }
      case 'view': setView(arg); break;
      case 'zoom':
        if (arg === 0) state.zoomAuto = true; else { state.zoomAuto = false; state.zoomIndex = Math.min(Math.max(state.zoomIndex - arg, 0), ZOOMS.length - 1); }
        ui.sync(); markDirty(); break;
      case 'plotLog': state.plotLog = !state.plotLog; ui.sync(); plotDirty = true; break;
      case 'hover': hover = arg; break;
      case 'zoomPhoto': ui.openLightbox(field.snapshot({ ...view, hy: view.hx * 0.5625 }, state.ambient).toDataURL('image/jpeg', 0.94), caption()); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'sheet': sheet.mesh.visible = state.sheet; if (state.sheet) markDirty(); break;
      case 'labels': break;
      case 'quality': dprCap = Infinity; applyQuality(); break;
      case 'ev': if (result) field.uniforms.exposure.value = (TARGET / Math.max(result.ref, 1e-30)) * 2 ** state.ev; field.renderScreen(); break;
      case 'xMask': case 'xLens': case 'xScreen':
        normalize(key); ui.refresh('xMask'); ui.refresh('xLens'); ui.refresh('xScreen'); markDirty(); break;
      case 'element': case 'count': case 'obstacle': case 'lensOn': case 'source':
        normalize(); ui.refresh(); ui.sync(); markDirty(); break;
      default: markDirty(); break;
    }
  });

  // etichette nella scena
  tags.add('Laser', '', (o) => o.set(-0.07, AXIS_H + 0.05, 0));
  tags.add('Lente', '', (o) => o.set(state.xLens, AXIS_H + 0.05, 0), () => state.lensOn);
  tags.add('Elemento', '', (o) => o.set(state.xMask, AXIS_H + 0.068, 0), () => state.element !== 'none');
  tags.add('Schermo', '', (o) => o.set(state.xScreen, AXIS_H + 0.128, 0));

  // ───────────────────────── trascinamento lungo la rotaia ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3(), plane = new THREE.Plane();
  let drag = null, hoverTick = 0;
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(bench.dragTargets, false).find((h) => h.object.parent && h.object.visible && ancestorsVisible(h.object));
  };
  const ancestorsVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const KEY = { lens: 'xLens', mask: 'xMask', screen: 'xScreen' };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) { canvas.classList.add('dragging'); return; }
    // piano di trascinamento: orizzontale se si guarda dall'alto, verticale se di fianco
    const steep = Math.abs(camera.getWorldDirection(v3).y) > 0.5;
    plane.setFromNormalAndCoplanarPoint(steep ? v3.set(0, 1, 0) : v3.set(0, 0, 1), hit.point);
    const key = KEY[hit.object.userData.drag];
    drag = { key, offset: hit.point.x - state[key] };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('sliding');
    e.stopImmediatePropagation();          // la telecamera non deve ruotare mentre si sposta un elemento
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, v3)) {
        const before = state[drag.key];
        let x = Math.round((v3.x - drag.offset) * 200) / 200;
        // durante il trascinamento un cavaliere non scavalca l'altro
        const other = drag.key === 'xLens' ? (state.element !== 'none' ? state.xMask : null) : drag.key === 'xMask' ? (state.lensOn ? state.xLens : null) : null;
        if (other !== null) x = before < other ? Math.min(x, other - MIN_GAP) : Math.max(x, other + MIN_GAP);
        state[drag.key] = x;
        normalize(drag.key);
        ui.refresh('xMask'); ui.refresh('xLens'); ui.refresh('xScreen');
        markDirty();
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !!pick(e));
  }, { capture: true });
  const endDrag = (e) => {
    canvas.classList.remove('dragging');
    if (!drag) return;
    drag = null;
    canvas.classList.remove('sliding');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
    else if (k === 'escape') document.getElementById('lightbox').classList.remove('on');
  });

  // ───────────────────────── dimensioni ─────────────────────────
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
    photoRect = ui.photoRect();
  }
  window.addEventListener('resize', onResize);
  new ResizeObserver(() => { photoRect = ui.photoRect(); markDirty(); }).observe(document.getElementById('live'));

  // ───────────────────────── misure ─────────────────────────
  function updateMetrics() {
    metricsDirty = false;
    const el = cfg.element, white = state.source === 'white';
    const lam = white ? 550e-9 : cfg.source.lambda;
    const e = effectiveScale(cfg, lam), lamB = Math.abs(e.lamB), A = Math.abs(e.Ap);
    const note = white ? ' (a 550 nm)' : '';
    const L = e.lens ? 'λ·B' : 'λ·L';
    const half = el.kind === 'grating' || el.kind === 'none' ? e.w : el.a / 2;
    const NF = (half * half * A) / Math.max(lamB, 1e-18);
    const regime = Math.abs(e.B) < 1e-4 ? 'immagine' : NF < 0.1 ? 'Fraunhofer' : NF < 2 ? 'intermedio' : 'Fresnel';
    const cellNF = { k: 'Numero di Fresnel', p: 2, v: NF >= 100 ? fmt.num(NF, 0) : fmt.num(NF, NF < 0.1 ? 3 : 2), s: regime, title: 'N = a²/(λL), con a il semi-spessore dell\'elemento. N ≪ 1: campo lontano (Fraunhofer); N ≳ 1: campo vicino (Fresnel).' };
    const cellP = { k: 'Luce che passa', p: 3, v: fmt.pct(transmittedFraction(cfg, lam)), s: 'della potenza del fascio' };
    const big = (m) => fmt.len(m).replace(/ (\S+)$/, ' <small>$1</small>');
    let cells;
    if (el.kind === 'slits' && el.n === 1) {
      cells = [
        { k: 'Minimi', v: `<i>x = m·${L}/a</i>`, s: `ogni ${fmt.len(lamB / el.a)}${note}`, title: 'Posizione dei minimi della fenditura singola' },
        { k: 'Massimo centrale', v: big((2 * lamB) / el.a), s: 'largo il doppio degli altri' },
        cellNF, cellP,
      ];
    } else if (el.kind === 'slits') {
      cells = [
        { k: 'Interfrangia', v: big(lamB / el.d), s: `Δx = ${L}/d${note}`, title: 'Distanza fra due massimi d\'interferenza vicini' },
        { k: 'Inviluppo', v: big(lamB / el.a), s: `primo zero: ${L}/a`, title: 'La figura della singola fenditura modula le frange' },
        { k: 'Frange nel centro', p: 2, v: `${2 * Math.ceil(el.d / el.a) - 1}`, s: 'entro il massimo centrale' },
        cellNF, cellP,
      ];
    } else if (el.kind === 'holes') {
      cells = [
        { k: 'Disco di Airy', v: big((1.22 * lamB) / el.a), s: `raggio 1,22·${L}/D${note}`, title: 'Raggio del primo anello scuro' },
        ...(el.n > 1 ? [{ k: 'Interfrangia', v: big(lamB / el.d), s: `Δx = ${L}/d` }] : []),
        cellNF, cellP,
      ];
    } else if (el.kind === 'wire') {
      cells = [
        { k: 'Minimi (Babinet)', v: big(lamB / el.a), s: `ogni ${L}/a${note}`, title: 'Fuori dal fascio diretto un filo dà la stessa figura di una fenditura larga quanto lui' },
        { k: 'Fascio sullo schermo', v: big(2 * e.ws), s: 'diametro a 1/e²' },
        cellNF, cellP,
      ];
    } else if (el.kind === 'disc') {
      cells = [
        { k: 'Macchia di Arago', v: `⌀ ${fmt.len((0.766 * lamB) / (el.a / 2))}`, s: `0,77·${L}/a${note}`, title: 'Al centro dell\'ombra le onde che sfiorano il bordo del disco arrivano tutte in fase: lì la luce c\'è' },
        { k: 'Ombra geometrica', v: big(A * el.a), s: 'diametro sullo schermo' },
        cellNF, cellP,
      ];
    } else if (el.kind === 'grating') {
      const d = 1e-3 / el.lines, s1 = lam / d;
      cells = [
        { k: 'Passo', v: big(d), s: `${el.lines} righe/mm` },
        { k: 'Primo ordine', v: s1 < 1 ? fmt.deg(Math.asin(s1)) : '—', s: `sin θ = λ/d${note}`, title: 'Equazione del reticolo: d·sin θ = m·λ' },
        { k: 'Sullo schermo', v: s1 < 1 && !e.lens ? big(Math.abs(e.B) * Math.tan(Math.asin(s1))) : big(lamB / d), s: 'distanza dal centro' },
        { k: 'Ordini possibili', p: 2, v: `±${Math.floor(d / lam)}`, s: 'm ≤ d/λ' },
        { k: 'Righe illuminate', p: 3, v: `≈ ${Math.round((2 * e.w) / d)}`, s: 'entro il fascio' },
      ];
    } else {
      const zR = (Math.PI * (state.beam * 0.5e-3) ** 2) / lam;
      cells = [
        { k: 'Fascio sullo schermo', v: big(2 * e.ws), s: 'diametro a 1/e²' },
        { k: 'Divergenza', v: `${fmt.num((lam / (Math.PI * state.beam * 0.5e-3)) * 1e3, 3)} <small>mrad</small>`, s: 'θ = λ/(π·w₀)', title: 'Anche un fascio laser si allarga: è diffrazione' },
        { k: 'Distanza di Rayleigh', p: 2, v: big(zR), s: 'z = π·w₀²/λ' },
        ...(state.lensOn ? [{ k: 'Fuoco della lente', v: big((2 * lam * state.focal * 1e-3) / (Math.PI * beamAt(cfg, lam, state.xLens).w)), s: 'diametro: 2λf/(π·w)' }] : []),
      ];
    }
    ui.setMetrics(cells);
    const names = [state.source === 'laser' ? `Laser · ${state.lambda} nm` : 'Luce bianca', `Lente · f ${state.focal} mm`, elementName(el), `Schermo · ${fmt.cm(state.xScreen)}`];
    tags.items.forEach((t, i) => tags.setText(t, names[i]));
    ui.setStatus(regime, !!refineAt);
  }

  function updatePlot() {
    plotDirty = false;
    if (!result) return;
    ui.drawPlot({ profile: result.profile, half: result.profileHalf, peak: result.peak, color: state.source === 'laser' ? cssColor(state.lambda) : 'rgb(70,78,90)', log: state.plotLog });
    if (cfg.element.kind !== 'none') ui.drawMask(cfg.element, beamAt(cfg, state.source === 'laser' ? cfg.source.lambda : 550e-9, cfg.xMask).w, state.source === 'laser' ? cssColor(state.lambda) : 'rgb(255,250,235)');
    const bar = niceStep(view.hx * 0.6);
    if (photoRect) ui.setScale((bar / (2 * view.hx)) * photoRect.w, fmt.len(bar));
    ui.setViewInfo(`vista ${fmt.len(2 * view.hx)}${state.zoomAuto ? '' : ' · manuale'}`);
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000;
    const rawDt = now - last;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;

    if (dirty) {
      dirty = false;
      resolve(false);
      bench.layout({ kind: state.source, lensOn: state.lensOn, xLens: state.xLens, xMask: state.xMask, xScreen: state.xScreen });
      sheet.setExtent(state.xScreen);
      refineAt = state.source === 'white' || !isLinear(cfg.element) ? nowMs + 180 : 0;   // rifinitura: più colori, più campioni radiali
      dressAt = nowMs + 140;
      sheetPending = state.sheet;
      sheetJob = null;
    } else if (refineAt && nowMs > refineAt) {
      refineAt = 0;
      resolve(true);
    } else if (sheetPending) {
      sheetPending = false;
      sheetJob = buildSheet(cfg, sheet);
    }
    if (dressAt && nowMs > dressAt) { dressAt = 0; dress(); }
    // il foglio di luce si costruisce un po' per fotogramma
    if (sheetJob && !dirty) {
      const t0 = performance.now();
      let step;
      do { step = sheetJob.next(); sheetTouched = true; } while (!step.done && performance.now() - t0 < 7);
      if (step.done) sheetJob = null;
      if (sheetTouched) { sheet.commit(); sheetTouched = false; }
    }

    stage.update(dt);
    tags.update(camera, w, h, state.labels);
    stage.render();
    if (photoRect && photoRect.w > 1) field.present(photoRect, h, view, state.ambient);

    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) {
      hudTimer = 0;
      ui.setFps(Math.round(fpsEma));
      if (metricsDirty) updateMetrics();
      if (plotDirty) updatePlot();
      if (hover !== null && result) {
        const x = (hover - 0.5) * 2 * view.hx;
        const i = Math.round(((x / result.profileHalf) * 0.5 + 0.5) * result.profile.length - 0.5);
        const I = i >= 0 && i < result.profile.length ? result.profile[i] / result.peak : 0;
        ui.setCursor(`x = ${x >= 0 ? '+' : '−'}${fmt.len(Math.abs(x))} · I = ${fmt.num(I * 100, I < 0.1 ? 2 : 1)} %`);
      } else ui.setCursor('');
    }

    if (state.quality === 'medium' && document.visibilityState === 'visible') {
      perfAcc += rawDt; perfN++;
      if (perfN >= 90) {
        const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
        const cur = renderer.getPixelRatio();
        if (avg > 0.034 && cur > 0.75 && nowMs - lastScaleChange > 1500) { dprCap = Math.max(0.7, cur - 0.2); lastScaleChange = nowMs; stage.setQuality(state.quality, dprCap); onResize(); } else if (avg < 0.0145 && cur < Math.min(window.devicePixelRatio || 1, 1.5) - 0.01 && nowMs - lastScaleChange > 9000) { dprCap = cur + 0.15; lastScaleChange = nowMs; stage.setQuality(state.quality, dprCap); onResize(); }
      }
    }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality, dprCap);
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  bench.layout({ kind: state.source, lensOn: state.lensOn, xLens: state.xLens, xMask: state.xMask, xScreen: state.xScreen });
  dress();
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Profilo d\'intensità sullo schermo', tools: [document.getElementById('plot-log')], redraw: () => { plotDirty = true; } });
  window.lab = { state, ui, stage, bench, field, sheet, markDirty, setView, plotView, config, result: () => result, view, THREE };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
