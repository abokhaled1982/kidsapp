import { View, Text, StyleSheet } from "react-native";

export function StarBurst({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.star}>⭐</Text>
      <Text style={styles.star}>✨</Text>
      <Text style={styles.star}>⭐</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: -30,
    flexDirection: "row",
    gap: 12,
  },
  star: { fontSize: 32 },
});
