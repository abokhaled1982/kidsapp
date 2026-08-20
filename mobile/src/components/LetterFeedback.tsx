// Rueckmeldung nach dem Sprechen (Anforderungen 7): drei Schichten in immer
// derselben Reihenfolge - was gesagt werden sollte, was das Modell gehoert hat
// und was das Kind wiederholen soll. Kein Zahlenwert, keine Fachbegriffe.
//
// Wichtig: das Modell kann sich irren. Liegt die Konfidenz eines Lautes ganz
// unten (Aufnahme zu kurz, Kind war zu leise), wird der Laut nicht rot bewertet,
// sondern als "nicht sicher erkannt" gezeigt - sonst lernt das Kind aus einem
// Messfehler.

import { View, Text, StyleSheet } from "react-native";
import type { AssessUnit } from "@/lib/api";
import { useTheme } from "@/store/useTheme";
import { MASTERY_SCORE } from "@/store/levelFlow";
import type { ThemePalette, Tone } from "@/store/profileModel";

// confidence ist die Wahrscheinlichkeit des Ziellautes in seinen Frames
// (exp(log-prob) im Backend). Darunter ist die Messung keine Bewertung wert.
const LOW_CONFIDENCE = 0.15;

type Density = "large" | "compact";

function isUnsure(u: AssessUnit): boolean {
  return (u.confidence ?? 0) < LOW_CONFIDENCE && !u.match;
}

function toneFor(score: number, colors: ThemePalette): Tone {
  if (score >= MASTERY_SCORE) return colors.good;
  if (score >= 50) return colors.medium;
  return colors.bad;
}

// Freundlicher Satz statt Fehlermeldung - eine Aufforderung, kein Urteil.
function repeatHint(u: AssessUnit): string {
  if (isUnsure(u)) return "war kaum zu hören — sprich lauter";
  if (u.error_hint) return `klang wie ${u.error_hint}`;
  return "noch etwas deutlicher";
}

export function LetterFeedback({
  units,
  transcription,
  density = "compact",
}: {
  units: AssessUnit[];
  // Was das Modell insgesamt verstanden hat (Schicht 2).
  transcription?: string;
  density?: Density;
}) {
  const c = useTheme();
  if (!units?.length) return null;
  const big = density === "large";

  const unsureAll = units.every(isUnsure);
  const todo = units
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => isUnsure(u) || !!u.error_hint || u.score < MASTERY_SCORE);
  const heard = transcription?.trim() || units.map((u) => u.recognized ?? "·").join("");

  return (
    <View style={styles.wrap}>
      {/* Schicht 1: das war die Aufgabe */}
      <Text style={[styles.layerTitle, { color: c.textMuted }]}>🎯 So klingt es richtig</Text>
      <View style={styles.row}>
        {units.map((u, i) => {
          const unsure = isUnsure(u);
          const tone = toneFor(u.score, c);
          return (
            <View
              key={`${u.label}-${i}`}
              style={[
                styles.chip,
                big && styles.chipBig,
                {
                  borderColor: unsure ? c.border : tone.base,
                  backgroundColor: unsure ? c.surfaceMuted : u.error_hint ? c.bad.bg : c.surface,
                },
              ]}
            >
              <Text
                style={[styles.letter, big && styles.letterBig, { color: unsure ? c.textMuted : tone.text }]}
                allowFontScaling={false}
              >
                {u.label}
              </Text>
              {unsure ? (
                <Text style={[styles.mark, { color: c.textMuted }]}>?</Text>
              ) : u.recognized && !u.match ? (
                <Text style={[styles.recognized, big && styles.recognizedBig, { color: c.bad.text }]}>
                  {u.recognized}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Schicht 2: das hat das Modell gehoert */}
      <Text style={[styles.layerTitle, { color: c.textMuted }]}>👂 Das habe ich gehört</Text>
      {unsureAll ? (
        <Text style={[styles.heardUnsure, big && styles.heardBig, { color: c.textMuted }]}>
          nicht sicher erkannt 🤔
        </Text>
      ) : (
        <Text style={[styles.heard, big && styles.heardBig, { color: c.text }]} allowFontScaling={false}>
          {heard}
        </Text>
      )}

      {/* Schicht 3: das wiederholen wir */}
      {todo.length === 0 ? (
        <Text style={[styles.praise, { color: c.good.text }]}>🎉 Alles richtig gesprochen!</Text>
      ) : (
        <>
          <Text style={[styles.layerTitle, { color: c.textMuted }]}>🔁 Das üben wir nochmal</Text>
          <View style={styles.todoList}>
            {todo.slice(0, big ? 2 : 4).map(({ u, i }) => (
              <View key={`todo-${u.label}-${i}`} style={styles.todoRow}>
                <Text
                  style={[styles.todoLetter, big && styles.todoLetterBig, { color: c.text }]}
                  allowFontScaling={false}
                >
                  {u.label}
                </Text>
                <Text style={[styles.todoText, big && styles.todoTextBig, { color: c.textMuted }]}>
                  {repeatHint(u)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", gap: 4 },
  layerTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 10,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 4,
  },
  chip: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 44,
  },
  chipBig: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, minWidth: 64 },
  letter: { fontSize: 24, fontWeight: "700", writingDirection: "rtl" },
  letterBig: { fontSize: 40, lineHeight: 52 },
  recognized: { fontSize: 15, fontWeight: "800", writingDirection: "rtl" },
  recognizedBig: { fontSize: 22 },
  mark: { fontSize: 15, fontWeight: "800" },
  heard: { fontSize: 28, fontWeight: "700", writingDirection: "rtl", textAlign: "center" },
  heardBig: { fontSize: 36 },
  heardUnsure: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  praise: { fontSize: 17, fontWeight: "800", marginTop: 12, textAlign: "center" },
  todoList: { marginTop: 4, gap: 6, alignSelf: "stretch" },
  todoRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  todoLetter: { fontSize: 26, fontWeight: "800", writingDirection: "rtl" },
  todoLetterBig: { fontSize: 34 },
  todoText: { fontSize: 15, flexShrink: 1 },
  todoTextBig: { fontSize: 17 },
});
