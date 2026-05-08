import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';

/**
 * Loads and shows a one-shot interstitial. Safe to call with null/empty unitId (no-op).
 * Does not block the UI thread; runs load → show on LOADED.
 */
export function requestInterstitialShow(adUnitId) {
  if (!adUnitId || typeof adUnitId !== 'string' || !adUnitId.trim()) {
    return;
  }

  const ad = InterstitialAd.createForAdRequest(adUnitId.trim(), {
    requestNonPersonalizedAdsOnly: true,
  });

  const unsubs = [];
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    unsubs.forEach((u) => {
      try {
        u();
      } catch {
        /* ignore */
      }
    });
  };

  unsubs.push(
    ad.addAdEventListener(AdEventType.LOADED, () => {
      try {
        ad.show();
      } catch {
        cleanup();
      }
    })
  );
  unsubs.push(
    ad.addAdEventListener(AdEventType.ERROR, () => {
      cleanup();
    })
  );
  unsubs.push(
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      cleanup();
    })
  );

  try {
    ad.load();
  } catch {
    cleanup();
    return;
  }

  setTimeout(() => {
    cleanup();
  }, 45000);
}
