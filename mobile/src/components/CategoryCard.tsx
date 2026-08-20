import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Category } from "@/data/categories";
import { useTheme } from "@/store/useTheme";

type Props = {
  category: Category;
  progressPct: number;
  onPress: () => void;
};

export function CategoryCard({ category, progressPct, onPress }: Props) {
  const c = useTheme();
  // Farbe kommt aus dem gewaehlten Theme; category.color bleibt Fallback.
  const bg = c.categories[category.id] ?? category.color;
  const fg = c.onPrimary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={styles.emoji}>{category.emoji}</Text>
      <Text style={[styles.title, { color: fg }]}>{category.title}</Text>
      <Text style={[styles.arabic, { color: fg }]} numberOfLines={1}>
        {category.arabic}
      </Text>
      <View style={styles.progressBg}>
        <View
          style={[styles.progressFill, { backgroundColor: fg, width: `${Math.round(progressPct * 100)}%` }]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 16,
    height: 140,
    justifyContent: "space-between",
  },
  emoji: { fontSize: 34 },
  title: { fontSize: 18, fontWeight: "700" },
  arabic: { fontSize: 18, opacity: 0.9 },
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
});
