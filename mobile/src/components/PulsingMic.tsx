import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";
import { useTheme } from "@/store/useTheme";

/** `level` ist der Mikrofonpegel 0..1 (aus useTrackVolume), nicht dB. */
type Props = { active: boolean; level: number };

export function PulsingMic({ active, level }: Props) {
  const c = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.15, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale]);

  // Schwelle empirisch: Zimmerlautstaerke liegt bei useTrackVolume klar unter
  // 0.1, ein gesprochenes Wort darueber.
  const loud = (level ?? 0) > 0.1;

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.circle,
          {
            transform: [{ scale }],
            // Laut = die klare Aufnahme-Farbe, leise = der ruhigere Sekundaerton.
            backgroundColor: loud ? c.recording : c.secondary,
            shadowColor: c.text,
          },
        ]}
      >
        <Animated.Text style={styles.icon}>🎤</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  circle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  icon: { fontSize: 40 },
});
