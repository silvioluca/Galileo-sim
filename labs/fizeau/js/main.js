// main.js — L'esperimento di Fizeau
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { HISTORY, DUTY, lightSpeed, roundTrip, shift, eclipseF, gate, returned, eclipseOrder, measuredC } from './fizeau.js';
import { Rig, Y0, NEAR, FAR, LAMP, WHEEL, WHEEL_M, BREAK_X } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const state = { app: 'storico', f: 0, N: 720, spot: 0.03, d: 8.633, air: true, slow: 1, ambient: 0.6, beam: true, theory: false, outline: false, labels: true, quality: 'low' };
const BASE = { f: 0, N: 720, spot: 0.03, d: 8.633, air: true, slow: 1, beam: true, theory: false };
const PARAMS = new Set(['N', 'spot', 'd', 'air']);
// [id, testo, descrizione, impostazioni, passi, inquadratura]
// passi: {to: multiplo della prima eclissi | 'max', dur} rampa della velocità; {mark}: segna l'eclissi; {ref}: il dato di Fizeau; {set}: nuove impostazioni
const PRESETS = [
  ['fizeau', 'Fizeau, 1849', 'Suresnes–Montmartre, 720 denti: si accelera la ruota finché la luce sparisce, poi si ricava c', { app: 'storico' }, [{ to: 1, dur: 7 }, { mark: true }, { ref: true }], 'overview'],
  ['moderno', 'La versione moderna', 'Laser verde, telecamera e tachimetro laser: il computer trova il minimo del segnale e c esce con un errore di pochi centomillesimi', { app: 'moderno', spot: 0.02 }, [{ to: 0.9, dur: 6 }, { mark: true }], 'near'],
  ['dark', 'L\'eclissi al rallentatore', 'Alla prima eclissi la luce passa in un vano e al ritorno trova un dente', { slow: 1e-5 }, [{ to: 1, dur: 0 }], 'side'],
  ['bright', 'Il vano successivo', 'Al doppio della velocità la luce torna nel vano seguente: di nuovo luce', { slow: 1e-5 }, [{ to: 2, dur: 0 }], 'side'],
  ['orders', 'Eclissi successive', 'Accelerando ancora la luce torna e sparisce di nuovo: eclissi a 1, 3, 5… volte la prima', { theory: true }, [{ to: 'max', dur: 12 }], 'overview'],
  ['teeth', 'Più denti, meno giri', 'Con 1440 denti l\'eclissi arriva a metà velocità: conta il tempo per mezzo dente', { N: 1440 }, [{ to: 1, dur: 5 }, { mark: true }, { set: { N: 720, f: 0 } }, { to: 1, dur: 6 }, { mark: true }], 'overview'],
  ['half', 'Specchio a metà strada', 'Con metà distanza la luce torna prima: serve una ruota due volte più veloce', { d: 4.3165 }, [{ to: 1, dur: 7 }, { mark: true }], 'overview'],
  ['focus', 'Fuoco sbagliato', 'Se l\'immagine della lampada sul bordo è larga quanto un dente, l\'eclissi non è mai completa', { spot: 0.25, theory: true }, [{ to: 2.2, dur: 9 }], 'wheel'],
];
const VIEWS = [['overview', 'Panoramica'], ['side', 'Di lato'], ['near', 'Suresnes'], ['wheel', 'Ruota dentata'], ['far', 'Montmartre']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 600 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [0.4, 5.2, 3.6], keyTarget: [1.6, 0.8, 0], shadowBox: [-3.4, 3.4, 2.2, -2.2], shadowFar: 12, fog: [18, 90] });
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
  let u = 0, tSlow = 0, Ieye = 1, gearA = 0, trace = [], lastRecF = -1, marks = [], scan = null, seq = null, pendingView = null, view = 'overview', paused = false;
  let theoryKey = '', theoryPts = [], fpsEma = 60, hudTimer = 0, plotAt = 0, eyeTick = 0, metricsAt = 0;

  const dm = () => state.d * 1000;
  const cL = () => lightSpeed(state.air);
  const tau = () => roundTrip(dm(), state.air);
  const f1 = () => eclipseF(1, state.N, dm(), state.air);
  const fMax = () => Math.max(20, Math.ceil((f1() * 5.2) / 10) * 10);
  const modern = () => state.app === 'moderno';
  const pitch = () => (2 * Math.PI * (modern() ? WHEEL_M.rb : WHEEL.rb)) / state.N;
  const where = () => (Math.abs(state.d - 8.633) < 0.0005 ? 'Suresnes–Montmartre' : Math.abs(state.d - 4.3165) < 0.0005 ? 'metà strada' : `andata e ritorno ${fmt.us(tau())}`);

  // ───────────────────────── misure ─────────────────────────
  function mark() {
    if (state.f <= 0) { flash = 'Prima fai girare la ruota'; return; }
    if (modern()) findMinimum();
    const s = shift(state.f, state.N, dm(), state.air);
    const k = eclipseOrder(s), c = measuredC(state.f, k, state.N, dm()), err = c / cL() - 1;
    const I = returned(s, state.spot);
    marks.push({ f: state.f, k, c, err, I, N: state.N, d: dm(), modern: modern(), id: marks.length + 1 + Math.random() });
    flash = I > 0.12 ? `Qui la luce non è sparita (${fmt.pct(I)}): la misura è approssimata` : '';
  }
  /**
   * Versione moderna: il computer cerca il minimo del segnale della telecamera vicino alla velocità attuale
   * (sezione aurea fra le due velocità di luce piena più vicine) e porta lì la ruota.
   */
  function findMinimum() {
    const h = f1();                                    // le eclissi distano 2·f1, i massimi stanno a metà
    let a = Math.max(0, state.f - 1.05 * h), b = state.f + 1.05 * h;
    const I = (f) => returned(shift(f, state.N, dm(), state.air), state.spot);
    const r = (Math.sqrt(5) - 1) / 2;
    let c = b - r * (b - a), d = a + r * (b - a), Ic = I(c), Id = I(d);
    for (let i = 0; i < 80; i++) {
      if (Ic < Id) { b = d; d = c; Id = Ic; c = b - r * (b - a); Ic = I(c); } else { a = c; c = d; Ic = Id; d = a + r * (b - a); Id = I(d); }
    }
    state.f = Math.round(((a + b) / 2) * 1000) / 1000;
    ui.refresh('f');
  }
  let flash = '';
  function addRef() { marks.push({ ref: true, f: HISTORY.f1, k: 1, c: HISTORY.c, err: HISTORY.c / lightSpeed(true) - 1, N: HISTORY.N, d: HISTORY.d, id: 'ref' }); }

  function onParams() {
    trace = []; lastRecF = -1; theoryKey = '';
    rig.setApparatus(modern());
    rig.setPath(dm());
    ui.sync();
    ui.setNote('#app-note', modern()
      ? `Laser verde da 532 nm, cubo divisore e telecamera; ruota d'alluminio di 40 cm con un motore elettrico; il tachimetro laser legge la velocità al millesimo.`
      : `Lampada a olio, lamina di vetro, ruota d'ottone di 12 cm mossa da un meccanismo a orologeria con contagiri a lancetta; si guarda all'oculare.`);
    ui.refresh('f'); ui.refresh('spot'); ui.refresh('d');
    if (state.f > fMax()) { state.f = fMax(); ui.refresh('f'); }
  }

  // ───────────────────────── sequenze degli esperimenti classici ─────────────────────────
  function runSeq(dt) {
    if (!seq) return;
    const st = seq.steps[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0; seq.f0 = state.f;
      if (st.set) { Object.assign(state, st.set); onParams(); ui.refresh(); }
      if (st.mark) mark();
      if (st.ref) addRef();
      if (st.to !== undefined) seq.target = st.to === 'max' ? fMax() * 0.98 : Math.round(f1() * st.to * 100) / 100;
    }
    seq.t += dt;
    if (st.to !== undefined) {
      const k = st.dur ? Math.min(1, seq.t / st.dur) : 1;
      state.f = Math.round((seq.f0 + (seq.target - seq.f0) * k) * 100) / 100;
      if (k >= 1) state.f = seq.target;
      ui.refresh('f');
      if (k < 1) return;
    }
    if (st.mark && seq.t < 1.2) return;
    seq.i++; seq.started = false;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, { fMax, pitch, where, presets: PRESETS, views: VIEWS }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        scan = null;
        Object.assign(state, BASE, p[3]);
        u = 0; tSlow = 0; Ieye = 1;
        onParams(); ui.refresh();
        seq = { steps: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'scan': toggleScan(); break;
      case 'pause': togglePause(); break;
      case 'mark': seq = null; mark(); break;
      case 'clear': trace = []; marks = []; lastRecF = -1; flash = ''; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'slow': tSlow = 0; scan = null; break;
      case 'app': seq = null; scan = null; flash = ''; onParams(); pendingView = view; break;
      case 'f': seq = null; scan = null; break;
      default: if (PARAMS.has(key)) { seq = null; scan = null; onParams(); } break;
    }
  });
  /** La ruota gira (o la scansione o un esperimento sono in corso): il tempo si può fermare. */
  const moving = () => state.f > 0 || !!scan || !!seq;
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }
  function toggleScan() {
    seq = null; paused = false;
    if (scan) { scan = null; return; }
    if (state.slow !== 1) { state.slow = 1; ui.refresh('slow'); }
    scan = { t: 0, dur: 10, f0: 0, f1: fMax() * 0.98 };
    state.f = 0; ui.refresh('f');
  }

  // ───────────────────────── etichette ─────────────────────────
  // i nomi dei componenti solo da vicino; da lontano bastano i nomi dei due luoghi
  const camNear = (x) => camera.position.distanceTo(new THREE.Vector3(x, Y0, 0)) < 2.4;
  const T = (text, pos, vis) => tags.add(text, '', (o) => o.set(...pos), vis);
  const H = (x) => () => !modern() && camNear(x), Mo = (x) => () => modern() && camNear(x);
  T('Lampada', [LAMP.x, Y0 + 0.14, LAMP.z], H(NEAR.wheel));
  T('Lamina semiriflettente', [NEAR.split, Y0 + 0.06, 0.03], H(NEAR.wheel));
  T('Ruota dentata', [NEAR.wheel, Y0 + 0.02, 0.02], H(NEAR.wheel));
  T('Contagiri', [NEAR.wheel - 0.105, Y0 - 0.07, 0.07], H(NEAR.wheel));
  T('Obiettivo', [NEAR.obj + 0.05, Y0 + 0.05, 0], H(NEAR.wheel));
  T('Oculare', [NEAR.eye - 0.05, Y0 + 0.03, 0], H(NEAR.wheel));
  T('Obiettivo', [FAR.obj - 0.05, Y0 + 0.05, 0], H(FAR.obj));
  T('Specchio', [FAR.mirror, Y0 + 0.03, 0], H(FAR.obj));
  T('Suresnes', [-0.48, Y0 + 0.2, 0], () => !modern() && !camNear(NEAR.wheel));
  T('Montmartre', [(FAR.obj + FAR.mirror) / 2, Y0 + 0.2, 0], () => !modern() && !camNear(FAR.obj));
  // versione moderna
  const zcM = -WHEEL_M.rb;
  T('Laser verde', [LAMP.x, Y0 + 0.04, -0.3], Mo(NEAR.wheel));
  T('Cubo divisore', [NEAR.split, Y0 + 0.045, 0.02], Mo(NEAR.wheel));
  T('Ruota d\'alluminio', [NEAR.wheel, Y0 + WHEEL_M.R + 0.02, zcM], Mo(NEAR.wheel));
  T('Motore', [NEAR.wheel - 0.17, Y0 + 0.07, zcM], Mo(NEAR.wheel));
  T('Tachimetro laser', [NEAR.wheel + 0.13, Y0 + 0.04, zcM - 0.15], Mo(NEAR.wheel));
  T('Lettura del tachimetro', [-0.5, Y0 - 0.08, 0.2], Mo(NEAR.wheel));
  T('Telecamera', [NEAR.eye - 0.085, Y0 + 0.05, 0], Mo(NEAR.wheel));
  T('Telescopio', [NEAR.obj - 0.1, Y0 + 0.1, 0], Mo(NEAR.wheel));
  T('Telescopio con lo specchio', [(FAR.obj + FAR.mirror) / 2, Y0 + 0.1, 0], Mo(FAR.obj));
  T('Trasmettitore', [-0.48, Y0 + 0.25, 0], () => modern() && !camNear(NEAR.wheel));
  T('Riflettore', [(FAR.obj + FAR.mirror) / 2, Y0 + 0.2, 0], () => modern() && !camNear(FAR.obj));
  const tBreak = tags.add('', 'nocase', (o) => o.set(BREAK_X, Y0 + 0.11, 0));
  T('andata →', [BREAK_X - 0.75, Y0 + 0.04, 0], () => state.beam && state.slow < 1);
  T('← ritorno', [BREAK_X + 0.75, Y0 - 0.04, 0], () => state.beam && state.slow < 1);

  // ───────────────────────── inquadrature ─────────────────────────
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (W <= 860) return { x0: m, x1: W - m, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : W) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dir, pts) {
    const cam = camera.clone(), rect = freeRect(), W = window.innerWidth, H = window.innerHeight;
    const box = new THREE.Box3().setFromPoints(pts), target = box.getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) {
        pv.copy(p).project(cam);
        if (pv.z > 1 || pv.z < -1) behind = true;
        const x = (pv.x * 0.5 + 0.5) * W, y = (-pv.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.05, hi = 80;
      for (let k = 0; k < 32; k++) {
        const d = Math.sqrt(lo * hi); put(d);
        const b = bounds();
        if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d;
      }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / H;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  const V = (...p) => new THREE.Vector3(...p);
  const nearPts = () => (modern()
    ? [V(-1.2, Y0 - 0.2, 0.32), V(0.24, Y0 - 0.2, 0.32), V(-1.2, Y0 + 0.1, -0.52), V(0.24, Y0 + 0.1, -0.52), V(NEAR.wheel, Y0 + WHEEL_M.R + 0.02, -WHEEL_M.rb)]
    : [V(-1.16, Y0 - 0.2, 0.3), V(0.22, Y0 - 0.2, 0.3), V(-1.16, Y0 + 0.16, -0.42), V(0.22, Y0 + 0.1, -0.42)]);
  const farPts = () => [V(FAR.obj - 0.3, Y0 - 0.2, 0.3), V(FAR.mirror + 0.2, Y0 - 0.2, 0.3), V(FAR.obj - 0.3, Y0 + 0.1, -0.3), V(FAR.mirror + 0.2, Y0 + 0.1, -0.3)];
  function viewPose(id) {
    switch (id) {
      case 'side': return fitPose(V(0, 0.12, 1).normalize(), [V(-1.1, Y0 - 0.06, 0), V(FAR.mirror + 0.1, Y0 - 0.06, 0), V(-1.1, Y0 + 0.16, 0), V(FAR.mirror + 0.1, Y0 + 0.16, 0)]);
      case 'near': return fitPose(V(0.32, 0.5, 1).normalize(), nearPts());
      case 'wheel': return modern()
        ? { pos: [NEAR.wheel + 0.62, Y0 + 0.24, 0.42], target: [NEAR.wheel - 0.04, Y0 - 0.02, -0.16] }
        : { pos: [NEAR.wheel + 0.22, Y0 + 0.1, 0.27], target: [NEAR.wheel - 0.015, Y0 - 0.025, 0] };
      case 'far': return fitPose(V(-0.35, 0.45, 1).normalize(), farPts());
      default: return fitPose(V(0.1, 0.42, 1).normalize(), [...nearPts(), ...farPts(), V(-1.16, 0.3, 0.3), V(FAR.mirror + 0.2, 0.3, 0.3)]);
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(9, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); toggleScan(); } else if (k === 'p') togglePause(); else if (k === 'm') { seq = null; mark(); } else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });
  canvas.addEventListener('pointerdown', () => stage.cancelTween(), { capture: true });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── cronometro, oculare, grafico, misure ─────────────────────────
  const errText = (e) => `${e >= 0 ? '+' : '−'}${fmt.num(Math.abs(e) * 100, Math.abs(e) < 1e-3 ? 3 : 1)} %`;
  function hud(s, avg, f1v) {
    const slow = state.slow < 1;
    ui.setClock(state.f, state.f > 0);
    const status = paused ? 'in pausa' : slow ? 'al rallentatore' : scan ? 'scansione' : state.f === 0 ? 'ruota ferma' : Ieye < 0.06 ? 'eclissi' : Ieye < 0.2 ? 'penombra' : 'luce';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, (!!scan || !!seq) && !paused);
    ui.setScan(scan ? 'Ferma' : 'Scansione');
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    ui.setSide(`in τ la ruota avanza di ${fmt.num(s, 3)} denti`, slow ? `t = ${fmt.num(tSlow * 1e6, 1)} µs dall'inizio` : `τ = ${fmt.us(tau())} · c = ${fmt.c(cL())}`);
    const rows = marks.slice().reverse().map((m) => m.ref
      ? { key: m.id, ref: true, name: `Fizeau, 1849<small>${fmt.num(m.f, 1)} giri/s · 720 denti · 8 633 m</small>`, t: fmt.c(m.c), v: `${m.err >= 0 ? '+' : '−'}${fmt.num(Math.abs(m.err) * 100, 1)} %` }
      : { key: m.id, name: `${m.k}ª eclissi${m.modern ? ' · minimo' : ''}<small>${fmt.num(m.f, m.modern ? 3 : 2)} giri/s · ${m.N} denti · ${fmt.km(m.d)}</small>`, t: fmt.c(m.c), v: errText(m.err) });
    ui.setRows(rows, flash || (modern() ? 'Avvicinati al buio, poi «Trova il minimo».' : 'Fai girare la ruota finché la luce sparisce, poi «Segna eclissi».'));
    const now = performance.now();
    if (now - metricsAt > 200) {
      metricsAt = now;
      const last = [...marks].reverse().find((m) => !m.ref);
      ui.setMetrics([
        { k: 'Ruota', v: `${fmt.num(state.f, modern() ? 3 : 2)} <small>giri/s</small>`, s: modern() ? 'dal tachimetro laser' : `${fmt.num(state.N * state.f, 0)} vani al secondo` },
        { k: 'Andata e ritorno', v: `${fmt.num(tau() * 1e6, 2)} <small>µs</small>`, s: 'τ = 2·d / c' },
        { k: 'In quel tempo', p: 2, v: `${fmt.num(s, 3)} <small>denti</small>`, s: Math.abs(s - Math.round(s - 0.5) - 0.5) < 0.04 && s > 0.2 ? 'mezzo dente: buio' : 's = N·f·τ', title: 'Di quanti denti avanza la ruota mentre la luce va e torna' },
        { k: modern() ? 'Luce alla telecamera' : 'Luce all\'oculare', v: `${fmt.num(Ieye * 100, Ieye < 0.1 ? 1 : 0)} <small>%</small>`, s: state.slow < 1 ? 'istante per istante' : `media ${fmt.pct(avg)}`, title: 'Rispetto alla luce con la ruota ferma e un vano sul fascio' },
        { k: '1ª eclissi prevista', p: 2, v: `${fmt.num(f1v, 2)} <small>giri/s</small>`, s: 'f = c / (4·d·N)' },
        { k: 'c misurata', p: 3, v: last ? `${fmt.num(Math.round(last.c / 1000), 0)} <small>km/s</small>` : '—', s: last ? `scarto ${errText(last.err)}` : 'c = 4·d·N·f' },
        { k: 'Distanza', p: 3, v: `${fmt.num(state.d, 3)} <small>km</small>`, s: where() },
      ]);
      ui.setNote('#wheel-note', `Il bordo ha ${state.N} denti e ${state.N} vani larghi <b>${fmt.num(pitch() * 500, 3)} mm</b>: la ruota avanza di mezzo dente in 1/(2·N·f) secondi.`);
      ui.setNote('#time-note', state.slow < 1
        ? `Ogni secondo sullo schermo passano <b>${fmt.num(state.slow * 1e6, 0)} µs</b>: la luce va e torna in ${fmt.num(tau() / state.slow, 1)} s, e intanto la ruota avanza di ${fmt.num(s, 2)} denti.`
        : `In tempo reale la luce va e torna in ${fmt.us(tau())}: per l'occhio è istantanea.`);
      tags.setText(tBreak, `≈ ${fmt.num(state.d, 3)} km`);
    }
  }

  function drawPlot(avgFn) {
    const fm = fMax();
    const key = `${state.N}|${state.d}|${state.air}|${state.spot}|${fm}`;
    if (key !== theoryKey) {
      theoryKey = key; theoryPts = [];
      for (let i = 0; i <= 500; i++) { const f = (fm * i) / 500; theoryPts.push([f, avgFn(f)]); }
    }
    const ecl = [];
    if (state.theory) for (let k = 1; k < 50; k++) { const f = eclipseF(k, state.N, dm(), state.air); if (f > fm) break; ecl.push(f); }
    ui.drawPlot({ fMax: fm, trace, theory: state.theory ? theoryPts : null, cur: state.f > 0 ? { f: state.f, I: avgFn(state.f) } : null, marks: marks.filter((m) => !m.ref && m.N === state.N && Math.abs(m.d - dm()) < 1), eclipses: ecl });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (pendingView) { setView(pendingView); pendingView = null; }
    // in pausa il tempo della simulazione è fermo: ruota, impulsi, scansione, esperimenti
    if (paused && !moving()) paused = false;
    const dtSim = paused ? 0 : dt;
    runSeq(dtSim);
    if (scan) {
      scan.t += dtSim;
      const k = Math.min(1, scan.t / scan.dur);
      state.f = Math.round((scan.f0 + (scan.f1 - scan.f0) * k) * 100) / 100; ui.refresh('f');
      if (k >= 1) scan = null;
    }
    // la ruota: fase in passi di dente
    const dtS = dtSim * state.slow, N = state.N, f = state.f;
    u = (u + N * f * dtS) % N;
    if (state.slow < 1) tSlow += dtS;
    gearA += 2 * Math.PI * f * dtS * 0.03;
    const s = shift(f, N, dm(), state.air), sig = state.spot, G0 = gate(0, sig);
    const avg = returned(s, sig);
    const inst = (gate(u - s, sig) * gate(u, sig)) / (G0 * G0);
    // l'occhio non distingue lampeggi oltre una ventina al secondo: lì vede la media
    const mix = state.slow < 1 ? 0 : Math.min(1, Math.max(0, (N * f - 12) / 18));
    const target = inst * (1 - mix) + avg * mix;
    Ieye += (target - Ieye) * (1 - Math.exp(-dt / 0.045));
    // punti del grafico (solo in tempo reale: è la luce media che l'osservatore giudica)
    if (state.slow === 1 && f > 0 && Math.abs(f - lastRecF) > fMax() / 600) { trace.push([f, avg]); lastRecF = f; if (trace.length > 3000) trace.shift(); }
    // il fascio
    const U = rig.U, avgG = DUTY / G0;
    U.uU.value = u; U.uK.value = (N * f) / cL(); U.uMix.value = mix; U.uAvgOut.value = avgG; U.uAvgRet.value = avgG; U.uAvgEnd.value = avg;
    U.uW.value = Math.max(0.004, 1.2 * sig); U.uOn.value = state.beam ? 1 : 0; U.uGain.value = state.slow < 1 ? 1.7 : 1.05;
    const Gs = (x) => gate(x, sig) / G0;
    const atMirror = Gs(u - U.uK.value * dm()) * (1 - mix) + avgG * mix;
    const onTooth = Gs(u - U.uK.value * 2 * dm()) * (1 - Gs(u)) * (1 - mix) + Math.max(0, avgG - avg * G0) * mix;
    rig.mirrorGlow.material.opacity = state.beam ? 0.9 * atMirror : 0;
    rig.toothGlow.material.opacity = state.beam ? 0.9 * onTooth : 0;
    rig.eyeGlow.material.opacity = 0.9 * Ieye;
    rig.setWheel(u, N, paused ? 0 : N * f * (1 / 60) * state.slow, f, fMax(), gearA);
    stage.update(dt);
    hud(s, avg, f1());
    stage.outlined = state.outline ? [modern() ? rig.wheelM : rig.wheel] : [];
    tags.update(camera, w, h, state.labels);
    stage.render();
    if ((eyeTick++ & 1) === 0) ui.drawEye({ u, blur: mix > 0.5 ? 1 : N * f * dtS * 2, I: Ieye, lit: state.f === 0 ? 'ruota ferma' : Ieye < 0.06 ? 'buio: eclissi' : Ieye < 0.2 ? 'luce debole' : 'luce' });
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 90) { plotAt = nowMs; drawPlot((fv) => returned(shift(fv, N, dm(), state.air), sig)); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  onParams();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Luce in funzione della velocità della ruota', redraw: () => { plotAt = 0; } });
  window.lab = { state, ui, stage, rig, u: () => u, Ieye: () => Ieye, marks: () => marks, trace: () => trace, seq: () => seq, paused: () => paused, togglePause, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
