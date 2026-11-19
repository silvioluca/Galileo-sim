// ui.js — pannello dei controlli, cronometro delle fotocellule, elenco delle misure, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  num,
  s(t, d = 3) { return `${num(t, d)} s`; },
  ms(v) { return `${v < 0 ? '−' : ''}${num(Math.abs(v), 3)} m/s`; },
  cm(x) { return `${num(x * 100, 1)} cm`; },
  g(m) { return `${num(m * 1000, 0)} g`; },
  sgn(v, d = 3) { return `${v < -0.0000005 ? '−' : ''}${num(Math.abs(v), d)}`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const masses = [[0.2, '200 g', 'Carrello vuoto'], [0.3, '300 g', 'Con due pesetti da 50 g'], [0.4, '400 g', 'Con quattro pesetti'], [0.6, '600 g', 'Con otto pesetti']];
  const vText = (v) => `${fmt.ms(v)} <small>· ${Math.abs(v) < 0.0005 ? 'ferma' : v > 0 ? 'verso destra' : 'verso sinistra'}</small>`;

  toggle('air', 'Soffiante accesa', 'il cuscino d\'aria toglie quasi tutto l\'attrito');
  toggle('bands', 'Elastici alle estremità', 'senza, i carrelli battono sulle testate');
  slider('shim', {
    range: () => [0, 50, 1], read: () => state.shim, write: (v) => { state.shim = v; },
    label: () => 'Spessori sotto il piede sinistro',
    text: () => (state.shim ? `${state.shim} mm <small>· θ = ${num((Math.asin(state.shim / 1000 / ctx.feet) * 180) / Math.PI, 2)}°</small>` : 'rotaia in piano'),
  });
  seg('n', '', [[1, 'Un carrello'], [2, 'Due carrelli']]);
  seg('mA', 'Massa di A', masses);
  slider('vA', { range: () => [-1, 1, 0.01], read: () => state.vA, write: (v) => { state.vA = Math.round(v * 100) / 100; }, label: () => 'Spinta di A', text: () => vText(state.vA), disabled: () => state.blast });
  slider('xA', { range: () => [0.15, 1.85, 0.005], read: () => state.xA, write: (v) => { state.xA = v; }, label: () => 'Partenza di A', text: () => fmt.cm(state.xA) });
  seg('mB', 'Massa di B', masses);
  slider('vB', { range: () => [-1, 1, 0.01], read: () => state.vB, write: (v) => { state.vB = Math.round(v * 100) / 100; }, label: () => 'Spinta di B', text: () => vText(state.vB), disabled: () => state.blast });
  slider('xB', { range: () => [0.15, 1.85, 0.005], read: () => state.xB, write: (v) => { state.xB = v; }, label: () => 'Partenza di B', text: () => fmt.cm(state.xB), disabled: () => state.blast });
  seg('bumper', '', ctx.bumpers.map(([k, b]) => [k, b.name, b.sub]));
  toggle('blast', 'Molla compressa fra i carrelli', 'esplosione: un filo li tiene uniti, al via si spezza');
  toggle('pull', 'Pesetto appeso alla carrucola', 'tira il carrello di destra con un filo');
  seg('mh', 'Pesetto', [[0.005, '5 g'], [0.01, '10 g'], [0.02, '20 g'], [0.03, '30 g'], [0.05, '50 g']]);
  slider('drop', { range: () => [0.1, 0.7, 0.01], read: () => state.drop, write: (v) => { state.drop = v; }, label: () => 'Corsa del pesetto', text: () => `${fmt.cm(state.drop)} <small>· poi tocca terra</small>` });
  seg('gates', 'Fotocellule', [[0, 'Nessuna'], [1, '1'], [2, '2'], [3, '3'], [4, '4']]);
  slider('g1', { range: () => [0.2, 1.8, 0.01], read: () => state.g1, write: (v) => { state.g1 = v; }, label: () => 'Prima fotocellula', text: () => fmt.cm(state.g1) });
  slider('gsp', { range: () => [0.1, 0.6, 0.01], read: () => state.gsp, write: (v) => { state.gsp = v; }, label: () => 'Distanza fra le fotocellule', text: () => fmt.cm(state.gsp) });
  seg('flag', 'Bandierina', [[0.01, '1 cm'], [0.025, '2,5 cm'], [0.05, '5 cm'], [0.1, '10 cm']]);
  seg('slow', 'Rallentatore', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']]);
  toggle('strobe', 'Foto stroboscopica', 'un\'immagine dei carrelli a intervalli di tempo uguali');
  seg('strobeHz', '', [[2, '2 lampi/s'], [5, '5 lampi/s'], [10, '10 lampi/s']]);
  toggle('vVec', 'Vettori velocità');
  toggle('pVec', 'Quantità di moto', 'p = m·v, frecce proporzionali');
  toggle('fVec', 'Forze', 'peso lungo il piano, tensione del filo, forza d\'urto');
  toggle('cm', 'Centro di massa', 'si muove di moto uniforme anche durante l\'urto');
  toggle('keep', 'Conserva le prove nel grafico', 'fino a quattro, per confrontarle');
  toggle('outline', 'Contorno dei carrelli', 'evidenzia gli oggetti in moto');
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
      const two = state.n === 2;
      for (const k of ['mB', 'vB', 'xB']) $(`[data-ctl="${k}"]`).hidden = !two;
      $('#sec-hit').hidden = !two;
      for (const k of ['mh', 'drop']) $(`[data-ctl="${k}"]`).hidden = !state.pull;
      for (const k of ['g1', 'gsp', 'flag']) $(`[data-ctl="${k}"]`).hidden = !state.gates;
      $('[data-ctl="gsp"]').hidden = state.gates < 2;
      $('[data-ctl="strobeHz"]').hidden = !state.strobe;
      $('[data-ctl="blast"]').classList.toggle('disabled', state.bumper !== 'spring');
      for (const k of ['vA', 'vB', 'xB']) refresh(k);
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setNote(id, html) { const el = $(id); el.innerHTML = html; el.hidden = !html; },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(t, running) {
      const txt = num(t, 3);
      if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; }
      $('.clock').classList.toggle('run', running);
    },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setGo(label) { $('#go span').textContent = label; },
    setPause(label, enabled) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.disabled = !enabled; b.classList.toggle('on', label !== 'Pausa'); },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => {
        const el = m.children[i];
        el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;';
        el.title = c.title || ''; el.dataset.p = c.p || 1;
      });
    },
    /** Righe: passaggi alle fotocellule e urti, dal più recente. */
    setRows(rows, empty) {
      const box = $('#rows');
      const key = rows.map((r) => r.key).join() + '|' + empty;
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = rows.length ? rows.map((r) => `<div class="obj${r.hit ? ' hit' : ''}"><i style="background:${r.color}"></i><span class="n"></span><span class="t"></span><span class="v"></span></div>`).join('') : `<p class="empty">${empty}</p>`;
      }
      rows.forEach((r, i) => {
        const el = box.children[i];
        if (!el || !el.children[1]) return;
        el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v;
      });
    },

    /** series: [{color, x:[], y:[], width, alpha, dash}]; marks: linee verticali [{x, color}]; legend: [[testo, colore]]. */
    drawPlot({ series, X0, X1, Y0, Y1, xLabel, yLabel, marks, legend, dots }) {
      const W = plot.width, Hh = plot.height, padL = 64, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh);
      pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR);
      const yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace';
      pc.fillStyle = '#6b7380'; pc.textAlign = 'center';
      const xs = niceStep((X1 - X0) / 5);
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - 70) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, xs < 0.1 ? 2 : xs < 1 ? 1 : 0), px, Hh - 12);
      }
      pc.textAlign = 'right';
      const ys = niceStep((Y1 - Y0) / 4);
      for (let y = Math.ceil(Y0 / ys) * ys; y <= Y1 + 1e-9; y += ys) {
        const py = yOf(y);
        pc.strokeStyle = Math.abs(y) < ys / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)';
        pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        const d = ys < 0.01 ? 3 : ys < 0.1 ? 2 : ys < 1 ? 1 : 0;
        pc.fillText(num(Math.abs(y) < ys / 2 ? 0 : y, d), padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab';
      pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) {
        let lx = W - padR - 8;
        pc.font = '500 17px "Geist Mono Variable", Consolas, monospace';
        for (const [text, col] of legend.slice().reverse()) {
          const tw = pc.measureText(text).width;
          pc.fillStyle = col; pc.fillText(text, lx, padT + 14);
          lx -= tw + 22;
        }
      }
      pc.save();
      pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const m of marks || []) {
        pc.strokeStyle = m.color; pc.lineWidth = 2; pc.setLineDash([4, 5]);
        pc.beginPath(); pc.moveTo(xOf(m.x), padT); pc.lineTo(xOf(m.x), Hh - padB); pc.stroke(); pc.setLineDash([]);
      }
      for (const s of series) {
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.lineJoin = 'round'; pc.globalAlpha = s.alpha ?? 1;
        pc.setLineDash(s.dash || []);
        pc.beginPath();
        const step = Math.max(1, Math.floor(s.x.length / 900));
        for (let i = 0; i < s.x.length; i += step) { const px = xOf(s.x[i]), py = yOf(s.y[i]); if (i) pc.lineTo(px, py); else pc.moveTo(px, py); }
        if (s.x.length > 1) pc.lineTo(xOf(s.x[s.x.length - 1]), yOf(s.y[s.y.length - 1]));
        pc.stroke();
        pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const d of dots || []) { pc.fillStyle = d.color; pc.beginPath(); pc.arc(xOf(d.x), yOf(d.y), d.r || 6, 0, Math.PI * 2); pc.fill(); }
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
