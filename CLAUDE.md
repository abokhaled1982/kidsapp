# CLAUDE.md — Project Context for Claude Code

## Project Summary

Quran Kids Arabic Pronunciation App — a monorepo with:
- `mobile/` — Expo 54 / React Native / TypeScript / Zustand / Vitest
- `backend/` — Python FastAPI ASR (wav2vec2-large-xlsr-53-arabic)
- `docs/` — Requirements & research (German)

## Quick Commands

```bash
# Mobile
cd mobile && npm run test        # Vitest
cd mobile && npx expo start      # Dev server

# Backend
cd backend && uvicorn asr_app:app --reload
```

## Coding Conventions

- TypeScript strict mode in mobile/
- Zustand for state (no Redux, no MobX)
- Tests colocated as `*.test.ts` next to source
- Arabic text: always RTL-aware
- No new deps without approval

## Files to SKIP (save tokens)

- `*.ipynb` (research notebooks, huge)
- `mobile/node_modules/`
- `mobile/dist/`
- `.venv/`
- `.expo/`
- `*.mp4`, `*.pdf`

## Key Entry Points

- Mobile state: `mobile/src/store/`
- Mobile routes: `mobile/app/`
- Backend logic: `backend/asr_app.py`
- Requirements: `docs/mobile-kinder-app-anforderungen.md`
