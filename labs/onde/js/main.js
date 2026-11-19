// main.js — Le onde stazionarie
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { G, STRINGS, ENDS, END_CORR, BETA, soundSpeed, modeFreq, Wave1D, countLoops, interp } from './waves.js';
import { Rig, TABLE, STR_Y, PULLEY, HANG_Y, TUBE_Y, TUBE_X, NS, BED_N, GRAINS } from './rig.js';
import { createUI, fmt } from './ui.js';

const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('');
const VIS_GAIN = 600;                                          // spostamenti dell'aria ingranditi per vederli

const state = {
  mode: 'string', L: 1.2, mass: 0.2, str: 'cotton', fS: 20, AS: 0.4,
  Lt: 1.0, ends: 'cc', temp: 20, fT: 150, AT: 1, particles: true, powder: true, grain: 'cork',
  look: 'eye', dstrobe: 0.4, travel: false, marks: true, sound: false,
  slow: 1, ambient: 0.6, outline: false, labels: true, quality: 'low', plotKind: 'shape',
};
const BASE = { mode: 'string', L: 1.2, mass: 0.2, str: 'cotton', fS: 20, AS: 0.4, Lt: 1.0, ends: 'cc', temp: 20, fT: 150, AT: 1, particles: true, powder: true, grain: 'cork', look: 'eye', dstrobe: 0.4, travel: false, marks: true, slow: 1, ambient: 0.6, plotKind: 'shape' };
const GEOM = new Set(['mode', 'L', 'Lt', 'ends']);
const SPEED = new Set(['mass', 'str', 'temp']);

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const settle = (n, w = 2.5) => [{ tune: n }, { wait: w }, { note: true }];
const melde = (n) => { const T = STRINGS.cotton.mu * ((2 * 1.2 * 60) / n) ** 2; return Math.round((T / G) * 1000) / 1000; };
const PRESETS = [
  ['modes', 'I modi della corda', 'La corda di 120 cm tesa da 200 g, alle frequenze f₁, 2f₁ … 5f₁: uno, due, tre, quattro, cinque ventri', { mode: 'string', plotKind: 'shape' }, [{ gen: true }, ...[1, 2, 3, 4, 5].flatMap((n) => settle(n))], 'front'],
  ['melde', 'Tensione e ventri (Melde)', 'A 60 Hz fissi, masse da 264, 117, 66 e 42 g: la tensione cala e i ventri passano da 2 a 5; v = λ·f = √(T/μ)', { mode: 'string', fS: 60, plotKind: 'law' }, [{ gen: true }, ...[2, 3, 4, 5].flatMap((n) => [{ set: { mass: melde(n) } }, { wait: 3 }, { note: true }])], 'overview'],
  ['density', 'Una corda quattro volte più pesante', 'Stessa tensione e stessa frequenza: con la corda di 2 g/m al posto di quella di 0,5 g/m la velocità si dimezza e i ventri raddoppiano', { mode: 'string', str: 'cotton', fS: 52.2, plotKind: 'shape' }, [{ gen: true }, { wait: 3 }, { note: true }, { set: { str: 'cord' } }, { wait: 3.5 }, { note: true }], 'front'],
  ['beats', 'Vicino alla risonanza', 'Il vibratore parte a 2,5 Hz da 2f₁, al rallentatore: la corda batte, l\'ampiezza cresce e cala più volte prima di assestarsi', { mode: 'string', fS: 54.7, slow: 0.1, plotKind: 'time' }, [{ gen: true }, { wait: 15 }], 'front'],
  ['strobe', 'Lo stroboscopio', 'Il terzo modo illuminato da lampi appena più lenti: la corda sembra oscillare piano, e si vedono le due onde che corrono in versi opposti', { mode: 'string', look: 'strobe', dstrobe: 0.4, travel: true, ambient: 0.25, plotKind: 'shape' }, [{ gen: true }, { tune: 3 }, { wait: 10 }], 'front'],
  ['sweep', 'La curva di risonanza', 'La frequenza sale piano da 10 a 120 Hz (il tempo scorre più in fretta): l\'ampiezza ha un picco a ogni multiplo di f₁', { mode: 'string', plotKind: 'resp' }, [{ sweep: true }], 'overview'],
  ['kundt', 'Il tubo di Kundt', 'Tubo chiuso lungo 120 cm al terzo modo: nei ventri la polvere di sughero si increspa in creste sottili, nei nodi resta liscia; due nodi distano mezza lunghezza d\'onda', { mode: 'tube', ends: 'cc', Lt: 1.2, powder: true, grain: 'cork', particles: false, plotKind: 'shape' }, [{ gen: true }, { tune: 3 }, { wait: 7 }, { note: true }], 'near'],
  ['odd', 'Chiuso da una parte', 'Tubo di 80 cm chiuso da un estremo e aperto dall\'altro: le risonanze sono solo le armoniche dispari, f₁, 3f₁, 5f₁, 7f₁', { mode: 'tube', ends: 'co', Lt: 0.8, plotKind: 'resp' }, [{ sweep: true }], 'overview'],
  ['speed', 'La velocità del suono', 'Tubi chiusi di 60, 90, 120 e 150 cm al secondo modo: f è proporzionale a 1/λ e la pendenza è la velocità del suono', { mode: 'tube', ends: 'cc', plotKind: 'law' }, [{ gen: true }, ...[0.6, 0.9, 1.2, 1.5].flatMap((Lt) => [{ set: { Lt } }, { tune: 2 }, { wait: 1.2 }, { note: true }])], 'overview'],
];
const VIEWS = [['overview', 'Panoramica'], ['front', 'Di fronte'], ['near', 'Da vicino'], ['end', 'L\'altro capo']];

// ───────────────────────── suono del generatore ─────────────────────────
let ac = null, osc = null, gainN = null;
function audioInit() {
  try {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); gainN = ac.createGain(); gainN.gain.value = 0; gainN.connect(ac.destination); osc = ac.createOscillator(); osc.connect(gainN); osc.start(); }
    if (ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
}
function audioSet(f, level, type) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  if (osc.type !== type) osc.type = type;
  osc.frequency.setTargetAtTime(Math.max(20, f), t, 0.015);
  gainN.gain.setTargetAtTime(level, t, 0.05);
}

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.2, 3.6, 2.4], keyTarget: [0, 0.8, 0], shadowBox: [-1.4, 1.4, 1.2, -0.9], shadowFar: 8, fog: [10, 60] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── stato ─────────────────────────
  let W = null, genOn = false, paused = false, tRun = 0, seq = null, pendingView = null, view = 'overview';
  let records = [], recId = 0, colorI = 0, sweep = null, sweeps = [], series = [], lastSample = -1;
  let plotAt = 0, metricsAt = 0, fpsEma = 60, hudTimer = 0, steadyCache = null, respCache = null, pnorm = 1e-9, flashSeen = 0, placeSig = '', fRefreshAt = 0;
  // polvere: spessore relativo del letto e creste (0 liscio … 1 piene) lungo il tubo
  const dust = new Float64Array(BED_N + 1).fill(1), ridge = new Float64Array(BED_N + 1), flux = new Float64Array(BED_N);
  let bedDirty = true, bedVer = 0, bedAcc = 0, bedDrawAt = 0, grainT = 0;
  const agit = new Float32Array(BED_N + 1);
  const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const level = () => { dust.fill(1); ridge.fill(0); bedDirty = true; bedVer++; };
  const ys = new Float64Array(NS + 1), amps = new Float64Array(NS + 1), wR = new Float64Array(NS + 1), wL = new Float64Array(NS + 1);
  const isS = () => state.mode === 'string';
  const f = () => (isS() ? state.fS : state.fT);
  const setF = (v) => { const [a, b] = fRange(); v = Math.min(b, Math.max(a, v)); if (isS()) state.fS = Math.round(v * 100) / 100; else state.fT = Math.round(v * 10) / 10; };
  const A = () => (isS() ? state.AS * 1e-3 : state.AT * 1e-6);
  const Lvis = () => (isS() ? state.L : state.Lt);
  const speed = () => (isS() ? Math.sqrt((state.mass * G) / STRINGS[state.str].mu) : soundSpeed(state.temp));
  const fn = (n) => modeFreq(isS() ? 'string' : 'tube', n, speed(), Lvis(), state.ends);
  const harm = (n) => (!isS() && state.ends === 'co' ? 2 * n - 1 : n);
  const fRange = () => (isS() ? [2, 200] : [20, 2000]);
  const unit = () => (isS() ? 1e3 : 1e6);                      // mm per la corda, μm per l'aria
  const unitName = () => (isS() ? 'mm' : 'μm');

  /** Simulazione nuova per la geometria corrente (la forma si conserva quando si cambia solo un parametro). */
  function build(fresh) {
    const L = Lvis();
    if (isS()) {
      const o = { L, v: speed(), beta: BETA.string, N: Math.max(80, Math.min(160, Math.round(L / 0.01))), left: 'disp', right: 'fixed', ext0: 0, ext1: 0 };
      if (W && !fresh && W.kind === 'string') W.configure(o); else { W = new Wave1D(o); W.kind = 'string'; }
      rig.setString(state.str); rig.setMelde(L, state.mass);
    } else {
      const E = ENDS[state.ends];
      const o = { L, v: speed(), beta: BETA.tube, N: Math.max(60, Math.min(180, Math.round(L / 0.0085))), left: E.left, right: E.right, ext0: E.left === 'press' ? END_CORR : 0, ext1: E.right === 'free' ? END_CORR : 0 };
      if (W && !fresh && W.kind === 'tube' && W.left === o.left && W.right === o.right) W.configure(o); else { W = new Wave1D(o); W.kind = 'tube'; }
      rig.setTube(L, state.ends);
      rig.buildBed(L, state.grain); level();
    }
    rig.setMode(state.mode);
    steadyCache = null; respCache = null;
    notes();
  }
  function reset() {
    genOn = false; sweep = null; W.reset(); level(); tRun = 0; series = []; lastSample = -1; paused = false;
  }
  const ringing = () => W.ampMax() > A() * 0.02;
  const moving = () => genOn || ringing() || !!seq || !!sweep;
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }
  function toggleGen() { audioInit(); sweep = null; genOn = !genOn; }

  // ───────────────────────── teoria a regime ─────────────────────────
  /** Soluzione a regime alla frequenza corrente: per le onde progressive e i profili del grafico. */
  function steady() {
    const k = `${W.N}|${W.v}|${W.L}|${f()}|${A()}|${W.left}|${W.right}`;
    if (steadyCache && steadyCache.k === k) return steadyCache;
    const { Yr, Yi } = W.steady(f(), A());
    // scomposizione Y = R + Lw con R' = −iκR, Lw' = iκLw: R = (Y − Y'/(iκ))/2
    const w = 2 * Math.PI * f(), kr2 = w * w, ki2 = -2 * W.beta * w, mod = Math.hypot(kr2, ki2) / (W.v * W.v), ang = Math.atan2(ki2, kr2) / 2;
    const kRe = Math.sqrt(mod) * Math.cos(ang), kIm = Math.sqrt(mod) * Math.sin(ang);
    const n = W.N + 1, Rr = new Float64Array(n), Ri = new Float64Array(n), Lr = new Float64Array(n), Li = new Float64Array(n), dA = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), h = (b - a) * W.dx;
      const dr = (Yr[b] - Yr[a]) / h, di = (Yi[b] - Yi[a]) / h;
      // Y'/(iκ) = (dr + i·di)/(i·(kRe + i·kIm)) = (dr + i·di)/(−kIm + i·kRe)
      const den = kIm * kIm + kRe * kRe, qr = (dr * -kIm + di * kRe) / den, qi = (di * -kIm - dr * kRe) / den;
      Rr[i] = (Yr[i] - qr) / 2; Ri[i] = (Yi[i] - qi) / 2; Lr[i] = (Yr[i] + qr) / 2; Li[i] = (Yi[i] + qi) / 2;
      dA[i] = Math.hypot(dr, di);
    }
    steadyCache = { k, Yr, Yi, Rr, Ri, Lr, Li, dA };
    return steadyCache;
  }
  /** Curva di risonanza teorica (ampiezza massima a regime) nell'intervallo della scansione. */
  function response() {
    const [fa, fb] = sweepRange();
    const k = `${W.N}|${W.v}|${W.L}|${A()}|${W.left}|${W.right}|${fa}|${fb}`;
    if (respCache && respCache.k === k) return respCache;
    const x = [], y = [], n = 360;
    for (let i = 0; i <= n; i++) { const fr = fa + ((fb - fa) * i) / n; x.push(fr); y.push(W.steadyMax(fr) * unit()); }
    respCache = { k, x, y };
    return respCache;
  }
  const peakAmp = (n) => W.steadyMax(fn(n), A());
  function nearestMode() {
    let best = 1, d = Infinity;
    for (let n = 1; n <= 40; n++) { const dd = Math.abs(fn(n) - f()); if (dd < d) { d = dd; best = n; } if (fn(n) > f() * 2) break; }
    return best;
  }
  /** Da poco sotto f₁ a poco sopra il quarto modo. */
  function sweepRange() {
    const [a, b] = fRange();
    return [Math.max(a, Math.round(0.4 * fn(1))), Math.min(b, Math.round(fn(4) * 1.12))];
  }
  function startSweep() {
    audioInit();
    const [fa, fb] = sweepRange();
    const rate = isS() ? 0.5 : 30, dur = (fb - fa) / rate, k = Math.min(isS() ? 16 : 3, Math.max(1, dur / (isS() ? 12 : 14)));
    W.reset(); setF(fa); genOn = true;
    sweep = { fa, fb, rate, k, pts: { x: [], y: [] } };
    sweeps.push(sweep.pts); if (sweeps.length > 3) sweeps.shift();
    state.plotKind = 'resp'; ui.sync(); ui.refresh('f');
  }

  // ───────────────────────── misure ─────────────────────────
  function profile() {
    // ampiezze nei punti della corda visibile
    const L = Lvis(), x0 = W.ext0 || 0;
    for (let j = 0; j <= NS; j++) { const x = x0 + (L * j) / NS; amps[j] = interp(W.x, W.e2, x); amps[j] = Math.sqrt(2 * Math.max(0, amps[j])); }
    return amps;
  }
  function note() {
    const a = profile(), n = isS() ? countLoops(Array.from(a)) : nearestMode(), fr = f(), am = W.ampMax();
    const res = am >= 0.6 * peakAmp(isS() ? Math.max(1, n) : n);
    const base = { id: ++recId, color: COLORS[colorI++ % COLORS.length], mode: state.mode, f: fr, res, amp: am };
    if (isS()) {
      const S = STRINGS[state.str], T = state.mass * G;
      records.push({ ...base, n, L: state.L, m: state.mass, str: state.str, vth: Math.sqrt(T / S.mu), x: Math.sqrt(T / S.mu), y: n ? (2 * state.L * fr) / n : null });
    } else {
      const E = ENDS[state.ends], h = harm(n), Le = state.Lt + (E.right === 'free' ? END_CORR : 0) + (E.left === 'press' ? END_CORR : 0);
      const lam = state.ends === 'co' ? (4 * Le) / h : (2 * Le) / h;
      records.push({ ...base, n: h, L: state.Lt, ends: state.ends, temp: state.temp, cth: soundSpeed(state.temp), x: 1 / lam, y: fr, c: fr * lam });
    }
    if (records.length > 40) records.splice(0, records.length - 40);
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { const g = Object.keys(st.set).some((k) => GEOM.has(k)); Object.assign(state, st.set); if (g) build(false); else applySpeed(); ui.refresh(); ui.sync(); }
      if (st.gen) { audioInit(); genOn = true; }
      if (st.tune) { setF(fn(st.tune)); ui.refresh('f'); }
      if (st.note) note();
      if (st.sweep) startSweep();
    }
    seq.t += dt;
    let done = false;
    if (st.set || st.gen || st.tune || st.note) done = seq.t > 0.15;
    else if (st.wait) done = seq.t >= st.wait;
    else if (st.sweep) done = !sweep;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }
  function applySpeed() {
    W.setV(speed());
    if (isS()) { rig.setString(state.str); rig.setMelde(state.L, state.mass); }
    steadyCache = null; respCache = null; notes();
  }

  // ───────────────────────── interfaccia ─────────────────────────
  function notes() {
    if (isS()) {
      const S = STRINGS[state.str], v = speed();
      ui.setNote('#sys-note', `${S.name}: μ = <b>${fmt.num(S.mu * 1000, 1)} g/m</b> · tensione <b>${fmt.num(state.mass * G, 2)} N</b> · v = √(T/μ) = <b>${fmt.num(v, 1)} m/s</b> · f₁ = v/2L = <b>${fmt.hz(fn(1))}</b>`);
    } else {
      const E = ENDS[state.ends];
      ui.setNote('#sys-note', `${E.note}. c = <b>${fmt.num(speed(), 1)} m/s</b> · f₁ = <b>${fmt.hz(fn(1))}</b>${state.ends === 'cc' ? '' : ` (con la correzione d'estremità di ${fmt.num(END_CORR * 100, 1)} cm per ogni apertura)`}`);
    }
  }
  const ui = createUI(state, {
    strings: Object.entries(STRINGS), ends: Object.entries(ENDS), presets: PRESETS, views: VIEWS,
    fRange,
    lText: () => (isS() ? `f₁ = ${fmt.hz(fn(1))}` : `f₁ = ${fmt.hz(fn(1))}`),
    massText: () => `T = ${fmt.num(state.mass * G, 2)} N`,
    cText: () => `c = ${fmt.num(soundSpeed(state.temp), 1)} m/s`,
    fText: () => { const n = nearestMode(), d = f() - fn(n); return Math.abs(d) < 0.005 * f() ? `in risonanza: f${sub(harm(n))}` : `f${sub(harm(n))} ${d > 0 ? '+' : '−'} ${fmt.num(Math.abs(d), isS() ? 2 : 1)} Hz`; },
    ampUnit: () => unitName(),
    fineSteps: () => (isS() ? [-1, -0.1, 0.1, 1] : [-10, -1, 1, 10]),
    modeLabels: () => Array.from({ length: 6 }, (_, k) => [k + 1, `f${sub(harm(k + 1))}`, `${fmt.hz(fn(k + 1))}: ${isS() ? `${k + 1} ${k ? 'ventri' : 'ventre'}` : `armonica ${harm(k + 1)}`}`]),
  }, (key, arg) => {
    if (GEOM.has(key)) {
      seq = null; sweep = null;
      if (key === 'mode') { genOn = false; build(true); reset(); ui.refresh(); ui.sync(); setView(view === 'overview' ? 'overview' : view, false); return; }
      build(key === 'ends'); ui.refresh(); ui.sync(); return;
    }
    if (SPEED.has(key)) { seq = null; applySpeed(); ui.refresh(); return; }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        if (p[3].plotKind === 'law') records = [];
        build(true); reset(); stage.setAmbient(0.04 + 0.96 * state.ambient);
        ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'f': case 'A': seq = null; sweep = null; ui.refresh('f'); break;
      case 'fine': seq = null; sweep = null; setF(f() + arg); ui.refresh('f'); break;
      case 'tune': seq = null; sweep = null; setF(fn(arg)); ui.refresh('f'); break;
      case 'go': seq = null; toggleGen(); break;
      case 'pause': togglePause(); break;
      case 'reset': seq = null; reset(); break;
      case 'note': note(); break;
      case 'sweep': seq = null; if (sweep) { sweep = null; } else startSweep(); break;
      case 'clear': seq = null; records = []; sweeps = []; colorI = 0; break;
      case 'look': ui.sync(); break;
      case 'sound': if (state.sound) audioInit(); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'view': setView(arg); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'powder': level(); ui.sync(); break;
      case 'grain': if (!isS()) rig.buildBed(state.Lt, state.grain); level(); break;
      case 'level': level(); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const V = (...p) => new THREE.Vector3(...p);
  tags.add('Vibratore', '', (o) => o.set(rig.xv - 0.02, TABLE.y + 0.12, 0.07), () => isS());
  tags.add('Carrucola', '', (o) => o.set(PULLEY.x, STR_Y + 0.03, 0), () => isS());
  const tMass = tags.add('', 'nocase', (o) => o.set(PULLEY.x + PULLEY.r, HANG_Y - 0.1, 0.03), () => isS());
  tags.add('Generatore di funzioni', '', (o) => { o.copy(rig.genG.position).setY(TABLE.y + 0.13); if (!isS()) o.x += 0.2; });   // accanto alla cassa: l'etichetta va più in là
  tags.add('Stroboscopio', '', (o) => o.set(0.15, TABLE.y + 0.36, -0.27), () => isS() && state.look === 'strobe');
  const tHalf = tags.add('', 'nocase', (o) => { const L = Lvis(), n = Math.max(1, countLoops(Array.from(amps))); o.set(rig.xv + L - L / (2 * n), STR_Y + 0.04, 0); }, () => isS() && genOn && W.ampMax() > 4 * A());
  tags.add('Altoparlante', '', (o) => o.set(rig.sp.position.x - 0.06, TUBE_Y + 0.1, 0), () => !isS());
  const tTube = tags.add('', 'nocase', (o) => o.set(TUBE_X + state.Lt * 0.5, TUBE_Y + 0.05, 0), () => !isS());

  // ───────────────────────── inquadrature ─────────────────────────
  function freeRect() {
    const Wd = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (Wd <= 860) return { x0: m, x1: Wd - m, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : Wd) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dirv, pts) {
    const cam = camera.clone(), rect = freeRect(), Wd = window.innerWidth, H = window.innerHeight;
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) { pv.copy(p).project(cam); if (pv.z > 1 || pv.z < -1) behind = true; const x = (pv.x * 0.5 + 0.5) * Wd, y = (-pv.y * 0.5 + 0.5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dirv, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.05, hi = 40;
      for (let k = 0; k < 30; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / H;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  function viewPose(id) {
    if (isS()) {
      const x0 = PULLEY.x - state.L;
      switch (id) {
        case 'front': return fitPose(V(0, 0.12, 1).normalize(), [V(x0 - 0.08, TABLE.y, 0.08), V(PULLEY.x + 0.06, STR_Y + 0.05, 0), V(x0, STR_Y - 0.04, 0)]);
        case 'near': return fitPose(V(0.35, 0.3, 1).normalize(), [V(x0 - 0.1, TABLE.y, 0.07), V(x0 + Math.min(0.5, state.L), STR_Y + 0.05, 0), V(x0, TABLE.y, -0.06)]);
        case 'end': return fitPose(V(-0.5, 0.2, 1).normalize(), [V(PULLEY.x - 0.3, STR_Y + 0.05, 0), V(PULLEY.x + 0.06, HANG_Y - 0.22, 0.04), V(PULLEY.x - 0.3, TABLE.y, 0.08)]);
        default: return fitPose(V(0.42, 0.42, 1).normalize(), [V(TABLE.x0, 0, TABLE.z1), V(TABLE.x1 + 0.08, 0, TABLE.z0), V(TABLE.x1, STR_Y + 0.05, 0), V(TABLE.x0, TABLE.y + 0.15, TABLE.z0), V(0.15, TABLE.y + 0.36, -0.27)]);
      }
    }
    const x1 = TUBE_X + state.Lt;
    switch (id) {
      case 'front': return fitPose(V(0, 0.15, 1).normalize(), [V(TUBE_X - 0.13, TUBE_Y + 0.08, 0), V(x1 + 0.03, TABLE.y, 0.08)]);
      // da vicino e un poco dall'alto: una quarantina di centimetri del fondo, per vedere le creste della polvere
      case 'near': { const a = TUBE_X + 0.18 * state.Lt, b = a + Math.min(0.24, state.Lt * 0.6); return fitPose(V(0.1, 1.1, 1).normalize(), [V(a, TUBE_Y - 0.026, 0.028), V(b, TUBE_Y - 0.026, -0.028), V(a, TUBE_Y + 0.028, 0), V(b, TUBE_Y + 0.028, 0)]); }
      case 'end': return fitPose(V(0.6, 0.25, 1).normalize(), [V(TUBE_X - 0.16, TABLE.y, 0.08), V(TUBE_X + 0.25, TUBE_Y + 0.09, -0.08)]);
      default: return fitPose(V(0.42, 0.42, 1).normalize(), [V(TABLE.x0, 0, TABLE.z1), V(TABLE.x1, 0, TABLE.z0), V(TABLE.x0, TABLE.y + 0.15, TABLE.z0), V(x1, TUBE_Y + 0.05, 0)]);
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(6, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); seq = null; toggleGen(); } else if (k === 'p') togglePause(); else if (k === 'r') { seq = null; reset(); }
    else if (k === 'a') note();
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
  const strobeOn = () => state.look === 'strobe';
  /** Quello che si vede: a occhio una scia se vibra troppo in fretta, altrimenti la forma (o l'ultimo lampo). */
  const apparentF = () => f() * state.slow * (sweep ? sweep.k : 1);
  const blurred = () => !strobeOn() && apparentF() > 6 && (genOn || ringing());
  function place(dt) {
    const L = Lvis(), x0 = W.ext0 || 0, field = strobeOn() ? W.snap : W.y, phi = strobeOn() ? W.snapPhi : W.phi;
    // a riposo si ridisegna solo se è cambiato qualcosa
    const sig = `${state.mode}|${W.t}|${W.N}|${L}|${state.look}|${state.travel}|${state.marks}|${state.str}|${state.outline}|${state.particles}|${state.powder}|${state.grain}|${bedVer}|${state.ends}|${genOn}`;
    if (sig === placeSig && dt === 0) return;
    placeSig = sig;
    profile();
    if (isS()) {
      for (let j = 0; j <= NS; j++) ys[j] = interp(W.x, field, x0 + (L * j) / NS);
      let waves = null;
      if (state.travel && (genOn || ringing())) {
        const s = steady(), c = Math.cos(phi), sn = Math.sin(phi);
        for (let j = 0; j <= NS; j++) {
          const x = x0 + (L * j) / NS;
          const rr = interp(W.x, s.Rr, x), ri = interp(W.x, s.Ri, x), lr = interp(W.x, s.Lr, x), li = interp(W.x, s.Li, x);
          wR[j] = rr * sn + ri * c; wL[j] = lr * sn + li * c;            // Im(Z·e^{iφ})
        }
        waves = [wR, wL];
      }
      const bl = blurred();
      rig.drawString(bl ? null : ys, amps, bl ? 0.85 : strobeOn() ? 0.08 : 0.14, waves, strobeOn() ? W.snap[0] : W.y[0]);
      // nodi e ventri, solo se la figura è netta
      if (state.marks && W.ampMax() > 4 * A()) {
        const mx = Math.max(...amps), nodes = [], antis = [];
        for (let j = 0; j <= NS; j++) {
          const a = amps[j] / mx, l = j ? amps[j - 1] / mx : Infinity, r = j < NS ? amps[j + 1] / mx : Infinity;
          if (a < 0.3 && a <= l && a <= r) nodes.push((L * j) / NS);
          if (a > 0.6 && a >= (j ? amps[j - 1] / mx : -1) && a >= (j < NS ? amps[j + 1] / mx : -1)) antis.push((L * j) / NS);
        }
        rig.setMarks(nodes, antis);
      } else rig.setMarks(null, null);
      // stroboscopio: lampeggia (si vede accendersi a ogni lampo nuovo)
      const fl = W.flashes !== flashSeen; flashSeen = W.flashes;
      rig.setStrobe(strobeOn(), fl);
      // contorno: della corda, o della sua scia quando vibra troppo in fretta per vederla
      stage.outlined = state.outline ? [bl ? rig.band : rig.proxy.mesh] : [];
    } else {
      for (let j = 0; j <= NS; j++) ys[j] = interp(W.x, field, x0 + (L * j) / NS);
      // particelle: spostamento ingrandito e pressione (dal gradiente) relativa
      const h = W.dx;
      let gm = 0; for (let i = W.i0; i < W.i1; i++) gm = Math.max(gm, Math.abs(field[i + 1] - field[i]) / h);
      pnorm = Math.max(gm, pnorm * Math.pow(0.5, dt / 1.5), 1e-12);
      const sAt = (x) => interp(W.x, field, x0 + x) * VIS_GAIN;
      const pAt = (x) => -(interp(W.x, field, x0 + x + h) - interp(W.x, field, x0 + x - h)) / (2 * h) / pnorm;
      rig.drawTube(sAt, pAt, field[0] * VIS_GAIN, state.particles);
      // polvere: dove l'aria vibra abbastanza (verso i ventri di spostamento) si solleva e ricade in creste
      // trasversali sottili; nei nodi resta ferma e liscia, e un poco vi scivola. Spento il suono, resta com'è.
      if (state.powder) {
        const G = GRAINS[state.grain], n = BED_N, dxp = L / n, aAt = (j) => amps[Math.round((j * NS) / n)];
        if (!paused && dt > 0) {
          let ch = 0;
          for (let j = 0; j <= n; j++) {
            const a = aAt(j), ag = smooth(a, 0.8 * G.lo, G.lo);
            if (ag <= 0) continue;
            const d = (smooth(a, G.lo, G.hi) - ridge[j]) * (1 - Math.exp((-dt * ag) / 0.7));
            ridge[j] += d; ch += Math.abs(d);
          }
          const a2 = (j) => Math.min(4, (aAt(j) / G.hi) ** 2), steps = Math.ceil(dt / 0.01), hs = dt / steps;
          for (let s = 0; s < steps; s++) {
            for (let j = 0; j < n; j++) {
              const act = Math.max(aAt(j), aAt(j + 1)) > G.lo ? 1 : 0, u = (-0.0015 * (a2(j + 1) - a2(j))) / dxp;
              flux[j] = act * (u * (u > 0 ? dust[j] : dust[j + 1]) + (0.00008 * (dust[j] - dust[j + 1])) / dxp);
            }
            for (let j = 0; j <= n; j++) {
              const d = (hs / dxp) * ((j < n ? flux[j] : 0) - (j > 0 ? flux[j - 1] : 0));
              if (d) { dust[j] = Math.min(2.6, Math.max(0.25, dust[j] - d)); ch += Math.abs(d); }
            }
          }
          // la polvere cambia in un secondo o due: basta ridisegnarla dieci volte al secondo, e solo se si è mossa
          bedAcc += ch;
          if (bedAcc > 1e-3 && performance.now() - bedDrawAt > 100) bedDirty = true;
        }
        if (bedDirty) {
          const at = (arr) => (x) => { const u = Math.min(n, Math.max(0, x / dxp)), i = Math.min(n - 1, Math.floor(u)), f = u - i; return arr[i] * (1 - f) + arr[i + 1] * f; };
          rig.drawBed(at(dust), at(ridge), true); bedDirty = false; bedAcc = 0; bedDrawAt = performance.now();
        }
        // la polvere scossa: la superficie trema e i granelli saltellano dove l'aria vibra adesso; il loro tempo
        // scorre con quello della simulazione (al rallentatore rallentano, in pausa si fermano)
        for (let j = 0; j <= n; j++) agit[j] = smooth(aAt(j), 0.7 * G.lo, G.hi);
        rig.setGrainField(agit, ridge, n);
        grainT += dt * state.slow;
        rig.setGrainTime(grainT, stage.renderer.domElement.height / 2);
        rig.setGrainShow(true);
      } else { rig.drawBed(null, null, false); rig.setGrainShow(false); }
      stage.outlined = state.outline ? [rig.membrane] : [];
      rig.setStrobe(false, false);
    }
  }

  function hud(now) {
    const fr = f(), am = W.ampMax(), n = nearestMode(), loops = isS() ? countLoops(Array.from(amps)) : 0;
    ui.setTitle('Generatore', isS() ? ' · vibratore' : ' · altoparlante');
    ui.setClock(fmt.num(fr, fr < 100 ? 2 : 1), 'Hz', genOn && !paused);
    const ampTxt = `${fmt.num(am * unit(), am * unit() < 10 ? 2 : 1)} ${unitName()}`;
    ui.setSide(`ampiezza ${ampTxt}${isS() && loops && am > 4 * A() ? ` · ${loops} ${loops === 1 ? 'ventre' : 'ventri'}` : ''}`,
      sweep ? `scansione ${fmt.num((100 * (fr - sweep.fa)) / (sweep.fb - sweep.fa), 0)} % · tempo ×${fmt.num(sweep.k, 0)}` : `modo più vicino f${sub(harm(n))} = ${fmt.hz(fn(n))}`);
    const resonant = genOn && Math.abs(fr - fn(n)) < 0.01 * fn(n) && am > 0.6 * peakAmp(n);
    let status;
    if (paused) status = 'in pausa';
    else if (sweep) status = 'scansione';
    else if (genOn) status = resonant ? 'in risonanza' : 'acceso';
    else status = ringing() ? 'si smorza' : 'spento';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, (genOn || ringing()) && !paused);
    ui.setGo(genOn ? 'Spegni' : 'Accendi', genOn);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    ui.setSweep(sweep ? 'Ferma la scansione' : 'Scansione in frequenza', !!sweep);
    rig.setGenerator(fmt.num(fr, fr < 100 ? 2 : 1), genOn);
    const rows = records.slice().reverse().slice(0, 14).map((r) => {
      if (r.mode === 'string') return { key: r.id, color: r.color, name: `${r.n} ${r.n === 1 ? 'ventre' : 'ventri'} · ${STRINGS[r.str].short} · ${fmt.g(r.m)}<small>L ${fmt.num(r.L * 100, 0)} cm</small>`, t: fmt.hz(r.f), v: r.res && r.y ? `v ${fmt.num(r.y, 1)} m/s` : 'fuori risonanza' };
      return { key: r.id, color: r.color, name: `armonica ${r.n} · ${ENDS[r.ends].short}<small>L ${fmt.num(r.L * 100, 0)} cm</small>`, t: fmt.hz(r.f), v: r.res ? `c ${fmt.num(r.c, 1)} m/s` : 'fuori risonanza' };
    });
    ui.setRows(rows, 'Porta il generatore su una risonanza e premi «Annota» (tasto A): la misura si aggiunge qui.');
    if (now - metricsAt > 200) {
      metricsAt = now;
      const v = speed(), lam = v / fr;
      if (isS()) {
        const S = STRINGS[state.str], T = state.mass * G;
        ui.setMetrics([
          { k: 'Tensione', v: `${fmt.num(T, 2)} <small>N</small>`, s: `${fmt.g(state.mass)} appesi · T = m·g`, title: 'Il peso appeso tende la corda' },
          { k: 'Velocità dell\'onda', v: `${fmt.num(v, 1)} <small>m/s</small>`, s: `√(T/μ), μ = ${fmt.num(S.mu * 1000, 1)} g/m` },
          { k: 'Fondamentale', v: `${fmt.num(fn(1), 2)} <small>Hz</small>`, s: 'f₁ = v / 2L', title: 'Le risonanze sono f_n = n·f₁' },
          { k: 'Lunghezza d\'onda', p: 2, v: `${fmt.num(lam * 100, 1)} <small>cm</small>`, s: `λ = v/f · λ/2 = ${fmt.num(lam * 50, 1)} cm`, title: 'Alla frequenza del generatore' },
          { k: 'Modo più vicino', p: 2, v: `n = ${n}`, s: `f${sub(n)} = ${fmt.hz(fn(n))}` },
          { k: 'Ampiezza massima', p: 3, v: `${fmt.num(am * 1000, 1)} <small>mm</small>`, s: `${fmt.num(am / A(), 1)} volte il vibratore`, title: 'Nel ventre più ampio' },
        ]);
      } else {
        const E = ENDS[state.ends];
        ui.setMetrics([
          { k: 'Velocità del suono', v: `${fmt.num(v, 1)} <small>m/s</small>`, s: `aria a ${state.temp} °C`, title: 'c = 331,3·√(1 + t/273,15) m/s' },
          { k: 'Fondamentale', v: `${fmt.num(fn(1), 1)} <small>Hz</small>`, s: state.ends === 'co' ? 'f₁ = c/4L, solo dispari' : 'f₁ = c/2L', title: 'Con la correzione d\'estremità per gli estremi aperti' },
          { k: 'Lunghezza d\'onda', p: 2, v: `${fmt.num(lam * 100, 1)} <small>cm</small>`, s: `λ = c/f · λ/2 = ${fmt.num(lam * 50, 1)} cm` },
          { k: 'Modo più vicino', p: 2, v: `armonica ${harm(n)}`, s: `${fmt.hz(fn(n))}` },
          { k: 'Correzione d\'estremità', p: 3, v: E.right === 'free' ? `${fmt.num(END_CORR * 100, 1)} <small>cm</small>` : '—', s: E.right === 'free' ? '0,61·r per ogni apertura' : 'estremi chiusi', title: 'Il nodo di pressione sta appena fuori dall\'apertura' },
          { k: 'Ampiezza massima', p: 3, v: `${fmt.num(am * 1e6, 1)} <small>μm</small>`, s: `${fmt.num(am / A(), 1)} volte la membrana`, title: 'Spostamento dell\'aria nel ventre più ampio (nella scena ×600)' },
        ]);
      }
      tags.setText(tMass, `${fmt.g(state.mass)} · T = ${fmt.num(state.mass * G, 2)} N`);
      tags.setText(tHalf, `λ/2 = ${fmt.num((v / fr) * 50, 1)} cm`);
      tags.setText(tTube, `Tubo ${ENDS[state.ends].short} · ${fmt.num(state.Lt * 100, 0)} cm`);
    }
    // suono: solo a tempo reale, più forte in risonanza
    const audible = state.sound && genOn && !paused && state.slow === 1;
    audioSet(fr, audible ? 0.03 + 0.17 * Math.min(1, am / (peakAmp(1) || 1)) : 0, isS() ? 'triangle' : 'sine');
  }

  function drawPlot() {
    const kind = state.plotKind, L = Lvis(), u = unit();
    if (kind === 'shape') {
      const x = [], yN = [], yP = [], yM = [];
      for (let j = 0; j <= NS; j++) { x.push((L * j * 100) / NS); yN.push(ys[j] * u); yP.push(amps[j] * u); yM.push(-amps[j] * u); }
      if (isS()) {
        const series = [{ x, y: yP, color: '#9aa1ab', width: 1.6, dash: [6, 5] }, { x, y: yM, color: '#9aa1ab', width: 1.6, dash: [6, 5] }, { x, y: yN, color: '#15181c', width: 3 }];
        if (state.travel && (genOn || ringing())) series.push({ x, y: Array.from(wR, (v) => v * u), color: '#e8452c', width: 2, alpha: 0.85 }, { x, y: Array.from(wL, (v) => v * u), color: '#2c67dc', width: 2, alpha: 0.85 });
        const Y = Math.max(2 * A() * u, ...yP) * 1.15;
        ui.drawPlot({ series, X0: 0, X1: L * 100, Y0: -Y, Y1: Y, xLabel: 'x (cm)', yLabel: 'y (mm)', legend: state.travel ? [['corda', '#15181c'], ['dal vibratore', '#e8452c'], ['riflessa', '#2c67dc']] : [['corda', '#15181c'], ['ampiezza', '#9aa1ab']] });
      } else {
        // profili relativi: spostamento (dalla simulazione) e pressione (a regime)
        const s = steady(), mxA = Math.max(...amps) || 1, x0 = W.ext0 || 0;
        let mxP = 0; for (let i = W.i0; i <= W.i1; i++) mxP = Math.max(mxP, s.dA[i]);
        const pr = x.map((xx) => interp(W.x, s.dA, x0 + xx / 100) / (mxP || 1));
        const series = [{ x, y: yP.map((v) => v / (mxA * u)), color: '#2c67dc', width: 3 }, { x, y: pr, color: '#e8452c', width: 3 }, { x, y: yN.map((v) => v / (mxA * u)), color: '#15181c', width: 1.6, alpha: 0.6 }];
        ui.drawPlot({ series, X0: 0, X1: L * 100, Y0: -1.1, Y1: 1.25, xLabel: 'x (cm)', yLabel: 'ampiezza relativa', legend: [['spostamento', '#2c67dc'], ['pressione', '#e8452c'], ['istante', '#15181c']] });
      }
      return;
    }
    if (kind === 'resp') {
      const R = response(), [fa, fb] = sweepRange(), series = [{ x: R.x, y: R.y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.55 }];
      sweeps.forEach((p, i) => series.push({ x: p.x, y: p.y, color: i === sweeps.length - 1 ? '#e8452c' : '#d99a12', width: 2.6, alpha: i === sweeps.length - 1 ? 1 : 0.6 }));
      const marks = []; for (let n = 1; n <= 12; n++) { const fm = fn(n); if (fm > fb) break; if (fm >= fa) marks.push({ x: fm, color: 'rgba(12,157,143,0.55)' }); }
      const Y1 = Math.max(...R.y, ...(sweeps.length ? sweeps[sweeps.length - 1].y : [0])) * 1.1;
      ui.drawPlot({ series, marks, points: [{ x: Math.min(fb, Math.max(fa, f())), y: W.ampMax() * u, color: '#e8452c', r: 7, ring: true }], X0: fa, X1: fb, Y0: 0, Y1, xLabel: 'f (Hz)', yLabel: `ampiezza massima (${unitName()})`, legend: [['teoria a regime', '#15181c'], ['misurata', '#e8452c'], [`f${isS() || state.ends !== 'co' ? 'ₙ = n·f₁' : 'ₙ dispari'}`, '#0c9d8f']] });
      return;
    }
    if (kind === 'time') {
      // la finestra parte da zero e si allarga fino a 20 s, poi scorre (finché qualcosa vibra)
      const Wd = 20, X1 = Math.max(1, tRun * 1.04), X0 = Math.max(0, X1 - Wd), k0 = Math.max(0, series.findIndex((p) => p.t >= X0));
      const pts = series.slice(k0), Y1 = Math.max(2 * A() * u, ...pts.map((p) => p.a)) * 1.12;
      ui.drawPlot({ series: [{ x: pts.map((p) => p.t), y: pts.map((p) => p.a), color: '#e8452c', width: 3 }], X0, X1, Y0: 0, Y1, xLabel: 't (s)', yLabel: `ampiezza massima (${unitName()})` });
      return;
    }
    // leggi: v = λ·f contro √(T/μ) per la corda; f contro 1/λ per il tubo (pendenza c)
    const pts = records.filter((r) => r.mode === state.mode && r.res && r.y);
    if (isS()) {
      const X1 = Math.max(100, ...pts.map((r) => r.x)) * 1.1;
      ui.drawPlot({ series: [{ x: [0, X1], y: [0, X1], color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }], points: pts.map((r) => ({ x: r.x, y: r.y, color: r.color, r: 7 })), X0: 0, X1, Y0: 0, Y1: X1, xLabel: '√(T/μ) (m/s)', yLabel: 'λ·f misurata (m/s)', legend: [['v = √(T/μ)', '#15181c']] });
    } else {
      const X1 = Math.max(4, ...pts.map((r) => r.x)) * 1.1, c = soundSpeed(state.temp), legend = [[`c = ${fmt.num(c, 1)} m/s`, '#15181c']];
      if (pts.length >= 2) { const sxy = pts.reduce((s, r) => s + r.x * r.y, 0), sxx = pts.reduce((s, r) => s + r.x * r.x, 0); legend.push([`dalle misure ${fmt.num(sxy / sxx, 1)} m/s`, '#e8452c']); }
      ui.drawPlot({ series: [{ x: [0, X1], y: [0, c * X1], color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }], points: pts.map((r) => ({ x: r.x, y: r.y, color: r.color, r: 7 })), X0: 0, X1, Y0: 0, Y1: c * X1, xLabel: '1/λ (1/m)', yLabel: 'f (Hz)', legend });
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
    if (!paused) stepSeq(dt);
    const active = genOn || ringing();
    let simDt = 0;
    if (!paused && active) {
      simDt = Math.min(dt, 0.05) * (sweep ? sweep.k : state.slow);
      if (sweep) {
        setF(f() + sweep.rate * simDt);
        if (nowMs - fRefreshAt > 120) { fRefreshAt = nowMs; ui.refresh('f'); }
        if (f() >= sweep.fb - 1e-9) { sweep = null; ui.refresh('f'); }
      }
      W.on = genOn; W.setDrive(f(), A());
      W.setStrobe(strobeOn() ? Math.max(0.05, f() - state.dstrobe) : 0);
      W.step(simDt);
      tRun += simDt;
      if (sweep) { sweep.pts.x.push(f()); sweep.pts.y.push(W.ampMax() * unit()); }
      if (tRun - lastSample >= 0.02 * (sweep ? sweep.k : Math.max(state.slow, 0.05))) { lastSample = tRun; series.push({ t: tRun, a: W.ampMax() * unit() }); while (series.length && series[0].t < tRun - 40) series.shift(); }
    }
    place(paused || !active ? 0 : dt);
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
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  build(true);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, W: () => W, records: () => records, seq: () => seq, paused: () => paused, gen: () => genOn, sweep: () => sweep, fn, togglePause, toggleGen, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
