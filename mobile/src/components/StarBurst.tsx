import { View } from "react-native";
import { MotiView } from "moti";
import { Star } from "lucide-react-native";

/**
 * Sternexplosion, wenn ein Wort >= 75 gescored wurde. 6 Sterne fliegen radial nach außen.
 */
export function StarBurst({ show }: { show: boolean }) {
  if (!show) return null;
  const angles = [0, 60, 120, 180, 240, 300];
  return (
    <View
      style={{ pointerEvents: "none" }}
      className="absolute inset-0 items-center justify-center"
    >
      {angles.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const dx = Math.cos(rad) * 90;
        const dy = Math.sin(rad) * 90;
        return (
          <MotiView
            key={i}
            from={{ translateX: 0, translateY: 0, opacity: 1, scale: 0.4 }}
            animate={{ translateX: dx, translateY: dy, opacity: 0, scale: 1.2 }}
            transition={{ type: "timing", duration: 700, delay: i * 30 }}
            style={{ position: "absolute" }}
          >
            <Star size={28} color="#f59e0b" fill="#fbbf24" />
          </MotiView>
        );
      })}
    </View>
  );
}
