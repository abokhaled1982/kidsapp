import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/store/useTheme";

// Richtet die WebRTC-Globals ein (siehe src/lib/webrtc.ts) und faengt das
// fehlende native Modul ab, damit alle nicht-LiveKit-Screens auch in Expo Go
// laufen. Import nur wegen des Seiteneffekts.
import "@/lib/webrtc";

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
