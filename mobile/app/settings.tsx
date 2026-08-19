import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useBackend } from "@/store/useBackend";
import { useProfile } from "@/store/useProfile";
import { useTheme } from "@/store/useTheme";
import { themeForStyle } from "@/store/profileFlow";
import { PROFILE_THEMES, type ProfileStyle } from "@/store/profileModel";
import { pingHealth } from "@/lib/api";
import { closeStreamSession, StreamSession } from "@/lib/stream";

const STYLE_OPTIONS: { value: ProfileStyle; emoji: string; label: string }[] = [
  { value: "girl", emoji: "🌸", label: "Mädchen" },
  { value: "boy", emoji: "🚀", label: "Junge" },
  { value: "neutral", emoji: "🌿", label: "Neutral" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const c = useTheme();
  const savedUrl = useBackend((s) => s.url);
  const savedToken = useBackend((s) => s.token);
  const setUrl = useBackend((s) => s.setUrl);
  const setToken = useBackend((s) => s.setToken);
  const profile = useProfile((s) => s.profile);
  const updateProfile = useProfile((s) => s.updateProfile);
  const clearProfile = useProfile((s) => s.clearProfile);
  const [draft, setDraft] = useState(savedUrl);
  const [draftToken, setDraftToken] = useState(savedToken);
  const [check, setCheck] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [diag, setDiag] = useState<string | null>(null);

  const save = async () => {
    setUrl(draft);
    setToken(draftToken);
    closeStreamSession();
    setCheck("checking");
    const ok = await pingHealth(draft, draftToken);
    setCheck(ok ? "ok" : "fail");
    if (ok) setTimeout(() => router.back(), 700);
  };

  const runDiagnostic = async () => {
    const url = draft || savedUrl;
    const token = draftToken || savedToken;
    if (!url) { setDiag("❌ Keine Backend-URL gesetzt."); return; }
    setDiag("Verbinde WebSocket …");
    const s = new StreamSession(url, token);
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

  // Stil UND Theme zusammen schreiben, sonst laufen die beiden Felder auseinander.
  const pickStyle = (style: ProfileStyle) => {
    updateProfile({ style, theme: themeForStyle(style) });
  };

  const resetProfile = () => {
    clearProfile();
    router.replace("/onboarding" as any);
  };

  const btnLabel =
    check === "checking" ? "Prüfe…" :
    check === "ok" ? "Gespeichert!" :
    check === "fail" ? "Nicht erreichbar" : "Speichern & Verbinden";

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: c.text }]}>Einstellungen</Text>
            <Pressable
              onPress={() => router.back()}
              style={[styles.closeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <Ionicons name="close" size={22} color={c.text} />
            </Pressable>
          </View>

          <View style={styles.body}>
            <Text style={[styles.label, { color: c.text }]}>Backend-URL</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="https://xxxx.modal.run"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
            />
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Modal-Deployment (z. B. https://…--quran-asr-asr-web.modal.run).
            </Text>

            <Text style={[styles.label, { color: c.text, marginTop: 12 }]}>Auth-Token</Text>
            <TextInput
              value={draftToken}
              onChangeText={setDraftToken}
              placeholder="Bearer-Token vom Backend"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
            />
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Wird als ?token=… an /stream angehängt. Leer lassen, wenn Backend ohne Auth.
            </Text>

            <Pressable onPress={save} style={[styles.saveBtn, { backgroundColor: c.primary }]}>
              <Ionicons name={check === "ok" ? "checkmark" : "cloud-upload"} size={22} color={c.onPrimary} />
              <Text style={[styles.saveText, { color: c.onPrimary }]}>{btnLabel}</Text>
            </Pressable>

            <View style={[styles.toggleCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleTitle, { color: c.text }]}>⚡ WebSocket-Modus</Text>
                <Text style={[styles.toggleHint, { color: c.textMuted }]}>
                  Bewertung läuft über eine persistente WebSocket-Verbindung.
                  HTTP wurde entfernt — fällt der Tunnel aus, zeigt die App eine
                  Fehlermeldung an.
                </Text>
              </View>
            </View>

            {profile ? (
              <View style={[styles.colorCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.toggleTitle, { color: c.text }]}>🎨 Farben</Text>
                <Text style={[styles.toggleHint, { color: c.textMuted }]}>
                  Färbt die ganze App sofort um — kein Neustart nötig.
                </Text>
                <View style={styles.styleRow}>
                  {STYLE_OPTIONS.map((opt) => {
                    const tint = PROFILE_THEMES[themeForStyle(opt.value)].primary;
                    const active = profile.style === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => pickStyle(opt.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.styleChip,
                          {
                            backgroundColor: active ? tint : c.surfaceMuted,
                            borderColor: tint,
                            borderWidth: active ? 2 : 1,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.styleEmoji}>{opt.emoji}</Text>
                        <Text
                          style={[
                            styles.styleLabel,
                            { color: active ? c.onPrimary : c.text },
                          ]}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                        {active ? (
                          <Ionicons name="checkmark-circle" size={16} color={c.onPrimary} />
                        ) : (
                          <View style={[styles.styleDot, { backgroundColor: tint }]} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Pressable
              onPress={runDiagnostic}
              style={[styles.diagBtn, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}
            >
              <Ionicons name="pulse" size={18} color={c.text} />
              <Text style={[styles.diagBtnText, { color: c.text }]}>Backend & WebSocket testen</Text>
            </Pressable>
            <Pressable
              onPress={resetProfile}
              style={[styles.profileBtn, { backgroundColor: c.bad.bg, borderColor: c.bad.border }]}
            >
              <Ionicons name="person-circle-outline" size={18} color={c.bad.text} />
              <Text style={[styles.profileBtnText, { color: c.bad.text }]}>Profil neu einrichten</Text>
            </Pressable>
            {diag ? (
              <ScrollView style={styles.diagBox} contentContainerStyle={{ padding: 12 }} nestedScrollEnabled>
                <Text style={styles.diagText}>{diag}</Text>
              </ScrollView>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 32 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: "700" },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  body: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  label: { fontSize: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  hint: { fontSize: 12 },
  saveBtn: {
    marginTop: 8,
    borderRadius: 22,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { fontSize: 15, fontWeight: "700" },
  toggleCard: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  toggleTitle: { fontSize: 15, fontWeight: "700" },
  toggleHint: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  colorCard: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  styleRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  styleChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  styleEmoji: { fontSize: 18 },
  styleLabel: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  styleDot: { width: 10, height: 10, borderRadius: 5 },
  diagBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  diagBtnText: { fontSize: 14, fontWeight: "700" },
  profileBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  profileBtnText: { fontSize: 14, fontWeight: "700" },
  diagBox: {
    marginTop: 8,
    maxHeight: 200,
    backgroundColor: "#0f172a",
    borderRadius: 12,
  },
  diagText: { color: "#e2e8f0", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});
