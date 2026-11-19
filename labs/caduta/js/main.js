// main.js — Il moto di caduta
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { SegBuffer } from '../../../shared/js/lines.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { PLANETS, body, integrate, vacuum, terminalVelocity, sampleAt, ballMaterial } from './fall.js';
import { Rig, GROUND, POLE } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const OBJ = {
  ballA: { name: 'Pallina A', kind: 'ball', color: '#e8452c', mass: 'massA' },
  ballB: { name: 'Pallina B', kind: 'ball', color: '#2c67dc', mass: 'massB' },
  feather: { name: 'Piuma', kind: 'feather', color: '#0c9d8f' },
  hammer: { name: 'Martello', kind: 'hammer', color: '#c98a00' },
};
const ORDER = ['ballA', 'ballB', 'feather', 'hammer'];
const PLANET_ORDER = Object.keys(PLANETS);

const state = {
  planet: 'earth', compare: false, planets: ['earth', 'moon', 'mars'],
  ballA: true, massA: 0.26, ballB: false, massB: 0.0027, feather: false, hammer: false,
  h: 1.5, v0: 0, angle: 0, air: true, slow: 1,
  strobe: false, strobeHz: 20, trails: true, vectors: false, outline: false, labels: true, quality: 'low', plotKind: 'y',
};
const BASE = { compare: false, ballA: false, ballB: false, feather: false, hammer: false, v0: 0, angle: 0, air: true, strobe: false };
const PRESETS = [
  ['apollo', 'Apollo 15 sulla Luna', 'Il martello e la piuma di David Scott (2 agosto 1971)', { planet: 'moon', feather: true, hammer: true, h: 1.6 }],
  ['earth', 'Martello e piuma sulla Terra', 'Lo stesso esperimento, con l\'aria', { planet: 'earth', feather: true, hammer: true, h: 1.6 }],
  ['moonearth', 'Terra, Luna e Marte', 'La stessa pallina e la stessa piuma su tre mondi', { compare: true, planets: ['earth', 'moon', 'mars'], ballA: true, massA: 0.26, feather: true, h: 1.5 }],
  ['planets', 'Sette pianeti a confronto', 'Una pallina d\'acciaio lasciata cadere su ogni pianeta', { compare: true, planets: [...PLANET_ORDER], ballA: true, massA: 0.26, h: 1.5 }],
  ['galileo', 'Galileo: masse diverse', 'Legno e acciaio lasciati dalla stessa altezza', { planet: 'earth', ballA: true, massA: 0.03, ballB: true, massB: 0.26, h: 2 }],
  ['pingpong', 'Ping-pong e acciaio', 'Quando l\'aria comincia a contare', { planet: 'earth', ballA: true, massA: 0.0027, ballB: true, massB: 0.26, h: 4 }],
  ['vacuum', 'Tutti nel vuoto', 'Senza aria cadono tutti insieme', { planet: 'earth', ballA: true, massA: 0.0027, ballB: true, massB: 0.26, feather: true, hammer: true, h: 2, air: false }],
  ['venus', 'Su Venere', 'Un\'atmosfera densissima: la pallina leggera quasi galleggia', { planet: 'venus', ballA: true, massA: 0.0027, ballB: true, massB: 0.26, hammer: true, h: 1.5 }],
  ['throw', 'Lancio orizzontale', 'La parabola fotografata a intervalli uguali', { planet: 'earth', ballA: true, massA: 0.26, h: 1.2, v0: 2.5, angle: 0, air: false, strobe: true, strobeHz: 20 }],
  ['mars', 'Lancio su Marte', 'Verso l\'alto, con poco più di un terzo della gravità', { planet: 'mars', ballA: true, massA: 0.26, h: 1, v0: 4, angle: 70, strobe: true, strobeHz: 10 }],
];
const VIEWS = [['overview', 'Panoramica'], ['side', 'Di lato'], ['release', 'Partenza'], ['landing', 'Arrivo'], ['follow', 'Segui la caduta']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try {
    stage = new Stage(canvas, { keyPosition: [-3.2, 7.5, 4.8], keyTarget: [0.4, 0, 0], shadowBox: [-3.5, 3.5, 3.5, -3.5], shadowFar: 20, fog: [14, 140] });
  } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));

  // scie, segni d'arrivo, vettori ed etichette: un insieme per oggetto, riusati fra un calcolo e l'altro
  const fxPool = [];
  function fxAt(i) {
    while (fxPool.length <= i) {
      const buf = new SegBuffer(700);
      const line = new LineSegments2(buf.geometry(), new LineMaterial({ vertexColors: true, linewidth: 2.2, transparent: true, opacity: 0.85, depthWrite: false }));
      line.frustumCulled = false; line.userData.noAO = true; line.renderOrder = 5;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.022, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
      ring.userData.noAO = true; ring.renderOrder = 6;
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, 0xffffff, 0.04, 0.025);
      arrow.traverse((o) => { o.userData.noAO = true; if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 7; });
      scene.add(line, ring, arrow);
      const f = { buf, line, ring, arrow, segT: [], used: false };
      f.tag = tags.add('', 'nocase', (o) => o.copy(ring.position).setY(0), () => state.labels && f.used && ring.visible && !state.compare);
      fxPool.push(f);
    }
    return fxPool[i];
  }
  // nomi delle corsie nella modalità di confronto
  const laneZ = {};
  // a terra, accanto al punto d'arrivo di ogni corsia
  for (const pk of PLANET_ORDER) tags.add(PLANETS[pk].name, 'nocase', (o) => o.set(0.17, GROUND, laneZ[pk]), () => state.labels && state.compare && laneZ[pk] !== undefined);

  // ───────────────────────── stato della simulazione ─────────────────────────
  let items = [], planets = [], vacs = {}, tEnd = 0, tLandMax = 0, anyFloat = false;
  let phase = 'idle', simT = 0, dirty = true, plotAt = 0, view = 'overview', pendingView = null;
  let drag = null;
  let fpsEma = 60, hudTimer = 0;
  const tmp = {};
  const dummy = new THREE.Object3D();

  /** Oggetti da simulare: uno per ogni (pianeta, oggetto attivo), affiancati lungo z per corsie. */
  function activeList() {
    planets = state.compare ? PLANET_ORDER.filter((k) => state.planets.includes(k)) : [state.planet];
    const out = [];
    let z = -0.18;
    for (const k of Object.keys(laneZ)) delete laneZ[k];
    planets.forEach((pk, pi) => {
      const P = PLANETS[pk], z0 = z;
      if (pi) z += 0.12;                                       // spazio fra una corsia e l'altra
      ORDER.filter((k) => state[k]).forEach((ok, oi) => {
        const info = OBJ[ok], m = info.kind === 'ball' ? state[info.mass] : undefined, b = body(info.kind, m);
        if (oi) z += 0.07;
        const o = {
          key: `${state.compare ? 'c' : 's'}:${pk}:${ok}`, planet: pk, P, obj: ok, ...info, b, m,
          look: info.kind === 'ball' ? ballMaterial(m).name : info.kind,
          color: state.compare ? P.color : info.color,
        };
        o.z = z + b.width / 2; z += b.width;
        out.push(o);
      });
      laneZ[pk] = (z0 + (pi ? 0.12 : 0) + z) / 2;
    });
    return out;
  }

  function resolve() {
    items = activeList();
    vacs = {};
    for (const pk of planets) vacs[pk] = vacuum(state.h, state.v0, state.angle * DEG, PLANETS[pk].g);
    for (const o of items) o.res = integrate(o.b, { g: o.P.g, rho: state.air ? o.P.rho : 0, h: state.h, v0: state.v0, angle: state.angle * DEG });
    tEnd = Math.max(...items.map((o) => o.res.t[o.res.n - 1]));
    anyFloat = items.some((o) => o.res.tLand === null);
    tLandMax = anyFloat ? tEnd : Math.max(...items.map((o) => o.res.tLand));
    const maxTop = Math.max(...items.map((o) => o.b.top));
    rig.setObjects(items.map((o) => ({ key: o.key, kind: o.kind, look: o.look, z: o.z, color: o.color, top: o.b.top })));
    rig.setArm(state.h, items.map((o) => ({ kind: o.kind, z: o.z, top: o.b.top })));
    rig.setPoleHeight(Math.max(1.0, state.h + maxTop + 0.2));
    rig.setPad(Math.min(...items.map((o) => o.z - o.b.width / 2)) - 0.06, Math.max(...items.map((o) => o.z + o.b.width / 2)) + 0.06);
    // scie: segmenti precalcolati, mostrati man mano che il tempo avanza
    for (const f of fxPool) { f.used = false; f.buf.reset(); f.segT = []; f.buf.commit(); f.line.geometry.instanceCount = 0; f.ring.visible = false; f.arrow.visible = false; }
    items.forEach((o, i) => {
      const f = fxAt(i), r = o.res, N = 600, T = r.t[r.n - 1], c = new THREE.Color(o.color);
      f.used = true;
      o.fx = f;
      let px = r.x[0], py = r.y[0];
      for (let j = 1; j <= N; j++) {
        const t = (T * j) / N, q = sampleAt(r, t, tmp);
        f.buf.push(px, GROUND + py + o.b.top / 2, o.z, q.x, GROUND + q.y + o.b.top / 2, o.z, c, 0, 1);
        f.segT.push(t); px = q.x; py = q.y;
      }
      f.buf.commit(); f.line.geometry.instanceCount = 0;
      f.ring.material.color.set(o.color);
      f.arrow.setColor(o.color);
      f.ring.position.set(r.xLand, GROUND + 0.0008, o.z);
      tags.setText(f.tag, r.tLand !== null ? `${o.name} · ${fmt.s(r.tLand)}` : `${o.name} · galleggia`);
    });
    for (const o of items) rig.objects[o.key].ghosts.count = 0;
    simT = 0;
    if (phase !== 'running') phase = 'idle';
    metrics();
    if (state.compare) {
      ui.setPlanetNote(planets.map((pk) => `<b>${PLANETS[pk].name}</b> ${fmt.num(PLANETS[pk].g, 2)} m/s²`).join(' · '));
      stage.setPalette(PLANETS.earth.sky[0], PLANETS.earth.sky[1], PLANETS.earth.floor);
    } else {
      const P = PLANETS[state.planet];
      ui.setPlanetNote(`<b>g = ${fmt.num(P.g, 2)} m/s²</b> · ${P.rho > 0 ? `aria ${fmt.num(P.rho, P.rho < 1 ? 3 : 1)} kg/m³` : 'nessuna aria'} · ${P.note}`);
      stage.setPalette(P.sky[0], P.sky[1], P.floor);
    }
    plotAt = 0;
  }

  // ───────────────────────── misure ─────────────────────────
  const slowName = () => ['1×', '½×', '¼×', '⅒×', '1/20×'][[1, 0.5, 0.25, 0.1, 0.05].indexOf(state.slow)] || '';
  function metrics() {
    if (state.compare) {
      const ts = planets.map((pk) => vacs[pk].t);
      const cells = [{ k: 'Confronto', v: `${planets.length} <small>pianeti</small>`, s: 'stessa altezza, stessi oggetti', title: 'Ogni corsia è un pianeta diverso: oggetti e altezza sono gli stessi' }];
      planets.forEach((pk, i) => {
        const P = PLANETS[pk];
        // con poco spazio restano visibili i primi pianeti della lista
        cells.push({ k: P.name, p: i < 3 ? 1 : i < 5 ? 2 : 3, v: fmt.s(vacs[pk].t).replace(' s', ' <small>s</small>'), s: `g ${fmt.num(P.g, 2)} m/s²`, title: `Tempo di caduta nel vuoto su ${P.name}${state.air && P.rho > 0 ? ` (con l'aria il tempo vero è un po' più lungo)` : ''}` });
      });
      ui.setMetrics(cells);
      ui.setClockSide(`rallentatore ${slowName()}`, `nel vuoto ${fmt.num(Math.min(...ts), 3)}–${fmt.num(Math.max(...ts), 3)} s`);
      return;
    }
    const P = PLANETS[state.planet], rho = state.air ? P.rho : 0, vac = vacs[state.planet];
    const vts = items.map((o) => ({ o, vt: terminalVelocity(o.b, P.g, rho) })).filter((x) => isFinite(x.vt));
    vts.sort((a, b) => a.vt - b.vt);
    const cells = [
      { k: 'Gravità', v: `${fmt.num(P.g, 2)} <small>m/s²</small>`, s: P.name, title: 'Accelerazione di gravità alla superficie del pianeta' },
      { k: 'Nel vuoto', v: fmt.s(vac.t).replace(' s', ' <small>s</small>'), s: state.v0 === 0 ? 't = √(2h/g)' : 'con la velocità iniziale', title: 'Tempo di caduta senza aria: uguale per tutti gli oggetti' },
      { k: 'Impatto nel vuoto', p: 2, v: fmt.ms(vac.v).replace(' m/s', ' <small>m/s</small>'), s: 'v = √(v₀² + 2gh)' },
      vts.length
        ? { k: 'Velocità limite', v: vts[0].vt === 0 ? 'galleggia' : fmt.ms(vts[0].vt).replace(' m/s', ' <small>m/s</small>'), s: vts.map((x) => `${x.o.name.replace('Pallina ', '')} ${fmt.num(x.vt, x.vt < 10 ? 2 : 0)}`).slice(0, 3).join(' · '), title: 'Velocità alla quale la resistenza dell\'aria bilancia il peso: l\'oggetto smette di accelerare' }
        : { k: 'Velocità limite', v: '—', s: rho > 0 ? '' : 'senza aria non c\'è' },
    ];
    if (state.v0 > 0 && Math.abs(Math.cos(state.angle * DEG)) > 0.01) cells.push({ k: 'Gittata nel vuoto', p: 2, v: fmt.m(vac.range), s: 'distanza orizzontale' });
    if (state.v0 > 0 && state.angle > 0) cells.push({ k: 'Quota massima', p: 3, v: fmt.m(vac.apex), s: 'nel vuoto' });
    cells.push({ k: 'Aria', p: 3, v: rho > 0 ? `${fmt.num(rho, rho < 1 ? 3 : 1)} <small>kg/m³</small>` : 'vuoto', s: state.air ? (P.rho > 0 ? 'densità al suolo' : 'il pianeta non ha aria') : 'attrito spento' });
    ui.setMetrics(cells);
    ui.setClockSide(`rallentatore ${slowName()}`, `nel vuoto ${fmt.s(vac.t)}`);
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    planets: Object.entries(PLANETS), presets: PRESETS, views: VIEWS,
    material: (m) => ballMaterial(m).name,
  }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        phase = 'idle';
        ui.refresh(); ui.sync(); dirty = true;
        pendingView = 'overview';           // dopo il nuovo calcolo, così l'inquadratura comprende tutta la traiettoria
        break;
      }
      case 'view': setView(arg); break;
      case 'drop': drop(); break;
      case 'pause': togglePause(); break;
      case 'reset': phase = 'idle'; simT = 0; dirty = true; break;
      case 'plotKind': ui.sync(); plotAt = 0; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'slow': metrics(); break;
      case 'strobe': case 'strobeHz': ui.sync(); for (const o of items) rig.objects[o.key].ghosts.count = 0; break;
      case 'trails': case 'vectors': case 'labels': case 'outline': break;
      case 'compare': case 'planets': ui.sync(); phase = 'idle'; dirty = true; pendingView = 'overview'; break;
      case 'ballA': case 'ballB': case 'feather': case 'hammer':
        if (!ORDER.some((k) => state[k])) { state[key] = true; ui.refresh(key); }   // almeno un oggetto
        ui.sync(); phase = 'idle'; dirty = true; break;
      default: phase = 'idle'; dirty = true; break;
    }
  });

  /** Lascia cadere; durante la caduta (o in pausa, o alla fine) ricomincia da capo. */
  function drop() {
    if (phase !== 'idle') { simT = 0; for (const o of items) rig.objects[o.key].ghosts.count = 0; }
    phase = 'running';
  }
  function togglePause() {
    if (phase === 'running') phase = 'paused';
    else if (phase === 'paused') phase = 'running';
  }

  // ───────────────────────── etichette ─────────────────────────
  const tH = tags.add('', 'nocase', (o) => o.set(POLE.x, rig.armY + 0.04, POLE.z));
  tags.add('Asta graduata', '', (o) => o.set(POLE.x, Math.max(0.5, state.h * 0.45), POLE.z));
  tags.add('Cronometro', '', (o) => o.set(0.16, 0.11, -0.56));

  // ───────────────────────── inquadrature ─────────────────────────
  function bbox() {
    let xmax = 0.35, ymax = state.h + 0.3, zmin = -0.3, zmax = 0.3;
    for (const o of items) {
      const r = o.res;
      for (let i = 0; i < r.n; i += Math.max(1, r.n >> 8)) { xmax = Math.max(xmax, r.x[i] + 0.2); ymax = Math.max(ymax, r.y[i] + 0.3); }
      zmin = Math.min(zmin, o.z - 0.1); zmax = Math.max(zmax, o.z + 0.1);
    }
    return { xmin: -0.45, xmax: Math.min(xmax, 60), ymax: Math.min(ymax, 40), zmin, zmax };
  }
  function viewPose(id) {
    const b = bbox(), cx = (b.xmin + b.xmax) / 2, cz = (b.zmin + b.zmax) / 2;
    // distanza perché altezza e larghezza della scena stiano nella parte libera dello schermo
    const tv = Math.tan((camera.fov * DEG) / 2), freeAspect = Math.max(camera.aspect * 0.62, 0.45);
    const wide = Math.max(b.xmax - b.xmin, (b.zmax - b.zmin) * 0.85);
    const fit = Math.max((b.ymax * 0.7) / tv, (wide * 0.66) / (tv * freeAspect), 0.9);
    switch (id) {
      case 'side': return { pos: [cx, b.ymax * 0.5, cz + fit * 1.02], target: [cx, b.ymax * 0.5, cz] };
      case 'release': { const y = GROUND + state.h; return { pos: [0.55, y + 0.22, cz + 0.85], target: [0, y + 0.02, cz] }; }
      case 'landing': return { pos: [0.6, 0.25, cz + 0.85], target: [Math.min(b.xmax - 0.2, 0.3) * 0.5, 0.03, cz] };
      case 'follow': { const y = GROUND + state.h * 0.6; return { pos: [0.7, y + 0.25, cz + 1.05], target: [0, y, cz] }; }
      default: { const d = new THREE.Vector3(0.8, 0.3, 1).normalize().multiplyScalar(fit); return { pos: [cx + d.x, b.ymax * 0.45 + d.y, cz + d.z], target: [cx, b.ymax * 0.45, cz - 0.05] }; }
    }
  }
  function setView(id, instant = false) {
    view = id;
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }

  // ───────────────────────── trascinamento del braccio ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3(), plane = new THREE.Plane();
  let hoverTick = 0;
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pick = (e) => { ray(e); return raycaster.intersectObjects(rig.dragTargets, false)[0]; };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) { canvas.classList.add('dragging'); return; }
    const n = camera.getWorldDirection(v3).setY(0).normalize();
    plane.setFromNormalAndCoplanarPoint(n, hit.point);
    drag = { offset: hit.point.y - state.h };
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      ray(e);
      if (raycaster.ray.intersectPlane(plane, v3)) {
        const h = Math.min(Math.max(Math.round((v3.y - drag.offset) * 200) / 200, 0.1), 5);
        if (h !== state.h) { state.h = h; ui.refresh('h'); phase = 'idle'; dirty = true; }
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !!pick(e));
  }, { capture: true });
  const endDrag = (e) => {
    canvas.classList.remove('dragging');
    if (!drag) return;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); drop(); } else if (k === 'p') togglePause(); else if (k === 'r') { phase = 'idle'; dirty = true; } else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── disegno di un istante ─────────────────────────
  /** Inclinazione della piuma: oscilla mentre plana nell'aria (solo aspetto). */
  function featherTilt(P, t, landed, out) {
    if (!state.air || !(P.rho > 0) || t <= 0) { out.set(0, 0, 0); return out; }
    const amp = 0.42 * (1 - Math.exp(-t / 0.25)) * Math.min(1, P.rho / 0.5);
    if (landed) { out.set(0, 0.5 * t, 0); return out; }
    out.set(0.3 * amp * Math.sin(6.9 * t + 1), 0.5 * t, amp * Math.sin(10 * t));
    return out;
  }
  const tilt = new THREE.Vector3();
  function place(t) {
    for (const o of items) {
      const obj = rig.objects[o.key], f = o.fx;
      const s = sampleAt(o.res, t, tmp), landed = o.res.tLand !== null && t >= o.res.tLand;
      obj.group.position.set(s.x, GROUND + s.y, o.z);
      if (o.kind === 'feather') { featherTilt(o.P, Math.min(t, o.res.t[o.res.n - 1]), landed, tilt); obj.inner.rotation.set(tilt.x, tilt.y, tilt.z); }
      // scia fino all'istante t
      let k = 0;
      while (k < f.segT.length && f.segT[k] <= t) k++;
      f.line.geometry.instanceCount = state.trails && t > 0 ? k : 0;
      f.ring.visible = landed;
      // vettore velocità (prima del lancio: la velocità iniziale)
      const sp = Math.hypot(s.vx, s.vy);
      const showV = (state.vectors && t > 0 && !landed && sp > 0.02) || (t === 0 && state.v0 > 0);
      f.arrow.visible = showV;
      if (showV) {
        const L = Math.min(Math.max(sp * 0.08, 0.06), 1.4);
        f.arrow.position.set(s.x, GROUND + s.y + o.b.top / 2, o.z);
        f.arrow.setDirection(v3.set(s.vx, s.vy, 0).normalize());
        f.arrow.setLength(L, Math.min(0.05, L * 0.35), Math.min(0.03, L * 0.22));
      }
      // foto stroboscopica: un'immagine ogni 1/f secondi
      const gh = obj.ghosts;
      if (state.strobe && t > 0) {
        const T = Math.min(t, o.res.t[o.res.n - 1]), every = 1 / state.strobeHz;
        const n = Math.floor(T / every) + 1;
        let stride = 1;
        while (n / stride > gh.instanceMatrix.count) stride++;
        const want = Math.floor((n - 1) / stride) + 1;
        if (want !== gh.count || stride !== gh.userData.stride) {
          gh.userData.stride = stride;
          for (let i = 0; i < want; i++) {
            const ti = i * stride * every, q = sampleAt(o.res, ti, {});
            dummy.position.set(q.x, GROUND + q.y, o.z);
            if (o.kind === 'feather') { featherTilt(o.P, ti, false, tilt); dummy.rotation.set(tilt.x, tilt.y, tilt.z); } else dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            gh.setMatrixAt(i, dummy.matrix);
          }
          gh.count = want;
          gh.instanceMatrix.needsUpdate = true;
        }
      } else gh.count = 0;
    }
  }

  function hud(t) {
    const running = phase === 'running';
    const shown = Math.min(t, tLandMax);
    ui.setClock(shown, running && t < tLandMax);
    rig.setTimer(shown, running && t < tLandMax);
    ui.setDropLabel({ idle: 'Lascia cadere', running: 'Ricomincia', paused: 'Ricomincia', done: 'Di nuovo' }[phase]);
    ui.setPause(phase === 'paused' ? 'Riprendi' : 'Pausa', phase === 'running' || phase === 'paused');
    ui.setStatus({ idle: 'pronto', running: 'in caduta', paused: 'in pausa', done: anyFloat ? 'qualcosa galleggia' : 'tutti a terra' }[phase], running);
    const several = ORDER.filter((k) => state[k]).length > 1;
    ui.setRows(items.map((o) => {
      const r = o.res, landed = r.tLand !== null && t >= r.tLand;
      const s = sampleAt(r, t, {});
      const extra = o.kind === 'ball' ? `${fmt.mass(o.m)} · ${o.look}` : '';
      const name = state.compare
        ? `${o.P.name}<small>${several ? o.name + (extra ? ' · ' : '') : ''}${extra}</small>`
        : `${o.name}${extra ? `<small>${extra}</small>` : ''}`;
      if (phase === 'idle') return { key: o.key, color: o.color, name, t: '—', v: '' };
      if (r.tLand === null && t >= r.t[r.n - 1]) return { key: o.key, color: o.color, name, t: 'galleggia', v: '' };
      return { key: o.key, color: o.color, name, t: landed ? fmt.s(r.tLand) : '…', v: fmt.ms(landed ? r.vLand : Math.hypot(s.vx, s.vy)), done: landed };
    }));
  }

  function drawPlot(t) {
    let T = tEnd, Ymax = state.h, Vmax = 0;
    const refs = planets.map((pk) => {
      const P = PLANETS[pk], vac = vacs[pk], N = 160, rt = [], ry = [], rv = [];
      for (let i = 0; i <= N; i++) { const tt = (vac.t * i) / N; rt.push(tt); ry.push(state.h + vac.vy * tt - 0.5 * P.g * tt * tt); rv.push(Math.hypot(vac.vx, vac.vy - P.g * tt)); }
      T = Math.max(T, vac.t); Ymax = Math.max(Ymax, vac.apex); Vmax = Math.max(Vmax, vac.v);
      return { t: rt, y: ry, v: rv, color: state.compare ? P.color : '#15181c' };
    });
    for (const o of items) { const r = o.res; for (let i = 0; i < r.n; i += Math.max(1, r.n >> 9)) { Ymax = Math.max(Ymax, r.y[i]); Vmax = Math.max(Vmax, Math.hypot(r.vx[i], r.vy[i])); } }
    ui.drawPlot({
      kind: state.plotKind, T: T * 1.04, Ymax: Ymax * 1.08, Vmax: Vmax * 1.1, now: phase === 'idle' ? 0 : t, refs,
      series: phase === 'idle' ? [] : items.map((o) => ({ color: o.color, t: o.res.t, y: o.res.y, vx: o.res.vx, vy: o.res.vy, n: o.res.n })),
    });
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    if (dirty) { dirty = false; resolve(); }
    if (pendingView) { setView(pendingView); pendingView = null; }
    if (phase === 'running') {
      simT += dt * state.slow;
      if (simT >= tEnd) { simT = tEnd; phase = 'done'; }
    }
    const t = phase === 'idle' ? 0 : simT;
    place(t);
    if (view === 'follow' && items.length) {
      // la telecamera accompagna il primo oggetto
      const y = sampleAt(items[0].res, t, tmp).y + GROUND;
      const dy = (y + 0.05 - stage.controls.target.y) * Math.min(1, dt * 6);
      stage.controls.target.y += dy; camera.position.y += dy;
    }
    stage.update(dt);
    hud(t);                                   // prima del disegno: il display a LED è nella scena
    stage.outlined = state.outline ? items.map((o) => rig.objects[o.key]?.group) : [];
    tags.setText(tH, `h = ${fmt.m(state.h)}`);
    tags.update(camera, w, h, state.labels);
    stage.render();

    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (nowMs - plotAt > 60) { plotAt = nowMs; drawPlot(t); }
    if (hudTimer > 0.25) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  resolve(); dirty = false;
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico del moto', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot(phase === 'idle' ? 0 : simT) });
  window.lab = { state, ui, stage, rig, items: () => items, phase: () => phase, simT: () => simT, drop, togglePause, setView, plotView, THREE };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
