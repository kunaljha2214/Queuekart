/**
 * Used by Metro when `react-native-google-mobile-ads` is not installed
 * (see metro.config.js). Keeps the JS bundle buildable; ads stay disabled.
 */
export default function mobileAds() {
  return {
    initialize: () => Promise.resolve(),
  };
}
