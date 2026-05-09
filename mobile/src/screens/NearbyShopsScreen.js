import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { client } from '../services/api';
import ThemeToggleSwitch from '../components/ThemeToggleSwitch';
import AdMobBanner from '../components/AdMobBanner';
import { PLACEMENT_NEARBY_SHOPS_HEADER } from '../constants/adPlacements';
import Feather from 'react-native-vector-icons/Feather';
import { appAlert } from '../utils/appAlert';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    return Geolocation.requestAuthorization('whenInUse');
  }
  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return fine === PermissionsAndroid.RESULTS.GRANTED;
}

export default function NearbyShopsScreen({ navigation }) {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [coords, setCoords] = useState(null);
  const [shops, setShops] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastError, setLastError] = useState('');
  const [sortMode, setSortMode] = useState('closest'); // 'closest' | 'leastQueue'

  const colors = useMemo(() => {
    if (isDark) {
      return {
        bg: '#0b1220',
        surface: '#0f172a',
        border: '#243047',
        text: '#f8fafc',
        muted: '#94a3b8',
        subtle: '#64748b',
        inputBg: '#0b1220',
        primary: '#60a5fa',
      };
    }
    return {
      bg: '#f8f9fa',
      surface: '#ffffff',
      border: '#e2e8f0',
      text: '#0f172a',
      muted: '#475569',
      subtle: '#64748b',
      inputBg: '#ffffff',
      primary: '#2563eb',
    };
  }, [isDark]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={{ color: colors.subtle, fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark, colors.subtle]);

  const fetchNearby = useCallback(async (lat, lng) => {
    const { data } = await client.get('/shops/nearby', {
      params: { lat, lng, maxDistance: 10000 },
    });
    setShops(data.shops || []);
  }, []);

  const refreshFromCurrentLocation = useCallback(async (opts) => {
    const mode = opts?.mode || 'loading'; // 'loading' | 'refresh'
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setLastError('');
    const ok = await ensureLocationPermission();
    if (!ok) {
      appAlert('Location needed', 'Allow location to find shops near you.');
      setLastError('Location permission denied.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    Geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          setCoords({ latitude, longitude });
          await fetchNearby(latitude, longitude);
        } catch (e) {
          const msg = e?.message || 'Could not load nearby shops.';
          setLastError(msg);
          appAlert('Error', msg);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      (err) => {
        appAlert('Location error', err.message);
        setLastError(err?.message || 'Location error.');
        setLoading(false);
        setRefreshing(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, [fetchNearby]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshFromCurrentLocation({ mode: 'loading' });
      } catch (e) {
        if (!mounted) return;
        const msg = e?.message || 'Could not load';
        setLastError(msg);
        appAlert('Error', msg);
        setLoading(false);
        setRefreshing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshFromCurrentLocation]);

  function haversineKm(a, b) {
    if (!a || !b) return null;
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? shops
      : shops.filter((s) => {
          const name = String(s.name || '').toLowerCase();
          const addr = String(s.address || '').toLowerCase();
          return name.includes(q) || addr.includes(q);
        });

    const sorted = [...list];
    if (sortMode === 'leastQueue') {
      sorted.sort((a, b) => (Number(a.queueCount) || 0) - (Number(b.queueCount) || 0));
      return sorted;
    }

    if (!coords) return sorted;
    sorted.sort((a, b) => {
      const aC = a?.location?.coordinates;
      const bC = b?.location?.coordinates;
      const aKm =
        Array.isArray(aC) && aC.length >= 2
          ? haversineKm(coords, { latitude: aC[1], longitude: aC[0] })
          : Number.POSITIVE_INFINITY;
      const bKm =
        Array.isArray(bC) && bC.length >= 2
          ? haversineKm(coords, { latitude: bC[1], longitude: bC[0] })
          : Number.POSITIVE_INFINITY;
      return (Number.isFinite(aKm) ? aKm : 1e9) - (Number.isFinite(bKm) ? bKm : 1e9);
    });
    return sorted;
  }, [shops, query, sortMode, coords]);

  const Chip = useCallback(
    ({ label, active, onPress }) => (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
      >
        <Text style={[styles.chipText, { color: active ? '#ffffff' : colors.text }]}>
          {label}
        </Text>
      </TouchableOpacity>
    ),
    [colors]
  );

  const LocationChip = useCallback(
    ({ onPress }) => (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={[
          styles.locChip,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name="map-pin" size={18} color={colors.primary} />
        )}
        <View style={{ marginLeft: 8 }}>
          <Text style={[styles.locChipText, { color: colors.text }]}>Current location</Text>
          {coords ? (
            <Text style={[styles.locChipSub, { color: colors.subtle }]}>
              {coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [colors, refreshing, coords]
  );

  const listHeader = useMemo(() => {
    return (
      <View style={styles.headerWrap}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Find Nearby Shops</Text>
            <Text style={[styles.screenSubTitle, { color: colors.subtle }]}>
              Wait less, Live more.
            </Text>
          </View>
          <ThemeToggleSwitch isDark={isDark} onToggle={toggleTheme} />
        </View>

        <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Feather name="search" size={18} color={colors.subtle} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search shops"
            placeholderTextColor={colors.subtle}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={18} color={colors.subtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.chipRow}>
          <Chip label="Closest" active={sortMode === 'closest'} onPress={() => setSortMode('closest')} />
          <View style={{ width: 8 }} />
          <Chip
            label="Least queue"
            active={sortMode === 'leastQueue'}
            onPress={() => setSortMode('leastQueue')}
          />
          <View style={{ width: 8 }} />
          <LocationChip onPress={() => refreshFromCurrentLocation({ mode: 'refresh' })} />
        </View>

        <AdMobBanner placementKey={PLACEMENT_NEARBY_SHOPS_HEADER} />
      </View>
    );
  }, [colors, query, refreshFromCurrentLocation, sortMode, Chip, LocationChip]);

  const emptyComponent = useMemo(() => {
    return (
      <View style={styles.emptyState}>
        <View style={[styles.illus, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="map-pin" size={28} color={colors.primary} />
          <View style={{ height: 10 }} />
          <Feather name="search" size={22} color={colors.subtle} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No shops found near you</Text>
        <Text style={[styles.emptyHint, { color: colors.subtle }]}>
          Try using your current location or adjust search and filters.
        </Text>
        <TouchableOpacity
          onPress={() => refreshFromCurrentLocation({ mode: 'refresh' })}
          activeOpacity={0.85}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
        {lastError ? (
          <Text style={[styles.emptyError, { color: colors.subtle }]}>{lastError}</Text>
        ) : null}
      </View>
    );
  }, [colors, refreshFromCurrentLocation, lastError]);

  function openShop(shop, opts = {}) {
    navigation.navigate('Queue', {
      shopId: shop._id,
      shopName: shop.name,
      promptGroceryList: Boolean(opts.promptGroceryList),
    });
  }

  const openDirections = useCallback(
    async (shop) => {
      try {
        const coordsArr = shop?.location?.coordinates;
        if (!Array.isArray(coordsArr) || coordsArr.length < 2) {
          appAlert('No location', 'This shop does not have a location set yet.');
          return;
        }
        const lat = coordsArr[1];
        const lng = coordsArr[0];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          appAlert('No location', 'This shop does not have a valid location.');
          return;
        }

        const label = encodeURIComponent(String(shop?.name || 'Shop'));

        // Prefer native maps apps, but always fall back to a web URL.
        const candidates =
          Platform.OS === 'ios'
            ? [
                `maps://?daddr=${lat},${lng}`,
                `http://maps.apple.com/?daddr=${lat},${lng}`,
              ]
            : [
                `google.navigation:q=${lat},${lng}`,
                `geo:0,0?q=${lat},${lng}(${label})`,
              ];

        for (const url of candidates) {
          try {
            const can = await Linking.canOpenURL(url);
            if (can) {
              await Linking.openURL(url);
              return;
            }
          } catch {
            // try next candidate
          }
        }

        // Fallback works even without Maps app installed.
        const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        await Linking.openURL(webUrl);
      } catch (e) {
        appAlert('Error', e?.message || 'Could not open directions.');
      }
    },
    []
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.hint, { color: colors.subtle }]}>Finding shops near you…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
        refreshing={refreshing}
        onRefresh={() => refreshFromCurrentLocation({ mode: 'refresh' })}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[
          filtered.length === 0 ? styles.emptyList : null,
          { paddingBottom: 92 },
        ]}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openShop(item)}
            activeOpacity={0.9}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.leftTitleCol}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.address ? (
                  <Text style={[styles.cardSub, { color: colors.subtle }]} numberOfLines={1}>
                    {item.address}
                  </Text>
                ) : (
                  <View style={styles.cardSubPlaceholder} />
                )}
              </View>

              <View style={{ flex: 1 }} />
              <View style={styles.rightMetaCol}>
                <View style={styles.distanceWrap}>
                  <Feather name="map-pin" size={14} color={colors.subtle} />
                  <View style={{ width: 6 }} />
                  <Text style={[styles.distanceText, { color: colors.subtle }]}>
                    {(() => {
                      const coordsArr = item?.location?.coordinates;
                      if (!coords || !Array.isArray(coordsArr) || coordsArr.length < 2) return '—';
                      const km = haversineKm(coords, {
                        latitude: coordsArr[1],
                        longitude: coordsArr[0],
                      });
                      if (!Number.isFinite(km)) return '—';
                      return `${km.toFixed(1)} km`;
                    })()}
                  </Text>
                </View>

                <View style={styles.waitingMiniRow}>
                  <Feather name="users" size={14} color={colors.subtle} />
                  <View style={{ width: 6 }} />
                  <Text style={[styles.waitingMiniText, { color: colors.subtle }]}>
                    {Number(item.queueCount) || 0} waiting
                  </Text>
                </View>
              </View>
            </View>
            {item.description ? (
              <Text style={[styles.cardDesc, { color: colors.muted }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                onPress={() => openDirections(item)}
                activeOpacity={0.9}
                style={[
                  styles.directionsBtn,
                  {
                    borderColor: isDark ? 'rgba(96, 165, 250, 0.35)' : '#c7d2fe',
                    backgroundColor: isDark ? 'rgba(96, 165, 250, 0.14)' : '#eef2ff',
                  },
                ]}
              >
                <Feather name="navigation" size={16} color={colors.primary} />
                <Text style={[styles.directionsBtnText, { color: colors.primary }]}>Directions</Text>
              </TouchableOpacity>

              <View style={{ width: 12 }} />

              <TouchableOpacity
                onPress={() => openShop(item, { promptGroceryList: true })}
                activeOpacity={0.9}
                style={[styles.openBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.openBtnText}>Join Queue</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.navigate('NearbyShops')}
          activeOpacity={0.85}
          style={styles.bottomTab}
        >
          <Feather name="map-pin" size={18} color={colors.primary} />
          <Text style={[styles.bottomTabText, { color: colors.primary }]}>Nearby shops</Text>
        </TouchableOpacity>

        <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          onPress={() => navigation.navigate('Queue')}
          activeOpacity={0.85}
          style={styles.bottomTab}
        >
          <Feather name="file-text" size={18} color={colors.subtle} />
          <Text style={[styles.bottomTabText, { color: colors.subtle }]}>My queue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 12, color: '#64748b' },
  headerWrap: { paddingTop: 10, paddingBottom: 8 },
  titleRow: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10, flexDirection: 'row', alignItems: 'flex-start' },
  screenTitle: { fontSize: 22, fontWeight: '900' },
  screenSubTitle: { marginTop: 4, fontSize: 13, fontWeight: '700' },
  searchRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600' },
  chipRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 4 },
  locChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 156,
  },
  locChipText: { fontSize: 12, fontWeight: '900' },
  locChipSub: { marginTop: 2, fontSize: 11, fontWeight: '700' },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center', paddingTop: 28, paddingBottom: 40, paddingHorizontal: 24 },
  illus: {
    width: 120,
    height: 120,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { textAlign: 'center', fontSize: 18, fontWeight: '900' },
  emptyHint: { marginTop: 8, textAlign: 'center', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  emptyError: { marginTop: 10, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryBtnText: { color: '#ffffff', fontWeight: '900' },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leftTitleCol: { minHeight: 34.5, justifyContent: 'flex-start' },
  cardTitle: { fontSize: 18, fontWeight: '900', lineHeight: 18, marginBottom: 0 },
  cardSub: { marginTop: 6, fontSize: 13, fontWeight: '600', lineHeight: 16.5 },
  cardSubPlaceholder: { height: 16.5 },
  cardDesc: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  // keep the whole block on the right, but align internal rows
  // so icons start on the same vertical line.
  rightMetaCol: { alignItems: 'flex-start' },
  // Make the right meta block "two lines" that align
  // with (shop name + address) on the left.
  distanceWrap: { flexDirection: 'row', alignItems: 'center', height: 18 },
  distanceText: { fontSize: 12, fontWeight: '900', lineHeight: 18 },
  waitingMiniRow: { flexDirection: 'row', alignItems: 'center', height: 16.5 },
  waitingMiniText: { fontSize: 12, fontWeight: '900', lineHeight: 16.5 },
  cardActionsRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  directionsBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionsBtnText: { marginLeft: 8, fontWeight: '900', fontSize: 12 },
  openBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  openBtnText: { color: '#ffffff', fontWeight: '900' },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  bottomTab: {
    flex: 1,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabText: { marginLeft: 8, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  bottomDivider: { width: 1 },
});
