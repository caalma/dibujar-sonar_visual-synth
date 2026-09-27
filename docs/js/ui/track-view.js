// Vista de una pista: lienzo, regla de frecuencias, playhead, controles y FX.

import { state } from '../core/state.js';
import { engine } from '../audio/engine.js';
import { attachDrawing } from './drawing.js';

const RULER_W = 46;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function shortFreq(f) {
  if (f >= 1000) return Math.round(f / 100) / 10 + 'k';
  return String(Math.round(f));
}

// Mapeo logaritmico del slider de corte: 20 Hz .. 16 kHz
function hzToRaw(hz) {
  return Math.log(Math.max(20, Math.min(16000, hz)) / 20) / Math.log(800);
}
function rawToHz(raw) {
  return 20 * Math.pow(800, raw);
}
function hzText(hz) {
  return hz >= 1000 ? (hz / 1000).toFixed(2) + ' kHz' : Math.round(hz) + ' Hz';
}

export class TrackView {
  constructor(track) {
    this.track = track;
    this.inputs = {};
    this.valueSpans = {};
    this.root = el('div', 'track');
    this._buildCanvasZone();
    this._buildControls();
    attachDrawing(track, this);
    this.syncTransportButtons();
  }

  _buildCanvasZone() {
    const zone = el('div', 'canvas-zone');
    this.rulerEl = el('canvas', 'freq-ruler');
    const container = el('div', 'canvas-container');
    this.canvas = el('canvas', 'main-canvas');
    this.canvas.width = this.track.width;
    this.canvas.height = this.track.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.playheadEl = el('div', 'playhead-line');
    container.append(this.canvas, this.playheadEl);
    zone.append(this.rulerEl, container);
    this.root.appendChild(zone);
  }

  _slider(param, label, min, max, step, decimals, title) {
    const wrap = el('label', 'ctl');
    wrap.title = title || label;
    const name = el('span', 'ctl-name', label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    const val = el('span', 'ctl-val');
    wrap.append(name, input, val);
    this.inputs[param] = input;
    this.valueSpans[param] = { span: val, decimals };
    input.addEventListener('input', () => {
      this.track.setParam(param, parseFloat(input.value));
      val.textContent = Number(input.value).toFixed(decimals);
    });
    return wrap;
  }

  _number(param, label, min, max, title) {
    const wrap = el('label', 'ctl');
    wrap.title = title || label;
    const name = el('span', 'ctl-name', label);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = min; input.max = max;
    wrap.append(name, input);
    this.inputs[param] = input;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) this.track.setParam(param, v);
    });
    return wrap;
  }

  _checkbox(param, label, title) {
    const wrap = el('label', 'ctl');
    wrap.title = title || label;
    const name = el('span', 'ctl-name', label);
    const input = document.createElement('input');
    input.type = 'checkbox';
    wrap.append(name, input);
    this.inputs[param] = input;
    input.addEventListener('input', () => {
      this.track.setParam(param, input.checked);
    });
    return wrap;
  }

  _button(text, className, title, onclick) {
    const b = el('button', 'tbtn ' + className, text);
    b.title = title;
    b.addEventListener('click', onclick);
    return b;
  }

  _fxControl(label, min, max, step, title) {
    const wrap = el('label', 'ctl');
    wrap.title = title || label;
    const name = el('span', 'ctl-name', label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    const val = el('span', 'ctl-val');
    wrap.append(name, input, val);
    return { wrap, input, val };
  }

  _buildFxRow() {
    const track = this.track;
    const row = el('div', 'ctl-row fx-row');

    row.appendChild(el('span', 'fx-title', 'FIL'));

    this.fxType = document.createElement('select');
    const types = [['off', 'OFF'], ['lowpass', 'LP'], ['highpass', 'HP'], ['bandpass', 'BP']];
    for (const [value, text] of types) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      this.fxType.appendChild(opt);
    }
    this.fxType.title = 'Tipo de filtro';
    this.fxType.addEventListener('input', () => track.setFx('filterType', this.fxType.value));
    row.appendChild(this.fxType);

    const cut = this._fxControl('Corte', 0, 1, 0.001, 'Frecuencia de corte del filtro');
    cut.input.addEventListener('input', () => {
      const hz = rawToHz(+cut.input.value);
      track.setFx('cutoff', hz);
      cut.val.textContent = hzText(hz);
    });
    this.fxCut = cut;
    row.appendChild(cut.wrap);

    const q = this._fxControl('Q', 0.1, 20, 0.1, 'Resonancia del filtro');
    q.input.addEventListener('input', () => {
      track.setFx('q', +q.input.value);
      q.val.textContent = (+q.input.value).toFixed(1);
    });
    this.fxQ = q;
    row.appendChild(q.wrap);

    row.appendChild(el('span', 'fx-title', 'DLY'));

    const time = this._fxControl('Time', 0, 1.5, 0.01, 'Tiempo del delay');
    time.input.addEventListener('input', () => {
      track.setFx('delayTime', +time.input.value);
      time.val.textContent = (+time.input.value).toFixed(2) + 's';
    });
    this.fxTime = time;
    row.appendChild(time.wrap);

    const fb = this._fxControl('Fdbk', 0, 0.9, 0.01, 'Realimentacion del delay');
    fb.input.addEventListener('input', () => {
      track.setFx('feedback', +fb.input.value);
      fb.val.textContent = (+fb.input.value).toFixed(2);
    });
    this.fxFb = fb;
    row.appendChild(fb.wrap);

    const mix = this._fxControl('Mix', 0, 1, 0.01, 'Mezcla del delay (0 = apagado)');
    mix.input.addEventListener('input', () => {
      track.setFx('wet', +mix.input.value);
      mix.val.textContent = (+mix.input.value).toFixed(2);
    });
    this.fxMix = mix;
    row.appendChild(mix.wrap);

    return row;
  }

  _buildControls() {
    const track = this.track;
    const controls = el('div', 'track-controls');

    const row1 = el('div', 'ctl-row');
    row1.append(
      this._slider('speed', 'Vel', 0.01, 20, 0.01, 2, 'Velocidad del playhead en pixeles/segundo'),
      this._checkbox('reverse', 'Rev', 'Reproduccion inversa'),
      this._slider('volume', 'Vol', 0, 1, 0.01, 2, 'Volumen de la pista'),
      this._slider('pan', 'Pan', -1, 1, 0.1, 1, 'Paneo'),
      this._number('fmin', 'Min', 20, 16000, 'Frecuencia minima (fila inferior)'),
      this._number('fmax', 'Max', 20, 16000, 'Frecuencia maxima (fila superior)'),
      this._slider('density', 'Den', 1, 10, 1, 0, 'Densidad: cada cuantas filas hay un oscilador'),
      this._slider('bass', 'Graves', 0, 4, 0.1, 1, 'Realce de graves bajo 150 Hz'),
    );

    const row2 = el('div', 'ctl-row');
    const idSpan = el('span', 'track-id', 'PISTA ' + track.id + ' - ' + track.width + 'x' + track.height);

    this.btnPause = this._button('P', 'tbtn-pause', 'Pausa: silencia la pista', () => track.togglePause());
    this.btnFreeze = this._button('F', 'tbtn-freeze', 'Freeze: congela el playhead y mantiene el acorde sonando', () => track.toggleFreeze());
    this.btnMute = this._button('M', 'tbtn-mute', 'Mute', () => track.toggleMute());
    this.btnSolo = this._button('S', 'tbtn-solo', 'Solo', () => track.toggleSolo());
    const btnRand = this._button('R', '', 'Patron aleatorio', () => track.randomize());
    const btnClear = this._button('L', '', 'Limpiar lienzo', () => track.clearCanvas());
    const btnPng = this._button('PNG', '', 'Exportar lienzo como PNG', () => track.exportPng());
    const btnDel = this._button('X', '', 'Eliminar pista', () => { if (track.onDelete) track.onDelete(); });

    this.meterEl = el('div', 'meter');
    this.meterFill = el('div', 'meter-fill');
    this.meterEl.appendChild(this.meterFill);
    this.readoutEl = el('span', 'freq-readout');

    row2.append(
      idSpan,
      this.btnPause, this.btnFreeze, this.btnMute, this.btnSolo,
      btnRand, btnClear, btnPng, btnDel,
      this.meterEl, this.readoutEl
    );

    controls.append(row2, row1, this._buildFxRow());
    this.root.appendChild(controls);
    this.syncInputsFromParams();
  }

  syncInputsFromParams() {
    const p = this.track.params;
    for (const [param, input] of Object.entries(this.inputs)) {
      if (input.type === 'checkbox') input.checked = !!p[param];
      else input.value = p[param];
    }
    for (const [param, info] of Object.entries(this.valueSpans)) {
      info.span.textContent = Number(p[param]).toFixed(info.decimals);
    }
    this.syncFxInputs();
  }

  syncFxInputs() {
    const fx = this.track.fx;
    this.fxType.value = fx.filterType;
    this.fxCut.input.value = hzToRaw(fx.cutoff);
    this.fxCut.val.textContent = hzText(fx.cutoff);
    this.fxQ.input.value = fx.q;
    this.fxQ.val.textContent = Number(fx.q).toFixed(1);
    this.fxTime.input.value = fx.delayTime;
    this.fxTime.val.textContent = Number(fx.delayTime).toFixed(2) + 's';
    this.fxFb.input.value = fx.feedback;
    this.fxFb.val.textContent = Number(fx.feedback).toFixed(2);
    this.fxMix.input.value = fx.wet;
    this.fxMix.val.textContent = Number(fx.wet).toFixed(2);
  }

  setInputValue(param, value) {
    const input = this.inputs[param];
    if (input && input.type !== 'checkbox') input.value = value;
    const info = this.valueSpans[param];
    if (info) info.span.textContent = Number(value).toFixed(info.decimals);
  }

  syncTransportButtons() {
    this.btnPause.classList.toggle('active', this.track.paused);
    this.btnFreeze.classList.toggle('active', this.track.frozen);
    this.btnMute.classList.toggle('active', this.track.muted);
    this.btnSolo.classList.toggle('active', this.track.solo);
  }

  setActive(active) {
    this.root.classList.toggle('active', active);
  }

  applyZoom(z) {
    this.canvas.style.width = this.track.width * z + 'px';
    this.canvas.style.height = this.track.height * z + 'px';
    this.drawRuler();
  }

  drawRuler() {
    const z = state.zoom;
    const track = this.track;
    const c = this.rulerEl;
    c.width = RULER_W * z;
    c.height = track.height * z;
    c.style.width = c.width + 'px';
    c.style.height = c.height + 'px';
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#101013';
    ctx.fillRect(0, 0, c.width, c.height);
    const fmin = track.params.fmin;
    const fmax = track.params.fmax;
    if (!(fmax > fmin) || fmin <= 0) return;

    const logTotal = Math.log(fmax / fmin);
    const yFor = (f) => (Math.log(fmax / f) / logTotal) * (track.height - 1) * z + z * 0.5;
    const marks = [20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 15000];
    const fontPx = Math.max(8, Math.round(7 * z));
    ctx.font = fontPx + 'px monospace';
    ctx.textBaseline = 'middle';

    for (const f of marks) {
      if (f <= fmin || f >= fmax) continue;
      const y = Math.round(yFor(f)) + 0.5;
      const major = f === 100 || f === 1000 || f === 10000;
      ctx.strokeStyle = major ? '#5a5a64' : '#34343c';
      ctx.beginPath();
      ctx.moveTo(c.width - (major ? 22 : 12), y);
      ctx.lineTo(c.width, y);
      ctx.stroke();
      if (major || z >= 2) {
        ctx.fillStyle = '#84848e';
        ctx.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 2, y);
      }
    }
    ctx.fillStyle = '#33aaee';
    ctx.fillText(shortFreq(fmax), 2, Math.max(fontPx * 0.6, yFor(fmax)));
    ctx.fillText(shortFreq(fmin), 2, Math.min(c.height - fontPx * 0.6, yFor(fmin)));
  }

  onPlayhead(value, peak) {
    const t = this.track;
    const effSpeed = (t.paused || state.globalPaused || t.frozen) ? 0
      : t.params.speed * state.speedMult * (t.params.reverse ? -1 : 1);
    const comp = effSpeed * engine.latencySeconds();
    let pos = value - comp;
    pos = ((pos % t.width) + t.width) % t.width;
    this.playheadEl.style.transform = 'translateX(' + (pos * state.zoom).toFixed(2) + 'px)';
    const level = Math.min(1, peak / 0.25);
    this.meterFill.style.transform = 'scaleX(' + level.toFixed(3) + ')';
  }

  showCursorInfo(p) {
    if (!p) {
      this.readoutEl.textContent = '';
      return;
    }
    const t = this.track;
    const normY = Math.min(1, Math.max(0, p.y / Math.max(1, t.height - 1)));
    const freq = t.params.fmax * Math.pow(t.params.fmin / t.params.fmax, normY);
    const txt = freq >= 1000 ? (freq / 1000).toFixed(2) + ' kHz' : Math.round(freq) + ' Hz';
    this.readoutEl.textContent = txt + ' | col ' + Math.round(p.x);
  }

  remove() {
    this.root.remove();
  }
}
