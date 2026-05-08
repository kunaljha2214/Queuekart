import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAds } from '../context/AdsContext';
import { useTheme } from '../context/ThemeContext';
import { client } from '../services/api';
import { subscribeShopQueue } from '../services/socket';
import ThemeToggleSwitch from '../components/ThemeToggleSwitch';
import AdMobBanner from '../components/AdMobBanner';
import {
  PLACEMENT_CUSTOMER_JOIN_QUEUE_INTERSTITIAL,
  PLACEMENT_MY_QUEUE_HEADER,
  PLACEMENT_QUEUE_SHOP_FOOTER,
} from '../constants/adPlacements';
import { requestInterstitialShow } from '../utils/showInterstitialAd';
import Feather from 'react-native-vector-icons/Feather';

export default function QueueScreen({ route, navigation }) {
  const { shopId, shopName, promptGroceryList } = route.params || {};
  const { user } = useAuth();
  const { getInterstitialUnitId } = useAds();
  const { isDark, toggleTheme } = useTheme();
  const [queue, setQueue] = useState(null);
  const [myStatus, setMyStatus] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myQueues, setMyQueues] = useState([]);
  const [historyQueues, setHistoryQueues] = useState([]);
  const [myQueueMode, setMyQueueMode] = useState('active'); // 'active' | 'history'
  const [historyQuery, setHistoryQuery] = useState('');
  const [shopDetails, setShopDetails] = useState(null);
  const [showGroceryModal, setShowGroceryModal] = useState(false);
  const [groceryListText, setGroceryListText] = useState('');
  const [joining, setJoining] = useState(false);
  const [groceryMode, setGroceryMode] = useState('join'); // 'join' | 'edit'
  const [selectedQueue, setSelectedQueue] = useState(null); // { shopId, entryId, groceryList, shopName, shopAddress, position }
  const didAutoPromptRef = useRef(false);

  const openCall = useCallback(async (phone) => {
    try {
      const raw = String(phone || '').trim();
      const cleaned = raw.replace(/[^\d+]/g, '');
      if (!cleaned) {
        Alert.alert('No phone number', 'This shop does not have a phone number.');
        return;
      }
      const url = `tel:${cleaned}`;
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(
        'Call not available',
        'Could not open the phone dialer on this device. If you are testing on an emulator, calls are not supported.'
      );
    }
  }, []);

  const openDirections = useCallback(async (coordsArr, label) => {
    try {
      if (!Array.isArray(coordsArr) || coordsArr.length < 2) {
        Alert.alert('No location', 'This shop does not have a location set yet.');
        return;
      }
      const lng = coordsArr[0];
      const lat = coordsArr[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        Alert.alert('No location', 'This shop does not have a valid location.');
        return;
      }
      const safeLabel = encodeURIComponent(String(label || 'Shop'));
      const candidates =
        Platform.OS === 'ios'
          ? [`maps://?daddr=${lat},${lng}`, `http://maps.apple.com/?daddr=${lat},${lng}`]
          : [`google.navigation:q=${lat},${lng}`, `geo:0,0?q=${lat},${lng}(${safeLabel})`];

      for (const url of candidates) {
        try {
          const can = await Linking.canOpenURL(url);
          if (can) {
            await Linking.openURL(url);
            return;
          }
        } catch {
          // try next
        }
      }
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      await Linking.openURL(webUrl);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not open directions.');
    }
  }, []);

  const colors = useMemo(() => {
    if (isDark) {
      return {
        bg: '#0b1220',
        surface: '#0f172a',
        border: '#243047',
        text: '#f8fafc',
        muted: '#94a3b8',
        subtle: '#64748b',
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
      primary: '#2563eb',
    };
  }, [isDark]);

  const loadMyQueues = useCallback(async () => {
    const { data } = await client.get('/queues/me');
    setMyQueues(data.queues || []);
  }, []);

  const loadMyQueueHistory = useCallback(async () => {
    const { data } = await client.get('/queues/me/history');
    setHistoryQueues(data.queues || []);
  }, []);

  const refreshMyStatus = useCallback(async () => {
    const { data } = await client.get(`/queues/${shopId}/me`);
    setMyStatus(data);
    if (promptGroceryList && !data?.inQueue && !didAutoPromptRef.current) {
      didAutoPromptRef.current = true;
      setShowGroceryModal(true);
    }
  }, [shopId, promptGroceryList]);

  const loadPublic = useCallback(async () => {
    const { data } = await client.get(`/shops/${shopId}/items/public`);
    setMenu(data.items || []);
  }, [shopId]);

  const loadShopDetails = useCallback(async () => {
    const { data } = await client.get(`/shops/${shopId}`);
    setShopDetails(data?.shop || data);
  }, [shopId]);

  useEffect(() => {
    navigation.setOptions({
      title: shopId ? shopName || 'Queue' : 'My queue',
      headerRight: () => <ThemeToggleSwitch isDark={isDark} onToggle={toggleTheme} />,
    });

    if (!shopId) {
      let cancelled = false;
      (async () => {
        try {
          setLoading(true);
          await loadMyQueues();
          await loadMyQueueHistory();
        } catch (e) {
          if (!cancelled) Alert.alert('Error', e.response?.data?.message || e.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    let cleanup = () => {};
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await loadPublic();
        await loadShopDetails();
        await refreshMyStatus();
        const { data } = await client.get(`/queues/${shopId}`);
        if (!cancelled) setQueue(data);
        const unsub = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
        cleanup = unsub;
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Error', e.response?.data?.message || e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [
    shopId,
    shopName,
    navigation,
    loadPublic,
    refreshMyStatus,
    loadMyQueues,
    loadMyQueueHistory,
    toggleTheme,
    isDark,
    loadShopDetails,
  ]);

  const displayPosition = useMemo(() => {
    if (!queue?.entries || !user?.id || !myStatus?.inQueue) {
      return myStatus?.yourPosition ?? null;
    }
    const ordered = queue.entries
      .filter((e) => e.status === 'waiting' || e.status === 'serving')
      .sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex((e) => {
      if (!e?.user) return false;
      const uid = typeof e.user === 'object' ? e.user?._id : e.user;
      if (!uid) return false;
      return String(uid) === String(user.id);
    });
    return idx >= 0 ? idx + 1 : myStatus?.yourPosition ?? null;
  }, [queue, user?.id, myStatus?.inQueue, myStatus?.yourPosition]);

  const myEntry = useMemo(() => {
    if (!queue?.entries || !user?.id) return null;
    return (
      queue.entries.find((e) => {
        if (!e?.user) return false;
        const uid = typeof e.user === 'object' ? e.user?._id : e.user;
        return uid && String(uid) === String(user.id);
      }) || null
    );
  }, [queue?.entries, user?.id]);

  const groceryItems = useMemo(() => {
    const text = String(myEntry?.groceryList || '').trim();
    if (!text) return [];
    return text
      .split(/\r?\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 80);
  }, [myEntry?.groceryList]);

  function beginJoin() {
    setGroceryMode('join');
    setGroceryListText('');
    setShowGroceryModal(true);
  }

  function beginEditGroceryList() {
    if (String(myStatus?.status || '').toLowerCase() !== 'waiting') {
      Alert.alert(
        'Cannot edit now',
        'Your items are packing, so editing the grocery list is not possible.'
      );
      return;
    }
    setGroceryMode('edit');
    setGroceryListText(String(myEntry?.groceryList || '').trim());
    setShowGroceryModal(true);
  }

  async function submitGroceryList() {
    if (joining) return;
    try {
      const payload = {};
      const list = String(groceryListText || '').trim();

      const prev =
        shopId != null
          ? String(myEntry?.groceryList || '').trim()
          : String(selectedQueue?.groceryList || '').trim();
      const isChanged = list !== prev;

      // Validation: grocery list is required while joining.
      if (groceryMode === 'join' && !list) {
        Alert.alert('Grocery list required', 'Please enter at least one item before joining the queue.');
        return;
      }

      // Only send updates if user actually changed the list.
      if (groceryMode === 'edit' && !isChanged) {
        setShowGroceryModal(false);
        return;
      }

      // For now, prevent saving empty list on edit as well.
      if (groceryMode === 'edit' && !list) {
        Alert.alert('Grocery list required', 'Grocery list cannot be empty.');
        return;
      }

      if (list) payload.groceryList = list;

      setJoining(true);
      const effectiveShopId = shopId != null ? shopId : selectedQueue?.shopId;
      const { data } = await client.post(`/queues/${effectiveShopId}/join`, payload);
      if (groceryMode === 'join') {
        setQueue({
          shop: data.shop,
          entries: data.entries,
          totalWaiting: data.totalWaiting,
        });
        setMyStatus({
          inQueue: true,
          yourEntryId: data.yourEntryId,
          yourPosition: data.yourPosition,
          status: 'waiting',
          totalAhead: Math.max(0, data.yourPosition - 1),
        });
      } else {
        if (shopId != null) {
          // Optimistic update: merge list locally (socket update also arrives from server).
          setQueue((prevQueue) => {
            if (!prevQueue?.entries) return prevQueue;
            const nextEntries = prevQueue.entries.map((e) => {
              if (String(e.id) !== String(data?.yourEntryId || myStatus?.yourEntryId)) return e;
              return { ...e, groceryList: list };
            });
            return { ...prevQueue, entries: nextEntries };
          });
        } else {
          await loadMyQueues();
        }
      }
      setShowGroceryModal(false);
      setSelectedQueue(null);
      if (promptGroceryList) {
        navigation.setParams({ promptGroceryList: false });
      }
      if (groceryMode === 'join') {
        requestInterstitialShow(getInterstitialUnitId(PLACEMENT_CUSTOMER_JOIN_QUEUE_INTERSTITIAL));
      }
    } catch (e) {
      Alert.alert(groceryMode === 'edit' ? 'Could not save' : 'Could not join', e.response?.data?.message || e.message);
    } finally {
      setJoining(false);
    }
  }

  async function leaveQueue() {
    if (!myStatus?.yourEntryId) return;
    try {
      await client.delete(
        `/queues/${shopId}/leave/${myStatus.yourEntryId}`
      );
      setMyStatus({ inQueue: false });
      const { data } = await client.get(`/queues/${shopId}`);
      setQueue(data);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message);
    }
  }

  async function leaveQueueFromList(q) {
    if (!q?.shopId || !q?.entryId) return;
    try {
      await client.delete(`/queues/${q.shopId}/leave/${q.entryId}`);
      await loadMyQueues();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message);
    }
  }

  function beginEditGroceryListFromList(q) {
    if (String(q?.status || '').toLowerCase() !== 'waiting') {
      Alert.alert(
        'Cannot edit now',
        'Your items are packing, so editing the grocery list is not possible.'
      );
      return;
    }
    setSelectedQueue(q);
    setGroceryMode('edit');
    setGroceryListText(String(q?.groceryList || '').trim());
    setShowGroceryModal(true);
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const groceryModal = (
    <Modal
      visible={showGroceryModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowGroceryModal(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {groceryMode === 'edit' ? 'Edit grocery list' : 'Add grocery list'}
          </Text>
          <Text style={[styles.modalSub, { color: colors.subtle }]}>
            Add items you want from this shop. Owner will see it while serving you.
          </Text>
          <TextInput
            value={groceryListText}
            onChangeText={setGroceryListText}
            placeholder="Example: Milk, eggs, bread…"
            placeholderTextColor={colors.subtle}
            multiline
            style={[
              styles.modalInput,
              { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text },
            ]}
            textAlignVertical="top"
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={() => setShowGroceryModal(false)}
              activeOpacity={0.9}
              style={[styles.modalBtn, { borderColor: colors.border }]}
              disabled={joining}
            >
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <View style={{ width: 12 }} />
            <TouchableOpacity
              onPress={submitGroceryList}
              activeOpacity={0.9}
              style={[
                styles.modalPrimaryBtn,
                { backgroundColor: colors.primary, opacity: joining ? 0.7 : 1 },
              ]}
              disabled={joining || !String(groceryListText || '').trim()}
            >
              <Text style={styles.modalPrimaryText}>
                {joining
                  ? groceryMode === 'edit'
                    ? 'Saving…'
                    : 'Joining…'
                  : groceryMode === 'edit'
                    ? 'Save'
                    : 'Join queue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!shopId) {
    const filteredHistory = historyQueues.filter((q) => {
      const qText = historyQuery.trim().toLowerCase();
      if (!qText) return true;
      return String(q.shopName || '').toLowerCase().includes(qText);
    });

    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {groceryModal}
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.modeRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setMyQueueMode('active')}
              style={[
                styles.modeChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                myQueueMode === 'active' && { borderColor: colors.primary, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.modeChipText, { color: myQueueMode === 'active' ? colors.primary : colors.subtle }]}>
                Active
              </Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setMyQueueMode('history')}
              style={[
                styles.modeChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                myQueueMode === 'history' && { borderColor: colors.primary, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.modeChipText, { color: myQueueMode === 'history' ? colors.primary : colors.subtle }]}>
                History
              </Text>
            </TouchableOpacity>
          </View>

          {myQueueMode === 'history' ? (
            <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Feather name="search" size={18} color={colors.subtle} style={{ marginRight: 10 }} />
              <TextInput
                value={historyQuery}
                onChangeText={setHistoryQuery}
                placeholder="Search by shop name"
                placeholderTextColor={colors.subtle}
                style={[styles.searchInput, { color: colors.text }]}
                returnKeyType="search"
              />
              {historyQuery ? (
                <TouchableOpacity
                  onPress={() => setHistoryQuery('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={18} color={colors.subtle} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <AdMobBanner placementKey={PLACEMENT_MY_QUEUE_HEADER} />

          {(myQueueMode === 'active' && myQueues.length === 0) ||
          (myQueueMode === 'history' && filteredHistory.length === 0) ? (
            <View style={styles.emptyWrap}>
              <Feather name="file-text" size={28} color={colors.subtle} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {myQueueMode === 'history'
                  ? historyQuery.trim()
                    ? 'No matching history'
                    : 'No history yet'
                  : 'No active queues'}
              </Text>
              <Text style={[styles.emptySub, { color: colors.subtle }]}>
                {myQueueMode === 'history'
                  ? historyQuery.trim()
                    ? 'Try a different shop name search.'
                    : 'Your completed/rejected queues will show here.'
                  : 'Join a queue from Nearby shops and it will show here.'}
              </Text>
              {myQueueMode === 'active' ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('NearbyShops')}
                  activeOpacity={0.9}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.primaryBtnText}>Find nearby shops</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : myQueueMode === 'active' ? (
            myQueues.map((q) => (
              <View
                key={String(q.entryId)}
                style={[styles.queueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() =>
                    navigation.navigate('Queue', {
                      shopId: q.shopId,
                      shopName: q.shopName || 'Queue',
                    })
                  }
                >
                  <Text style={[styles.queueNumLabel, { color: colors.subtle }]}>Queue number</Text>
                  <View style={styles.queueTopRow}>
                    <Text style={[styles.bigNum, { color: colors.primary }]}>{q.position ?? '—'}</Text>
                    <View style={styles.rightTopCol}>
                      {String(q.shopPhone || '').trim() ? (
                        <TouchableOpacity
                          style={[
                            styles.callTopBtn,
                            { borderColor: colors.border, backgroundColor: colors.bg },
                          ]}
                          onPress={() => openCall(q.shopPhone)}
                          activeOpacity={0.9}
                        >
                          <Feather name="phone-call" size={16} color={colors.primary} />
                          <View style={{ width: 8 }} />
                          <Text style={[styles.callTopText, { color: colors.text }]}>Call</Text>
                        </TouchableOpacity>
                      ) : null}

                      {Array.isArray(q?.shopLocation?.coordinates) ? (
                        <TouchableOpacity
                          style={[
                            styles.dirTopBtn,
                            { borderColor: colors.border, backgroundColor: colors.bg },
                          ]}
                          onPress={() =>
                            openDirections(q?.shopLocation?.coordinates, q.shopName || 'Shop')
                          }
                          activeOpacity={0.9}
                        >
                          <Feather name="navigation" size={16} color={colors.primary} />
                          <View style={{ width: 8 }} />
                          <Text style={[styles.callTopText, { color: colors.text }]}>Directions</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.shopName, { color: colors.text }]} numberOfLines={1}>
                    {q.shopName || 'Shop'}
                  </Text>
                  {q.shopAddress ? (
                    <Text style={[styles.shopAddr, { color: colors.subtle }]}>{q.shopAddress}</Text>
                  ) : null}

                  {String(q.groceryList || '').trim() ? (
                    <Text style={[styles.queueHasList, { color: colors.muted }]}>
                      Grocery list added
                    </Text>
                  ) : (
                    <Text style={[styles.queueHasList, { color: colors.subtle }]}>
                      No grocery list
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.leaveBtn, { borderColor: '#fca5a5', flex: 1 }]}
                    onPress={() => leaveQueueFromList(q)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.leaveBtnText}>Leave queue</Text>
                  </TouchableOpacity>
                  <View style={{ width: 12 }} />
                  <TouchableOpacity
                    style={[
                      styles.editBtn,
                      { borderColor: colors.border, backgroundColor: colors.bg, flex: 1 },
                      String(q.status || '').toLowerCase() !== 'waiting' && { opacity: 0.5 },
                    ]}
                    onPress={() => beginEditGroceryListFromList(q)}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.editBtnText, { color: colors.text }]}>Edit grocery list</Text>
                  </TouchableOpacity>
                </View>

                {String(q.groceryList || '').trim() ? (
                  <View style={[styles.groceryWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                    {String(q.groceryList || '')
                      .split(/\r?\n|,/g)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 12)
                      .map((t, idx) => (
                        <View key={`${idx}-${t}`} style={styles.groceryRow}>
                          <Text style={[styles.groceryBullet, { color: colors.subtle }]}>{'•'}</Text>
                          <Text style={[styles.groceryText, { color: colors.text }]}>{t}</Text>
                        </View>
                      ))}
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            filteredHistory.map((q) => {
              const rawStatus = String(q.status || '').toLowerCase();
              const label = rawStatus === 'done' ? 'Completed' : rawStatus === 'cancelled' ? 'Rejected' : rawStatus;
              const statusColor = rawStatus === 'done' ? '#16a34a' : rawStatus === 'cancelled' ? '#ef4444' : colors.subtle;
              return (
                <View
                  key={String(q.entryId)}
                  style={[styles.queueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.shopName, { color: colors.text }]} numberOfLines={1}>
                    {q.shopName || 'Shop'}
                  </Text>
                  {q.shopAddress ? (
                    <Text style={[styles.shopAddr, { color: colors.subtle }]} numberOfLines={2}>
                      {q.shopAddress}
                    </Text>
                  ) : null}
                  <Text style={[styles.historyStatus, { color: statusColor }]}>{label}</Text>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => navigation.navigate('NearbyShops')}
            activeOpacity={0.85}
            style={styles.bottomTab}
          >
            <Feather name="map-pin" size={18} color={colors.subtle} />
            <Text style={[styles.bottomTabText, { color: colors.subtle }]}>Nearby shops</Text>
          </TouchableOpacity>
          <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity onPress={() => {}} activeOpacity={0.85} style={styles.bottomTab}>
            <Feather name="file-text" size={18} color={colors.primary} />
            <Text style={[styles.bottomTabText, { color: colors.primary }]}>My queue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const waitingCount =
    queue?.entries?.filter((e) => e.status === 'waiting').length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {groceryModal}

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 110 }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {myStatus?.inQueue ? (
          <>
            <Text style={[styles.queueNumLabel, { color: colors.subtle }]}>Queue number</Text>
            <View style={styles.queueTopRow}>
              <Text style={[styles.bigNum, { color: colors.primary }]}>{displayPosition ?? '—'}</Text>
              <View style={styles.rightTopCol}>
                {String(shopDetails?.owner?.phone || '').trim() ? (
                  <TouchableOpacity
                    style={[styles.callTopBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={() => openCall(shopDetails?.owner?.phone)}
                    activeOpacity={0.9}
                  >
                    <Feather name="phone-call" size={16} color={colors.primary} />
                    <View style={{ width: 8 }} />
                    <Text style={[styles.callTopText, { color: colors.text }]}>Call</Text>
                  </TouchableOpacity>
                ) : null}

                {Array.isArray(shopDetails?.location?.coordinates) ? (
                  <TouchableOpacity
                    style={[styles.dirTopBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={() =>
                      openDirections(shopDetails?.location?.coordinates, shopDetails?.name || shopName || 'Shop')
                    }
                    activeOpacity={0.9}
                  >
                    <Feather name="navigation" size={16} color={colors.primary} />
                    <View style={{ width: 8 }} />
                    <Text style={[styles.callTopText, { color: colors.text }]}>Directions</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={[styles.shopName, { color: colors.text }]} numberOfLines={1}>
              {shopDetails?.name || shopName || 'Shop'}
            </Text>
            {shopDetails?.address ? (
              <Text style={[styles.shopAddr, { color: colors.subtle }]}>{shopDetails.address}</Text>
            ) : null}
            <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.leaveBtn, { borderColor: '#fca5a5', flex: 1 }]}
              onPress={leaveQueue}
            >
              <Text style={styles.leaveBtnText}>Leave queue</Text>
            </TouchableOpacity>
            <View style={{ width: 12 }} />
            <TouchableOpacity
              style={[
                styles.editBtn,
                { borderColor: colors.border, backgroundColor: colors.bg, flex: 1 },
                String(myStatus?.status || '').toLowerCase() !== 'waiting' && { opacity: 0.5 },
              ]}
              onPress={beginEditGroceryList}
              activeOpacity={0.9}
            >
              <Text style={[styles.editBtnText, { color: colors.text }]}>Edit grocery list</Text>
            </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.shopName, { color: colors.text }]} numberOfLines={1}>
              {shopDetails?.name || shopName || 'Shop'}
            </Text>
            {shopDetails?.address ? (
              <Text style={[styles.shopAddr, { color: colors.subtle }]}>{shopDetails.address}</Text>
            ) : null}
            <Text style={[styles.sub, { color: colors.muted }]}>You are not in this queue yet.</Text>
            <TouchableOpacity
              style={[styles.joinBtn, { backgroundColor: colors.primary }]}
              onPress={beginJoin}
            >
              <Text style={styles.joinBtnText}>Join queue</Text>
            </TouchableOpacity>
          </>
        )}
        </View>
      {groceryItems.length === 0 ? (
        <>
          <Text style={[styles.section, { color: colors.text }]}>Menu</Text>
          {menu.length === 0 ? (
            <Text style={[styles.muted, { color: colors.subtle }]}>No public menu items.</Text>
          ) : (
            menu.map((it) => (
              <View key={it._id} style={styles.menuRow}>
                <Text style={[styles.menuName, { color: colors.muted }]}>{it.name}</Text>
                <Text style={[styles.menuPrice, { color: colors.text }]}>${Number(it.price).toFixed(2)}</Text>
              </View>
            ))
          )}
        </>
      ) : null}

      {myStatus?.inQueue ? (
        <>
          <Text style={[styles.section, { color: colors.text, marginTop: 18 }]}>Grocery list</Text>
          {groceryItems.length === 0 ? (
            <Text style={[styles.muted, { color: colors.subtle }]}>
              No grocery items added yet. Tap “Edit grocery list” to add.
            </Text>
          ) : (
            <View style={[styles.groceryWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {groceryItems.map((t, idx) => (
                <View key={`${idx}-${t}`} style={styles.groceryRow}>
                  <Text style={[styles.groceryBullet, { color: colors.subtle }]}>{'•'}</Text>
                  <Text style={[styles.groceryText, { color: colors.text }]}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}

      <AdMobBanner placementKey={PLACEMENT_QUEUE_SHOP_FOOTER} style={{ marginHorizontal: -4 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.navigate('NearbyShops')}
          activeOpacity={0.85}
          style={styles.bottomTab}
        >
          <Feather name="map-pin" size={18} color={colors.subtle} />
          <Text style={[styles.bottomTabText, { color: colors.subtle }]}>Nearby shops</Text>
        </TouchableOpacity>
        <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity
          onPress={() => navigation.navigate('Queue')}
          activeOpacity={0.85}
          style={styles.bottomTab}
        >
          <Feather name="file-text" size={18} color={colors.primary} />
          <Text style={[styles.bottomTabText, { color: colors.primary }]}>My queue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modeRow: { flexDirection: 'row', marginBottom: 12 },
  modeChip: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  modeChipText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  searchRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '700' },
  historyStatus: { marginTop: 10, fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  queueNumLabel: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  queueTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rightTopCol: { alignItems: 'flex-end' },
  callTopBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 128,
  },
  dirTopBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 128,
  },
  callTopText: { fontWeight: '800', fontSize: 14 },
  shopName: { marginTop: 10, fontSize: 18, fontWeight: '900' },
  shopAddr: { marginTop: 6, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  actionRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center' },
  queueHasList: { marginTop: 10, fontSize: 13, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '900' },
  modalSub: { marginTop: 6, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  modalInput: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 110,
    fontSize: 14,
    fontWeight: '600',
  },
  modalActions: { marginTop: 14, flexDirection: 'row' },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 14, fontWeight: '800' },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  card: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  bigNum: {
    fontSize: 48,
    fontWeight: '800',
    marginVertical: 8,
  },
  sub: { fontSize: 15 },
  joinBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  leaveBtn: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  leaveBtnText: { color: '#b91c1c', fontWeight: '700' },
  editBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editBtnText: { fontWeight: '800' },
  groceryWrap: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  groceryRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  groceryBullet: { width: 16, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  groceryText: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  section: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  muted: {},
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  menuName: { fontSize: 16 },
  menuPrice: { fontSize: 16, fontWeight: '600' },

  emptyWrap: { alignItems: 'center', paddingTop: 50 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: '900' },
  emptySub: { marginTop: 6, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  primaryBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  primaryBtnText: { color: '#ffffff', fontWeight: '900' },

  queueCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  queueCardTop: { flexDirection: 'row', alignItems: 'center' },
  queueShop: { flex: 1, fontSize: 16, fontWeight: '900' },
  queueStatus: { fontSize: 11, fontWeight: '900' },
  queueAddr: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  queueMeta: { marginTop: 10, fontSize: 12, fontWeight: '800' },

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
