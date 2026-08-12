import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#f8fafc" },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="play/[categoryId]" />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
