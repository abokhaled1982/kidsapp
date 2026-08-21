import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/store/useTheme";

// WebRTC-Globals fuer LiveKit einrichten. Muss laufen, bevor irgendein
// livekit-client-Code laeuft - deshalb im Modul-Scope der Root-Route und nicht
// in einem Effect. Auf iOS konfiguriert das auch die AVAudioSession automatisch;
// die Android-Audio-Session macht livekit-stream.ts beim Verbinden auf.
//
// Der native WebRTC-Code ist nur im EAS Dev-Client verfuegbar. In Expo Go
// existiert das native Modul nicht, deshalb fangen wir den Fehler ab, damit
// alle nicht-LiveKit-Screens trotzdem funktionieren.
try {
  const { registerGlobals } = require("@livekit/react-native");
  registerGlobals();
} catch (e) {
  console.warn("[LiveKit] WebRTC native module not available – LiveKit features disabled.", e);
}

export default function RootLayout() {
  const c = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="letters" />
        <Stack.Screen name="level" />
        <Stack.Screen name="play/[categoryId]" />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
