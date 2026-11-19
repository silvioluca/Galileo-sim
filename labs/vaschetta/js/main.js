// main.js — La vaschetta ondoscopica
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { kOf, lambdaOf, speedOf, lambdaGravity, PLATE_DEPTH, twoSources, slits, dopplerFront, dopplerBack, machAngle } from './ripple.js';
import { RippleSim } from './tank.js';
import { Rig, HALF, GLASS_Y, WATER_Y, LAMP_Y, PAPER_Y, LAMP_STAND, MIRROR, SCREEN } from './rig.js';
import { createUI, fmt } from './ui.js';

const N = 400, DX = (2 * HALF) / N, DT = (0.9 * DX) / (0.3 * Math.SQRT2);
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const X_SRC = -0.1, X_BAR = -0.17, X_BARRIER = -0.02, BAR_Z = 0.185, MOVE_X0 = -0.17, MOVE_X1 = 0.17;
// contrasto dell'immagine: (n − 1)·distanza fra l'acqua e il foglio, con un poco di contrasto in più. Con la lampada a
// distanza a conta la distanza efficace d·a/(a + d): lo schermo, a cui la luce arriva passando per lo specchio, è
// più lontano del foglio e le creste vi fanno righe più nette.
const effD = (d) => (d * (LAMP_Y - WATER_Y)) / (LAMP_Y - WATER_Y + d);
const K_PAPER = 1.5 * 0.333 * (WATER_Y - PAPER_Y);
const K_SCREEN = (K_PAPER * effD(WATER_Y - MIRROR.c + SCREEN.z)) / effD(WATER_Y - PAPER_Y);
const AMP_K = 0.3;                                             // forza delle sorgenti per unità di «ampiezza»
const DEG = Math.PI / 180;

const state = {
  src: 'point', f: 12, amp: 5, d: 5, phase: 0, u: 0.12, obs: 'none', a: 1.5, ds: 4, ang: 30, depth: 6, beaches: true,
  look: 'proj', mirror: false, strobe: false, dstrobe: 0.3, line: false, xl: 12, slow: 1, ambient: 0.6, outline: false, labels: true, quality: 'low', plotKind: 'axis',
};
const BASE = { src: 'point', f: 12, amp: 5, d: 5, phase: 0, u: 0.12, obs: 'none', a: 1.5, ds: 4, ang: 30, depth: 6, beaches: true, look: 'proj', strobe: false, dstrobe: 0.3, line: false, xl: 12, slow: 1, ambient: 0.6, plotKind: 'axis' };
const MEDIUM = new Set(['f', 'depth', 'obs', 'a', 'ds', 'ang', 'beaches']);

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const PRESETS = [
  ['circ', 'Onde circolari', 'Una punta a 12 Hz: fronti circolari che si allargano tutti alla stessa velocità, a una lunghezza d\'onda l\'uno dall\'altro', { src: 'point', f: 12, plotKind: 'axis' }, [{ gen: true }, { wait: 3 }, { note: true }], 'paper'],
  ['disp', 'λ e frequenza', 'Onde piane a 6, 10, 15, 20 e 25 Hz: λ si accorcia ma meno che come 1/f, e la velocità cambia appena: le increspature sono un poco dispersive', { src: 'bar', plotKind: 'disp' }, [6, 10, 15, 20, 25].flatMap((f) => [{ set: { f } }, { gen: true }, { wait: 3 }, { note: true }]), 'paper'],
  ['interf', 'Due sorgenti', 'Due punte in fase a 5 cm, 15 Hz: le linee nodali, dove le onde arrivano in opposizione, stanno ferme. Poi a 8 cm: più fitte', { src: 'two', d: 5, f: 15, line: true, xl: 12, plotKind: 'line' }, [{ gen: true }, { wait: 4 }, { set: { look: 'amp' } }, { wait: 3 }, { set: { d: 8, look: 'proj' } }, { wait: 4 }, { set: { look: 'amp' } }, { wait: 3 }], 'paper'],
  ['slit', 'Diffrazione', 'Onde piane contro una fenditura larga 5 cm e poi 1,2 cm: più è stretta rispetto a λ, più l\'onda si allarga oltre', { src: 'bar', f: 12, obs: 'slit', a: 5, line: true, xl: 12, plotKind: 'line' }, [{ gen: true }, { wait: 5 }, { set: { a: 1.2 } }, { wait: 5 }], 'paper'],
  ['young', 'Due fenditure', 'Onde piane su due fenditure a 4 cm: oltre si comportano come due punte in fase, e compaiono le linee nodali', { src: 'bar', f: 15, obs: 'double', a: 1, ds: 4, line: true, xl: 12, plotKind: 'line' }, [{ gen: true }, { wait: 5 }, { set: { look: 'amp' } }, { wait: 3 }], 'paper'],
  ['reflect', 'Riflessione', 'Onde piane contro una parete inclinata di 30°: l\'onda riflessa se ne va con lo stesso angolo', { src: 'bar', f: 12, obs: 'wall', ang: 30, plotKind: 'axis' }, [{ gen: true }, { wait: 6 }], 'paper'],
  ['mirror', 'Lo specchio parabolico', 'Le onde piane riflesse dalla parabola convergono nel suo fuoco, e da lì ripartono circolari', { src: 'bar', f: 12, obs: 'mirror', plotKind: 'axis' }, [{ gen: true }, { wait: 6 }], 'paper'],
  ['refract', 'Rifrazione', 'Sopra la lastra l\'acqua è bassa e le onde rallentano: λ si accorcia e il fronte si piega verso la normale', { src: 'bar', f: 10, obs: 'plate', ang: 35, plotKind: 'axis' }, [{ gen: true }, { wait: 6 }], 'paper'],
  ['lens', 'Una lente per le onde', 'Una lastra a forma di lente biconvessa: le onde, più lente dove è spessa, convergono in un fuoco come la luce', { src: 'bar', f: 10, obs: 'lens', plotKind: 'axis' }, [{ gen: true }, { wait: 6 }], 'paper'],
  ['doppler', 'Doppler e onda d\'urto', 'La punta corre a metà della velocità delle onde: davanti λ si accorcia, dietro si allunga. Poi corre più veloce delle onde: il cono di Mach. A metà corsa l\'immagine si ferma qualche secondo', { src: 'move', f: 12, u: 0.12, plotKind: 'axis' }, [{ gen: true }, { moveTo: 0.08 }, { hold: 3.5 }, { set: { u: 0.36 } }, { gen: true }, { moveTo: 0.1 }, { hold: 4 }], 'paper'],
];
const VIEWS = [['overview', 'Panoramica'], ['top', 'Dall\'alto'], ['paper', 'L\'immagine'], ['tank', 'L\'acqua']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.2, 3.05, 2.4], keyTarget: [0, 0.35, 0], shadowBox: [-1.3, 1.3, 1.3, -0.9], shadowFar: 8, fog: [10, 60] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera, renderer } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const sim = new RippleSim(renderer, N, 2 * HALF);
  rig.waterU.uTexel.value = 1 / N; rig.waterU.uDx.value = DX;
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── stato ─────────────────────────
  let hold = 0, genOn = true, paused = false, acc = 0, offFor = 0, moveT = 0, strobePh = 0, onT = 0, drvPh = 0, seq = null, pendingView = null, view = 'overview';
  let records = [], recId = 0, colorI = 0, plotAt = 0, readAt = 0, metricsAt = 0, fpsEma = 60, hudTimer = 0;
  let rowData = null, colData = null, lamMeas = null, mediumKey = '', geo = null, geoKey = '', obstKey = '', mediumDirty = false, reading = false;
  const rowBuf = new Float32Array(N * 4), colBuf = new Float32Array(N * 4);
  const h = () => state.depth / 1000;
  const lam = () => lambdaOf(state.f, h());
  const vel = () => speedOf(state.f, h());
  const moving = () => genOn || offFor < 12 || !!seq;

  // ───────────────────────── il mezzo: ostacoli, lastre, spiagge ─────────────────────────
  function prims() {
    const W = 0.004, P = [];
    if (state.obs === 'slit' || state.obs === 'double') {
      const a = state.a / 100, x = X_BARRIER, e = HALF + 0.01;
      const gaps = state.obs === 'slit' ? [[-a / 2, a / 2]] : [[-state.ds / 200 - a / 2, -state.ds / 200 + a / 2], [state.ds / 200 - a / 2, state.ds / 200 + a / 2]];
      let z = -e;
      for (const [g0, g1] of gaps) { if (g0 > z) P.push({ type: 'seg', a: [x, z], b: [x, g0], w: W }); z = g1; }
      P.push({ type: 'seg', a: [x, z], b: [x, e], w: W });
    } else if (state.obs === 'wall') {
      const t = state.ang * DEG, c = [0.07, 0], L = 0.13;
      P.push({ type: 'seg', a: [c[0] - L * Math.sin(t), c[1] - L * Math.cos(t)], b: [c[0] + L * Math.sin(t), c[1] + L * Math.cos(t)], w: W });
    } else if (state.obs === 'mirror') {
      const xv = 0.16, fp = 0.06, n = 30;
      for (let i = 0; i < n; i++) {
        const z0 = -0.15 + (0.3 * i) / n, z1 = -0.15 + (0.3 * (i + 1)) / n;
        P.push({ type: 'seg', a: [xv - (z0 * z0) / (4 * fp), z0], b: [xv - (z1 * z1) / (4 * fp), z1], w: W });
      }
    } else if (state.obs === 'plate') {
      const t = state.ang * DEG, p0 = [-0.03, 0], tv = [Math.sin(t), Math.cos(t)], nv = [Math.cos(t), -Math.sin(t)];
      const quad = [[p0[0] - 0.6 * tv[0], p0[1] - 0.6 * tv[1]], [p0[0] + 0.6 * tv[0], p0[1] + 0.6 * tv[1]], [p0[0] + 0.6 * tv[0] + 0.6 * nv[0], p0[1] + 0.6 * tv[1] + 0.6 * nv[1]], [p0[0] - 0.6 * tv[0] + 0.6 * nv[0], p0[1] - 0.6 * tv[1] + 0.6 * nv[1]]];
      P.push({ type: 'plate', poly: clipSquare(quad, HALF - 0.002), p0, nv });
    } else if (state.obs === 'lens') {
      P.push({ type: 'lens', c: [0.02, 0], R: 0.09, t: 0.05 });
    }
    return P;
  }
  /** Ritaglia un poligono convesso nel quadrato |x|, |z| ≤ s (Sutherland–Hodgman). */
  function clipSquare(poly, s) {
    let out = poly;
    for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
      const inp = out; out = [];
      const inside = (p) => sg * p[ax] <= s;
      for (let i = 0; i < inp.length; i++) {
        const A = inp[i], B = inp[(i + 1) % inp.length];
        if (inside(A)) out.push(A);
        if (inside(A) !== inside(B)) { const tt = (sg * s - A[ax]) / (B[ax] - A[ax]); out.push([A[0] + tt * (B[0] - A[0]), A[1] + tt * (B[1] - A[1])]); }
      }
    }
    return out;
  }
  /** Le maschere della geometria, che non cambiano con la frequenza né con la profondità: le pareti (ogni segmento
   *  disegnato solo nel suo riquadro) e l'acqua bassa sopra la lastra o la lente. */
  function buildGeo() {
    const P = prims(), solid = new Uint8Array(N * N), shallow = new Uint8Array(N * N);
    const X = (i) => -HALF + (i + 0.5) * DX, Z = (j) => HALF - (j + 0.5) * DX, I = (x) => (x + HALF) / DX - 0.5, J = (z) => (HALF - z) / DX - 0.5;
    for (const s of P) {
      if (s.type !== 'seg') continue;
      const ax = s.b[0] - s.a[0], az = s.b[1] - s.a[1], L2 = ax * ax + az * az, r = s.w / 2;
      const i0 = Math.max(0, Math.floor(I(Math.min(s.a[0], s.b[0]) - r))), i1 = Math.min(N - 1, Math.ceil(I(Math.max(s.a[0], s.b[0]) + r)));
      const j0 = Math.max(0, Math.floor(J(Math.max(s.a[1], s.b[1]) + r))), j1 = Math.min(N - 1, Math.ceil(J(Math.min(s.a[1], s.b[1]) - r)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = X(i), z = Z(j), t = Math.max(0, Math.min(1, ((x - s.a[0]) * ax + (z - s.a[1]) * az) / L2));
        if (Math.hypot(x - s.a[0] - t * ax, z - s.a[1] - t * az) < r) solid[j * N + i] = 1;
      }
    }
    const plate = P.find((p) => p.type === 'plate'), lens = P.find((p) => p.type === 'lens');
    if (plate || lens) {
      const o = lens ? lens.R - lens.t / 2 : 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = X(i), z = Z(j);
        const low = plate ? (x - plate.p0[0]) * plate.nv[0] + (z - plate.p0[1]) * plate.nv[1] > 0 : Math.hypot(x - (lens.c[0] - o), z - lens.c[1]) < lens.R && Math.hypot(x - (lens.c[0] + o), z - lens.c[1]) < lens.R;
        if (low) shallow[j * N + i] = 1;
      }
    }
    return { P, solid, shallow };
  }
  function buildMedium(force) {
    mediumDirty = false;
    const gk = ['obs', 'a', 'ds', 'ang'].map((k) => state[k]).join('|');
    if (gk !== geoKey || !geo) { geo = buildGeo(); geoKey = gk; }
    const key = [gk, state.f, state.depth, state.beaches].join('|');
    if (key === mediumKey && !force) return;
    mediumKey = key;
    const cD = speedOf(state.f, h()), cS = speedOf(state.f, PLATE_DEPTH), k = kOf(state.f, h()), beta = 0.4 + 1.6e-6 * k * k;
    const { solid, shallow } = geo;
    const damp = state.beaches ? (x, z) => { const d = HALF - Math.max(Math.abs(x), Math.abs(z)); return beta + (d < 0.03 ? 30 * ((0.03 - d) / 0.03) ** 2 : 0); } : () => beta;
    sim.setMedium((x, z, n) => (shallow[n] ? cS : cD), damp, (x, z, n) => solid[n] === 1, DT);
    const ok = `${gk}|${state.depth}`;
    if (ok !== obstKey || force) { obstKey = ok; rig.setObstacles(geo.P, h()); }
    rig.setDepth(h()); rig.setBeaches(state.beaches);
  }

  // ───────────────────────── sorgenti ─────────────────────────
  const moveX = () => Math.min(MOVE_X1, MOVE_X0 + state.u * moveT);
  function sources() {
    const on = genOn;
    if (state.src === 'point') return { pts: [[X_SRC, 0, 0]], bar: null, on };
    if (state.src === 'two') { const d = state.d / 200; return { pts: [[X_SRC, d, 0], [X_SRC, -d, state.phase * DEG]], bar: null, on }; }
    if (state.src === 'bar') return { pts: [], bar: { x: X_BAR, z0: -BAR_Z, z1: BAR_Z }, on };
    return { pts: [[moveX(), 0, 0]], bar: null, on };
  }
  function toggleGen() { genOn = !genOn; if (genOn) { offFor = 0; moveT = 0; onT = 0; if (state.src === 'move') sim.clear(); } }
  function reset() { sim.clear(); moveT = 0; offFor = genOn ? 0 : 99; acc = 0; }
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }

  // ───────────────────────── misure ─────────────────────────
  /** λ lungo l'asse (z = 0), fra la sorgente e il primo ostacolo: dalla frequenza spaziale più forte (trasformata
   *  di Fourier del tratto, con una finestra di Hann e il picco interpolato). Funziona anche con le onde riflesse,
   *  che hanno lo stesso k, e non risente di un livello medio che si sposta. */
  function measureLambda(row) {
    if (!row) return null;
    const x0 = (state.src === 'bar' ? X_BAR : state.src === 'move' ? moveX() : X_SRC) + 0.025;
    const x1 = state.obs === 'slit' || state.obs === 'double' ? X_BARRIER - 0.008 : state.obs === 'none' ? HALF - 0.032 : state.obs === 'plate' ? -0.035 : state.obs === 'lens' ? -0.05 : 0.0;
    const i0 = Math.max(0, Math.ceil((x0 + HALF) / DX - 0.5)), i1 = Math.min(N - 1, Math.floor((x1 + HALF) / DX - 0.5)), n = i1 - i0 + 1;
    const kt = kOf(state.f, h());
    if (n * DX < 2.5 * ((2 * Math.PI) / kt)) return null;
    let mean = 0; for (let i = i0; i <= i1; i++) mean += row[i * 4]; mean /= n;
    const P = (k) => {
      let re = 0, im = 0;
      for (let i = i0; i <= i1; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - i0)) / (n - 1)), v = (row[i * 4] - mean) * w, ph = k * (i - i0) * DX; re += v * Math.cos(ph); im += v * Math.sin(ph); }
      return re * re + im * im;
    };
    let best = 0, kb = 0;
    const ks = [];
    for (let k = 0.45 * kt; k <= 2.2 * kt; k += kt * 0.01) { const p = P(k); ks.push([k, p]); if (p > best) { best = p; kb = ks.length - 1; } }
    if (kb === 0 || kb === ks.length - 1 || best <= 0) return null;
    const [ka, pa] = ks[kb - 1], [, pb] = ks[kb], [, pc] = ks[kb + 1], dk = kt * 0.01;
    const shift = (0.5 * (pa - pc)) / (pa - 2 * pb + pc);
    return (2 * Math.PI) / (ka + dk * (1 + shift));
  }
  function note() {
    const l = lamMeas;
    records.push({ id: ++recId, color: COLORS[colorI++ % COLORS.length], f: state.f, depth: state.depth, lam: l, lamTh: lam(), src: state.src });
    if (records.length > 40) records.splice(0, records.length - 40);
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); buildMedium(); ui.refresh(); ui.sync(); }
      if (st.gen) {
        // se il vibratore è già acceso non riparte da fermo: le onde non si interrompono
        const was = genOn; genOn = true; offFor = 0;
        if (!was || state.src === 'move') { moveT = 0; onT = 0; }
        if (state.src === 'move') sim.clear();
      }
      if (st.note) { readNow(); note(); }
      if (st.hold) hold = st.hold;
    }
    seq.t += dt;
    let done = false;
    if (st.set || st.gen || st.note) done = seq.t > 0.1;
    else if (st.hold) done = hold <= 0;
    else if (st.moveTo !== undefined) done = moveX() >= st.moveTo || !genOn;
    else if (st.wait) done = seq.t >= st.wait;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    fText: () => `λ ${fmt.num(lam() * 100, 2)} cm`,
    vText: () => `v ${fmt.num(vel() * 100, 1)} cm/s`,
    dText: () => `${fmt.num(state.d / 100 / lam(), 1)} λ`,
    uText: () => `${fmt.num(state.u / vel(), 2)} volte v`,
    aText: () => `${fmt.num(state.a / 100 / lam(), 2)} λ`,
    lineText: () => `${fmt.num(state.xl - (state.src === 'bar' ? X_BAR : X_SRC) * 100, 1)} cm dalla sorgente`,
  }, (key, arg) => {
    // il mezzo si ricostruisce una volta per fotogramma, anche se il cursore manda molti eventi
    if (MEDIUM.has(key)) { seq = null; mediumDirty = true; ui.refresh(); ui.sync(); return; }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        if (p[3].plotKind === 'disp') records = [];
        stage.setAmbient(0.04 + 0.96 * state.ambient); rig.paperU.uRoom.value = state.ambient;
        buildMedium(true); reset(); genOn = false;
        ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'src': seq = null; moveT = 0; if (state.src === 'move') sim.clear(); ui.sync(); break;
      case 'go': seq = null; toggleGen(); break;
      case 'pause': togglePause(); break;
      case 'reset': seq = null; reset(); break;
      case 'note': readNow(); note(); break;
      case 'clear': seq = null; records = []; colorI = 0; break;
      case 'strobe': case 'line': case 'look': ui.sync(); break;
      case 'mirror': rig.setMirror(state.mirror); setView('paper'); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); rig.paperU.uRoom.value = state.ambient; break;
      case 'view': setView(arg); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); onResize(); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const V = (...p) => new THREE.Vector3(...p);
  tags.add('Lampada', '', (o) => o.set(0, LAMP_Y + 0.07, 0));
  tags.add('Vibratore', '', (o) => o.set(state.src === 'bar' ? X_BAR : X_SRC, WATER_Y + 0.17, -0.27), () => state.src !== 'move');
  tags.add('Carrello', '', (o) => o.set(moveX(), WATER_Y + 0.12, 0), () => state.src === 'move');
  tags.add('Il foglio: l\'immagine delle onde', '', (o) => o.set(0, PAPER_Y, 0.36), () => !state.mirror);
  tags.add('Lo schermo: l\'immagine delle onde', '', (o) => o.set(0, SCREEN.y1 + 0.014, SCREEN.z), () => state.mirror);
  tags.add('Specchio a 45°', '', (o) => o.set(0.27, 0.07, 0.1), () => state.mirror && view !== 'paper');
  const tObs = tags.add('', 'nocase', (o) => { if (state.obs === 'slit' || state.obs === 'double') o.set(X_BARRIER, GLASS_Y + 0.03, HALF - 0.03); else if (state.obs === 'mirror') o.set(0.13, GLASS_Y + 0.03, 0.12); else o.set(0.06, GLASS_Y + 0.02, 0.1); }, () => state.obs !== 'none');
  tags.add('Spiaggia di spugna', '', (o) => o.set(HALF - 0.012, GLASS_Y + 0.012, -0.15), () => state.beaches && view === 'tank');

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
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / H;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  function viewPose(id) {
    const P = 0.37, paper = [V(-P, PAPER_Y, -P), V(P, PAPER_Y, -P), V(-P, PAPER_Y, P), V(P, PAPER_Y, P)];
    const sx = SCREEN.w / 2 + 0.02, screen = [V(-sx, 0, SCREEN.z), V(sx, 0, SCREEN.z), V(-sx, SCREEN.y1 + 0.02, SCREEN.z), V(sx, SCREEN.y1 + 0.02, SCREEN.z)];
    switch (id) {
      case 'top': return fitPose(V(0, 2.6, 1).normalize(), paper);
      case 'paper': return state.mirror ? fitPose(V(0.08, 0.3, 1).normalize(), [...screen, V(0, WATER_Y + 0.02, -HALF)]) : fitPose(V(0.12, 0.5, 1).normalize(), [...paper, V(0, WATER_Y - 0.01, HALF + 0.02)]);
      case 'tank': return fitPose(V(0.3, 0.75, 1).normalize(), [V(-HALF, WATER_Y, -HALF), V(HALF, WATER_Y, -HALF), V(-HALF, WATER_Y, HALF), V(HALF, WATER_Y, HALF)]);
      default: return fitPose(V(0.45, 0.42, 1).normalize(), [...paper, ...(state.mirror ? screen : []), V(LAMP_STAND.x + 0.1, 0, LAMP_STAND.z - 0.08), V(0, LAMP_Y + 0.18, 0), V(LAMP_STAND.x, LAMP_Y + 0.18, LAMP_STAND.z), V(-0.3, WATER_Y + 0.15, 0.27)]);
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
    else if (k === 'a') { readNow(); note(); }
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });
  function onResize() {
    const w = window.innerWidth, hh = window.innerHeight, lay = ui.layout();
    stage.resize(w, hh, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((hh - lay.metricsTop) / 2) : 0);
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    rig.setMirrorRes(s.x / 2, s.y / 2);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── disegno ─────────────────────────
  /** Chiede alla scheda grafica la riga sull'asse e la colonna sulla linea di misura, senza aspettarla: una lettura
   *  sincrona fermava tutto per decine di millesimi di secondo, più volte al secondo, e le onde andavano a scatti. */
  function readNow() {
    if (reading) return;
    const i = Math.max(0, Math.min(N - 1, Math.round((state.xl / 100 + HALF) / DX - 0.5)));
    const a = sim.readAsync('row', N / 2, rowBuf), b = sim.readAsync('col', i, colBuf);
    if (!a || !b) return;
    reading = true;
    Promise.all([a, b])
      .then(() => { rowData = Float32Array.from(rowBuf); colData = Float32Array.from(colBuf); lamMeas = measureLambda(rowData); })
      .catch(() => {})
      .finally(() => { reading = false; });
  }
  function place(phase) {
    const S = sources(), dy = genOn && !paused ? 0.0006 * Math.sin(phase) : 0;
    const vibMode = state.src === 'move' ? null : state.src === 'point' ? 'point' : state.src === 'two' ? 'two' : 'bar';
    const zs = state.src === 'point' ? [0] : state.src === 'two' ? [state.d / 200, -state.d / 200] : [];
    rig.setVibrator(state.src === 'bar' ? X_BAR : X_SRC, vibMode, zs, dy);
    rig.setRail(state.src === 'move', moveX(), dy);
    const dips = state.src === 'bar' ? [] : S.pts.map((p) => [p[0], p[1]]);
    rig.setShadows(dips, state.src === 'move' ? null : { x: state.src === 'bar' ? X_BAR : X_SRC, z0: -BAR_Z, z1: BAR_Z }, state.src === 'move', state.line ? state.xl / 100 : null);
    stage.outlined = state.outline ? [state.src === 'move' ? rig.cart : rig.bar] : [];
  }

  function hud(now) {
    const l = lam(), v = vel();
    ui.setTitle('Misure', ' · lungo l\'asse');
    ui.setClock(lamMeas ? fmt.num(lamMeas * 100, 2) : '—', 'cm', genOn && !paused);
    ui.setSide(`λ misurata · v = λ·f = ${lamMeas ? fmt.num(lamMeas * state.f * 100, 1) : '—'} cm/s`, `teoria λ ${fmt.num(l * 100, 2)} cm · v ${fmt.num(v * 100, 1)} cm/s`);
    let status;
    if (paused) status = 'in pausa'; else if (hold > 0) status = 'immagine ferma'; else if (genOn) status = state.strobe ? 'stroboscopio' : 'onde'; else status = state.src === 'move' && moveT > 0 ? 'carrello in fondo' : offFor < 12 ? 'si calma' : 'spento';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, genOn && !paused);
    ui.setGo(genOn ? 'Spegni' : 'Accendi', genOn);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    const rows = records.slice().reverse().slice(0, 14).map((r) => ({ key: r.id, color: r.color, name: `${fmt.num(r.f, 1)} Hz<small>${fmt.num(r.depth, 1)} mm</small>`, t: r.lam ? `λ ${fmt.num(r.lam * 100, 2)} cm` : 'λ —', v: r.lam ? `v ${fmt.num(r.lam * r.f * 100, 1)} cm/s` : '' }));
    ui.setRows(rows, 'Premi «Annota» (tasto A): λ misurata dagli zeri dell\'onda lungo l\'asse.');
    if (now - metricsAt > 250) {
      metricsAt = now;
      const cells = [
        { k: 'Lunghezza d\'onda', v: `${fmt.num(l * 100, 2)} <small>cm</small>`, s: `profondità ${fmt.num(state.depth, 1)} mm`, title: 'Dalla relazione di dispersione delle increspature (gravità e tensione superficiale)' },
        { k: 'Velocità delle onde', v: `${fmt.num(v * 100, 1)} <small>cm/s</small>`, s: 'v = λ·f' },
      ];
      if (state.obs === 'plate' || state.obs === 'lens') { const vs = speedOf(state.f, PLATE_DEPTH); cells.push({ k: 'Sopra la lastra', v: `${fmt.num(vs * 100, 1)} <small>cm/s</small>`, s: `λ ${fmt.num((vs / state.f) * 100, 2)} cm · n = ${fmt.num(v / vs, 2)}`, title: 'Acqua profonda 1,5 mm: le onde rallentano (indice di rifrazione n = v/v_lastra)' }); }
      else cells.push({ k: 'Solo gravità', p: 2, v: `${fmt.num(lambdaGravity(state.f) * 100, 2)} <small>cm</small>`, s: 'λ senza tensione superficiale', title: 'Come sarebbe λ in acqua profonda contando solo il peso: a queste frequenze la tensione superficiale conta di più' });
      if (state.src === 'two') { const r = l / (state.d / 100); cells.push({ k: 'Primo massimo laterale', v: r < 1 ? `${fmt.num(Math.asin(r) / DEG, 1)} <small>°</small>` : '—', s: `sin θ = λ/d · linee nodali ${2 * Math.floor(state.d / 100 / l + 0.5)}` }); }
      else if (state.obs === 'slit') { const r = l / (state.a / 100); cells.push({ k: 'Primo minimo', v: r < 1 ? `${fmt.num(Math.asin(r) / DEG, 1)} <small>°</small>` : 'nessuno', s: r < 1 ? 'sin θ = λ/a' : 'a < λ: l\'onda si apre a ventaglio' }); }
      else if (state.obs === 'double') { const r = l / (state.ds / 100); cells.push({ k: 'Primo massimo laterale', v: r < 1 ? `${fmt.num(Math.asin(r) / DEG, 1)} <small>°</small>` : '—', s: 'sin θ = λ/d' }); }
      else if (state.src === 'move') { const m = machAngle(state.u, v); cells.push(m ? { k: 'Cono di Mach', v: `${fmt.num(m / DEG, 1)} <small>°</small>`, s: `sin α = v/u · u = ${fmt.num(state.u / v, 2)}·v` } : { k: 'Davanti e dietro', v: `${fmt.num(dopplerFront(l, state.u, v) * 100, 2)} · ${fmt.num(dopplerBack(l, state.u, v) * 100, 2)} <small>cm</small>`, s: 'λ·(1 ∓ u/v)' }); }
      else cells.push({ k: 'Periodo', v: `${fmt.num(1000 / state.f, 1)} <small>ms</small>`, s: 'T = 1/f' });
      cells.push({ k: 'Numero d\'onda', p: 2, v: `${fmt.num(kOf(state.f, h()), 0)} <small>1/m</small>`, s: 'k = 2π/λ' });
      cells.push({ k: 'Lampi', p: 3, v: state.strobe ? `${fmt.num(state.f - state.dstrobe, 2)} <small>Hz</small>` : '—', s: state.strobe ? 'stroboscopio acceso' : 'stroboscopio spento' });
      ui.setMetrics(cells);
      tags.setText(tObs, { slit: `Fenditura · ${fmt.num(state.a, 1)} cm`, double: 'Due fenditure', wall: 'Parete', mirror: 'Specchio parabolico', plate: 'Lastra di vetro', lens: 'Lente di vetro' }[state.obs] || '');
    }
  }

  function drawPlot() {
    const kind = state.plotKind;
    if (kind === 'disp') {
      const x = [], y1 = [], y2 = [], y3 = [];
      for (let f = 5; f <= 25.001; f += 0.25) { x.push(f); y1.push(lambdaOf(f, h()) * 100); y2.push(lambdaOf(f, PLATE_DEPTH) * 100); y3.push(lambdaGravity(f) * 100); }
      const pts = records.filter((r) => r.lam).map((r) => ({ x: r.f, y: r.lam * 100, color: r.color, r: 7 }));
      ui.drawPlot({ series: [{ x, y: y3, color: '#9aa1ab', width: 2, dash: [3, 5] }, { x, y: y2, color: '#0c9d8f', width: 2, dash: [8, 6], alpha: 0.8 }, { x, y: y1, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.7 }], points: pts, X0: 5, X1: 25, Y0: 0, Y1: 6, xLabel: 'f (Hz)', yLabel: 'λ (cm)', legend: [[`teoria, ${fmt.num(state.depth, 1)} mm`, '#15181c'], ['sopra la lastra', '#0c9d8f'], ['solo gravità', '#9aa1ab']] });
      return;
    }
    if (kind === 'axis') {
      const x = [], y = [];
      if (rowData) for (let i = 0; i < N; i++) { x.push((-HALF + (i + 0.5) * DX) * 100); y.push(rowData[i * 4] * 1e6); }
      const Y = Math.max(5, ...y.map(Math.abs)) * 1.1;
      ui.drawPlot({ series: [{ x, y, color: '#2c67dc', width: 2.4 }], X0: -20, X1: 20, Y0: -Y, Y1: Y, xLabel: 'x (cm)', yLabel: 'altezza dell\'acqua (μm)', legend: [[`λ misurata ${lamMeas ? fmt.num(lamMeas * 100, 2) : '—'} cm`, '#2c67dc'], [`teoria ${fmt.num(lam() * 100, 2)} cm`, '#15181c']] });
      return;
    }
    // ampiezza media lungo la linea di misura, con la teoria (Huygens) dove c'è
    const z = [], a = [];
    if (colData) for (let j = 0; j < N; j++) { z.push((HALF - (j + 0.5) * DX) * 100); a.push(Math.sqrt(2 * Math.max(0, colData[j * 4 + 2])) * 1e6); }
    const series = [], xm = state.xl / 100, k = kOf(state.f, h());
    let th = null;
    if (state.src === 'two' && state.obs === 'none') th = (zz) => twoSources(xm, zz, [X_SRC, state.d / 200], [X_SRC, -state.d / 200], k, state.phase * DEG);
    else if (state.obs === 'slit' || state.obs === 'double') th = (zz) => slits(xm, zz, X_BARRIER, state.a / 100, state.ds / 100, k, state.obs === 'double');
    if (th && a.length && xm > (state.obs === 'none' ? X_SRC : X_BARRIER) + 0.01) {
      const ty = z.map((zz) => th(zz / 100));
      let sxy = 0, syy = 0; ty.forEach((t, j) => { if (Math.abs(z[j]) < 16) { sxy += t * a[j]; syy += t * t; } });
      const s = syy ? sxy / syy : 0;
      series.push({ x: z, y: ty.map((t) => t * s), color: '#15181c', width: 2, dash: [8, 6], alpha: 0.6 });
    }
    series.push({ x: z, y: a, color: '#e8452c', width: 2.6 });
    ui.drawPlot({ series, X0: -20, X1: 20, Y0: 0, Y1: Math.max(5, ...a) * 1.1, xLabel: 'z lungo la linea (cm)', yLabel: 'ampiezza media (μm)', legend: th ? [['misurata', '#e8452c'], ['teoria (Huygens)', '#15181c']] : [['misurata', '#e8452c']] });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    if (pendingView) { setView(pendingView); pendingView = null; }
    if (paused && !moving()) paused = false;
    if (!paused) stepSeq(dt);
    if (mediumDirty) buildMedium();
    if (hold > 0) hold -= dt;
    if (!paused && hold <= 0 && moving()) {
      acc += Math.min(dt, 0.05) * state.slow;
      const n = Math.min(24, Math.floor(acc / DT));
      acc -= n * DT; if (acc > DT) acc = 0;
      const omega = 2 * Math.PI * state.f, fs = Math.max(0.05, state.f - state.dstrobe);
      for (let s = 0; s < n; s++) {
        if (genOn && state.src === 'move') { moveT += DT; if (MOVE_X0 + state.u * moveT > MOVE_X1) { genOn = false; offFor = 0; } }
        // il motorino prende giri in 0,3 s; la fase avanza con continuità anche se la frequenza cambia
        onT += DT; drvPh = (drvPh + omega * DT) % (2 * Math.PI);
        const S = sources();
        sim.step({ pts: S.pts, bar: S.bar, phase: drvPh, amp: genOn ? AMP_K * state.amp * Math.min(1, onT / 0.3) : 0 });
        if (state.strobe) { strobePh += fs * DT; if (strobePh >= 1) { strobePh -= Math.floor(strobePh); sim.flash(); } }
      }
      if (!genOn) offFor += n * DT;
    }
    const useSnap = state.strobe;
    rig.paperU.uLight.value = sim.makeLight(useSnap, K_PAPER, K_SCREEN, 3.7e-5 * (state.amp / 5));
    rig.paperU.uMode.value = state.look === 'amp' ? 1 : 0;
    rig.waterU.uState.value = (useSnap ? sim.snap : sim.state).texture;
    place(drvPh);
    if (nowMs - readAt > 150 && (genOn || offFor < 12)) { readAt = nowMs; readNow(); }
    hud(nowMs);
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 150) { plotAt = nowMs; drawPlot(); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  stage.setAmbient(0.04 + 0.96 * state.ambient); rig.paperU.uRoom.value = state.ambient;
  rig.setMirror(state.mirror);
  buildMedium(true);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, sim, records: () => records, seq: () => seq, paused: () => paused, gen: () => genOn, lamMeas: () => lamMeas, readNow, togglePause, toggleGen, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
