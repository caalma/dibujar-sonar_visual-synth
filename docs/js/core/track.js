// Modelo de una pista: parametros, nodo de audio, efectos, pixeles y undo/redo.

import { engine } from '../audio/engine.js';
import { SYNTH_PROCESSOR_NAME } from '../audio/processor.js';
import { CONFIG, PARAM_DEFAULTS } from '../config.js';
import { state } from './state.js';
import { TrackView } from '../ui/track-view.js';

let trackCounter = 0;

export const FX_DEFAULTS = {
  filterType: 'off',
  cutoff: 2000,
  q: 1,
  delayTime: 0.3,
  feedback: 0.4,
  wet: 0,
};

export class Track {
  constructor({ width, height }) {
    this.id = ++trackCounter;
    this.width = width;
    this.height = height;
    this.params = Object.assign({}, PARAM_DEFAULTS);
    this.fx = Object.assign({}, FX_DEFAULTS);
    this.paused = false;
    this.frozen = false;
    this.muted = false;
    this.solo = false;
    this.onMixChanged = null;
    this.onDelete = null;

    const actx = engine.ctx;
    this.node = new AudioWorkletNode(actx, SYNTH_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Cadena: node -> filtro -> (seca + delay) -> gain (mute/solo) -> master
    this.filter = actx.createBiquadFilter();
    this.filter.type = 'allpass'; // OFF: respuesta plana
    this.filter.frequency.value = this.fx.cutoff;
    this.filter.Q.value = this.fx.q;

    this.dryGain = actx.createGain();
    this.dryGain.gain.value = 1;

    this.delay = actx.createDelay(2);
    this.delay.delayTime.value = this.fx.delayTime;
    this.fbGain = actx.createGain();
    this.fbGain.gain.value = Math.min(0.92, this.fx.feedback);
    this.wetGain = actx.createGain();
    this.wetGain.gain.value = this.fx.wet;

    this.gain = actx.createGain();

    this.node.connect(this.filter);
    this.filter.connect(this.dryGain);
    this.dryGain.connect(this.gain);
    this.filter.connect(this.delay);
    this.delay.connect(this.fbGain);
    this.fbGain.connect(this.delay);
    this.delay.connect(this.wetGain);
    this.wetGain.connect(this.gain);
    this.gain.connect(engine.masterBus);

    this.updateTimeout = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];

    this.view = new TrackView(this);

    this.node.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'playhead') this.view.onPlayhead(d.value, d.peak);
    };
  }

  setParam(name, value) {
    if (name === 'fmin') value = Math.max(20, Math.min(value, this.params.fmax - 10));
    if (name === 'fmax') value = Math.min(16000, Math.max(value, this.params.fmin + 10));
    if (name === 'density') value = Math.max(1, Math.min(10, Math.round(value)));
    this.params[name] = value;
    this.view.setInputValue(name, value);
    if (name === 'fmin' || name === 'fmax') this.view.drawRuler();
    this.sendParams();
  }

  setFx(name, value) {
    this.fx[name] = value;
    const now = engine.ctx.currentTime;
    if (name === 'filterType') {
      this.filter.type = value === 'off' ? 'allpass' : value;
    } else if (name === 'cutoff') {
      this.filter.frequency.setTargetAtTime(value, now, 0.02);
    } else if (name === 'q') {
      this.filter.Q.setTargetAtTime(value, now, 0.02);
    } else if (name === 'delayTime') {
      this.delay.delayTime.setTargetAtTime(value, now, 0.05);
    } else if (name === 'feedback') {
      this.fbGain.gain.setTargetAtTime(Math.min(0.92, value), now, 0.02);
    } else if (name === 'wet') {
      this.wetGain.gain.setTargetAtTime(value, now, 0.02);
    }
  }

  applyFx() {
    const now = engine.ctx.currentTime;
    this.filter.type = this.fx.filterType === 'off' ? 'allpass' : this.fx.filterType;
    this.filter.frequency.setValueAtTime(this.fx.cutoff, now);
    this.filter.Q.setValueAtTime(this.fx.q, now);
    this.delay.delayTime.setValueAtTime(this.fx.delayTime, now);
    this.fbGain.gain.setValueAtTime(Math.min(0.92, this.fx.feedback), now);
    this.wetGain.gain.setValueAtTime(this.fx.wet, now);
  }

  resetPhase(position) {
    this.node.port.postMessage({ type: 'reset', value: position || 0 });
  }

  sendParams() {
    this.node.port.postMessage({
      type: 'params',
      data: {
        speed: this.frozen ? 0 : this.params.speed * state.speedMult,
        volume: this.params.volume,
        pan: this.params.pan,
        fmin: this.params.fmin,
        fmax: this.params.fmax,
        density: this.params.density,
        bass: this.params.bass,
        reverse: this.params.reverse,
        paused: this.paused || state.globalPaused,
      },
    });
  }

  updatePixels() {
    clearTimeout(this.updateTimeout);
    this.updateTimeout = null;
    const data = this.view.ctx.getImageData(0, 0, this.width, this.height).data;
    const out = new Float32Array(this.width * this.height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      out[j] = data[i] / 255;
      out[j + 1] = data[i + 1] / 255;
      out[j + 2] = data[i + 2] / 255;
    }
    this.node.port.postMessage(
      { type: 'pixels', pixels: out.buffer, width: this.width, height: this.height },
      [out.buffer]
    );
    this.dirty = false;
  }

  schedulePixelUpdate() {
    this.dirty = true;
    clearTimeout(this.updateTimeout);
    this.updateTimeout = setTimeout(() => this.updatePixels(), CONFIG.PIXEL_DEBOUNCE_MS);
  }

  pushUndo() {
    const snap = this.view.ctx.getImageData(0, 0, this.width, this.height);
    this.undoStack.push(snap);
    if (this.undoStack.length > CONFIG.UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    if (!this.undoStack.length) return;
    const ctx = this.view.ctx;
    this.redoStack.push(ctx.getImageData(0, 0, this.width, this.height));
    ctx.putImageData(this.undoStack.pop(), 0, 0);
    this.updatePixels();
  }

  redo() {
    if (!this.redoStack.length) return;
    const ctx = this.view.ctx;
    this.undoStack.push(ctx.getImageData(0, 0, this.width, this.height));
    ctx.putImageData(this.redoStack.pop(), 0, 0);
    this.updatePixels();
  }

  clearCanvas(pushHistory) {
    if (pushHistory !== false) this.pushUndo();
    const ctx = this.view.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);
    this.updatePixels();
  }

  randomize() {
    this.pushUndo();
    const ctx = this.view.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);
    for (let i = 0; i < 120; i++) {
      const r = (Math.random() * 255) | 0;
      const g = (Math.random() * 255) | 0;
      const b = (Math.random() * 255) | 0;
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      const s = Math.random() * 30 + 10;
      ctx.fillRect(Math.random() * (this.width - s), Math.random() * (this.height - s), s, s);
    }
    this.updatePixels();
  }

  exportPng() {
    this.view.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'visual-synth_track-' + this.id + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  }

  togglePause() {
    this.paused = !this.paused;
    this.sendParams();
    this.view.syncTransportButtons();
  }

  toggleFreeze() {
    this.frozen = !this.frozen;
    this.sendParams();
    this.view.syncTransportButtons();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.onMixChanged) this.onMixChanged();
    this.view.syncTransportButtons();
  }

  toggleSolo() {
    this.solo = !this.solo;
    if (this.onMixChanged) this.onMixChanged();
    this.view.syncTransportButtons();
  }

  destroy() {
    clearTimeout(this.updateTimeout);
    try { this.node.port.close(); } catch (err) { /* nodo ya cerrado */ }
    const nodes = [this.node, this.filter, this.delay, this.fbGain, this.wetGain, this.dryGain, this.gain];
    for (const n of nodes) {
      try { n.disconnect(); } catch (err) { /* nada */ }
    }
    this.view.remove();
  }
}
