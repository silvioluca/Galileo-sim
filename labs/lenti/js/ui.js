// ui.js — pannello dei controlli, riquadro dello schermo (immagine, misure, grafico), fascia delle misure.
// Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
const signed = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), d)}`;
export const fmt = { num, signed, cm: (m, d = 1) => `${num(m * 100, d)} cm` };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

const LENSES = [
  ['biconvex', 'Biconvessa', 'Convergente, le due facce uguali'], ['planoconvex', 'Piano-convessa', 'Convergente, una faccia piana'], ['achromat', 'Acromatica', 'Doppietto di crown e flint: corregge i colori'],
  ['biconcave', 'Biconcava', 'Divergente, le due facce uguali'], ['planoconcave', 'Piano-concava', 'Divergente, una faccia piana'],
];
const ASYM = new Set(['planoconvex', 'planoconcave', 'achromat']);

/** ctx: { presets, views, fText(k), asymText(k) } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const pos = (key, min, max, label) => slider(key, {
    range: () => [min, max, 0.005], read: () => state[key], write: (v) => { state[key] = Math.round(v * 1000) / 1000; },
    label: () => label, text: () => ctx.posText(key),
  });

  seg('obj', '', [
    ['F', 'Lettera F', 'Una F luminosa: si vede subito se l\'immagine è capovolta'], ['point', 'Punto luminoso', 'Un forellino illuminato'],
    ['farF', 'F all\'infinito', 'La F nel fuoco di un collimatore: la luce arriva come da lontanissimo'], ['beam', 'Fascio parallelo', 'Un punto all\'infinito: luce parallela all\'asse'],
  ], 2);
  for (const k of ['1', '2']) {
    seg(`type${k}`, '', LENSES, 3);
    slider(`f${k}`, {
      range: () => [5, 50, 0.5], read: () => state[`f${k}`], write: (v) => { state[`f${k}`] = v; },
      label: () => 'Distanza focale', text: () => ctx.fText(k),
    });
    toggle(`flip${k}`, 'Girala', ctx.asymText(k));
  }
  pos('x1', 0.03, 1.5, 'Posizione sul banco');
  slider('iris', {
    range: () => [4, 50, 1], read: () => state.iris, write: (v) => { state.iris = v; },
    label: () => 'Diaframma', text: () => ctx.irisText(),
  });
  toggle('lens2', 'Seconda lente', 'per un cannocchiale, o per misurare una lente divergente');
  pos('x2', 0.08, 1.58, 'Posizione sul banco');
  toggle('screen', 'Schermo', 'raccoglie l\'immagine reale; tolto, si guarda attraverso la lente');
  pos('xs', 0.1, 1.65, 'Posizione sul banco');
  seg('rays', 'Raggi', [['none', 'Nessuno'], ['principal', 'Principali', 'La costruzione della lente sottile: parallelo, per il centro, per il fuoco'], ['real', 'Veri', 'Seguiti attraverso il vetro con la legge di Snell, in tre colori']]);
  slider('ambient', {
    range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; },
    label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`),
  });
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    host.innerHTML = '';
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.innerHTML = text; if (title) b.title = title;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');
  for (const id of ['note', 'focus', 'clear', 'fullscreen', 'focus-panel']) $(`#${id}`)?.addEventListener('click', () => on(id === 'focus-panel' ? 'focus' : id));
  for (const [id, d] of [['zoom-in', 1], ['zoom-out', -1], ['zoom-all', 0]]) $(`#${id}`).addEventListener('click', () => on('zoom', d));
  document.querySelectorAll('#plot-kind button').forEach((b) => b.addEventListener('click', () => { state.plotKind = b.dataset.k; on('plotKind'); }));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));
  const photo = $('#photo');
  photo.addEventListener('click', () => on('zoom', 2));
  photo.addEventListener('pointermove', (e) => { const r = photo.getBoundingClientRect(); on('hover', [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]); });
  photo.addEventListener('pointerleave', () => on('hover', null));
  const plot = $('#plot'), pc = plot.getContext('2d');

  return {
    refresh,
    sync() {
      $('[data-ctl="flip1"]').hidden = !ASYM.has(state.type1);
      $('[data-ctl="flip2"]').hidden = !ASYM.has(state.type2);
      document.querySelectorAll('[data-l2]').forEach((el) => { el.hidden = !state.lens2; });
      $('[data-ctl="xs"]').classList.toggle('disabled', !state.screen);
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setExif(a, b, c) { for (const [id, t] of [['ex-a', a], ['ex-b', b], ['ex-c', c]]) { const el = $(`#${id}`); if (el.innerHTML !== t) el.innerHTML = t; } },
    setScale(px, text) { $('#scalebar-line').style.width = `${px.toFixed(1)}px`; $('#scalebar-text').textContent = text; },
    setCursor(text) { const el = $('#cursor'); if (el.textContent !== (text || '')) el.textContent = text || ''; },
    setZoomInfo(text, auto) { const b = $('#zoom-all'); if (b.textContent !== text) b.textContent = text; b.classList.toggle('on', !!auto); },
    setPhotoNote(text) { const n = $('#photo-note'); if (n.textContent !== text) n.textContent = text; n.hidden = !text; },
    photoRect() { const r = photo.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => { const el = m.children[i]; el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;'; el.title = c.title || ''; el.dataset.p = c.p || 1; });
    },
    boot() { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 900); },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },
    /** series: [{x, y, color, width, alpha, dash}]; points: [{x, y, color, r, ring}]; marks: rette verticali. */
    drawPlot({ series = [], points = [], X0 = 0, X1, Y0 = 0, Y1, xLabel, yLabel, legend, marks = [] }) {
      const W = plot.width, Hh = plot.height, padL = PAD.l, padB = PAD.b, padT = PAD.t, padR = PAD.r;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 140))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 60)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - 90) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs)), px, Hh - 12);
      }
      pc.textAlign = 'right';
      for (let y = Math.ceil(Y0 / ys) * ys; y <= Y1 + 1e-9; y += ys) {
        const py = yOf(y);
        pc.strokeStyle = Math.abs(y) < ys / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)';
        pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        pc.fillText(num(Math.abs(y) < ys / 2 ? 0 : y, dec(ys)), padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) {
        let lx = W - padR - 8; pc.font = '500 17px "Geist Mono Variable", Consolas, monospace';
        for (const [text, col] of legend.slice().reverse()) { const tw = pc.measureText(text).width; pc.fillStyle = col; pc.fillText(text, lx, padT + 14); lx -= tw + 22; }
      }
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const m of marks) { pc.strokeStyle = m.color; pc.lineWidth = 2; pc.setLineDash([4, 5]); pc.beginPath(); pc.moveTo(xOf(m.x), padT); pc.lineTo(xOf(m.x), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath();
        let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) { pen = false; continue; }
          const px = xOf(s.x[i]), py = yOf(s.y[i]);
          if (pen) pc.lineTo(px, py); else pc.moveTo(px, py);
          pen = true;
        }
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const p of points) {
        pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2);
        if (p.ring) { pc.lineWidth = 3; pc.strokeStyle = p.color; pc.fillStyle = '#f7f7f5'; pc.fill(); pc.stroke(); } else { pc.fillStyle = p.color; pc.fill(); }
      }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
