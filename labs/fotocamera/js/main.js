// main.js — La macchina fotografica
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { buildSubjects, AXIS_H, PENDULUM_AMP } from './subjects.js';
import { CameraRig } from './cameraModel.js';
import { RayViz, EMITTER_COLORS } from './rays.js';
import { Overlays } from './overlays.js';
import { LensSystem, SENSOR_W, SENSOR_H, COC } from './optics.js';
import { PhotoSystem, EXPOSURE_K } from './photo.js';
import { createUI, fmt, SHUTTERS, ISOS } from './ui.js';

const state = {
  lensType: 'gauss', focal: 50, fnum: 2.8, pinDiam: 0.3, focusDist: 0.581,
  shutter: 1 / 125, iso: 200,
  subjectDist: 0.6, swing: false,
  rays: true, rayMode: 'cone', rayDensity: 2, pulses: true, blocked: true, dispersion: false,
  cutaway: true, dof: true, outline: false, labels: true, quality: 'low',
};

const VIEWS = [['overview', 'Panoramica'], ['section', 'Spaccato'], ['sensor', 'Sensore'], ['front', 'Frontale'], ['top', 'Dall\'alto'], ['photographer', 'Fotografo']];
const QUALITY = {
  low: { samples: 4, maxLive: 220, capture: 96, burst: 12 },
  medium: { samples: 8, maxLive: 360, capture: 192, burst: 16 },
  high: { samples: 16, maxLive: 640, capture: 384, burst: 24 },
};
const BOB_R = 0.019;

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera, renderer } = stage;

  const subjects = buildSubjects();
  scene.add(subjects.group);
  subjects.pendulum.setDistance(state.subjectDist);

  let lens = new LensSystem(state.lensType, state.focal);
  const rig = new CameraRig(AXIS_H);
  scene.add(rig.group);
  const rays = new RayViz(AXIS_H);
  scene.add(rays.group);
  const overlays = new Overlays(AXIS_H, document.getElementById('labels'));
  scene.add(overlays.group);
  const photo = new PhotoSystem(renderer, scene, AXIS_H);
  for (const m of [rig.sensorMat, rig.lcdMat]) { m.map = photo.devRT.texture; m.color.set('#ffffff'); m.needsUpdate = true; }
  const hideForPhoto = [rig.group, rays.group, overlays.group];

  // ───────────────────────── stato derivato ─────────────────────────
  let simTime = 0, swingAmp = 0, swingT0 = 0, wasMoving = false, paused = false;
  /** Qualcosa si muove: il pendolo oscilla, o gli impulsi di luce viaggiano lungo i raggi. */
  const anyMotion = () => state.swing || swingAmp > 0 || (state.rays && state.pulses);
  function togglePause() { if (paused) paused = false; else if (anyMotion()) paused = true; }
  let pendingLens = false, lastRebuild = 0, fineAt = 0;
  let focusTween = null;
  let capture = null, shutterAnim = null, reviewUntil = 0;
  let samplesPerFrame = 6;
  let metricsDirty = true;
  let photoRect = null;
  let fpsEma = 60, hudTimer = 0;
  let dprCap = Infinity, perfAcc = 0, perfN = 0, lastScaleChange = 0;

  const pendulumAngle = (t) => PENDULUM_AMP * swingAmp * Math.cos(subjects.pendulum.omega * (t - swingT0));
  const exposureGain = () => (state.shutter * state.iso) / (lens.Neff * lens.Neff) / EXPOSURE_K;

  function applyOptics() {
    if (lens.isPinhole) lens.setPinhole(state.pinDiam * 1e-3);
    else {
      state.fnum = Math.min(Math.max(state.fnum, lens.minN), lens.maxN);
      lens.setAperture(state.fnum);
      state.focusDist = Math.max(state.focusDist, lens.minFocusDist);
      lens.setFocus(state.focusDist);
    }
    photo.reset();
    metricsDirty = true;
  }

  function rebuildLens(detail = 1) {
    pendingLens = false;
    lastRebuild = performance.now();
    lens = new LensSystem(state.lensType, state.focal);
    applyOptics();
    rig.setLens(lens, detail);
    rig.setCutaway(state.cutaway);
    pendingLens = false;
    lastRebuild = performance.now();
    ui.refresh('aperture'); ui.refresh('focus'); ui.refresh('focal');
  }

  function autoExposure() {
    let iso = state.iso;
    const target = (i) => (EXPOSURE_K * lens.Neff * lens.Neff) / i;
    while (target(iso) > 30 && iso < ISOS[ISOS.length - 1]) iso *= 2;
    while (target(iso) < 1 / 4000 && iso > ISOS[0]) iso /= 2;
    const t = target(iso);
    let best = SHUTTERS[0];
    for (const s of SHUTTERS) if (Math.abs(Math.log(s / t)) < Math.abs(Math.log(best / t))) best = s;
    state.iso = iso; state.shutter = best;
    ui.refresh('iso'); ui.refresh('shutter');
    if (swingAmp > 0) photo.reset();
    metricsDirty = true;
  }

  function focusTo(dist) {
    if (lens.isPinhole) return;
    const d = Math.max(dist, lens.minFocusDist);
    focusTween = { a: isFinite(lens.focusDist) ? 1 / lens.focusDist : 0, b: 1 / d, t: 0 };
  }

  function defaultEmitters() {
    rays.clearEmitters();
    scene.updateMatrixWorld(true);
    const bob = subjects.pendulum.bob;
    rays.addEmitter(bob, bob.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-BOB_R, 0, 0)));
    const far = subjects.pickables.find((o) => o.name === 'pedina' && Math.abs(o.position.x - 1.65) < 0.01);
    if (far) rays.addEmitter(far, new THREE.Vector3(1.65 - 0.0155, 0.1012, 0.3));
  }

  function viewPose(id) {
    const len = (rig.info ? rig.info.xFront : 70) / 1000 + lens.e;
    const mid = len / 2 - 0.006;
    switch (id) {
      case 'section': return { pos: [mid + 0.03, 0.142, 0.115 + len * 1.25], target: [mid, 0.098, 0], cutaway: true };
      case 'sensor': return { pos: [0.088, 0.13, 0.09], target: [0.004, 0.1, 0], cutaway: true };
      case 'front': return { pos: [len * 1.9 + 0.2, 0.19 + len * 0.3, 0.2 + len * 0.55], target: [len * 0.45, 0.088, 0], cutaway: false };
      case 'top': return { pos: [0.86, 2.6, 0.02], target: [0.86, 0, 0] };
      case 'photographer': return { pos: [-0.43, 0.25, 0.085], target: [0.5, 0.105, -0.075], cutaway: false };
      default: return { pos: [-0.275 + len * 0.1, 0.245, 0.3 + len * 0.45], target: [0.135 + len * 0.5, 0.086, -0.03] };
    }
  }

  function setView(id, instant = false) {
    const v = viewPose(id);
    if (v.cutaway !== undefined && v.cutaway !== state.cutaway) { state.cutaway = v.cutaway; rig.setCutaway(v.cutaway, !instant); ui.refresh('cutaway'); }
    // su schermi stretti (telefono in verticale) la telecamera arretra per tenere tutto nell'inquadratura
    const k = Math.max(1, Math.min(2.6, 1.15 / camera.aspect));
    const pos = v.pos.map((p, i) => v.target[i] + (p - v.target[i]) * k);
    if (instant) { camera.position.set(...pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(pos, v.target);
  }

  function applyQuality() {
    stage.setQuality(state.quality, dprCap);
    photo.maxLive = QUALITY[state.quality].maxLive;
    samplesPerFrame = Math.min(samplesPerFrame, QUALITY[state.quality].samples);
    rays.setDpr(renderer.getPixelRatio());
    photo.reset();
  }

  function shoot() {
    if (capture) return;
    const q = QUALITY[state.quality];
    capture = { T: state.shutter, total: q.capture };
    photo.startCapture(simTime, state.shutter, q.capture);
    shutterAnim = { t: 0, T: state.shutter };
    reviewUntil = 0;
    ui.setShooting(true);
    ui.flash(true);
    setTimeout(() => ui.flash(false), 110);
  }

  function caption() {
    const ap = lens.isPinhole ? `foro ${fmt.num(state.pinDiam, 2)} mm (${fmt.fstop(lens.N)})` : fmt.fstop(lens.N);
    return `${lens.label} ${state.focal} mm · ${ap} · ${fmt.shutter(state.shutter)} · ISO ${state.iso}`;
  }

  function finishCapture() {
    photo.develop(lens, exposureGain(), state.iso, { freeze: true });
    const cnv = photo.snapshot();
    const text = caption();
    // codifica sincrona: toBlob aspetta i momenti di inattività, che con la scena in movimento non arrivano
    ui.addShot(cnv.toDataURL('image/jpeg', 0.94), text);
    photo.capture = null;
    capture = null;
    photo.reset();
    reviewUntil = performance.now() + 900;
    ui.setShooting(false);
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, { lens: () => lens, views: VIEWS }, (key, arg) => {
    switch (key) {
      case 'lensType':
        if (state.lensType !== 'pinhole' && !isFinite(state.focusDist)) state.focusDist = 5;
        rebuildLens(); autoExposure(); break;
      case 'focal': pendingLens = true; fineAt = performance.now() + 280; break;
      case 'aperture': applyOptics(); break;
      case 'focus': focusTween = null; applyOptics(); break;
      case 'shutter': case 'iso': if (swingAmp > 0) photo.reset(); metricsDirty = true; break;
      case 'subjectDist': subjects.pendulum.setDistance(state.subjectDist); photo.reset(); metricsDirty = true; break;
      case 'swing': if (state.swing) swingT0 = simTime; break;
      case 'cutaway': rig.setCutaway(state.cutaway, true); break;
      case 'quality': dprCap = Infinity; applyQuality(); break;
      case 'view': setView(arg); break;
      case 'autofocus': focusTo(state.subjectDist - BOB_R); break;
      case 'autoExposure': autoExposure(); break;
      case 'shoot': shoot(); break;
      case 'pause': togglePause(); break;
      case 'resetEmitters': defaultEmitters(); break;
      case 'clearEmitters': rays.clearEmitters(); break;
      case 'zoomPhoto': {
        ui.openLightbox(photo.snapshot().toDataURL('image/jpeg', 0.94), `Live view — ${caption()}`);
        break;
      }
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      default: break;
    }
  });

  // etichette agganciate alla scena
  const v3 = new THREE.Vector3();
  const inside = () => state.cutaway;
  overlays.addTag('Sensore', '', (o) => rig.anchor('sensor', lens, o), inside);
  overlays.addTag('Otturatore', '', (o) => rig.anchor('shutter', lens, o), inside);
  const tagIris = overlays.addTag('Diaframma', '', (o) => rig.anchor('iris', lens, o), () => state.cutaway || lens.isPinhole);
  overlays.addTag('Lenti', '', (o) => rig.anchor('glass', lens, o), () => state.cutaway && !lens.isPinhole);
  const tagFocus = overlays.addTag('Piano a fuoco', 'floor', (o) => o.set(overlays.frame.xf, overlays.frame.y1, 0), () => state.dof && !!overlays.frame);
  const tagZone = overlays.addTag('Zona nitida', 'floor alt', (o) => o.set(overlays.limits.near, 0, -(overlays.limits.near - lens.xEP) * (SENSOR_W / 2 / lens.ve)), () => state.dof && overlays.band.visible);

  // ───────────────────────── puntamento: clic sulla scena ─────────────────────────
  const raycaster = new THREE.Raycaster();
  const pickTargets = subjects.pickables.concat([stage.floor]);
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button }; canvas.classList.add('dragging'); stage.cancelTween(); });
  window.addEventListener('pointerup', (e) => {
    canvas.classList.remove('dragging');
    if (!down || e.target !== canvas) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dtc = performance.now() - down.t, button = down.button;
    down = null;
    if (moved > 5 || dtc > 450 || button !== 0) return;
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    if (!hit || hit.point.x < 0.12 || hit.point.x > 3.6 || Math.abs(hit.point.z) > 1.8) return;
    rays.addEmitter(hit.object === stage.floor ? null : hit.object, hit.point.clone().addScaledVector(hit.face ? v3.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : v3.set(0, 0, 0), 0.0006));
    if (!state.rays) { state.rays = true; ui.refresh('rays'); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); shoot(); }
    else if (k === 'p') togglePause();
    else if (k === 'c') { state.cutaway = !state.cutaway; rig.setCutaway(state.cutaway, true); ui.refresh('cutaway'); }
    else if (k === 'r') { state.rays = !state.rays; ui.refresh('rays'); }
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= '6') setView(VIEWS[Number(k) - 1][0]);
    else if (k === 'escape') document.getElementById('lightbox').classList.remove('on');
  });

  // ───────────────────────── dimensioni ─────────────────────────
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const lay = ui.layout();
    const shiftX = w > 860 ? lay.left / 2 : 0;
    const shiftY = w > 860 ? (h - lay.metricsTop) / 2 : 0;
    stage.resize(w, h, Math.round(shiftX), Math.round(shiftY));
    rays.setDpr(renderer.getPixelRatio());
    photoRect = ui.photoRect();
  }
  window.addEventListener('resize', onResize);
  // il riquadro della fotografia è disegnato nel canvas: ne seguo la posizione quando il pannello cambia dimensione
  new ResizeObserver(() => { photoRect = ui.photoRect(); }).observe(document.getElementById('live'));

  // ───────────────────────── misure ─────────────────────────
  function updateMetrics() {
    metricsDirty = false;
    const ev = Math.log2(exposureGain());
    ui.setMeter(ev);
    ui.setExif([`${state.focal} mm`, lens.isPinhole ? `⌀ ${fmt.num(state.pinDiam, 2)} mm` : fmt.fstop(lens.N), fmt.shutter(state.shutter), `ISO ${state.iso}`]);
    const fov = lens.fov;
    if (lens.isPinhole) {
      const v = lens.fNominal, d = state.pinDiam * 1e-3;
      const u = state.subjectDist - BOB_R - lens.xEP;
      const geo = d * (1 + v / u), airy = lens.airyDiameter();
      const opt = 1.9 * Math.sqrt(0.55e-6 * v);
      ui.setMetrics([
        { k: 'Camera oscura', v: fmt.fstop(lens.N), s: 'N = v / d', title: 'Senza lente non c\'è un piano a fuoco: ogni punto del soggetto proietta una macchia grande quanto il foro.' },
        { k: 'Sfocatura', v: fmt.micro(geo), s: 'ombra del foro', title: 'Sfocatura geometrica: d·(1 + v/u)' },
        { k: 'Diffrazione', v: fmt.micro(airy), s: 'Airy: 2,44·λ·N' },
        { k: 'Foro ottimale', v: `${fmt.num(opt * 1000, 2)} <small>mm</small>`, s: d < opt * 0.85 ? '<span class="bad">ora domina la diffrazione</span>' : d > opt * 1.2 ? '<span class="bad">ora domina il foro</span>' : '<span class="ok">sei vicino all\'ottimo</span>', title: 'Formula di Rayleigh: d ≈ 1,9·√(λ·v)' },
        { k: 'Campo', p: 2, v: fmt.deg(fov.h), s: `× ${fmt.deg(fov.v)} vert.` },
        { k: 'Luce raccolta', p: 3, v: `−${fmt.num(Math.log2((lens.N * lens.N) / (2.8 * 2.8)), 1)} <small>stop</small>`, s: 'rispetto a f/2,8' },
      ]);
      return;
    }
    const lim = lens.dofLimits();
    const total = lim.far - lim.near;
    const blur = lens.blurDiameter(state.subjectDist - BOB_R);
    ui.setMetrics([
      { k: 'Lenti sottili', v: '<i>1/s + 1/s′ = 1/f</i>', s: `s ${fmt.distFine(lens.sObj)} · s′ ${fmt.mm(lens.sImg)}`, title: 'Equazione delle lenti: distanze misurate dai piani principali dell\'obiettivo' },
      { k: 'Ingrandimento', p: 3, v: `${fmt.num(lens.mag, 3)}<small>×</small>`, s: lens.mag > 0 ? `1 cm → ${fmt.num(lens.mag * 10, 2)} mm` : 'soggetto all\'infinito', title: 'Dimensione dell\'immagine sul sensore rispetto al soggetto a fuoco' },
      { k: 'Pupilla', p: 2, v: `${fmt.num(lens.rEP * 2000, 1)} <small>mm</small>`, s: `D = f/N · N eff. ${fmt.num(lens.Neff, 1)}`, title: 'Pupilla d\'ingresso: diametro del fascio di luce che l\'obiettivo accetta. Il numero f efficace cresce mettendo a fuoco da vicino.' },
      { k: 'Campo', p: 2, v: fmt.deg(fov.h), s: `× ${fmt.deg(fov.v)} vert.`, title: 'Angolo di campo orizzontale e verticale' },
      { k: 'Prof. di campo', v: isFinite(total) ? fmt.dist(total).replace(/ (\S+)$/, ' <small>$1</small>') : '∞', s: `${fmt.distFine(lim.near)} – ${fmt.distFine(lim.far)}`, title: `Zona in cui la sfocatura resta sotto ${COC * 1000} mm. Iperfocale: ${fmt.dist(lens.hyperfocal)}` },
      { k: 'Sul pendolo', v: `⌀ ${fmt.micro(blur)}`, s: blur <= COC ? '<span class="ok">nitido</span>' : `<span class="bad">sfocato</span> · limite ${COC * 1e6} µm`, title: 'Diametro del cerchio di sfocatura della sfera del pendolo sul sensore' },
    ]);
  }

  function updateShutter(dt) {
    if (!shutterAnim) return;
    const a = shutterAnim;
    a.t += dt;
    const d = 0.2, t1 = 0.1, t2 = 0.15;
    const sync = 1 / 250;
    const delay = a.T >= sync ? d + Math.min(a.T, 0.3) : Math.max(d * a.T / sync, 0.035);
    const ramp = (t, t0, len) => Math.min(Math.max((t - t0) / len, 0), 1);
    const tClose = t2 + delay + d + 0.1;
    const c1 = a.t < t2 ? ramp(a.t, 0, t1) : 1 - ramp(a.t, t2, d);
    const c2 = a.t < tClose ? ramp(a.t, t2 + delay, d) : 1 - ramp(a.t, tClose, 0.12);
    rig.setShutter(c1, c2);
    if (a.t > tClose + 0.13) { shutterAnim = null; rig.setShutter(0, 0); }
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000;
    const rawDt = now - last;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    // in pausa il tempo della scena è fermo: pendolo e impulsi di luce restano dove sono
    if (paused && !anyMotion()) paused = false;
    const dtSim = paused ? 0 : dt;
    simTime += dtSim;
    const w = window.innerWidth, h = window.innerHeight;

    // durante il trascinamento della focale l'obiettivo è ricostruito in bozza, poi rifinito
    if (pendingLens && nowMs - lastRebuild > 60) rebuildLens(0.4);
    else if (fineAt && nowMs > fineAt) { fineAt = 0; rebuildLens(1); }

    if (focusTween) {
      focusTween.t = Math.min(focusTween.t + dt / 0.55, 1);
      const k = 1 - Math.pow(1 - focusTween.t, 3);
      const inv = focusTween.a + (focusTween.b - focusTween.a) * k;
      state.focusDist = inv > 1e-4 ? 1 / inv : Infinity;
      if (focusTween.t >= 1) focusTween = null;
      applyOptics();
      ui.refresh('focus');
    }

    // pendolo: l'ampiezza cresce e si smorza dolcemente quando lo si avvia o lo si ferma
    const targetAmp = state.swing ? 1 : 0;
    swingAmp += (targetAmp - swingAmp) * (1 - Math.exp(-dtSim / (state.swing ? 0.5 : 0.9)));
    if (!state.swing && swingAmp < 0.004) swingAmp = 0;
    const moving = swingAmp > 0 && !paused;
    if (wasMoving && !moving) photo.reset();
    wasMoving = moving;
    subjects.pendulum.setAngle(pendulumAngle(simTime));

    updateShutter(dt);
    rig.tick(dt);
    stage.update(dt);
    scene.updateMatrixWorld();
    rig.update(lens);
    const summary = rays.update(lens, { visible: state.rays, mode: state.rayMode, density: state.rayDensity, blocked: state.blocked, dispersion: state.dispersion, pulses: state.pulses }, simTime);
    overlays.update(lens, state, camera, w, h);
    stage.outlined = state.outline ? [subjects.pendulum.arm] : [];
    stage.render();

    // la fotografia
    const q = QUALITY[state.quality];
    const reviewing = nowMs < reviewUntil;
    if (!reviewing) {
      const n = capture ? q.burst : samplesPerFrame;
      const done = photo.accumulate(n, {
        lens, now: simTime, T: state.shutter, motion: moving, dt, hide: hideForPhoto,
        setTime: (t) => { subjects.pendulum.setAngle(pendulumAngle(paused ? simTime : t)); subjects.pendulum.arm.updateMatrixWorld(true); },
      });
      photo.develop(lens, exposureGain(), state.iso, { gain: capture ? Math.max(photo.progress, 0.02) : 1 });
      if (done) finishCapture();
      // adatta il numero di riprese per fotogramma alla velocità della macchina
      if (!capture && !photo.converged) {
        if (rawDt > 0.03 && samplesPerFrame > 2) samplesPerFrame--;
        else if (rawDt < 0.019 && samplesPerFrame < q.samples) samplesPerFrame++;
      }
    }
    if (photoRect && photoRect.w > 1) photo.present(photoRect, h);

    // contatori e misure (10 volte al secondo)
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) {
      hudTimer = 0;
      ui.setFps(Math.round(fpsEma));
      if (capture) ui.setStatus(`posa… ${Math.round(photo.progress * 100)}%`, true);
      else if (reviewing) ui.setStatus('scatto salvato', false);
      else if (paused) ui.setStatus('in pausa', false);
      else if (moving) ui.setStatus('video', true);
      else ui.setStatus(`${Math.round(photo.mass)} riprese`, !photo.converged);
      ui.setPause(paused ? 'Riprendi' : 'Pausa', paused || anyMotion());
      ui.setMarks(state.rays ? summary.map((s) => (s && s.onSensor ? { x: 0.5 + s.cz / SENSOR_W, y: 0.5 + s.cy / SENSOR_H, color: EMITTER_COLORS[s.slot] } : null)) : []);
      if (metricsDirty) updateMetrics();
      overlays.setTagText(tagIris, lens.isPinhole ? 'Foro stenopeico' : 'Diaframma');
      if (overlays.frame) overlays.setTagText(tagFocus, `Piano a fuoco · ${fmt.dist(lens.focusDist)}`);
      if (overlays.band.visible) overlays.setTagText(tagZone, `Nitido da ${fmt.dist(overlays.limits.near)} a ${fmt.dist(overlays.limits.far)}`);
    }

    // risoluzione dinamica (qualità "Bilanciata")
    if (state.quality === 'medium' && document.visibilityState === 'visible') {
      perfAcc += rawDt; perfN++;
      if (perfN >= 90) {
        const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
        const cur = renderer.getPixelRatio();
        if (avg > 0.034 && cur > 0.75 && nowMs - lastScaleChange > 1500) { dprCap = Math.max(0.7, cur - 0.2); lastScaleChange = nowMs; applyQuality(); onResize(); }
        else if (avg < 0.0145 && cur < Math.min(window.devicePixelRatio || 1, 1.5) - 0.01 && nowMs - lastScaleChange > 9000) { dprCap = cur + 0.15; lastScaleChange = nowMs; applyQuality(); onResize(); }
      }
    }
  }

  // ───────────────────────── avvio ─────────────────────────
  applyOptics();
  rig.setLens(lens);
  rig.setCutaway(state.cutaway);
  stage.setQuality(state.quality, dprCap);
  photo.maxLive = QUALITY[state.quality].maxLive;
  ui.refresh();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();   // su schermi piccoli i controlli partono chiusi
  onResize();
  defaultEmitters();
  setView('overview', true);
  updateMetrics();
  window.lab = { state, ui, stage, rig, rays, photo, overlays, subjects, lens: () => lens, setView, shoot, togglePause, paused: () => paused, rebuildLens, applyOptics, THREE };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
