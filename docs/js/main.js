// Punto de entrada: inicializacion de la UI y atajos de teclado.

import { initToolbar, toggleGlobalPause, toggleEraser } from './ui/toolbar.js';
import { initHelpPanel, toggleHelp, closeHelp } from './ui/help-panel.js';
import { state, onActiveTrackChange } from './core/state.js';
import { project } from './core/project.js';

initToolbar();
initHelpPanel();

// Resalta la pista activa (la que recibe undo/redo).
onActiveTrackChange((track) => {
  for (const t of project.tracks) t.view.setActive(t === track);
});

// Evita que Espacio re-active el ultimo boton clickeado.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && e.detail > 0) btn.blur();
});

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
    if (typing) return;
    e.preventDefault();
    if (!state.activeTrack) return;
    if (e.shiftKey) state.activeTrack.redo();
    else state.activeTrack.undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    if (typing) return;
    e.preventDefault();
    if (state.activeTrack) state.activeTrack.redo();
    return;
  }
  if (typing) return;

  if (e.code === 'Space') {
    e.preventDefault();
    toggleGlobalPause();
  } else if (e.key === 'e' || e.key === 'E') {
    toggleEraser();
  } else if (e.key === '?' || e.key === 'F1') {
    e.preventDefault();
    toggleHelp();
  } else if (e.key === 'Escape') {
    closeHelp();
  }
});
