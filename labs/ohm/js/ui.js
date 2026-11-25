// ui.js — pannello dei controlli, riquadro (lo schema del circuito con le letture, il grafico), fascia delle
// misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';
import { COMPONENTS, WIRES, wireName } from './circuit.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const MONO = '"Geist Mono Variable", Consolas, monospace';

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const T = ctx.text;

  seg('exp', 'Esperienza', [['first', 'Prima legge', 'Tensione e corrente in un componente: V = R·I'], ['second', 'Seconda legge', 'La resistenza di un filo: R = ρL/S']]);
  toggle('on', 'Acceso', 'l\'uscita dell\'alimentatore');
  slider('Vset', { range: () => [0, 12, 0.01], read: () => state.Vset, write: (v) => { state.Vset = v; }, label: () => 'Tensione impostata', text: T.Vset });
  slider('Ilim', { range: () => [0.01, 1, 0.005], read: () => state.Ilim, write: (v) => { state.Ilim = v; }, label: () => 'Limite di corrente', text: T.Ilim });
  toggle('flip', 'Polarità invertita', 'i due cavi scambiati ai morsetti dell\'alimentatore');
  seg('comp', 'Il conduttore', Object.entries(COMPONENTS).map(([k, c]) => [k, c.kind === 'R' ? c.name : c.kind === 'lamp' ? 'Lampadina' : 'LED', c.kind === 'R' ? `resistore da 2 W sulla basetta, tolleranza 5 %` : c.kind === 'lamp' ? 'lampadina E10 da 6 V · 0,3 A nel suo portalampada' : 'LED rosso da 5 mm, al massimo 50 mA']).concat([['wire', 'Filo', 'un filo teso fra due isolatori su asta, con la pinza a coccodrillo']]), 4);
  seg('holder', 'L\'apparato', [['rods', 'Isolatori su asta', 'un filo solo, teso fra due isolatori di porcellana; per cambiarlo si monta un altro filo'], ['board', 'Banco a più fili', 'sei fili affiancati sullo stesso banco; la pinza si sposta da un filo all\'altro']]);
  seg('wire', 'Il filo', WIRES.map((w) => [w.id, wireName(w).replace(' ⌀ ', ' ')]), 2);
  slider('L', { range: () => [0.05, 1, 0.005], read: () => state.L, write: (v) => { state.L = v; }, label: () => 'Lunghezza, fino alla pinza', text: T.L });
  seg('mode', 'Il voltmetro', [['valle', 'A valle', 'ai capi del solo componente: l\'amperometro conta anche la corrente del voltmetro'], ['monte', 'A monte', 'prende anche l\'amperometro: misura anche la sua caduta di tensione']]);
  toggle('ideal', 'Strumenti ideali', 'amperometro senza resistenza, voltmetro senza corrente');
  toggle('dots', 'La corrente', 'i puntini vanno nel verso convenzionale, dal + al −, più veloci se la corrente è forte');
  toggle('outline', 'Contorno', 'evidenzia ciò che si muove');
  toggle('labels', 'Etichette');
  slider('ambient', { range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; }, label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`) });
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
  for (const id of ['pause', 'note', 'clear', 'fullscreen', 'fresh']) $(`#${id}`).addEventListener('click', () => on(id));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));
  const plot = $('#plot'), pc = plot.getContext('2d');
  const sch = $('#schema'), sc = sch.getContext('2d');
  let clockTxt = '', kinds = '';

  return {
    refresh,
    sync() {
      const first = state.exp === 'first', wire = !first || state.comp === 'wire';
      document.querySelectorAll('.only-1').forEach((e) => { e.hidden = !first; });
      document.querySelectorAll('.only-2').forEach((e) => { e.hidden = first; });
      document.querySelectorAll('.only-w').forEach((e) => { e.hidden = !wire; });
      $('#sec3').firstChild.nodeValue = first ? 'Il conduttore ' : 'Il filo ';
      $('#fresh').textContent = wire ? 'Filo nuovo' : 'Componente nuovo';
      refresh('L');
      chips($('#views'), ctx.views(), 'view');
      const list = first ? [['iv', 'I e V'], ['r', 'R = V/I']] : [['rl', 'R e lunghezza'], ['rs', 'R e L/S']];
      const key = list.map((x) => x[0]).join();
      if (key !== kinds) {
        kinds = key; const host = $('#plot-kind'); host.innerHTML = '';
        for (const [k, t] of list) { const b = document.createElement('button'); b.dataset.k = k; b.textContent = t; b.addEventListener('click', () => { state.plotKind = k; on('plotKind'); }); host.appendChild(b); }
      }
      if (!list.some((x) => x[0] === state.plotKind)) state.plotKind = list[0][0];
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy, warn = false) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); s.classList.toggle('warn', !!warn); },
    setFresh(show) { $('#fresh').classList.toggle('on', !!show); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(txt) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').innerHTML = txt; } },
    setSide(a, b) { const x = $('#side1'), y = $('#side2'); if (x.innerHTML !== a) x.innerHTML = a; if (y.innerHTML !== b) y.innerHTML = b; },
    setPause(label) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.classList.toggle('on', label !== 'Pausa'); },
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
     * Lo schema del circuito. d: { mode, flip, on, cc, kind, name, Vout, Vtxt, Itxt, I (A, con segno), burnt, ideal, sub }
     * L'alimentatore a sinistra, l'amperometro in serie in alto, il componente a destra, il voltmetro accanto.
     */
    drawCircuit(d) {
      const W = sch.width, H = sch.height;
      sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, W, H);
      const xS = 96, xA = 292, xC = 532, xV = 672, yT = 112, yB = 340, yM = (yT + yB) / 2;
      const ink = '#2a2f36', live = d.on && !d.burnt && Math.abs(d.I) > 1e-6;
      sc.lineCap = 'round'; sc.lineJoin = 'round';
      const line = (pts, col = ink, w = 3.5) => { sc.strokeStyle = col; sc.lineWidth = w; sc.beginPath(); pts.forEach(([x, y], i) => (i ? sc.lineTo(x, y) : sc.moveTo(x, y))); sc.stroke(); };
      const dot = (x, y) => { sc.fillStyle = ink; sc.beginPath(); sc.arc(x, y, 7, 0, Math.PI * 2); sc.fill(); };
      const label = (txt, x, y, { align = 'center', size = 26, col = ink, bg = '#f7f7f5', weight = 600 } = {}) => {
        sc.font = `${weight} ${size}px ${MONO}`; sc.textAlign = align; sc.textBaseline = 'middle';
        const w = sc.measureText(txt).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        if (bg) { sc.fillStyle = bg; sc.fillRect(x0 - 6, y - size * 0.62, w + 12, size * 1.24); }
        sc.fillStyle = col; sc.fillText(txt, x, y + 1);
      };
      const R0 = 34;
      const meter = (x, y, ch, col) => {
        sc.fillStyle = '#ffffff'; sc.strokeStyle = ink; sc.lineWidth = 3.5; sc.beginPath(); sc.arc(x, y, R0, 0, Math.PI * 2); sc.fill(); sc.stroke();
        sc.fillStyle = col; sc.font = `700 36px ${MONO}`; sc.textAlign = 'center'; sc.textBaseline = 'middle'; sc.fillText(ch, x, y + 2);
      };
      // i fili del circuito principale
      line([[xS, yM - 30], [xS, yT], [xA - R0, yT]]);
      line([[xA + R0, yT], [xC, yT], [xC, yM - 46]]);
      line([[xC, yM + 46], [xC, yB], [xS, yB], [xS, yM + 30]]);
      // il voltmetro
      const tapX = d.mode === 'valle' ? xC : xS + 90;
      if (d.mode === 'valle') line([[xC, yT], [xV, yT], [xV, yM - R0]]);
      else line([[tapX, yT], [tapX, 56], [xV, 56], [xV, yM - R0]]);
      line([[xV, yM + R0], [xV, yB], [xC, yB]]);
      dot(tapX, yT); dot(xC, yB);
      // l'alimentatore: la piastra lunga è il +
      const plusTop = !d.flip;
      sc.strokeStyle = d.on ? ink : '#9aa1ab'; sc.lineWidth = 5;
      for (const [y, half] of [[yM - 12, plusTop ? 36 : 19], [yM + 12, plusTop ? 19 : 36]]) { sc.beginPath(); sc.moveTo(xS - half, y); sc.lineTo(xS + half, y); sc.stroke(); }
      line([[xS, yM - 30], [xS, yM - 12]]); line([[xS, yM + 12], [xS, yM + 30]]);
      label('+', xS - 54, plusTop ? yM - 18 : yM + 18, { size: 30, col: '#c62a1e', bg: null, weight: 700 });
      label('−', xS - 54, plusTop ? yM + 18 : yM - 18, { size: 30, bg: null, weight: 700 });
      label(d.on ? `${num(Math.abs(d.Vout), 2)} V` : 'spento', xS + 50, yM - 16, { align: 'left', size: 26 });
      if (d.on) label(d.cc ? 'CC' : 'CV', xS + 50, yM + 18, { align: 'left', size: 22, col: d.cc ? '#c62a1e' : '#6b7380' });
      // l'amperometro e il voltmetro con le letture
      meter(xA, yT, 'A', '#c77b12');
      label(`${d.Itxt}`, xA, yT + 64, { size: 28 });
      meter(xV, yM, 'V', '#1f6fb8');
      label(`${d.Vtxt}`, xV, yM + 66, { size: 26 });
      // il componente
      sc.strokeStyle = d.burnt ? '#9aa1ab' : ink; sc.lineWidth = 3.5;
      if (d.kind === 'R' || d.kind === 'wire') {
        sc.fillStyle = '#ffffff'; sc.fillRect(xC - 16, yM - 46, 32, 92); sc.strokeRect(xC - 16, yM - 46, 32, 92);
        if (d.kind === 'wire') { line([[xC - 30, yM + 34], [xC + 25, yM - 30]], ink, 3); sc.fillStyle = ink; sc.beginPath(); sc.moveTo(xC + 30, yM - 36); sc.lineTo(xC + 13, yM - 28); sc.lineTo(xC + 23, yM - 18); sc.fill(); }
      } else if (d.kind === 'lamp') {
        line([[xC, yM - 46], [xC, yM - 27]]); line([[xC, yM + 27], [xC, yM + 46]]);
        sc.fillStyle = d.glow > 0.05 ? `rgba(255,${200 - 40 * d.glow},90,${0.25 + 0.6 * d.glow})` : '#ffffff';
        sc.beginPath(); sc.arc(xC, yM, 27, 0, Math.PI * 2); sc.fill(); sc.stroke();
        const k = 27 * Math.SQRT1_2, c = sc.strokeStyle; line([[xC - k, yM - k], [xC + k, yM + k]], c, 3); line([[xC - k, yM + k], [xC + k, yM - k]], c, 3);
      } else {
        line([[xC, yM - 46], [xC, yM - 19]]); line([[xC, yM + 19], [xC, yM + 46]]);
        sc.fillStyle = d.glow > 0.05 ? `rgba(230,50,30,${0.3 + 0.6 * d.glow})` : '#ffffff';
        sc.beginPath(); sc.moveTo(xC - 22, yM - 19); sc.lineTo(xC + 22, yM - 19); sc.lineTo(xC, yM + 17); sc.closePath(); sc.fill(); sc.stroke();
        line([[xC - 22, yM + 19], [xC + 22, yM + 19]]);
        for (const dy of [-8, 8]) { const x0 = xC + 27, y0 = yM + dy; line([[x0, y0], [x0 + 18, y0 - 14]], '#d42a1c', 2.5); sc.fillStyle = '#d42a1c'; sc.beginPath(); sc.moveTo(x0 + 22, y0 - 17); sc.lineTo(x0 + 10, y0 - 15); sc.lineTo(x0 + 17, y0 - 6); sc.fill(); }
      }
      if (d.burnt) { line([[xC - 26, yM - 26], [xC + 26, yM + 26]], '#c62a1e', 5); line([[xC - 26, yM + 26], [xC + 26, yM - 26]], '#c62a1e', 5); }
      label(d.name, xC - 34, yM - 17, { align: 'right', size: 24 });
      label(d.burnt ? 'bruciato' : d.sub, xC - 34, yM + 17, { align: 'right', size: 20, col: d.burnt ? '#c62a1e' : '#6b7380', weight: 500 });
      // il verso della corrente (convenzionale)
      if (live) {
        // I > 0: in senso orario (dal + in alto); con la polarità invertita il + è in basso e I < 0
        const u = d.I >= 0 ? 1 : -1;
        const arrow = (x, y, ux) => { sc.fillStyle = '#c62a1e'; sc.beginPath(); sc.moveTo(x + ux * 13, y); sc.lineTo(x - ux * 10, y - 10); sc.lineTo(x - ux * 10, y + 10); sc.closePath(); sc.fill(); };
        arrow(xA + 112, yT, u); arrow((xS + xC) / 2, yB, -u);
        label('I', xA + 112, yT - 28, { size: 26, col: '#c62a1e', bg: null, weight: 700 });
      }
      label(d.mode === 'valle' ? 'voltmetro a valle' : 'voltmetro a monte', 20, 24, { align: 'left', size: 20, col: '#6b7380', bg: null, weight: 500 });
      if (d.ideal) label('strumenti ideali', W - 20, 24, { align: 'right', size: 20, col: '#1f6fb8', bg: null, weight: 500 });
      sc.lineCap = 'butt'; sc.lineJoin = 'miter'; sc.textBaseline = 'alphabetic';
    },

    /** Grafico. series: [{x, y, color, width, dash, alpha}]; points: [{x, y, color, r, ring}]; fills: [{x, y0, y1, color}] */
    drawPlot({ series = [], points = [], vlines = [], fills = [], X0, X1, Y0, Y1, xLabel, yLabel, legend }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = `500 18px ${MONO}`; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 145))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 55)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      const xlw = pc.measureText(xLabel).width + 34;
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x); pc.strokeStyle = Math.abs(x) < xs / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - xlw) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs)), px, Hh - 12);
      }
      pc.textAlign = 'right';
      for (let y = Math.ceil(Y0 / ys) * ys; y <= Y1 + 1e-9; y += ys) {
        const py = yOf(y); pc.strokeStyle = Math.abs(y) < ys / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        pc.fillText(num(Math.abs(y) < ys / 2 ? 0 : y, dec(ys)), padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) { let lx = W - padR - 8; pc.font = `500 17px ${MONO}`; for (const [text, col] of legend.slice().reverse()) { const tw = pc.measureText(text).width; pc.fillStyle = col; pc.fillText(text, lx, padT + 14); lx -= tw + 22; } }
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const f of fills) { pc.fillStyle = f.color; pc.beginPath(); f.x.forEach((x, i) => (i ? pc.lineTo(xOf(x), yOf(f.y1[i])) : pc.moveTo(xOf(x), yOf(f.y1[i])))); for (let i = f.x.length - 1; i >= 0; i--) pc.lineTo(xOf(f.x[i]), yOf(f.y0[i])); pc.closePath(); pc.fill(); }
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) { pen = false; continue; } const px = xOf(s.x[i]), py = yOf(Math.max(Y0 - (Y1 - Y0), Math.min(Y1 + (Y1 - Y0), s.y[i]))); if (pen) pc.lineTo(px, py); else pc.moveTo(px, py); pen = true; }
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const v of vlines) { pc.strokeStyle = v.color; pc.lineWidth = v.width || 2; pc.setLineDash(v.dash || []); pc.beginPath(); pc.moveTo(xOf(v.x), padT); pc.lineTo(xOf(v.x), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); if (p.ring) { pc.strokeStyle = p.ring; pc.lineWidth = 2.5; pc.stroke(); } }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
