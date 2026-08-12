import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Star, Flame, Trophy } from "lucide-react-native";
import { MotiView } from "moti";
import { useProgress, level, xpForNextLevel } from "@/store/useProgress";

export default function RewardsScreen() {
  const xp = useProgress((s) => s.xp);
  const stars = useProgress((s) => s.stars);
  const streak = useProgress((s) => s.streakDays);
  const lv = level(xp);
  const next = xpForNextLevel(xp);
  const prev = Math.pow(lv - 1, 2) * 25;
  const pct = Math.min(1, Math.max(0, (xp - prev) / (next - prev || 1)));

  return (
    <SafeAreaView className="flex-1 bg-paper-50" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text className="font-display text-2xl text-ink-900">Belohnungen</Text>

        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "spring", damping: 14 }}
          className="rounded-xl2 p-5 bg-brand-500"
          style={{ borderRadius: 22 }}
        >
          <Text className="text-white/80 font-body">Level</Text>
          <Text className="text-white font-display text-5xl mt-1">Lvl {lv}</Text>
          <View className="h-3 bg-white/20 rounded-full mt-4 overflow-hidden">
            <View className="h-full bg-white" style={{ width: `${pct * 100}%` }} />
          </View>
          <Text className="text-white/80 font-body text-xs mt-2">
            {xp} / {next} XP bis Lvl {lv + 1}
          </Text>
        </MotiView>

        <View className="flex-row gap-3">
          <Card icon={<Star size={28} color="#f59e0b" fill="#fbbf24" />} label="Sterne" value={stars} />
          <Card icon={<Flame size={28} color="#dc2626" />} label="Streak" value={`${streak}d`} />
          <Card icon={<Trophy size={28} color="#2563eb" />} label="XP" value={xp} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <View
      className="flex-1 rounded-xl2 p-4 bg-white border border-ink-300/40 items-center"
      style={{ borderRadius: 22 }}
    >
      {icon}
      <Text className="font-display text-xl text-ink-900 mt-2">{value}</Text>
      <Text className="font-body text-xs text-ink-500 mt-0.5">{label}</Text>
    </View>
  );
}
