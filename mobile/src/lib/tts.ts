import * as Speech from "expo-speech";

export function speakArabic(text: string, onDone?: () => void) {
  Speech.stop();
  Speech.speak(text, {
    language: "ar",
    rate: 0.75,
    pitch: 1.05,
    onDone: () => onDone?.(),
    onStopped: () => onDone?.(),
    onError: () => onDone?.(),
  });
}

export function stopSpeaking() {
  Speech.stop();
}
