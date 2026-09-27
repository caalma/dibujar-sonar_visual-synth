// Motor de audio: un unico AudioContext compartido por todas las pistas,
// bus master con volumen general y grabador WAV.

import { WORKLET_CODE, RECORDER_PROCESSOR_NAME } from './processor.js';
import { encodeWavBlob } from './wav-encoder.js';
import { CONFIG } from '../config.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.masterFader = null;
    this.recorderNode = null;
    this.ready = false;
    this.recording = false;
    this.recChunksL = [];
    this.recChunksR = [];
    this.recStartTime = 0;
    this._collecting = false;
    this._masterVol = 0.8;
    this._recTimer = null;
    this.onMasterMeter = null;
    this.onRecTick = null;
  }

  async init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
      return this;
    }
    this.ctx = new AudioContext();
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    this.masterBus = this.ctx.createGain();
    this.masterFader = this.ctx.createGain();
    this.masterFader.gain.value = this._masterVol;
    this.recorderNode = new AudioWorkletNode(this.ctx, RECORDER_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Cadena: pistas -> masterBus -> masterFader -> recorder -> salida.
    // El recorder es pasivo: deja pasar el audio y opcionalmente lo captura.
    this.masterBus.connect(this.masterFader);
    this.masterFader.connect(this.recorderNode);
    this.recorderNode.connect(this.ctx.destination);

    this.recorderNode.port.onmessage = (e) => this._onRecorderMessage(e.data);

    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    this.ready = true;
    return this;
  }

  latencySeconds() {
    if (!this.ctx) return 0;
    return (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
  }

  setMasterVolume(v) {
    this._masterVol = v;
    if (this.masterFader) this.masterFader.gain.value = v;
  }

  startRecording() {
    if (!this.ready || this.recording) return;
    this.recording = true;
    this._collecting = true;
    this.recChunksL = [];
    this.recChunksR = [];
    this.recStartTime = this.ctx.currentTime;
    this.recorderNode.port.postMessage({ type: 'start' });
    this._recTimer = setInterval(() => {
      const secs = this.ctx.currentTime - this.recStartTime;
      if (this.onRecTick) this.onRecTick(secs);
      if (secs >= CONFIG.REC_MAX_SECONDS) this.stopRecording();
    }, 250);
  }

  stopRecording() {
    if (!this.recording) return;
    this.recording = false;
    clearInterval(this._recTimer);
    this._recTimer = null;
    this.recorderNode.port.postMessage({ type: 'stop' });
  }

  _onRecorderMessage(d) {
    if (d.type === 'meter') {
      if (this.onMasterMeter) this.onMasterMeter(d.peak);
    } else if (d.type === 'data') {
      if (this._collecting) {
        this.recChunksL.push(new Float32Array(d.l));
        this.recChunksR.push(new Float32Array(d.r));
      }
    } else if (d.type === 'done') {
      this._downloadWav();
    }
  }

  _downloadWav() {
    this._collecting = false;
    const blob = encodeWavBlob(this.recChunksL, this.recChunksR, this.ctx.sampleRate);
    this.recChunksL = [];
    this.recChunksR = [];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = 'visual-synth_' + now.getFullYear() + '-' + pad(now.getMonth() + 1) +
      '-' + pad(now.getDate()) + '_' + pad(now.getHours()) + '-' +
      pad(now.getMinutes()) + '-' + pad(now.getSeconds()) + '.wav';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export const engine = new AudioEngine();
