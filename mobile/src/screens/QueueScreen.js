import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
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
import { appAlert } from '../utils/appAlert';
import Feather from 'react-native-vector-icons/Feather';

/** Display hint; server uses QUEUE_SKIP_PRICE_PAISE (default ₹6 per row). */
const SKIP_PRICE_PER_ROW_RUPEES = 6;
const MIN_PICKUP_LEAD_MS = 2 * 60 * 60 * 1000; // 2 hours

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
  const [showJoinOptionsModal, setShowJoinOptionsModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipOptions, setSkipOptions] = useState([]);
  const [joinSkipTarget, setJoinSkipTarget] = useState(null);
  const [skipTargetPosition, setSkipTargetPosition] = useState(null);
  const [pendingJoinGroceryList, setPendingJoinGroceryList] = useState('');
  const [pickupChoice, setPickupChoice] = useState('flexible'); // 'flexible' | 'scheduled'
  const [pickupAtDate, setPickupAtDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 45, 0, 0);
    return d;
  });
  const openPickupPicker = useCallback(() => {
    if (Platform.OS !== 'android') return;

    const base = new Date(pickupAtDate);
    const now = new Date();

    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      minimumDate: now,
      onChange: (_event, selectedDate) => {
        if (!selectedDate) return;
        const withDate = new Date(base);
        withDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

        DateTimePickerAndroid.open({
          value: withDate,
          mode: 'time',
          is24Hour: false,
          onChange: (__event, selectedTime) => {
            if (!selectedTime) return;
            const next = new Date(withDate);
            next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            setPickupAtDate(next);
          },
        });
      },
    });
  }, [pickupAtDate]);

  const openCall = useCallback(async (phone) => {
    try {
      const raw = String(phone || '').trim();
      const cleaned = raw.replace(/[^\d+]/g, '');
      if (!cleaned) {
        appAlert('No phone number', 'This shop does not have a phone number.');
        return;
      }
      const url = `tel:${cleaned}`;
      await Linking.openURL(url);
    } catch (e) {
      appAlert(
        'Call not available',
        'Could not open the phone dialer on this device. If you are testing on an emulator, calls are not supported.'
      );
    }
  }, []);

  const openDirections = useCallback(async (coordsArr, label) => {
    try {
      if (!Array.isArray(coordsArr) || coordsArr.length < 2) {
        appAlert('No location', 'This shop does not have a location set yet.');
        return;
      }
      const lng = coordsArr[0];
      const lat = coordsArr[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        appAlert('No location', 'This shop does not have a valid location.');
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
      appAlert('Error', e?.message || 'Could not open directions.');
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
          if (!cancelled) appAlert('Error', e.response?.data?.message || e.message);
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
          appAlert('Error', e.response?.data?.message || e.message);
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

  const myPickupLabel = useMemo(() => {
    const raw = myEntry?.pickupAt;
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return `Pickup: ${d.toLocaleString()}`;
  }, [myEntry?.pickupAt]);

  const groceryItems = useMemo(() => {
    const text = String(myEntry?.groceryList || '').trim();
    if (!text) return [];
    return text
      .split(/\r?\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 80);
  }, [myEntry?.groceryList]);

  const waitingAheadCount = queue?.totalWaiting ?? 0;

  const loadSkipOptions = useCallback(async () => {
    const effectiveShopId = shopId != null ? shopId : selectedQueue?.shopId;
    if (!effectiveShopId) return [];
    try {
      const { data } = await client.get(`/queues/${effectiveShopId}/skip-options`);
      const opts = data.options || [];
      setSkipOptions(opts);
      return opts;
    } catch {
      setSkipOptions([]);
      return [];
    }
  }, [shopId, selectedQueue?.shopId]);

  useEffect(() => {
    if (!showJoinOptionsModal || !shopId) return;
    setJoinSkipTarget(null);
    loadSkipOptions().then((opts) => {
      if (opts.length) setJoinSkipTarget(opts[0].targetPosition);
    });
  }, [showJoinOptionsModal, shopId, loadSkipOptions]);

  useEffect(() => {
    if (!showSkipModal || !shopId) return;
    setSkipTargetPosition(null);
    loadSkipOptions().then((opts) => {
      if (opts.length) setSkipTargetPosition(opts[0].targetPosition);
    });
  }, [showSkipModal, shopId, loadSkipOptions]);

  const selectedJoinSkipOption = useMemo(
    () => skipOptions.find((o) => o.targetPosition === joinSkipTarget),
    [skipOptions, joinSkipTarget]
  );

  const selectedMoveSkipOption = useMemo(
    () => skipOptions.find((o) => o.targetPosition === skipTargetPosition),
    [skipOptions, skipTargetPosition]
  );

  function beginJoin() {
    setGroceryMode('join');
    setGroceryListText('');
    setShowGroceryModal(true);
  }

  function beginEditGroceryList() {
    if (String(myStatus?.status || '').toLowerCase() !== 'waiting') {
      appAlert(
        'Cannot edit now',
        'Your items are packing, so editing the grocery list is not possible.'
      );
      return;
    }
    setGroceryMode('edit');
    setGroceryListText(String(myEntry?.groceryList || '').trim());
    setShowGroceryModal(true);
  }

  function proceedToJoinOptions() {
    const list = String(groceryListText || '').trim();
    if (!list) {
      appAlert('Grocery list required', 'Please enter at least one item before joining the queue.');
      return;
    }
    setPendingJoinGroceryList(list);
    setPickupChoice('flexible');
    setShowGroceryModal(false);
    setShowJoinOptionsModal(true);
  }

  function pickupPayloadFields() {
    if (pickupChoice !== 'scheduled') return {};
    return { pickupAt: pickupAtDate.toISOString() };
  }

  function applyJoinSuccess(data) {
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
    setShowJoinOptionsModal(false);
    setShowGroceryModal(false);
    setPendingJoinGroceryList('');
    setSelectedQueue(null);
    setGroceryListText('');
    if (promptGroceryList) {
      navigation.setParams({ promptGroceryList: false });
    }
    requestInterstitialShow(getInterstitialUnitId(PLACEMENT_CUSTOMER_JOIN_QUEUE_INTERSTITIAL));
  }

  async function postJoin(joinBody) {
    const effectiveShopId = shopId != null ? shopId : selectedQueue?.shopId;
    const { data } = await client.post(`/queues/${effectiveShopId}/join`, joinBody);
    return data;
  }

  async function confirmStandardJoin() {
    const list = String(pendingJoinGroceryList || '').trim();
    if (!list) {
      appAlert('Grocery list required', 'Your grocery list is empty.');
      return;
    }
    if (pickupChoice === 'scheduled') {
      const min = Date.now() + MIN_PICKUP_LEAD_MS;
      if (pickupAtDate.getTime() < min) {
        appAlert('Pickup time', 'Please choose another time, approx 2 hours later from now.');
        return;
      }
    }
    if (joining) return;
    setJoining(true);
    try {
      const data = await postJoin({
        groceryList: list,
        joinKind: 'standard',
        ...pickupPayloadFields(),
      });
      applyJoinSuccess(data);
    } catch (e) {
      appAlert('Could not join', e.response?.data?.message || e.message);
    } finally {
      setJoining(false);
    }
  }

  async function assertSkipTargetAvailable(effectiveShopId, targetPosition) {
    const { data } = await client.get(`/queues/${effectiveShopId}/skip-options`);
    const available = (data.options || []).some((o) => o.targetPosition === targetPosition);
    if (!available) {
      const err = new Error('spot_taken');
      err.userMessage =
        'This queue number is no longer available. Another customer reserved or joined it. Please pick a different number.';
      throw err;
    }
  }

  async function payAndSkipToPosition(targetPosition, { mode, groceryList }) {
    const effectiveShopId = shopId != null ? shopId : selectedQueue?.shopId;
    if (!effectiveShopId || !targetPosition) {
      appAlert('Error', 'Choose a queue number to skip to.');
      return;
    }
    if (pickupChoice === 'scheduled' && mode === 'join') {
      const min = Date.now() + MIN_PICKUP_LEAD_MS;
      if (pickupAtDate.getTime() < min) {
        appAlert('Pickup time', 'Please choose another time, approx 2 hours later from now.');
        return;
      }
    }
    if (joining) return;
    setJoining(true);
    try {
      await assertSkipTargetAvailable(effectiveShopId, targetPosition);

      const { data: ord } = await client.post('/payments/razorpay/queue-priority-order', {
        shopId: effectiveShopId,
        targetPosition,
      });

      await assertSkipTargetAvailable(effectiveShopId, targetPosition);
      const { default: RazorpayCheckout } = await import('react-native-razorpay');
      const rows = ord.rowsSkipped ?? 0;
      const amountRupees = ord.amountRupees ?? ord.amount / 100;
      const result = await RazorpayCheckout.open({
        key: ord.keyId,
        amount: ord.amount,
        currency: ord.currency || 'INR',
        name: 'QueueKart',
        description: `Skip ${rows} row(s) → #${targetPosition} · ₹${amountRupees}`,
        order_id: ord.orderId,
        theme: { color: '#2563eb' },
      });
      const paymentBody = {
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
        targetPosition,
      };
      if (mode === 'join') {
        const data = await postJoin({
          groceryList,
          joinKind: 'priority_skip',
          ...paymentBody,
          ...pickupPayloadFields(),
        });
        applyJoinSuccess(data);
        setShowJoinOptionsModal(false);
      } else {
        const { data } = await client.post(`/queues/${effectiveShopId}/skip`, paymentBody);
        setMyStatus({
          inQueue: true,
          yourEntryId: data.yourEntryId,
          yourPosition: data.yourPosition,
          status: 'waiting',
          totalAhead: Math.max(0, data.yourPosition - 1),
        });
        if (data.queue) setQueue(data.queue);
        setShowSkipModal(false);
        appAlert(
          'Queue updated',
          `You are now #${data.yourPosition}. This spot is reserved for you until you leave or are served.`
        );
      }
    } catch (e) {
      const msg =
        e?.userMessage ||
        e?.response?.data?.message ||
        e?.details?.description ||
        e?.description ||
        e?.message ||
        'Payment failed or was cancelled.';
      appAlert(mode === 'join' ? 'Could not join with skip' : 'Could not move up', msg);
      if (e?.userMessage || e?.response?.status === 409) {
        loadSkipOptions().then((opts) => {
          if (mode === 'join' && opts.length) setJoinSkipTarget(opts[0].targetPosition);
          if (mode === 'move' && opts.length) setSkipTargetPosition(opts[0].targetPosition);
        });
      }
    } finally {
      setJoining(false);
    }
  }

  async function confirmPaidSkipJoin() {
    const list = String(pendingJoinGroceryList || '').trim();
    if (!list) {
      appAlert('Grocery list required', 'Your grocery list is empty.');
      return;
    }
    if (!joinSkipTarget) {
      appAlert('Choose a spot', 'Select which queue number you want to move to.');
      return;
    }
    await payAndSkipToPosition(joinSkipTarget, { mode: 'join', groceryList: list });
  }

  async function confirmMoveUpInQueue() {
    if (!skipTargetPosition) {
      appAlert('Choose a spot', 'Select which queue number you want to move to.');
      return;
    }
    await payAndSkipToPosition(skipTargetPosition, { mode: 'move' });
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

      if (!isChanged) {
        setShowGroceryModal(false);
        return;
      }

      if (!list) {
        appAlert('Grocery list required', 'Grocery list cannot be empty.');
        return;
      }

      if (list) payload.groceryList = list;

      setJoining(true);
      const effectiveShopId = shopId != null ? shopId : selectedQueue?.shopId;
      const { data } = await client.post(`/queues/${effectiveShopId}/join`, payload);
      if (shopId != null) {
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
      setShowGroceryModal(false);
      setSelectedQueue(null);
      if (promptGroceryList) {
        navigation.setParams({ promptGroceryList: false });
      }
    } catch (e) {
      appAlert('Could not save', e.response?.data?.message || e.message);
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
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function leaveQueueFromList(q) {
    if (!q?.shopId || !q?.entryId) return;
    try {
      await client.delete(`/queues/${q.shopId}/leave/${q.entryId}`);
      await loadMyQueues();
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  function beginEditGroceryListFromList(q) {
    if (String(q?.status || '').toLowerCase() !== 'waiting') {
      appAlert(
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
              onPress={groceryMode === 'join' ? proceedToJoinOptions : submitGroceryList}
              activeOpacity={0.9}
              style={[
                styles.modalPrimaryBtn,
                { backgroundColor: colors.primary, opacity: joining ? 0.7 : 1 },
              ]}
              disabled={joining || !String(groceryListText || '').trim()}
            >
              <Text style={styles.modalPrimaryText}>
                {joining ? (groceryMode === 'edit' ? 'Saving…' : 'Joining…') : groceryMode === 'edit' ? 'Save' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const joinOptionsModal = shopId ? (
    <Modal
      visible={showJoinOptionsModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!joining) {
          setShowJoinOptionsModal(false);
        }
      }}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[styles.modalCard, styles.joinOptionsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>How do you want to join?</Text>
            <Text style={[styles.modalSub, { color: colors.subtle }]}>
              {waitingAheadCount} {waitingAheadCount === 1 ? 'customer' : 'customers'} waiting right now (not including serving).
            </Text>

            {skipOptions.length > 0 ? (
              <>
                <Text style={[styles.joinSectionLabel, { color: colors.text }]}>Skip ahead (paid)</Text>
                <Text style={[styles.modalSub, { color: colors.subtle, marginBottom: 10 }]}>
                  ₹{SKIP_PRICE_PER_ROW_RUPEES} per row skipped. Reserved spots cannot be taken by others.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {skipOptions.map((opt) => {
                    const active = joinSkipTarget === opt.targetPosition;
                    return (
                      <TouchableOpacity
                        key={opt.targetPosition}
                        onPress={() => setJoinSkipTarget(opt.targetPosition)}
                        style={[
                          styles.skipTargetChip,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? `${colors.primary}18` : colors.bg,
                          },
                        ]}
                      >
                        <Text style={[styles.skipTargetNum, { color: active ? colors.primary : colors.text }]}>
                          #{opt.targetPosition}
                        </Text>
                        <Text style={[styles.skipTargetPrice, { color: colors.subtle }]}>
                          ₹{opt.amountRupees ?? (opt.rowsSkipped * SKIP_PRICE_PER_ROW_RUPEES)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  onPress={confirmPaidSkipJoin}
                  disabled={joining || !joinSkipTarget}
                  activeOpacity={0.88}
                  style={[
                    styles.priorityPayRow,
                    { borderColor: colors.primary, backgroundColor: colors.bg },
                  ]}
                >
                  <View style={[styles.priorityIconCircle, { backgroundColor: `${colors.primary}22` }]}>
                    <Feather name="zap" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.priorityPayTitle, { color: colors.text }]}>
                      Pay ₹{selectedJoinSkipOption?.amountRupees ?? '—'} · join queue #
                      {joinSkipTarget ?? '—'}
                    </Text>
                    <Text style={[styles.priorityPaySub, { color: colors.subtle }]}>
                      Skip {selectedJoinSkipOption?.rowsSkipped ?? '—'} row(s). Razorpay secure payment.
                    </Text>
                  </View>
                </TouchableOpacity>
                <Text style={[styles.orDivider, { color: colors.subtle }]}>Or join at the end — pickup below</Text>
              </>
            ) : (
              <Text style={[styles.modalSub, { color: colors.muted, marginTop: 4 }]}>
                Join at the end of the line and set when you will pick up groceries.
              </Text>
            )}

            <Text style={[styles.joinSectionLabel, { color: colors.text }]}>Pickup</Text>
            <TouchableOpacity
              onPress={() => setPickupChoice('flexible')}
              activeOpacity={0.88}
              style={[
                styles.pickOption,
                {
                  borderColor: pickupChoice === 'flexible' ? colors.primary : colors.border,
                  backgroundColor: colors.bg,
                },
              ]}
            >
              <Feather name="clock" size={18} color={colors.primary} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.pickOptionTitle, { color: colors.text }]}>When it's my turn</Text>
                <Text style={[styles.pickOptionSub, { color: colors.subtle }]}>
                  Same pace as the queue — no fixed time.
                </Text>
              </View>
              {pickupChoice === 'flexible' ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setPickupChoice('scheduled');
                if (Platform.OS === 'android') openPickupPicker();
              }}
              activeOpacity={0.88}
              style={[
                styles.pickOption,
                {
                  borderColor: pickupChoice === 'scheduled' ? colors.primary : colors.border,
                  backgroundColor: colors.bg,
                  marginTop: 10,
                },
              ]}
            >
              <Feather name="calendar" size={18} color={colors.primary} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.pickOptionTitle, { color: colors.text }]}>I will pick up at…</Text>
                <Text style={[styles.pickOptionSub, { color: colors.subtle }]}>
                  Choose a date and time that works for you.
                </Text>
              </View>
              {pickupChoice === 'scheduled' ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>

            {pickupChoice === 'scheduled' ? (
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => Platform.OS === 'android' && openPickupPicker()}
                  style={[styles.timePreviewRow, { borderColor: colors.border, backgroundColor: colors.bg }]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.timePreviewLabel, { color: colors.subtle }]}>PICKUP DATE & TIME</Text>
                  <Text style={[styles.timePreviewValue, { color: colors.text }]}>
                    {pickupAtDate.toLocaleString()}
                  </Text>
                  {Platform.OS === 'android' ? (
                    <Text style={[styles.timePreviewTap, { color: colors.primary }]}>Tap to change time</Text>
                  ) : null}
                </TouchableOpacity>
                {Platform.OS === 'ios' ? (
                  <View
                    style={[styles.iosPickerShell, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  >
                    <DateTimePicker
                      value={pickupAtDate}
                      mode="datetime"
                      display="spinner"
                      minimumDate={new Date()}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(_, date) => {
                        if (date) setPickupAtDate(date);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.modalActions, { marginTop: 20 }]}>
              <TouchableOpacity
                onPress={() => {
                  if (joining) return;
                  setShowJoinOptionsModal(false);
                  setGroceryListText(pendingJoinGroceryList);
                  setShowGroceryModal(true);
                }}
                activeOpacity={0.9}
                style={[styles.modalBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Back</Text>
              </TouchableOpacity>
              <View style={{ width: 12 }} />
              <TouchableOpacity
                onPress={confirmStandardJoin}
                disabled={joining}
                activeOpacity={0.9}
                style={[
                  styles.modalPrimaryBtn,
                  { backgroundColor: colors.primary, opacity: joining ? 0.7 : 1, flex: 1 },
                ]}
              >
                <Text style={styles.modalPrimaryText}>{joining ? 'Joining…' : 'Join queue'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  ) : null;

  const skipModal = shopId ? (
    <Modal
      visible={showSkipModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!joining) setShowSkipModal(false);
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, styles.skipModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Move up in queue</Text>
          <Text style={[styles.modalSub, { color: colors.subtle }]}>
            You are #{displayPosition ?? '—'}. Pay ₹{SKIP_PRICE_PER_ROW_RUPEES} per row you skip. Reserved numbers cannot be chosen.
          </Text>
          {skipOptions.length === 0 ? (
            <Text style={[styles.modalSub, { color: colors.muted, marginTop: 12 }]}>
              No positions available to skip to right now.
            </Text>
          ) : (
            <>
              <Text style={[styles.joinSectionLabel, { color: colors.text, marginTop: 14 }]}>
                Choose queue number
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.skipChipScrollContent}
              >
                {skipOptions.map((opt) => {
                  const active = skipTargetPosition === opt.targetPosition;
                  return (
                    <TouchableOpacity
                      key={opt.targetPosition}
                      onPress={() => setSkipTargetPosition(opt.targetPosition)}
                      activeOpacity={0.88}
                      style={[
                        styles.skipTargetChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? `${colors.primary}18` : colors.bg,
                        },
                      ]}
                    >
                      <Text style={[styles.skipTargetNum, { color: active ? colors.primary : colors.text }]}>
                        #{opt.targetPosition}
                      </Text>
                      <Text style={[styles.skipTargetPrice, { color: colors.subtle }]}>
                        ₹{opt.amountRupees ?? opt.rowsSkipped * SKIP_PRICE_PER_ROW_RUPEES}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {selectedMoveSkipOption ? (
                <Text style={[styles.skipSummaryLine, { color: colors.muted }]}>
                  Skip {selectedMoveSkipOption.rowsSkipped} row(s) · total ₹{selectedMoveSkipOption.amountRupees}
                </Text>
              ) : null}
            </>
          )}
          <View style={styles.skipModalActions}>
            {skipOptions.length > 0 ? (
              <TouchableOpacity
                onPress={confirmMoveUpInQueue}
                disabled={joining || !skipTargetPosition}
                activeOpacity={0.88}
                style={[
                  styles.skipPayBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: joining || !skipTargetPosition ? 0.55 : 1,
                  },
                ]}
              >
                <Feather name="zap" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.skipPayBtnText} numberOfLines={2}>
                  {joining
                    ? 'Processing…'
                    : `Pay ₹${selectedMoveSkipOption?.amountRupees ?? '—'} · move to #${skipTargetPosition ?? '—'}`}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => setShowSkipModal(false)}
              style={[styles.skipCancelBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
              disabled={joining}
              activeOpacity={0.88}
            >
              <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  ) : null;

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

                  {q.pickupAt && !Number.isNaN(new Date(q.pickupAt).getTime()) ? (
                    <Text style={[styles.queueMeta, { color: colors.subtle }]}>
                      Pickup: {new Date(q.pickupAt).toLocaleString()}
                    </Text>
                  ) : null}
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

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {groceryModal}
      {joinOptionsModal}
      {skipModal}

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
            {myPickupLabel ? (
              <Text style={[styles.queueMeta, { color: colors.subtle }]}>{myPickupLabel}</Text>
            ) : null}
            {myEntry?.lockedSlot ? (
              <Text style={[styles.queueMeta, { color: colors.primary, fontWeight: '800' }]}>
                Reserved queue spot — others cannot take your paid position
              </Text>
            ) : null}
            {String(myStatus?.status || '').toLowerCase() === 'waiting' &&
            displayPosition != null &&
            displayPosition > 1 ? (
              <TouchableOpacity
                onPress={() => setShowSkipModal(true)}
                activeOpacity={0.88}
                style={[
                  styles.moveUpBtn,
                  { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
                ]}
              >
                <Feather name="zap" size={18} color={colors.primary} />
                <Text style={[styles.moveUpBtnText, { color: colors.primary }]}>Move up in queue (paid)</Text>
              </TouchableOpacity>
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
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  modalPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  skipModalCard: { width: '100%', maxWidth: 400 },
  skipChipScrollContent: { paddingVertical: 4, paddingRight: 4 },
  skipSummaryLine: { marginTop: 8, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  skipModalActions: { marginTop: 16 },
  skipPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  skipPayBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
  },
  skipCancelBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  joinOptionsCard: { maxHeight: 560 },
  priorityPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 12,
  },
  priorityIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  priorityPayTitle: { fontSize: 16, fontWeight: '900' },
  priorityPaySub: { fontSize: 12, marginTop: 4, fontWeight: '700', lineHeight: 17 },
  skipTargetChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  skipTargetNum: { fontSize: 16, fontWeight: '900' },
  skipTargetPrice: { fontSize: 11, marginTop: 4, fontWeight: '700' },
  moveUpBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveUpBtnText: { marginLeft: 8, fontSize: 13, fontWeight: '900' },
  orDivider: { textAlign: 'center', marginTop: 14, marginBottom: 4, fontSize: 12, fontWeight: '800' },
  joinSectionLabel: { marginTop: 14, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  pickOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
  },
  pickOptionTitle: { fontSize: 15, fontWeight: '900' },
  pickOptionSub: { fontSize: 12, marginTop: 4, fontWeight: '700', lineHeight: 17 },
  timePreviewRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
  timePreviewLabel: { fontSize: 11, fontWeight: '900' },
  timePreviewValue: { fontSize: 16, fontWeight: '900', marginTop: 6 },
  timePreviewTap: { fontSize: 12, fontWeight: '800', marginTop: 8 },
  iosPickerShell: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },

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
