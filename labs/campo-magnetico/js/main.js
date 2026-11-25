// main.js — Il campo magnetico
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { SOURCES, B_EARTH, PLATE, MU0, LOOP, COIL, WIRE, build, fieldAt, grid, sample, streamlines, lines3D, ideal } from './field.js';
import { Filings } from './filings.js';
import { Rig, NF } from './rig.js';
import { createUI, fmt } from './ui.js';

const state = {
  src: 'bar', pair: 'opp', on: true, I: 10, rev: false, nLoop: 5, nCoil: 12,
  filings: true, compasses: false, lines: false, lines3d: false, probe: false, s: 0.07,
  outline: false, labels: true, quality: 'low', plotKind: 'path',
};
const BASE = { src: 'bar', pair: 'opp', on: true, I: 10, rev: false, nLoop: 5, nCoil: 12, filings: true, compasses: false, lines: false, lines3d: false, probe: false, s: 0.07, plotKind: 'path' };
const taps = (n = 3) => Array.from({ length: n }, () => [{ wait: 0.7 }, { tap: true }]).flat();
const probeSweep = (list) => list.flatMap((s) => [{ sweep: { key: 's', to: s, dur: 0.8 } }, { wait: 1.3 }, { note: true }]);
const currents = (list, w = 1.3) => list.flatMap((i) => [{ sweep: { key: 'I', to: i, dur: 0.6 } }, { wait: w }, { note: true }]);
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
// passi: {set} · {wait} · {note} · {sweep: {key, to, dur}} · {tap} · {sprinkle} · {zero}
const PRESETS = [
  ['bar', 'Il magnete a barra', 'Si sparge la limatura e si picchietta la lastra: i granelli si magnetizzano, si girano e si attaccano in catene lungo le linee di campo, che escono dal polo nord e rientrano nel sud. Sopra i poli si rizzano', { src: 'bar' }, [{ sprinkle: true }, ...taps(3)], 'top'],
  ['compass', 'Le bussole', 'Gli aghi si dispongono lungo le linee di campo e il loro nord punta verso il polo sud del magnete. Lontano dal magnete conta anche il campo terrestre, che li gira verso il nord', { src: 'bar', filings: false, compasses: true, lines: true }, [], 'top'],
  ['space', 'Le linee nello spazio', 'Le linee di campo non stanno solo sulla lastra: escono dal polo nord in tutte le direzioni, girano attorno al magnete e rientrano nel sud. Il colore dice quanto è intenso il campo', { src: 'bar', filings: false, lines3d: true }, [], 'overview'],
  ['spacecoil', 'Il solenoide nello spazio', 'Dentro il solenoide le linee sono parallele e fitte; escono da un\'estremità, si allargano e rientrano dall\'altra, come per un magnete a barra', { src: 'coil', nCoil: 20, I: 10, filings: false, lines3d: true }, [], 'overview'],
  ['pair', 'Poli opposti, poli uguali', 'Fra un nord e un sud le linee passano da un magnete all\'altro: i magneti si attraggono. Fra due nord si respingono, e a metà strada c\'è un punto in cui il campo si annulla', { src: 'two', pair: 'opp' }, [{ sprinkle: true }, ...taps(3), { wait: 3 }, { set: { pair: 'same' } }, { sprinkle: true }, ...taps(3)], 'top'],
  ['horse', 'Il ferro di cavallo', 'Fra i poli di un magnete a U le linee di campo sono quasi parallele ed equidistanti: il campo è quasi uniforme', { src: 'horse' }, [{ sprinkle: true }, ...taps(3)], 'top'],
  ['oersted', 'L\'esperienza di Ørsted', 'Copenaghen, 1820: la corrente fa ruotare l\'ago della bussola. Attorno al filo gli aghi si dispongono in cerchio; invertendo la corrente si girano tutti', { src: 'wire', I: 0, filings: false, compasses: true }, [{ wait: 2 }, { sweep: { key: 'I', to: 15, dur: 0.4 } }, { wait: 4 }, { set: { rev: true } }, { wait: 4 }], 'top'],
  ['wirefil', 'Il campo del filo', 'Con 20 ampere la limatura si dispone in cerchi attorno al filo, più fitti vicino al filo, dove il campo è più forte. Lontano il campo è troppo debole per girarla', { src: 'wire', I: 20 }, [{ sprinkle: true }, ...taps(4)], 'top'],
  ['wire', 'Il filo: B = μ0I/2πr', 'Il teslametro, azzerato a corrente spenta per togliere il campo terrestre, misura il campo a distanze diverse dal filo: B cala come 1/r', { src: 'wire', I: 0, filings: false, probe: true, s: 0.01, plotKind: 'inv' }, [{ wait: 1 }, { zero: true }, { sweep: { key: 'I', to: 15, dur: 0.6 } }, { wait: 1 }, ...probeSweep([0.01, 0.015, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1])], 'overview'],
  ['loop', 'La spira', 'Attorno ai due punti in cui la spira attraversa la lastra le linee girano come attorno a due fili con correnti opposte; al centro sono quasi diritte', { src: 'loop', nLoop: 10, I: 15 }, [{ sprinkle: true }, ...taps(3)], 'top'],
  ['tangent', 'La bussola delle tangenti', 'La spira sta nel piano nord–sud: al centro il suo campo va verso est, quello terrestre verso nord, e la bussola si ferma all\'angolo θ con tan θ = B_spira / B_terra. Dalla pendenza della retta si ricava il campo terrestre', { src: 'loop', nLoop: 5, I: 0, filings: false, compasses: true, plotKind: 'tan' }, [{ wait: 2 }, ...currents([0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0], 3.5)], 'top'],
  ['coil', 'Il solenoide', 'Dentro il solenoide le linee di campo sono parallele: il campo è uniforme, B = μ0 n I. Fuori è debole e somiglia a quello di un magnete a barra', { src: 'coil', nCoil: 20, I: 15 }, [{ sprinkle: true }, ...taps(3)], 'top'],
  ['coilaxis', 'Lungo l\'asse del solenoide', 'La sonda scorre lungo l\'asse: dentro il campo è quasi costante, all\'estremità scende a circa metà, fuori cala in fretta', { src: 'coil', nCoil: 20, I: 5, filings: false, probe: true, s: 0, plotKind: 'path' }, probeSweep([0, 0.02, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.15]), 'overview'],
  ['coilI', 'Il campo e la corrente', 'Al centro del solenoide il campo è proporzionale alla corrente: la pendenza della retta è μ0 n, con n spire per metro', { src: 'coil', nCoil: 20, I: 0, filings: false, probe: true, s: 0, plotKind: 'I' }, currents([1, 2, 3, 4, 5, 6, 8, 10]), 'overview'],
];
const VIEWS = [['overview', 'Panoramica'], ['top', 'Dall\'alto'], ['close', 'Da vicino']];
const isMagnet = () => SOURCES[state.src].magnet;
// le bussole, posizione per posizione [x, z]; per la spira e il solenoide la prima sta al centro
function compassSpots() {
  const ring = (rx, rz, n, off = Math.PI / n) => Array.from({ length: n }, (_, i) => [rx * Math.cos(off + (2 * Math.PI * i) / n), rz * Math.sin(off + (2 * Math.PI * i) / n)]);
  if (state.src === 'bar') return ring(0.1, 0.075, 8);
  if (state.src === 'two') return ring(0.15, 0.085, 8);
  if (state.src === 'horse') return ring(0.1, 0.085, 8);
  if (state.src === 'wire') return ring(0.05, 0.05, 8);
  if (state.src === 'loop') return [[0, 0], ...ring(0.13, 0.12, 6)];
  return [[0, 0], [-0.12, 0], [-0.04, 0.075], [0.04, 0.075], [-0.04, -0.075], [0.04, -0.075]];
}
/** Lettura del teslametro, 3½ cifre con portata automatica, in millitesla. */
function readB(T, noise = true) {
  const mT = T * 1000, a = Math.abs(mT), [d, range] = a < 1.9995 ? [3, '2 mT'] : a < 19.995 ? [2, '20 mT'] : [1, '200 mT'];
  const res = 10 ** -d, x = mT + (noise ? (Math.random() + Math.random() - 1) * 0.5 * res : 0), q = Math.round(x / res) * res;
  return { txt: q.toFixed(d), range, val: q, d };
}

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.1, 2.6, 1.6], keyTarget: [0, 0, 0], shadowBox: [-1.0, 1.0, 1.0, -1.0], shadowFar: 7, fog: [6, 45] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 6;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));
  const filings = new Filings(NF);

  // ───────────────────────── il campo ─────────────────────────
  let S = null, G = null, fieldLines = null, mapImg = null, spots = [], needles = [], zero = 0, shown = readB(0, false);
  let paused = false, seq = null, pendingView = null, records = [], plotDirty = true, readTimer = 1, shakeT = 0, cfgKey = '';
  const current = () => (isMagnet() || !state.on ? 0 : state.I * (state.rev ? -1 : 1));
  const scale = () => (isMagnet() ? 1 : current());
  const tipX = () => S.path.x0 + state.s;
  const o3 = [0, 0, 0];

  /** Ricalcola tutto ciò che dipende dalla sorgente (non dalla corrente). */
  function rebuild() {
    const key = `${state.src}|${state.pair}|${state.nLoop}|${state.nCoil}`;
    const fresh = key !== cfgKey;
    if (fresh) {
      cfgKey = key;
      S = build({ src: state.src, pair: state.pair, nLoop: state.nLoop, nCoil: state.nCoil });
      G = grid(S);
      const ref = S.magnet ? 1 : 20;
      const chains = streamlines(G, { dsep: 0.0032, scale: ref, bmin: 2.5e-5, holes: S.holes });
      fieldLines = streamlines(G, { dsep: 0.013, scale: ref, bmin: 1.2e-5, holes: S.holes });
      spots = compassSpots();
      filings.setup(chains, S.holes, [], (x, z) => { sample(G, x, z, ref, o3); return Math.hypot(o3[0], o3[1], o3[2]); });
      mapImg = ui.makeMap(G, fieldLines);
      needles = spots.map(() => ({ a: Math.PI / 2, w: 0 }));
      settleNeedles();
      records = records.filter((r) => r.src === state.src);
      plotDirty = true;
    }
    rig.setSource(state.src, { nLoop: state.nLoop, nCoil: state.nCoil, rev: state.rev });
    rig.setBars(state.src === 'two' ? state.pair : state.src === 'bar' ? null : undefined);
    rig.placeCompasses(spots, state.compasses);
    rig.filings.visible = state.filings;
    filings.dirty = true;
    rig.setFieldLines(fieldLines, Math.sign(scale()) || 1, state.lines && Math.abs(scale()) > 0);
    setLines3D();
    rig.setProbe(state.probe, tipX(), S.yp);
    A = rig.anchors(state.src, tipX());
    readTimer = 1;
  }
  let A = null, lines3 = null, lines3Key = '', l3State = '';
  /** Le linee nello spazio: si calcolano solo quando servono, una volta per sorgente. */
  function setLines3D() {
    const show = state.lines3d && Math.abs(scale()) > 0;
    if (show && lines3Key !== cfgKey) { lines3 = lines3D(S); lines3Key = cfgKey; }
    rig.setLines3D(lines3, Math.sign(scale()) || 1, show);
  }
  /** Il campo orizzontale (con quello terrestre) nella posizione della bussola i. */
  function needleTarget(i) {
    const [x, z] = spots[i];
    sample(G, x, z, scale(), o3);
    const bx = o3[0], bz = o3[2] - B_EARTH;
    return { th: Math.atan2(-bz, bx), B: Math.hypot(bx, bz) };
  }
  function settleNeedles() { needles.forEach((n, i) => { n.a = needleTarget(i).th; n.w = 0; }); }
  function stepNeedles(dt) {
    needles.forEach((n, i) => {
      const t = needleTarget(i), w2 = 1.17e6 * Math.min(t.B, 3e-4), steps = Math.max(1, Math.ceil((dt * Math.sqrt(w2)) / 0.12)), h = dt / steps;
      for (let k = 0; k < steps; k++) { n.w += (-w2 * Math.sin(n.a - t.th) - 1.6 * n.w) * h; n.a += n.w * h; }
    });
  }
  /** Deviazione dell'ago i dal nord, verso est positiva (gradi). */
  const deviation = (i) => { const n = needles[i]; if (!n) return 0; const d = Math.atan2(Math.cos(n.a), Math.sin(n.a)); return (d * 180) / Math.PI; };
  /** Lettura vera (senza cifre) del teslametro: la componente lungo l'asse della sonda, con il campo terrestre, meno lo zero. */
  function probeRaw() {
    fieldAt(S, tipX(), S.yp + 0.0006, 0, current(), o3);
    const [ax, az] = S.path.axis;
    return o3[0] * ax + (o3[2] - B_EARTH) * az - zero;
  }
  const sourceAxis = (s, I) => { fieldAt(S, S.path.x0 + s, S.yp + 0.0006, 0, I, o3); return o3[0] * S.path.axis[0] + o3[2] * S.path.axis[1]; };

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); ui.refresh(); ui.sync(); rebuild(); }
      if (st.note) note();
      if (st.tap) tap();
      if (st.sprinkle) sprinkle();
      if (st.zero) zero = probeRaw() + zero;
      if (st.sweep) seq.from = state[st.sweep.key];
    }
    seq.t += dt;
    if (st.sweep) {
      const k = Math.min(1, seq.t / st.sweep.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      state[st.sweep.key] = seq.from + (st.sweep.to - seq.from) * e; ui.refresh(st.sweep.key);
      if (st.sweep.key === 's') { rig.setProbe(state.probe, tipX(), S.yp); A = rig.anchors(state.src, tipX()); } else onCurrent();
      if (k >= 1) { seq.i++; seq.started = false; }
    } else if (seq.t >= (st.wait || 0.02)) { seq.i++; seq.started = false; }
    if (seq && seq.i >= seq.list.length) seq = null;
  }
  function tap() { if (!state.filings) return; filings.tap(G, scale()); shakeT = 0.3; }
  function sprinkle() { filings.sprinkle(S.holes, []); }
  function note() {
    const r = { src: state.src, s: state.s, I: current(), B: state.probe ? shown.val : NaN, dev: needles.length ? deviation(0) : NaN };
    records.push(r); plotDirty = true;
  }
  function onCurrent() { rig.setFieldLines(fieldLines, Math.sign(scale()) || 1, state.lines && Math.abs(scale()) > 0); const l3 = `${Math.sign(scale())}`; if (l3 !== l3State) { l3State = l3; setLines3D(); } readTimer = Math.max(readTimer, 0.25); plotDirty = true; }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    probeLabel: () => (state.src === 'wire' ? 'Distanza della sonda dal filo' : state.src === 'loop' || state.src === 'coil' ? 'Sonda: distanza dal centro' : 'Posizione della sonda'),
    text: {
      I: () => `${fmt.num(state.I, 2)} A`,
      s: () => `${fmt.num(state.s * 100, 1)} cm`,
    },
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        records = []; paused = false; zero = 0; plotDirty = true;
        ui.refresh(); ui.sync(); rebuild();
        if (state.src === 'wire' && state.s < 0.01) state.s = 0.01;
        settleNeedles();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'pause': paused = !paused; break;
      case 'note': note(); break;
      case 'clear': records = []; plotDirty = true; break;
      case 'tap': seq = null; tap(); break;
      case 'sprinkle': seq = null; sprinkle(); break;
      case 'zero': zero = probeRaw() + zero; readTimer = 1; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'src': seq = null; zero = 0; if (state.src === 'wire' && state.s < 0.01) state.s = 0.01; ui.sync(); ui.refresh(); rebuild(); setView('overview'); break;
      case 'pair': case 'nLoop': case 'nCoil': seq = null; rebuild(); break;
      case 'rev': seq = null; rebuild(); onCurrent(); break;
      case 'on': case 'I': seq = null; onCurrent(); break;
      case 'filings': case 'compasses': case 'lines': case 'lines3d': ui.sync(); rebuild(); break;
      case 'probe': ui.sync(); rebuild(); plotDirty = true; break;
      case 's': if (state.src === 'wire' && state.s < 0.005) { state.s = 0.005; ui.refresh('s'); } rig.setProbe(state.probe, tipX(), S.yp); A = rig.anchors(state.src, tipX()); readTimer = 1; plotDirty = true; break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  tags.add('Lastra di plexiglas', 'floor alt', (o) => o.copy(A.plate));
  const srcTag = tags.add('Magnete', '', (o) => o.copy(A.source));
  tags.add('Alimentatore · 20 A', '', (o) => o.copy(A.supply), () => !isMagnet());
  tags.add('Teslametro', '', (o) => o.copy(A.meter), () => state.probe);
  tags.add('Sonda di Hall', 'floor', (o) => o.copy(A.probe), () => state.probe);

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
    const yp = S.yp, hw = PLATE.w / 2, hd = PLATE.d / 2;
    if (id === 'top') return fitPose(V(0, 1, 1e-4), box(-hw, yp, -hd, hw, yp, hd));
    if (id === 'close') {
      if (state.probe) { const x = tipX(); return fitPose(V(0.25, 0.9, 1).normalize(), box(x - 0.05, yp, -0.04, x + 0.07, yp + 0.02, 0.04)); }
      return fitPose(V(0.2, 0.9, 1).normalize(), box(-0.08, yp, -0.07, 0.08, yp + 0.01, 0.07));
    }
    if (isMagnet() && state.lines3d) return fitPose(V(0.25, 0.55, 1).normalize(), box(-0.3, 0, -0.22, 0.3, 0.2, 0.22));
    if (isMagnet()) return fitPose(V(0.22, 0.95, 1).normalize(), box(-hw - 0.02, 0, -hd - 0.02, state.probe ? 0.48 : hw + 0.02, 0.05, state.probe ? 0.32 : hd + 0.02));
    const top = state.src === 'wire' ? WIRE.y1 + 0.03 : state.lines3d ? yp + 0.2 : yp + 0.09;
    return fitPose(V(0.22, 0.7, 1).normalize(), box(-0.66, 0, -hd - 0.05, state.probe ? 0.48 : hw + 0.02, top, state.probe ? 0.32 : hd + 0.05));
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
    else if (k === 't') { seq = null; tap(); }
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if ((k === 'arrowleft' || k === 'arrowright') && state.probe) {
      e.preventDefault(); seq = null;
      state.s = Math.max(state.src === 'wire' ? 0.005 : 0, Math.min(0.18, Math.round((state.s + (k === 'arrowright' ? 0.005 : -0.005)) * 1000) / 1000));
      ui.refresh('s'); rig.setProbe(true, tipX(), S.yp); A = rig.anchors(state.src, tipX()); readTimer = 1;
    } else if ((k === 'arrowup' || k === 'arrowdown') && !isMagnet()) {
      e.preventDefault(); seq = null;
      state.I = Math.max(0, Math.min(20, Math.round((state.I + (k === 'arrowup' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.5)) * 100) / 100));
      ui.refresh('I'); onCurrent();
    } else if (k >= '1' && k <= '3') setView(VIEWS[Number(k) - 1][0]);
  });

  // ───────────────────────── grafici ─────────────────────────
  const pathCache = { key: '', xs: [], ys: [] };
  function drawPlot() {
    plotDirty = false;
    const recs = records.filter((r) => r.src === state.src), I = current();
    const ringPt = (x, y) => ({ x, y, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' });
    if (state.plotKind === 'tan') {
      const per = sourceAxis(0, 1);            // campo della spira al centro per ampere
      const pts = recs.filter((r) => isFinite(r.dev)).map((r) => ({ x: r.I, y: Math.tan((r.dev * Math.PI) / 180), color: '#e8452c', r: 6 }));
      const X1 = Math.max(1, ...pts.map((p) => p.x), Math.abs(I)) * 1.1, Y1 = Math.max(1, ...pts.map((p) => p.y), (per * X1) / B_EARTH) * 1.05;
      const cur = needles.length ? [ringPt(I, Math.tan((deviation(0) * Math.PI) / 180))] : [];
      ui.drawPlot({
        series: [{ x: [0, X1], y: [0, (per * X1) / B_EARTH], color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: pts.concat(cur), X0: 0, X1, Y0: 0, Y1, xLabel: 'corrente I (A)', yLabel: 'tan θ della bussola al centro',
        legend: [['annotati', '#e8452c'], ['con B_terra = 20 µT', '#9aa1ab']],
      });
      return;
    }
    if (!state.probe) {
      ui.drawPlot({ series: [], points: [], X0: 0, X1: 1, Y0: 0, Y1: 1, xLabel: '', yLabel: 'accendi il teslametro per misurare il campo' });
      return;
    }
    if (state.plotKind === 'I') {
      const per = sourceAxis(state.s, 1) * 1000;
      const pts = recs.filter((r) => isFinite(r.B)).map((r) => ({ x: r.I, y: r.B, color: '#e8452c', r: 6 }));
      const X1 = Math.max(2, ...pts.map((p) => Math.abs(p.x)), Math.abs(I)) * 1.1, Y1 = Math.max(0.1, ...pts.map((p) => p.y), per * X1, shown.val) * 1.1;
      ui.drawPlot({
        series: [{ x: [0, X1], y: [0, per * X1], color: '#9aa1ab', width: 2, dash: [7, 6] }],
        points: pts.concat([ringPt(I, shown.val)]), X0: 0, X1, Y0: Math.min(0, ...pts.map((p) => p.y)), Y1, xLabel: 'corrente I (A)', yLabel: 'B alla sonda (mT)',
        legend: [['annotati', '#e8452c'], [`teoria a ${fmt.num(state.s * 100, 1)} cm`, '#9aa1ab']],
      });
      return;
    }
    // il campo lungo la retta della sonda (calcolato), per la corrente attuale
    const key = `${cfgKey}|${I}|${state.src}`;
    if (pathCache.key !== key) {
      pathCache.key = key; pathCache.xs = []; pathCache.ys = [];
      const s0 = state.src === 'wire' ? 0.004 : 0;
      for (let i = 0; i <= 160; i++) { const s = s0 + ((0.18 - s0) * i) / 160; pathCache.xs.push(s); pathCache.ys.push(sourceAxis(s, I) * 1000); }
    }
    const pts = recs.filter((r) => isFinite(r.B));
    if (state.plotKind === 'inv') {
      const xs = pathCache.xs.map((s) => 1 / s), ys = pathCache.ys;
      const X1 = Math.min(250, Math.max(20, ...pts.map((r) => 1 / r.s), 1 / state.s) * 1.15), Y1 = Math.max(0.05, ...pts.map((r) => r.B), shown.val, ideal.wire(Math.abs(I), 1 / X1) * 1000) * 1.12;
      ui.drawPlot({
        series: [{ x: [0, X1], y: [0, ideal.wire(Math.abs(I), 1) * X1 * 1000], color: '#9aa1ab', width: 2, dash: [7, 6] }, { x: xs, y: ys, color: '#2c67dc', width: 2, alpha: 0.6 }],
        points: pts.map((r) => ({ x: 1 / r.s, y: r.B, color: '#e8452c', r: 6 })).concat([ringPt(1 / state.s, shown.val)]),
        X0: 0, X1, Y0: Math.min(0, ...pts.map((r) => r.B)), Y1, xLabel: '1/r (1/m)', yLabel: 'B alla sonda (mT)',
        legend: [['annotati', '#e8452c'], ['μ0I/2πr', '#9aa1ab'], ['filo lungo 49 cm', '#2c67dc']],
      });
      return;
    }
    const xs = pathCache.xs.map((s) => s * 100), ys = pathCache.ys;
    const finite = ys.filter((y) => isFinite(y)), Y0 = Math.min(0, ...finite, ...pts.map((r) => r.B)) * 1.1, Y1 = Math.max(...finite.map((y) => Math.min(y, 80)), ...pts.map((r) => r.B), shown.val, 0.01) * 1.12;
    ui.drawPlot({
      series: [{ x: xs, y: ys, color: '#2c67dc', width: 2.4 }],
      points: pts.map((r) => ({ x: r.s * 100, y: r.B, color: '#e8452c', r: 6 })).concat([ringPt(state.s * 100, shown.val)]),
      X0: 0, X1: 18, Y0, Y1, xLabel: state.src === 'wire' ? 'distanza dal filo (cm)' : 'posizione della sonda (cm)', yLabel: `B ${S.path.label} (mT)`,
      legend: [['annotati', '#e8452c'], ['calcolato', '#2c67dc']],
    });
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    ui.setPause(paused ? 'Riprendi' : 'Pausa');
    const I = current(), name = SOURCES[state.src].name;
    tags.setText(srcTag, state.src === 'two' ? `Due magneti · poli ${state.pair === 'opp' ? 'opposti' : 'uguali'}` : state.src === 'loop' ? `Spira · ${state.nLoop} ${state.nLoop === 1 ? 'spira' : 'spire'}` : state.src === 'coil' ? `Solenoide · ${state.nCoil} spire` : name);
    ui.setStatus(paused ? 'in pausa' : filings.anim ? 'picchietto' : isMagnet() ? 'magnete' : !state.on || state.I === 0 ? 'corrente spenta' : 'corrente', !paused && (!!filings.anim || Math.abs(I) > 0));
    const dev0 = needles.length && state.compasses ? deviation(0) : NaN;
    if (state.probe) {
      ui.setClock(`${shown.txt.replace('.', ',').replace('-', '−')} <small>mT</small>`);
      ui.setSide(`sonda a ${fmt.num(state.s * 100, 1)} cm · ${S.path.label}`, zero ? `azzerato (${fmt.num(zero * 1e6, 1)} µT tolti)` : 'non azzerato: conta anche il campo terrestre');
    } else if (state.compasses && (state.src === 'loop' || state.src === 'coil')) {
      ui.setClock(`${fmt.num(Math.abs(dev0), 1)}° <small>${dev0 >= 0 ? 'verso est' : 'verso ovest'}</small>`);
      ui.setSide('la bussola al centro', `tan θ = ${fmt.num(Math.tan((dev0 * Math.PI) / 180), 3)}`);
    } else {
      ui.setClock(`<small>${name.toLowerCase()}</small>`);
      ui.setSide(state.filings ? 'T: picchietta la lastra' : '', 'accendi il teslametro per misurare B');
    }
    ui.drawMap({ map: mapImg, src: state.src, pair: state.pair, I, nCoil: state.nCoil, compasses: state.compasses ? spots.map(([x, z], i) => ({ x, z, a: needles[i].a })) : [], probe: { on: state.probe, x: tipX(), x0: S.path.x0, axis: S.path.axis } });
    const earth = { k: 'Campo terrestre', p: 3, v: `${fmt.num(B_EARTH * 1e6, 0)} <small>µT</small>`, s: 'orizzontale, verso il nord' };
    const probeCell = { k: 'Campo alla sonda', v: state.probe ? `${shown.txt.replace('.', ',').replace('-', '−')} <small>mT</small>` : '—', s: state.probe ? `teslametro, ${S.path.label}` : 'teslametro spento' };
    const cells = [];
    if (isMagnet()) {
      fieldAt(S, state.src === 'horse' ? -0.002 : state.src === 'two' ? 0.0 : 0.05, S.yp + 0.0005, state.src === 'horse' ? 0 : 0, 0, o3);
      const Bp = Math.hypot(o3[0], o3[1], o3[2]);
      cells.push(probeCell,
        { k: 'Posizione', v: state.probe ? `${fmt.num(state.s * 100, 1)} <small>cm</small>` : '—', s: state.src === 'horse' ? 'dall\'interno della U, lungo l\'asse' : 'dal centro, lungo l\'asse' },
        { k: state.src === 'bar' ? 'Sopra il polo nord' : state.src === 'two' ? 'Al centro' : 'Fra i poli', v: `${fmt.num(Bp * 1000, 1)} <small>mT</small>`, s: 'sulla lastra, calcolato' },
        { k: 'I magneti', p: 2, v: 'ferrite', s: 'Br ≈ 0,38 T · 10 × 2,2 × 1,2 cm' }, earth);
    } else {
      const Ia = Math.abs(I);
      cells.push({ k: 'Corrente', v: `${fmt.num(I, 2).replace('-', '−')} <small>A</small>`, s: state.on ? (state.rev ? 'invertita' : 'dall\'alimentatore') : 'alimentatore spento' }, probeCell);
      if (state.src === 'wire') cells.push({ k: 'μ0 I / 2πr', v: `${fmt.num(ideal.wire(Ia, Math.max(0.002, state.s)) * 1000, 3)} <small>mT</small>`, s: `a r = ${fmt.num(state.s * 100, 1)} cm, filo infinito` });
      else if (state.src === 'loop') cells.push({ k: 'Al centro: μ0 N I / 2R', v: `${fmt.num(ideal.loopCenter(Ia, state.nLoop) * 1000, 3)} <small>mT</small>`, s: `N = ${state.nLoop}, R = ${fmt.num(LOOP.R * 100, 0)} cm` });
      else cells.push({ k: 'μ0 n I', v: `${fmt.num(ideal.coil(Ia, state.nCoil) * 1000, 3)} <small>mT</small>`, s: `n = ${fmt.num(state.nCoil / COIL.len, 0)} spire/m, solenoide infinito` });
      cells.push({ k: 'Bussola al centro', p: 2, v: isFinite(dev0) && state.src !== 'wire' ? `${fmt.num(dev0, 1)}°` : '—', s: isFinite(dev0) && state.src !== 'wire' ? `tan θ = ${fmt.num(Math.tan((dev0 * Math.PI) / 180), 3)}` : state.src === 'wire' ? 'le bussole girano attorno al filo' : 'accendi le bussole' }, earth);
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
    if (!paused) { stepSeq(dt); stepNeedles(dt); }
    if (pendingView) { setView(pendingView); pendingView = null; }
    // la limatura e la scossa della lastra
    if (!paused && filings.step(dt) && state.filings) filings.write(rig.filings, G, scale());
    else if (filings.dirty && state.filings) filings.write(rig.filings, G, scale());
    if (shakeT > 0 && !paused) { shakeT = Math.max(0, shakeT - dt); rig.shake(0.0007 * Math.sin(shakeT * 160) * (shakeT / 0.3)); } else if (shakeT <= 0) rig.shake(0);
    rig.compasses.forEach((c, i) => { if (needles[i]) c.needle.rotation.y = needles[i].a; });
    // il teslametro, tre volte al secondo
    readTimer += dt;
    if (readTimer > 0.33) {
      readTimer = 0;
      if (state.probe) { shown = readB(probeRaw()); rig.drawMeter(rig.meter, { txt: shown.txt, unit: 'mT', range: shown.range }); }
      const I = current();
      rig.drawSupply({ V: Math.abs(I) * 0.09, I: Math.abs(I), on: state.on && !isMagnet(), Iset: state.I });
      plotDirty = true;
    }
    stage.outlined = state.outline ? [...(state.compasses ? rig.compasses.filter((c) => c.g.visible).map((c) => c.needle) : []), ...(state.probe ? [rig.probeBody] : [])] : [];
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud(); if (plotDirty) drawPlot(); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  rebuild();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, THREE, plotView, setView, filings, records: () => records, seq: () => seq, needles: () => needles, S: () => S, G: () => G, deviation, MU0 };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
