#!/bin/bash

# ============== CONFIGURACIÓN ==============
TITU_APP='DibujarSonar - Visual Synth'
PYTHON_CMD="python3.9"
DIR_TO_SERVE="./docs/"
PORT=9505
URL="http://localhost:$PORT"  # ¡localhost, no 0.0.0.0!
SERVER_PID=""
# ===========================================

# ============== FUNCIONES ==============
error() {
    echo "ERROR: $1" >&2
    exit 1
}

check_command() {
    command -v "$1" >/dev/null 2>&1 || error "Comando '$1' no encontrado. Instálalo."
}

wait_for_port() {
    local timeout=10
    local elapsed=0
    echo -n "Esperando a que el servidor inicie en $URL..."
    while ! nc -z localhost "$PORT" 2>/dev/null; do
        sleep 0.5
        elapsed=$((elapsed + 1))
        [ $elapsed -gt $timeout ] && error "Timeout: el servidor no respondió en $timeout segundos."
    done
    echo -e "\n[OK] Servidor listo en $URL"
}

cleanup() {
    echo -e "\n\n[INFO] Deteniendo servidor..."
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null
    echo "[OK] Servidor detenido."
    exit 0
}
# =======================================

# ============== CONTROL DE SEÑALES ==============
trap cleanup SIGINT SIGTERM
# ================================================

# ============== VALIDACIÓN INICIAL ==============
check_command "$PYTHON_CMD"
check_command "nc"  # netcat, para verificar puerto
[ ! -d "$DIR_TO_SERVE" ] && error "Directorio '$DIR_TO_SERVE' no existe."

# ============== PRESENTACIÓN ==============
clear
echo "=================================================="
echo "    $TITU_APP"
echo "=================================================="
echo "Sirviendo: $DIR_TO_SERVE"
echo "Puerto:    $PORT"
echo "URL:       $URL"
echo "=================================================="
echo "Iniciando servidor... (Ctrl+C para detener)"
echo

# ============== INICIAR SERVIDOR ==============
cd "$DIR_TO_SERVE" || error "No se puede acceder a $DIR_TO_SERVE"

# Iniciar en background y capturar PID
"$PYTHON_CMD" -m http.server "$PORT" > /dev/null 2>&1 &
SERVER_PID=$!
echo "[INFO] Servidor iniciado con PID: $SERVER_PID"

# ============== ESPERAR Y ABRIR NAVEGADOR ==============
wait_for_port

# Abrir navegador (solo si no está ya abierto)
xdg-open "$URL" 2>/dev/null &

# ============== ESPERAR HASTA INTERRUPCIÓN ==============
wait "$SERVER_PID"
exit_code=$?

# Si llega aquí, el servidor terminó por sí solo (raro, pero posible)
echo -e "\n[INFO] El servidor terminó inesperadamente (código: $exit_code)."
cleanup
