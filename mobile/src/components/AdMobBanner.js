import React, { useState } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useAds } from '../context/AdsContext';

/**
 * Loads AdMob banner unit id from API (Mongo-backed) via useAds().
 * Fixed BANNER size for broad device compatibility (adaptive inline can error on some setups).
 */
export default function AdMobBanner({ placementKey, style }) {
  const { getBannerUnitId, loading } = useAds();
  const unitId = getBannerUnitId(placementKey);
  const [failed, setFailed] = useState(false);

  if (loading || !unitId || failed) {
    return null;
  }

  return (
    <View style={[{ alignItems: 'center', overflow: 'hidden', marginTop: 8, minHeight: 50 }, style]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
