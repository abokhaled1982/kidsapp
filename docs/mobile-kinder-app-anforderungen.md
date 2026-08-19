# Quran Kids Arabic - Produktanforderungen und Umsetzungsplan

## 1. Produktvision

Eine kindgerechte Mobile-App für arabische Aussprache, Quran-Lernen und spielerisches Üben für Kinder von 6 bis 13 Jahren.

Die App soll:

- Kindern sofort verständlich sein, ohne lange Erklärtexte.
- Freude und Neugier erzeugen, ohne Reizüberflutung.
- klare, ruhige und hochwertige Benutzeroberflächen bieten.
- Aussprache nicht nur bewerten, sondern sichtbar erklären: erwartet, erkannt und Verbesserungshinweis.
- Quran-Lernen mit spielerischen Übungen verbinden.
- Eltern und Lehrkräften nachvollziehbaren Fortschritt zeigen.
- offline-fähige Inhalte und eine robuste Audioaufnahme unterstützen, soweit technisch möglich.

## 2. Zielgruppen

### Primäre Zielgruppe

Kinder zwischen 5 und 9 Jahren mit unterschiedlichen Lesefähigkeiten, Konzentrationsspannen und Arabischkenntnissen.

### Altersstufen

Die Lernstufen orientieren sich an den Altersstufen 5 bis 9. Das sind **pädagogische Level**, nicht zwingend das tatsächliche Alter des Kindes.

- Level 5: Buchstabenwelt, Hörbewusstsein und sichere Lautunterscheidung
- Level 6: Harakat, Buchstabenformen, Silben und erste Wörter
- Level 7: Wortschatz, Lesen, Aussprachekorrektur und kurze Suren
- Level 8: Ayat, Lesefluss, Tajweed-Bausteine und gezielte Fehlerarbeit
- Level 9: Juz-Lernen, Wiederholungsplan, Rezitation und Selbstkontrolle

Jedes Level besteht aus mehreren Lernpfaden. Ein Level ist erst abgeschlossen,
wenn das Kind nicht nur Inhalte gesehen, sondern auch gehört, gelesen,
gesprochen, gespielt und wiederholt hat.

Die Eltern können das Startlevel auswählen und später anpassen. Inhalte sollen nicht hart nach Geschlecht eingeschränkt werden.

## 3. Start-Onboarding

Beim ersten Start:

1. Begrüßung mit kurzer Audio- oder visueller Erklärung.
2. Auswahl des Lernprofils:
   - Mädchen
   - Junge
   - neutrale Gestaltung / keine Auswahl
3. Auswahl der Alters- oder Lernstufe 5 bis 9.
4. Auswahl des Ziels:
   - Arabisch lesen lernen
   - Aussprache verbessern
   - Quran auswendig lernen
   - alles zusammen
5. Optionaler Name oder Spitzname.
6. Optionaler Avatar.
7. Kurzer Mikrofon- und Backend-Test.
8. Erst danach das personalisierte Zuhause anzeigen.

Die Auswahl Mädchen/Junge verändert Farben, Avatar-Details und Dekorationen nur leicht. Lerninhalte, Schwierigkeitsgrad und Möglichkeiten bleiben gleich. Es dürfen keine stereotypen Farben oder Rollen erzwungen werden.

## 4. Informationsarchitektur

Die Hauptnavigation besteht aus fünf Bereichen:

1. **Start**
   - Tagesziel
   - aktuelle Serie
   - nächster Lernschritt
   - Fortschrittskarte
2. **Arabisch**
   - Buchstaben
   - Harakat
   - Buchstaben verbinden
   - Wörter
   - Ausspracheübungen
3. **Quran**
   - Juz ʿAmma komplett
   - Juz Tabarak komplett
   - Suren- und Ayah-Ansicht
   - Auswendiglernen und Rezitation
4. **Spiele**
   - kurze Lernspiele passend zum aktuellen Level
5. **Belohnungen / Profil**
   - Sterne, Abzeichen, Serien
   - gelernte Buchstaben und Suren
   - Einstellungen für Eltern

## 5. Lerninhalte nach Level

### Level 5 - Buchstabenwelt und Lautdetektive

**Ziel:** Das Kind erkennt, benennt, hört und spricht die 28 Buchstaben.

**Lernpfade:**

- Buchstaben kennenlernen: Name, Form, Laut und Punktmuster
- Formfamilien: ب/ت/ث, ج/ح/خ, د/ذ, ر/ز, س/ش, ص/ض, ط/ظ, ع/غ, ف/ق, ك/ل/م/ن/ه/و/ي
- Anfangs-, Mittel- und Endform visuell unterscheiden
- ähnliche Laute hören: س/ص, ت/ط, د/ض, ح/ه, ع/ء, ق/ك, ف/ث
- Mundbild und Hörbeispiel über kindgerechte Audioanweisungen
- erste Verbindung zwischen Buchstabe, Laut und Bildwort

**Übungen:**

- Buchstaben antippen, drehen und anhören
- den gehörten Laut aus drei Optionen auswählen
- Punkte und Formen sortieren
- fehlenden Buchstaben in einer Reihe finden
- Buchstaben-Memory
- Buchstaben nachzeichnen oder auf dem Bildschirm nachfahren
- einzelnen Laut aufnehmen und direkt wieder anhören
- erkannter Laut neben dem erwarteten Laut
- tägliche 3-Minuten-Lautreise mit Wiederholung schwacher Buchstaben

**Abschlusskriterium:** mindestens 90 % Erkennung bei Buchstabenformen und
mindestens drei stabile Ausspracheaufnahmen pro Buchstabenfamilie.

### Level 6 - Harakat, Silben und Buchstabenverbindungen

**Ziel:** Das Kind liest und spricht kurze Silben und einfache Wörter mit
korrekter Grundvokalisierung.

**Lernpfade:**

- Fatha, Kasra und Damma hören, sehen und unterscheiden
- Sukun und Shadda als erste Lesesignale
- Tanwin als Einführung
- Buchstabenverbindungen in Anfangs-, Mittel- und Endposition
- Silben lesen: بَ, بِ, بُ, بْ, بَّ und vergleichbare Reihen
- kurze CVC-/CVCC-Wörter und häufige Quran-Wörter
- Tashkeel beim Lesen nicht überspringen
- Lautlänge und kurze Pausen wahrnehmen

**Übungen:**

- passende Haraka zum gehörten Laut wählen
- Silben-Treppe mit steigender Schwierigkeit
- Buchstaben in der richtigen verbundenen Form zusammensetzen
- Wort aus Silben bauen
- Audio-Wort dem geschriebenen Wort zuordnen
- Haraka- oder Sukun-Fehler markieren
- Shadda hören und mit einfacher Animation wiederholen
- langsame Audiohilfe mit 0,75x Geschwindigkeit
- kurze Aufnahme mit verständlicher Zeichenkorrektur

**Abschlusskriterium:** mindestens 85 % bei Haraka-Zuordnung und stabilem
Lesen von mindestens 50 kurzen Wörtern.

### Level 7 - Wortschatz, Lesefluss und kurze Suren

**Ziel:** Das Kind liest häufige Wörter flüssig und versteht die eigene
Aussprachekorrektur.

**Lernpfade:**

- Alltagswortschatz: Familie, Körper, Essen, Farben, Tiere und Zahlen
- Quran-Grundwortschatz mit wiederkehrenden Wörtern
- Artikel, Präpositionen und häufige kurze Wortmuster
- Wortgrenzen, Atempausen und Leserythmus
- Madd-Grundidee: kurze und verlängerte Laute hören
- Shadda und Sukun in echten Wörtern anwenden
- kurze Suren: Al-Ikhlas, Al-Falaq, An-Nas, Al-Kawthar sowie weitere kurze Suren
- Fehlerfamilien individuell aus dem bisherigen Verlauf ableiten

**Übungen:**

- Wort lesen, aufnehmen und erkannte Transkription anzeigen
- Zielwort und erkannte Zeichen nebeneinander vergleichen
- problematischen Buchstaben isoliert wiederholen
- Wort-Puzzle und Silben-Puzzle
- Hörverständnis: passendes Bild oder Wort auswählen
- Wort-Bingo mit Audio
- Tempoübung: langsam, normal und frei
- kurze Ayah in einzelne Wörter zerlegen
- drei Wiederholungsversuche mit verbessertem Hinweis statt bloßer Punktzahl

**Abschlusskriterium:** mindestens 80 % bei neuen Wörtern, mindestens 90 % bei
bereits geübten Wörtern und sichere Lesung von drei kurzen Suren.

### Level 8 - Ayat, Tajweed-Bausteine und Fehlerwerkstatt

**Ziel:** Das Kind rezitiert kurze Ayat zusammenhängend und arbeitet gezielt
an den eigenen Aussprache- und Tajweed-Problemen.

**Lernpfade:**

- Juz ʿAmma systematisch nach Schwierigkeit und nicht nur nach Sura-Reihenfolge
- vollständige Tashkeel-Anzeige mit Originaltext
- Madd-Grundlagen und hörbare Längenunterschiede
- Shadda, Sukun und Qalqalah-Grundlagen
- häufige Buchstabenverwechslungen: س/ص, ت/ط, ذ/ز, ح/ه, ع/ء, ق/ك, ث/س
- Wortanfänge, Wortenden und verbundene Aussprache
- Atemstellen und sinnvolle Pausen
- einzelne Ayah, zwei verbundene Ayat und kurze Sura-Abschnitte

**Übungen:**

- Ayah aufnehmen und Wort-für-Wort-Fortschritt sehen
- erkannter Gesamttext oberhalb des erwarteten Textes anzeigen
- pro Zeichen erwartet, erkannt, Konfidenz und Hinweis zeigen
- unsichere Erkennung als „nicht sicher“ markieren
- Fehlerwerkstatt für einen Laut mit Beispiel, Hörvergleich und Wiederholung
- Madd-Längenvergleich mit visueller Zeitleiste
- Shadda-/Sukun-Challenge
- Ayah in langsamem Tempo nachsprechen
- anschließend dieselbe Ayah im normalen Tempo rezitieren
- automatische Wiederholung nach zwei schwachen Versuchen

**Abschlusskriterium:** mindestens 85 % bei geübten Ayat, keine dauerhaft
unklaren Kernbuchstaben und drei konsistente Aufnahmen derselben Sura.

### Level 9 - Juz-Meisterschaft und selbstständige Rezitation

**Ziel:** Das Kind kann den eigenen Lernweg steuern, Juz-Inhalte wiederholen
und längere Abschnitte selbstständig rezitieren.

**Lernpfade:**

- Juz ʿAmma komplett
- Juz Tabarak komplett
- neue, wiederholte und zu korrigierende Inhalte klar trennen
- persönliches Fehlerprofil für Buchstaben, Harakat und Tajweed-Regeln
- täglicher Wiederholungsplan mit verteilten Wiederholungen
- kurze und längere Ayat mit globalem Alignment
- zusammenhängende Rezitation mehrerer Ayat
- Selbstbewertung vor dem automatischen Ergebnis
- Fortschritt pro Sura, Ayah, Wort und Lautfamilie

**Übungen:**

- komplette Ayah oder mehrere Ayat rezitieren
- Sura-Abschnitt ohne Unterbrechung lesen
- erkannte Transkription nach der Aufnahme selbst korrigieren
- schwierige Wörter aus mehreren Suren in einer Prüfung wiederholen
- tägliche „Stärke und Baustelle“-Einheit
- Zeit- und Genauigkeitsmodus getrennt anbieten
- gemischte Prüfung aus bekannten und neuen Wörtern
- Eltern- oder Lehrkraftmodus für gezielte Aufgaben
- Abschlussprüfung pro Sura ohne Druck und ohne Rangliste

**Abschlusskriterium:** stabile Rezitation der gewählten Sura, abgeschlossene
Wiederholungsserie und nachvollziehbare Verbesserung der persönlichen Fehler.

## 6. Quran-Inhalte

### Juz ʿAmma

Juz 30 muss vollständig enthalten sein:

- alle Suren von An-Nas bis An-Naba
- vollständiger arabischer Hafs-Text mit Tashkeel
- Surenname auf Arabisch, Deutsch und Transliteration
- Ayah-Nummern
- Wortsegmentierung für die Aussprachebewertung
- Audio-Wiedergabe pro Wort, Ayah und Sura
- Fortschritt pro Sura und pro Ayah

### Juz Tabarak

Juz 29 muss vollständig ergänzt werden:

- alle Suren von Al-Mulk bis Al-Mursalat
- vollständiger arabischer Hafs-Text mit Tashkeel
- Ayah-Nummern und Wortsegmentierung
- Audio-Wiedergabe und Rezitationsübungen
- Fortschritt pro Sura und Juz

### Text- und Qualitätsanforderungen

- Quran-Text darf nicht automatisch generiert oder unkontrolliert übersetzt werden.
- Textquelle, Lesart Hafs ʿan ʿAsim und Korrektur müssen dokumentiert werden.
- Quran-Daten brauchen eine fachliche Prüfung.
- Tashkeel darf in der Anzeige nicht verloren gehen.
- Das Backend darf Tashkeel für die Modellbewertung normalisieren, die UI muss den Originaltext anzeigen.

## 7. Aussprache-UX

Nach jeder Aufnahme werden drei Ebenen gezeigt:

1. **Was sollte gesagt werden?**
2. **Was hat das Modell erkannt?**
3. **Was soll das Kind wiederholen?**

Beispiel:

- Erwartet: ف
- Erkannt: ث
- Hinweis: Der Laut klingt eher wie ث. Höre das Beispiel und versuche es erneut.

Anforderungen:

- keine Behauptung, dass die Erkennung immer exakt ist
- Unsicherheit sichtbar machen
- erkannte Transkription immer anzeigen
- erkannte Zeichen pro Zielzeichen anzeigen, wenn Alignment sicher genug ist
- bei sehr niedriger Konfidenz lieber „nicht sicher erkannt“ als eine falsche Behauptung
- Fehler freundlich und kurz erklären
- niemals beschämende Sprache verwenden
- Wiederholen-Button unmittelbar erreichbar

## 8. Visuelles Design

### Gestaltungsrichtung

Eine freundliche Lernwelt mit klaren Flächen, warmen Farben, großen Touch-Zielen und wenigen, bedeutungsvollen Animationen.

Die App soll lebendig wirken, aber nicht wie ein überladenes Arcade-Spiel.

### Farbthemen

Es gibt drei gleichwertige Themen:

- Mädchen-Thema: Koralle, Himbeere, Pfirsich, Türkis
- Jungen-Thema: Blau, Grün, Orange, Türkis
- neutrales Thema: Türkis, Gelb, Koralle, Violettsparsamkeit

Die Farbthemen dürfen nicht als Geschlechterrollen kommuniziert werden. Eltern können das Thema jederzeit ändern.

### Altersgerechte Anpassung

Level 5 bis 6:

- größere Illustrationen
- weniger Text
- sehr große Buttons
- stärkere direkte Audiohinweise
- kurze Aufgaben von 20 bis 60 Sekunden

Level 7 bis 9:

- kompaktere Lernkarten
- mehr Text und Quran-Navigation
- Fortschrittsdetails
- längere Aufgaben
- mehr Selbstständigkeit und weniger Animation

### Typografie

- gut lesbare arabische Quran-Schrift mit korrekter Tashkeel-Darstellung
- klare lateinische Begleitschrift
- keine zu dünnen oder dekorativen Schriften
- ausreichender Zeilenabstand
- niemals Text nur über Farbe erklären

## 9. Animationen

Animationen sollen Feedback geben, Orientierung schaffen oder Freude erzeugen.

Erlaubte Kernanimationen:

- sanftes Einblenden des Tagesziels
- Buchstabe pulsiert beim Abspielen des Lauts
- Audioaufnahme zeigt eine ruhige Atem-/Pegelbewegung
- erkannter Buchstabe erscheint mit kurzer Federbewegung
- Sterne steigen nach erfolgreicher Aufgabe langsam auf
- Fortschrittsring füllt sich sichtbar
- Sura-Karte zeigt einen kurzen Lichtimpuls beim Abschluss
- Fehlerzustand wackelt höchstens einmal sehr dezent und wird nicht rot-blinkend

Technische Regeln:

- Animationen kurz halten, meist 150 bis 500 ms
- keine dauernden Hintergrundanimationen während des Lesens
- `prefers-reduced-motion` bzw. reduzierte Bewegung berücksichtigen
- Audiofeedback darf nicht von visuellen Effekten verdeckt werden
- Animationen dürfen Layout und Textgröße nicht verschieben

## 10. Bild- und Illustrationsbedarf für Gemini

Die folgenden Bilder sollen als eigene, konsistente Bitmap-Illustrationen erstellt werden. Alle Prompts sollen denselben Stil verwenden: freundliche hochwertige Kinderbuch-Illustration, klare Formen, warme Lichtstimmung, keine Schrift im Bild, keine Logos, keine Wasserzeichen, genügend freier Bereich für UI-Text, 16:9 oder quadratisches Format je nach Einsatz.

### 10.1 Onboarding-Hintergrund

**Prompt:**

> Create a warm, modern educational illustration for an Arabic Quran learning app for children ages 6 to 13. Show a peaceful learning garden with a small open Quran on a wooden stand, soft geometric Islamic patterns, stars, leaves, and a welcoming path leading forward. Bright coral, turquoise, sunny yellow, blue and green accents, inclusive and gender-neutral, joyful but calm, premium children's book style, clean empty space in the upper center for UI text, no written words, no logo, no watermark, portrait mobile composition.

### 10.2 Mädchen-Farbthema

**Prompt:**

> Create a joyful but elegant children's learning background for an Arabic pronunciation app, using coral, raspberry, peach and turquoise as the main palette. Include abstract stars, soft clouds, leaves and geometric Islamic motifs, no people, no text, no logo, no watermark, clean open space for interface elements, premium flat-meets-painted illustration, portrait mobile composition.

### 10.3 Jungen-Farbthema

**Prompt:**

> Create a joyful but elegant children's learning background for an Arabic pronunciation app, using blue, teal, green and warm orange as the main palette. Include abstract stars, soft clouds, leaves and geometric Islamic motifs, no people, no text, no logo, no watermark, clean open space for interface elements, premium flat-meets-painted illustration, portrait mobile composition.

### 10.4 Neutrales Farbthema

**Prompt:**

> Create an inclusive modern children's learning background for an Arabic Quran app, using turquoise, sunny yellow, coral and soft green. Show a calm sky, small stars, geometric Islamic patterns and gentle paper-like shapes, no people, no text, no logo, no watermark, balanced composition with clear empty areas for UI, premium educational illustration, portrait mobile composition.

### 10.5 Buchstabenwelt

**Prompt:**

> Create a playful educational illustration showing Arabic letter learning through colorful wooden letter tiles, dots, simple paths and friendly abstract shapes. The image must not contain actual readable letters or words, because text will be rendered by the app. Bright but controlled colors, clear visual hierarchy, premium children's book style, no logo, no watermark, square composition.

### 10.6 Quran-Bereich

**Prompt:**

> Create a respectful child-friendly illustration for a Quran learning section: an open Quran on a beautiful wooden rehal, a soft lantern, stars and a calm night-to-dawn sky, subtle Islamic geometric details, warm turquoise, gold, deep blue and coral accents, no readable text, no logo, no watermark, respectful and non-photorealistic, wide mobile banner composition.

### 10.7 Spiele-Bereich

**Prompt:**

> Create a playful educational scene for children learning Arabic pronunciation: colorful sound waves, floating shapes, stars, letter tiles without readable characters, a small microphone icon as a visual object, energetic but uncluttered, bright coral, turquoise, yellow, blue and green, no text, no logo, no watermark, square composition.

### 10.8 Level-Abzeichen

**Prompt:**

> Create a set of five separate collectible achievement badge illustrations for a children's Arabic learning app. Themes: first letter, connected letters, confident word, Quran reader, Quran master. Use consistent shapes, stars, leaves, lanterns and geometric motifs. No readable text, no numbers, no logo, no watermark, transparent or plain background, clean vector-like premium children's illustration style.

### 10.9 Erfolgs- und Abschlussbild

**Prompt:**

> Create a celebratory but calm illustration for a child completing a Quran learning lesson: a glowing path, stars, a small open Quran on a stand, confetti-like light shapes, friendly warm colors, no people required, no readable text, no logo, no watermark, premium children's book style, portrait mobile composition.

### 10.10 Leere Zustände und Fehlerzustände

**Prompt:**

> Create a gentle supportive illustration for a children's learning app when an audio recording is unclear. Show a friendly microphone, soft clouds and a simple retry path, encouraging and never sad or frightening, warm turquoise, coral and yellow colors, no text, no logo, no watermark, clean square composition.

## 11. Audio und Feedback

- Audio-Beispiele für jeden Buchstaben, jede Haraka und wichtige Tajweed-Regeln.
- Kindgerechte, langsame und normale Wiedergabegeschwindigkeit.
- Klare Aufnahmezustände: bereit, hört zu, verarbeitet, Ergebnis.
- Mikrofonstatus muss verständlich sein.
- Bei fehlender Verbindung: kurze Erklärung und späterer Wiederholungsversuch.
- Keine lange Warteanimation ohne Status.

## 12. Fortschritt und Belohnungen

Fortschritt:

- XP für erledigte Übungen
- Sterne für Qualität und Regelmäßigkeit
- Tagesziel
- Streak ohne Schuldgefühl bei Unterbrechung
- Buchstaben-Meisterschaft
- Wort-Meisterschaft
- Sura- und Juz-Fortschritt
- Wiederholungsbedarf getrennt von neuem Inhalt

Belohnungen:

- Abzeichen
- neue Hintergrundvarianten
- neue Avatar-Elemente
- kleine visuelle Freischaltungen
- keine manipulativen Lootboxen
- keine kostenpflichtigen oder zufälligen Kinderkäufe

## 13. Elternbereich

Der Elternbereich wird durch eine einfache Elternbestätigung geschützt und enthält:

- Lernstufe ändern
- Design-Thema ändern
- Audio-/Mikrofon-Berechtigungen
- Fortschritt pro Bereich
- erkannte Fehlermuster
- Übungsdauer
- Backend-Verbindungsstatus
- Datenschutz- und Löschoptionen

## 14. Technische Anforderungen

- React Native / Expo bestehende Struktur weiterverwenden.
- Zustand und Progress-Store erweitern statt parallele Stores einzuführen.
- Reanimated für gezielte Animationen verwenden, sofern im Projekt vorhanden.
- Lucide oder bestehende Icon-Bibliothek für Bedienelemente verwenden.
- Keine UI-Karten in Karten verschachteln.
- Touch-Ziele mindestens ca. 44 pt.
- Arabic-Text immer mit geprüfter RTL-Darstellung.
- Audio- und Netzwerkstatus müssen für Screenreader verständlich sein.
- Backend-Response enthält Transkription, erkannte Zeichen, Match-Status und Konfidenz.
- Bei niedriger Modellkonfidenz soll die UI Unsicherheit anzeigen.
- Juz ʿAmma und Juz Tabarak vollständig und fachlich geprüft integrieren.

## 15. Umsetzungsreihenfolge

### Phase 1 - Daten- und Produktgrundlage

- dieses Anforderungsdokument bestätigen
- Datenmodell für Profile, Lernlevel, Themen und Inhalte definieren
- vollständige Quran-Datenstruktur für Juz ʿAmma und Juz Tabarak vorbereiten
- bestehende Kategorien in Lernpfade überführen
- fachliche Quran-Textquelle festlegen

### Phase 2 - Onboarding und Designsystem

- Profil- und Levelauswahl
- Farbthemen
- Typografie, Abstände, Buttons, Karten und Zustände
- persistente Profileinstellungen

### Phase 3 - Neue Startseite

- personalisierte Startseite
- Tagesziel
- Fortschrittskarte
- nächster Lernschritt
- altersabhängige Darstellung

### Phase 4 - Arabisch-Lernpfad

- Buchstabenwelt
- Harakat
- verbundene Formen
- Wörter und Ausspracheübungen
- animiertes Feedback

### Phase 5 - Quran-Bereich

- Juz ʿAmma vollständig
- Juz Tabarak vollständig
- Sura-, Ayah- und Wortnavigation
- Audio und Fortschritt

### Phase 6 - Aussprache-Feedback

- erkannte Transkription sichtbar machen
- `recognized`, `match`, Konfidenz und Unsicherheit integrieren
- verständliche Korrekturhinweise
- Fehlerfälle mit echtem Audio testen

### Phase 7 - Spiele und Belohnungen

- kurze Spiele pro Level
- Abzeichen und Freischaltungen
- keine übermäßigen Animationen

### Phase 8 - Qualitätssicherung

- Tests auf kleinen und großen Telefonen
- Tests für RTL, Tashkeel, Audio, Offline und schlechte Verbindung
- Kinder- und Eltern-Usability-Tests
- Performance- und Animationsprofiling
- Datenschutzprüfung

## 16. Abnahmekriterien für Version 1

- Ein Kind kann ohne Erklärung ein Profil und Level auswählen.
- Die Startseite zeigt genau eine klare nächste Aufgabe.
- Die fünf Lernlevel sind sichtbar und verständlich.
- Juz ʿAmma und Juz Tabarak sind vollständig navigierbar.
- Nach einer Aufnahme sieht das Kind Zieltext und erkannte Transkription.
- Fehler werden freundlich und konkret erklärt.
- Keine zentrale Ansicht wirkt überladen.
- Animationen helfen der Orientierung und blockieren keine Aktion.
- App funktioniert auf kleinen Telefonen und mit großer Schrift.
- Backend-Ausfall zeigt einen verständlichen Zustand.
- Quran-Texte sind fachlich geprüft.
- Eltern können Theme, Level und Fortschritt verwalten.
