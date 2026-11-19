// ui.js — pannello dei controlli, cronometro, elenco dei lanci, grafico. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  num,
  s(t) { return `${num(t, 3)} s`; },
  ms(v) { return `${num(v, Math.abs(v) < 10 ? 2 : 1)} m/s`; },
  m(v) { return Math.abs(v) < 1 ? `${num(v * 100, Math.abs(v * 100) < 10 ? 1 : 0)} cm` : `${num(v, 2)} m`; },
  deg(a) { const r = Math.round(a * 10) / 10; return `${r < 0 ? '−' : ''}${num(Math.abs(r), Number.isInteger(r) ? 0 : 1)}°`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const D_MIN = 0.3, D_MAX = 40;

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('app', '', [['spring', 'Lanciatore a molla', 'Canna con molla e goniometro: scegli velocità, alzo e altezza'], ['galileo', 'Piano di Galileo', 'Rampa curva in legno e tavola con la parabola (Museo Galileo, XVIII secolo)']]);
  slider('Hr', {
    range: () => [ctx.gal.Hmin, ctx.gal.Hmax, 0.005], read: () => state.Hr, write: (v) => { state.Hr = Math.round(v * 1000) / 1000; },
    label: () => 'Partenza sul piano curvo', text: () => `${fmt.m(state.Hr)} <small>· sopra l'uscita</small>`,
  });
  slider('v0', {
    range: () => [0.5, 20, 0.1], read: () => state.v0, write: (v) => { state.v0 = Math.round(v * 10) / 10; },
    label: () => 'Velocità di uscita', text: () => fmt.ms(state.v0),
  });
  slider('angle', {
    range: () => [state.h < 0.005 ? 0 : -45, 90, 1], read: () => state.angle, write: (v) => { state.angle = v; },
    label: () => 'Alzo della canna',
    text: () => `${fmt.deg(state.angle)} <small>· ${state.angle >= 89.95 ? 'verticale' : Math.abs(state.angle) < 0.05 ? 'orizzontale' : state.angle > 0 ? 'verso l\'alto' : 'verso il basso'}</small>`,
  });
  slider('h', {
    range: () => [0, 3, 0.01], read: () => state.h, write: (v) => { state.h = v; },
    label: () => 'Altezza di lancio', text: () => (state.h < 0.005 ? 'a filo del pavimento' : fmt.m(state.h)),
  });
  seg('ball', '', ctx.balls.map(([k, b]) => [k, b.name, b.note]), 4);
  toggle('twin', 'Seconda pallina lasciata cadere', 'parte da ferma nello stesso istante, alla stessa altezza');
  toggle('bounce', 'Rimbalzi', 'spenti: la pallina si ferma dove tocca, come nella sabbia');
  seg('target', '', [['none', 'Nessuno'], ['floor', 'A terra', 'Un bersaglio sul pavimento: trova l\'alzo giusto'], ['drop', 'Che cade', 'Un barattolo appeso a un elettromagnete: si stacca nell\'istante del lancio']]);
  slider('D', {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state.D / D_MIN)) / Math.log(D_MAX / D_MIN)),
    write: (v) => { const d = D_MIN * (D_MAX / D_MIN) ** (v / 200); state.D = d < 10 ? Math.round(d * 100) / 100 : Math.round(d * 10) / 10; },
    label: () => 'Distanza del bersaglio', text: () => fmt.m(state.D),
  });
  slider('H', {
    range: () => [0.2, 4, 0.01], read: () => state.H, write: (v) => { state.H = v; },
    label: () => 'Altezza del barattolo', text: () => `${fmt.m(state.H)} <small>· centro</small>`,
  });
  seg('planet', '', ctx.planets.map(([k, p]) => [k, p.name, p.note]), 4);
  toggle('air', 'Attrito dell\'aria', 'resistenza quadratica e spinta di Archimede');
  seg('slow', 'Rallentatore', [[1, '1×', 'Tempo reale'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×'], [0.05, '1/20×']]);
  toggle('trail', 'Traiettorie');
  toggle('keep', 'Conserva i lanci precedenti', 'fino a otto, con il punto d\'arrivo');
  toggle('strobe', 'Foto stroboscopica', 'un\'immagine a intervalli di tempo uguali');
  seg('strobeHz', '', [[5, '5 lampi/s'], [10, '10 lampi/s'], [20, '20 lampi/s']]);
  toggle('vVec', 'Vettore velocità', 'sempre tangente alla traiettoria');
  toggle('comps', 'Componenti della velocità', 'vₓ costante, v_y che cambia');
  toggle('gVec', 'Accelerazione', 'g, sempre verso il basso');
  toggle('proj', 'Proiezioni sugli assi', 'sul metro un moto uniforme, sull\'asta un lancio verticale');
  toggle('predict', 'Traiettoria prevista', 'prima di lanciare');
  toggle('vacuumRef', 'Parabola nel vuoto', 'per confronto, quando c\'è l\'aria');
  toggle('env', 'Parabola di sicurezza', 'il bordo di tutti i punti raggiungibili');
  toggle('outline', 'Contorno della pallina', 'evidenzia l\'oggetto in moto');
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
  $('#fire').addEventListener('click', () => on('fire'));
  $('#clear').addEventListener('click', () => on('clear'));
  $('#pause').addEventListener('click', () => on('pause'));
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
  let clockTxt = '', aimKey = '';

  return {
    refresh,
    sync() {
      const gal = state.app === 'galileo';
      for (const k of ['v0', 'angle', 'h']) $(`[data-ctl="${k}"]`).hidden = gal;
      $('[data-ctl="Hr"]').hidden = !gal;
      $('#app-note').hidden = !gal;
      $('#sec-target').hidden = gal;
      $('[data-ctl="D"]').hidden = state.target === 'none';
      $('[data-ctl="H"]').hidden = state.target !== 'drop';
      $('#aim-box').hidden = state.target === 'none';
      $('[data-ctl="strobeHz"]').hidden = !state.strobe;
      $('[data-ctl="twin"]').classList.toggle('disabled', gal || state.h < 0.005);
      for (const k of ['proj', 'env']) $(`[data-ctl="${k}"]`).classList.toggle('disabled', gal);
      $('#plot-kind [data-k="g116"]').hidden = !gal;
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
      // numeri delle sezioni visibili, senza buchi
      let n = 0;
      document.querySelectorAll('#panel .sec > h2 > span').forEach((s) => { if (!s.closest('.sec').hidden) s.textContent = String(++n).padStart(2, '0'); });
      $('#hint .do').textContent = gal ? 'trascina la pallina o il fermo sul piano curvo per cambiare la partenza' : 'trascina la canna per cambiare l\'alzo, la forcella per l\'altezza';
    },
    setAppNote(html) { $('#app-note').innerHTML = html; },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setPlanetNote(html) { $('#planet-note').innerHTML = html; },
    /** Pulsanti di mira: [[id, testo, titolo]] e una nota. */
    setAim(list, note) {
      const key = JSON.stringify(list) + note;
      if (key === aimKey) return;
      aimKey = key;
      chips($('#aim'), list, 'aim');
      $('#aim-note').innerHTML = note || '';
    },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(t, running) {
      const txt = num(t, 3);
      if (txt !== clockTxt) { clockTxt = txt; $('#clock').textContent = txt; }
      $('.clock').classList.toggle('run', running);
    },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setFireEnabled(e) { $('#fire').disabled = !e; },
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
    /** Una riga per lancio, dal più recente: alzo e velocità, gittata, tempo di volo. */
    setRows(rows) {
      const box = $('#rows');
      const key = rows.map((r) => r.key).join();
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = rows.length ? rows.map((r) => `<div class="obj"><i style="background:${r.color}"></i><span class="n"></span><span class="t"></span><span class="v"></span></div>`).join('') : '<p class="empty">Premi «Lancia» o la barra spaziatrice.</p>';
      }
      rows.forEach((r, i) => {
        const el = box.children[i];
        el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v;
        el.classList.toggle('done', !!r.done);
      });
    },

    /**
     * kind 'xy': traiettorie y(x) di tutti i lanci, con le curve di riferimento tratteggiate.
     * kind 'xt': x(t) e y(t) del lancio corrente; kind 'v': vₓ(t) e v_y(t).
     * series: [{color, x:[], y:[]}] già nelle unità del grafico; refs: [{color, x:[], y:[], dash}]; dot: {x, y, color}
     */
    drawPlot({ kind, series, refs, X0, X1, Y0, Y1, xLabel, yLabel, marks, dot, legend, points }) {
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
        pc.fillText(num(Math.abs(y) < ys / 2 ? 0 : y, ys < 0.1 ? 2 : ys < 1 ? 1 : 0), padL - 8, py + 6);
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
      const line = (s) => {
        pc.beginPath();
        let started = false;
        for (let i = 0; i < s.x.length; i++) {
          const v = s.y[i];
          if (v === null || !isFinite(v)) { started = false; continue; }
          const px = xOf(s.x[i]), py = yOf(v);
          if (started) pc.lineTo(px, py); else { pc.moveTo(px, py); started = true; }
        }
        pc.stroke();
      };
      for (const r of refs || []) {
        pc.setLineDash(r.dash || [7, 6]); pc.strokeStyle = r.color; pc.lineWidth = 1.8; pc.globalAlpha = 0.75;
        line(r); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const s of series) { pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.lineJoin = 'round'; pc.globalAlpha = s.alpha ?? 1; line(s); pc.globalAlpha = 1; }
      for (const d of dot ? [].concat(dot) : []) { pc.fillStyle = d.color; pc.beginPath(); pc.arc(xOf(d.x), yOf(d.y), 6, 0, Math.PI * 2); pc.fill(); }
      // punti di misura: pieni (i lanci) o vuoti (i dati di Galileo)
      for (const p of points || []) {
        pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 7, 0, Math.PI * 2);
        if (p.hollow) { pc.strokeStyle = p.color; pc.lineWidth = 2.6; pc.stroke(); } else { pc.fillStyle = p.color; pc.fill(); }
      }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
      void kind;
    },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },
  };
}
