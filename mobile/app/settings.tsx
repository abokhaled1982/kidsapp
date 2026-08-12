import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { X, Check, HeartHandshake } from "lucide-react-native";
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

  return (
    <SafeAreaView className="flex-1 bg-paper-50">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-5 py-3">
          <Text className="font-display text-xl text-ink-900">Einstellungen</Text>
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-white items-center justify-center border border-ink-300/40">
            <X size={20} color="#334155" />
          </TouchableOpacity>
        </View>

        <View className="px-5 pt-4 gap-3">
          <Text className="font-body text-ink-700">Backend-URL</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="https://xxxx.trycloudflare.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            className="bg-white border border-ink-300/40 rounded-xl2 px-4 py-3 font-body text-ink-900"
            style={{ borderRadius: 22 }}
          />
          <Text className="font-body text-xs text-ink-500">
            Aus dem Colab-Notebook wav2vec2_arabic_pronunciation.ipynb. Endet auf .trycloudflare.com.
          </Text>

          <TouchableOpacity
            onPress={save}
            className="mt-2 py-4 rounded-xl2 bg-brand-500 items-center flex-row justify-center gap-2"
            style={{ borderRadius: 22 }}
          >
            {check === "ok" ? <Check color="white" size={22} /> : <HeartHandshake color="white" size={22} />}
            <Text className="text-white font-display text-base">
              {check === "checking" ? "Prüfe…" : check === "ok" ? "Gespeichert!" : check === "fail" ? "Nicht erreichbar" : "Speichern & Verbinden"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
