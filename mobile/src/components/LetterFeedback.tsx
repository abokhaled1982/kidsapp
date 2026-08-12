import { View, Text } from "react-native";
import { MotiView, MotiText } from "moti";
import type { AssessUnit } from "@/lib/api";

export function LetterFeedback({ units }: { units: AssessUnit[] }) {
  return (
    <View className="flex-row-reverse flex-wrap justify-center items-center gap-x-2 py-2">
      {units.map((u, i) => {
        const color =
          u.score >= 75 ? "text-good-500" :
          u.score >= 50 ? "text-mid-500"  :
                          "text-bad-500";
        return (
          <MotiText
            key={i}
            from={{ opacity: 0, translateY: 12, scale: 0.8 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: "spring", damping: 12, delay: i * 80 }}
            className={`font-ar text-[64px] leading-[76px] ${color}`}
          >
            {u.label}
          </MotiText>
        );
      })}
    </View>
  );
}
