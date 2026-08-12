import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gamepad2 } from "lucide-react-native";

export default function GamesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper-50 items-center justify-center px-8" edges={["top"]}>
      <Gamepad2 size={72} color="#7c3aed" />
      <Text className="font-display text-2xl text-ink-900 mt-6">Spiele</Text>
      <Text className="font-body text-ink-500 text-center mt-2">
        Buchstaben-Matching, Wort-Puzzle, Höre-und-Wähle – bald verfügbar.
      </Text>
    </SafeAreaView>
  );
}
