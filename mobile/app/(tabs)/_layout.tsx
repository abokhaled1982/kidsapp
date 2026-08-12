import { Tabs } from "expo-router";
import { Mic, BookOpen, Gamepad2, Trophy } from "lucide-react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: { fontWeight: "700", fontSize: 12 },
        tabBarStyle: { height: 68, paddingBottom: 12, paddingTop: 8 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Aussprache", tabBarIcon: ({ color, size }) => <Mic color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="quran"
        options={{ title: "Qur'an", tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="games"
        options={{ title: "Spiele", tabBarIcon: ({ color, size }) => <Gamepad2 color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="rewards"
        options={{ title: "Belohnungen", tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} /> }}
      />
    </Tabs>
  );
}
