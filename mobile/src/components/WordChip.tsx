// Einzelner Wort-Chip mit animierter Farb- und Score-Uebergang.
// Zustaende:
//   pending   – grau, noch nicht gesprochen / bewertet
//   scanning  – Shimmer waehrend Server rechnet
//   good      – gruen (Score ≥ 75)
//   medium    – gelb (50 – 74)
//   bad       – rot (< 50)

import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  interpolateColor,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

export type WordChipState = "pending" | "scanning" | "good" | "medium" | "bad";

const COLORS: Record<WordChipState, { bg: string; border: string; text: string }> = {
  pending: { bg: "#f8fafc", border: "#e2e8f0", text: "#334155" },
  scanning:{ bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  good:    { bg: "#ecfdf5", border: "#86efac", text: "#166534" },
  medium:  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  bad:     { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
};

const STATE_INDEX: Record<WordChipState, number> = {
  pending: 0, scanning: 1, good: 2, medium: 3, bad: 4,
};

export function WordChip({
  word,
  state,
  score,
  onPress,
}: {
  word: string;
  state: WordChipState;
  score?: number;
  onPress?: () => void;
}) {
  const t   = useSharedValue<number>(STATE_INDEX[state]);
  const pop = useSharedValue<number>(1);
  const sh  = useSharedValue<number>(0);

  useEffect(() => {
    // Farbuebergang zum neuen Zustand
    t.value = withTiming(STATE_INDEX[state], { duration: 260, easing: Easing.out(Easing.cubic) });

    if (state === "scanning") {
      cancelAnimation(sh);
      sh.value = 0;
      sh.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(sh);
      sh.value = withTiming(0, { duration: 200 });
    }

    // Bounce beim Uebergang zu einem bewerteten Zustand
    if (state === "good" || state === "medium" || state === "bad") {
      pop.value = withSequence(
        withTiming(1.18, { duration: 130, easing: Easing.out(Easing.ease) }),
        withTiming(1,    { duration: 180, easing: Easing.inOut(Easing.ease) }),
      );
    }
  }, [state, t, pop, sh]);

  const animStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      t.value,
      [0, 1, 2, 3, 4],
      [COLORS.pending.bg, COLORS.scanning.bg, COLORS.good.bg, COLORS.medium.bg, COLORS.bad.bg],
    );
    const border = interpolateColor(
      t.value,
      [0, 1, 2, 3, 4],
      [COLORS.pending.border, COLORS.scanning.border, COLORS.good.border, COLORS.medium.border, COLORS.bad.border],
    );
    return {
      backgroundColor: bg,
      borderColor: border,
      transform: [{ scale: pop.value }],
      opacity: 0.85 + sh.value * 0.15,
    };
  });

  const animTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      t.value,
      [0, 1, 2, 3, 4],
      [COLORS.pending.text, COLORS.scanning.text, COLORS.good.text, COLORS.medium.text, COLORS.bad.text],
    ),
  }));

  const showScore = state === "good" || state === "medium" || state === "bad";

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Animated.View style={[styles.chip, animStyle]}>
        <Animated.Text
          allowFontScaling={false}
          style={[styles.arabic, animTextStyle]}
        >
          {word}
        </Animated.Text>
        {showScore ? (
          <Text style={[styles.score, { color: COLORS[state].text }]}>
            {Math.round(score ?? 0)}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
    marginHorizontal: 4,
    marginVertical: 6,
    minWidth: 48,
    alignItems: "center",
  },
  arabic: {
    fontSize: 30,
    lineHeight: 44,
    fontWeight: "600",
    writingDirection: "rtl",
    textAlign: "center",
  },
  score: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: -2,
    letterSpacing: 0.3,
  },
});
