// Codifica pares de canales Float32 a WAV PCM 16-bit.

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function encodeWavBlob(chunksL, chunksR, sampleRate) {
  let total = 0;
  for (const c of chunksL) total += c.length;

  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = total * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let c = 0; c < chunksL.length; c++) {
    const l = chunksL[c];
    const r = chunksR[c];
    for (let i = 0; i < l.length; i++) {
      let sl = l[i];
      let sr = r[i];
      sl = sl < -1 ? -1 : (sl > 1 ? 1 : sl);
      sr = sr < -1 ? -1 : (sr > 1 ? 1 : sr);
      view.setInt16(offset, sl * 32767, true); offset += 2;
      view.setInt16(offset, sr * 32767, true); offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
