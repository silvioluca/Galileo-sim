// ui.js — pannello dei controlli, cronometro della fotocellula nel riquadro, misure, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  num,
  s(t, d = 3) { return `${num(t, d)} s`; },
  cm(x, d = 1) { return `${num(x * 100, d)} cm`; },
  g(m) { return m < 1 ? `${num(m * 1000, m < 0.1 ? 1 : 0)} g` : `${num(m, 2)} kg`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

/** ctx: { bobs, bodies, presets, views, holeText(), ampMax(), lText(), l2Text() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const bobs = ctx.bobs.map(([k, b]) => [k, b.name, b.title]);

  seg('type', '', [['simple', 'Semplice', 'Una sfera appesa a un filo'], ['physical', 'Fisico', 'Un corpo rigido che oscilla attorno a un perno']]);
  slider('L', { range: () => [0.1, 1.6, 0.01], read: () => state.L, write: (v) => { state.L = Math.round(v * 100) / 100; }, label: () => 'Lunghezza', text: () => `${num(state.L * 100, 0)} cm <small>· ${ctx.lText()}</small>` });
  seg('bob', 'Sfera', bobs, 3);
  toggle('two', 'Secondo pendolo', 'accanto al primo, lasciato insieme');
  slider('L2', { range: () => [0.1, 1.6, 0.01], read: () => state.L2, write: (v) => { state.L2 = Math.round(v * 100) / 100; }, label: () => 'Lunghezza del secondo', text: () => `${num(state.L2 * 100, 0)} cm <small>· ${ctx.l2Text()}</small>` });
  seg('bob2', 'Sfera del secondo', bobs, 3);
  seg('body', 'Corpo', ctx.bodies.map(([k, b]) => [k, b.short[0].toUpperCase() + b.short.slice(1), b.note]));
  slider('hole', { range: () => [0, ctx.holeCount() - 1, 1], read: () => state.hole, write: (v) => { state.hole = v; }, label: () => 'Foro del perno', text: () => ctx.holeText() });
  slider('amp', { range: () => [1, ctx.ampMax(), 1], read: () => Math.min(state.amp, ctx.ampMax()), write: (v) => { state.amp = v; }, label: () => 'Ampiezza', text: () => `${state.amp}° <small>· o trascina il pendolo</small>` });
  toggle('air', 'Aria', 'resistenza e spinta di Archimede; spenta: nel vuoto');
  seg('N', 'Periodi da contare', [[1, '1'], [3, '3'], [5, '5'], [10, '10'], [20, '20']]);
  toggle('harm', 'Moto armonico', 'una copia che segue θ₀·cos(2π·t/T₀)');
  toggle('equiv', 'Pendolo semplice equivalente', 'lungo L = I/(m·d), dallo stesso perno');
  seg('slow', 'Tempo', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']]);
  toggle('forces', 'Forze', 'peso e tensione del filo, o reazione del perno');
  toggle('comps', 'Componenti del peso', 'lungo la traiettoria e lungo il raggio');
  toggle('outline', 'Contorno del pendolo', 'evidenzia l\'oggetto in moto');
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
  $('#go').addEventListener('click', () => on('go'));
  $('#pause').addEventListener('click', () => on('pause'));
  $('#reset').addEventListener('click', () => on('reset'));
  $('#clear').addEventListener('click', () => on('clear'));
  $('#fullscreen').addEventListener('click', () => on('fullscreen'));
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
    sync() {
      const simple = state.type === 'simple';
      for (const k of ['L', 'bob', 'two']) $(`[data-ctl="${k}"]`).hidden = !simple;
      for (const k of ['L2', 'bob2']) $(`[data-ctl="${k}"]`).hidden = !simple || !state.two;
      $('[data-ctl="body"]').hidden = simple;
      $('[data-ctl="hole"]').hidden = simple || state.body === 'ring';
      $('[data-ctl="equiv"]').hidden = simple;
      const law = $('#plot-kind [data-k="law"]');
      law.textContent = simple ? 'T² e L' : 'T e d';
      law.title = simple ? 'Quadrato del periodo in funzione della lunghezza: una retta di pendenza 4π²/g' : 'Periodo in funzione della distanza fra perno e baricentro';
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setNote(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; el.hidden = !html; },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setTitle(title, sub) { $('#live-title').textContent = title; $('#live-sub').textContent = sub; },
    setClock(txt, unit, live) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; } $('#unit').textContent = unit; $('.clock').classList.toggle('run', live); },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setGo(label) { const s = $('#go span'); if (s.textContent !== label) s.textContent = label; },
    setPause(label, enabled) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.disabled = !enabled; b.classList.toggle('on', label !== 'Pausa'); },
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
    plotArea() { return { w: plot.width - PAD.l - PAD.r, h: plot.height - PAD.t - PAD.b }; },
    /** series: [{x, y, color, width, alpha, dash}]; points: [{x, y, color, r, ring}]; marks: rette verticali; hlines: orizzontali. */
    drawPlot({ series = [], points = [], X0 = 0, X1, Y0 = 0, Y1, xLabel, yLabel, legend, marks = [], hlines = [] }) {
      const W = plot.width, Hh = plot.height, padL = PAD.l, padB = PAD.b, padT = PAD.t, padR = PAD.r;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 140))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 60)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x);
        pc.strokeStyle = Math.abs(x) < xs / 2 && X0 < 0 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - 110) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs)), px, Hh - 12);
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
      for (const m of hlines) { pc.strokeStyle = m.color; pc.lineWidth = m.width || 2; pc.setLineDash(m.dash || []); pc.beginPath(); pc.moveTo(padL, yOf(m.y)); pc.lineTo(W - padR, yOf(m.y)); pc.stroke(); pc.setLineDash([]); }
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath();
        const step = Math.max(1, Math.floor(s.x.length / 1400));
        for (let i = 0; i < s.x.length; i += step) { const px = xOf(s.x[i]), py = yOf(s.y[i]); if (i) pc.lineTo(px, py); else pc.moveTo(px, py); }
        pc.lineTo(xOf(s.x[s.x.length - 1]), yOf(s.y[s.y.length - 1]));
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const p of points) {
        pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2);
        if (p.ring) { pc.lineWidth = 3; pc.strokeStyle = p.color; pc.fillStyle = '#f7f7f5'; pc.fill(); pc.stroke(); } else { pc.fillStyle = p.color; pc.fill(); }
      }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },
  };
}
