#!/bin/bash
# Modal Secret erstellen mit LiveKit-Credentials.
# Einmalig ausfuehren bevor das erste Deploy laeuft.
#
# Usage: bash backend/scripts/setup_modal_secret.sh

set -e

# .env laden
if [ -f "backend/.env" ]; then
    export $(grep -v '^#' backend/.env | xargs)
fi

echo "Erstelle Modal Secret 'livekit-credentials'..."
echo "  LIVEKIT_URL=$LIVEKIT_URL"
echo "  LIVEKIT_API_KEY=$LIVEKIT_API_KEY"
echo "  LIVEKIT_API_SECRET=***hidden***"

modal secret create livekit-credentials \
    LIVEKIT_URL="$LIVEKIT_URL" \
    LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
    LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET"

echo ""
echo "✓ Secret erstellt! Jetzt kannst du deployen:"
echo "  modal deploy backend/livekit_agent.py"
