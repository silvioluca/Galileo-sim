// ui.js — pannello dei controlli, riquadro (bilancio di Bernoulli o forze sulla pallina, grafico), fascia delle
// misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const MONO = '"Geist Mono Variable", Consolas, monospace';

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const T = ctx.text;

  seg('app', 'Apparato', [['venturi', 'Il tubo di Venturi', 'Acqua che scorre in un tubo che si stringe'], ['jet', 'La pallina nel getto', 'Una pallina da ping-pong nel getto di un asciugacapelli']]);
  seg('profile', 'Forma del tubo', [['venturi', 'Venturi', 'Si stringe e si riallarga dolcemente'], ['step', 'Strozzatura', 'Restringimento a spigolo vivo'], ['uniform', 'Uniforme', 'Lo stesso diametro dappertutto']]);
  slider('throat', { range: () => [8, 26, 0.5], read: () => state.throat, write: (v) => { state.throat = v; }, label: () => 'Diametro della gola', text: T.throat, disabled: () => state.profile === 'uniform' });
  slider('H', { range: () => [15, 55, 0.5], read: () => state.H, write: (v) => { state.H = v; }, label: () => 'Livello nel serbatoio', text: T.H });
  slider('valve', { range: () => [0, 100, 0.5], read: () => state.valve, write: (v) => { state.valve = v; }, label: () => 'Valvola', text: T.valve });
  toggle('ideal', 'Fluido ideale', 'senza attrito né vortici: vale Bernoulli esatto');
  toggle('pitot', 'Tubi di Pitot', 'accanto a ogni tubicino, con la presa contro corrente: segnano h + v²/2g');
  toggle('aspirator', 'Aspiratore alla gola', 'un tubetto che pesca in una vaschetta d\'inchiostro');
  toggle('tracers', 'Particelle nell\'acqua', 'si muovono con la corrente');
  toggle('slow', 'Al rallentatore', 'le particelle, cinque volte più lente');
  slider('U0', { range: () => [0, 16, 0.1], read: () => state.U0, write: (v) => { state.U0 = v; }, label: () => 'Velocità dell\'aria', text: T.U0 });
  slider('tilt', { range: () => [0, 55, 0.5], read: () => state.tilt, write: (v) => { state.tilt = v; }, label: () => 'Inclinazione', text: T.tilt });
  seg('ball', 'Pallina', [['pingpong', 'Ping-pong', '2,7 g, 40 mm'], ['poly', 'Polistirolo', '2,2 g, 60 mm'], ['heavy', 'Zavorrata', '5,5 g, 40 mm']]);
  toggle('smoke', 'Fumo nel getto', 'per vedere dove va l\'aria');
  toggle('forces', 'Forze sulla pallina', 'peso, spinta dell\'aria, forza laterale');
  toggle('outline', 'Contorno', 'evidenzia ciò che si muove');
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
  for (const id of ['pause', 'note', 'clear', 'fullscreen', 'push', 'drop']) $(`#${id}`).addEventListener('click', () => on(id));
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
      const v = state.app === 'venturi';
      document.querySelectorAll('.only-v').forEach((e) => { e.hidden = !v; });
      document.querySelectorAll('.only-j').forEach((e) => { e.hidden = v; });
      $('#live-title').textContent = v ? 'Il bilancio di Bernoulli' : 'La pallina nel getto';
      $('#note').hidden = $('#clear').hidden = !v;
      const list = v ? [['line', 'lungo il tubo'], ['meter', 'venturimetro'], ['cont', 'continuità']] : [['axis', 'lungo il getto'], ['across', 'di traverso']];
      const key = list.map((x) => x[0]).join();
      if (key !== kinds) {
        kinds = key; const host = $('#plot-kind'); host.innerHTML = '';
        for (const [k, t] of list) { const b = document.createElement('button'); b.dataset.k = k; b.textContent = t; b.addEventListener('click', () => { state.plotKind = k; on('plotKind'); }); host.appendChild(b); }
      }
      if (!list.some((x) => x[0] === state.plotKind)) state.plotKind = list[0][0];
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
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
     * Il bilancio di Bernoulli a ogni tubicino: colonne con l'altezza piezometrica (blu), il carico cinetico
     * (arancio) e quanto si è perso (grigio), che insieme fanno H. d: { H, st: [{h, k, loss, label}], sel }
     */
    drawBalance(d) {
      const W = sch.width, Hh = sch.height, padL = 64, padR = 16, padT = 40, padB = 46;
      sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, W, Hh);
      const lo = Math.min(0, ...d.st.map((s) => s.h)) * 1.1, hi = d.H * 1.12;
      const yOf = (v) => Hh - padB - ((v - lo) / (hi - lo)) * (Hh - padT - padB);
      sc.font = `500 17px ${MONO}`; sc.fillStyle = '#6b7380'; sc.textAlign = 'right';
      const step = niceStep((hi - lo) / 5);
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
        sc.strokeStyle = Math.abs(v) < 1e-9 ? 'rgba(18,21,26,0.45)' : 'rgba(18,21,26,0.08)'; sc.beginPath(); sc.moveTo(padL, yOf(v)); sc.lineTo(W - padR, yOf(v)); sc.stroke();
        sc.fillText(`${num(v * 100, 0)}`, padL - 8, yOf(v) + 6);
      }
      sc.textAlign = 'left'; sc.fillStyle = '#9aa1ab'; sc.fillText('cm sopra l\'asse', padL + 4, 22);
      const n = d.st.length, cw = (W - padL - padR) / n, bw = cw * 0.56;
      d.st.forEach((s, i) => {
        const x = padL + cw * i + (cw - bw) / 2;
        const seg = (a, b, col) => { const y0 = yOf(a), y1 = yOf(b); sc.fillStyle = col; sc.fillRect(x, Math.min(y0, y1), bw, Math.abs(y1 - y0)); };
        seg(0, s.h, s.h >= 0 ? '#3f8fd6' : '#9cc4ea');
        seg(Math.max(0, s.h), Math.max(0, s.h) + s.k, '#f0a43a');
        seg(Math.max(0, s.h) + s.k, Math.max(0, s.h) + s.k + s.loss, 'rgba(120,128,138,0.45)');
        if (i === d.sel) { sc.strokeStyle = '#15181c'; sc.lineWidth = 2; sc.strokeRect(x - 3, yOf(hi) + 2, bw + 6, yOf(lo) - yOf(hi) - 4); sc.lineWidth = 1; }
        sc.fillStyle = '#3a3f46'; sc.textAlign = 'center'; sc.font = `600 17px ${MONO}`;
        sc.fillText(s.label, x + bw / 2, Hh - 14);
      });
      sc.setLineDash([8, 6]); sc.strokeStyle = '#e8452c'; sc.lineWidth = 2; sc.beginPath(); sc.moveTo(padL, yOf(d.H)); sc.lineTo(W - padR, yOf(d.H)); sc.stroke(); sc.setLineDash([]); sc.lineWidth = 1;
      sc.font = `500 16px ${MONO}`; sc.textAlign = 'right';
      let lx = W - padR;
      for (const [t, c] of [['perso', 'rgba(120,128,138,0.8)'], ['v²/2g', '#d98a1c'], ['h = p/ρg', '#3f8fd6'], ['H', '#e8452c']]) { sc.fillStyle = c; sc.fillText(t, lx, 22); lx -= sc.measureText(t).width + 18; }
    },

    /** La pallina e il getto di traverso: profilo della velocità all'altezza della pallina, forze. */
    drawJet(d) {
      const W = sch.width, Hh = sch.height, cx = W / 2, base = Hh - 50, top = 50;
      sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, W, Hh);
      if (!d) return;
      const sx = (W * 0.42) / d.half, vy = (base - top) / Math.max(4, d.Umax);
      // profilo u(r)
      sc.fillStyle = 'rgba(44,103,220,0.10)'; sc.beginPath(); sc.moveTo(cx - d.half * sx, base);
      for (const [r, u] of d.prof) sc.lineTo(cx + r * sx, base - u * vy);
      sc.lineTo(cx + d.half * sx, base); sc.closePath(); sc.fill();
      sc.strokeStyle = '#2c67dc'; sc.lineWidth = 3; sc.beginPath(); d.prof.forEach(([r, u], i) => (i ? sc.lineTo(cx + r * sx, base - u * vy) : sc.moveTo(cx + r * sx, base - u * vy))); sc.stroke(); sc.lineWidth = 1;
      sc.strokeStyle = 'rgba(18,21,26,0.35)'; sc.beginPath(); sc.moveTo(20, base); sc.lineTo(W - 20, base); sc.stroke();
      sc.setLineDash([6, 6]); sc.beginPath(); sc.moveTo(cx, top - 20); sc.lineTo(cx, base); sc.stroke(); sc.setLineDash([]);
      // velocità d'equilibrio
      sc.setLineDash([8, 6]); sc.strokeStyle = '#e8452c'; sc.beginPath(); sc.moveTo(20, base - d.ueq * vy); sc.lineTo(W - 20, base - d.ueq * vy); sc.stroke(); sc.setLineDash([]);
      sc.font = `500 16px ${MONO}`; sc.fillStyle = '#e8452c'; sc.textAlign = 'left'; sc.fillText(`regge il peso: ${num(d.ueq, 1)} m/s`, 24, base - d.ueq * vy - 8);
      // la pallina, sul suo spostamento laterale
      const bx = cx + d.r * sx, R = Math.max(8, d.R * sx);
      sc.fillStyle = '#f6f2e8'; sc.strokeStyle = '#3a3f46'; sc.lineWidth = 2; sc.beginPath(); sc.arc(bx, base - d.ueq * vy * 0.5, R, 0, Math.PI * 2); sc.fill(); sc.stroke(); sc.lineWidth = 1;
      // velocità sui due fianchi
      for (const [rr, u, col] of [[d.r - d.R, d.ui, '#15181c'], [d.r + d.R, d.uo, '#15181c']]) {
        const x = cx + rr * sx; sc.fillStyle = col; sc.beginPath(); sc.arc(x, base - u * vy, 6, 0, Math.PI * 2); sc.fill();
        sc.font = `600 16px ${MONO}`; sc.textAlign = 'center'; sc.fillText(`${num(u, 1)}`, x, base - u * vy - 12);
      }
      sc.fillStyle = '#6b7380'; sc.font = `500 16px ${MONO}`; sc.textAlign = 'left';
      sc.fillText('velocità dell\'aria (m/s) di traverso, all\'altezza della pallina', 20, 24);
      sc.textAlign = 'center'; sc.fillText('asse del getto', cx, base + 22);
      if (Math.abs(d.flat) > 1e-5) {
        const dir = Math.sign(d.flat), y = base - d.ueq * vy * 0.5;
        sc.strokeStyle = '#e8452c'; sc.fillStyle = '#e8452c'; sc.lineWidth = 4; sc.beginPath(); sc.moveTo(bx, y); sc.lineTo(bx + dir * Math.min(140, 30 + Math.abs(d.flat) * 4000), y); sc.stroke();
        const ex = bx + dir * Math.min(140, 30 + Math.abs(d.flat) * 4000); sc.beginPath(); sc.moveTo(ex + dir * 10, y); sc.lineTo(ex - dir * 6, y - 8); sc.lineTo(ex - dir * 6, y + 8); sc.fill(); sc.lineWidth = 1;
      }
    },

    /** Grafico. series: [{x, y, color, width, dash, alpha}]; points: [{x, y, color, r, ring}]; bars; fills: [{x, y0, y1, color}] */
    drawPlot({ series = [], points = [], vlines = [], fills = [], X0, X1, Y0, Y1, xLabel, yLabel, legend }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = `500 18px ${MONO}`; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 120))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 55)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      const xlw = pc.measureText(xLabel).width + 34;
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x); pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
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
        for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) { pen = false; continue; } const px = xOf(s.x[i]), py = yOf(s.y[i]); if (pen) pc.lineTo(px, py); else pc.moveTo(px, py); pen = true; }
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const v of vlines) { pc.strokeStyle = v.color; pc.lineWidth = v.width || 2; pc.setLineDash(v.dash || []); pc.beginPath(); pc.moveTo(xOf(v.x), padT); pc.lineTo(xOf(v.x), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); if (p.ring) { pc.strokeStyle = p.ring; pc.lineWidth = 2.5; pc.stroke(); } }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
