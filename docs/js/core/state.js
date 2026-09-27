// Estado global compartido entre modulos (sin logica de audio ni DOM).

export const state = {
  brushColor: '#33aaee',
  brushSize: 3,
  brushErase: false,
  zoom: 2,
  globalPaused: false,
  phaseSync: false,
  speedMult: 1,
  masterVolume: 0.8,
  activeTrack: null,
};

const activeListeners = [];

export function setActiveTrack(track) {
  state.activeTrack = track;
  for (const fn of activeListeners) fn(track);
}

export function onActiveTrackChange(fn) {
  activeListeners.push(fn);
}
