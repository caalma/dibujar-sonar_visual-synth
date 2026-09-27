// Panel flotante de ayuda.

import { CONFIG } from '../config.js';

let panel = null;

const HELP_HTML = `
<div class="help-head">
  <h3>AYUDA - VISUAL SYNTH</h3>
  <button class="help-close" title="Cerrar">X</button>
</div>

<h4>Que es</h4>
<p>Un sintetizador visual: dibujas pixeles y el motor de audio los convierte
en sonido. El playhead recorre el lienzo de izquierda a derecha y en cada
columna suena lo que hay dibujado, en bucle.</p>

<h4>Ejes</h4>
<ul>
  <li><b>X = tiempo.</b> El playhead avanza segun VEL y se repite en bucle.</li>
  <li><b>Y = frecuencia.</b> Escala logarítmica: arriba = MAX, abajo = MIN.
  La regla de la izquierda muestra marcas en Hz.</li>
</ul>

<h4>Colores</h4>
<table class="help-colors">
  <tr><td><span class="sw sw-r"></span>Rojo</td><td>Diente de sierra</td></tr>
  <tr><td><span class="sw sw-g"></span>Verde</td><td>Onda cuadrada</td></tr>
  <tr><td><span class="sw sw-b"></span>Azul</td><td>Triángulo</td></tr>
</table>
<p>El brillo de cada color controla la amplitud de esa forma de onda.
Los colores se suman entre si.</p>

<h4>Controles por pista</h4>
<ul>
  <li><b>VEL</b>: velocidad del playhead en px/seg. <b>REV</b>: inversa.</li>
  <li><b>VOL / PAN</b>: volumen y paneo.</li>
  <li><b>MIN / MAX</b>: rango de frecuencias del lienzo.</li>
  <li><b>DEN</b>: densidad. Cada cuantas filas hay un oscilador.
  Más densidad = mejor resolución, más CPU.</li>
  <li><b>GRAVES</b>: realce para frecuencias bajo 150 Hz.</li>
  <li><b>P</b>: pausa (silencia la pista). <b>F</b>: freeze
  (congela el playhead y mantiene el acorde sonando).</li>
  <li><b>M / S</b>: mute y solo. <b>R</b>: patron aleatorio.
  <b>L</b>: limpiar. <b>PNG</b>: exportar lienzo. <b>X</b>: eliminar.</li>
</ul>

<h4>Efectos por pista (fila FX)</h4>
<ul>
  <li><b>FIL</b>: filtro simple. Tipo OFF/LP/HP/BP, frecuencia de corte
  (escala logaritmica) y resonancia Q. Con OFF el sonido pasa sin cambios.</li>
  <li><b>DLY</b>: delay. Time = tiempo del eco, Fdbk = realimentacion
  (cantidad de repeticiones), Mix = nivel del eco. Con Mix en 0 no se escucha.</li>
</ul>

<h4>Barra superior</h4>
<ul>
  <li><b>+ NUEVA / + IMAGEN</b>: crea pistas. El tamaño sale del campo
  ANCHOxALTO (la imagen se redimensiona a ese tamaño).</li>
  <li><b>PAUSA</b>: pausa global (Espacio). El slider <b>x</b> multiplica
  la velocidad de todas las pistas. <b>MASTER</b>: volumen general.</li>
  <li><b>REINICIO</b>: todas las pistas vuelven a x=0 y las fases de los
  osciladores se alinean al mismo tiempo.</li>
  <li><b>SYNC</b>: sincronización de arranque (ver abajo).</li>
  <li><b>REC</b>: graba todo el bus master (respetando mute/solo/volumen).
  Al presionar de nuevo detiene y descarga un WAV a 16 bits.
  Máximo ${CONFIG.REC_MAX_SECONDS / 60} minutos.</li>
  <li><b>GUARDAR / CARGAR</b>: el proyecto es un JSON que incluye los
  lienzos, parametros, efectos y ajustes.</li>
</ul>

<h4>Sincronización</h4>
<ul>
  <li><b>SYNC apagado</b> (por defecto): cada pista corre libre desde que
  se crea, como siempre.</li>
  <li><b>SYNC encendido</b>: al activarlo, todas las pistas se alinean en
  x=0. Mientras este activo, reanudar la pausa global o crear una pista
  nueva vuelve a alinear todo en x=0.</li>
  <li><b>REINICIO</b> funciona siempre, con SYNC prendido o apagado.</li>
  <li>Nota: pistas con velocidades distintas se separan con el tiempo;
  la sincronización garantiza el punto de partida común.</li>
</ul>

<h4>Atajos</h4>
<ul>
  <li><b>Espacio</b>: pausa global</li>
  <li><b>Click izquierdo</b>: dibujar - <b>Click derecho</b>: borrar</li>
  <li><b>E</b>: modo goma</li>
  <li><b>Ctrl+Z / Ctrl+Shift+Z</b>: deshacer / rehacer en la pista activa</li>
  <li><b>?</b>: esta ayuda - <b>Esc</b>: cerrar</li>
</ul>

<h4>Rendimiento</h4>
<p>Lienzos grandes, densidad 1 y muchas pistas consumen mucha CPU. Si el
audio tartamudea, subí DEN, usa lienzos más chicos o elimina pistas.
Con auriculares Bluetooth el playhead puede verse levemente retrasado
por la latencia propia del dispositivo.</p>
`;

export function initHelpPanel() {
  panel = document.createElement('aside');
  panel.id = 'help-panel';
  panel.hidden = true;
  panel.innerHTML = HELP_HTML;
  document.body.appendChild(panel);
  panel.querySelector('.help-close').addEventListener('click', closeHelp);
}

export function toggleHelp() {
  if (!panel) return;
  panel.hidden = !panel.hidden;
}

export function closeHelp() {
  if (panel) panel.hidden = true;
}
