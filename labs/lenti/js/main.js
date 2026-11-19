// main.js — Lenti e immagini
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { makeLens, TYPES, LAM, LAM_D, nOf, benchSurfaces, bestFocus, spotAt, traceRay } from './optics.js';
import { Optics, SCREEN_W, SCREEN_H, F_HALF, F_TOP } from './render.js';
import { Bench, AXIS_H, RAIL } from './bench.js';
import { Rays, COL } from './rays.js';
import { createUI, fmt } from './ui.js';

const H = AXIS_H;
const FAR_HALF = 0.047;                  // la F all'infinito: metà del campo della lastra, in radianti
const FAR_TOP = FAR_HALF * 0.75;         // la cima della F (circa 2°)
const BEAM_R = 0.0225;                   // bocca del collimatore
const GAIN = 110;                        // dalla radianza relativa della lampada alla luce sullo schermo
const QUALITY = { low: 32, medium: 64, high: 128 };   // fotogrammi di accumulo (8 punti dell'apertura ciascuno)
const GAP = 0.04;                        // distanza minima fra due cavalieri
const X_END = RAIL.x1 - 0.04;
const ZOOMS = [1, 2, 4, 8, 16, 32];
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];

const state = {
  obj: 'F', type1: 'biconvex', f1: 10, flip1: false, x1: 0.3, iris: 25,
  lens2: false, type2: 'biconvex', f2: 5, flip2: false, x2: 0.6,
  screen: true, xs: 0.45, rays: 'principal', ambient: 0.6, labels: true, quality: 'low', plotKind: 'inv', zoom: 0, zoomAuto: true,
};
const BASE = { obj: 'F', type1: 'biconvex', f1: 10, flip1: false, iris: 25, lens2: false, type2: 'biconvex', f2: 5, flip2: false, screen: true, rays: 'principal', zoomAuto: true };

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const conj = [0.14, 0.17, 0.2, 0.25, 0.3, 0.4, 0.55].flatMap((x) => [{ move: { x1: x } }, { focus: true }, { wait: 0.6 }, { note: true }]);
const PRESETS = [
  ['far', 'Oltre 2f', 'L\'oggetto a 35 cm da una lente di 10 cm: l\'immagine è reale, capovolta e rimpicciolita', { x1: 0.35, xs: 0.6 }, [{ focus: true }, { wait: 0.8 }, { note: true }], 'side'],
  ['twof', 'In 2f', 'L\'oggetto a due focali: l\'immagine, capovolta, è grande quanto l\'oggetto e sta a due focali dall\'altra parte', { x1: 0.2, xs: 0.5 }, [{ focus: true }, { wait: 0.8 }, { note: true }], 'side'],
  ['proj', 'Il proiettore', 'Fra f e 2f l\'immagine è ingrandita e lontana: è così che un proiettore riempie uno schermo', { x1: 0.13, xs: 0.4 }, [{ focus: true }, { wait: 0.8 }, { note: true }], 'side'],
  ['focus', 'Oggetto nel fuoco', 'Con l\'oggetto nel fuoco i raggi escono paralleli: nessuna posizione dello schermo dà un\'immagine nitida', { x1: 0.1, xs: 0.5 }, [{ wait: 0.5 }, { move: { xs: 1.1 } }, { wait: 0.5 }], 'side'],
  ['loupe', 'Lente d\'ingrandimento', 'L\'oggetto dentro la focale: l\'immagine è virtuale, diritta e ingrandita. Sullo schermo non si forma: la si vede guardando nella lente', { x1: 0.065, screen: false, iris: 50 }, [], 'eye'],
  ['diverg', 'Lente divergente', 'Una lente divergente dà sempre un\'immagine virtuale, diritta e rimpicciolita, dalla parte dell\'oggetto', { type1: 'biconcave', x1: 0.2, screen: false, iris: 50 }, [], 'eye'],
  ['conj', 'Punti coniugati', 'Sette posizioni della lente, ogni volta lo schermo dove l\'immagine è nitida: i punti 1/p, 1/q stanno su una retta che taglia gli assi in 1/f', { x1: 0.14, xs: 0.5, plotKind: 'inv', iris: 20 }, [{ clear: true }, ...conj], 'overview'],
  ['bessel', 'Metodo di Bessel', 'Oggetto e schermo fermi a 50 cm: due posizioni della lente danno un\'immagine nitida. Dalla loro distanza d: f = (D² − d²)/(4D)', { x1: 0.12, xs: 0.5, plotKind: 'pq', iris: 20 }, [{ clear: true }, { bessel: 0 }, { wait: 0.8 }, { note: true }, { bessel: 1 }, { wait: 0.8 }, { note: true }], 'overview'],
  ['sphere', 'Aberrazione sferica', 'Fascio parallelo su una piano-convessa con la faccia piana verso la luce: i raggi del bordo vanno a fuoco prima. Girata va meglio; con il diaframma, quasi perfetta', { obj: 'beam', type1: 'planoconvex', flip1: true, f1: 10, x1: 0.2, xs: 0.3, iris: 50, rays: 'real' }, [{ focus: true }, { wait: 2.5 }, { set: { flip1: false } }, { focus: true }, { wait: 2.5 }, { set: { iris: 12 } }, { focus: true }], 'side'],
  ['chroma', 'Aberrazione cromatica', 'Il vetro devia di più il blu: una lente semplice ha un fuoco per ogni colore e il punto si orla di colori. Il doppietto acromatico li riunisce', { obj: 'beam', type1: 'biconvex', f1: 6, x1: 0.2, xs: 0.26, iris: 20, rays: 'real' }, [{ focus: true }, { wait: 3.5 }, { set: { type1: 'achromat' } }, { focus: true }], 'side'],
  ['kepler', 'Il cannocchiale', 'Obiettivo di 30 cm e oculare di 10 cm a 40 cm: la F lontana appare capovolta e tre volte più grande. L\'occhio è dove l\'oculare forma l\'immagine dell\'obiettivo', { obj: 'farF', f1: 30, x1: 0.15, lens2: true, f2: 10, x2: 0.55, screen: false, iris: 50 }, [], 'eye'],
];
const VIEWS = [['overview', 'Panoramica'], ['side', 'Di lato'], ['screen', 'Lo schermo'], ['eye', 'Nella lente'], ['top', 'Dall\'alto']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyTarget: [0.6, 0, 0], shadowBox: [-1.9, 1.9, 1.1, -1.1] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera, renderer } = stage;
  const optics = new Optics(renderer, H);
  const bench = new Bench(optics.lensMat, optics.rt.texture, optics.fTex);
  scene.add(bench.group);
  const rays = new Rays(H);
  scene.add(rays.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── stato derivato ─────────────────────────
  let L1 = null, L2 = null, key1 = '', key2 = '', surfs = [], focus = null, img = null, dirty = true, raysDirty = true;
  let records = [], recId = 0, colorI = 0, seq = null, anim = null, pendingView = null, view = 'overview', hover = null, photoRect = null;
  let fpsEma = 60, hudTimer = 0, msg = '', msgT = 0, alongAxis = false;
  const far = () => state.obj === 'farF' || state.obj === 'beam';
  const lastX = () => (state.lens2 ? state.x2 : state.x1);
  const f1 = () => L1.f, f2 = () => (L2 ? L2.f : null);

  /** Tiene i cavalieri in ordine: oggetto, prima lente, seconda lente, schermo. */
  function normalize(moved) {
    const s = state, cl = (v, a, b) => Math.min(Math.max(v, a), b);
    s.x1 = cl(s.x1, 0.03, 1.5);
    if (s.lens2) {
      if (moved === 'x2') s.x2 = Math.max(s.x2, s.x1 + GAP); else if (s.x2 < s.x1 + GAP) s.x2 = s.x1 + GAP;
      s.x2 = cl(s.x2, s.x1 + GAP, 1.58);
      if (s.x2 - s.x1 < GAP) s.x1 = s.x2 - GAP;
    }
    if (s.screen) {
      if (moved === 'xs') s.xs = Math.max(s.xs, lastX() + GAP); else if (s.xs < lastX() + GAP) s.xs = lastX() + GAP;
      s.xs = Math.min(s.xs, 1.65);
      if (s.xs - lastX() < GAP) { if (s.lens2) { s.x2 = s.xs - GAP; s.x1 = Math.min(s.x1, s.x2 - GAP); } else s.x1 = s.xs - GAP; }
    }
  }

  /** Il sistema ottico (superfici, diaframma) per una data posizione della prima lente. */
  function system(x1 = state.x1) {
    const items = [{ lens: L1, x: x1 }];
    if (L2) items.push({ lens: L2, x: state.x2 });
    const r = state.iris / 2000;
    const iris = r < L1.a - 1e-5 ? { x: x1 + (bench.lens1.irisX ?? L1.T / 2 + 0.003), r } : null;
    return benchSurfaces(items, iris);
  }

  /** Lente sottile: posizione e altezza dell'immagine finale (e di quelle intermedie). */
  function thinChain() {
    const lenses = [{ x: state.x1, f: f1() }, ...(L2 ? [{ x: state.x2, f: f2() }] : [])];
    let xo = far() ? null : 0, h = F_TOP, ang = FAR_TOP;
    const steps = [];
    for (const L of lenses) {
      let x, hh, a = 0;
      if (xo === null) { x = L.x + L.f; hh = -L.f * Math.tan(ang); } else {
        const p = L.x - xo;
        if (Math.abs(p - L.f) < 1e-4) { x = null; a = h / L.f; } else { const q = (p * L.f) / (p - L.f); x = L.x + q; hh = (h * -q) / p; }
      }
      steps.push({ x, h: hh, lensX: L.x });
      if (x === null) { xo = null; ang = a; } else { xo = x; h = hh; }
    }
    const fin = steps[steps.length - 1];
    return { ...fin, real: fin.x !== null && fin.x > fin.lensX, steps };
  }

  function lensKey(t, f, fl) { return `${t}|${f}|${TYPES[t].asym && fl ? 1 : 0}`; }

  function rebuild() {
    const k1 = lensKey(state.type1, state.f1, state.flip1);
    if (k1 !== key1) { key1 = k1; L1 = makeLens(state.type1, state.f1 / 100, state.flip1); bench.setLens(bench.lens1, L1); }
    if (state.lens2) {
      const k2 = lensKey(state.type2, state.f2, state.flip2);
      if (k2 !== key2) { key2 = k2; L2 = makeLens(state.type2, state.f2 / 100, state.flip2); bench.setLens(bench.lens2, L2); }
    } else { L2 = null; key2 = ''; }
    bench.setIris(state.iris / 2000 < L1.a - 1e-5 ? state.iris / 2000 : null);
    bench.setObject(state.obj);
    bench.layout({ x1: state.x1, x2: state.x2, lens2: state.lens2, xs: state.xs, screen: state.screen });
    surfs = system();
    const indices = surfs.map((s) => (s.stop ? [1, 1, 1] : LAM.map((l) => nOf(s.glass, l))));
    // dove si campionano i raggi che arrivano sullo schermo: l'ultima apertura prima dello schermo
    const before = surfs.filter((s) => s.xmax < state.xs - 1e-4);
    const lastEl = before[before.length - 1];
    const ap = lastEl ? { x: lastEl.x, r: lastEl.stop ? lastEl.a * 1.02 : lastEl.a * 1.08 + 0.001 } : { x: 0, r: 0.032 };
    const obj = { F: [0, F_HALF, 0.02], point: [1, 0.0006, 0.02], farF: [2, FAR_HALF, BEAM_R], beam: [3, 0.0015, BEAM_R] }[state.obj];
    optics.maxFrames = QUALITY[state.quality];
    optics.setSystem(surfs, indices, { kind: obj[0], half: obj[1], radius: obj[2] }, { x: state.xs, on: state.screen }, ap);
    // il fuoco vero (raggi esatti, nel verde) per lo schermo e per «metti a fuoco»
    const sBefore = state.screen ? surfs.filter((s) => s.xmax < state.xs) : surfs;
    focus = sBefore.length ? bestFocus(sBefore, far() ? null : 0, LAM[1], BEAM_R) : null;
    img = thinChain();
    raysDirty = true;
  }

  function focusTarget() {
    const fx = bestFocus(surfs, far() ? null : 0, LAM[1], BEAM_R);
    return fx && fx.x > lastX() + GAP && fx.x < 1.65 ? fx.x : null;
  }
  /** Posizioni della prima lente che danno un'immagine nitida su uno schermo fermo (metodo di Bessel). */
  function besselPositions() {
    const g = (x) => { const fx = bestFocus(system(x), 0, LAM[1]); return fx ? fx.x - state.xs : null; };
    const roots = [];
    let xp = null, gp = null;
    for (let x = 0.04; x < state.xs - GAP; x += 0.004) {
      const v = g(x);
      if (v !== null && gp !== null && Math.sign(v) !== Math.sign(gp)) {
        let a = xp, b = x, ga = gp;
        for (let i = 0; i < 24; i++) { const m = (a + b) / 2, gm = g(m); if (gm === null || Math.sign(gm) === Math.sign(ga)) { a = m; ga = gm ?? ga; } else b = m; }
        roots.push((a + b) / 2);
      }
      xp = x; gp = v;
    }
    return roots;
  }

  // ───────────────────────── raggi ─────────────────────────
  function drawRays() {
    raysDirty = false;
    rays.begin();
    rays.group.visible = state.rays !== 'none';
    if (state.rays === 'none') { rays.end(); return; }
    const xEnd = state.screen ? state.xs : Math.min(X_END, Math.max(lastX() + 0.35, (img.real && img.x) ? img.x + 0.12 : 0));
    rays.seg('fine', RAIL.x0 + 0.02, 0, X_END, 0, COL.axis);
    // fuochi della prima lente (e della seconda)
    const marks = [[state.x1, f1()], ...(L2 ? [[state.x2, f2()]] : [])];
    for (const [x, f] of marks) for (const k of [-2, -1, 1, 2]) { const xm = x + k * f; if (xm > RAIL.x0 && xm < X_END) rays.tick(xm, Math.abs(k) === 1 ? 0.0045 : 0.0028, COL.mark); }
    if (!far() && state.obj === 'F') rays.arrow('solid', 0, F_TOP, COL.obj);
    if (state.rays === 'principal') principal(xEnd); else realRays(xEnd);
    rays.end();
  }

  /** Costruzione con le lenti sottili: tre raggi dalla cima dell'oggetto, prolungati dove serve. */
  function principal(xEnd) {
    const lenses = [{ x: state.x1, f: f1() }, ...(L2 ? [{ x: state.x2, f: f2() }] : [])];
    const L0 = lenses[0];
    let starts;
    if (far()) {
      // la luce dalla cima della F lontana arriva inclinata e tutta parallela: un raggio che sulla lente sta
      // simmetrico a quello per il fuoco, uno per il centro, uno per il fuoco (esce parallelo all'asse)
      const u = state.obj === 'farF' ? -Math.tan(FAR_TOP) : 0;
      const y0 = (yl) => yl - u * L0.x;                   // altezza in x = 0 del raggio che arriva sulla lente a yl
      starts = u ? [[0, y0(-u * L0.f), u], [0, y0(0), u], [0, y0(u * L0.f), u]] : [[0, 0.012, 0], [0, 0, 0], [0, -0.012, 0]];
    } else {
      const h = state.obj === 'F' ? F_TOP : 0.012;
      starts = [[0, h, 0], [0, h, -h / L0.x]];
      if (Math.abs(L0.x - L0.f) > 0.004) starts.push([0, h, -h / (L0.x - L0.f)]);
    }
    const cols = [COL.par, COL.ctr, COL.foc];
    const xImg = img.x;
    starts.forEach(([x0, y0, u0], i) => {
      let x = x0, y = y0, u = u0;
      const col = cols[i % 3];
      for (const L of lenses) {
        if (L.x > xEnd) break;
        const yl = y + u * (L.x - x);
        rays.seg('solid', x, y, L.x, yl, col);
        x = L.x; y = yl; u -= yl / L.f;
      }
      const ye = y + u * (xEnd - x);
      if (xEnd > x) rays.seg('solid', x, y, xEnd, ye, col);
      // prolungamenti: verso un'immagine virtuale (all'indietro) o oltre lo schermo fino all'immagine reale
      if (xImg !== null && isFinite(xImg)) {
        if (!img.real) rays.seg('dash', x, y, xImg, y + u * (xImg - x), col);
        else if (state.screen && xImg > xEnd) rays.seg('dash', xEnd, ye, Math.min(xImg, X_END), y + u * (Math.min(xImg, X_END) - x), col);
      }
    });
    if (xImg !== null && isFinite(img.h) && xImg > RAIL.x0 && xImg < X_END && !(state.screen && img.real && xImg > state.xs + 0.002)) rays.arrow(img.real ? 'solid' : 'dash', xImg, img.h, COL.img);
  }

  /** Raggi veri: seguiti con la legge di Snell attraverso ogni superficie, in tre colori. */
  function realRays(xEnd) {
    const { RGB, WARM } = Rays.colors();
    const first = surfs[0];
    const run = (x0, y0, dx, dy, ch, color) => {
      const r = traceRay(surfs, x0, y0, dx, dy, LAM[ch]);
      const pts = r.pts.filter(([x]) => x <= xEnd + 1e-6);
      if (!r.blocked) { const [xl, yl] = r.pts[r.pts.length - 1]; if (xEnd > xl) pts.push([xEnd, yl + (r.dy / r.dx) * (xEnd - xl)]); }
      rays.path('thin', pts, color);
    };
    const n = 9, aim = first.a * 0.98;
    if (far()) {
      const u = state.obj === 'farF' ? -Math.tan(FAR_TOP) : 0;
      for (let i = 0; i < n; i++) {
        const h = -aim + (2 * aim * i) / (n - 1);
        if (Math.abs(h) > BEAM_R) continue;
        for (let ch = 0; ch < 3; ch++) run(0, h - u * first.x, 1, u, ch, RGB[ch]);
      }
      return;
    }
    // dal punto sull'asse (tre colori) e dalla cima dell'oggetto (luce bianca)
    for (let i = 0; i < n; i++) {
      const h = -aim + (2 * aim * i) / (n - 1);
      for (let ch = 0; ch < 3; ch++) run(0, 0, first.x, h, ch, RGB[ch]);
      if (state.obj === 'F') run(0, F_TOP, first.x, h - F_TOP, 1, WARM);
    }
  }

  // ───────────────────────── misure ─────────────────────────
  function blurAtScreen() {
    if (!state.screen || !focus) return null;
    return spotAt(focus, state.xs);
  }
  function note() {
    if (!state.screen) { say('Metti lo schermo per misurare'); return; }
    if (state.lens2) { say('Le misure di p e q valgono per una lente sola'); return; }
    if (far()) { say('Con l\'oggetto all\'infinito q è la focale: niente da annotare'); return; }
    const p = state.x1, q = state.xs - state.x1;
    records.push({ id: ++recId, color: COLORS[colorI++ % COLORS.length], p, q, f: f1(), key: key1, blur: blurAtScreen() });
    if (records.length > 30) records.splice(0, records.length - 30);
    plotDirty = true;
  }
  function fMeasured() {
    const rs = records.filter((r) => r.key === key1);
    if (!rs.length) return null;
    return { f: rs.length / rs.reduce((s, r) => s + 1 / r.p + 1 / r.q, 0), n: rs.length };
  }
  function say(t) { msg = t; msgT = 2.6; }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function animate(keyName, to, dur = 1.0) { anim = { key: keyName, from: state[keyName], to, t: 0, dur: Math.max(0.25, Math.min(dur, 0.6 + Math.abs(to - state[keyName]) * 2)) }; }
  function stepAnim(dt) {
    if (!anim) return;
    anim.t = Math.min(anim.t + dt / anim.dur, 1);
    const k = anim.t < 0.5 ? 4 * anim.t ** 3 : 1 - (-2 * anim.t + 2) ** 3 / 2;
    state[anim.key] = anim.from + (anim.to - anim.from) * k;
    normalize(anim.key); ui.refresh(); dirty = true;
    if (anim.t >= 1) anim = null;
  }
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); normalize(); ui.refresh(); ui.sync(); dirty = true; }
      if (st.move) { const [k, v] = Object.entries(st.move)[0]; animate(k, v); }
      if (st.focus) { if (dirty) rebuild(), (dirty = false); const fx = focusTarget(); if (fx !== null) animate('xs', fx); }
      if (st.bessel !== undefined) { const r = besselPositions(); if (r[st.bessel] !== undefined) animate('x1', r[st.bessel]); }
      if (st.note) { if (dirty) rebuild(), (dirty = false); note(); }
      if (st.clear) { records = []; colorI = 0; plotDirty = true; }
    }
    seq.t += dt;
    let done;
    if (st.move || st.focus || st.bessel !== undefined) done = !anim && seq.t > 0.05;
    else if (st.wait) done = seq.t >= st.wait;
    else done = seq.t > 0.05;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  let plotDirty = true;
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    fText: (k) => {
      const t = state[`type${k}`], f = TYPES[t].sign * state[`f${k}`];
      return `${fmt.signed(f, 1)} cm <small>· ${fmt.signed(100 / f, 1)} diottrie</small>`;
    },
    asymText: () => 'la faccia curva (o il crown) verso lo schermo',
    posText: (k) => {
      if (k === 'x1') return `${fmt.num(state.x1 * 100, 1)} cm <small>· p dall'oggetto</small>`;
      if (k === 'x2') return `${fmt.num(state.x2 * 100, 1)} cm <small>· ${fmt.num((state.x2 - state.x1) * 100, 1)} cm dalla prima</small>`;
      return `${fmt.num(state.xs * 100, 1)} cm <small>· ${fmt.num((state.xs - lastX()) * 100, 1)} cm dalla lente</small>`;
    },
    irisText: () => (L1 && state.iris / 1000 >= L1.D - 1e-4 ? `tutto aperto <small>· ⌀ ${fmt.num(L1.D * 1000, 0)} mm</small>` : `⌀ ${state.iris} mm`),
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        seq = null; anim = null;
        Object.assign(state, BASE, p[3]);
        normalize(); ui.refresh(); ui.sync(); dirty = true;
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'note': note(); break;
      case 'focus': { if (dirty) { rebuild(); dirty = false; } const fx = focusTarget(); if (!state.screen) say('Metti prima lo schermo'); else if (fx === null) say('Nessuna immagine reale sul banco'); else animate('xs', fx); break; }
      case 'clear': records = []; colorI = 0; plotDirty = true; break;
      case 'zoom':
        if (arg === 0) state.zoomAuto = true;
        else { state.zoomAuto = false; state.zoom = arg === 2 ? (state.zoom + 1) % ZOOMS.length : Math.max(0, Math.min(ZOOMS.length - 1, state.zoom + arg)); }
        break;
      case 'hover': hover = arg; break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'labels': break;
      case 'quality': stage.setQuality(state.quality); optics.maxFrames = QUALITY[state.quality]; optics.restart(); onResize(); break;
      case 'rays': raysDirty = true; break;
      case 'x1': case 'x2': case 'xs': seq = null; anim = null; normalize(k); ui.refresh(); dirty = true; break;
      default: seq = null; normalize(); ui.refresh(); ui.sync(); dirty = true; break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const tObj = tags.add('Oggetto', '', (o) => o.set(-0.03, H + 0.065, 0));
  const tL1 = tags.add('Lente', '', (o) => o.set(state.x1, H + 0.05, 0));
  const tL2 = tags.add('Seconda lente', '', (o) => o.set(state.x2, H + 0.05, 0), () => state.lens2);
  tags.add('Schermo', '', (o) => o.set(state.xs, H + 0.125, 0), () => state.screen);
  const fTags = ['2F', 'F', 'F′', '2F′'].map((t, i) => tags.add(t, 'floor', (o) => o.set(state.x1 + [-2, -1, 1, 2][i] * f1() * (f1() > 0 ? 1 : -1), H - 0.012, 0), () => state.rays !== 'none' && L1 && !alongAxis));

  // ───────────────────────── inquadrature ─────────────────────────
  const V = (...p) => new THREE.Vector3(...p);
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
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.05, hi = 40;
      for (let k = 0; k < 30; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Hh;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  function viewPose(id) {
    const xe = Math.max(state.screen ? state.xs : 0, lastX() + 0.12, img && img.real && img.x ? Math.min(img.x, X_END) : 0);
    const span = [V(-0.2, 0, 0), V(xe + 0.04, 0, 0), V(-0.2, H + 0.07, 0), V(xe + 0.04, H + (state.screen ? 0.12 : 0.05), 0)];
    switch (id) {
      case 'side': return fitPose(V(0, 0.1, 1).normalize(), [V(-0.06, H - 0.06, 0), V(xe + 0.03, H - 0.06, 0), V(-0.06, H + 0.06, 0), V(xe + 0.03, H + 0.06, 0)]);
      case 'screen': return { pos: [state.xs - 0.55, H + 0.07, 0.3], target: [state.xs, H, 0] };
      case 'eye': {
        // con due lenti l'occhio va sulla pupilla d'uscita: l'immagine della prima lente formata dalla seconda
        let x = lastX() + 0.22;
        if (L2) { const p = state.x2 - state.x1, q = (p * f2()) / (p - f2()); x = state.x2 + (q > 0.01 && q < 0.3 ? q : 0.07); }
        if (state.screen && x > state.xs - 0.03) x = (lastX() + state.xs) / 2;     // l'occhio non può stare dietro lo schermo
        return { pos: [x, H + 0.003, 0.0005], target: [x - 0.4, H, 0] };
      }
      case 'top': return fitPose(V(0, 1, 0.08).normalize(), span);
      default: return fitPose(V(-0.42, 0.48, 1).normalize(), span);
    }
  }
  function setView(id, instant = false) {
    view = id;
    if (dirty) { rebuild(); dirty = false; }
    const v = viewPose(id);
    stage.controls.minDistance = id === 'eye' ? 0.02 : 0.04;
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── trascinamento lungo la rotaia ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3(), plane = new THREE.Plane();
  let drag = null, hoverTick = 0;
  const ancestorsVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(bench.dragTargets, false).find((h) => h.object.parent && ancestorsVisible(h.object));
  };
  const KEY = { lens1: 'x1', lens2: 'x2', screen: 'xs' };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) return;
    const steep = Math.abs(camera.getWorldDirection(v3).y) > 0.5;
    plane.setFromNormalAndCoplanarPoint(steep ? v3.set(0, 1, 0) : v3.set(0, 0, 1), hit.point);
    const key = KEY[hit.object.userData.drag];
    drag = { key, offset: hit.point.x - state[key] };
    seq = null; anim = null;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('sliding');
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, v3)) {
        state[drag.key] = Math.round((v3.x - drag.offset) * 1000) / 1000;
        normalize(drag.key); ui.refresh(); dirty = true;
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !!pick(e));
  }, { capture: true });
  const endDrag = (e) => {
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
    else if (k === 'a') note();
    else if (k === 'm') document.getElementById('focus').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  function onResize() {
    const w = window.innerWidth, hh = window.innerHeight, lay = ui.layout();
    stage.resize(w, hh, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((hh - lay.metricsTop) / 2) : 0);
    photoRect = ui.photoRect();
  }
  window.addEventListener('resize', onResize);
  new ResizeObserver(() => { photoRect = ui.photoRect(); }).observe(document.getElementById('live'));

  // ───────────────────────── riquadro e misure ─────────────────────────
  const zoomView = () => {
    const z = ZOOMS[state.zoom];
    const hx = SCREEN_W / 2 / z, hy = hx * (photoRect && photoRect.w > 1 ? photoRect.h / photoRect.w : 2 / 3);
    return { cx: 0, cy: 0, hx, hy };
  };
  /** Zoom automatico: l'immagine (o la macchia) occupa una buona parte del riquadro. */
  function autoZoom() {
    if (!state.screen || !focus) return 0;
    const sDist = state.xs - lastX(), blur = 2 * (spotAt(focus, state.xs) || 0);
    let ext;
    if (state.obj === 'F' || state.obj === 'farF') {
      const qDist = img.x !== null ? img.x - lastX() : Infinity;
      ext = Math.abs(img.h || 0) * (isFinite(qDist) && qDist > 0 ? sDist / qDist : 1) + blur;
    } else ext = 4 * blur + 0.0003;
    let i = 0;
    while (i < ZOOMS.length - 1 && SCREEN_H / 2 / ZOOMS[i + 1] >= ext * 1.6) i++;
    return i;
  }
  function hud() {
    const s = state, p = s.x1, sScr = s.xs - lastX(), bl = blurAtScreen();
    // lo schermo è al fuoco migliore se la macchia è poco più grande della più piccola possibile;
    // è «a fuoco» se quella macchia è anche piccola (con molta aberrazione resta larga anche al fuoco migliore)
    const onBench = focus && focus.x < X_END;
    const best = bl !== null && onBench && bl < Math.max(1.3 * focus.rms, focus.rms + 0.00012);
    const sharp = best && focus.rms < 0.0004;
    let status;
    if (msgT > 0) status = msg;
    else if (!s.screen) status = img.x === null ? 'immagine all\'infinito' : img.real ? 'schermo tolto' : 'immagine virtuale';
    else if (!focus) status = img.x === null ? 'immagine all\'infinito' : 'nessuna immagine reale';
    else if (!onBench) status = 'immagine nitida oltre la rotaia';
    else status = sharp ? 'a fuoco' : best ? 'al fuoco migliore · aberrazioni' : (s.xs < focus.x ? 'sfocata · schermo troppo vicino' : 'sfocata · schermo troppo lontano');
    ui.setStatus(status, !optics.converged);
    const m = img.x !== null && !far() && isFinite(img.h) ? img.h / F_TOP : null;
    ui.setExif(far() ? 'oggetto all\'infinito' : `p ${fmt.num(p * 100, 1)} cm`, s.screen ? `schermo ${fmt.num(sScr * 100, 1)} cm` : 'schermo tolto', bl !== null ? (sharp ? `macchia ⌀ ${fmt.num(bl * 2000, 2)} mm` : `macchia ⌀ ${fmt.num(bl * 2000, 1)} mm`) : '');
    const z = zoomView();
    if (photoRect) {
      const bar = [0.002, 0.005, 0.01, 0.02, 0.05].find((b) => b >= z.hx * 0.25) || 0.05;
      ui.setScale((bar / (2 * z.hx)) * photoRect.w, bar >= 0.01 ? `${fmt.num(bar * 100, 0)} cm` : `${fmt.num(bar * 1000, 0)} mm`);
    }
    ui.setZoomInfo(`${ZOOMS[state.zoom]}×`, state.zoomAuto);
    ui.setPhotoNote(s.screen ? '' : img.x !== null && !img.real ? 'Schermo tolto · l\'immagine è virtuale: guardala nella lente (vista «Nella lente»)' : 'Schermo tolto · guarda attraverso la lente (vista «Nella lente»)');
    if (hover) ui.setCursor(`z ${fmt.signed(((hover[0] - 0.5) * 2 * z.hx) * 1000, 1)} · y ${fmt.signed(((0.5 - hover[1]) * 2 * z.hy) * 1000, 1)} mm`); else ui.setCursor('');
    // fascia delle misure
    const f = f1(), cells = [];
    cells.push({ k: L2 ? 'Prima lente' : 'Lente', v: `${fmt.signed(f * 100, 1)} <small>cm</small>`, s: `${fmt.signed(1 / f, 1)} diottrie · ${TYPES[s.type1].label.toLowerCase()}`, title: 'Distanza focale e potere diottrico (1/f in metri)' });
    if (L2) cells.push({ k: 'Seconda lente', v: `${fmt.signed(f2() * 100, 1)} <small>cm</small>`, s: `a ${fmt.num((s.x2 - s.x1) * 100, 1)} cm dalla prima` });
    if (far()) cells.push({ k: 'Oggetto', v: '∞', s: s.obj === 'farF' ? `F alta ${fmt.num((2 * FAR_TOP * 180) / Math.PI, 1)}°` : 'fascio parallelo' });
    else {
      const r = p / Math.abs(f);
      const where = f < 0 ? 'davanti a una divergente' : r > 2.02 ? 'oltre 2f' : r > 1.98 ? 'in 2f' : r > 1.005 ? 'fra f e 2f' : r > 0.995 ? 'nel fuoco' : 'dentro la focale';
      cells.push({ k: 'Oggetto · p', v: `${fmt.num(p * 100, 1)} <small>cm</small>`, s: where });
    }
    if (img.x === null) cells.push({ k: 'Immagine · q', v: '∞', s: 'raggi paralleli' });
    else {
      const q = img.x - lastX();
      cells.push({ k: 'Immagine · q', v: `${fmt.signed(q * 100, 1)} <small>cm</small>`, s: img.real ? 'reale, dopo la lente' : 'virtuale, dalla parte dell\'oggetto', title: 'Dalla formula delle lenti sottili, 1/p + 1/q = 1/f (q negativa: immagine virtuale)' });
    }
    if (m !== null) cells.push({ k: 'Ingrandimento', v: `${fmt.signed(m, 2)} <small>×</small>`, s: `${m < 0 ? 'capovolta' : 'diritta'}, ${Math.abs(m) > 1.02 ? 'ingrandita' : Math.abs(m) < 0.98 ? 'rimpicciolita' : 'stessa grandezza'}`, title: 'm = −q/p' });
    else if (s.obj === 'farF' && img.x !== null) cells.push({ k: 'Sul piano focale', v: `${fmt.num(Math.abs(img.h) * 1000, 1)} <small>mm</small>`, s: 'altezza della F: f·tan α' });
    const fm = fMeasured();
    cells.push(fm ? { k: 'f dalle misure', p: 2, v: `${fmt.num(fm.f * 100, 2)} <small>cm</small>`, s: `${fm.n} ${fm.n === 1 ? 'misura' : 'misure'} · f = 1/⟨1/p + 1/q⟩` } : { k: 'f dalle misure', p: 2, v: '—', s: 'annota qualche immagine nitida (A)' });
    // metodo di Bessel: le ultime due misure con la stessa distanza oggetto–schermo
    const rs = records.filter((r) => r.key === key1);
    if (rs.length >= 2) {
      const a = rs[rs.length - 2], b = rs[rs.length - 1], D = a.p + a.q, d = Math.abs(b.p - a.p);
      if (Math.abs(b.p + b.q - D) < 0.002 && d > 0.01) cells.push({ k: 'Metodo di Bessel', p: 3, v: `${fmt.num(((D * D - d * d) / (4 * D)) * 100, 2)} <small>cm</small>`, s: `D ${fmt.num(D * 100, 1)} · d ${fmt.num(d * 100, 1)} cm · f = (D² − d²)/(4D)` });
    }
    ui.setMetrics(cells);
    tags.setText(tL1, `${L2 ? 'Obiettivo' : 'Lente'} · ${fmt.signed(f * 100, 0)} cm`);
    if (L2) tags.setText(tL2, `${f2() > 0 && L2 ? 'Oculare' : 'Seconda lente'} · ${fmt.signed(f2() * 100, 0)} cm`);
    tags.setText(tObj, { F: 'Oggetto: la F', point: 'Forellino illuminato', farF: 'Collimatore: F all\'infinito', beam: 'Collimatore: fascio parallelo' }[s.obj]);
    fTags.forEach((t, i) => tags.setText(t, f1() > 0 ? ['2F', 'F', 'F′', '2F′'][i] : ['2F′', 'F′', 'F', '2F'][i]));
  }

  function drawPlot() {
    plotDirty = false;
    const f = f1(), rs = records.filter((r) => r.key === key1), fm = fMeasured();
    if (state.plotKind === 'inv') {
      const P = Math.max(f > 0 ? 1.15 / f : 12, ...rs.map((r) => 1 / r.p + 0.5));
      const x = [], y = [], y2 = [];
      for (let i = 0; i <= 60; i++) { const xi = (P * i) / 60; x.push(xi); y.push(1 / f - xi); y2.push(fm ? 1 / fm.f - xi : NaN); }
      const pts = rs.map((r) => ({ x: 1 / r.p, y: 1 / r.q, color: r.color, r: 7 }));
      if (state.screen && !far() && !state.lens2) pts.push({ x: 1 / state.x1, y: 1 / (state.xs - state.x1), color: '#15181c', r: 6, ring: true });
      ui.drawPlot({ series: [{ x, y, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 }, ...(fm ? [{ x, y: y2, color: '#e8452c', width: 2.2 }] : [])], points: pts, X0: 0, X1: P, Y0: 0, Y1: P, xLabel: '1/p (1/m)', yLabel: '1/q (1/m)', legend: [[`teoria 1/f = ${fmt.num(1 / f, 1)}`, '#15181c'], ...(fm ? [[`misure: f = ${fmt.num(fm.f * 100, 2)} cm`, '#e8452c']] : [])] });
      return;
    }
    const PM = 100, x = [], y = [];
    for (let i = 0; i <= 200; i++) { const p = (PM * i) / 200; x.push(p); const q = (p * f * 100) / (p - f * 100); y.push(q > 0 && q < 400 ? q : NaN); }
    const pts = rs.map((r) => ({ x: r.p * 100, y: r.q * 100, color: r.color, r: 7 }));
    if (state.screen && !far() && !state.lens2) pts.push({ x: state.x1 * 100, y: (state.xs - state.x1) * 100, color: '#15181c', r: 6, ring: true });
    const fl = [], hl = [];
    for (let i = 0; i <= 1; i++) { fl.push(i * PM); hl.push(f * 100); }
    ui.drawPlot({ series: [{ x, y, color: '#15181c', width: 2.2, alpha: 0.75 }, { x: fl, y: hl, color: '#9aa1ab', width: 1.6, dash: [4, 5] }], points: pts, marks: f > 0 ? [{ x: f * 100, color: '#9aa1ab' }] : [], X0: 0, X1: PM, Y0: 0, Y1: PM, xLabel: 'p (cm)', yLabel: 'q (cm)', legend: [['q = p·f/(p − f)', '#15181c'], ['asintoti in f', '#9aa1ab']] });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    stepAnim(dt);
    stepSeq(dt);
    if (dirty) { dirty = false; rebuild(); plotDirty = true; }
    if (pendingView) { setView(pendingView); pendingView = null; }
    if (raysDirty) drawRays();
    if (state.zoomAuto) state.zoom = autoZoom();
    optics.full.active = state.screen;                 // senza schermo non c'è nulla da calcolare
    optics.setZoomWindow(state.screen && state.zoom > 0 ? zoomView() : null);
    optics.accumulate();
    const gain = optics.gainFor(GAIN);
    bench.paper.emissiveIntensity = gain;
    const LU = optics.lensU;
    LU.uScrGain.value = gain; LU.uAmb.value = state.ambient;
    LU.uHorizon.value.copy(stage.sky.material.uniforms.horizon.value); LU.uZenith.value.copy(stage.sky.material.uniforms.zenith.value);
    if (msgT > 0) msgT -= dt;
    stage.update(dt);
    // guardando lungo l'asse (dentro la lente) i raggi disegnati si ridurrebbero a una riga che taglia la vista
    const dir = camera.getWorldDirection(v3);
    alongAxis = Math.abs(dir.x) > 0.93 && Math.abs(camera.position.y - H) < 0.04 && Math.abs(camera.position.z) < 0.04;
    rays.group.visible = state.rays !== 'none' && !alongAxis;
    tags.update(camera, w, hh, state.labels && !alongAxis);
    stage.render();
    if (photoRect && photoRect.w > 1) optics.present(photoRect, hh, zoomView(), GAIN, state.ambient);
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.12) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud(); if (plotDirty) drawPlot(); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  rebuild(); dirty = false;
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, bench, optics, rays, records: () => records, seq: () => seq, anim: () => anim, focus: () => focus, img: () => img, surfs: () => surfs, L1: () => L1, setView, plotView, besselPositions, focusTarget, THREE, markDirty: () => { dirty = true; } };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
