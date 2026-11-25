// main.js — Le leggi di Ohm
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { COMPONENTS, MATERIALS, WIRES, wireName, Part, solve, steadyIV, T0 } from './circuit.js';
import { Rig, BOARD, YW, wireZ } from './rig.js';
import { createUI, fmt } from './ui.js';

const state = {
  exp: 'first', on: true, Vset: 5, Ilim: 0.5, flip: false, comp: 'r100', holder: 'rods', wire: 'c35', L: 0.5,
  mode: 'valle', ideal: false, dots: true, outline: false, labels: true, ambient: 1, quality: 'low', plotKind: 'iv',
};
const BASE = { exp: 'first', on: true, Vset: 5, Ilim: 0.5, flip: false, comp: 'r100', holder: 'rods', wire: 'c35', L: 0.5, mode: 'valle', ideal: false, plotKind: 'iv' };
const volts = (list) => list.flatMap((v) => [{ sweep: { key: 'Vset', to: v, dur: 0.7 } }, { wait: 1.3 }, { note: true }]);
const lengths = (list) => list.flatMap((v) => [{ sweep: { key: 'L', to: v, dur: 1 } }, { wait: 1.2 }, { note: true }]);
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
// passi: {set} · {wait: s} · {note} · {sweep: {key, to, dur}}
const PRESETS = [
  ['ohm1', 'La prima legge di Ohm', 'Su un resistore la corrente cresce in proporzione alla tensione: se V raddoppia, raddoppia anche I. Il rapporto V/I resta lo stesso: è la resistenza, R = V/I', { comp: 'r100', Vset: 0.5 }, volts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'overview'],
  ['three', 'Tre resistenze', 'Le stesse tensioni su 47, 100 e 220 Ω: tre rette per l\'origine, tanto più ripide quanto più piccola è la resistenza', { comp: 'r47', Vset: 0.5 }, [...volts([2, 4, 6, 8]), { set: { comp: 'r100', Vset: 0.5 } }, ...volts([2, 4, 6, 8]), { set: { comp: 'r220', Vset: 0.5 } }, ...volts([2, 4, 6, 8])], 'overview'],
  ['lamp', 'La lampadina', 'Il filamento di tungsteno non segue la legge di Ohm: scaldandosi fino a 2600 °C la sua resistenza cresce più di dieci volte, e la caratteristica si piega', { comp: 'lamp', Vset: 0.05, Ilim: 1 }, volts([0.1, 0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6]), 'comp'],
  ['led', 'Il LED', 'Fin verso 1,6 V non passa quasi corrente; poi basta un niente di tensione in più per farla salire di colpo. Il limite di 30 mA lo protegge. Girato al contrario, non conduce', { comp: 'led', Vset: 0, Ilim: 0.03 }, [...volts([0.5, 1, 1.4, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 3]), { set: { Vset: 0, flip: true } }, { wait: 1 }, ...volts([1, 2, 3])], 'comp'],
  ['monte', 'A monte o a valle', '10 Ω a 2 V. A valle il voltmetro misura il solo resistore; a monte misura anche l\'amperometro, che ha 1 Ω: la resistenza viene il 10 % più grande. Per resistenze piccole si mette a valle, per quelle molto grandi a monte', { comp: 'r10', Vset: 2, mode: 'valle', plotKind: 'r' }, [{ wait: 2 }, { note: true }, { wait: 1 }, { set: { mode: 'monte' } }, { wait: 2.5 }, { note: true }, { wait: 1 }, { set: { mode: 'valle', ideal: true } }, { wait: 2.5 }, { note: true }], 'overview'],
  ['burn', 'Troppa potenza', '10 Ω a 12 V: l\'alimentatore arriva al limite di 1 A e lo tiene, e nel resistore da 2 W se ne dissipano 10. Si scalda, fuma e brucia', { comp: 'r10', Vset: 12, Ilim: 1 }, [], 'comp'],
  ['wire1', 'Un filo di costantana', 'Un metro di filo di costantana teso fra due isolatori: la corrente è proporzionale alla tensione, come nel resistore. La costantana è fatta apposta perché la sua resistenza non cambi scaldandosi', { comp: 'wire', wire: 'c35', L: 1, Vset: 0.2, Ilim: 1 }, volts([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]), 'overview'],
  ['iron', 'Il filo di ferro si scalda', 'Lo stesso con un filo di ferro: con quasi un ampere si scalda di una trentina di gradi e la sua resistenza cresce di quasi il 20 %. Il filo si scalda in una decina di secondi, per questo si aspetta prima di leggere', { comp: 'wire', wire: 'f35', L: 1, Vset: 0.05, Ilim: 1, plotKind: 'r' }, [0.3, 0.6, 0.9, 1.2].flatMap((v) => [{ sweep: { key: 'Vset', to: v, dur: 0.7 } }, { wait: 11 }, { note: true }]), 'overview'],
  ['length', 'La seconda legge: la lunghezza', 'L\'alimentatore tiene la corrente a 150 mA; la pinza a coccodrillo scorre sul filo di costantana teso fra gli isolatori. La resistenza cresce in proporzione alla lunghezza: R = ρL/S', { exp: 'second', holder: 'rods', wire: 'c35', L: 0.1, Vset: 12, Ilim: 0.15, plotKind: 'rl' }, lengths([0.2, 0.4, 0.6, 0.8, 1]), 'overview'],
  ['section', 'La sezione', 'Sul banco, tre fili di costantana sempre più grossi, a 50 cm e a 1 m: la resistenza va come l\'inverso della sezione. In funzione di L/S i punti stanno su una sola retta', { exp: 'second', holder: 'board', wire: 'c25', L: 0.5, Vset: 12, Ilim: 0.15, plotKind: 'rs' }, [{ wait: 1.5 }, { note: true }, ...lengths([1]), { set: { wire: 'c35', L: 0.5 } }, { wait: 1.5 }, { note: true }, ...lengths([1]), { set: { wire: 'c50', L: 0.5 } }, { wait: 1.5 }, { note: true }, ...lengths([1])], 'overview'],
  ['material', 'Il materiale', 'Sul banco, fili uguali, ⌀ 0,35 mm, di costantana, nichelcromo e ferro: la resistenza dipende dal materiale, cioè dalla resistività ρ, la pendenza delle rette', { exp: 'second', holder: 'board', wire: 'c35', L: 0.5, Vset: 12, Ilim: 0.15, plotKind: 'rs' }, [{ wait: 1.5 }, { note: true }, ...lengths([1]), { set: { wire: 'n35', L: 0.5 } }, { wait: 1.5 }, { note: true }, ...lengths([1]), { set: { wire: 'f35', L: 0.5 } }, { wait: 1.5 }, { note: true }, ...lengths([1])], 'overview'],
];
/** L'apparato in uso: la basetta, il filo sugli isolatori o il banco a più fili. */
const app = () => (state.exp === 'first' ? (state.comp === 'wire' ? 'rods' : 'base') : state.holder);
const VIEWS = () => [['overview', 'Panoramica'], ['comp', app() === 'base' ? 'Il componente' : 'La pinza'], ['meters', 'Gli strumenti']];
const PALETTE = ['#2c67dc', '#e8452c', '#1f9e6e', '#d98a1c', '#7a3fb5', '#3a3f46'];
const COMP_KEYS = Object.keys(COMPONENTS);

/** Lettura di un multimetro a 3½ cifre con portata automatica: un po' di sfarfallio sull'ultima cifra. */
function readV(v, noise = true) {
  const a = Math.abs(v), [k, d, unit, range] = a < 0.19995 ? [1000, 1, 'mV', '200 mV'] : a < 1.9995 ? [1, 3, 'V', '2 V'] : a < 19.995 ? [1, 2, 'V', '20 V'] : [1, 1, 'V', '200 V'];
  const res = 10 ** -d, x = v * k + (noise && a * k > res ? (Math.random() + Math.random() - 1) * 0.5 * res : 0), q = Math.round(x / res) * res;
  return { txt: q.toFixed(d), unit, range, val: q / k, d: unit === 'mV' ? 1 : d, mv: unit === 'mV' };
}
function readI(i, noise = true) {
  const a = Math.abs(i), [k, d, unit, range] = a < 0.019995 ? [1000, 2, 'mA', '20 mA'] : a < 0.19995 ? [1000, 1, 'mA', '200 mA'] : [1, 3, 'A', '10 A'];
  const res = 10 ** -d, x = i * k + (noise && a * k > res ? (Math.random() + Math.random() - 1) * 0.5 * res : 0), q = Math.round(x / res) * res;
  return { txt: q.toFixed(d), unit, range, val: q / k };
}
const vText = (r) => `${r.txt.replace('.', ',').replace('-', '−')} ${r.unit}`;

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.3, 2.7, 1.9], keyTarget: [0, 0, -0.15], shadowBox: [-1.4, 1.4, 1.1, -1.1], shadowFar: 7, fog: [6, 45] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 8;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── il circuito ─────────────────────────
  const wi = () => Math.max(0, WIRES.findIndex((w) => w.id === state.wire));
  const usesWire = () => app() !== 'base';
  const makePart = () => (usesWire() ? new Part('wire', WIRES[wi()], state.L) : new Part(state.comp));
  /** Chiave del conduttore annotato: il componente, o il filo (nella prima legge 'wire:<filo>'). */
  const recKey = () => (state.exp === 'second' ? state.wire : state.comp === 'wire' ? `wire:${state.wire}` : state.comp);
  let part = null, res = null, cur = {}, A = null, phase = 0, simT = 0;
  let shown = { V: readV(0), I: readI(0) }, readTimer = 1, inrush = { t: 0, peak: 0 };
  let paused = false, seq = null, pendingView = null, records = [], plotDirty = true;
  const params = () => ({ Vset: state.Vset, Ilim: state.Ilim, on: state.on, flip: state.flip, mode: state.mode, ideal: state.ideal });

  /** Monta ciò che serve per lo stato attuale: il componente (o il filo), la disposizione, i cavi. */
  function mount(fresh = false) {
    const ap = app(), k = `${ap}|${usesWire() ? state.wire : state.comp}`;
    const newPart = fresh || cur.k !== k;
    if (newPart) {
      part = makePart();
      if (ap === 'base') rig.setComponent(state.comp);
      if (ap === 'rods') rig.setRodsWire(WIRES[wi()]);
      inrush = { t: 0, peak: 0 };
    }
    if (part.kind === 'wire') part.L = state.L;
    if (newPart || cur.L !== state.L || cur.mode !== state.mode || cur.flip !== state.flip) {
      rig.layout(ap, wi(), state.L);
      rig.wireUp(state.mode, state.flip);
      A = rig.anchors();
      if (newPart || cur.mode !== state.mode || cur.flip !== state.flip) readTimer = 1;   // gli strumenti si aggiornano subito
    }
    cur = { k, L: state.L, mode: state.mode, flip: state.flip };
    res = solve(part, params());
  }
  function stepCircuit(dt) {
    const s = params(), n = part.kind === 'lamp' ? Math.max(1, Math.ceil(dt / 0.004)) : 1, h = dt / n;
    for (let i = 0; i < n; i++) {
      res = solve(part, s);
      part.heat(h, Math.abs(res.V1 * res.I));
      if (inrush.t < 0.6) inrush.peak = Math.max(inrush.peak, Math.abs(res.Is));
      inrush.t += h;
    }
    simT += dt;
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { const was = state.exp; Object.assign(state, st.set); ui.refresh(); if (was !== state.exp) ui.sync(); mount(); }
      if (st.note) note();
      if (st.sweep) seq.from = state[st.sweep.key];
    }
    seq.t += dt;
    if (st.sweep) {
      const k = Math.min(1, seq.t / st.sweep.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      state[st.sweep.key] = seq.from + (st.sweep.to - seq.from) * e; ui.refresh(st.sweep.key);
      mount();
      if (k >= 1) { seq.i++; seq.started = false; }
    } else if (seq.t >= (st.wait || 0.02)) { seq.i++; seq.started = false; }
    if (seq && seq.i >= seq.list.length) seq = null;
  }
  function note() {
    if (!state.on || !res) return;
    const r = { exp: state.exp, key: recKey(), V: shown.V.val, I: shown.I.val, mode: state.mode, ideal: state.ideal };
    if (usesWire()) { const w = WIRES[wi()]; Object.assign(r, { L: state.L, S: (Math.PI * w.d * w.d) / 4 * 1e6, mat: w.mat }); }
    records.push(r);
    plotDirty = true;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS, app,
    text: {
      Vset: () => `${fmt.num(state.Vset, 2)} V`,
      Ilim: () => (state.Ilim < 0.9995 ? `${fmt.num(state.Ilim * 1000, 0)} mA` : '1,000 A'),
      L: () => `${fmt.num(state.L * 100, 1)} cm`,
    },
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        records = []; paused = false; plotDirty = true;
        ui.refresh(); ui.sync();
        mount(true);
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'pause': paused = !paused; break;
      case 'note': note(); break;
      case 'clear': records = []; plotDirty = true; break;
      case 'fresh': mount(true); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'exp': seq = null; state.plotKind = state.exp === 'first' ? 'iv' : 'rl'; ui.sync(); mount(); setView('overview'); plotDirty = true; break;
      case 'on': seq = null; if (state.on) inrush = { t: 0, peak: 0 }; mount(); break;
      case 'comp': case 'holder': {
        // cambia l'apparato: si inquadra quello nuovo
        seq = null; const was = cur.k ? cur.k.split('|')[0] : '';
        ui.sync(); ui.refresh(); mount(); plotDirty = true;
        if (app() !== was) setView('overview');
        break;
      }
      case 'wire': case 'L': case 'mode': case 'flip': seq = null; ui.refresh(); mount(); plotDirty = true; break;
      case 'Vset': case 'Ilim': case 'ideal': seq = null; mount(); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const first = () => state.exp === 'first';
  tags.add('Alimentatore', '', (o) => o.copy(A.supply));
  tags.add('Amperometro · in serie', '', (o) => o.copy(A.amm));
  tags.add('Voltmetro · in parallelo', '', (o) => o.copy(A.volt));
  const compTag = tags.add('Resistore', 'floor', (o) => o.copy(A.comp).add(new THREE.Vector3(0, 0.03, 0)), () => app() === 'base');
  tags.add('Pinza a coccodrillo', 'floor', (o) => o.copy(A.cursor), () => app() === 'board');
  tags.add('Metro', 'floor alt', (o) => o.set(BOARD.x0 + 0.62, 0.03, wireZ(WIRES.length - 1) + 0.04), () => app() === 'board');
  tags.add('Pinza a coccodrillo', 'floor', (o) => o.copy(A.clip), () => app() === 'rods');
  tags.add('Isolatore su asta', '', (o) => o.copy(A.insL), () => app() === 'rods');
  tags.add('Metro', 'floor alt', (o) => o.copy(A.rodsRuler), () => app() === 'rods');

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
    const ap = app();
    if (ap === 'base') {
      const b = rig.base.position;
      if (id === 'comp' && rig.compKind !== 'lamp') return fitPose(V(0.12, 0.7, 1).normalize(), box(b.x - 0.05, 0.0, b.z - 0.06, b.x + 0.05, 0.03, b.z + 0.012));
      if (id === 'comp') return fitPose(V(0.18, 0.55, 1).normalize(), box(b.x - 0.1, 0.0, b.z - 0.05, b.x + 0.1, 0.1, b.z + 0.05));
      if (id === 'meters') return fitPose(V(0, 0.95, 0.62).normalize(), box(-0.17, 0, -0.27, 0.34, 0.11, -0.08));
      return fitPose(V(0.28, 0.66, 1).normalize(), box(-0.58, 0, -0.3, 0.4, 0.13, rig.compKind === 'lamp' ? 0.17 : 0.12));
    }
    if (ap === 'rods') {
      const z = rig.rods.position.z, x = BOARD.x0 + state.L;
      if (id === 'comp') return fitPose(V(0.2, 0.4, 1).normalize(), box(x - 0.13, YW - 0.09, z - 0.02, x + 0.13, YW + 0.03, z + 0.05));
      if (id === 'meters') return fitPose(V(0, 0.95, 0.62).normalize(), box(-0.21, 0, -0.44, 0.37, 0.11, -0.25));
      return fitPose(V(0.22, 0.8, 1).normalize(), box(-0.84, 0, -0.46, 0.66, YW + 0.05, z + 0.07));
    }
    const c = rig.bclip.g.position;
    if (id === 'comp') return fitPose(V(0.15, 0.6, 1).normalize(), box(c.x - 0.09, 0.02, c.z - 0.06, c.x + 0.09, 0.06, c.z + 0.03));
    if (id === 'meters') return fitPose(V(0, 0.95, 0.62).normalize(), box(-0.43, 0, -0.66, 0.19, 0.11, -0.47));
    return fitPose(V(0.22, 0.75, 1).normalize(), box(-1.07, 0, -0.66, 0.64, 0.12, -0.02));
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
      e.preventDefault(); seq = null;
      state.Vset = Math.max(0, Math.min(12, Math.round((state.Vset + (k === 'arrowright' ? 1 : -1) * (e.shiftKey ? 1 : 0.1)) * 100) / 100));
      ui.refresh('Vset'); mount();
    } else if ((k === 'arrowup' || k === 'arrowdown') && usesWire()) {
      e.preventDefault(); seq = null;
      state.L = Math.max(0.05, Math.min(1, Math.round((state.L + (k === 'arrowup' ? 0.01 : -0.01)) * 1000) / 1000));
      ui.refresh('L'); mount();
    } else if (k >= '1' && k <= '3') setView(VIEWS()[Number(k) - 1][0]);
  });

  // ───────────────────────── grafici ─────────────────────────
  const theoryCache = new Map();
  /** Caratteristica in regime del conduttore montato (con il riscaldamento), fra le tensioni from e to. */
  function theory(from, to, n = 140) {
    const id = `${recKey()}|${usesWire() ? state.L.toFixed(3) : ''}|${from.toFixed(2)}|${to.toFixed(2)}|${n}`;
    if (theoryCache.has(id)) return theoryCache.get(id);
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) { const v = from + ((to - from) * i) / n; xs.push(v); ys.push(usesWire() ? steadyIV('wire', v, WIRES[wi()], state.L) : steadyIV(state.comp, v)); }
    const out = { xs, ys };
    if (theoryCache.size > 60) theoryCache.clear();
    theoryCache.set(id, out);
    return out;
  }
  const FIRST_WIRE_COL = { costantana: '#0f8b8d', nichelcromo: '#5b6470', ferro: '#b0507a' };
  const wireOf = (key) => WIRES.find((w) => w.id === key.replace('wire:', ''));
  const colorOf = (key) => {
    if (state.exp === 'first') return key.startsWith('wire:') ? FIRST_WIRE_COL[wireOf(key).mat] : PALETTE[Math.max(0, COMP_KEYS.indexOf(key)) % PALETTE.length];
    return PALETTE[Math.max(0, WIRES.findIndex((w) => w.id === key)) % PALETTE.length];
  };
  const nameOf = (key) => (state.exp === 'first' && !key.startsWith('wire:') ? COMPONENTS[key].name : wireName(wireOf(key)).replace(' ⌀', ''));
  const theoryName = () => (usesWire() ? 'il filo, in teoria' : `${COMPONENTS[state.comp].name.toLowerCase()}, in teoria`);
  function legendOf(recs) {
    const keys = [...new Set(recs.map((r) => r.key))];
    return keys.slice(-4).map((k) => [nameOf(k), colorOf(k)]);
  }
  function drawPlot() {
    plotDirty = false;
    const recs = records.filter((r) => r.exp === state.exp), cV = shown.V.val, cI = shown.I.val;
    if (state.plotKind === 'iv') {
      const Vs = recs.map((r) => r.V).concat([cV]), Is = recs.map((r) => r.I * 1000).concat([cI * 1000]);
      const X0 = Math.min(0, ...Vs) * 1.12, X1 = Math.max(1, ...Vs) * 1.12;
      const Y0 = Math.min(0, ...Is) * 1.12, Y1 = Math.max(5, ...Is) * 1.15;
      const th = theory(X0, X1);
      ui.drawPlot({
        series: [{ x: th.xs, y: th.ys.map((i) => i * 1000), color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: recs.map((r) => ({ x: r.V, y: r.I * 1000, color: colorOf(r.key), r: 6 })).concat([{ x: cV, y: cI * 1000, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' }]),
        X0, X1, Y0, Y1, xLabel: 'tensione V (V)', yLabel: 'corrente I (mA)',
        legend: [...legendOf(recs), [theoryName(), '#9aa1ab']],
      });
    } else if (state.plotKind === 'r') {
      const ok = (V, I) => Math.abs(I) > 5e-4 && isFinite(V / I);
      // a monte: il punto cerchiato
      const pr = recs.filter((r) => ok(r.V, r.I)).map((r) => ({ x: r.I * 1000, y: r.V / r.I, color: colorOf(r.key), r: r.mode === 'monte' ? 7 : 6, ring: r.mode === 'monte' ? '#15181c' : null }));
      const anyMonte = recs.some((r) => r.mode === 'monte');
      const th = theory(0.01, usesWire() ? Math.min(12, Math.max(1, Math.abs(cV) * 1.6, ...recs.map((r) => Math.abs(r.V) * 1.4))) : 12, 200), tx = [], ty = [];
      th.xs.forEach((v, i) => { const I = th.ys[i]; if (ok(v, I)) { tx.push(I * 1000); ty.push(v / I); } });
      const cur = ok(cV, cI) ? [{ x: cI * 1000, y: cV / cI, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' }] : [];
      const X1 = Math.max(10, ...pr.map((p) => p.x), ...cur.map((p) => p.x)) * 1.15;
      const Ys = pr.map((p) => p.y).concat(cur.map((p) => p.y));
      let Y1 = Math.max(5, ...Ys) * 1.25, Y0 = 0;
      if (!Ys.length) { const inR = ty.filter((_, i) => tx[i] <= X1); Y1 = Math.max(5, ...inR.slice(Math.floor(inR.length * 0.3))) * 1.25; }
      // valori vicini fra loro (un resistore a monte e a valle): l'asse non parte da zero, così la differenza si vede
      const lo = Math.min(...Ys), hi = Math.max(...Ys);
      if (Ys.length >= 2 && lo > 0.6 * hi) { const pad = Math.max(0.08 * hi, (hi - lo) * 0.6); Y0 = Math.max(0, lo - pad); Y1 = hi + pad; }
      ui.drawPlot({
        series: [{ x: tx, y: ty, color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: pr.concat(cur), X0: 0, X1, Y0, Y1, xLabel: 'corrente I (mA)', yLabel: 'resistenza V/I (Ω)',
        legend: [...legendOf(recs.filter((r) => ok(r.V, r.I))), ...(anyMonte ? [['◯ a monte', '#15181c']] : []), ['in teoria', '#9aa1ab']],
      });
    } else {
      const w = WIRES[wi()], S = (Math.PI * w.d * w.d) / 4 * 1e6;
      const Rof = (r) => (Math.abs(r.I) > 1e-5 ? r.V / r.I : NaN);
      const cR = Math.abs(cI) > 1e-5 ? cV / cI : NaN;
      if (state.plotKind === 'rl') {
        const keys = [...new Set(recs.map((r) => r.key).concat([state.wire]))];
        const series = keys.map((k) => { const ww = WIRES.find((x) => x.id === k), SS = (Math.PI * ww.d * ww.d) / 4, rho = MATERIALS[ww.mat].rho; return { x: [0, 100], y: [0.012, (rho * 1) / SS + 0.012], color: colorOf(k), width: k === state.wire ? 2 : 1.4, dash: [7, 6], alpha: 0.55 }; });
        const pts = recs.map((r) => ({ x: r.L * 100, y: Rof(r), color: colorOf(r.key), r: 6 })).filter((p) => isFinite(p.y));
        if (isFinite(cR)) pts.push({ x: state.L * 100, y: cR, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' });
        const Y1 = Math.max(2, ...pts.map((p) => p.y), (MATERIALS[w.mat].rho) / ((Math.PI * w.d * w.d) / 4)) * 1.15;
        ui.drawPlot({ series, points: pts, X0: 0, X1: 105, Y0: 0, Y1, xLabel: 'lunghezza L (cm)', yLabel: 'resistenza V/I (Ω)', legend: legendOf(recs.length ? recs : [{ key: state.wire }]) });
      } else {
        // qui conta il materiale: punti e rette hanno il suo colore, la pendenza è ρ
        const mats = [...new Set(recs.map((r) => r.mat).concat([w.mat]))];
        const MC = { costantana: '#c98a1c', nichelcromo: '#2c67dc', ferro: '#e8452c' };
        const pts = recs.map((r) => ({ x: r.L / r.S, y: Rof(r), color: MC[r.mat], r: 6 })).filter((p) => isFinite(p.y));
        if (isFinite(cR)) pts.push({ x: state.L / S, y: cR, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' });
        const X1 = Math.max(5, ...pts.map((p) => p.x)) * 1.15, Y1 = Math.max(1, ...pts.map((p) => p.y), MATERIALS[w.mat].rho * 1e6 * X1 * 0.9) * 1.12;
        const series = mats.map((m) => ({ x: [0, X1], y: [0, MATERIALS[m].rho * 1e6 * X1], color: MC[m], width: 2, dash: [7, 6], alpha: 0.7 }));
        ui.drawPlot({
          series, points: pts, X0: 0, X1, Y0: 0, Y1, xLabel: 'L/S (m/mm²)', yLabel: 'resistenza V/I (Ω)',
          legend: mats.map((m) => [MATERIALS[m].name, MC[m]]),
        });
      }
    }
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    ui.setPause(paused ? 'Riprendi' : 'Pausa');
    if (!res) return;
    const Vr = shown.V, Ir = shown.I, Rm = Math.abs(Ir.val) > 1e-6 ? Vr.val / Ir.val : NaN;
    const on = state.on, burnt = part.burnt, P = Math.abs(res.V1 * res.I), Rtrue = Math.abs(res.I) > 1e-9 ? res.V1 / res.I : NaN;
    const Rtxt = isFinite(Rm) && Math.abs(Rm) < 1e7 ? `${fmt.num(Rm, Math.abs(Rm) < 10 ? 2 : Math.abs(Rm) < 1000 ? 1 : 0)}` : '—';
    ui.setStatus(paused ? 'in pausa' : !on ? 'spento' : burnt ? 'bruciato' : res.cc ? 'limite di corrente' : 'misura', !paused && on && !burnt && Math.abs(res.I) > 1e-6, burnt);
    ui.setFresh(burnt);
    ui.setClock(`${Rtxt} <small>Ω = V/I</small>`);
    const side2 = !on ? 'alimentatore spento' : burnt ? 'circuito aperto: non passa corrente' : part.kind === 'lamp' && inrush.peak > 1.5 * Math.abs(res.Is) ? `all'accensione: ${fmt.num(inrush.peak * 1000, 0)} mA` : res.cc ? 'l\'alimentatore tiene la corrente al limite' : `alimentatore: ${fmt.num(Math.abs(res.Vout), 2)} V`;
    ui.setSide(`${vText(Vr)} · ${vText(Ir)}`, side2);
    const kind = part.kind, C = app() === 'base' ? COMPONENTS[state.comp] : null, w = WIRES[wi()];
    let sub = '';
    if (kind === 'R') sub = `${fmt.num(part.T - 273.15, 0)} °C`;
    else if (kind === 'lamp') sub = `filamento ${fmt.num(part.T, 0)} K`;
    else if (kind === 'led') sub = Math.abs(res.I) > 1e-4 ? `${fmt.num(Math.abs(res.V1), 2)} V ai capi` : 'spento';
    else sub = `L = ${fmt.num(state.L * 100, 1)} cm`;
    ui.drawCircuit({ mode: state.mode, flip: state.flip, on, cc: res.cc, kind, name: C ? (kind === 'R' ? C.name : kind === 'lamp' ? 'lampadina' : 'LED') : wireName(w).split(' ⌀')[0], sub, Vout: res.Vout, Vtxt: vText(Vr), Itxt: vText(Ir), I: res.I, burnt, ideal: state.ideal, glow: kind === 'lamp' ? Math.max(0, Math.min(1, (part.T - 1000) / 1700)) : Math.min(1, Math.abs(res.I) / 0.02) });
    // l'errore dovuto agli strumenti, sui valori esatti (senza l'arrotondamento delle cifre)
    const Rx = Math.abs(res.Im) > 1e-9 ? res.Vm / res.Im : NaN;
    const errPct = isFinite(Rx) && isFinite(Rtrue) && Math.abs(Rtrue) > 1e-6 && Math.abs(res.I) > 1e-6 ? (Rx / Rtrue - 1) * 100 : NaN;
    const errSub = state.ideal ? 'strumenti ideali: nessuno' : state.mode === 'valle' ? 'l\'amperometro conta anche il voltmetro' : 'il voltmetro conta anche l\'amperometro';
    const cells = [
      { k: 'Tensione', v: vText(Vr).replace(/ (m?V)$/, ' <small>$1</small>'), s: 'la legge il voltmetro' },
      { k: 'Corrente', v: vText(Ir).replace(/ (m?A)$/, ' <small>$1</small>'), s: 'la legge l\'amperometro' },
      { k: 'Resistenza', v: `${Rtxt} <small>Ω</small>`, s: 'R = V/I, dalle due letture' },
    ];
    if (state.exp === 'first') {
      const Pmax = kind === 'R' ? 'il resistore regge 2 W' : kind === 'lamp' ? 'nominale 1,8 W (6 V · 0,3 A)' : kind === 'led' ? 'il LED regge circa 0,1 W' : `${fmt.num(P / state.L, 2)} W per metro di filo`;
      const temp = kind === 'R' ? [`${fmt.num(part.T - 273.15, 0)} <small>°C</small>`, burnt ? 'bruciato' : part.T > 560 ? 'troppo caldo: fuma' : 'del resistore']
        : kind === 'lamp' ? [`${fmt.num(part.T, 0)} <small>K</small>`, burnt ? 'il filamento si è rotto' : part.T > 1000 ? 'del filamento: è incandescente' : 'del filamento']
        : kind === 'led' ? [`${fmt.num(part.T - 273.15, 0)} <small>°C</small>`, burnt ? 'bruciato' : 'della giunzione']
        : [`${fmt.num(part.T - 273.15, 0)} <small>°C</small>`, `del filo · ${wireName(w)}`];
      cells.push(
        { k: 'Potenza', v: `${fmt.num(P, P < 1 ? 3 : 2)} <small>W</small>`, s: Pmax },
        { k: 'Temperatura', p: 2, v: temp[0], s: temp[1] },
        { k: 'Errore d\'inserzione', p: 3, v: isFinite(errPct) ? `${errPct >= 0 ? '+' : '−'}${fmt.num(Math.abs(errPct), Math.abs(errPct) < 0.01 ? 4 : Math.abs(errPct) < 1 ? 2 : 1)} <small>%</small>` : '—', s: errSub, title: 'Quanto la resistenza V/I si scosta da quella vera del componente, per colpa degli strumenti' },
      );
    } else {
      const S = (Math.PI * w.d * w.d) / 4, rho = isFinite(Rm) ? (Rm * S) / state.L : NaN;
      cells.push(
        { k: 'Il filo', v: `${fmt.num(state.L * 100, 1)} <small>cm</small>`, s: `${wireName(w)} · S = ${fmt.num(S * 1e6, 3)} mm²` },
        { k: 'Resistività', p: 2, v: isFinite(rho) ? `${fmt.num(rho * 1e6, rho < 2e-7 ? 3 : 2)} <small>Ω·mm²/m</small>` : '—', s: `ρ = R·S/L · in tabella ${fmt.num(MATERIALS[w.mat].rho * 1e6, 2)}`, title: 'La resistenza del contatto della pinza (circa 0,01 Ω) pesa di più sui tratti corti' },
        { k: 'Temperatura', p: 3, v: `${fmt.num(part.T - 273.15, 0)} <small>°C</small>`, s: 'del tratto di filo percorso' },
      );
    }
    ui.setMetrics(cells);
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000, fpsEma = 60, hudTimer = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.05);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    if (!paused) { stepSeq(dt); stepCircuit(dt); } else res = solve(part, params());
    if (pendingView) { setView(pendingView); pendingView = null; }
    // le letture degli strumenti, tre volte al secondo
    readTimer += dt;
    if (readTimer > 0.33) {
      readTimer = 0;
      shown = { V: readV(res.Vm), I: readI(res.Im) };
      rig.drawMeter(rig.volt, shown.V); rig.drawMeter(rig.amm, shown.I);
      rig.drawSupply({ V: state.on ? res.Vout : 0, I: state.on ? res.Is : 0, on: state.on, cc: res.cc, Vset: state.Vset, Ilim: state.Ilim });
      plotDirty = true;
    }
    // il componente
    if (part.kind === 'wire') rig.showWire(app(), wi(), state.L, part.T, part.burnt);
    else rig.showComponent(part.kind, { T: part.T, glow: Math.pow(Math.min(1, Math.abs(res.I) / 0.02), 0.8), burnt: part.burnt });
    const smokeK = part.kind === 'R' || part.kind === 'led' ? part.smoke : 0;
    if (!paused) rig.stepSmoke(dt, A ? A.comp : null, app() === 'base' ? smokeK : 0);
    // la corrente
    if (!paused && Math.abs(res.Is) > 1e-6) phase += Math.sign(res.Is) * 0.06 * Math.sqrt(Math.abs(res.Is) / 0.1) * dt;
    rig.setDots(state.dots && state.on && !part.burnt && Math.abs(res.Is) > 2e-5, phase);
    if (app() === 'base') tags.setText(compTag, part.kind === 'R' ? `Resistore · ${COMPONENTS[state.comp].name}` : part.kind === 'lamp' ? 'Lampadina E10 · 6 V 0,3 A' : 'LED rosso');
    stage.outlined = state.outline ? [app() === 'base' ? rig.compG : app() === 'rods' ? rig.clip : rig.bclip.g] : [];
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
  mount(true);
  shown = { V: readV(res.Vm, false), I: readI(res.Im, false) };
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, THREE, plotView, setView, part: () => part, res: () => res, shown: () => shown, records: () => records, seq: () => seq, T0, simT: () => simT };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
