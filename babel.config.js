// Resolved through expo so the preset always matches the installed SDK.
const expoPreset = require.resolve('babel-preset-expo', {
  paths: [require.resolve('expo/package.json')],
});

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [expoPreset],
    // Drizzle migrations are bundled as SQL strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
