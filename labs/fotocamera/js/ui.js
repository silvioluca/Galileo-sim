// ui.js — pannello dei controlli, riquadro live view, misure. Nessuna logica fisica qui.
import { createControls } from '../../../shared/js/controls.js';

export const F_STOPS = Array.from({ length: 19 }, (_, i) => 2.8 * 2 ** (i / 6));
const F_NAMES = ['2.8', '3.2', '3.5', '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11', '13', '14', '16', '18', '20', '22'];
export const SHUTTERS = [30, 15, 8, 4, 2, 1, 1 / 2, 1 / 4, 1 / 8, 1 / 15, 1 / 30, 1 / 60, 1 / 125, 1 / 250, 1 / 500, 1 / 1000, 1 / 2000, 1 / 4000];
export const ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = {
  num,
  fstop(N) {
    let best = 0;
    F_STOPS.forEach((s, i) => { if (Math.abs(Math.log(s / N)) < Math.abs(Math.log(F_STOPS[best] / N))) best = i; });
    return Math.abs(Math.log(F_STOPS[best] / N)) < 0.03 ? `f/${F_NAMES[best].replace('.', ',')}` : `f/${N >= 100 ? Math.round(N) : num(N, 1)}`;
  },
  shutter(t) { return t >= 1 ? `${t} s` : `1/${Math.round(1 / t)} s`; },
  shutterAuto(t) { return t >= 0.75 ? `${num(t, t < 10 ? 1 : 0)} s` : `1/${Math.round(1 / t)} s`; },
  dist(m) {
    if (!isFinite(m) || m > 60) return '∞';
    if (m < 1) return `${num(m * 100, m < 0.1 ? 1 : 0)} cm`;
    return `${num(m, m < 10 ? 2 : 1)} m`;
  },
  distFine(m) {
    if (!isFinite(m) || m > 500) return '∞';
    if (m < 1) return `${num(m * 100, 1)} cm`;
    return `${num(m, m < 10 ? 2 : 1)} m`;
  },
  mm(m, d = 1) { return `${num(m * 1000, d)} mm`; },
  micro(m) { const u = m * 1e6; return u >= 1000 ? `${num(u / 1000, 2)} mm` : `${num(u, u < 10 ? 1 : 0)} µm`; },
  deg(r) { return `${num((r * 180) / Math.PI, 1)}°`; },
  ev(v) { return `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${num(Math.abs(v), 1)} EV`; },
};

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  // ── obiettivo ──
  seg('lensType', '', [
    ['pinhole', 'Stenopeico', 'Un semplice foro: la camera oscura'],
    ['singlet', 'Lente singola', 'Una sola lente biconvessa: luminosa ma piena di aberrazioni'],
    ['gauss', 'Doppio Gauss', 'Sei lenti in quattro gruppi: lo schema dei classici 50 mm'],
  ]);
  slider('focal', {
    range: () => [35, 135, 1], read: () => state.focal, write: (v) => { state.focal = v; },
    label: () => (state.lensType === 'pinhole' ? 'Distanza foro–sensore' : 'Lunghezza focale'),
    text: () => `${state.focal} mm`,
  });
  slider('aperture', {
    range: () => (state.lensType === 'pinhole' ? [0, 100, 1] : [0, 18, 1]),
    read: () => (state.lensType === 'pinhole' ? Math.round((Math.log(state.pinDiam / 0.1) / Math.log(30)) * 100) : Math.round(6 * Math.log2(state.fnum / 2.8))),
    write: (v) => { if (state.lensType === 'pinhole') state.pinDiam = 0.1 * 30 ** (v / 100); else state.fnum = F_STOPS[v]; },
    label: () => (state.lensType === 'pinhole' ? 'Diametro del foro' : 'Diaframma'),
    text: () => (state.lensType === 'pinhole'
      ? `${num(state.pinDiam, 2)} mm <small>· ${fmt.fstop(state.focal / state.pinDiam)}</small>`
      : `${fmt.fstop(state.fnum)}`),
  });
  slider('focus', {
    range: () => [0, 1000, 1],
    read: () => { const mfd = ctx.lens().minFocusDist; return isFinite(state.focusDist) ? Math.round((1 - mfd / state.focusDist) * 1000) : 1000; },
    write: (v) => { const mfd = ctx.lens().minFocusDist; state.focusDist = v >= 1000 ? Infinity : mfd / (1 - v / 1000); },
    label: () => 'Messa a fuoco',
    text: () => (state.lensType === 'pinhole' ? 'non serve' : fmt.dist(ctx.lens().focusDist)),
    disabled: () => state.lensType === 'pinhole',
    button: { text: 'AF', title: 'Autofocus sul pendolo', click: () => on('autofocus') },
  });
  // ── esposizione ──
  slider('shutter', {
    range: () => [0, SHUTTERS.length - 1, 1],
    read: () => { let b = 0; SHUTTERS.forEach((s, i) => { if (Math.abs(Math.log(s / state.shutter)) < Math.abs(Math.log(SHUTTERS[b] / state.shutter))) b = i; }); return b; },
    write: (v) => { state.shutter = SHUTTERS[v]; },
    label: () => 'Tempo di posa', text: () => fmt.shutter(state.shutter),
  });
  slider('iso', {
    range: () => [0, ISOS.length - 1, 1], read: () => ISOS.indexOf(state.iso), write: (v) => { state.iso = ISOS[v]; },
    label: () => 'Sensibilità', text: () => `ISO ${state.iso}`,
  });
  // ── scena ──
  slider('subjectDist', {
    range: () => [0.35, 2.2, 0.01], read: () => state.subjectDist, write: (v) => { state.subjectDist = v; },
    label: () => 'Distanza del pendolo', text: () => fmt.dist(state.subjectDist),
  });
  toggle('swing', 'Pendolo in oscillazione', 'per studiare il mosso');
  // ── raggi ──
  toggle('rays', 'Mostra i raggi');
  seg('rayMode', 'Fascio', [['cone', 'Cono', 'Tutti i raggi che entrano nell\'obiettivo'], ['fan', 'Ventaglio', 'Solo i raggi del piano meridiano, come nei libri']]);
  slider('rayDensity', {
    range: () => [1, 3, 1], read: () => state.rayDensity, write: (v) => { state.rayDensity = v; },
    label: () => 'Numero di raggi', text: () => ['pochi', 'medio', 'molti'][state.rayDensity - 1],
  });
  toggle('pulses', 'Impulsi in viaggio', 'nel vetro rallentano di un fattore n');
  toggle('blocked', 'Raggi fermati', 'dal diaframma e dalle montature');
  toggle('dispersion', 'Luce bianca', 'tre colori: mostra la dispersione');
  // ── vista ──
  toggle('cutaway', 'Spaccato della fotocamera');
  toggle('dof', 'Profondità di campo', 'zona nitida e inquadratura');
  toggle('outline', 'Contorno del pendolo', 'evidenzia l\'oggetto in moto');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const views = $('#views');
  for (const [id, text] of ctx.views) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = text;
    b.addEventListener('click', () => on('view', id));
    views.appendChild(b);
  }
  const ticks = $('#ticks');
  for (let i = 0; i <= 18; i++) { const t = document.createElement('i'); if (i % 3 === 0) t.className = 'major'; ticks.appendChild(t); }

  $('#auto-exp').addEventListener('click', () => on('autoExposure'));
  $('#reset-emitters').addEventListener('click', () => on('resetEmitters'));
  $('#clear-emitters').addEventListener('click', () => on('clearEmitters'));
  $('#shoot').addEventListener('click', () => on('shoot'));
  $('#pause').addEventListener('click', () => on('pause'));
  $('#fullscreen').addEventListener('click', () => on('fullscreen'));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  // su schermi piccoli il pannello copre la scena: un tocco fuori lo richiude (il velo è attivo solo lì, via CSS)
  $('#scrim').addEventListener('click', () => setPanel(false));

  // lightbox
  const lb = $('#lightbox');
  const openLightbox = (url, caption) => { $('img', lb).src = url; $('#lb-cap').textContent = caption; $('#lb-dl').href = url; lb.classList.add('on'); };
  lb.addEventListener('click', (e) => { if (e.target.tagName !== 'A') lb.classList.remove('on'); });
  $('#photo').addEventListener('click', () => on('zoomPhoto'));

  const marks = [];
  const api = {
    refresh,
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setMeter(ev) {
      const c = Math.max(-3.25, Math.min(3.25, ev));
      $('#needle').style.left = `${((c + 3) / 6) * 100}%`;
      $('#ev').textContent = fmt.ev(ev);
    },
    setExif(parts) { $('#exif').innerHTML = parts.map((p) => `<span>${p}</span>`).join(''); },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => {
        const el = m.children[i];
        el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;';
        el.title = c.title || '';
        el.dataset.p = c.p || 1;
      });
    },
    /** Segnaposto colorati sulla fotografia: dove cade l'immagine di ciascuna sorgente. */
    setMarks(list) {
      const photo = $('#photo');
      while (marks.length < list.length) { const d = document.createElement('div'); d.className = 'mark'; photo.appendChild(d); marks.push(d); }
      marks.forEach((d, i) => {
        const m = list[i];
        if (!m) { d.style.opacity = 0; return; }
        d.style.opacity = 1; d.style.left = `${m.x * 100}%`; d.style.top = `${m.y * 100}%`; d.style.setProperty('--c', m.color);
      });
    },
    flash(on) { $('#flash').classList.toggle('on', on); },
    setShooting(b) { $('#shoot').disabled = b; },
    setPause(label, enabled) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.disabled = !enabled; b.classList.toggle('on', label !== 'Pausa'); },
    photoRect() { const r = $('#photo').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; },
    addShot(url, caption) {
      const strip = $('#strip');
      const h = $('.hint', strip); if (h) h.remove();
      const b = document.createElement('button');
      b.title = caption; b.innerHTML = `<img alt="${caption}" src="${url}">`;
      b.addEventListener('click', () => openLightbox(url, caption));
      strip.prepend(b);
      while (strip.children.length > 5) strip.lastChild.remove();
    },
    openLightbox,
    boot() { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 900); },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const live = $('#live').getBoundingClientRect();
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, liveLeft: live.left, liveTop: live.top, metricsTop: metrics.height ? metrics.top : innerHeight };
    },
  };
  return api;
}
