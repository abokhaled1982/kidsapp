module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Muss der letzte Plugin sein und passt zu Reanimated 3.x (SDK 52).
      "react-native-reanimated/plugin",
    ],
  };
};
