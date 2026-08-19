import { View, Text, StyleSheet } from "react-native";
import type { AssessUnit } from "@/lib/api";
import { useTheme } from "@/store/useTheme";
import type { ThemePalette, Tone } from "@/store/profileModel";

function toneFor(score: number, colors: ThemePalette): Tone {
  if (score >= 75) return colors.good;
  if (score >= 50) return colors.medium;
  return colors.bad;
}

export function LetterFeedback({ units }: { units: AssessUnit[] }) {
  const c = useTheme();
  if (!units?.length) return null;

  const hints = units
    .map((u, i) => ({ i, target: u.label, hint: u.error_hint }))
    .filter((h) => !!h.hint);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {units.map((u, i) => {
          const tone = toneFor(u.score, c);
          const hasHint = !!u.error_hint;
          return (
            <View
              key={`${u.label}-${i}`}
              style={[
                styles.chip,
                { borderColor: tone.base, backgroundColor: hasHint ? c.bad.bg : c.surface },
              ]}
            >
              <Text style={[styles.letter, { color: tone.text }]}>{u.label}</Text>
              {u.recognized && u.recognized !== u.label ? (
                <Text style={[styles.recognized, { color: c.bad.text }]}>→ {u.recognized}</Text>
              ) : null}
              {hasHint ? (
                <View style={[styles.hintBadge, { backgroundColor: c.bad.base, borderColor: c.surface }]}>
                  <Text style={[styles.hintBadgeText, { color: c.onPrimary }]}>{u.error_hint}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {hints.length > 0 && (
        <View style={styles.hintList}>
          {hints.map(({ i, target, hint }) => (
            <Text key={`${target}-${i}`} style={[styles.hintLine, { color: c.text }]}>
              Erwartet <Text style={[styles.hintTarget, { color: c.good.text }]}>{target}</Text>, erkannt{" "}
              <Text style={[styles.hintWrong, { color: c.bad.text }]}>{hint}</Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  chip: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "relative",
  },
  letter: { fontSize: 24, fontWeight: "700", writingDirection: "rtl" },
  recognized: { fontSize: 16, fontWeight: "800", writingDirection: "rtl" },
  hintBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  hintBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 14,
  },
  hintList: {
    marginTop: 12,
    gap: 4,
    alignItems: "center",
  },
  hintLine: { fontSize: 15, textAlign: "center" },
  hintTarget: { fontWeight: "800", fontSize: 18 },
  hintWrong: { fontWeight: "800", fontSize: 18 },
});
