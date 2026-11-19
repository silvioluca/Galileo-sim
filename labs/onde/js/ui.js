// ui.js — pannello dei controlli, generatore nel riquadro, misure, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

// toLocaleString è lento e qui si chiama decine di volte a fotogramma: un formattatore per ogni numero di decimali
const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = {
  num,
  hz(f) { return `${num(f, f < 100 ? 2 : 1)} Hz`; },
  cm(x, d = 1) { return `${num(x * 100, d)} cm`; },
  g(m) { return `${num(m * 1000, 0)} g`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

/** ctx: { strings, ends, presets, views, fRange(), modeLabels(), fineSteps(), lText(), massText(), ampUnit() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh: refreshCtl } = createControls(state, on);
  const S = () => state.mode === 'string';
  const fKey = () => (S() ? 'fS' : 'fT');

  seg('mode', '', [['string', 'Corda vibrante', 'L\'esperimento di Melde: una corda tesa da un peso, messa in vibrazione a un estremo'], ['tube', 'Tubo sonoro', 'Una colonna d\'aria messa in vibrazione da un altoparlante']]);
  // corda
  slider('L', { range: () => [0.4, 1.6, 0.01], read: () => state.L, write: (v) => { state.L = Math.round(v * 100) / 100; }, label: () => 'Lunghezza', text: () => `${num(state.L * 100, 0)} cm <small>· ${ctx.lText()}</small>` });
  slider('mass', { range: () => [0.01, 1, 0.001], read: () => state.mass, write: (v) => { state.mass = Math.round(v * 1000) / 1000; }, label: () => 'Massa appesa', text: () => `${num(state.mass * 1000, 0)} g <small>· ${ctx.massText()}</small>` });
  seg('str', 'Corda', ctx.strings.map(([k, s]) => [k, s.short[0].toUpperCase() + s.short.slice(1), `${s.name}: ${num(s.mu * 1000, 1)} g/m`]));
  // tubo
  slider('Lt', { range: () => [0.3, 1.5, 0.01], read: () => state.Lt, write: (v) => { state.Lt = Math.round(v * 100) / 100; }, label: () => 'Lunghezza del tubo', text: () => `${num(state.Lt * 100, 0)} cm <small>· ${ctx.lText()}</small>` });
  seg('ends', 'Estremi', ctx.ends.map(([k, e]) => [k, e.short[0].toUpperCase() + e.short.slice(1), e.note]));
  slider('temp', { range: () => [0, 40, 1], read: () => state.temp, write: (v) => { state.temp = v; }, label: () => 'Temperatura dell\'aria', text: () => `${state.temp} °C <small>· ${ctx.cText()}</small>` });
  toggle('particles', 'Particelle d\'aria', 'spostamenti ingranditi 600 volte; rosse le compressioni');
  toggle('powder', 'Polvere nel tubo', 'nei ventri si increspa in creste sottili, nei nodi resta liscia');
  seg('grain', 'Polvere', [['cork', 'Sughero', 'Polvere di sughero, la classica di Kundt'], ['styro', 'Polistirolo', 'Palline di polistirolo: leggere, fanno creste alte anche con poco suono'], ['lyco', 'Licopodio', 'Polvere finissima di spore: creste basse e fitte']]);
  // generatore
  slider('f', { range: () => [0, 1000, 1], read: () => { const [a, b] = ctx.fRange(); return Math.round((1000 * Math.log(state[fKey()] / a)) / Math.log(b / a)); }, write: (v) => { const [a, b] = ctx.fRange(); const f = a * (b / a) ** (v / 1000); state[fKey()] = Math.round(f * (S() ? 100 : 10)) / (S() ? 100 : 10); }, label: () => 'Frequenza', text: () => `${fmt.hz(state[fKey()])} <small>· ${ctx.fText()}</small>` });
  slider('A', { range: () => (S() ? [0.1, 2, 0.1] : [0.2, 3, 0.1]), read: () => (S() ? state.AS : state.AT), write: (v) => { if (S()) state.AS = v; else state.AT = v; }, label: () => (S() ? 'Ampiezza del vibratore' : 'Ampiezza della membrana'), text: () => `${num(S() ? state.AS : state.AT, 1)} ${ctx.ampUnit()}` });
  toggle('sound', 'Suono', 'il generatore si sente; in risonanza più forte');
  // osservazione
  seg('look', 'Guardare', [['eye', 'A occhio', 'Come la vede l\'occhio: una scia sfumata dove la corda vibra'], ['strobe', 'Stroboscopio', 'Lampi brevi a frequenza vicina a quella del generatore: il moto sembra rallentato']]);
  slider('dstrobe', { range: () => [-2, 2, 0.05], read: () => state.dstrobe, write: (v) => { state.dstrobe = Math.round(v * 100) / 100; }, label: () => 'Lampi', text: () => `f ${state.dstrobe >= 0 ? '−' : '+'} ${num(Math.abs(state.dstrobe), 2)} Hz <small>· ${state.dstrobe === 0 ? 'immagine ferma' : `sembra fare ${num(Math.abs(state.dstrobe), 2)} oscillazioni al secondo`}</small>` });
  toggle('travel', 'Onde progressive', 'quella che parte dal vibratore e quella riflessa');
  toggle('marks', 'Nodi e ventri', 'segnati sotto la corda');
  seg('slow', 'Tempo', [[1, '1×', 'Tempo reale'], [0.1, '⅒×'], [0.01, '1/100'], [0.001, '1/1000']]);
  slider('ambient', { range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; }, label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`) });
  toggle('outline', 'Contorno', 'evidenzia ciò che vibra');
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
  const drawGenChips = () => {
    chips($('#fine'), ctx.fineSteps().map((d) => [d, `${d > 0 ? '+' : '−'}${num(Math.abs(d), Math.abs(d) < 1 ? 1 : 0)}`, `${d > 0 ? 'Aumenta' : 'Diminuisci'} di ${num(Math.abs(d), Math.abs(d) < 1 ? 1 : 0)} Hz`]), 'fine');
    chips($('#modes'), ctx.modeLabels(), 'tune');
  };
  drawGenChips();
  $('#go').addEventListener('click', () => on('go'));
  $('#pause').addEventListener('click', () => on('pause'));
  $('#reset').addEventListener('click', () => on('reset'));
  $('#note').addEventListener('click', () => on('note'));
  $('#sweep').addEventListener('click', () => on('sweep'));
  $('#clear').addEventListener('click', () => on('clear'));
  $('#level').addEventListener('click', () => on('level'));
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
    refresh(key) { refreshCtl(key); if (!key) drawGenChips(); },
    sync() {
      const str = S();
      for (const k of ['L', 'mass', 'str', 'travel', 'marks']) $(`[data-ctl="${k}"]`).hidden = !str;
      for (const k of ['Lt', 'ends', 'temp', 'particles', 'powder']) $(`[data-ctl="${k}"]`).hidden = str;
      $('[data-ctl="grain"]').hidden = $('#level-row').hidden = str || !state.powder;
      $('[data-ctl="dstrobe"]').hidden = state.look !== 'strobe';
      $('#h-sys').firstChild.textContent = str ? 'Corda ' : 'Tubo ';
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
      drawGenChips();
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setNote(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; el.hidden = !html; },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setTitle(title, sub) { $('#live-title').textContent = title; $('#live-sub').textContent = sub; },
    setClock(txt, unit, live) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; } $('#unit').textContent = unit; $('.clock').classList.toggle('run', live); },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setGo(label, on2) { const s = $('#go span'); if (s.textContent !== label) s.textContent = label; $('#go').classList.toggle('lit', !!on2); },
    setPause(label, enabled) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.disabled = !enabled; b.classList.toggle('on', label !== 'Pausa'); },
    setSweep(label, busy) { const b = $('#sweep'); if (b.textContent !== label) b.textContent = label; b.classList.toggle('on', !!busy); },
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
