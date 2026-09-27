// Dibujo sobre el lienzo: pincel, goma, captura de puntero y undo.

import { state, setActiveTrack } from '../core/state.js';
import { engine } from '../audio/engine.js';


export function attachDrawing(track, view) {
  const canvas = view.canvas;
  const ctx = view.ctx;
  let drawing = false;
  let erasing = false;
  let last = null;

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (track.width / r.width),
      y: (e.clientY - r.top) * (track.height / r.height),
    };
  };

  const paint = (from, to, erase) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, state.brushSize);
    ctx.strokeStyle = erase ? '#000000' : state.brushColor;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.001, to.y + 0.001);
    ctx.stroke();
    ctx.restore();
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sigue sin captura */ }
    drawing = true;
    erasing = state.brushErase || e.button === 2;
    setActiveTrack(track);
    track.pushUndo();
    const p = toCanvas(e);
    last = p;
    paint(p, p, erasing);
    track.schedulePixelUpdate();
    if (engine.ctx && engine.ctx.state === 'suspended') {
      await engine.ctx.resume().catch(() => {});
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    view.showCursorInfo(p);
    if (!drawing) return;
    paint(last, p, erasing);
    last = p;
    track.schedulePixelUpdate();
  });

  const endStroke = (e) => {
    if (!drawing) return;
    drawing = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* nada */ }
    if (track.dirty) track.updatePixels();
  };

  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => {
    if (!drawing) view.showCursorInfo(null);
  });
}
