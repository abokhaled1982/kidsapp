# Kids Arabisch – Mobile App (Expo · React Native · TypeScript)

MVP-Struktur für die native App. Ziel: iOS + Android aus einer Codebase, saubere UI/UX für Kinder 5–13.

## Installation

Der Ordner enthält **nur** die Quellen; Dependencies installierst du selbst:

```bash
cd mobile
npm install
```

Danach:

```bash
npx expo start          # QR-Code → Expo-Go-App auf dem Handy scannen
npx expo start --android
npx expo start --ios    # nur auf macOS
```

Backend-URL trägst du in-App unter „Einstellungen" ein (aus dem Colab-Notebook `wav2vec2_arabic_pronunciation.ipynb`).

## Tech-Stack (fest, keine Alternativen)

- **Expo SDK 52** + Expo Router (File-based)
- **TypeScript strict**
- **NativeWind v4** (Tailwind für React Native)
- **Reanimated 3 + Moti** für Animationen
- **Zustand** für State, `AsyncStorage`-Persistenz
- **expo-audio** für Aufnahme + Metering
- **expo-speech** für Wort-Vorlesen (temporär, ersetzt durch echte Audiodateien)
- **@tanstack/react-query** für Server-State
- **lucide-react-native** für Icons

## Struktur

```
mobile/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root: Providers, Splash, Stack
│   ├── (tabs)/             # Bottom Tabs
│   │   ├── _layout.tsx
│   │   ├── index.tsx       # Aussprache-Home mit Kategorie-Grid
│   │   ├── quran.tsx       # Placeholder
│   │   ├── games.tsx       # Placeholder
│   │   └── rewards.tsx     # XP · Sterne · Streak
│   ├── play/[categoryId].tsx  # Auto-Flow: TTS → Aufnahme → Bewertung → nächstes Wort
│   └── settings.tsx        # Modal: Backend-URL
├── src/
│   ├── components/         # LetterFeedback, StarBurst, PulsingMic, CategoryCard
│   ├── data/               # categories.ts, words.ts
│   ├── hooks/              # useAutoRecorder.ts (Metering-basiertes End-of-Speech)
│   ├── lib/                # api.ts (Backend), tts.ts
│   └── store/              # useProgress.ts, useBackend.ts
├── assets/                 # Icons, Fonts, Splash (Grafiken folgen)
├── app.json                # Expo-Konfig, Bundle-IDs, Permissions
├── babel.config.js         # NativeWind
├── metro.config.js         # NativeWind Metro-Wrapper
├── tailwind.config.js      # Farb-Theme, Fonts
└── global.css              # Tailwind-Direktiven
```

## Auto-Flow (Kern-UX)

1. Kind tippt Kategorie an
2. Wort erscheint, TTS spricht es vor
3. Aufnahme startet automatisch nach 350 ms Pause
4. RMS-Metering detektiert Sprachende (900 ms min., 750 ms Stille, 4 s hart)
5. Backend-Bewertung (~400 ms)
6. Farbfeedback + Sternexplosion bei ≥ 75
7. Auto-Weiter nach 1,8 s (bei ≥ 75), sonst Wahl „Nochmal / Weiter"

## Was noch offen ist (Phase 2)

- **Echte Audioaufnahmen** pro Wort (statt TTS)
- **Grafiken/Illustrationen** (kommen von dir)
- **Cloud-Sync** (Supabase Postgres + Auth)
- **Qur'an-Modus** mit Tajweed-Prüfung
- **Spiele** (Buchstaben-Matching, Wort-Puzzle)
- **Store-Metadaten** (Icons, Screenshots, Beschreibungen)
- **Produktives Backend** (Fly.io GPU statt Colab)
