#!/usr/bin/env bash
# Lanza la app Maurya (harness Electron) en modo desarrollo.
# Uso: ./start.sh
set -euo pipefail

cd "$(dirname "$0")"

# ELECTRON_RUN_AS_NODE heredada hace que Electron arranque como Node
# y la ventana nunca se abra. La quitamos siempre por seguridad.
exec env -u ELECTRON_RUN_AS_NODE npm run dev
