// ui.js — pannello dei controlli, riquadro delle misure (numero grande, misure annotate, grafico), fascia in basso.
// Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num, deg: (r, d = 1) => `${num((r * 180) / Math.PI, d)}°` };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

/** ctx: { presets, views, kit: [[id, testo]…], incText(), phiText(), rotText(), spacingText() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('beams', 'Raggi', [[1, 'Uno'], [3, 'Tre'], [5, 'Cinque']]);
  slider('spacing', { range: () => [5, 15, 0.5], read: () => state.spacing, write: (v) => { state.spacing = v; }, label: () => 'Distanza fra i raggi', text: () => `${num(state.spacing, 1)} mm` });
  seg('color', 'Colore', [['red', 'Rosso · 650 nm'], ['green', 'Verde · 532 nm'], ['violet', 'Viola · 405 nm']]);
  toggle('orbit', 'Intorno al centro', 'il laser gira attorno al centro del goniometro e punta lì');
  slider('inc', { range: () => [-85, 85, 0.5], read: () => state.inc, write: (v) => { state.inc = v; }, label: () => 'Angolo d\'incidenza', text: () => ctx.incText() });
  slider('phi', { range: () => [-180, 180, 0.5], read: () => state.phi, write: (v) => { state.phi = v; }, label: () => 'Direzione del laser', text: () => ctx.phiText() });
  slider('rot', { range: () => [-180, 180, 0.5], read: () => ctx.selRot(), write: (v) => ctx.setSelRot(v), label: () => 'Rotazione', text: () => ctx.rotText() });
  toggle('marks', 'Normale e angoli', 'al primo punto d\'incontro del raggio centrale');
  toggle('ext', 'Prolungamenti', 'tratteggiati, dove i raggi sembrano provenire (fuoco virtuale)');
  toggle('weak', 'Riflessi deboli', 'la parte di luce che ogni superficie riflette (Fresnel)');
  slider('ambient', { range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; }, label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`) });
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    host.innerHTML = '';
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.innerHTML = text; if (title) b.title = title; b.dataset.id = id;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');
  chips($('#kit-lens'), ctx.kit.lens, 'add');
  chips($('#kit-block'), ctx.kit.block, 'add');
  chips($('#kit-mirror'), ctx.kit.mirror, 'add');
  for (const id of ['note', 'clear', 'fullscreen', 'flip', 'center', 'remove', 'aim', 'clear-kit']) $(`#${id}`)?.addEventListener('click', () => on(id));
  document.querySelectorAll('#plot-kind button').forEach((b) => b.addEventListener('click', () => { state.plotKind = b.dataset.k; on('plotKind'); }));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));
  const plot = $('#plot'), pc = plot.getContext('2d');
  let clockTxt = '';

  return {
    refresh,
    sync(sel) {
      $('[data-ctl="spacing"]').hidden = state.beams === 1;
      $('[data-ctl="inc"]').hidden = !state.orbit;
      $('[data-ctl="phi"]').hidden = state.orbit;
      $('#sel-box').hidden = !sel;
      $('#sel-empty').hidden = !!sel;
      if (sel) $('#sel-name').textContent = sel;
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setTitle(title, sub) { $('#live-title').textContent = title; $('#live-sub').textContent = sub; },
    setClock(txt, unit) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; } $('#unit').textContent = unit; },
    setSide(a, b) { const x = $('#side1'), y = $('#side2'); if (x.innerHTML !== a) x.innerHTML = a; if (y.innerHTML !== b) y.innerHTML = b; },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => { const el = m.children[i]; el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;'; el.title = c.title || ''; el.dataset.p = c.p || 1; });
    },
    setRows(rows, empty) {
      const box = $('#rows');
      const key = rows.map((r) => r.key).join() + '|' + empty;
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = rows.length ? rows.map(() => '<div class="obj"><i></i><span class="n"></span><span class="t"></span><span class="v"></span></div>').join('') : `<p class="empty">${empty}</p>`;
      }
      rows.forEach((r, i) => { const el = box.children[i]; if (!el || !el.children[1]) return; el.children[0].style.background = r.color; el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v; });
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
