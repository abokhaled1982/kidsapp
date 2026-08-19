import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/store/useTheme";

export default function GamesScreen() {
  const c = useTheme();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.center}>
        <Text style={styles.emoji}>🎮</Text>
        <Text style={[styles.title, { color: c.text }]}>Spiele</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>Memory, Buchstaben-Puzzle & mehr kommen bald.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { textAlign: "center", marginTop: 8 },
});
