// Barra superior: creacion de pistas, pincel, transporte, sync, REC y proyecto.

import { state } from '../core/state.js';
import { engine } from '../audio/engine.js';
import { project } from '../core/project.js';
import { CONFIG } from '../config.js';
import { toggleHelp } from './help-panel.js';

const $ = (id) => document.getElementById(id);

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function toggleEraser(force) {
  state.brushErase = force === undefined ? !state.brushErase : force;
  $('brush-eraser').classList.toggle('active', state.brushErase);
}

export function syncGlobalPauseButton() {
  const btn = $('global-play');
  btn.textContent = state.globalPaused ? 'PLAY' : 'PAUSA';
  btn.classList.toggle('active', state.globalPaused);
}

export function toggleGlobalPause() {
  project.setGlobalPaused(!state.globalPaused);
  // Con SYNC activo, reanudar la pausa global realinea todo en x=0.
  if (!state.globalPaused && state.phaseSync) project.resetAll();
  syncGlobalPauseButton();
}

export function toggleSync(force) {
  state.phaseSync = force === undefined ? !state.phaseSync : force;
  $('sync-toggle').classList.toggle('active', state.phaseSync);
  if (state.phaseSync) project.resetAll();
}

export function initToolbar() {
  const sizeInput = $('size-input');
  const brushColor = $('brush-color');
  const brushSize = $('brush-size');
  const brushSizeValue = $('brush-size-value');
  const zoomSelect = $('zoom-select');
  const globalSpeed = $('global-speed');
  const globalSpeedValue = $('global-speed-value');
  const masterVol = $('master-vol');
  const recBtn = $('rec-btn');
  const recTime = $('rec-time');
  const vuFill = $('vu-fill');

  // --- pincel ---
  brushColor.addEventListener('input', (e) => { state.brushColor = e.target.value; });
  brushSize.addEventListener('input', (e) => {
    state.brushSize = +e.target.value;
    brushSizeValue.textContent = e.target.value;
  });
  $('brush-eraser').addEventListener('click', () => toggleEraser());

  // --- zoom ---
  zoomSelect.value = String(state.zoom);
  zoomSelect.addEventListener('change', () => {
    state.zoom = +zoomSelect.value;
    project.tracks.forEach((t) => t.view.applyZoom(state.zoom));
  });

  // --- crear pistas ---
  const parseSize = () => {
    const parts = sizeInput.value.split('x').map((v) => parseInt(v, 10));
    const w = parts[0];
    const h = parts[1];
    if (!w || !h || w < CONFIG.MIN_WIDTH || h < CONFIG.MIN_HEIGHT ||
        w > CONFIG.MAX_WIDTH || h > CONFIG.MAX_HEIGHT) return null;
    return [w, h];
  };

  $('create-track').addEventListener('click', async () => {
    const size = parseSize();
    if (!size) {
      return alert('Tamaño inválido. Usa ANCHOxALTO entre ' +
        CONFIG.MIN_WIDTH + 'x' + CONFIG.MIN_HEIGHT + ' y ' +
        CONFIG.MAX_WIDTH + 'x' + CONFIG.MAX_HEIGHT + '.');
    }
    try {
      await project.addTrack({ width: size[0], height: size[1] });
    } catch (err) {
      alert('No se pudo crear la pista: ' + err.message);
    }
  });

  $('create-from-image').addEventListener('click', () => $('image-upload').click());
  $('image-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const size = parseSize() || [128, 128];
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        await project.addTrack({ width: size[0], height: size[1], image: img });
      } catch (err) {
        alert('No se pudo crear la pista: ' + err.message);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('No se pudo leer la imagen.');
    };
    img.src = url;
  });

  // --- transporte global y sincronizacion ---
  $('global-play').addEventListener('click', () => toggleGlobalPause());
  $('global-restart').addEventListener('click', () => project.resetAll());
  $('sync-toggle').addEventListener('click', () => toggleSync());
  $('sync-toggle').classList.toggle('active', state.phaseSync);
  globalSpeed.addEventListener('input', (e) => {
    const v = +e.target.value;
    globalSpeedValue.textContent = v.toFixed(2) + 'x';
    project.setSpeedMult(v);
  });
  masterVol.addEventListener('input', (e) => {
    state.masterVolume = +e.target.value;
    engine.setMasterVolume(state.masterVolume);
  });

  // --- REC ---
  recBtn.addEventListener('click', async () => {
    try {
      await engine.init();
    } catch (err) {
      return alert('Audio no disponible: ' + err.message);
    }
    if (!engine.recording) {
      engine.onRecTick = (secs) => { recTime.textContent = formatTime(secs); };
      engine.startRecording();
      recBtn.classList.add('recording');
      recBtn.textContent = 'STOP';
    } else {
      engine.stopRecording();
      recBtn.classList.remove('recording');
      recBtn.textContent = 'REC';
      recTime.textContent = '00:00';
    }
  });

  engine.onMasterMeter = (peak) => {
    vuFill.style.transform = 'scaleX(' + Math.min(1, peak).toFixed(3) + ')';
  };

  // --- proyecto ---
  $('save-project').addEventListener('click', () => {
    if (!project.tracks.length) return alert('No hay pistas para guardar.');
    const data = project.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'visual-synth_proyecto.json');
  });

  $('load-project').addEventListener('click', () => $('load-input').click());
  $('load-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (project.tracks.length && !confirm('Cargar un proyecto reemplaza las pistas actuales. Continuar?')) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      return alert('Archivo JSON inválido.');
    }
    try {
      await project.restore(data);
    } catch (err) {
      return alert(err.message);
    }
    applySettings(data.settings);
  });

  $('clear-all').addEventListener('click', () => {
    if (!project.tracks.length) return;
    if (confirm('Limpiar todos los lienzos?')) project.clearAllCanvases();
  });

  $('help-btn').addEventListener('click', () => toggleHelp());

  function applySettings(s) {
    if (!s) return;
    if (s.zoom) {
      zoomSelect.value = String(s.zoom);
      zoomSelect.dispatchEvent(new Event('change'));
    }
    if (typeof s.speedMult === 'number') {
      globalSpeed.value = s.speedMult;
      globalSpeed.dispatchEvent(new Event('input'));
    }
    if (typeof s.masterVolume === 'number') {
      masterVol.value = s.masterVolume;
      masterVol.dispatchEvent(new Event('input'));
    }
    if (s.brushColor) {
      brushColor.value = s.brushColor;
      state.brushColor = s.brushColor;
    }
    if (s.brushSize) {
      brushSize.value = s.brushSize;
      state.brushSize = s.brushSize;
      brushSizeValue.textContent = s.brushSize;
    }
    if (typeof s.phaseSync === 'boolean') toggleSync(s.phaseSync);
  }

  syncGlobalPauseButton();
  project.refreshEmptyHint();
}
