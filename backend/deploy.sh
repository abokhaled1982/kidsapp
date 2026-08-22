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

# --- 5. Worker zyklieren --------------------------------------------------
# Zwei Fallen auf einmal:
#  a) "deployed" heisst bei Modal nur "registriert", nicht "laeuft". Ein
#     LiveKit-Worker muss laufen und bei LiveKit Cloud registriert sein, sonst
#     betritt die App einen Room, dem nie ein Agent beitritt (LK: 0/1).
#  b) Ein bereits laufender Worker laeuft mit dem ALTEN Code weiter, bis sein
#     Timeout greift (ASR_WORKER_TIMEOUT, default 30 min). Nach einem Deploy
#     muss er also ersetzt werden, sonst testet man gegen den alten Stand.
# Im Normalbetrieb startet den Worker der Token-Endpoint selbst
# (_ensure_worker), hier wird er einmal vorgewaermt.
if [ "$MODE" = "deploy" ]; then
    echo "==> Worker zyklieren"
    "$VENV/bin/python" - <<'PY'
import os
import time

import modal

app_name = os.environ.get("ASR_APP_NAME", "quran-asr-livekit")
# Name gespiegelt aus livekit_agent.py (WORKER_STATE_DICT)
state = modal.Dict.from_name("quran-asr-worker-state", create_if_missing=True)
fn = modal.Function.from_name(app_name, "run_agent")

old_id = state.get("call_id")
if old_id:
    try:
        modal.FunctionCall.from_id(old_id).cancel()
        print(f"    alter Worker beendet: {old_id}")
    except Exception as exc:
        print(f"    alter Worker ({old_id}) nicht kuendbar: {exc!r}")

# Warten bis Modal den gecancelten Input abgeraeumt hat. Sonst sieht der
# Stats-Check unten noch den alten Worker und startet keinen neuen.
for _ in range(30):
    stats = fn.get_current_stats()
    if stats.num_running_inputs == 0 and stats.backlog == 0:
        break
    time.sleep(1)

call = fn.spawn()
state["call_id"] = call.object_id
print(f"    neuer Worker: {call.object_id}")
PY
fi
