import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBackend } from "@/store/useBackend";
import { pingHealth } from "@/lib/api";
import { closeStreamSession, StreamSession } from "@/lib/stream";

export default function SettingsScreen() {
  const router = useRouter();
  const savedUrl = useBackend((s) => s.url);
  const setUrl = useBackend((s) => s.setUrl);
  const [draft, setDraft] = useState(savedUrl);
  const [check, setCheck] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [diag, setDiag] = useState<string | null>(null);

  const save = async () => {
    setUrl(draft);
    closeStreamSession();
    setCheck("checking");
    const ok = await pingHealth(draft);
    setCheck(ok ? "ok" : "fail");
    if (ok) setTimeout(() => router.back(), 700);
  };

  const runDiagnostic = async () => {
    const url = draft || savedUrl;
    if (!url) { setDiag("❌ Keine Backend-URL gesetzt."); return; }
    setDiag("Verbinde WebSocket …");
    const s = new StreamSession(url);
    const t0 = Date.now();
    try {
      await s.ensureConnected();
      setDiag(`✅ WebSocket verbunden in ${Date.now() - t0} ms\n   ${url.replace(/^http/, "ws")}/stream`);
    } catch (e: any) {
      setDiag(`❌ WebSocket-Fehler: ${e?.message ?? e}`);
    } finally {
      s.close();
    }
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
            placeholder="https://xxxx.ngrok-free.app"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Aus dem Colab-Notebook. Endet auf .ngrok-free.app.
          </Text>

          <Pressable onPress={save} style={styles.saveBtn}>
            <Ionicons name={check === "ok" ? "checkmark" : "cloud-upload"} size={22} color="white" />
            <Text style={styles.saveText}>{btnLabel}</Text>
          </Pressable>

          <View style={styles.toggleCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>⚡ WebSocket-Modus</Text>
              <Text style={styles.toggleHint}>
                Bewertung läuft über eine persistente WebSocket-Verbindung.
                HTTP wurde entfernt — fällt der Tunnel aus, zeigt die App eine
                Fehlermeldung an.
              </Text>
            </View>
          </View>

          <Pressable onPress={runDiagnostic} style={styles.diagBtn}>
            <Ionicons name="pulse" size={18} color="#334155" />
            <Text style={styles.diagBtnText}>Backend & WebSocket testen</Text>
          </Pressable>
          {diag ? (
            <ScrollView style={styles.diagBox} contentContainerStyle={{ padding: 12 }}>
              <Text style={styles.diagText}>{diag}</Text>
            </ScrollView>
          ) : null}
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
  toggleCard: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  toggleTitle: { color: "#0f172a", fontSize: 15, fontWeight: "700" },
  toggleHint: { color: "#64748b", fontSize: 12, marginTop: 4, lineHeight: 16 },
  diagBtn: {
    marginTop: 16,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  diagBtnText: { color: "#334155", fontSize: 14, fontWeight: "700" },
  diagBox: {
    marginTop: 8,
    maxHeight: 200,
    backgroundColor: "#0f172a",
    borderRadius: 12,
  },
  diagText: { color: "#e2e8f0", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});
