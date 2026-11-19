// ui.js — pannello dei controlli, cronometro, righe dei risultati, grafico del moto. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = {
  num,
  s(t) { return `${num(t, 3)} s`; },
  ms(v) { return `${num(v, v < 10 ? 2 : 1)} m/s`; },
  m(v) { return Math.abs(v) < 1 ? `${num(v * 100, v * 100 < 10 ? 1 : 0)} cm` : `${num(v, 2)} m`; },
  mass(kg) { const g = kg * 1000; return g < 10 ? `${num(g, 1)} g` : g < 1000 ? `${num(g, 0)} g` : `${num(kg, 2)} kg`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const massSlider = (key, label) => slider(key, {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state[key] / 0.002)) / Math.log(350)),
    write: (v) => { const g = 2 * 350 ** (v / 200); state[key] = (g < 10 ? Math.round(g * 10) / 10 : g < 100 ? Math.round(g) : Math.round(g / 5) * 5) / 1000; },
    label: () => label, text: () => `${fmt.mass(state[key])} <small>· ${ctx.material(state[key])}</small>`,
  });

  toggle('compare', 'Confronta più pianeti', 'gli stessi oggetti cadono insieme su pianeti diversi');
  seg('planet', '', ctx.planets.map(([k, p]) => [k, p.name, p.note]), 4);
  // scelta multipla dei pianeti da confrontare (almeno due)
  const multi = $('#planets-multi');
  const mbtns = ctx.planets.map(([k, p]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = p.note;
    b.innerHTML = `<i style="background:${p.color}"></i>${p.name}`;
    b.addEventListener('click', () => {
      const set = new Set(state.planets);
      if (set.has(k)) { if (set.size <= 2) return; set.delete(k); } else set.add(k);
      state.planets = ctx.planets.map(([kk]) => kk).filter((kk) => set.has(kk));
      syncMulti(); on('planets');
    });
    multi.appendChild(b);
    return [k, b];
  });
  const syncMulti = () => mbtns.forEach(([k, b]) => { const onp = state.planets.includes(k); b.classList.toggle('on', onp); b.setAttribute('aria-pressed', onp); });
  toggle('ballA', 'Pallina A', 'diametro 4 cm');
  massSlider('massA', 'Massa della pallina A');
  toggle('ballB', 'Pallina B', 'diametro 4 cm');
  massSlider('massB', 'Massa della pallina B');
  toggle('feather', 'Piuma', 'remigante di falco, 0,5 g');
  toggle('hammer', 'Martello', 'da geologo, 1,32 kg');
  slider('h', {
    range: () => [0.1, 5, 0.01], read: () => state.h, write: (v) => { state.h = v; },
    label: () => 'Altezza di partenza', text: () => fmt.m(state.h),
  });
  slider('v0', {
    range: () => [0, 10, 0.1], read: () => state.v0, write: (v) => { state.v0 = v; },
    label: () => 'Velocità iniziale', text: () => (state.v0 === 0 ? 'ferma' : fmt.ms(state.v0)),
  });
  slider('angle', {
    range: () => [-90, 90, 1], read: () => state.angle, write: (v) => { state.angle = v; },
    label: () => 'Direzione del lancio',
    text: () => `${state.angle > 0 ? '+' : state.angle < 0 ? '−' : ''}${Math.abs(state.angle)}° <small>· ${state.angle === 90 ? 'verso l\'alto' : state.angle === -90 ? 'verso il basso' : state.angle === 0 ? 'orizzontale' : state.angle > 0 ? 'in su' : 'in giù'}</small>`,
    disabled: () => state.v0 === 0,
  });
  toggle('air', 'Attrito dell\'aria', 'resistenza e spinta di Archimede');
  seg('slow', 'Rallentatore', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×'], [0.05, '1/20×']]);
  toggle('strobe', 'Foto stroboscopica', 'un\'immagine a intervalli di tempo uguali');
  seg('strobeHz', '', [[10, '10 lampi/s'], [20, '20 lampi/s'], [40, '40 lampi/s']]);
  toggle('trails', 'Traiettorie');
  toggle('vectors', 'Vettori velocità');
  toggle('outline', 'Contorno degli oggetti', 'evidenzia ciò che cade');
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

  $('#drop').addEventListener('click', () => on('drop'));
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
      $('[data-ctl="planet"]').hidden = state.compare;
      multi.hidden = !state.compare;
      syncMulti();
      document.querySelectorAll('[data-obj]').forEach((el) => { el.hidden = !state[el.dataset.obj]; });
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
      $('[data-ctl="strobeHz"]').hidden = !state.strobe;
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setPlanetNote(html) { $('#planet-note').innerHTML = html; },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(t, running) {
      const txt = num(t, 3);
      if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; }
      $('.clock').classList.toggle('run', running);
    },
    setClockSide(slow, vac) { $('#slowmo').textContent = slow; $('#vacuum').textContent = vac; },
    setDropLabel(t) { $('#drop span').textContent = t; },
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
    /** Una riga per oggetto: nome, tempo d'arrivo, velocità d'impatto. */
    setRows(rows) {
      const box = $('#rows');
      const key = rows.map((r) => r.key).join();
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = rows.map((r) => `<div class="obj"><i style="background:${r.color}"></i><span class="n"></span><span class="t"></span><span class="v"></span></div>`).join('');
      }
      rows.forEach((r, i) => {
        const el = box.children[i];
        el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v;
        el.classList.toggle('done', !!r.done);
      });
    },

    /**
     * Grafico altezza–tempo o velocità–tempo.
     * series: [{color, t:Float64Array, y:Float64Array, vx, vy, n}] · refs: riferimenti nel vuoto [{t[], y[], v[], color}]
     */
    drawPlot({ kind, series, refs, T, Ymax, Vmax, now }) {
      const W = plot.width, Hh = plot.height, padL = 64, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh);
      pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const top = kind === 'y' ? Ymax : Vmax;
      const xOf = (t) => padL + (t / T) * (W - padL - padR);
      const yOf = (v) => Hh - padB - (v / top) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace';
      pc.fillStyle = '#6b7380'; pc.textAlign = 'center';
      const ts = niceStep(T / 5);
      for (let t = 0; t <= T + 1e-9; t += ts) {
        const x = xOf(t);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(x, padT); pc.lineTo(x, Hh - padB); pc.stroke();
        if (x < W - padR - 56) pc.fillText(num(t, ts < 0.1 ? 2 : ts < 1 ? 1 : 0), x, Hh - 12);   // lascia spazio all'unità "t (s)"
      }
      pc.textAlign = 'right';
      const ys = niceStep(top / 4);
      for (let v = 0; v <= top + 1e-9; v += ys) {
        const y = yOf(v);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(padL, y); pc.lineTo(W - padR, y); pc.stroke();
        pc.fillText(num(v, ys < 0.1 ? 2 : ys < 1 ? 1 : 0), padL - 8, y + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab';
      pc.fillText(kind === 'y' ? 'altezza (m)' : 'velocità (m/s)', padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText('t (s)', W - padR, Hh - 12);
      // riferimento: lo stesso lancio nel vuoto
      for (const ref of refs) {
        pc.setLineDash([7, 6]); pc.strokeStyle = ref.color; pc.lineWidth = 1.6; pc.globalAlpha = 0.6;
        pc.beginPath();
        ref.t.forEach((t, i) => { const v = kind === 'y' ? ref.y[i] : ref.v[i]; const x = xOf(t), y = yOf(v); if (i) pc.lineTo(x, y); else pc.moveTo(x, y); });
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const s of series) {
        pc.strokeStyle = s.color; pc.lineWidth = 3; pc.lineJoin = 'round';
        pc.beginPath();
        const step = Math.max(1, Math.floor(s.n / 700));
        let started = false;
        for (let i = 0; i < s.n; i += step) {
          if (s.t[i] > now) break;
          const v = kind === 'y' ? s.y[i] : Math.hypot(s.vx[i], s.vy[i]);
          const x = xOf(s.t[i]), y = yOf(Math.min(Math.max(v, 0), top * 1.05));
          if (started) pc.lineTo(x, y); else { pc.moveTo(x, y); started = true; }
        }
        pc.stroke();
      }
      if (now > 0) { const x = xOf(Math.min(now, T)); pc.strokeStyle = 'rgba(194,51,29,0.5)'; pc.lineWidth = 1; pc.beginPath(); pc.moveTo(x, padT); pc.lineTo(x, Hh - padB); pc.stroke(); }
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL, Hh - padB + 0.5); pc.lineTo(W - padR, Hh - padB + 0.5); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },
  };
}
