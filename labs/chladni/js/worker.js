// worker.js — calcola i modi della lamina in un thread a parte (qualche decimo di secondo), senza bloccare la scena.
import { solveModes, packModes } from './plate.js';

self.onmessage = (e) => {
  const { id, shapeId, nu, clamp } = e.data;
  try {
    const t = performance.now();
    const pack = packModes(solveModes(shapeId, nu, { clamp, keep: 0.34 }));
    pack.ms = performance.now() - t;
    self.postMessage({ id, pack }, [pack.lam.buffer, pack.coef.buffer, pack.peak.buffer, pack.mn.buffer, pack.cls.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
