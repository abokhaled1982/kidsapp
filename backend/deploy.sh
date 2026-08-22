#!/usr/bin/env bash
# Redeploy des LiveKit-Agents auf Modal — idempotent, beliebig oft ausfuehrbar.
#
# Usage:
#   bash backend/deploy.sh          # deploy
#   bash backend/deploy.sh serve    # dev-mode (modal serve, live reload)
#
# Warum ein venv: Ubuntu 24.04 markiert das System-Python als
# EXTERNALLY-MANAGED, "pip install modal" bricht dort ab (PEP 668).

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$BACKEND_DIR/.venv"
MODAL="$VENV/bin/modal"
MODE="${1:-deploy}"

cd "$BACKEND_DIR"

# --- 1. venv + modal CLI ---------------------------------------------------
if [ ! -x "$VENV/bin/python" ]; then
    echo "==> Erstelle venv ($VENV)"
    python3 -m venv "$VENV"
fi

if [ ! -x "$MODAL" ]; then
    echo "==> Installiere modal"
    "$VENV/bin/python" -m pip install --quiet --upgrade pip
    "$VENV/bin/python" -m pip install --quiet modal
fi

echo "==> $("$MODAL" --version)"

# --- 2. Auth --------------------------------------------------------------
# Token liegt in ~/.modal.toml. Fehlt es, interaktiv nachholen (Browser-Login).
if ! "$MODAL" profile current >/dev/null 2>&1; then
    echo "==> Kein Modal-Token gefunden — starte 'modal setup'"
    "$MODAL" setup
fi
echo "==> Modal-Profil: $("$MODAL" profile current)"

# --- 3. Secret ------------------------------------------------------------
# livekit_agent.py macht Secret.from_name("livekit-credentials") beim Import;
# fehlt das Secret, bricht das Deploy ab. Also vorher pruefen.
if ! "$MODAL" secret list 2>/dev/null | grep -q "livekit-credentia"; then
    echo "FEHLER: Modal-Secret 'livekit-credentials' fehlt."
    echo "  1. backend/.env anlegen mit LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET"
    echo "  2. bash backend/scripts/setup_modal_secret.sh   (nutzt dieses venv-modal)"
    exit 1
fi
echo "==> Secret 'livekit-credentials' vorhanden"

# --- 4. Deploy ------------------------------------------------------------
echo "==> modal $MODE livekit_agent.py"
"$MODAL" "$MODE" livekit_agent.py

# --- 5. Worker anwerfen ---------------------------------------------------
# "deployed" heisst bei Modal nur "registriert", nicht "laeuft". Der LiveKit-
# Worker muss laufen, sonst betritt die App einen Room ohne Agent (LK: 0/1).
# Im Betrieb startet ihn der Token-Endpoint selbst (_ensure_worker), hier
# einmal vorwaermen, damit der erste Nutzer nicht auf den Cold-Start wartet.
if [ "$MODE" = "deploy" ]; then
    echo "==> Worker-Status"
    "$VENV/bin/python" - <<'PY'
import os
import modal

app_name = os.environ.get("ASR_APP_NAME", "quran-asr-livekit")
fn = modal.Function.from_name(app_name, "run_agent")
stats = fn.get_current_stats()
if stats.num_running_inputs > 0 or stats.backlog > 0:
    print(f"    Worker laeuft bereits ({stats.num_running_inputs} Invocation(s)).")
else:
    call = fn.spawn()
    print(f"    Worker gestartet: {call.object_id}")
PY
fi
