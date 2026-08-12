import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";

type Props = { active: boolean; level: number };

export function PulsingMic({ active, level }: Props) {
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

  const loud = (level ?? -60) > -35;

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.circle,
          {
            transform: [{ scale }],
            backgroundColor: loud ? "#ef4444" : "#f43f5e",
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
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  icon: { fontSize: 40 },
});
