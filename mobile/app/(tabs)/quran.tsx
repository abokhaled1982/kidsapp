import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function QuranScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.emoji}>🕌</Text>
        <Text style={styles.title}>Qurʾān Modus</Text>
        <Text style={styles.sub}>Kommt bald — Sura al-Fātiḥa mit Tajwīd-Feedback.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  sub: { color: "#64748b", textAlign: "center", marginTop: 8 },
});
