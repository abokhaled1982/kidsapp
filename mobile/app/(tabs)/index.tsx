import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { CATEGORIES } from "@/data/categories";
import { WORDS } from "@/data/words";
import { CategoryCard } from "@/components/CategoryCard";
import { useProgress, level } from "@/store/useProgress";

export default function AussprachHome() {
  const router = useRouter();
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const mastered = useProgress((s) => s.wordsMastered);

  const lv = level(xp);

  return (
    <SafeAreaView className="flex-1 bg-paper-50" edges={["top"]}>
      <View className="px-5 py-4 flex-row items-center justify-between">
        <View>
          <Text className="font-display text-2xl text-ink-900">Salām 👋</Text>
          <Text className="font-body text-ink-500 mt-0.5">Lass uns Arabisch lernen!</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/settings" as any)}
          className="w-11 h-11 rounded-full bg-white border border-ink-300/40 items-center justify-center"
        >
          <Settings size={20} color="#334155" />
        </TouchableOpacity>
      </View>

      <View className="mx-5 mb-3 rounded-xl2 p-4 bg-brand-500" style={{ borderRadius: 22 }}>
        <Text className="text-white font-body text-sm opacity-90">Dein Level</Text>
        <View className="flex-row items-end justify-between mt-1">
          <Text className="text-white font-display text-4xl">Lvl {lv}</Text>
          <View className="flex-row gap-4">
            <Stat label="XP" value={xp} />
            <Stat label="Sterne" value={stars} />
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 12 }}>
        <Text className="font-display text-lg text-ink-900 mb-1">Kategorien</Text>
        <View className="flex-row flex-wrap gap-3">
          {CATEGORIES.map((cat, i) => {
            const items = WORDS[cat.id] ?? [];
            const masteredCount = items.filter((w) => (mastered[`${cat.id}:${w.ar}`] ?? 0) >= 75).length;
            const pct = items.length ? masteredCount / items.length : 0;
            return (
              <View key={cat.id} className="w-[47%]">
                <CategoryCard
                  category={cat}
                  index={i}
                  progressPct={pct}
                  onPress={() => router.push(`/play/${cat.id}` as any)}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-end">
      <Text className="text-white font-display text-xl">{value}</Text>
      <Text className="text-white/80 font-body text-xs">{label}</Text>
    </View>
  );
}
