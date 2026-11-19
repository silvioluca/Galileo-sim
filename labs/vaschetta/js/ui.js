// ui.js — pannello dei controlli, misure nel riquadro, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num, cm: (x, d = 1) => `${num(x * 100, d)} cm` };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const PAD = { l: 70, r: 16, t: 18, b: 40 };

/** ctx: { presets, views, fText(), vText(), lineText() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('src', '', [['point', 'Una punta', 'Onde circolari'], ['two', 'Due punte', 'Due sorgenti coerenti: interferenza'], ['bar', 'Onde piane', 'L\'asta tocca l\'acqua per tutta la larghezza'], ['move', 'Punta in moto', 'Una punta su un carrello: effetto Doppler']], 2);
  slider('f', { range: () => [5, 25, 0.5], read: () => state.f, write: (v) => { state.f = v; }, label: () => 'Frequenza', text: () => `${num(state.f, 1)} Hz <small>· ${ctx.fText()}</small>` });
  slider('amp', { range: () => [1, 10, 1], read: () => state.amp, write: (v) => { state.amp = v; }, label: () => 'Ampiezza', text: () => `${state.amp} <small>· di 10</small>` });
  slider('d', { range: () => [2, 10, 0.5], read: () => state.d, write: (v) => { state.d = v; }, label: () => 'Distanza fra le punte', text: () => `${num(state.d, 1)} cm <small>· ${ctx.dText()}</small>` });
  seg('phase', 'Fase', [[0, 'In fase', 'Le due punte scendono insieme'], [180, 'In opposizione', 'Una scende mentre l\'altra sale']]);
  slider('u', { range: () => [0, 0.45, 0.01], read: () => state.u, write: (v) => { state.u = Math.round(v * 100) / 100; }, label: () => 'Velocità del carrello', text: () => `${num(state.u * 100, 0)} cm/s <small>· ${ctx.uText()}</small>` });
  seg('obs', 'Ostacolo', [['none', 'Nessuno'], ['slit', 'Fenditura'], ['double', 'Due fenditure'], ['wall', 'Parete'], ['mirror', 'Parabola', 'Specchio parabolico: concentra le onde piane nel fuoco'], ['plate', 'Lastra', 'Lastra di vetro sul fondo: l\'acqua è più bassa e le onde rallentano'], ['lens', 'Lente', 'Lastra a forma di lente biconvessa']], 3);
  slider('a', { range: () => [0.5, 6, 0.1], read: () => state.a, write: (v) => { state.a = v; }, label: () => 'Larghezza della fenditura', text: () => `${num(state.a, 1)} cm <small>· ${ctx.aText()}</small>` });
  slider('ds', { range: () => [2, 10, 0.5], read: () => state.ds, write: (v) => { state.ds = v; }, label: () => 'Distanza fra le fenditure', text: () => `${num(state.ds, 1)} cm` });
  slider('ang', { range: () => [0, 60, 1], read: () => state.ang, write: (v) => { state.ang = v; }, label: () => (state.obs === 'plate' ? 'Inclinazione del bordo della lastra' : 'Inclinazione della parete'), text: () => `${state.ang}°` });
  slider('depth', { range: () => [4, 10, 0.5], read: () => state.depth, write: (v) => { state.depth = v; }, label: () => 'Profondità dell\'acqua', text: () => `${num(state.depth, 1)} mm <small>· ${ctx.vText()}</small>` });
  toggle('beaches', 'Spiagge di spugna', 'assorbono le onde ai bordi; senza, le sponde le riflettono');
  toggle('mirror', 'Specchio a 45° e schermo', 'sotto la vasca: manda l\'immagine su uno schermo verticale, da guardare di fronte');
  seg('look', 'Sul foglio e sullo schermo', [['proj', 'L\'immagine', 'La luce della lampada concentrata dalle creste: righe chiare e scure'], ['amp', 'Ampiezza media', 'Quanto si muove l\'acqua in media in ogni punto: le linee nodali restano scure']]);
  toggle('strobe', 'Stroboscopio', 'lampi a frequenza vicina a quella del generatore');
  slider('dstrobe', { range: () => [-1, 1, 0.05], read: () => state.dstrobe, write: (v) => { state.dstrobe = Math.round(v * 100) / 100; }, label: () => 'Lampi', text: () => `f ${state.dstrobe >= 0 ? '−' : '+'} ${num(Math.abs(state.dstrobe), 2)} Hz <small>· ${state.dstrobe === 0 ? 'onde ferme' : 'le onde avanzano piano'}</small>` });
  toggle('line', 'Linea di misura', 'rossa sul foglio; il grafico «sulla linea» mostra l\'ampiezza lungo di essa');
  slider('xl', { range: () => [-15, 18, 0.5], read: () => state.xl, write: (v) => { state.xl = v; }, label: () => 'Posizione della linea', text: () => `${num(state.xl, 1)} cm <small>· ${ctx.lineText()}</small>` });
  seg('slow', 'Tempo', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']]);
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
  for (const id of ['go', 'pause', 'note', 'reset', 'clear', 'fullscreen']) $(`#${id}`).addEventListener('click', () => on(id));
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
      $('[data-ctl="d"]').hidden = $('[data-ctl="phase"]').hidden = state.src !== 'two';
      $('[data-ctl="u"]').hidden = state.src !== 'move';
      $('[data-ctl="a"]').hidden = state.obs !== 'slit' && state.obs !== 'double';
      $('[data-ctl="ds"]').hidden = state.obs !== 'double';
      $('[data-ctl="ang"]').hidden = state.obs !== 'wall' && state.obs !== 'plate';
      $('[data-ctl="dstrobe"]').hidden = !state.strobe;
      $('[data-ctl="xl"]').hidden = !state.line;
      refresh('ang');
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setNote(id, html) { const el = $(id); if (el.innerHTML !== html) el.innerHTML = html; el.hidden = !html; },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setTitle(title, sub) { $('#live-title').textContent = title; $('#live-sub').textContent = sub; },
    setClock(txt, unit, live) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; } $('#unit').textContent = unit; $('.clock').classList.toggle('run', live); },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setGo(label, lit) { const s = $('#go span'); if (s.textContent !== label) s.textContent = label; $('#go').classList.toggle('lit', !!lit); },
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
        for (let i = 0; i < s.x.length; i++) { const px = xOf(s.x[i]), py = yOf(s.y[i]); if (i) pc.lineTo(px, py); else pc.moveTo(px, py); }
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
