import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/store/useTheme";

export default function TabsLayout() {
  const c = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Aussprache",
          tabBarIcon: ({ color, size }) => <Ionicons name="mic" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="quran"
        options={{
          title: "Qurʾān",
          tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: "Spiele",
          tabBarIcon: ({ color, size }) => <Ionicons name="game-controller" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: "Sterne",
          tabBarIcon: ({ color, size }) => <Ionicons name="star" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
