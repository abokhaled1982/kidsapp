import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BookOpen } from "lucide-react-native";

export default function QuranScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper-50 items-center justify-center px-8" edges={["top"]}>
      <BookOpen size={72} color="#059669" />
      <Text className="font-display text-2xl text-ink-900 mt-6">Qur'an-Modus</Text>
      <Text className="font-body text-ink-500 text-center mt-2">
        Kurze Suren mit Tajweed-Feedback – kommt in der nächsten Version.
      </Text>
    </SafeAreaView>
  );
}
