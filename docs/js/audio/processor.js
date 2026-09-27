// Codigo de los AudioWorklets. Se carga via Blob para funcionar
// con cualquier servidor estatico. ASCII a proposito.

export const SYNTH_PROCESSOR_NAME = 'visual-synth';
export const RECORDER_PROCESSOR_NAME = 'master-recorder';

export const WORKLET_CODE = `
function mod(x, m) { return ((x % m) + m) % m; }

// Correccion PolyBLEP para reducir aliasing en sierra y cuadrada.
function polyBlep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

class VisualSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pixelData = null;
    this.width = 1;
    this.height = 1;
    this.playhead = 0;
    this.params = {
      speed: 0.1, volume: 0.5, pan: 0,
      fmin: 80, fmax: 12000, density: 5, bass: 2,
      reverse: false, paused: false
    };
    this.freqs = [];
    this.incs = new Float32Array(0);     // incremento de fase por muestra (ciclos)
    this.eqGains = new Float32Array(0);  // EQ + realce de graves precomputado
    this.phases = new Float32Array(0);   // fase por fila en ciclos [0..1)
    this.amps = null;                    // amplitudes RGB por fila, por bloque
    this.activeRows = [];
    this.ampsDirty = true;
    this.lastAmpPlayhead = -1;
    this.blockCount = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    if (msg.type === 'pixels') {
      this.pixelData = new Float32Array(msg.pixels);
      this.width = msg.width;
      this.height = msg.height;
      this.playhead = mod(this.playhead, this.width);
      this.ampsDirty = true;
      this.updateFreqs();
    } else if (msg.type === 'params') {
      const p = this.params;
      const d = msg.data;
      const needsFreqs =
        (d.fmin !== undefined && d.fmin !== p.fmin) ||
        (d.fmax !== undefined && d.fmax !== p.fmax) ||
        (d.density !== undefined && d.density !== p.density) ||
        (d.bass !== undefined && d.bass !== p.bass);
      Object.assign(p, d);
      if (needsFreqs) this.updateFreqs();
    } else if (msg.type === 'reset') {
      const pos = typeof msg.value === 'number' ? msg.value : 0;
      this.playhead = mod(pos, this.width);
      this.phases.fill(0);
      this.ampsDirty = true;
      this.lastAmpPlayhead = -1;
    }
  }

  equalize(freq) {
    if (freq < 20) return 0;
    const logf = Math.log10(freq);
    const boost = 1 + 2 * Math.exp(-Math.pow(logf - 3, 2) / 2);
    const lowBoost = freq < 200 ? 200 / freq : 1;
    const highBoost = freq > 8000 ? freq / 8000 : 1;
    return boost * lowBoost * highBoost;
  }

  updateFreqs() {
    const p = this.params;
    const fmax = Math.max(p.fmax, p.fmin + 1);
    const rows = [];
    for (let y = 0; y < this.height; y += p.density) {
      const normY = this.height > 1 ? y / (this.height - 1) : 0;
      rows.push(fmax * Math.pow(p.fmin / fmax, normY));
    }
    this.freqs = rows;
    this.incs = new Float32Array(rows.length);
    this.eqGains = new Float32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      this.incs[i] = Math.min(rows[i] / sampleRate, 0.49);
      const bassGain = rows[i] < 150 ? p.bass : 1;
      this.eqGains[i] = this.equalize(rows[i]) * bassGain;
    }
    // Conserva las fases si la cantidad de filas no cambio (evita clicks)
    if (this.phases.length !== rows.length) {
      this.phases = new Float32Array(rows.length);
    }
    this.ampsDirty = true;
  }

  // Lee una vez por bloque: el playhead avanza menos de 0.1 px por bloque,
  // por lo que no hace falta interpolar por muestra.
  computeBlockAmps() {
    const n = this.freqs.length;
    if (!this.amps || this.amps.length !== n * 3) {
      this.amps = new Float32Array(n * 3);
    }
    this.activeRows.length = 0;
    const data = this.pixelData;
    const w = this.width;
    const density = this.params.density;
    const ph = this.playhead;
    let x0 = Math.floor(ph);
    const frac = ph - x0;
    x0 = mod(x0, w);
    const x1 = mod(x0 + 1, w);
    const inv = 1 - frac;
    for (let fy = 0; fy < n; fy++) {
      const base = fy * density * w;
      const i0 = (base + x0) * 3;
      const i1 = (base + x1) * 3;
      const r = inv * data[i0] + frac * data[i1];
      const g = inv * data[i0 + 1] + frac * data[i1 + 1];
      const b = inv * data[i0 + 2] + frac * data[i1 + 2];
      const off = fy * 3;
      this.amps[off] = r;
      this.amps[off + 1] = g;
      this.amps[off + 2] = b;
      if (r + g + b >= 0.03) this.activeRows.push(fy);
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : outL;
    const bs = outL.length;

    this.blockCount++;
    const sendStatus = this.blockCount % 12 === 0; // ~30 mensajes/s

    if (!this.pixelData || this.params.paused) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      if (sendStatus) this.port.postMessage({ type: 'playhead', value: this.playhead, peak: 0 });
      return true;
    }

    if (this.ampsDirty || this.playhead !== this.lastAmpPlayhead) {
      this.computeBlockAmps();
      this.lastAmpPlayhead = this.playhead;
      this.ampsDirty = false;
    }

    const p = this.params;
    const speed = p.speed * (p.reverse ? -1 : 1);
    const vol = p.volume * 0.25;
    const panL = Math.cos((p.pan + 1) * Math.PI / 4);
    const panR = Math.sin((p.pan + 1) * Math.PI / 4);
    const amps = this.amps;
    const active = this.activeRows;
    const incs = this.incs;
    const eqs = this.eqGains;
    const phases = this.phases;
    let peak = 0;

    for (let i = 0; i < bs; i++) {
      let sample = 0;
      for (let k = 0; k < active.length; k++) {
        const fy = active[k];
        const t = phases[fy];
        const dt = incs[fy];
        const off = fy * 3;
        const eq = eqs[fy];
        const r = amps[off];
        if (r > 0.01) sample += r * (2 * t - 1 - polyBlep(t, dt)) * eq;
        const g = amps[off + 1];
        if (g > 0.01) {
          let v = t < 0.5 ? 1 : -1;
          v += polyBlep(t, dt);
          const t2 = t + 0.5 < 1 ? t + 0.5 : t - 0.5;
          v -= polyBlep(t2, dt);
          sample += g * v * eq;
        }
        const b = amps[off + 2];
        if (b > 0.01) sample += b * (t < 0.5 ? 4 * t - 1 : 3 - 4 * t) * eq;
        let next = t + dt;
        if (next >= 1) next -= 1;
        phases[fy] = next;
      }
      const v = Math.tanh(sample * 1.5) * vol;
      const av = v < 0 ? -v : v;
      if (av > peak) peak = av;
      outL[i] = v * panL;
      if (outR !== outL) outR[i] = v * panR;
    }

    this.playhead = mod(this.playhead + speed * bs / sampleRate, this.width);
    if (sendStatus) this.port.postMessage({ type: 'playhead', value: this.playhead, peak });
    return true;
  }
}

class MasterRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.bufL = null;
    this.bufR = null;
    this.filled = 0;
    this.flushSize = 16384; // multiplo de 128
    this.meterPeak = 0;
    this.blockCount = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'start') {
        this.recording = true;
      } else if (d.type === 'stop') {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: 'done' });
      }
    };
  }

  flush() {
    if (this.filled > 0 && this.bufL) {
      const l = this.bufL.slice(0, this.filled);
      const r = this.bufR.slice(0, this.filled);
      this.port.postMessage({ type: 'data', l: l.buffer, r: r.buffer }, [l.buffer, r.buffer]);
    }
    this.bufL = null;
    this.bufR = null;
    this.filled = 0;
  }

  process(inputs, outputs) {
    const inp = inputs[0];
    const outp = outputs[0];
    if (!inp || !inp[0] || !outp || !outp[0]) return true;
    const inL = inp[0];
    const inR = inp.length > 1 && inp[1] ? inp[1] : inL;
    const outL = outp[0];
    const outR = outp.length > 1 ? outp[1] : outL;
    outL.set(inL);
    if (outR !== outL) outR.set(inR);
    const bs = inL.length;

    for (let i = 0; i < bs; i++) {
      const a = Math.abs(inL[i]);
      if (a > this.meterPeak) this.meterPeak = a;
      const b = Math.abs(inR[i]);
      if (b > this.meterPeak) this.meterPeak = b;
    }

    if (this.recording) {
      if (!this.bufL) {
        this.bufL = new Float32Array(this.flushSize);
        this.bufR = new Float32Array(this.flushSize);
        this.filled = 0;
      }
      this.bufL.set(inL, this.filled);
      this.bufR.set(inR, this.filled);
      this.filled += bs;
      if (this.filled >= this.flushSize) this.flush();
    }

    this.blockCount++;
    if (this.blockCount % 12 === 0) {
      this.port.postMessage({ type: 'meter', peak: this.meterPeak });
      this.meterPeak = 0;
    }
    return true;
  }
}

registerProcessor('visual-synth', VisualSynthProcessor);
registerProcessor('master-recorder', MasterRecorderProcessor);
`;
