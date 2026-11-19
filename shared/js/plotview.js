// plotview.js — il grafico del riquadro si apre in grande sopra la scena e continua ad aggiornarsi.
// Si apre con un clic sul grafico, con il tasto G o (sui telefoni, dove il grafico piccolo è nascosto) con il
// pulsante «Grafico». Il <canvas> stesso passa nel riquadro grande, insieme ai controlli indicati in `tools`,
// e prende le dimensioni del riquadro; alla chiusura (Esc, G, ×, clic fuori) torna dov'era, com'era.

const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/**
 * @param {HTMLCanvasElement} canvas  il grafico (i laboratori lo ridisegnano leggendo canvas.width/height)
 * @param {{title?:string, tools?:Element[], redraw?:Function, scale?:number}} opts
 *   tools: controlli da portare nel riquadro grande (per esempio la scelta del grafico);
 *   redraw: ridisegna subito il grafico (dopo un cambio di dimensioni il canvas è vuoto);
 *   scale: pixel del canvas per pixel dello schermo nel riquadro grande (le scritte restano leggibili).
 */
export function expandablePlot(canvas, { title = 'Grafico', tools = [], redraw = () => {}, scale = 1.5 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'plot-wrap';
  canvas.before(wrap);
  wrap.appendChild(canvas);
  canvas.classList.add('plot-small');
  canvas.title = 'Clic per aprire il grafico in grande (G)';
  const hintIcon = document.createElement('span');
  hintIcon.className = 'plot-hint'; hintIcon.innerHTML = ICON_OPEN; hintIcon.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn small plot-open'; btn.title = 'Apri il grafico (G)';
  btn.innerHTML = `${ICON_OPEN}<span>Grafico</span>`;
  wrap.append(hintIcon, btn);

  const W0 = canvas.width, H0 = canvas.height;
  let box = null, scrim = null, area = null, moved = [];

  function fit() {
    if (!box) return;
    const w = Math.max(240, area.clientWidth), h = Math.max(160, area.clientHeight);
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    redraw();
  }
  function open() {
    if (box) return;
    scrim = document.createElement('div'); scrim.id = 'plot-scrim';
    box = document.createElement('section');
    box.id = 'plot-full';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', title);
    box.innerHTML = `<header><b>${title}</b><div class="tools"></div><button type="button" class="close" title="Chiudi (Esc)" aria-label="Chiudi il grafico">${ICON_CLOSE}</button></header><div class="area"></div>`;
    document.body.append(scrim, box);
    area = box.querySelector('.area');
    area.appendChild(canvas);
    canvas.title = '';
    const host = box.querySelector('.tools');
    moved = tools.filter(Boolean).map((el) => { const mark = document.createComment('controllo del grafico'); el.before(mark); host.appendChild(el); return [mark, el]; });
    box.querySelector('.close').addEventListener('click', close);
    scrim.addEventListener('click', close);
    window.addEventListener('resize', fit);
    fit();
  }
  function close() {
    if (!box) return;
    window.removeEventListener('resize', fit);
    for (const [mark, el] of moved) mark.replaceWith(el);
    moved = [];
    wrap.insertBefore(canvas, hintIcon);
    canvas.width = W0; canvas.height = H0;
    canvas.title = 'Clic per aprire il grafico in grande (G)';
    box.remove(); scrim.remove();
    box = scrim = area = null;
    redraw();
  }
  canvas.addEventListener('click', () => { if (!box) open(); });
  btn.addEventListener('click', open);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'g') { if (box) close(); else open(); } else if (k === 'escape' && box) close();
  });
  return { open, close, isOpen: () => !!box };
}
