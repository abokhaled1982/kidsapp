#!/bin/bash
# Modal Secret erstellen mit LiveKit-Credentials.
# Einmalig ausfuehren bevor das erste Deploy laeuft.
#
# Usage: bash backend/scripts/setup_modal_secret.sh

set -e

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# modal aus dem venv nehmen (siehe backend/deploy.sh), sonst vom PATH
MODAL="$BACKEND_DIR/.venv/bin/modal"
[ -x "$MODAL" ] || MODAL="modal"

# .env laden
if [ -f "$BACKEND_DIR/.env" ]; then
    export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
fi

echo "Erstelle Modal Secret 'livekit-credentials'..."
echo "  LIVEKIT_URL=$LIVEKIT_URL"
echo "  LIVEKIT_API_KEY=$LIVEKIT_API_KEY"
echo "  LIVEKIT_API_SECRET=***hidden***"

# --force: ueberschreibt ein bestehendes Secret, damit das Skript beim
# Credential-Wechsel wiederholbar ist statt mit "already exists" abzubrechen.
"$MODAL" secret create --force livekit-credentials \
    LIVEKIT_URL="$LIVEKIT_URL" \
    LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
    LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET"

echo ""
echo "✓ Secret erstellt! Jetzt kannst du deployen:"
echo "  bash backend/deploy.sh"
