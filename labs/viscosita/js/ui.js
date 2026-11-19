// ui.js — pannello dei controlli, cronometro, prove, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Tre cifre significative, senza notazione esponenziale. */
const sig = (v, n = 3) => { if (!v) return '0'; const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v)))); return num(v, Math.min(d, 6)); };
export const fmt = {
  num, sig,
  speed(v) { const a = Math.abs(v); return a < 0.1 ? `${sig(v * 1000)} mm/s` : `${sig(v)} m/s`; },
  eta(e) { return e < 0.1 ? `${sig(e * 1000)} mPa·s` : `${sig(e)} Pa·s`; },
  s(t, d = 2) { return `${num(t, d)} s`; },
  time(t) { return t < 60 ? `${num(t, t < 10 ? 2 : 1)} s` : `${Math.floor(t / 60)} min ${num(t % 60, 0)} s`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('fluid', '', ctx.fluids.map(([k, f]) => [k, f.name, f.note]), 3);
  slider('conc', { range: () => [0.8, 1, 0.01], read: () => state.conc, write: (v) => { state.conc = Math.round(v * 100) / 100; }, label: () => 'Glicerina nella miscela', text: () => `${Math.round(state.conc * 100)} % <small>· il resto è acqua</small>` });
  slider('T', { range: () => [10, 40, 0.5], read: () => state.T, write: (v) => { state.T = v; }, label: () => 'Temperatura', text: () => `${num(state.T, 1)} °C` });
  seg('ball', '', ctx.balls.map(([k, b]) => [k, b.name, `${b.rho} kg/m³${b.note ? ' · ' + b.note : ''}`]), 3);
  slider('d', { range: () => [1, 12, 0.5], read: () => state.d, write: (v) => { state.d = v; }, label: () => 'Diametro della sfera', text: () => `${num(state.d, 1)} mm` });
  seg('D', 'Diametro interno del tubo', [[25, '25 mm'], [40, '40 mm'], [60, '60 mm'], [100, '100 mm']]);
  slider('h1', { range: () => [10, 90, 1], read: () => state.h1, write: (v) => { state.h1 = v; }, label: () => 'Segno superiore', text: () => `${state.h1} cm <small>dal fondo</small>` });
  slider('h2', { range: () => [5, 85, 1], read: () => state.h2, write: (v) => { state.h2 = v; }, label: () => 'Segno inferiore', text: () => `${state.h2} cm <small>· tratto ${state.h1 - state.h2} cm</small>` });
  seg('timer', 'Cronometro', [['auto', 'Automatico', 'Il passaggio della sfera davanti ai segni, al decimillesimo di secondo'], ['hand', 'A mano', 'Il tempo di reazione sbaglia di qualche centesimo']]);
  toggle('wall', 'Correzione di parete', 'Francis: il tubo stretto rallenta la sfera');
  seg('speed', 'Tempo', [[0.25, '¼×'], [1, '1×', 'Tempo reale'], [10, '10×'], [100, '100×']]);
  toggle('strobe', 'Foto stroboscopica', 'immagini a intervalli di tempo uguali');
  toggle('forces', 'Forze sulla sfera', 'peso, spinta di Archimede, attrito viscoso');
  toggle('outline', 'Contorno della sfera', 'evidenzia l\'oggetto in moto');
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
  $('#drop').addEventListener('click', () => on('drop'));
  $('#pause').addEventListener('click', () => on('pause'));
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
      $('[data-ctl="conc"]').hidden = state.fluid !== 'glycerol';
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setNote(id, html) { const el = $(id); el.innerHTML = html; el.hidden = !html; },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(t, running, d) { const txt = num(t, d); if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; } $('.clock').classList.toggle('run', running); },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setDrop(label) { $('#drop span').textContent = label; },
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
        box.innerHTML = rows.length ? rows.map((r) => `<div class="obj${r.mean ? ' mean' : ''}"><i style="background:${r.color}"></i><span class="n"></span><span class="t"></span><span class="v"></span></div>`).join('') : `<p class="empty">${empty}</p>`;
      }
      rows.forEach((r, i) => { const el = box.children[i]; if (!el || !el.children[1]) return; el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v; });
    },
    /** series: [{x, y, color, width, alpha, dash}]; points: [{x, y, color, r, hollow}]; lines: rette di riferimento. */
    drawPlot({ series = [], points = [], X0 = 0, X1, Y0 = 0, Y1, xLabel, yLabel, legend, marks = [] }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / 5), ys = niceStep((Y1 - Y0) / 4);
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - 120) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs)), px, Hh - 12);
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
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath();
        const step = Math.max(1, Math.floor(s.x.length / 900));
        for (let i = 0; i < s.x.length; i += step) { const px = xOf(s.x[i]), py = yOf(s.y[i]); if (i) pc.lineTo(px, py); else pc.moveTo(px, py); }
        if (s.x.length > 1) pc.lineTo(xOf(s.x[s.x.length - 1]), yOf(s.y[s.y.length - 1]));
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const p of points) {
        pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2);
        if (p.hollow) { pc.strokeStyle = p.color; pc.lineWidth = 2.5; pc.stroke(); } else { pc.fillStyle = p.color; pc.fill(); }
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
