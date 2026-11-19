// main.js — La spinta di Archimede
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { GRAVITY, LIQUIDS, MATERIALS, liquid, shape, subUpright, pickRange, Hydro, SPOUT_STOP, TRAVEL } from './hydro.js';
import { Rig, HOOK_X, ROD, DYN, THREAD, THREAD_ARCH, BAL, CATCH, vesselGeo, bucketGeo, bucketMass, attachOffset } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const FORCE = { w: '#e07b1f', b: '#2c67dc', t: '#0c9d8f', n: '#7a47cf' };
const M_BEAKER = 0.372, M_CATCH = 0.118;           // vetro del becher da 1 L e del becherino da 250 mL (kg)
const SHAPE_NAME = { cyl: 'cilindro', cube: 'cubo', sphere: 'sfera' };
const state = {
  app: 'beaker', material: 'alu', shape: 'cyl', V: 50, liquid: 'water', salt: 3.5, grav: 'earth',
  desc: 0, slow: 1, forces: true, outline: false, labels: true, quality: 'low', plotKind: 'depth',
};
const BASE = { app: 'beaker', material: 'alu', shape: 'cyl', V: 50, liquid: 'water', salt: 3.5, grav: 'earth', desc: 0, slow: 1, forces: true, plotKind: 'depth' };
const PHYS = new Set(['app', 'material', 'shape', 'V', 'liquid', 'salt', 'grav']);
// nel secchiello il cilindro deve affondare in ogni liquido ammesso
const materialOk = (k) => state.app !== 'arch' || MATERIALS[k].rho > 1300;
const liquidOk = (k) => state.app !== 'arch' || k !== 'mercury';

// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const SET = (patch) => ({ set: patch });
const DIP = [{ immerse: true }, { settle: true }];
const PRESETS = [
  ['lower', 'Più giù, più spinta', 'Un cilindro d\'alluminio scende piano nell\'acqua: la lettura cala finché è tutto sotto, poi non cambia più', { V: 100, plotKind: 'depth' }, [{ wait: 0.6 }, { deep: true }, { settle: true }], 'vessel'],
  ['overflow', 'Il peso del liquido spostato', 'Ottone nel vaso a sfioro: il liquido che trabocca pesa quanto la spinta', { app: 'overflow', material: 'brass', V: 100, plotKind: 'time' }, [{ wait: 0.6 }, ...DIP], 'overview'],
  ['arch', 'Il cilindro di Archimede', 'Il cilindro immerso perde peso; riempito il secchiello, il dinamometro torna dov\'era', { app: 'arch', material: 'brass', V: 60, plotKind: 'time' }, [{ wait: 0.6 }, ...DIP, { wait: 0.8 }, { fill: true }, { settle: true }], 'overview'],
  ['volume', 'Stesso volume, materiali diversi', 'Alluminio, ferro e ottone da 50 cm³ ricevono la stessa spinta', { V: 50, plotKind: 'law' }, ['alu', 'iron', 'brass'].flatMap((m) => [SET({ material: m }), ...DIP]), 'vessel'],
  ['liquids', 'Liquidi diversi', 'Lo stesso corpo nell\'alcol, nell\'acqua, nell\'acqua salata e nella glicerina: la spinta cresce con la densità', { material: 'alu', V: 60, plotKind: 'law' }, [['alcohol'], ['water'], ['salt', 20], ['glycerol']].flatMap(([l, s]) => [SET({ liquid: l, ...(s ? { salt: s } : {}) }), ...DIP]), 'vessel'],
  ['float', 'Galleggiare', 'Legno, ghiaccio e sughero: va sotto la parte che sposta tanto liquido quanto pesa il corpo', { shape: 'cube', V: 100, plotKind: 'time' }, ['wood', 'ice', 'cork'].flatMap((m) => [SET({ material: m }), { immerse: true }, { cut: true }, { settle: true }, { wait: 0.8 }]), 'vessel'],
  ['mercury', 'Il ferro galleggia sul mercurio', 'Il mercurio è quasi due volte più denso del ferro: il cubo resta fuori per quasi metà', { liquid: 'mercury', material: 'iron', shape: 'cube', V: 50, plotKind: 'time' }, [{ wait: 0.6 }, { immerse: true }, { cut: true }, { settle: true }], 'vessel'],
  ['ice', 'Ghiaccio nell\'acqua e nell\'alcol', 'Nell\'acqua il ghiaccio galleggia, nell\'alcol va a fondo', { material: 'ice', shape: 'cube', V: 60, plotKind: 'time' }, ['water', 'alcohol'].flatMap((l) => [SET({ liquid: l }), { immerse: true }, { cut: true }, { settle: true }, { wait: 0.8 }]), 'vessel'],
  ['balance', 'Azione e reazione', 'Il becher è sulla bilancia: il dinamometro perde quanto la bilancia guadagna', { material: 'alu', V: 100, plotKind: 'time' }, [{ wait: 0.6 }, ...DIP], 'overview'],
  ['moon', 'Sulla Terra, sulla Luna, su Marte', 'Peso e spinta cambiano insieme con g: i punti stanno su rette di pendenza g', { material: 'alu', V: 100, plotKind: 'law' }, ['earth', 'moon', 'mars'].flatMap((g) => [SET({ grav: g }), ...DIP]), 'vessel'],
];
const VIEWS = [['overview', 'Panoramica'], ['dyn', 'Dinamometro'], ['vessel', 'Recipiente'], ['balance', 'Bilancia']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-1.2, 3.2, 2.3], keyTarget: [0.03, 0.3, 0], shadowBox: [-0.8, 0.8, 1.2, -0.5], shadowFar: 7, fog: [10, 60] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // frecce delle forze (sopra a tutto: il corpo è spesso dentro il liquido)
  const mkArrow = (c) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, c, 0.012, 0.008);
    a.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 9; });
    a.visible = false; scene.add(a);
    return a;
  };
  const arrows = { w: mkArrow(FORCE.w), b: mkArrow(FORCE.b), t: mkArrow(FORCE.t), n: mkArrow(FORCE.n) };

  // ───────────────────────── stato ─────────────────────────
  let sim = null, vg = null, yReady = 0, tare = 0, balShown = 0, balText = '', balAt = 0;
  let paused = false, seq = null, pendingView = null, view = 'overview', drag = null;
  let records = [], recId = 0, colorI = 0, episode = { Wair: null, done: true, fillDone: true }, calm = 0;
  let trace = [], series = [], simT = 0, tAct = 0, dtLast = 0, lastSample = -1, plotAt = 0, metricsAt = 0, fpsEma = 60, hudTimer = 0;
  const v3 = new THREE.Vector3(), hookV = new THREE.Vector3(), attV = new THREE.Vector3();

  const liq = () => liquid(state.liquid, state.salt);
  const arch = () => state.app === 'arch';
  const gNow = () => GRAVITY[state.grav].g;
  const readRound = (F) => { const r = sim.range.res; return Math.round(F / r) * r; };
  const readText = (F) => fmt.num(readRound(F), sim.range.res >= 0.1 ? 1 : 2);

  /** Nuovo apparato, corpo o liquido: il corpo torna appeso in alto, il recipiente pronto, la bilancia tarata. */
  function rebuild() {
    const L = liq(), S = shape(arch() ? 'cyl' : state.shape, state.V * 1e-6), g = gNow(), rhoB = MATERIALS[state.material].rho;
    vg = vesselGeo(state.app);
    const vessel = { y0: vg.y0, R: vg.R, spout: vg.spout, Vliq: vg.spout ? Math.PI * vg.R * vg.R * (vg.spout + SPOUT_STOP - vg.y0) : 0.6e-3 };
    const mExtra = arch() ? bucketMass(S) : 0;
    const range = pickRange((rhoB * S.V + mExtra + (arch() ? L.rho * S.V : 0)) * g);
    const attach = attachOffset(state.app, S), thread = arch() ? THREAD_ARCH : THREAD;
    const eAir = (((rhoB * S.V + mExtra) * g) / range.F) * TRAVEL;
    yReady = vg.rim + 0.035 + S.half + attach + thread + eAir + DYN.len;
    sim = new Hydro({ S, rhoB, liq: L, g, range, yClamp: yReady, dynLen: DYN.len, thread, attach, mExtra, arch: arch(), vessel });
    rig.setApp(state.app);
    rig.setBody(state.app, S, state.material);
    rig.setRange(range);
    rig.refreshLiquids(L);
    state.desc = 0; paused = false;
    balShown = balanceRaw() / g * 1000; tare = balShown; balText = '';
    episode = { Wair: null, done: true, fillDone: true }; calm = 0;
    trace = []; series = []; simT = 0; tAct = 0; lastSample = -1;
    onNotes();
  }

  // ───────────────────────── misure ─────────────────────────
  /** Forza sul piatto della bilancia (N): il becher pieno più la reazione del liquido sul corpo, oppure il
   *  becherino di raccolta con il liquido traboccato (più l'urto del getto che vi cade). */
  function balanceRaw() {
    if (state.app === 'overflow') {
      const top = BAL.top + CATCH.bottom + sim.Vcoll / (Math.PI * CATCH.R * CATCH.R);
      const vJet = sim.q > 0 ? Math.sqrt(2 * sim.g * Math.max(0.005, rig.spoutOut.y - top)) : 0;
      return (M_CATCH + sim.rho * sim.Vcoll) * sim.g + sim.rho * sim.q * vJet;
    }
    return (M_BEAKER + sim.rho * sim.Vliq) * sim.g + sim.onVessel;
  }
  /** Profondità del fondo del corpo sotto il pelo libero (m). */
  const depth = () => Math.max(0, sim.level - (sim.y - sim.S.half));

  function record(kind) {
    const L = liq(), R = readRound(sim.reading), S = sim.S;
    const FA = kind === 'galla' ? episode.Wair : episode.Wair - R;
    records.push({
      id: ++recId, color: COLORS[colorI++ % COLORS.length], kind, app: state.app,
      mat: MATERIALS[state.material].name, shape: arch() ? 'cyl' : state.shape, V: state.V, liq: L.name, rho: L.rho, g: sim.g, grav: state.grav,
      W: episode.Wair, T: R, FA, Vsub: sim.Vsub, mDisp: L.rho * sim.Vsub * 1000, frac: sim.Vsub / S.V, th: sim.th, free: sim.free,
      bal: balShown - tare, coll: sim.Vcoll, Fb: sim.Fb,
    });
    if (records.length > 40) records.shift();
  }
  /** Una misura si annota da sola quando il corpo, dopo essere stato pesato in aria, si ferma nel liquido. */
  function track(dtSim) {
    if (dtSim <= 0) return;
    calm = sim.settled ? calm + dtSim : 0;
    const sub = sim.Vsub / sim.S.V;
    if (!sim.free && sub < 1e-9 && calm > 0.3 && !sim.Vb) { episode = { Wair: readRound(sim.reading), done: false, fillDone: !arch() }; return; }
    if (episode.Wair === null || calm < 0.6) return;
    if (!episode.done) {
      if (!sim.free && sub > 0.999 && sim.T > 0) { record('sotto'); episode.done = true; }
      else if (sub > 0 && sim.N === 0 && (sim.free || sim.T === 0)) { record('galla'); episode.done = true; }
      else if (sim.free && sim.N > 0) { record('fondo'); episode.done = true; }
    } else if (!episode.fillDone && sim.Vb >= sim.S.V * 0.999) { record('pieno'); episode.fillDone = true; }
  }
  function sample() {
    // grafico «profondità»: finché il corpo è appeso; grafico «tempo»: ogni 50 ms di tempo simulato
    if (!sim.free) {
      // fuori dal liquido basta un punto (la molla che oscilla nell'aria non sporca il grafico)
      const h = depth(), l = trace[trace.length - 1];
      if (h <= 0 && l && l.h <= 0) { l.T = sim.reading; l.F = 0; }
      else if (!l || Math.abs(h - l.h) > 2e-4 || Math.abs(sim.reading - l.T) > 0.002) { trace.push({ h, T: sim.reading, F: sim.Fb }); if (trace.length > 3000) trace.shift(); }
    }
    // il tempo del grafico avanza solo mentre qualcosa si muove: a sistema fermo il grafico non scorre
    if (calm < 1) tAct += dtLast;
    if (calm < 1 && tAct - lastSample >= 0.05) {
      lastSample = tAct;
      series.push({ t: tAct, T: sim.reading, F: sim.Fb, B: ((balShown - tare) / 1000) * sim.g });
      while (series.length && series[0].t < tAct - 30) series.shift();
    }
  }

  // ───────────────────────── quote del morsetto ─────────────────────────
  /** Quota del morsetto con il fondo del corpo a `bottom` e la molla allungata di e. */
  const clampFor = (bottom, e) => bottom + sim.S.half + sim.attach + sim.thread + e + DYN.len;
  const levelFull = () => (vg.spout ? vg.spout + SPOUT_STOP : vg.y0 + (sim.Vliq + sim.S.V) / sim.A);
  /** Quota del morsetto per avere il corpo tutto sotto (o, se galleggia, il gancio appena sopra il liquido). */
  function immerseClamp() {
    const S = sim.S, Ts = sim.weight - sim.rho * sim.g * S.V;
    if (Ts > 0) {
      const bottom = Math.max(levelFull() - (arch() ? 0.01 : 0.015) - S.H, vg.y0 + 0.008);
      return clampFor(bottom, Ts / sim.k);
    }
    // galleggia: immersione d'equilibrio del corpo dritto, livello che ne risulta, gancio poco più su
    const Vs = sim.mass / sim.rho;
    let lo = 0, hi = S.H;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (subUpright(S, m).V < Vs) lo = m; else hi = m; }
    const L = vg.spout ? vg.spout + SPOUT_STOP : vg.y0 + (sim.Vliq + Vs) / sim.A, bottom = L - lo;
    const att = bottom + S.half + sim.attach;
    return Math.max(att + sim.thread * 0.35, L + 0.015, bottom + S.H + 0.012) + DYN.len;
  }
  /** Per il grafico «profondità»: il corpo scende fino a un centimetro dal fondo. */
  function deepClamp() {
    const Ts = sim.weight - sim.rho * sim.g * sim.S.V;
    return Ts > 0 ? clampFor(vg.y0 + 0.012, Ts / sim.k) : immerseClamp();
  }
  /** Discesa massima: il gancio del dinamometro resta fuori dal liquido. */
  function descMax() {
    if (!sim) return 10;
    if (arch()) return (yReady - immerseClamp()) * 100;
    const eImm = Math.max(0, sim.weight - sim.rho * sim.g * sim.S.V) / sim.k;
    return Math.max(0, (yReady - Math.min(levelFull() + 0.008 + DYN.len + eImm, immerseClamp())) * 100);
  }
  function moveClamp(y, speed) { sim.target = Math.min(yReady, y); sim.speed = speed; state.desc = Math.max(0, (yReady - sim.target) * 100); ui.refresh('desc'); }
  const raise = () => moveClamp(yReady, 0.08);
  function rehook() { state.desc = 0; sim.yClamp = sim.target = yReady; sim.rehook(); ui.refresh('desc'); }
  function immerseToggle() {
    seq = null; paused = false;
    if (sim.free) { rehook(); moveClamp(immerseClamp(), 0.03); return; }   // di nuovo appeso, e giù
    if (state.desc > 0.05) raise(); else moveClamp(immerseClamp(), 0.03);
  }
  function cutToggle() {
    seq = null; paused = false;
    if (arch()) { if (sim.Vb > 0 || sim.filling) { sim.Vb = 0; sim.filling = 0; } else sim.filling = sim.S.V / 1.6; return; }
    if (sim.free) rehook(); else sim.cut();
  }
  const moving = () => !sim.settled || !!seq;
  function togglePause() { if (paused) paused = false; else if (moving()) paused = true; }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); rebuild(); ui.refresh(); ui.sync(); }
      if (st.immerse) moveClamp(immerseClamp(), 0.03);
      if (st.deep) moveClamp(deepClamp(), 0.012);
      if (st.cut) sim.cut();
      if (st.fill) sim.filling = sim.S.V / 1.6;
    }
    seq.t += dt;
    let done = false;
    if (st.set) done = (episode.Wair !== null && seq.t > 0.6) || seq.t > 4;
    else if (st.wait) done = seq.t >= st.wait;
    else if (st.immerse || st.deep) done = Math.abs(sim.yClamp - sim.target) < 1e-6;
    else if (st.settle) done = calm > 0.8 || seq.t > 25;
    else if (st.cut) done = seq.t > 0.2;
    else if (st.fill) done = !sim.filling;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  function onNotes() {
    const L = liq(), S = sim.S, m = MATERIALS[state.material], s = m.rho / L.rho;
    ui.setNote('#app-note', {
      beaker: 'Becher da 1 L con 600 ml di liquido, sopra una bilancia elettronica tarata: segna in più la spinta che il liquido dà al corpo.',
      overflow: 'Il vaso è pieno fino al beccuccio: il liquido spostato trabocca nel becherino sulla bilancia tarata.',
      arch: 'Un secchiello d\'ottone e un cilindro che ci entra esatto: hanno lo stesso volume. Immergi il cilindro, poi riempi il secchiello.',
    }[state.app]);
    ui.setNote('#body-note', `${arch() ? 'Cilindro: ' : ''}massa <b>${fmt.num(m.rho * S.V * 1000, 1)} g</b> · peso ${fmt.N(m.rho * S.V * sim.g)}${arch() ? ` · secchiello ${fmt.num(sim.mExtra * 1000, 0)} g` : ''} · ${s < 1 ? `<b>galleggia</b>: ρ è il ${fmt.num(s * 100, 0)} % di quella del liquido` : `va a fondo: ρ è ${fmt.num(s, 2)} volte quella del liquido`}`);
    ui.setNote('#liq-note', `ρ = <b>${fmt.rho(L.rho)}</b> · ${L.note}`);
  }
  const ui = createUI(state, {
    materials: Object.entries(MATERIALS), liquids: Object.entries(LIQUIDS), presets: PRESETS, views: VIEWS,
    massText: () => `${fmt.num(MATERIALS[state.material].rho * state.V / 1000, 1)} g`,
    saltText: () => fmt.rho(liquid('salt', state.salt).rho),
    descMax, materialOk, liquidOk,
    descText: () => {
      if (!sim) return '';
      if (sim.free) return 'filo tagliato';
      const h = depth();
      return h <= 0 ? 'fuori dal liquido' : h >= sim.S.H - 1e-4 ? 'tutto immerso' : `immerso per ${fmt.num(h * 100, 1)} cm`;
    },
  }, (key, arg) => {
    if (PHYS.has(key)) {
      seq = null;
      if (key === 'app') { if (!materialOk(state.material)) state.material = 'brass'; if (!liquidOk(state.liquid)) state.liquid = 'water'; }
      rebuild(); ui.refresh(); ui.sync(); return;
    }
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        rebuild(); ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'desc': seq = null; if (sim.free) break; sim.target = yReady - state.desc / 100; sim.speed = 0.25; break;
      case 'immerse': immerseToggle(); break;
      case 'cut': cutToggle(); break;
      case 'pause': togglePause(); break;
      case 'tare': tare = balShown; balText = ''; break;
      case 'clear': seq = null; records = []; colorI = 0; rebuild(); ui.refresh('desc'); break;
      case 'view': setView(arg); break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const tDyn = tags.add('', 'nocase', (o) => o.set(HOOK_X - 0.03, sim.yClamp - 0.05, 0.012));
  const tBody = tags.add('', 'nocase', (o) => { const r = arch() ? bucketGeo(sim.S).Ro : sim.S.D / 2; o.set(HOOK_X + r * Math.SQRT1_2 + 0.03, sim.y, 0.02); });
  const tLiq = tags.add('', 'nocase', (o) => o.set(HOOK_X - vg.R - 0.012, sim.level - 0.02, 0.02));
  tags.add('Bilancia', '', (o) => o.set(rig.balG.position.x + 0.07, 0.05, 0.1));
  tags.add('Vaso a sfioro', '', (o) => o.set(HOOK_X - 0.04, vg.y0 + 0.02, 0.04), () => state.app === 'overflow');
  tags.add('Becherino di raccolta', '', (o) => o.set(HOOK_X + CATCH.dx + 0.035, BAL.top + CATCH.H - 0.01, 0.01), () => state.app === 'overflow');
  tags.add('Secchiello', '', (o) => { const b = bucketGeo(sim.S); o.set(HOOK_X - b.Ro, sim.y + sim.S.half + 0.022 + b.Ho * 0.6, 0.01); }, () => arch());

  // ───────────────────────── inquadrature ─────────────────────────
  function freeRect() {
    const W = window.innerWidth, H = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (W <= 860) return { x0: m, x1: W - m, y0: 96, y1: (live.height ? live.top : H) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : W) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dir, pts) {
    const cam = camera.clone(), rect = freeRect(), W = window.innerWidth, H = window.innerHeight;
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) { pv.copy(p).project(cam); if (pv.z > 1 || pv.z < -1) behind = true; const x = (pv.x * 0.5 + 0.5) * W, y = (-pv.y * 0.5 + 0.5) * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); };
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
  const V = (...p) => new THREE.Vector3(...p);
  function viewPose(id) {
    const over = state.app === 'overflow', xr = over ? HOOK_X + CATCH.dx + CATCH.R + 0.03 : HOOK_X + 0.1;
    switch (id) {
      case 'dyn': {
        const top = sim.yClamp + 0.03, bot = sim.yClamp - DYN.len - sim.ext - 0.01;
        return fitPose(V(0.3, 0.05, 1).normalize(), [V(HOOK_X - 0.035, top, 0), V(HOOK_X + 0.035, top, 0), V(HOOK_X - 0.035, bot, 0), V(HOOK_X + 0.035, bot, 0)]);
      }
      case 'vessel': {
        const top = Math.max(vg.rim, sim.y + sim.S.half) + 0.02;
        return fitPose(V(0.32, 0.18, 1).normalize(), [V(HOOK_X - vg.R - 0.02, vg.y0 - 0.01, 0), V(xr, vg.y0 - 0.01, 0), V(HOOK_X - vg.R - 0.02, top, 0), V(xr, top, 0), V(HOOK_X, vg.y0, vg.R + 0.02)]);
      }
      case 'balance': {
        const bx = rig.balG.position.x;
        return fitPose(V(0.15, 0.45, 1).normalize(), [V(bx - 0.1, 0, 0.11), V(bx + 0.1, 0, 0.11), V(bx - 0.1, 0.08, 0.11), V(bx + 0.1, 0.08, -0.1)]);
      }
      // la parte utile: dal piede del sostegno al morsetto (l'asta prosegue fuori dall'inquadratura)
      default: return fitPose(V(0.34, 0.2, 1).normalize(), [V(-0.2, 0, 0.12), V(xr, 0, 0.1), V(xr, vg.rim, 0), V(HOOK_X, sim.yClamp + 0.045, 0), V(ROD.x, sim.yClamp + 0.05, ROD.z)]);
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    const dist = Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
    stage.controls.maxDistance = Math.max(6, dist * 1.4);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── trascinamento del dinamometro ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane();
  const dragTargets = [rig.boss, rig.arm, ...rig.dynTargets];
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pick = (e) => { ray(e); return raycaster.intersectObjects(dragTargets, false)[0]; };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0 || sim.free) return;
    const hit = pick(e);
    if (!hit) return;
    seq = null;
    drag = { offset: hit.point.y - sim.yClamp };
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(v3).setY(0).normalize(), hit.point);
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      ray(e);
      if (raycaster.ray.intersectPlane(plane, v3)) {
        state.desc = Math.round(Math.min(Math.max((yReady - (v3.y - drag.offset)) * 100, 0), descMax()) * 10) / 10;
        sim.target = yReady - state.desc / 100; sim.speed = 0.25;
        ui.refresh('desc');
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !sim.free && !!pick(e));
  }, { capture: true });
  const endDrag = (e) => { if (!drag) return; drag = null; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); e.stopImmediatePropagation(); };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); immerseToggle(); } else if (k === 'p') togglePause(); else if (k === 't') cutToggle();
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
  function setArrow(a, show, x, y, dir, len) {
    a.visible = show && len > 0.003;
    if (!a.visible) return;
    a.position.set(x, y, 0);
    a.setDirection(v3.set(0, dir, 0));
    const L = Math.min(len, 0.2), head = Math.min(0.014, L * 0.4);
    a.setLength(L, head, head * 0.65);
  }
  function place() {
    const S = sim.S;
    rig.setClamp(sim.yClamp);
    rig.setDyn(sim.ext);
    rig.placeBody(sim.y, sim.th);
    rig.setLevel(state.app, sim.level);
    if (state.app === 'overflow') { rig.setCatch(sim.Vcoll); rig.setStream(sim.q, sim.g); }
    if (arch()) rig.setBucket(sim.Vb, sim.filling);
    // filo: dal gancio del dinamometro all'occhiello (o al manico del secchiello)
    hookV.set(HOOK_X, rig.hookY(sim.yClamp, sim.ext), 0);
    attV.set(HOOK_X - Math.sin(sim.th) * sim.attach, sim.y + Math.cos(sim.th) * sim.attach, 0);
    rig.setThread(hookV, attV, sim.thread, sim.free);
    // forze: peso (nel baricentro dell'insieme), spinta (nel centro di spinta), filo, fondo; il peso vale 9 cm
    const show = state.forces, k = 0.09 / Math.max(sim.weight, 1e-9);
    let yG = sim.y;
    if (arch()) {
      const b = bucketGeo(S), yb = sim.y + S.half + 0.022, mC = sim.mBody, mB = sim.mExtra, mW = sim.rho * sim.Vb, hw = sim.Vb / (Math.PI * b.Ri * b.Ri);
      yG = (mC * sim.y + mB * (yb + b.Ho * 0.55) + mW * (yb + 0.003 + hw / 2)) / (mC + mB + mW);
    }
    setArrow(arrows.w, show, HOOK_X - 0.004, yG, -1, sim.weight * k);
    setArrow(arrows.b, show && sim.Fb > 0, HOOK_X + 0.004 + sim.bx, sim.y + sim.by, 1, sim.Fb * k);
    setArrow(arrows.t, show && sim.T > 0, attV.x, attV.y, 1, sim.T * k);
    setArrow(arrows.n, show && sim.N > 0, HOOK_X + 0.012, vg.y0 + 0.001, 1, sim.N * k);
    stage.outlined = state.outline ? [rig.movingParts] : [];
  }

  function hud(dt) {
    const S = sim.S, L = liq(), W = sim.weight, sub = sim.Vsub / S.V;
    const live = !sim.settled && !paused;
    ui.setReading(readText(sim.reading), live);
    ui.setRange(` · ${sim.range.F} N`);
    const status = paused ? 'in pausa' : sim.filling ? 'si riempie' : sim.q > 0 ? 'trabocca' : sim.free
      ? (sim.N > 0 ? 'sul fondo' : sim.settled ? 'galleggia' : 'in moto')
      : sub <= 0 ? 'in aria' : sim.T === 0 ? (sim.N > 0 ? 'sul fondo' : 'galleggia') : sub > 0.999 ? 'tutto immerso' : 'si immerge';
    ui.setStatus(seq && !paused ? `${status} · esperimento` : status, live);
    const Wair = episode.Wair ?? readRound(W);
    ui.setSide(`nell'aria ${readText(Wair)} N · spinta ${fmt.N(sim.Fb)}`, `portata ${sim.range.F} N · divisione ${fmt.num(sim.range.div, 2)} N`);
    ui.setImmerse(!sim.free && state.desc > 0.05 ? 'Solleva' : 'Immergi');
    if (arch()) ui.setCut(sim.Vb > 0 || sim.filling ? 'Svuota' : 'Riempi', 'Riempi il secchiello con il liquido, o vuotalo (T)');
    else ui.setCut(sim.free ? 'Riaggancia' : 'Taglia', sim.free ? 'Riappendi il corpo al filo (T)' : 'Taglia il filo (T)');
    ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || moving());
    // bilancia: risponde in qualche decimo di secondo, il display cambia a scatti
    balShown += (balanceRaw() / sim.g * 1000 - balShown) * (1 - Math.exp(-dt / 0.3));
    const now = performance.now();
    if (now - balAt > 180) {
      balAt = now;
      const t = fmt.num(Math.round((balShown - tare) * 10) / 10 + 0, 1);
      if (t !== balText) { balText = t; rig.setBalance(t === '-0,0' ? '0,0' : t); }
    }
    // misure annotate, dalla più recente
    const rows = records.slice().reverse().slice(0, 14).map((r) => {
      const where = `${r.liq.toLowerCase()}${r.grav !== 'earth' ? ` · ${GRAVITY[r.grav].name}` : ''}`;
      const name = `${r.mat} · ${SHAPE_NAME[r.shape]} ${r.V} cm³<small>${where}</small>`;
      // assetto rispetto alla posizione dritta: il cubo si ripete ogni 90°, il cilindro ogni 180°
      const deg = Math.abs(r.th / DEG), per = r.shape === 'cube' ? 90 : 180, tl = Math.min(deg % per, per - (deg % per));
      const pose = !r.free ? 'legato al filo' : r.shape === 'sphere' ? 'libera' : tl < 3 ? 'dritto' : r.shape === 'cyl' && tl > 87 ? 'coricato' : r.shape === 'cube' && tl > 42 ? 'di spigolo' : `inclinato ${fmt.num(tl, 0)}°`;
      switch (r.kind) {
        case 'galla': return { key: r.id, color: r.color, name, t: `galleggia · ${fmt.num(r.frac * 100, 1)} % sotto`, v: pose };
        case 'fondo': return { key: r.id, color: r.color, name, t: 'va a fondo', v: `spinta ${fmt.N(r.Fb)}` };
        case 'pieno': return { key: r.id, color: r.color, name: `Secchiello pieno<small>${r.mat.toLowerCase()} ${r.V} cm³ · ${where}</small>`, t: `${fmt.num(r.T, 2)} N`, v: `in aria ${fmt.num(r.W, 2)} N` };
        default: return { key: r.id, color: r.color, name, t: `spinta ${fmt.num(r.FA, r.FA < 10 ? 2 : 1)} N`, v: r.app === 'overflow' ? `raccolti ${fmt.g(r.bal)}` : r.app === 'beaker' ? `bilancia +${fmt.g(r.bal)}` : `ρ ${fmt.num(r.FA / (r.g * r.V * 1e-6), 0)} kg/m³` };
      }
    });
    ui.setRows(rows, 'Immergi il corpo (barra spaziatrice): ogni misura si annota da sola quando il corpo è fermo.');
    if (now - metricsAt > 200) {
      metricsAt = now;
      const m = sim.mass, disp = state.app === 'overflow' ? sim.Vcoll : sim.Vsub, rise = sim.level - (vg.y0 + sim.Vliq / sim.A);
      const s = MATERIALS[state.material].rho / L.rho;
      ui.setMetrics([
        { k: 'Peso nell\'aria', v: `${fmt.num(W, W < 10 ? 3 : 2)} <small>N</small>`, s: `m = ${fmt.num(m * 1000, 1)} g · g = ${fmt.num(sim.g, 2)}`, title: 'Peso del corpo (con il secchiello e la sua acqua, se c\'è)' },
        { k: 'Spinta di Archimede', v: `${fmt.num(sim.Fb, sim.Fb < 10 ? 3 : 2)} <small>N</small>`, s: 'F = ρ·g·V immerso', title: 'Peso del liquido che occuperebbe il volume immerso' },
        { k: 'Volume immerso', v: `${fmt.num(sim.Vsub * 1e6, 1)} <small>cm³</small>`, s: `${fmt.num(sub * 100, 1)} % del corpo` },
        { k: 'Densità', p: 2, v: `${fmt.num(L.rho, 0)} · ${fmt.num(MATERIALS[state.material].rho, 0)} <small>kg/m³</small>`, s: `liquido · corpo (${s < 1 ? 'galleggia' : 'affonda'})` },
        { k: 'Bilancia', p: 2, v: `${fmt.num(balShown - tare, 1)} <small>g</small>`, s: state.app === 'overflow' ? 'liquido raccolto' : 'dopo la tara: la spinta / g' },
        { k: state.app === 'overflow' ? 'Liquido traboccato' : 'Livello', p: 3, v: state.app === 'overflow' ? `${fmt.num(disp * 1e6, 1)} <small>ml</small>` : `+${fmt.num(rise * 1000, 1)} <small>mm</small>`, s: state.app === 'overflow' ? `pesa ${fmt.N(sim.rho * disp * sim.g)}` : `liquido spostato ${fmt.num(sim.Vsub * 1e6, 1)} ml` },
      ]);
      tags.setText(tDyn, `Dinamometro · ${sim.range.F} N`);
      tags.setText(tBody, arch() ? `Cilindro · ${MATERIALS[state.material].name.toLowerCase()} ${state.V} cm³` : `${MATERIALS[state.material].name} · ${state.V} cm³`);
      tags.setText(tLiq, `${L.name}${state.liquid === 'salt' ? ` ${fmt.num(state.salt, 1)} %` : ''}`);
      ui.refresh('desc');
    }
  }

  function drawPlot() {
    if (!sim) return;
    const kind = state.plotKind, S = sim.S, L = liq();
    if (kind === 'depth') {
      // lettura del dinamometro e spinta in funzione della profondità del fondo del corpo, con le curve teoriche
      const W = sim.weight, X1 = S.H * 1.35 * 100, tx = [], tT = [], tF = [];
      for (let i = 0; i <= 120; i++) { const h = (S.H * 1.35 * i) / 120, F = sim.rho * sim.g * subUpright(S, h).V; tx.push(h * 100); tF.push(F); tT.push(Math.max(0, W - F)); }
      const series2 = [
        { x: tx, y: tT, color: '#e8452c', width: 2, dash: [8, 6], alpha: 0.55 },
        { x: tx, y: tF, color: '#2c67dc', width: 2, dash: [8, 6], alpha: 0.55 },
        { x: trace.map((p) => p.h * 100), y: trace.map((p) => p.T), color: '#e8452c', width: 3 },
        { x: trace.map((p) => p.h * 100), y: trace.map((p) => p.F), color: '#2c67dc', width: 3 },
      ];
      ui.drawPlot({ series: series2, marks: [{ x: S.H * 100, color: 'rgba(18,21,26,0.35)' }], X0: 0, X1, Y0: 0, Y1: Math.max(W * 1.12, 1e-3), xLabel: 'profondità (cm)', yLabel: 'forza (N)', legend: [['dinamometro', '#e8452c'], ['spinta', '#2c67dc']] });
      return;
    }
    if (kind === 'time') {
      const t1 = Math.max(tAct, 10), t0 = t1 - 10, s = series.filter((p) => p.t >= t0 - 0.1);
      let Y1 = sim.weight * 1.12;
      for (const p of s) Y1 = Math.max(Y1, p.T * 1.05, p.F * 1.05, p.B * 1.05);
      const x = s.map((p) => p.t), legend = [['dinamometro', '#e8452c'], ['spinta', '#2c67dc'], [state.app === 'overflow' ? 'peso raccolto' : 'bilancia', '#0c9d8f']];
      ui.drawPlot({ series: [{ x, y: s.map((p) => p.B), color: '#0c9d8f', width: 3 }, { x, y: s.map((p) => p.F), color: '#2c67dc', width: 3 }, { x, y: s.map((p) => p.T), color: '#e8452c', width: 3 }], X0: t0, X1: t1, Y0: 0, Y1: Math.max(Y1, 1e-3), xLabel: 't (s)', yLabel: 'forza (N)', legend });
      return;
    }
    // spinta misurata in funzione della massa di liquido spostato: rette di pendenza g
    const pts = records.filter((r) => r.kind === 'sotto' || r.kind === 'galla');
    let X1 = Math.max(10, L.rho * S.V * 1000 * 1.2), Y1 = 0.1;
    for (const r of pts) { X1 = Math.max(X1, r.mDisp * 1.2); Y1 = Math.max(Y1, r.FA * 1.2); }
    Y1 = Math.max(Y1, (X1 / 1000) * gNow() * 0.6);
    const gs = [...new Set([...pts.map((r) => r.grav), state.grav])];
    const series2 = gs.map((k) => ({ x: [0, X1], y: [0, (X1 / 1000) * GRAVITY[k].g], color: '#6b7380', width: 2, dash: [8, 6], alpha: k === state.grav ? 0.85 : 0.4 }));
    ui.drawPlot({ series: series2, points: pts.map((r) => ({ x: r.mDisp, y: r.FA, color: r.color, r: 7 })), X0: 0, X1, Y0: 0, Y1, xLabel: 'liquido spostato (g)', yLabel: 'spinta (N)', legend: gs.map((k) => [`g ${GRAVITY[k].name}`, '#6b7380']) });
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
    const dtSim = paused ? 0 : Math.min(dt, 0.05) * state.slow;
    if (!paused) stepSeq(dt);
    if (dtSim > 0) { sim.step(dtSim); simT += dtSim; track(dtSim); dtLast = dtSim; sample(); }
    place();
    hud(paused ? 0 : dt);
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
  rebuild();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico delle forze', tools: [document.getElementById('plot-kind')], redraw: drawPlot });
  window.lab = { state, ui, stage, rig, sim: () => sim, records: () => records, seq: () => seq, paused: () => paused, togglePause, immerseToggle, cutToggle, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
