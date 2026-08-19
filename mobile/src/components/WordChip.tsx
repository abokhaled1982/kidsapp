// Einzelner Wort-Chip mit animierter Farb- und Score-Uebergang.
// Zustaende:
//   pending   – ruhig, noch nicht gesprochen / bewertet
//   scanning  – Shimmer waehrend Server rechnet
//   good      – Score ≥ 75
//   medium    – 50 – 74
//   bad       – < 50
// Die konkreten Farben kommen aus dem gewaehlten Theme (useTheme).

import { useEffect, useMemo } from "react";
import { Text, StyleSheet, Pressable } from "react-native";
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

import { useTheme } from "@/store/useTheme";

export type WordChipState = "pending" | "scanning" | "good" | "medium" | "bad";

const STATE_INDEX: Record<WordChipState, number> = {
  pending: 0, scanning: 1, good: 2, medium: 3, bad: 4,
};

const RAMP = [0, 1, 2, 3, 4];

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
  const c = useTheme();
  const t   = useSharedValue<number>(STATE_INDEX[state]);
  const pop = useSharedValue<number>(1);
  const sh  = useSharedValue<number>(0);

  // Die Farbreihen werden im Render gebaut und als Dependency in das
  // Worklet gegeben — sonst friert das Worklet die Farben des ersten
  // Themes ein und ein Theme-Wechsel wuerde nicht ankommen.
  const bgs = useMemo(
    () => [c.pending.bg, c.scanning.bg, c.good.bg, c.medium.bg, c.bad.bg],
    [c],
  );
  const borders = useMemo(
    () => [c.pending.border, c.scanning.border, c.good.border, c.medium.border, c.bad.border],
    [c],
  );
  const texts = useMemo(
    () => [c.pending.text, c.scanning.text, c.good.text, c.medium.text, c.bad.text],
    [c],
  );

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

  const animStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(t.value, RAMP, bgs),
      borderColor: interpolateColor(t.value, RAMP, borders),
      transform: [{ scale: pop.value }],
      opacity: 0.85 + sh.value * 0.15,
    }),
    [bgs, borders],
  );

  const animTextStyle = useAnimatedStyle(
    () => ({ color: interpolateColor(t.value, RAMP, texts) }),
    [texts],
  );

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
          <Text style={[styles.score, { color: c[state].text }]}>
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
