// ui.js — pannello dei controlli, riquadro dello schermo (vista ingrandita + profilo d'intensità),
// vista al microscopio dell'elemento, misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = {
  num,
  /** Lunghezza con l'unità più leggibile (da nanometri a metri). */
  len(m) {
    const a = Math.abs(m);
    if (!isFinite(m)) return '∞';
    if (a < 1e-6) return `${num(m * 1e9, 0)} nm`;
    if (a < 1e-3) return `${num(m * 1e6, a < 1e-5 ? 1 : 0)} µm`;
    if (a < 1e-2) return `${num(m * 1e3, 2)} mm`;
    if (a < 0.1) return `${num(m * 1e3, 1)} mm`;
    if (a < 1) return `${num(m * 100, 1)} cm`;
    return `${num(m, 2)} m`;
  },
  um(v) { return v >= 1000 ? `${num(v / 1000, 2)} mm` : `${num(v, 0)} µm`; },
  cm(m) { return `${num(m * 100, 1)} cm`; },
  pct(v) { return v < 0.001 ? '< 0,1 %' : v < 0.1 ? `${num(v * 100, 1)} %` : `${num(v * 100, 0)} %`; },
  deg(r) { return `${num((r * 180) / Math.PI, 2)}°`; },
};

const niceRound = (v) => { const s = v < 100 ? 1 : v < 400 ? 5 : v < 1000 ? 10 : 50; return Math.round(v / s) * s; };
/** Passo "tondo" (1–2–5) più vicino a v per difetto. */
export function niceStep(v) {
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const logSlider = (key, min, max, label, text) => slider(key, {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state[key] / min)) / Math.log(max / min)),
    write: (v) => { state[key] = niceRound(min * (max / min) ** (v / 200)); },
    label: () => label, text: () => text(state[key]),
  });
  const pos = (key, min, max, label) => slider(key, {
    range: () => [min, max, 0.005], read: () => state[key], write: (v) => { state[key] = v; },
    label: () => label, text: () => fmt.cm(state[key]),
  });

  // ── sorgente ──
  seg('source', '', [['laser', 'Laser', 'Luce di un solo colore, perfettamente coerente'], ['white', 'Luce bianca', 'Proiettore: tutti i colori insieme']]);
  slider('lambda', {
    range: () => [400, 700, 1], read: () => state.lambda, write: (v) => { state.lambda = v; },
    label: () => 'Lunghezza d\'onda',
    text: () => (state.source === 'laser' ? `<i class="swatch" style="background:${ctx.cssColor(state.lambda)}"></i>${state.lambda} nm` : '400–700 nm'),
    disabled: () => state.source !== 'laser',
  });
  slider('beam', {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state.beam / 0.4)) / Math.log(20)),
    write: (v) => { state.beam = Math.round(0.4 * 20 ** (v / 200) * 10) / 10; },
    label: () => 'Diametro del fascio', text: () => `${num(state.beam, 1)} mm`,
  });
  // ── elemento ──
  seg('element', '', [
    ['none', 'Nessuno', 'Solo il fascio (ed eventualmente la lente)'], ['slits', 'Fenditure', 'Aperture lineari'], ['holes', 'Fori', 'Aperture circolari'],
    ['obstacle', 'Ostacolo', 'Un filo o un disco opaco'], ['grating', 'Reticolo', 'Centinaia di fenditure equidistanti'],
  ], 3);
  seg('count', '', [[1, 'Singola'], [2, 'Doppia'], [3, 'Tripla']]);
  seg('obstacle', '', [['wire', 'Filo (lineare)'], ['disc', 'Disco (circolare)']]);
  logSlider('slitA', 10, 500, 'Larghezza a', fmt.um);
  logSlider('slitD', 50, 2000, 'Distanza d fra i centri', fmt.um);
  logSlider('holeA', 20, 2000, 'Diametro D', fmt.um);
  logSlider('holeD', 50, 3000, 'Distanza d fra i centri', fmt.um);
  logSlider('wireA', 20, 2000, 'Spessore del filo', fmt.um);
  logSlider('discA', 200, 6000, 'Diametro del disco', fmt.um);
  slider('lines', {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state.lines / 5)) / Math.log(120)),
    write: (v) => { const x = 5 * 120 ** (v / 200); state.lines = x < 20 ? Math.round(x) : x < 100 ? Math.round(x / 5) * 5 : Math.round(x / 10) * 10; },
    label: () => 'Righe per millimetro', text: () => `${state.lines} <small>· passo ${fmt.um(1000 / state.lines)}</small>`,
  });
  pos('xMask', 0.06, 1.5, 'Posizione sul banco');
  // ── lente ──
  toggle('lensOn', 'Lente convergente', 'un focalizzatore sul banco');
  slider('focal', {
    range: () => [50, 500, 5], read: () => state.focal, write: (v) => { state.focal = v; },
    label: () => 'Focale', text: () => `${state.focal} mm`,
  });
  pos('xLens', 0.05, 1.5, 'Posizione sul banco');
  // ── schermo ──
  pos('xScreen', 0.2, 1.6, 'Posizione sul banco');
  slider('ev', {
    range: () => [-2, 10, 0.5], read: () => state.ev, write: (v) => { state.ev = v; },
    label: () => 'Esposizione', text: () => (state.ev === 0 ? 'automatica' : `${state.ev > 0 ? '+' : '−'}${num(Math.abs(state.ev), 1)} stop`),
  });
  // ── vista ──
  slider('ambient', {
    range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; },
    label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`),
  });
  toggle('sheet', 'Luce nell\'aria', 'intensità nel piano orizzontale, come con la nebbia');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = text; if (title) b.title = title;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');

  $('#fullscreen').addEventListener('click', () => on('fullscreen'));
  $('#zoom-in').addEventListener('click', () => on('zoom', 1));
  $('#zoom-out').addEventListener('click', () => on('zoom', -1));
  $('#zoom-auto').addEventListener('click', () => on('zoom', 0));
  $('#plot-log').addEventListener('click', () => on('plotLog'));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));

  const lb = $('#lightbox');
  const openLightbox = (url, caption) => { $('img', lb).src = url; $('#lb-cap').textContent = caption; $('#lb-dl').href = url; lb.classList.add('on'); };
  lb.addEventListener('click', (e) => { if (e.target.tagName !== 'A') lb.classList.remove('on'); });
  const photo = $('#photo');
  photo.addEventListener('click', () => on('zoomPhoto'));
  photo.addEventListener('pointermove', (e) => { const r = photo.getBoundingClientRect(); on('hover', (e.clientX - r.left) / r.width); });
  photo.addEventListener('pointerleave', () => on('hover', null));

  const plot = $('#plot'), pc = plot.getContext('2d');
  const mask = $('#mask-view'), mc = mask.getContext('2d');

  return {
    refresh,
    /** Mostra solo i controlli che riguardano l'elemento scelto. */
    sync() {
      const kind = state.element === 'obstacle' ? state.obstacle : state.element;
      document.querySelectorAll('[data-for]').forEach((el) => {
        const ok = el.dataset.for.split(' ').includes(kind) || (el.dataset.for === 'obstacle' && state.element === 'obstacle');
        el.hidden = !ok || (el.hasAttribute('data-multi') && state.count < 2);
      });
      document.querySelectorAll('[data-lens]').forEach((el) => el.classList.toggle('disabled', !state.lensOn));
      $('#zoom-auto').classList.toggle('on', state.zoomAuto);
      $('#plot-log').classList.toggle('on', state.plotLog);
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => {
        const el = m.children[i];
        el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;';
        el.title = c.title || ''; el.dataset.p = c.p || 1;
      });
    },
    setScale(px, text) { $('#scalebar-line').style.width = `${px.toFixed(1)}px`; $('#scalebar-text').textContent = text; },
    setCursor(text) { $('#cursor').textContent = text || ''; },
    setViewInfo(text) { $('#viewinfo').textContent = text; },
    photoRect() { const r = photo.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; },
    openLightbox,
    boot() { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 900); },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },

    /** Profilo d'intensità lungo l'asse orizzontale dello schermo. */
    drawPlot({ profile, half, peak, color, log }) {
      const W = plot.width, Hh = plot.height, padB = 30, padT = 12;
      pc.clearRect(0, 0, W, Hh);
      pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const step = niceStep((2 * half) / 6);
      pc.font = '500 19px "Geist Mono Variable", Consolas, monospace'; pc.textAlign = 'center'; pc.textBaseline = 'alphabetic';
      const unit = step < 1e-3 ? 1e6 : 1e3;
      for (let x = -Math.floor(half / step) * step; x <= half + 1e-12; x += step) {
        const px = ((x + half) / (2 * half)) * W;
        pc.strokeStyle = Math.abs(x) < step / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.09)'; pc.lineWidth = 1;
        pc.beginPath(); pc.moveTo(px, padT - 4); pc.lineTo(px, Hh - padB); pc.stroke();
        pc.fillStyle = '#6b7380';
        if (px > 34 && px < W - 34) pc.fillText(num(x * unit, 0), px, Hh - 8);
      }
      pc.textAlign = 'right'; pc.fillStyle = '#9aa1ab'; pc.fillText(unit === 1e6 ? 'µm' : 'mm', W - 8, Hh - 8);
      pc.textAlign = 'left'; pc.fillText(log ? 'log I' : 'I', 8, padT + 14);
      const n = profile.length, h = Hh - padB - padT;
      const yOf = (v) => {
        const t = log ? Math.max(0, 1 + Math.log10(Math.max(v / peak, 1e-9)) / 4) : Math.min(v / peak, 1);
        return Hh - padB - t * h;
      };
      pc.beginPath(); pc.moveTo(0, Hh - padB);
      for (let i = 0; i < n; i++) pc.lineTo(((i + 0.5) / n) * W, yOf(profile[i]));
      pc.lineTo(W, Hh - padB); pc.closePath();
      const g = pc.createLinearGradient(0, padT, 0, Hh - padB);
      g.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ',0.55)')); g.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ',0.06)'));
      pc.fillStyle = g; pc.fill();
      pc.beginPath();
      for (let i = 0; i < n; i++) { const x = ((i + 0.5) / n) * W, y = yOf(profile[i]); if (i) pc.lineTo(x, y); else pc.moveTo(x, y); }
      pc.strokeStyle = '#15181c'; pc.lineWidth = 1.6; pc.stroke();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.lineWidth = 1; pc.beginPath(); pc.moveTo(0, Hh - padB + 0.5); pc.lineTo(W, Hh - padB + 0.5); pc.stroke();
    },

    /** L'elemento diffrangente ingrandito, con il contorno del fascio che lo illumina. */
    drawMask(el, w, color) {
      const W = mask.width, Hh = mask.height;
      const opaque = el.kind === 'slits' || el.kind === 'holes';
      let half;
      if (opaque) half = Math.max(((el.n - 1) * el.d + el.a) * 0.9, el.a * 2.6);
      else if (el.kind === 'wire') half = el.a * 4;
      else if (el.kind === 'disc') half = el.a * 1.25;
      else half = (1e-3 / el.lines) * 9;
      const s = W / (2 * half), cx = W / 2, cy = Hh / 2;
      mc.clearRect(0, 0, W, Hh);
      mc.fillStyle = opaque ? '#0c0d0f' : '#dfe5ea'; mc.fillRect(0, 0, W, Hh);
      // la luce che arriva: più intensa al centro del fascio
      const beam = (alpha) => { const g = mc.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w * s * 1.5, 1)); g.addColorStop(0, color.replace('rgb', 'rgba').replace(')', `,${alpha})`)); g.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ',0)')); return g; };
      if (opaque) {
        mc.fillStyle = '#f3f5f8';
        for (let j = 0; j < el.n; j++) {
          const x = cx + (j - (el.n - 1) / 2) * el.d * s;
          if (el.kind === 'slits') mc.fillRect(x - (el.a * s) / 2, 0, Math.max(el.a * s, 1), Hh); else { mc.beginPath(); mc.arc(x, cy, Math.max((el.a / 2) * s, 0.8), 0, Math.PI * 2); mc.fill(); }
        }
        // le aperture prendono il colore della luce, più intensa al centro del fascio
        const g = mc.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w * s * 1.6, 2));
        g.addColorStop(0, color); g.addColorStop(1, 'rgb(46,48,54)');
        mc.globalCompositeOperation = 'multiply'; mc.fillStyle = g; mc.fillRect(0, 0, W, Hh); mc.globalCompositeOperation = 'source-over';
      } else {
        mc.fillStyle = beam(0.35); mc.fillRect(0, 0, W, Hh);
        mc.fillStyle = '#111316';
        if (el.kind === 'wire') mc.fillRect(cx - (el.a * s) / 2, 0, el.a * s, Hh);
        else if (el.kind === 'disc') { mc.beginPath(); mc.arc(cx, cy, (el.a / 2) * s, 0, Math.PI * 2); mc.fill(); } else {
          const p = (1e-3 / el.lines) * s;
          for (let x = cx - Math.ceil(cx / p) * p; x < W; x += p) mc.fillRect(x + p / 4, 0, p / 2, Hh);
        }
      }
      // contorno del fascio (raggio 1/e²)
      if (w * s < W * 2.5) {
        mc.setLineDash([7, 6]); mc.strokeStyle = opaque ? 'rgba(255,255,255,0.55)' : 'rgba(18,21,26,0.55)'; mc.lineWidth = 1.6;
        mc.beginPath(); mc.arc(cx, cy, w * s, 0, Math.PI * 2); mc.stroke(); mc.setLineDash([]);
      }
      const bar = niceStep(half / 2);
      mc.fillStyle = opaque ? '#fff' : '#15181c';
      mc.fillRect(14, Hh - 18, bar * s, 4);
      $('#mask-scale').textContent = `barra: ${fmt.len(bar)}${w * s >= W * 2.5 ? ' · fascio molto più largo' : ''}`;
    },
  };
}
