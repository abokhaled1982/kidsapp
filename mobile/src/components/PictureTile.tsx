// Bildfeld fuer die Kinderoberflaeche (Anforderungen 8: grosse Illustrationen,
// wenig Text). Das Bild ist heute ein Emoji aus pictures.ts; sobald die
// gezeichneten Illustrationen aus Abschnitt 10 vorliegen, wird stattdessen
// "source" gesetzt - die Bildschirme muessen dafuer nicht angefasst werden.

import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/store/useTheme";

type Props = {
  // Emoji-Bild zum Inhalt.
  pic?: string;
  // Gezeichnetes Bild, wenn vorhanden - hat Vorrang vor dem Emoji.
  source?: ImageSourcePropType;
  // Bild der Kategorie oder Lernstufe, wenn der Inhalt kein eigenes hat.
  fallback?: string;
  size?: number;
  // Untergrund: "muted" fuer Karten auf Flaeche, "primary" fuer farbige Karten.
  tone?: "surface" | "muted" | "primary";
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function PictureTile({ pic, source, fallback, size = 96, tone = "muted", label, style }: Props) {
  const c = useTheme();
  const image = pic ?? fallback;
  const background =
    tone === "primary" ? c.primary : tone === "surface" ? c.surface : c.surfaceMuted;
  const text = tone === "primary" ? c.onPrimary : c.text;

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: background,
            borderColor: tone === "primary" ? background : c.border,
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.28),
          },
        ]}
      >
        {source ? (
          <Image source={source} style={styles.image} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: Math.round(size * 0.54) }} allowFontScaling={false}>
            {image ?? "✨"}
          </Text>
        )}
      </View>
      {label ? (
        <Text style={[styles.label, { color: text }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 6 },
  tile: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { height: "100%", width: "100%" },
  label: { fontSize: 14, fontWeight: "700" },
});
