// ui.js — pannello dei controlli, riquadro (tempo trascorso, rotazione del piano, vista dall'alto, grafico), fascia
// delle misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = {
  num,
  /** Durata leggibile: «12 s», «3 min 20 s», «5 h 12 min», «2 g 3 h». */
  dur(s) {
    if (s < 60) return `${num(s, s < 10 ? 1 : 0)} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
    if (s < 86400 * 2) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
    return `${Math.floor(s / 86400)} g ${Math.floor((s % 86400) / 3600)} h`;
  },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

/** ctx: { presets, views, places, latText(), lenText(), ampText(), massText(), vtText() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  slider('lat', { range: () => [-90, 90, 0.05], read: () => state.lat, write: (v) => { state.lat = Math.round(v * 100) / 100; }, label: () => 'Latitudine', text: () => ctx.latText() });
  slider('L', { range: () => [3, 67, 0.5], read: () => state.L, write: (v) => { state.L = v; }, label: () => 'Lunghezza del filo', text: () => ctx.lenText() });
  slider('A', { range: () => [0.2, 3, 0.05], read: () => state.A, write: (v) => { state.A = v; }, label: () => 'Ampiezza', text: () => ctx.ampText() });
  slider('m', { range: () => [5, 50, 1], read: () => state.m, write: (v) => { state.m = v; }, label: () => 'Massa del peso', text: () => ctx.massText() });
  slider('vt', { range: () => [0, 3, 0.1], read: () => state.vt, write: (v) => { state.vt = v; }, label: () => 'Spinta di traverso al lancio', text: () => ctx.vtText() });
  toggle('ring', 'Anello di Charron', 'in alto: il filo lo sfiora a ogni ritorno e l\'ellisse si smorza');
  toggle('drive', 'Spinta elettromagnetica', 'rimpiazza l\'energia che l\'aria si porta via');
  toggle('pins', 'Birilli', 'un anello di 72 birilli: il peso li fa cadere uno a uno');
  toggle('trace', 'Traccia sulla sabbia', 'il percorso della punta sul quadrante');
  toggle('theory', 'Il piano previsto', 'una linea sul quadrante dove dovrebbe oscillare');
  toggle('stars', 'Dalle stelle', 'il pavimento gira sotto il pendolo, il piano resta fermo');
  seg('warp', 'Velocità del tempo', [[1, '1×', 'Tempo reale'], [10, '10×'], [60, '1 min/s', 'Un minuto al secondo'], [600, '10 min/s', 'Dieci minuti al secondo'], [3600, '1 h/s', 'Un\'ora al secondo']]);
  slider('ambient', { range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; }, label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`) });
  toggle('outline', 'Contorno', 'evidenzia il peso che oscilla');
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
  chips($('#places'), ctx.places, 'place');
  for (const id of ['go', 'pause', 'reset', 'fullscreen']) $(`#${id}`).addEventListener('click', () => on(id));
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
  const topv = $('#topview'), tc = topv.getContext('2d');
  let clockTxt = '';

  return {
    refresh,
    sync() {
      document.querySelectorAll('#places button').forEach((b) => b.classList.toggle('on', Math.abs(ctx.placeLat(b.dataset.id) - state.lat) < 0.01));
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(txt) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').innerHTML = txt; } },
    setSide(a, b) { const x = $('#side1'), y = $('#side2'); if (x.innerHTML !== a) x.innerHTML = a; if (y.innerHTML !== b) y.innerHTML = b; },
    setGo(label, lit) { const s = $('#go span'); if (s.textContent !== label) s.textContent = label; $('#go').classList.toggle('lit', !!lit); },
    setPause(label, enabled) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.disabled = !enabled; b.classList.toggle('on', label !== 'Pausa'); },
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
    /**
     * Il quadrante visto dall'alto: la traccia della punta, i birilli, il piano misurato e quello previsto.
     * d: { R (m, metà del lato visibile), trace: [[x, y]…], pins: [{x, y, down}], bob: [x, y], psiMeas, psiTh (rad da est), held, post: [x, y] }
     */
    drawTop(d) {
      const W = topv.width, H = topv.height, s = (Math.min(W, H) / 2 - 18) / d.R, cx = W / 2, cy = H / 2;
      const X = (x) => cx + x * s, Y = (y) => cy - y * s;
      tc.fillStyle = '#e8e2d4'; tc.fillRect(0, 0, W, H);
      // cerchi e assi
      tc.strokeStyle = 'rgba(90,72,40,0.22)'; tc.lineWidth = 1.5;
      const step = niceStep(d.R / 2.5);
      for (let r = step; r <= d.R * 1.5; r += step) { tc.beginPath(); tc.arc(cx, cy, r * s, 0, Math.PI * 2); tc.stroke(); }
      tc.strokeStyle = 'rgba(90,72,40,0.35)'; tc.beginPath(); tc.moveTo(cx, 0); tc.lineTo(cx, H); tc.moveTo(0, cy); tc.lineTo(W, cy); tc.stroke();
      tc.font = '600 22px "Geist Mono Variable", Consolas, monospace'; tc.fillStyle = '#7a5a20'; tc.textAlign = 'center'; tc.textBaseline = 'middle';
      tc.fillStyle = '#a3271a'; tc.fillText('N', cx, 16); tc.fillStyle = '#7a5a20'; tc.fillText('S', cx, H - 16); tc.fillText('E', W - 14, cy); tc.fillText('O', 14, cy);
      tc.textAlign = 'left'; tc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; tc.fillText(`${num(step * 100, 0)} cm`, cx + step * s + 4, cy + 14);
      // traccia: più scura la parte recente
      const n = d.trace.length;
      if (n > 1) {
        tc.lineWidth = 1.4;
        const seg = Math.max(1, Math.floor(n / 40));
        for (let i0 = 0; i0 < n - 1; i0 += seg) {
          const k = i0 / n, a = 0.08 + 0.7 * k * k;
          tc.strokeStyle = `rgba(92,62,20,${a.toFixed(3)})`;
          tc.beginPath(); tc.moveTo(X(d.trace[i0][0]), Y(d.trace[i0][1]));
          for (let i = i0 + 1; i <= Math.min(n - 1, i0 + seg); i++) tc.lineTo(X(d.trace[i][0]), Y(d.trace[i][1]));
          tc.stroke();
        }
      }
      // birilli
      for (const p of d.pins) {
        tc.fillStyle = p.down ? 'rgba(194,51,29,0.85)' : '#ffffff';
        tc.strokeStyle = 'rgba(40,30,10,0.55)'; tc.lineWidth = 1;
        tc.beginPath(); tc.arc(X(p.x), Y(p.y), p.down ? 2.6 : 3.4, 0, Math.PI * 2); tc.fill(); tc.stroke();
      }
      // piani: previsto (tratteggiato) e misurato
      const line = (psi, col, dash, w) => {
        if (psi === null || psi === undefined) return;
        const L = d.R * 1.6, c = Math.cos(psi), sn = Math.sin(psi);
        tc.strokeStyle = col; tc.lineWidth = w; tc.setLineDash(dash);
        tc.beginPath(); tc.moveTo(X(-L * c), Y(-L * sn)); tc.lineTo(X(L * c), Y(L * sn)); tc.stroke(); tc.setLineDash([]);
      };
      line(d.psiTh, 'rgba(21,24,28,0.75)', [9, 7], 2);
      line(d.psiMeas, '#e8452c', [], 2.6);
      if (d.held && d.post) { tc.strokeStyle = '#8a7a55'; tc.lineWidth = 1.5; tc.beginPath(); tc.moveTo(X(d.bob[0]), Y(d.bob[1])); tc.lineTo(X(d.post[0]), Y(d.post[1])); tc.stroke(); }
      // il peso
      tc.fillStyle = '#b8913f'; tc.strokeStyle = '#5e4514'; tc.lineWidth = 1.5;
      tc.beginPath(); tc.arc(X(d.bob[0]), Y(d.bob[1]), Math.max(5, d.r * s), 0, Math.PI * 2); tc.fill(); tc.stroke();
    },
    /** series: [{x, y, color, width, alpha, dash}]; points: [{x, y, color, r, ring}]. */
    drawPlot({ series = [], points = [], X0 = 0, X1, Y0 = 0, Y1, xLabel, yLabel, legend }) {
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
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
