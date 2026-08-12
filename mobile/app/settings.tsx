import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBackend } from "@/store/useBackend";
import { pingHealth } from "@/lib/api";

export default function SettingsScreen() {
  const router = useRouter();
  const savedUrl = useBackend((s) => s.url);
  const setUrl = useBackend((s) => s.setUrl);
  const [draft, setDraft] = useState(savedUrl);
  const [check, setCheck] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  const save = async () => {
    setUrl(draft);
    setCheck("checking");
    const ok = await pingHealth(draft);
    setCheck(ok ? "ok" : "fail");
    if (ok) setTimeout(() => router.back(), 700);
  };

  const btnLabel =
    check === "checking" ? "Prüfe…" :
    check === "ok" ? "Gespeichert!" :
    check === "fail" ? "Nicht erreichbar" : "Speichern & Verbinden";

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Einstellungen</Text>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#334155" />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>Backend-URL</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="https://xxxx.trycloudflare.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Aus dem Colab-Notebook. Endet auf .trycloudflare.com.
          </Text>

          <Pressable onPress={save} style={styles.saveBtn}>
            <Ionicons name={check === "ok" ? "checkmark" : "cloud-upload"} size={22} color="white" />
            <Text style={styles.saveText}>{btnLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "white",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  body: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  label: { color: "#334155", fontSize: 14 },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  hint: { color: "#64748b", fontSize: 12 },
  saveBtn: {
    marginTop: 8,
    backgroundColor: "#3b82f6",
    borderRadius: 22,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: "white", fontSize: 15, fontWeight: "700" },
});
