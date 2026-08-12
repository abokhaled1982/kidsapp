import { View } from "react-native";
import { MotiView } from "moti";
import { Mic } from "lucide-react-native";

export function PulsingMic({ active, level }: { active: boolean; level: number }) {
  // level in dB, ca -60..0 → auf 0..1 mappen
  const norm = Math.max(0, Math.min(1, (level + 60) / 60));
  const scale = active ? 1 + norm * 0.35 : 1;
  return (
    <View className="items-center justify-center">
      <MotiView
        from={{ scale: 0.9 }}
        animate={{ scale }}
        transition={{ type: "timing", duration: 90 }}
        className={`w-32 h-32 rounded-full items-center justify-center ${
          active ? "bg-bad-500" : "bg-ink-300"
        }`}
      >
        <Mic size={56} color="white" />
      </MotiView>
    </View>
  );
}
