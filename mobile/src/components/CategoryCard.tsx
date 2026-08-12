import { View, Text, TouchableOpacity } from "react-native";
import { MotiView } from "moti";
import { LinearGradient } from "expo-linear-gradient";
import type { Category } from "@/data/categories";

export function CategoryCard({
  category,
  progressPct,
  onPress,
  index,
}: {
  category: Category;
  progressPct: number;
  onPress: () => void;
  index: number;
}) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 24 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "spring", damping: 14, delay: index * 60 }}
      className="flex-1"
    >
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <LinearGradient
          colors={["#ffffff", "#f5f5f4"]}
          className="rounded-xl2 p-4 border border-ink-300/40 shadow-sm"
          style={{ borderRadius: 22, padding: 16 }}
        >
          <View className={`w-14 h-14 rounded-2xl items-center justify-center ${category.bg}`}>
            <Text className="text-3xl">{category.emoji}</Text>
          </View>
          <Text className="font-display text-lg mt-3">{category.title}</Text>
          <Text className="font-ar text-right text-ink-500 text-base mt-1" style={{ writingDirection: "rtl" }}>
            {category.arabic}
          </Text>
          <View className="h-2 bg-ink-300/40 rounded-full mt-3 overflow-hidden">
            <View
              className="h-full bg-accent-500"
              style={{ width: `${Math.round(progressPct * 100)}%` }}
            />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </MotiView>
  );
}
