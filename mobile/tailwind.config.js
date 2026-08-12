/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Kinder-freundliche Palette – warm, hoher Kontrast, klar unterscheidbar
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        accent: {
          500: "#f59e0b", // Bernstein für XP/Sterne
          600: "#d97706",
        },
        good: { 500: "#16a34a", 600: "#15803d" },
        mid:  { 500: "#eab308", 600: "#ca8a04" },
        bad:  { 500: "#dc2626", 600: "#b91c1c" },
        ink:  { 900: "#0f172a", 700: "#334155", 500: "#64748b", 300: "#cbd5e1" },
        paper: { 50: "#fafaf9", 100: "#f5f5f4" },
      },
      fontFamily: {
        display: ["Nunito_800ExtraBold"],
        body: ["Nunito_600SemiBold"],
        ar: ["Amiri_700Bold"],
      },
      borderRadius: {
        xl2: "22px",
      },
    },
  },
  plugins: [],
};
