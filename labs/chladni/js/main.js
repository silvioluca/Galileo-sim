// main.js — Le figure di Chladni
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { SHAPES, MATERIALS, plateConsts, outline, inside, edgePoint } from './plate.js';
import { Field, G0 } from './field.js';
import { Sand, KIND, ST } from './sand.js';
import { Rig } from './rig.js';
import { createUI, fmt } from './ui.js';

const MAX_GRAINS = 48000;
const F_MIN = 20;
const MOUNT_OFF = { square: [0.43, 0.27], rect: [0.45, 0.29], circle: [0.43, 0.22], guitar: [-0.45, 0.2] };
const GRAIN_D = { sand: 0.00055, salt: 0.00045, lyco: 0.0003, mix: 0.00055 };
const BOW_GAMMA = 9;                     // accelerazione massima (in g) che dà l'archetto

const state = {
  shape: 'square', mat: 'al', h: 1, size: 24,
  exc: 'shaker', f: 100, amp: 0.4, sweep: false, mount: 'center',
  bowPos: 0, finger: true, fingerPos: 0.125, pressure: 0.6,
  powder: 'sand', grains: 24000,
  vib: false, map: false, lines: false, sound: false,
  outline: false, labels: true, quality: 'low', plotKind: 'resp',
};
const BASE = { shape: 'square', mat: 'al', h: 1, size: 24, exc: 'shaker', amp: 0.4, sweep: false, mount: 'center', bowPos: 0, finger: true, fingerPos: 0.125, pressure: 0.6, powder: 'sand', vib: false, map: false, lines: false, plotKind: 'resp' };
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
// passi: {fresh} sabbia nuova · {res: n} n-esima risonanza del vibratore · {on} accende · {wait: s} · {set: {...}}
const PRESETS = [
  ['first', 'La prima figura', 'La lamina quadrata d\'alluminio alla prima frequenza a cui risponde, scossa dal centro', {}, [{ fresh: true }, { res: 1 }, { on: true }], 'top'],
  ['finer', 'Sempre più fitte', 'Salendo di frequenza le figure si fanno più fitte: ogni sette secondi la risonanza successiva', {}, [{ fresh: true }, { res: 2 }, { on: true }, { wait: 7 }, { res: 4 }, { wait: 7 }, { res: 7 }, { wait: 7 }, { res: 11 }], 'top'],
  ['rings', 'La lamina rotonda', 'Scossa dal centro, la lamina rotonda risponde solo con modi a simmetria circolare: la sabbia disegna cerchi concentrici', { shape: 'circle' }, [{ fresh: true }, { res: 2 }, { on: true }, { wait: 7 }, { res: 3 }], 'top'],
  ['offc', 'Il foro decentrato', 'Fissata fuori centro, la stessa lamina risponde a quasi tutti i suoi modi: le figure perdono la simmetria del quadrato', { mount: 'off' }, [{ fresh: true }, { res: 6 }, { on: true }], 'top'],
  ['bow', 'L\'archetto di Chladni', 'Lastra di vetro stretta al centro, il dito su uno spigolo, l\'archetto a metà di un lato: la sabbia corre sulle due diagonali (Chladni, 1787)', { mat: 'glass', h: 2.5, exc: 'bow', bowPos: 0, finger: true, fingerPos: 0.125, pressure: 0.85 }, [{ fresh: true }, { on: true }, { wait: 7 }, { set: { bowPos: 0.125, fingerPos: 0 } }, { fresh: true }], 'top'],
  ['law', 'La legge di Chladni', 'Lamina rotonda d\'ottone: con m diametri e n cerchi nodali la frequenza cresce come (m + 2n)². Il dito e l\'archetto scelgono il numero di diametri', { shape: 'circle', mat: 'brass', exc: 'bow', bowPos: 0, finger: true, fingerPos: 0.125, pressure: 0.8, plotKind: 'modes', powder: 'salt' }, [{ fresh: true }, { on: true }, { wait: 7 }, { set: { fingerPos: 1 / 12, pressure: 0.6 } }, { fresh: true }, { wait: 7 }, { set: { fingerPos: 1 / 16, pressure: 0.45 } }, { fresh: true }], 'top'],
  ['faraday', 'Sabbia e licopodio', 'Faraday, 1831: la sabbia corre alle linee nodali, la polvere di licopodio ai ventri, portata dalle correnti d\'aria', { powder: 'mix' }, [{ fresh: true }, { res: 3 }, { on: true }], 'close'],
  ['thick', 'Spessore doppio', 'La stessa figura su una lamina spessa il doppio: la frequenza raddoppia, perché f ∝ h/L²', {}, [{ fresh: true }, { res: 3 }, { on: true }, { wait: 7 }, { set: { h: 2 } }, { res: 3 }, { fresh: true }], 'top'],
  ['guitar', 'La tavola di una chitarra', 'Una lamina a forma di chitarra: i liutai guardano queste figure per accordare le tavole armoniche prima di incollarle', { shape: 'guitar', size: 36 }, [{ fresh: true }, { res: 4 }, { on: true }], 'top'],
];
const VIEWS = [['overview', 'Panoramica'], ['top', 'Dall\'alto'], ['close', 'Da vicino'], ['side', 'Lo strumento']];

// ───────────────────────── suono ─────────────────────────
let ac = null, osc = null, gainN = null;
function audioInit() {
  try {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); gainN = ac.createGain(); gainN.gain.value = 0; gainN.connect(ac.destination); osc = ac.createOscillator(); osc.type = 'sine'; osc.connect(gainN); osc.start(); }
    if (ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
}
function audioSet(f, level) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  osc.frequency.setTargetAtTime(Math.max(20, Math.min(18000, f)), t, 0.012);
  gainN.gain.setTargetAtTime(level, t, 0.06);
}

// ───────────────────────── i modi, in un thread a parte ─────────────────────────
const cache = new Map();
let worker = null, reqId = 0;
const waiting = new Map();
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); if (e.data.error) w.reject(new Error(e.data.error)); else w.resolve(e.data.pack); };
  worker.onerror = () => { worker = null; };
} catch { worker = null; }
async function getModes(shapeId, nu, clamp) {
  const key = `${shapeId}|${nu}|${clamp}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    if (worker) {
      try { return await new Promise((resolve, reject) => { const id = ++reqId; waiting.set(id, { resolve, reject }); worker.postMessage({ id, shapeId, nu, clamp }); }); } catch (err) { console.warn('[chladni] worker:', err); }
    }
    const { solveModes, packModes } = await import('./plate.js');
    return packModes(solveModes(shapeId, nu, { clamp, keep: 0.34 }));
  })();
  cache.set(key, p);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return p;
}

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.4, 2.6, 1.6], keyTarget: [0, 0.2, 0], shadowBox: [-0.7, 0.7, 0.7, -0.7], shadowFar: 6, fog: [6, 50] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 6;
  const rig = new Rig(MAX_GRAINS);
  scene.add(rig.group);
  const field = new Field(145);
  const sand = new Sand(MAX_GRAINS);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── stato derivato ─────────────────────────
  let pack = null, wantKey = '', loading = false;
  let genOn = false, bowing = false, paused = false, seq = null, pendingView = null;
  let phiP = null, phiB = null, phiD = null, resonances = [], bowSel = null, respCurve = null;
  let coefRe = null, coefIm = null, gammaScale = 0, gammaMax = 0, fieldDirty = true, lastSynthF = -1, lastFieldT = 0;
  let Ggrid = null, GX = null, GY = null, Rgrid = null, Rmax = 1, figDirty = true, plotDirty = true;
  let strobe = 0, bowT = 0, fpsEma = 60, hudTimer = 0, figTimer = 0, visAmp = 0, sweepDir = 1;
  const S = () => SHAPES[state.shape];
  const half = () => state.size / 200;          // semilunghezza (m): lato, diametro o lunghezza diviso due
  const consts = () => plateConsts(state.mat, state.h / 1000);
  const mountPt = () => (state.mount === 'off' ? MOUNT_OFF[state.shape] : [0, 0]);
  const insideFn = (x, y) => inside(state.shape, x, y);
  const plateMass = () => { const c = consts(); return c.rhoH * field.areaRed * half() ** 2; };

  /** La lamina in 3D: forma, misure, materiale (senza toccare i modi). */
  function buildPlate() {
    rig.setPlate(state.shape, half(), state.h / 1000, state.mat, mountPt());
    rig.setExcitation(state.exc);
    placeTools();
    figDirty = true;
  }
  /** I modi giusti per forma, materiale (ν) ed eccitazione (morsetto o no). */
  async function ensureModes() {
    const nu = MATERIALS[state.mat].nu, clamp = state.exc === 'bow', key = `${state.shape}|${nu}|${clamp}`;
    wantKey = key;
    if (pack && `${pack.shapeId}|${pack.nu}|${pack.clamp}` === key) { applyConsts(); return; }
    loading = true;
    const p = await getModes(state.shape, nu, clamp);
    if (wantKey !== key) return;
    pack = p; loading = false;
    field.setPack(pack);
    applyConsts();
  }
  /** Costanti fisiche e tutto ciò che ne dipende (frequenze, accoppiamenti, curva di risposta). */
  function applyConsts() {
    if (!pack) return;
    const c = consts();
    field.setPlate({ D: c.D, rhoH: c.rhoH, a: half(), Q: c.Q });
    const m = mountPt();
    phiP = field.modesAt(m[0], m[1]);
    // le risonanze a cui risponde il vibratore (i modi degeneri contano una volta)
    resonances = [];
    for (const cl of field.clusters) {
      const k0 = cl[0]; if (!field.omega[k0]) continue;
      const c2 = cl.reduce((s, k) => s + (phiP[k] / pack.peak[k]) ** 2, 0);
      if (Math.sqrt(c2) > 0.04) resonances.push({ f: field.freq(k0), k: k0, cl });
    }
    updateBow();
    respCurve = null;
    if (state.f > fMaxSlider()) state.f = fMaxSlider();
    fieldDirty = true; figDirty = true; plotDirty = true;
    ui.refresh('f');
  }
  const fMaxSlider = () => Math.min(15000, field.fMax || 8000);

  function placeTools() {
    if (state.exc !== 'bow') return;
    rig.setStandHeight();
    rig.placeBow(edgePoint(state.shape, state.bowPos), bowStroke());
  }
  const bowStroke = () => (bowing ? 0.13 + 0.12 * Math.sin(bowT * 1.9) : 0.12);
  function updateBow() {
    if (!pack || state.exc !== 'bow') { bowSel = null; return; }
    const eb = edgePoint(state.shape, state.bowPos), ed = edgePoint(state.shape, state.fingerPos);
    phiB = field.modesAt(eb.x, eb.y);
    phiD = state.finger ? field.modesAt(ed.x, ed.y) : null;
    bowSel = field.bowChoice(phiB, phiD, state.pressure, Math.min(9000, fMaxSlider()));
    fieldDirty = true; figDirty = true; plotDirty = true;
  }

  // ───────────────────────── il campo ─────────────────────────
  function updateField() {
    if (!pack) return;
    if (state.exc === 'shaker') {
      const F = 0.06 * plateMass() * G0 * state.amp;
      ({ re: coefRe, im: coefIm } = field.driveCoeffs(state.f, F, phiP, coefRe || undefined, coefIm || undefined));
      field.synth(coefRe, coefIm);
      const w = 2 * Math.PI * state.f;
      gammaScale = (w * w) / G0;
    } else {
      const b = bowSel && bowSel.best;
      if (!b) { gammaScale = 0; field.mag.fill(0); field.re.fill(0); field.im.fill(0); field.maxMag = 0; } else {
        field.synth(b.coef, null);
        gammaScale = BOW_GAMMA * (0.55 + 0.45 * state.pressure) / Math.max(1e-12, field.maxMag);
      }
    }
    gammaMax = gammaScale * field.maxMag;
    // Γ e il suo gradiente sulla griglia (coordinate ridotte)
    const n = field.mag.length, gx = field.gx, gy = field.gy, h = field.h;
    if (!Ggrid || Ggrid.length !== n) { Ggrid = new Float32Array(n); GX = new Float32Array(n); GY = new Float32Array(n); Rgrid = new Float32Array(n); }
    for (let q = 0; q < n; q++) Ggrid[q] = field.mag[q] * gammaScale;
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const q = j * gx + i, il = i > 0 ? q - 1 : q, ir = i < gx - 1 ? q + 1 : q, jd = j > 0 ? q - gx : q, ju = j < gy - 1 ? q + gx : q;
      GX[q] = (Ggrid[ir] - Ggrid[il]) / (((ir - il) || 1) * h);
      GY[q] = (Ggrid[ju] - Ggrid[jd]) / ((((ju - jd) / gx) || 1) * h);
    }
    field.realPart(Rgrid);
    Rmax = 1e-30; for (let q = 0; q < n; q++) if (field.inside[q]) Rmax = Math.max(Rmax, Math.abs(Rgrid[q]));
    lastSynthF = state.f; fieldDirty = false; figDirty = true;
  }
  const gammaAt = (x, y, out) => {
    const fx = (x + 1) / field.h, fy = (y - field.y0) / field.h;
    const i = Math.max(0, Math.min(field.gx - 2, Math.floor(fx))), j = Math.max(0, Math.min(field.gy - 2, Math.floor(fy)));
    const u = fx - i, v = fy - j, o = j * field.gx + i, gx = field.gx;
    const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
    out[0] = Ggrid[o] * w00 + Ggrid[o + 1] * w10 + Ggrid[o + gx] * w01 + Ggrid[o + gx + 1] * w11;
    out[1] = GX[o] * w00 + GX[o + 1] * w10 + GX[o + gx] * w01 + GX[o + gx + 1] * w11;
    out[2] = GY[o] * w00 + GY[o + 1] * w10 + GY[o + gx] * w01 + GY[o + gx + 1] * w11;
    return out;
  };
  const running = () => !paused && !!pack && (state.exc === 'shaker' ? genOn && state.amp > 0 : bowing && !!(bowSel && bowSel.best));

  // ───────────────────────── sabbia ─────────────────────────
  function sprinkle(count = state.grains) {
    const d = GRAIN_D[state.powder];
    if (state.powder === 'mix') {
      sand.sprinkle(Math.round(count * 0.75), KIND.sand, insideFn, d);
      sand.sprinkle(Math.round(count * 0.25), KIND.lyco, insideFn, GRAIN_D.lyco);
      rig.colorByKind(sand, 'sand');
    } else {
      sand.sprinkle(count, state.powder === 'lyco' ? KIND.lyco : KIND.sand, insideFn, d);
      rig.setGrainLook(state.powder);
    }
  }
  function freshSand() { sand.clear(); sprinkle(); }

  // ───────────────────────── frequenza ─────────────────────────
  function gotoRes(n) {
    if (!resonances.length) return;
    const r = resonances[Math.max(0, Math.min(resonances.length - 1, n - 1))];
    state.f = Math.max(F_MIN, Math.min(fMaxSlider(), r.f)); state.sweep = false;
    fieldDirty = true; ui.refresh();
  }
  function stepRes(dir) {
    if (!resonances.length) return;
    const f = state.f;
    let pick = null;
    if (dir > 0) pick = resonances.find((r) => r.f > f * 1.002 && r.f <= fMaxSlider());
    else for (const r of resonances) if (r.f < f * 0.998) pick = r;
    if (pick) { state.f = pick.f; state.sweep = false; fieldDirty = true; ui.refresh(); }
  }
  function nearestRes(f) {
    let best = null; for (const r of resonances) if (!best || Math.abs(Math.log(r.f / f)) < Math.abs(Math.log(best.f / f))) best = r;
    return best;
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq || loading || !pack) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { const reb = 'h' in st.set || 'size' in st.set || 'shape' in st.set || 'mat' in st.set; Object.assign(state, st.set); ui.refresh(); ui.sync(); if (reb) { buildPlate(); ensureModes(); } else { updateBow(); placeTools(); } }
      if (st.fresh) freshSand();
      if (st.res) gotoRes(st.res);
      if (st.on) { if (state.exc === 'shaker') genOn = true; else bowing = true; if (state.sound) audioInit(); }
    }
    seq.t += dt;
    if (seq.t >= (st.wait || 0.05) && !loading) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS, fRange: () => [F_MIN, fMaxSlider()],
    text: {
      f: () => `${fmt.hz(state.f, true)} <small>· ${fmt.note(state.f)}</small>`,
      amp: () => `${Math.round(state.amp * 100)} %`,
      h: () => `${fmt.num(state.h, 1)} mm`,
      size: () => `${state.size} cm`,
      bowPos: () => edgeName(state.bowPos),
      fingerPos: () => (state.finger ? edgeName(state.fingerPos) : 'tolto'),
      pressure: () => (state.pressure > 0.66 ? 'pesante <small>· note basse</small>' : state.pressure > 0.33 ? 'medio' : 'leggero <small>· note alte</small>'),
      grains: () => `${fmt.num(state.grains / 1000, 0)} mila granelli`,
    },
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        genOn = false; bowing = false; paused = false;
        ui.refresh(); ui.sync(); buildPlate(); ensureModes();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'go':
        seq = null;
        if (state.exc === 'shaker') genOn = !genOn; else bowing = !bowing;
        if (state.sound) audioInit();
        paused = false;
        break;
      case 'pause': paused = !paused; break;
      case 'prev': seq = null; stepRes(-1); break;
      case 'next': seq = null; stepRes(1); break;
      case 'sprinkle': sprinkle(Math.round(state.grains / 2)); break;
      case 'clear': sand.clear(); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'shape': seq = null; buildPlate(); freshSand(); ensureModes(); ui.refresh(); setView('overview'); break;
      case 'mat': seq = null; buildPlate(); ensureModes(); break;
      case 'h': case 'size': seq = null; buildPlate(); applyConsts(); break;
      case 'exc': seq = null; genOn = false; bowing = false; buildPlate(); ensureModes(); ui.sync(); setView('overview'); break;
      case 'mount': seq = null; rig.setMount(mountPt()); applyConsts(); break;
      case 'f': seq = null; state.sweep = false; ui.refresh('sweep'); fieldDirty = true; break;
      case 'amp': fieldDirty = true; respCurve = null; plotDirty = true; break;
      case 'sweep': seq = null; if (state.sweep) genOn = true; break;
      case 'bowPos': case 'fingerPos': case 'pressure': case 'finger': updateBow(); rig.setExcitation(state.exc); placeTools(); ui.refresh('fingerPos'); break;
      case 'powder': rig.setGrainLook(state.powder === 'mix' ? 'sand' : state.powder); freshSand(); break;
      case 'grains': break;
      case 'sound': if (state.sound) audioInit(); else audioSet(state.f, 0); break;
      case 'map': rig.mapMesh.visible = state.map; figDirty = true; break;
      case 'lines': figDirty = true; break;
      case 'figClick': {
        // dal riquadro: archetto o dito sul punto del bordo più vicino
        if (state.exc !== 'bow') break;
        const u = nearestEdgeU(arg.p[0], arg.p[1]);
        if (arg.right) { state.finger = true; state.fingerPos = u; } else state.bowPos = u;
        seq = null; updateBow(); rig.setExcitation(state.exc); placeTools(); ui.refresh();
        break;
      }
      default: break;
    }
  });
  function edgeName(u) {
    const e = edgePoint(state.shape, u), deg = ((Math.atan2(e.y, e.x) * 180) / Math.PI + 360) % 360;
    if (state.shape === 'square' || state.shape === 'rect') {
      const corner = Math.abs(Math.abs(e.x) - 1) < 0.02 && Math.abs(Math.abs(e.y) - S().gmax) < 0.02;
      const mid = Math.abs(e.x) < 0.02 || Math.abs(e.y) < 0.02;
      return corner ? 'su uno spigolo' : mid ? 'a metà di un lato' : `a ${fmt.num(deg, 0)}°`;
    }
    return `a ${fmt.num(deg, 0)}°`;
  }
  function nearestEdgeU(x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 720; i++) { const u = i / 720, e = edgePoint(state.shape, u), d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = u; } }
    return best;
  }

  // ───────────────────────── etichette ─────────────────────────
  const wp = new THREE.Vector3();
  tags.add('Lamina', '', (o) => o.set(-half() * 0.98, rig.plateY + 0.004, -half() * S().g(-0.98) * 0.4), () => true);
  tags.add('Vibratore', '', (o) => o.copy(rig.shaker.position).add(wp.set(0.075, 0.07, 0)), () => state.exc === 'shaker');
  tags.add('Generatore di funzioni', '', (o) => o.copy(rig.gen.position).add(wp.set(0, 0.105, 0)), () => state.exc === 'shaker');
  tags.add('Archetto', '', (o) => { const e = edgePoint(state.shape, state.bowPos); return o.set(half() * e.x + e.nx * 0.08, rig.plateY + 0.16, -half() * e.y - e.ny * 0.08); }, () => state.exc === 'bow');
  tags.add('Morsetto', 'floor', (o) => o.set(0, rig.plateY + 0.03, 0), () => state.exc === 'bow');

  // ───────────────────────── inquadrature ─────────────────────────
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const DEG = Math.PI / 180;
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
  function plateBox(y) { const a = half(), b = a * S().gmax; return [V(-a, y, -b), V(a, y, b), V(-a, y, b), V(a, y, -b)]; }
  function viewPose(id) {
    const a = half(), y = rig.plateY;
    switch (id) {
      case 'top': return fitPose(V(0, 1, 1e-4).normalize(), plateBox(y));
      case 'close': return { pos: [a * 0.6, y + a * 0.75, a * 1.95], target: [a * 0.15, y, a * 0.2] };
      case 'side': {
        if (state.exc === 'shaker') {
          // di fronte al pannello del generatore (che è girato verso chi guarda)
          rig.gen.updateMatrixWorld(true);
          return { pos: rig.gen.localToWorld(V(0.06, 0.2, 0.5)).toArray(), target: rig.gen.localToWorld(V(0.02, 0.05, 0.1)).toArray() };
        }
        const e = edgePoint(state.shape, state.bowPos), P = V(a * e.x, y, -a * e.y), n = V(e.nx, 0, -e.ny);
        const t = V(-n.z, 0, n.x);
        // da fuori e dall'alto, di tre quarti: l'archetto, il bordo che sfrega e la sabbia vicina
        const pos = P.clone().addScaledVector(n, 0.3).addScaledVector(t, 0.16).add(V(0, 0.24, 0));
        return { pos: pos.toArray(), target: P.clone().addScaledVector(n, -0.03).toArray() };
      }
      default: {
        const pts = plateBox(y).concat(plateBox(0));
        if (state.exc === 'shaker') {
          const bb = new THREE.Box3().setFromObject(rig.gen);
          for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push(V(x, y, z));
        }
        else { pts.push(V(0, 0, 0)); const e = edgePoint(state.shape, state.bowPos); pts.push(V(a * e.x + e.nx * 0.1, y + 0.3, -a * e.y - e.ny * 0.1), V(a * e.x, y - 0.3, -a * e.y)); }
        return fitPose(V(0.32, 0.62, 1).normalize(), pts);
      }
    }
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }
  function onResize() {
    // il centro della prospettiva cade al centro dello spazio libero fra i pannelli: dall'alto la telecamera sta
    // proprio sopra la lamina
    const w = window.innerWidth, hh = window.innerHeight, r = freeRect();
    stage.resize(w, hh, Math.round((r.x0 + r.x1) / 2 - w / 2), Math.round(hh / 2 - (r.y0 + r.y1) / 2));
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); document.getElementById('go').click(); }
    else if (k === 'p') document.getElementById('pause').click();
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k === 's') document.getElementById('sprinkle').click();
    else if (k === '[') { seq = null; stepRes(-1); }
    else if (k === ']') { seq = null; stepRes(1); }
    else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); seq = null; state.sweep = false; state.f = Math.max(F_MIN, Math.min(fMaxSlider(), state.f * (k === 'arrowright' ? 1.001 : 1 / 1.001))); fieldDirty = true; ui.refresh(); }
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  // ───────────────────────── figura prevista, linee nodali, mappa ─────────────────────────
  let figImg = null, segs = [];
  function contour() {
    // marching squares sullo zero del campo in fase
    const gx = field.gx, gy = field.gy, h = field.h, x0 = -1, y0 = field.y0, R = Rgrid, out = [];
    const tol = Rmax * 1e-3;
    for (let j = 0; j < gy - 1; j++) for (let i = 0; i < gx - 1; i++) {
      const q = j * gx + i;
      if (!(field.inside[q] || field.inside[q + 1] || field.inside[q + gx] || field.inside[q + gx + 1])) continue;
      const v = [R[q], R[q + 1], R[q + gx + 1], R[q + gx]];
      const P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      if (Math.max(...v.map(Math.abs)) < tol) continue;
      const cut = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < 0) !== (b < 0)) { const t = a / (a - b); cut.push([x0 + (P[e][0] + (P[(e + 1) % 4][0] - P[e][0]) * t) * h, y0 + (P[e][1] + (P[(e + 1) % 4][1] - P[e][1]) * t) * h]); }
      }
      const keep = (p0, p1) => { const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; if (insideFn(mx, my)) out.push([p0[0], p0[1], p1[0], p1[1]]); };
      if (cut.length === 2) keep(cut[0], cut[1]);
      else if (cut.length === 4) { const c = (v[0] + v[1] + v[2] + v[3]) / 4; if ((c < 0) === (v[0] < 0)) { keep(cut[0], cut[3]); keep(cut[1], cut[2]); } else { keep(cut[0], cut[1]); keep(cut[2], cut[3]); } }
    }
    return out;
  }
  function refreshFigure() {
    if (!pack || !Ggrid) return;
    const gx = field.gx, gy = field.gy;
    if (!figImg || figImg.width !== gx || figImg.height !== gy) figImg = new ImageData(gx, gy);
    const d = figImg.data, on = gammaMax > 1, mm = field.maxMag || 1;
    for (let q = 0; q < gx * gy; q++) {
      const o = q * 4;
      if (!field.inside[q]) { d[o + 3] = 0; continue; }
      const A = Math.sqrt(field.mag[q] / mm), G = Ggrid[q];
      let r = 26 + 40 * A, g = 28 + 30 * A, b = 32 + 18 * A;
      // dove Γ < 1 la sabbia si ferma; dove Γ è quasi nullo si ammucchia
      if (on && G < 1) { const s = 0.3 * Math.sqrt(1 - G) + 0.7 * Math.max(0, 1 - G / 0.3); r += (236 - r) * s; g += (228 - g) * s; b += (206 - b) * s; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    segs = contour();
    if (state.lines) rig.setLines(segs); else rig.setLines([]);
    if (state.map) {
      rig.paintMap((x, y) => {
        const v = field.sample(Rgrid, x, y) / Rmax, s = Math.min(1, Math.abs(v)) ** 0.7;
        return v > 0 ? [0.08 + 0.85 * s, 0.08 + 0.2 * s, 0.09 + 0.08 * s] : [0.08 + 0.08 * s, 0.08 + 0.3 * s, 0.09 + 0.85 * s];
      });
    }
    const out = state.exc === 'shaker' ? !genOn : !bowing;
    const note = !pack ? '' : gammaMax <= 1 ? (state.exc === 'bow' && !(bowSel && bowSel.best) ? 'l\'archetto qui non fa suonare la lamina' : 'Γ < 1 ovunque: la sabbia non si muove') : out ? (state.exc === 'shaker' ? 'acceso, la sabbia andrebbe sulle zone chiare' : 'con l\'archetto, la sabbia andrebbe sulle zone chiare') : '';
    ui.drawFigure({
      img: figImg, gx, gy, x0: -1, y0: field.y0, h: field.h, gmax: S().gmax, outline: outline(state.shape, 240),
      lines: state.lines ? segs : null,
      mount: state.exc === 'shaker' ? mountPt() : null, clamp: state.exc === 'bow',
      bow: state.exc === 'bow' ? edgePoint(state.shape, state.bowPos) : null,
      finger: state.exc === 'bow' && state.finger ? edgePoint(state.shape, state.fingerPos) : null,
      note,
    });
    figDirty = false;
  }

  // ───────────────────────── grafico ─────────────────────────
  function computeResp() {
    if (!pack) return null;
    const F = 0.06 * plateMass() * G0 * Math.max(state.amp, 0.01), fm = fMaxSlider(), Q = field.Q;
    const fs = [];
    for (let i = 0; i <= 500; i++) fs.push(F_MIN * (fm / F_MIN) ** (i / 500));
    for (const r of resonances) for (const k of [-3, -1.5, -0.7, -0.3, 0, 0.3, 0.7, 1.5, 3]) { const f = r.f * (1 + k / (2 * Q)); if (f > F_MIN && f < fm) fs.push(f); }
    fs.sort((a, b) => a - b);
    const re = new Float64Array(field.K), im = new Float64Array(field.K), y = [];
    for (const f of fs) { field.driveCoeffs(f, F, phiP, re, im); y.push(field.rmsG(f, re, im)); }
    return { x: fs, y, amp: state.amp };
  }
  function drawPlot() {
    plotDirty = false;
    if (!pack) return;
    if (state.plotKind === 'resp') {
      if (state.exc === 'shaker') {
        if (!respCurve || respCurve.amp !== state.amp) respCurve = computeResp();
        const ys = respCurve.y, Y1 = Math.max(10, ...ys) * 1.6, Y0 = Math.max(1e-4, Math.min(...ys) * 0.7);
        const cur = field.rmsG(state.f, coefRe || new Float64Array(field.K), coefIm || new Float64Array(field.K));
        ui.drawPlot({
          series: [{ x: respCurve.x, y: ys, color: '#2c67dc', width: 2.2 }],
          hlines: [{ y: 1, color: '#9aa1ab', dash: [6, 6], text: 'Γ = 1: oltre la sabbia salta' }],
          vlines: [{ x: state.f, color: 'rgba(232,69,44,0.6)', width: 2 }],
          points: [{ x: state.f, y: Math.max(Y0, cur), color: '#e8452c', r: 7 }],
          X0: F_MIN, X1: fMaxSlider(), Y0, Y1, xLog: true, yLog: true,
          xLabel: 'frequenza (Hz)', yLabel: 'accelerazione efficace della lamina (g)',
        });
      } else {
        const L = bowSel ? bowSel.list : [], best = bowSel && bowSel.best;
        const stems = L.map((c) => ({ x: c.f, y: Math.max(0.001, c.score), color: c === best ? '#e8452c' : c.coupling > 0.2 ? '#7d8691' : '#c9ced5', w: c === best ? 4 : 2.5 }));
        const fm = Math.min(9000, fMaxSlider());
        ui.drawPlot({ stems, X0: Math.max(F_MIN, (L[0]?.f || 50) * 0.7), X1: fm, Y0: 0, Y1: Math.max(0.2, ...stems.map((s) => s.y)) * 1.15, xLog: true, xLabel: 'frequenza (Hz)', yLabel: 'quanto l\'archetto fa suonare ogni modo', legend: [['suona', '#e8452c'], ['possibili', '#7d8691']] });
      }
    } else {
      const fm = Math.min(12000, fMaxSlider());
      if (state.shape === 'circle') {
        const pts = [], used = new Set(), col = ['#15181c', '#e8452c', '#2c67dc', '#0c9d8f', '#b07a1f', '#7a3fc0'];
        for (const cl of field.clusters) {
          const k = cl[0]; if (!field.omega[k]) continue; const f = field.freq(k); if (f > fm) break;
          const m = pack.mn[2 * k], n = pack.mn[2 * k + 1]; if (m < 0) continue;
          const key = `${m},${n}`; if (used.has(key)) continue; used.add(key);
          const x = m + 2 * n; if (x < 1) continue;
          pts.push({ x, y: f, color: col[Math.min(n, col.length - 1)], r: 6 });
        }
        // legge di Chladni: f = C (m + 2n)², C dai punti con m + 2n ≥ 3
        let sw = 0, sc = 0; for (const p of pts) if (p.x >= 3) { sw += p.x ** 4; sc += p.y * p.x * p.x; }
        const C = sw ? sc / sw : 1, xs = [], ys = [];
        for (let x = 1; x <= 16; x += 0.25) { xs.push(x); ys.push(C * x * x); }
        const best = state.exc === 'bow' && bowSel && bowSel.best ? bowSel.best : null;
        if (best) { const k = best.cl[0]; pts.push({ x: pack.mn[2 * k] + 2 * pack.mn[2 * k + 1], y: best.f, color: 'rgba(0,0,0,0)', r: 11, ring: '#e8452c' }); }
        const X1 = Math.max(6, ...pts.map((p) => p.x)) + 1;
        ui.drawPlot({ series: [{ x: xs, y: ys, color: '#9aa1ab', width: 2, dash: [8, 6] }], points: pts, X0: 1, X1, Y0: Math.max(F_MIN, Math.min(...pts.map((p) => p.y)) * 0.6), Y1: Math.max(...pts.map((p) => p.y)) * 1.5, xLog: true, yLog: true, xLabel: 'm + 2n (diametri + 2 × cerchi)', yLabel: 'frequenza (Hz)', legend: [['n = 0', col[0]], ['n = 1', col[1]], ['n = 2', col[2]], ['C·(m+2n)²', '#9aa1ab']] });
      } else {
        const pts = [];
        let idx = 0, cur = null;
        const near = state.exc === 'shaker' ? nearestRes(state.f) : null;
        for (const cl of field.clusters) {
          const k = cl[0]; if (!field.omega[k]) continue; const f = field.freq(k); if (f > fm) break;
          for (let r = 0; r < cl.length; r++) {
            idx++;
            const resp = state.exc === 'shaker' && resonances.some((q) => q.k === k);
            pts.push({ x: idx, y: f, color: resp ? '#e8452c' : '#9aa1ab', r: resp ? 5.5 : 4 });
            if ((near && near.k === k && Math.abs(Math.log(state.f / f)) < 2 / field.Q) || (bowSel?.best && bowSel.best.cl[0] === k)) cur = { x: idx, y: f };
          }
        }
        const c = consts(), A = field.areaRed * half() ** 2, slope = (2 * Math.sqrt(c.D / c.rhoH)) / A;
        const N = pts.length || 1;
        if (cur) pts.push({ x: cur.x, y: cur.y, color: 'rgba(0,0,0,0)', r: 10, ring: '#15181c' });
        ui.drawPlot({ series: [{ x: [0, N + 1], y: [0, slope * (N + 1)], color: '#2c67dc', width: 2, dash: [8, 6] }], points: pts, X0: 0, X1: N + 1, Y0: 0, Y1: Math.max(...pts.map((p) => p.y)) * 1.08, xLabel: 'numero del modo', yLabel: 'frequenza (Hz)', legend: state.exc === 'shaker' ? [['col vibratore', '#e8452c'], ['altri modi', '#9aa1ab'], ['Weyl: f ∝ n', '#2c67dc']] : [['modi', '#9aa1ab'], ['Weyl: f ∝ n', '#2c67dc']] });
      }
    }
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    const sh = state.exc === 'shaker', c = consts(), a = half();
    const fNow = sh ? state.f : (bowSel && bowSel.best ? bowSel.best.f : 0);
    const run = running();
    ui.setStatus(loading ? 'calcolo…' : paused ? 'in pausa' : sh ? (genOn ? (state.sweep ? 'spazzolata' : gammaMax > 1 ? 'vibra' : 'acceso') : 'spento') : (bowing ? (bowSel && bowSel.best ? 'suona' : 'muta') : 'fermo'), run);
    ui.setGo(sh ? (genOn ? 'Spegni' : 'Accendi') : (bowing ? 'Ferma' : 'Suona'), sh ? genOn : bowing);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', true);
    ui.setClock(fNow ? fmt.hz(fNow, true) : '—');
    const near = sh ? nearestRes(state.f) : null;
    let side1 = '', side2 = '';
    if (!pack) { side1 = 'calcolo i modi della lamina'; side2 = ''; }
    else if (sh) {
      const dw = near ? (state.f - near.f) / (near.f / field.Q) : Infinity;
      side1 = near && Math.abs(dw) < 0.6 ? `in risonanza · modo a ${fmt.hz(near.f)}` : near ? `risonanza più vicina a ${fmt.hz(near.f)}` : '';
      side2 = `${fmt.note(state.f)} · Γ max ${fmt.num(gammaMax, gammaMax < 10 ? 1 : 0)} g`;
    } else {
      const b = bowSel && bowSel.best;
      side1 = b ? `suona il modo a ${fmt.hz(b.f)}` : 'qui l\'archetto non trova un modo';
      side2 = b ? `${fmt.note(b.f)}${state.shape === 'circle' ? ` · ${modeName(b.cl[0])}` : ''}` : 'sposta l\'archetto o il dito';
    }
    ui.setSide(side1, side2);
    // onda di flessione: k⁴ = ω² ρh / D
    const w = 2 * Math.PI * (fNow || state.f), kf = Math.pow((w * w * c.rhoH) / c.D, 0.25), lam = (2 * Math.PI) / kf, cph = w / kf;
    const onPlate = sand.onPlate || 0, total = sand.n || 1;
    const lineFrac = onPlate ? sandOnLines() : 0;
    const massG = c.rhoH * field.areaRed * a * a * 1000;
    ui.setMetrics([
      { k: 'Frequenza', v: fNow ? fmt.hz(fNow, true) : '—', s: fNow ? fmt.note(fNow) : (sh ? '' : 'l\'archetto è fermo') },
      { k: 'Modo', v: modeTitle(sh, near), s: modeSub(sh, near), title: 'Dal centro il vibratore eccita solo i modi che lì non hanno un nodo' },
      run
        ? { k: 'Accelerazione', v: `${fmt.num(gammaMax, gammaMax < 10 ? 1 : 0)} <small>g</small>`, s: gammaMax > 1 ? 'la sabbia salta dove supera 1 g' : 'sotto 1 g la sabbia resta ferma', title: 'Il massimo sulla lamina dell\'accelerazione verticale, in unità di g' }
        : { k: 'Accelerazione', v: '0 <small>g</small>', s: pack && gammaMax ? `${sh ? 'acceso' : 'con l\'archetto'}: ${fmt.num(gammaMax, gammaMax < 10 ? 1 : 0)} g` : 'la lamina è ferma', title: 'Il massimo sulla lamina dell\'accelerazione verticale, in unità di g' },
      { k: 'Onda di flessione', p: 2, v: `${fmt.num(lam * 100, lam < 0.1 ? 1 : 0)} <small>cm</small>`, s: `λ · velocità ${fmt.num(cph, 0)} m/s, cresce con √f`, title: 'Le onde di flessione sono dispersive: λ = 2π (D/ρhω²)^¼' },
      { k: 'Sabbia', p: 2, v: run ? `${Math.round(lineFrac * 100)} <small>% sulle linee</small>` : '<small>ferma</small>', title: 'La parte della sabbia che sta dove la lamina accelera meno di un decimo del massimo', s: `${fmt.num(onPlate / 1000, 1)} mila sulla lamina · ${Math.round((sand.fallen / total) * 100)} % caduta` },
      { k: 'Lamina', p: 3, v: `${fmt.num(state.h, 1)} <small>mm</small>`, s: `${MATERIALS[state.mat].name.toLowerCase()} · ${state.size} cm · ${fmt.num(massG, 0)} g` },
    ]);
  }
  function modeName(k) { const m = pack.mn[2 * k], n = pack.mn[2 * k + 1]; return m < 0 ? '' : `${m} diametri, ${n} cerch${n === 1 ? 'io' : 'i'}`; }
  function modeIndex(k) { let i = 0; for (const cl of field.clusters) { if (!field.omega[cl[0]]) continue; i++; if (cl.includes(k)) return i; } return 0; }
  function modeTitle(sh, near) {
    if (!pack) return '—';
    if (sh) { if (!near) return '—'; const inRes = Math.abs(state.f - near.f) < (near.f / field.Q) * 0.6; return inRes ? `n° ${modeIndex(near.k)}` : '—'; }
    return bowSel && bowSel.best ? `n° ${modeIndex(bowSel.best.cl[0])}` : '—';
  }
  function modeSub(sh, near) {
    if (!pack) return '';
    const k = sh ? near?.k : bowSel?.best?.cl[0];
    if (k === undefined) return '';
    if (sh && Math.abs(state.f - near.f) >= (near.f / field.Q) * 0.6) return `fuori risonanza · ${resonances.length} risonanze col vibratore`;
    if (state.shape === 'circle') return modeName(k);
    return sh ? `${resonances.length} modi rispondono al vibratore` : 'scelto da archetto e dito';
  }
  function sandOnLines() {
    let still = 0, n = 0;
    const out = [0, 0, 0];
    for (let i = 0; i < sand.n; i += 7) {
      if (sand.st[i] !== ST.plate) continue; n++;
      if (sand.kind[i] !== KIND.sand) continue;
      if (!Ggrid || gammaAt(sand.x[i], sand.y[i], out)[0] <= Math.max(1, 0.1 * gammaMax) || !running()) still++;
    }
    return n ? still / n : 0;
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  const dispFn = (x, y) => visAmp * (field.sample(Rgrid, x, y) / Rmax) * Math.cos(strobe);
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.05);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    stepSeq(dt);
    if (pendingView && !loading) { setView(pendingView); pendingView = null; }
    // spazzolata: sale da sola e rallenta sulle risonanze
    if (state.sweep && genOn && !paused && pack && state.exc === 'shaker') {
      const near = nearestRes(state.f);
      const dist = near ? Math.abs(Math.log(state.f / near.f)) * field.Q : 10;
      const rate = 0.035 * Math.min(1, Math.max(0.035, dist / 3));
      state.f *= Math.exp(rate * dt * sweepDir);
      if (state.f > fMaxSlider()) { state.f = fMaxSlider(); sweepDir = -1; }
      if (state.f < 40) { state.f = 40; sweepDir = 1; }
      fieldDirty = true; ui.refresh('f');
    }
    if (pack && (fieldDirty || (state.exc === 'shaker' && Math.abs(state.f - lastSynthF) > 1e-6))) { updateField(); plotDirty = true; }
    const run = running();
    if (bowing && !paused) bowT += dt;
    if (state.exc === 'bow') placeTools();
    // sabbia
    if (pack && Ggrid) {
      const om = 2 * Math.PI * (state.exc === 'shaker' ? state.f : (bowSel && bowSel.best ? bowSel.best.f : 100));
      sand.step(paused ? 0 : dt, { gamma: gammaAt, a: half(), inside: insideFn, plateY: rig.plateY, run, omega: om });
      sand.stack(0.0011 / half(), S().gmax);
    }
    // vibrazione mostrata (stroboscopio)
    const targetVis = state.vib && run ? Math.min(1, gammaMax / 4) * 0.14 * half() : 0;
    visAmp += (targetVis - visAmp) * Math.min(1, dt * 4);
    if (!paused) strobe += dt * 2 * Math.PI * 0.7;
    const showDisp = visAmp > 1e-5 && Rgrid;
    rig.deform(showDisp ? dispFn : null);
    rig.setShaft(showDisp && state.exc === 'shaker' ? dispFn(...mountPt()) : 0);
    rig.updateGrains(sand, showDisp ? dispFn : null);
    rig.lines.visible = state.lines;
    // suono
    if (state.sound && ac) {
      let lvl = 0, f = state.f;
      if (!paused && state.exc === 'shaker' && genOn) lvl = Math.min(0.28, 0.02 + 0.07 * Math.log10(1 + gammaMax)) * Math.min(1, state.amp * 2.5);
      if (!paused && state.exc === 'bow' && bowing && bowSel && bowSel.best) { f = bowSel.best.f * (1 + 0.002 * Math.sin(bowT * 31)); lvl = 0.16 * (0.7 + 0.3 * Math.abs(Math.cos(bowT * 1.9))); }
      audioSet(f, lvl);
    }
    stage.outlined = state.outline ? [rig.top, rig.side] : [];
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt; figTimer += dt;
    if (figTimer > 0.15 && figDirty) { figTimer = 0; refreshFigure(); }
    if (hudTimer > 0.12) {
      hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud();
      if (plotDirty) drawPlot();
      const dk = `${state.exc === 'shaker' && genOn}|${state.f.toFixed(1)}|${state.amp.toFixed(2)}`;
      if (dk !== lastDisp) { lastDisp = dk; rig.drawDisplay({ f: state.f, amp: state.amp, on: state.exc === 'shaker' && genOn, note: fmt.note(state.f) }); }
    }
  }
  let lastDisp = '';

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  buildPlate();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  await ensureModes();
  gotoRes(1);
  freshSand();
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, field, sand, THREE, plotView, setView, running, get pack() { return pack; }, get resonances() { return resonances; }, get bowSel() { return bowSel; }, get gammaMax() { return gammaMax; }, gen: (v) => { genOn = v; }, bow: (v) => { bowing = v; }, seq: () => seq, loading: () => loading };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
