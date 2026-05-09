import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import mobileAds, { TestIds } from 'react-native-google-mobile-ads';
import { client } from '../services/api';
import { FORCE_ADMOB_TEST_IDS } from '../config/api';

function useTestIdFallback() {
  if (FORCE_ADMOB_TEST_IDS) return true;
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

const AdsContext = createContext({
  placements: [],
  loading: true,
  refreshedAt: null,
  refresh: async () => {},
  getBannerUnitId: (_placementKey) => null,
  getInterstitialUnitId: (_placementKey) => null,
});

export function AdsProvider({ children }) {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await client.get('/ads/config', {
        params: { platform: Platform.OS },
      });
      setPlacements(Array.isArray(data?.placements) ? data.placements : []);
      setRefreshedAt(Date.now());
    } catch {
      setPlacements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        try {
          const init = mobileAds;
          if (typeof init === 'function') {
            await init().initialize();
          }
        } catch {
          /* non-fatal: app works without ads */
        }
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const getBannerUnitId = useCallback(
    (placementKey) => {
      const row = placements.find(
        (x) => x.placementKey === placementKey && String(x.adType).toLowerCase() === 'banner'
      );
      const id = row?.adUnitId;
      if (typeof id === 'string' && id.trim()) return id.trim();
      if (useTestIdFallback() && TestIds?.BANNER) return TestIds.BANNER;
      return null;
    },
    [placements]
  );

  const getInterstitialUnitId = useCallback(
    (placementKey) => {
      const row = placements.find(
        (x) => x.placementKey === placementKey && String(x.adType).toLowerCase() === 'interstitial'
      );
      const id = row?.adUnitId;
      if (typeof id === 'string' && id.trim()) return id.trim();
      if (useTestIdFallback() && TestIds?.INTERSTITIAL) return TestIds.INTERSTITIAL;
      return null;
    },
    [placements]
  );

  const value = useMemo(
    () => ({
      placements,
      loading,
      refreshedAt,
      refresh,
      getBannerUnitId,
      getInterstitialUnitId,
    }),
    [placements, loading, refreshedAt, refresh, getBannerUnitId, getInterstitialUnitId]
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds() {
  return useContext(AdsContext);
}
