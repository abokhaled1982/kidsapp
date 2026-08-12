# 🕌 Arabisch Vorlesen – Kids Pronunciation App

Ausspracheprüfungs-App für Kinder 6–12, die Anfänger-Arabisch lernen. Das Kind spricht ein vorgegebenes Wort in das Mikrofon; die App bewertet **jeden einzelnen Buchstaben** grün/gelb/rot und zeigt daneben, was das Modell tatsächlich gehört hat.

Der wissenschaftliche Ansatz ist vollständig in [ARCHITEKTUR.md](ARCHITEKTUR.md) dokumentiert (Referenzen, Parameter, Design-Entscheidungen).

## Bestandteile

| Datei | Rolle |
|---|---|
| [index.html](index.html) | Frontend – 100 Wörter, MediaRecorder, Farb-Feedback, Fortschritt in `localStorage` |
| [wav2vec2_arabic_pronunciation.ipynb](wav2vec2_arabic_pronunciation.ipynb) | Backend – wav2vec 2.0 XLSR-53 Arabic + Silero VAD + CTC forced-align + GOP-Scoring, FastAPI + Cloudflared Tunnel, für Google Colab (T4 GPU) |
| [ARCHITEKTUR.md](ARCHITEKTUR.md) | Technische Referenz mit wissenschaftlicher Verortung |

## Schnellstart

1. `wav2vec2_arabic_pronunciation.ipynb` in Google Colab öffnen (**Runtime → T4 GPU**), **Run all**.
2. Letzte Zelle druckt eine `https://…trycloudflare.com`-URL.
3. `index.html` im Browser öffnen, unter **Einstellungen** die URL eintragen.
4. „🎤 Vorlesen" tippen und das angezeigte Wort deutlich aussprechen.

## Pipeline (Kurzfassung)

```
Aufnahme (webm/opus 16 kHz)
   → pydub decode → 16 kHz mono float32
   → Silero VAD (sanftes Randstille-Trim)
   → wav2vec 2.0 XLSR-53 Arabic  (Grosman, Apache 2.0)
   → torchaudio.forced_align gegen das Zielwort
   → GOP-Score pro Buchstabe (nicht-kompetitiv nach Witt & Young 2000)
   → JSON: {units, transcription, total, duration_ms}
```

## Bewusst nicht drin

- **Kein Denoiser** (Sepformer DNS-4 zerstörte arabische Gutturale/Emphatika – siehe [ARCHITEKTUR.md, Abschnitt 6.2](ARCHITEKTUR.md))
- **Kein Streaming** (Wort-Level-Assessment = ein POST pro Wort)
- **Kein FP16** (Präzision vor Latenz)
- **Kein Phonem-Modell** (Grapheme-CTC reicht für Anfänger-Wörter, keine espeak-ng-Abhängigkeit)

## Referenzen

- Baevski, A. et al. (2020) *wav2vec 2.0*. NeurIPS 2020.
- Conneau, A. et al. (2021) *Unsupervised Cross-Lingual Representation Learning for Speech Recognition*. INTERSPEECH 2021.
- Kürzinger, L. et al. (2020) *CTC-Segmentation of Large Corpora*. SPECOM 2020.
- Witt, S. M., & Young, S. J. (2000) *Phone-level pronunciation scoring and assessment for interactive language learning*. Speech Communication 30.
