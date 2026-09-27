// Coleccion de pistas, mezcla (mute/solo), reinicio global y persistencia.

import { engine } from '../audio/engine.js';
import { Track } from './track.js';
import { state } from './state.js';
import { CONFIG } from '../config.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagen inválida'));
    img.src = src;
  });
}

class Project {
  constructor() {
    this.tracks = [];
  }

  async addTrack({ width, height, params = null, fx = null, image = null }) {
    if (this.tracks.length >= CONFIG.MAX_TRACKS) {
      alert('Maximo ' + CONFIG.MAX_TRACKS + ' pistas simultaneas.');
      return null;
    }
    await engine.init();
    const track = new Track({ width, height });
    this.tracks.push(track);
    track.onMixChanged = () => this.updateMixGains();
    track.onDelete = () => {
      if (confirm('Eliminar la pista ' + track.id + '?')) this.removeTrack(track);
    };
    document.getElementById('tracks-container').appendChild(track.view.root);

    const ctx = track.view.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    if (image) ctx.drawImage(image, 0, 0, width, height);

    if (params) Object.assign(track.params, params);
    if (fx) Object.assign(track.fx, fx);
    track.view.syncInputsFromParams();
    track.applyFx();
    track.view.applyZoom(state.zoom);
    track.view.drawRuler();
    track.sendParams();
    track.updatePixels();

    // Con SYNC activo, crear una pista realinea todo en x=0.
    if (state.phaseSync) this.resetAll();

    this.refreshEmptyHint();
    return track;
  }

  removeTrack(track) {
    const i = this.tracks.indexOf(track);
    if (i > -1) this.tracks.splice(i, 1);
    if (state.activeTrack === track) state.activeTrack = null;
    track.destroy();
    this.updateMixGains();
    this.refreshEmptyHint();
  }

  clearAllCanvases() {
    this.tracks.forEach((t) => t.clearCanvas());
  }

  resetAll() {
    for (const t of this.tracks) t.resetPhase(0);
  }

  updateMixGains() {
    if (!engine.ctx) return;
    const anySolo = this.tracks.some((t) => t.solo);
    const now = engine.ctx.currentTime;
    for (const t of this.tracks) {
      const audible = !t.muted && (!anySolo || t.solo);
      t.gain.gain.setTargetAtTime(audible ? 1 : 0, now, 0.01);
    }
  }

  setGlobalPaused(paused) {
    state.globalPaused = paused;
    for (const t of this.tracks) t.sendParams();
  }

  setSpeedMult(mult) {
    state.speedMult = mult;
    for (const t of this.tracks) t.sendParams();
  }

  serialize() {
    return {
      app: 'visual-synth',
      version: 2,
      savedAt: new Date().toISOString(),
      settings: {
        zoom: state.zoom,
        speedMult: state.speedMult,
        masterVolume: state.masterVolume,
        brushColor: state.brushColor,
        brushSize: state.brushSize,
        phaseSync: state.phaseSync,
      },
      tracks: this.tracks.map((t) => ({
        width: t.width,
        height: t.height,
        params: Object.assign({}, t.params),
        fx: Object.assign({}, t.fx),
        flags: { muted: t.muted, solo: t.solo },
        png: t.view.canvas.toDataURL('image/png'),
      })),
    };
  }

  async restore(data) {
    if (!data || data.app !== 'visual-synth' || !Array.isArray(data.tracks)) {
      throw new Error('El archivo no es un proyecto de DibujarSonar.');
    }
    await engine.init();
    [...this.tracks].forEach((t) => this.removeTrack(t));
    for (const td of data.tracks.slice(0, CONFIG.MAX_TRACKS)) {
      const w = td.width | 0;
      const h = td.height | 0;
      if (w < 8 || h < 8 || w > 1024 || h > 1024) continue;
      let img = null;
      if (td.png) img = await loadImage(td.png).catch(() => null);
      const track = await this.addTrack({
        width: w,
        height: h,
        params: td.params || null,
        fx: td.fx || null,
        image: img,
      });
      if (track && td.flags) {
        track.muted = !!td.flags.muted;
        track.solo = !!td.flags.solo;
        track.view.syncTransportButtons();
      }
    }
    this.updateMixGains();
  }

  refreshEmptyHint() {
    const hint = document.getElementById('empty-hint');
    if (hint) hint.style.display = this.tracks.length ? 'none' : 'block';
  }
}

export const project = new Project();
