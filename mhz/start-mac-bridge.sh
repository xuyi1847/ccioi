#!/bin/zsh
set -e
SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR/backend"
exec .venv/bin/uvicorn mac_bridge:app --host 127.0.0.1 --port 8765
