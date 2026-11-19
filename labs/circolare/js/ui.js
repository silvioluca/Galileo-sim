// ui.js — pannello dei controlli, lettura del sensore, righe dei dischi, grafico scorrevole. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  num,
  N(f) { return `${num(f, f < 10 ? 3 : 2)} N`; },
  ms(v) { return `${num(v, 2)} m/s`; },
  cm(m) { return `${num(m * 100, 0)} cm`; },
  g(kg) { return `${num(kg * 1000, 0)} g`; },
  s(t) { return isFinite(t) ? `${num(t, 3)} s` : '—'; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  slider('rpm', {
    range: () => [0, 120, 1], read: () => state.rpm, write: (v) => { state.rpm = v; },
    label: () => 'Velocità del motore', text: () => (state.rpm ? `${state.rpm} giri/min <small>· T ${num(60 / state.rpm, 2)} s</small>` : 'ferma'),
  });
  seg('dir', 'Verso di rotazione (visto dall\'alto)', [[1, 'Antiorario ↺'], [-1, 'Orario ↻']]);
  slider('alpha', {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state.alpha / 0.5)) / Math.log(40)),
    write: (v) => { const a = 0.5 * 40 ** (v / 200); state.alpha = a < 2 ? Math.round(a * 10) / 10 : Math.round(a * 2) / 2; },
    label: () => 'Accelerazione all\'avvio', text: () => `${num(state.alpha, 1)} rad/s²`,
  });
  const rSlider = (key, label) => slider(key, { range: () => [0.1, 0.45, 0.01], read: () => state[key], write: (v) => { state[key] = v; }, label: () => label, text: () => fmt.cm(state[key]) });
  const mSlider = (key, label) => slider(key, { range: () => [0.05, 0.5, 0.05], read: () => state[key], write: (v) => { state[key] = Math.round(v * 20) / 20; }, label: () => label, text: () => `${fmt.g(state[key])} <small>· ${Math.round((state[key] - 0.05) / 0.05)} masse</small>` });
  rSlider('rA', 'Raggio del disco A');
  mSlider('mA', 'Massa del disco A');
  toggle('useB', 'Disco B', 'sul braccio opposto, per confrontare');
  rSlider('rB', 'Raggio del disco B');
  mSlider('mB', 'Massa del disco B');
  seg('frame', '', [['lab', 'Dal laboratorio', 'Osservatore fermo: sistema inerziale'], ['rot', 'Sulla piattaforma', 'Osservatore che ruota con la piattaforma']]);
  seg('slow', 'Rallentatore', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']]);
  toggle('trail', 'Traiettoria');
  toggle('vVec', 'Vettore velocità', 'tangente al cerchio');
  toggle('aVec', 'Vettore accelerazione', 'verso il centro');
  toggle('fVec', 'Forze', 'sulla piattaforma anche quelle apparenti');
  toggle('shadow', 'Ombra sullo schermo', 'la proiezione compie un moto armonico');
  toggle('outline', 'Contorno dei dischi', 'evidenzia gli oggetti in moto');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = text; if (title) b.title = title;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');
  $('#motor').addEventListener('click', () => on('motor'));
  $('#release').addEventListener('click', () => on('release'));
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
  let forceTxt = '';

  return {
    refresh,
    sync() {
      document.querySelectorAll('[data-b]').forEach((el) => { el.hidden = !state.useB; });
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setFrameNote(t) { $('#frame-note').innerHTML = t; },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setForce(F, live) {
      const txt = num(F, F < 10 ? 3 : 2);
      if (txt !== forceTxt) { forceTxt = txt; $('#force').textContent = txt; }
      $('.clock').classList.toggle('run', live);
    },
    setSide(a, b) { $('#period').textContent = a; $('#omega').textContent = b; },
    setMotor(on2) { $('#motor span').textContent = on2 ? 'Ferma motore' : 'Avvia motore'; $('#motor').classList.toggle('on', on2); },
    setReleaseEnabled(e) { $('#release').disabled = !e; },
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
    setRows(rows) {
      const box = $('#rows');
      const key = rows.map((r) => r.key).join();
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = rows.map((r) => `<div class="obj"><i style="background:${r.color}"></i><span class="n"></span><span class="t"></span><span class="v"></span></div>`).join('');
      }
      rows.forEach((r, i) => { const el = box.children[i]; el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v; });
    },
    /** Grafico scorrevole: gli ultimi `span` secondi. series: [{color, y:[]}] con i tempi in t[]. */
    drawPlot({ kind, t, series, span, lo, hi, unit, now }) {
      const W = plot.width, Hh = plot.height, padL = 64, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh);
      pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const t0 = now - span;
      const xOf = (tt) => padL + ((tt - t0) / span) * (W - padL - padR);
      const yOf = (v) => Hh - padB - ((v - lo) / (hi - lo)) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; pc.fillStyle = '#6b7380';
      pc.textAlign = 'center';
      for (let s = Math.ceil(t0); s <= now; s++) {
        const x = xOf(s);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(x, padT); pc.lineTo(x, Hh - padB); pc.stroke();
        if (x < W - padR - 56) pc.fillText(String(s), x, Hh - 12);   // lascia spazio all'unità "t (s)"
      }
      pc.textAlign = 'right';
      const ys = niceStep((hi - lo) / 4);
      for (let v = Math.ceil(lo / ys) * ys; v <= hi + 1e-9; v += ys) {
        const y = yOf(v);
        pc.strokeStyle = Math.abs(v) < ys / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)';
        pc.beginPath(); pc.moveTo(padL, y); pc.lineTo(W - padR, y); pc.stroke();
        pc.fillText(num(Math.abs(v) < ys / 2 ? 0 : v, ys < 0.1 ? 2 : ys < 1 ? 1 : 0), padL - 8, y + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab';
      pc.fillText({ F: 'forza verso il centro (N)', v: 'velocità (m/s)', x: 'posizione dell\'ombra (m)' }[kind], padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText('t (s)', W - padR, Hh - 12);
      void unit;
      for (const s of series) {
        pc.strokeStyle = s.color; pc.lineWidth = 3; pc.lineJoin = 'round';
        pc.beginPath();
        let started = false;
        for (let i = 0; i < t.length; i++) {
          if (t[i] < t0) continue;
          const v = s.y[i];
          if (v === null || !isFinite(v)) { started = false; continue; }
          const x = xOf(t[i]), y = yOf(Math.min(Math.max(v, lo), hi));
          if (started) pc.lineTo(x, y); else { pc.moveTo(x, y); started = true; }
        }
        pc.stroke();
      }
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
