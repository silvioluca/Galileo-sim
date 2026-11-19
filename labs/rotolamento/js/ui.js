// ui.js — pannello dei controlli, elenco dei corpi in gara, cronometro nel riquadro, misure, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  num,
  s(t, d = 3) { return `${num(t, d)} s`; },
  ms(v) { return `${num(v, Math.abs(v) < 10 ? 3 : 2)} m/s`; },
  a(a) { return `${num(a, Math.abs(a) < 10 ? 3 : 2)} m/s²`; },
  cm(x) { return `${num(x * 100, 1)} cm`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

/** ctx: { bodies: [[key, {name, note}]], colors, maxBodies, presets, views, angleText(), v0Text(), rpText() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh: refreshCtl } = createControls(state, on);

  slider('angle', { range: () => [0, 40, 0.5], read: () => state.angle, write: (v) => { state.angle = v; }, label: () => 'Inclinazione', text: () => `${num(state.angle, 1)}° <small>· ${ctx.angleText()}</small>` });
  slider('v0', { range: () => [0, 2.5, 0.05], read: () => state.v0, write: (v) => { state.v0 = Math.round(v * 100) / 100; }, label: () => 'Velocità di lancio', text: () => `${num(state.v0, 2)} m/s <small>· ${ctx.v0Text()}</small>` });
  seg('spin', 'Lanciati', [['roll', 'Rotolando', 'Già in rotazione: v = ω·r'], ['slide', 'Strisciando', 'Senza rotazione: ω = 0, l\'attrito li fa girare'], ['back', 'Con effetto', 'Rotazione all\'indietro: ω = −2·v₀/r, come una palla colpita in basso']]);
  slider('rp', { range: () => [0, 100, 5], read: () => state.rp, write: (v) => { state.rp = v; }, label: () => 'Distanza dall\'asse', text: () => `r = ${state.rp} % di R <small>· ${ctx.rpText()}</small>` });
  toggle('trail', 'Traiettoria del punto', 'resta disegnata sulla tavola');
  toggle('vel', 'Velocità dei punti', 'del corpo scelto: centro e bordo');
  seg('slow', 'Tempo', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']]);
  toggle('outline', 'Contorno dei corpi', 'evidenzia gli oggetti in moto');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  // elenco dei corpi in gara: uno per corsia, si sceglie quello da seguire, si toglie con ×
  const list = $('#bodies'), add = $('#add-body');
  function drawBodies() {
    list.innerHTML = '';
    state.bodies.forEach((k, i) => {
      const o = ctx.bodies.find(([key]) => key === k)[1];
      const row = document.createElement('div');
      row.className = `body${state.sel === k ? ' on' : ''}`;
      row.innerHTML = `<button type="button" class="pick" title="Segui questo corpo: il suo punto, le velocità e il grafico della traiettoria"><i style="background:${ctx.colors[k]}"></i><span>${o.name}<small>corsia ${i + 1} · ${o.short}</small></span></button><button type="button" class="rm" title="Togli dalla gara" aria-label="Togli ${o.name}">×</button>`;
      row.querySelector('.pick').addEventListener('click', () => on('sel', k));
      const rm = row.querySelector('.rm');
      rm.disabled = state.bodies.length <= 1;
      rm.addEventListener('click', () => on('remove', k));
      list.appendChild(row);
    });
    add.innerHTML = '';
    for (const [k, o] of ctx.bodies) {
      if (state.bodies.includes(k)) continue;
      const b = document.createElement('button');
      b.className = 'btn'; b.type = 'button';
      b.innerHTML = `<i style="background:${ctx.colors[k]}"></i>${o.name}`;
      b.title = o.note; b.disabled = state.bodies.length >= ctx.maxBodies;
      b.addEventListener('click', () => on('add', k));
      add.appendChild(b);
    }
    $('#add-label').hidden = !add.children.length;
  }

  const chips = (host, items, key) => {
    host.innerHTML = '';
    for (const [id, text, title] of items) {
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
    refresh(key) { refreshCtl(key); if (!key) drawBodies(); },
    sync() {
      $('[data-ctl="spin"]').classList.toggle('disabled', state.v0 === 0);
      document.querySelectorAll('[data-ctl="spin"] button').forEach((b) => { b.disabled = state.v0 === 0; });
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
      drawBodies();
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
      rows.forEach((r, i) => { const el = box.children[i]; if (!el || !el.children[1]) return; el.children[0].style.background = r.color; el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v; el.classList.toggle('sel', !!r.sel); });
    },
    /** Area utile del grafico, in pixel del canvas (per tenere uguali le scale dei due assi). */
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
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
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
