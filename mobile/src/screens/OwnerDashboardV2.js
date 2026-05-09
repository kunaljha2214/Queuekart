import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { useAuth } from '../context/AuthContext';
import { useAds } from '../context/AdsContext';
import { useTheme } from '../context/ThemeContext';
import { client } from '../services/api';
import { subscribeShopQueue } from '../services/socket';
import ThemeToggleSwitch from '../components/ThemeToggleSwitch';
import Feather from 'react-native-vector-icons/Feather';
import {
  PLACEMENT_OWNER_REMOVE_ENTRY_INTERSTITIAL,
  PLACEMENT_OWNER_WALK_IN_INTERSTITIAL,
} from '../constants/adPlacements';
import { requestInterstitialShow } from '../utils/showInterstitialAd';
import { appAlert } from '../utils/appAlert';

export default function OwnerDashboardV2({ navigation }) {
  const { logout } = useAuth();
  const { getInterstitialUnitId } = useAds();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState({ entries: [] });
  const [loading, setLoading] = useState(true);
  const [showWalkInInput, setShowWalkInInput] = useState(false);
  const [walkInCount, setWalkInCount] = useState(1);
  const [walkInEstimate, setWalkInEstimate] = useState('');
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [showEditShopModal, setShowEditShopModal] = useState(false);
  const [activeTab, setActiveTab] = useState('current');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState(null);
  const [historyToDate, setHistoryToDate] = useState(null);
  const [showFromDatePicker, setShowFromDatePicker] = useState(false);
  const [showToDatePicker, setShowToDatePicker] = useState(false);
  const [activeRangePreset, setActiveRangePreset] = useState('all');
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddShop, setShowAddShop] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [newShopAddress, setNewShopAddress] = useState('');
  const [newShopDescription, setNewShopDescription] = useState('');
  const [newShopLat, setNewShopLat] = useState('');
  const [newShopLng, setNewShopLng] = useState('');
  const [creatingShop, setCreatingShop] = useState(false);
  const [locatingShop, setLocatingShop] = useState(false);
  const [shopLocationError, setShopLocationError] = useState('');
  const [payingSub, setPayingSub] = useState(false);
  const [togglingShopOpen, setTogglingShopOpen] = useState(false);

  const colors = useMemo(() => {
    if (isDark) {
      return {
        bg: '#0b1220',
        surface: '#0f172a',
        surface2: '#111a2b',
        border: '#243047',
        text: '#f8fafc',
        textMuted: '#cbd5e1',
        textSubtle: '#94a3b8',
        primary: '#60a5fa',
        primaryBg: '#172554',
        danger: '#f87171',
        dangerBg: '#3b0a0a',
        success: '#4ade80',
        inputBg: '#0b1220',
        placeholder: '#64748b',
      };
    }
    return {
      bg: '#f7f9fc',
      surface: '#ffffff',
      surface2: '#ffffff',
      border: '#dbe4f0',
      text: '#0b1c30',
      textMuted: '#334155',
      textSubtle: '#64748b',
      primary: '#1d4ed8',
      primaryBg: '#e8f0ff',
      danger: '#ef4444',
      dangerBg: '#fee2e2',
      success: '#22c55e',
      inputBg: '#ffffff',
      placeholder: '#94a3b8',
    };
  }, [isDark]);

  const activeShop = useMemo(
    () => shops.find((s) => s._id === shopId),
    [shops, shopId]
  );

  /** First renewal / trial deadline: subscription.nextDueAt → legacy paid-until → createdAt + 1 day */
  const nextPaymentDueDate = useMemo(() => {
    if (!activeShop) return null;
    const fromSub = activeShop.subscription?.nextDueAt
      ? new Date(activeShop.subscription.nextDueAt)
      : null;
    if (fromSub && !Number.isNaN(fromSub.getTime())) return fromSub;
    const legacy = activeShop.subscriptionPaidUntil ? new Date(activeShop.subscriptionPaidUntil) : null;
    if (legacy && !Number.isNaN(legacy.getTime())) return legacy;
    if (activeShop.createdAt) {
      const d = new Date(activeShop.createdAt);
      if (!Number.isNaN(d.getTime())) {
        const copy = new Date(d);
        copy.setDate(copy.getDate() + 1);
        return copy;
      }
    }
    return null;
  }, [activeShop]);

  const GRACE_MS = 1 * 24 * 60 * 60 * 1000;

  /** True only after a successful pay and still within grace after next due (same idea as listing). */
  const subscriptionIsPaidCurrent = useMemo(() => {
    const status = activeShop?.subscription?.lastPaymentStatus;
    const paid = status === 'paid' && activeShop?.subscription?.lastPaidAt;
    if (!paid || !nextPaymentDueDate || Number.isNaN(nextPaymentDueDate.getTime())) return false;
    return nextPaymentDueDate.getTime() + GRACE_MS > Date.now();
  }, [activeShop?.subscription?.lastPaymentStatus, activeShop?.subscription?.lastPaidAt, nextPaymentDueDate]);

  /** Shop still gets listing grace (trial) without pay — not "Active", but not expired yet. */
  const subscriptionWithinGrace = useMemo(() => {
    if (!nextPaymentDueDate || Number.isNaN(nextPaymentDueDate.getTime())) return false;
    return nextPaymentDueDate.getTime() + GRACE_MS > Date.now();
  }, [nextPaymentDueDate]);

  const subscriptionStatusLabel = useMemo(() => {
    if (subscriptionIsPaidCurrent) return 'Active';
    if (subscriptionWithinGrace) return 'Trial';
    return 'Inactive';
  }, [subscriptionIsPaidCurrent, subscriptionWithinGrace]);

  /** Hide Pay ₹350 only when line reads Active; Trial / Inactive always show the button. */
  const showSubscriptionPay = subscriptionStatusLabel !== 'Active';

  const isShopOpen = useMemo(() => activeShop?.isOpen !== false, [activeShop?.isOpen]);

  async function toggleShopOpen(nextOpen) {
    if (!shopId || togglingShopOpen) return;
    try {
      setTogglingShopOpen(true);
      await client.patch(`/shops/${shopId}`, { isOpen: nextOpen });
      const { data } = await client.get('/shops');
      setShops(data.shops || []);
    } catch (e) {
      appAlert('Shop status', e.response?.data?.message || e.message || 'Could not update shop status.');
    } finally {
      setTogglingShopOpen(false);
    }
  }

  async function openCall(phone) {
    try {
      const raw = String(phone || '').trim();
      const cleaned = raw.replace(/[^\d+]/g, '');
      if (!cleaned) {
        appAlert('No phone number', 'This customer does not have a phone number.');
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
  }

  async function startSubscriptionPayment() {
    if (!activeShop?._id) return;
    try {
      setPayingSub(true);
      const { default: RazorpayCheckout } = await import('react-native-razorpay');
      const { data } = await client.post('/payments/razorpay/order', {
        shopId: activeShop._id,
      });
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'QueueKart',
        description: 'Monthly subscription',
        order_id: data.orderId,
        theme: { color: colors.primary },
      };
      const result = await RazorpayCheckout.open(options);
      await client.post('/payments/razorpay/verify', {
        shopId: activeShop._id,
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      const { data: shopsRes } = await client.get('/shops');
      setShops(shopsRes.shops || []);
      appAlert(
        'Subscription active',
        'Payment successful. Your shop can appear to customers when Shop status is Open.'
      );
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.errors?.[0]?.msg ||
        e?.description ||
        e?.message ||
        'Payment failed.';
      appAlert('Payment', msg);
    } finally {
      setPayingSub(false);
    }
  }

  async function ensureLocationPermission() {
    if (Platform.OS !== 'android') {
      const status = await Geolocation.requestAuthorization('whenInUse');
      return status === 'granted';
    }
    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return fine === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function fillShopLocationFromDevice() {
    setShopLocationError('');
    setLocatingShop(true);
    try {
      const ok = await ensureLocationPermission();
      if (!ok) {
        setShopLocationError('Location permission denied.');
        return;
      }
      await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      }).then((pos) => {
        const latitude = pos?.coords?.latitude;
        const longitude = pos?.coords?.longitude;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setNewShopLat(String(latitude));
          setNewShopLng(String(longitude));
        } else {
          setShopLocationError('Could not read device location.');
        }
      });
    } catch (e) {
      setShopLocationError(e?.message || 'Could not get location.');
    } finally {
      setLocatingShop(false);
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={[styles.linkMuted, { color: colors.textSubtle }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark, colors]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await client.get('/shops');
        if (!alive) return;
        const list = data.shops || [];
        setShops(list);
        if (list.length) {
          setShopId(list[0]._id);
          setShowAddShop(false);
        } else {
          setShopId(null);
          setShowAddShop(true);
        }
      } catch (e) {
        if (alive) appAlert('Error', e.response?.data?.message || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!showAddShop) return;
    if (newShopLat && newShopLng) return;
    fillShopLocationFromDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddShop]);

  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      try {
        const { data } = await client.get(`/queues/${shopId}`);
        if (!cancelled) setQueue(data);
        unsub = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) appAlert('Queue', e.response?.data?.message || e.message);
      }
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [shopId]);

  useEffect(() => {
    if (!activeShop) return;
    setEditName(activeShop.name || '');
    setEditAddress(activeShop.address || '');
    setEditDescription(activeShop.description || '');
  }, [activeShop]);

  function resetEditFields() {
    setEditName(activeShop?.name || '');
    setEditAddress(activeShop?.address || '');
    setEditDescription(activeShop?.description || '');
  }

  useEffect(() => {
    if (!shopId || activeTab !== 'history') return;
    let cancelled = false;
    (async () => {
      try {
        setHistoryLoading(true);
        const { data } = await client.get(`/queues/${shopId}/owner/history`, {
          params: { status: historyFilter },
        });
        if (!cancelled) {
          setHistoryEntries(data.entries || []);
        }
      } catch (e) {
        if (!cancelled) {
          appAlert('History', e.response?.data?.message || e.message);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, activeTab, historyFilter]);

  const entries = queue.entries || [];
  const waitingCount = entries.filter((e) => e.status === 'waiting').length;
  const servingEntry = entries.find((e) => e.status === 'serving');
  const filteredHistoryEntries = useMemo(() => {
    return historyEntries.filter((entry) => {
      const time = new Date(entry.joinedAt || 0).getTime();
      if (!Number.isFinite(time)) return false;
      if (historyFromDate) {
        const from = new Date(historyFromDate);
        from.setHours(0, 0, 0, 0);
        if (time < from.getTime()) return false;
      }
      if (historyToDate) {
        const to = new Date(historyToDate);
        to.setHours(23, 59, 59, 999);
        if (time > to.getTime()) return false;
      }
      return true;
    });
  }, [historyEntries, historyFromDate, historyToDate]);

  function formatHistoryTime(value) {
    if (!value) return 'Time unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return date.toLocaleString([], {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatDateOnly(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function applyRangePreset(preset) {
    setActiveRangePreset(preset);
    const today = new Date();
    if (preset === 'today') {
      setHistoryFromDate(startOfDay(today));
      setHistoryToDate(endOfDay(today));
      return;
    }
    if (preset === '7d') {
      const from = startOfDay(today);
      from.setDate(from.getDate() - 6);
      setHistoryFromDate(from);
      setHistoryToDate(endOfDay(today));
      return;
    }
    if (preset === '30d') {
      const from = startOfDay(today);
      from.setDate(from.getDate() - 29);
      setHistoryFromDate(from);
      setHistoryToDate(endOfDay(today));
      return;
    }
    // all
    setHistoryFromDate(null);
    setHistoryToDate(null);
  }

  function statusLabel(value) {
    if (value === 'completed') return 'Completed';
    if (value === 'rejected') return 'Rejected';
    return 'All';
  }

  async function serveNext() {
    const { data } = await client.post(`/queues/${shopId}/owner/next`);
    setQueue(data);
  }

  async function completeEntry(entryId) {
    const { data } = await client.post(`/queues/${shopId}/owner/complete/${entryId}`);
    setQueue(data);
  }

  async function removeEntry(entryId) {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/remove/${entryId}`);
      setQueue(data);
      requestInterstitialShow(getInterstitialUnitId(PLACEMENT_OWNER_REMOVE_ENTRY_INTERSTITIAL));
    } catch (e) {
      appAlert('Remove', e.response?.data?.message || e.message || 'Could not remove entry.');
    }
  }

  async function addWalkInCustomer() {
    const count = Number(walkInCount);
    if (!Number.isFinite(count) || count < 1) {
      appAlert('Invalid count', 'Queue increase must be at least 1.');
      return;
    }
    if (walkInEstimate.trim() === '') {
      appAlert('Required', 'Estimated time is required.');
      return;
    }
    const parsedEstimate = Number(walkInEstimate.trim());
    if (!Number.isFinite(parsedEstimate) || parsedEstimate < 0) {
      appAlert('Invalid estimate', 'Estimated time must be a non-negative number.');
      return;
    }
    try {
      setAddingWalkIn(true);
      let latest = null;
      for (let i = 0; i < count; i += 1) {
        const name = count === 1 ? 'Walk-in' : `Walk-in ${i + 1}`;
        // eslint-disable-next-line no-await-in-loop
        const { data } = await client.post(`/queues/${shopId}/owner/walk-in`, {
          walkInName: name,
          estimatedMinutes: parsedEstimate,
        });
        latest = data;
      }
      if (latest) setQueue(latest);
      setWalkInEstimate('');
      setWalkInCount(1);
      setShowWalkInInput(false);
      requestInterstitialShow(getInterstitialUnitId(PLACEMENT_OWNER_WALK_IN_INTERSTITIAL));
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    } finally {
      setAddingWalkIn(false);
    }
  }

  async function saveShopInfo() {
    await client.patch(`/shops/${shopId}`, {
      name: editName.trim(),
      address: editAddress.trim(),
      description: editDescription.trim(),
    });
    appAlert('Saved', 'Shop details updated.');
  }

  async function createShop() {
    const name = newShopName.trim();
    const address = newShopAddress.trim();
    const description = newShopDescription.trim();
    const lat = Number(newShopLat.trim());
    const lng = Number(newShopLng.trim());
    if (!name) {
      appAlert('Required', 'Shop name is required.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      appAlert('Required', 'Location is required. Please allow location access.');
      return;
    }
    try {
      setCreatingShop(true);
      const { data } = await client.post('/shops', {
        name,
        address,
        description,
        lat,
        lng,
      });
      const created = data.shop;
      const next = created ? [created, ...shops] : shops;
      setShops(next);
      if (created?._id) setShopId(created._id);
      setShowAddShop(false);
      setNewShopName('');
      setNewShopAddress('');
      setNewShopDescription('');
      setNewShopLat('');
      setNewShopLng('');
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.response?.data?.errors?.[0]?.msg ||
        e.message;
      appAlert('Could not create shop', msg);
    } finally {
      setCreatingShop(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (!activeShop) {
    const hasLocation = newShopLat.trim() !== '' && newShopLng.trim() !== '';
    return (
      <ScrollView
        style={[styles.page, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topTitleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Shop Details</Text>
          <ThemeToggleSwitch isDark={isDark} onToggle={toggleTheme} />
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.section, { color: colors.text }]}>Create your shop</Text>
          <Text style={[styles.rowMeta, { color: colors.textSubtle, marginBottom: 10 }]}>
            You don’t have a shop yet. Create one to start managing your queue.
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="Shop name"
            placeholderTextColor={colors.placeholder}
            value={newShopName}
            onChangeText={setNewShopName}
          />
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
            ]}
            placeholder="Address (optional)"
            placeholderTextColor={colors.placeholder}
            value={newShopAddress}
            onChangeText={setNewShopAddress}
          />
          <TextInput
            style={[
              styles.input,
              {
                minHeight: 72,
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Description (optional)"
            placeholderTextColor={colors.placeholder}
            multiline
            value={newShopDescription}
            onChangeText={setNewShopDescription}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[
                styles.input,
                { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              ]}
              placeholder="Latitude"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={newShopLat}
              editable={false}
            />
            <TextInput
              style={[
                styles.input,
                { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              ]}
              placeholder="Longitude"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              value={newShopLng}
              editable={false}
            />
          </View>
          {shopLocationError ? (
            <Text style={[styles.rowMeta, { color: colors.danger, marginTop: 6 }]}>
              {shopLocationError}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[
              styles.filterBtn,
              { alignSelf: 'flex-start', marginTop: 10, borderColor: colors.border, backgroundColor: colors.inputBg },
              locatingShop && { opacity: 0.7 },
            ]}
            onPress={fillShopLocationFromDevice}
            disabled={locatingShop}
            activeOpacity={0.85}
          >
            <Text style={[styles.filterText, { color: colors.textMuted }]}>
              {locatingShop ? 'Detecting location…' : 'Retry location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (creatingShop || locatingShop || !hasLocation) && { opacity: 0.7 },
            ]}
            onPress={createShop}
            disabled={creatingShop || locatingShop || !hasLocation}
          >
            <Text style={styles.primaryBtnText}>
              {creatingShop ? 'Creating…' : locatingShop ? 'Detecting location…' : 'Add shop'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.page, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <View style={styles.topTitleRow}>
        <Text style={[styles.title, { color: colors.text }]}>Shop Details</Text>
        <ThemeToggleSwitch isDark={isDark} onToggle={toggleTheme} />
      </View>
      <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerCardTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.caption, { color: colors.textSubtle }]}>Shop Name</Text>
            <Text style={[styles.shopName, { color: colors.text }]}>{activeShop.name}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              resetEditFields();
              setShowEditShopModal(true);
            }}
            activeOpacity={0.8}
            style={styles.headerEditBtn}
          >
            <Text style={[styles.editIcon, { color: colors.primary }]}>✎</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerCardSubRow}>
          <Text
            style={[styles.subInline, { color: colors.textSubtle, flex: 1, marginTop: 0, marginRight: 10 }]}
            numberOfLines={2}
          >
            Subscription: {subscriptionStatusLabel} , Next due:{' '}
            {nextPaymentDueDate ? nextPaymentDueDate.toLocaleDateString() : '—'}
          </Text>
          {showSubscriptionPay ? (
            <TouchableOpacity
              onPress={startSubscriptionPayment}
              activeOpacity={0.9}
              disabled={payingSub}
              style={[
                styles.subPayInlineBtn,
                { backgroundColor: colors.primary },
                payingSub && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.subPayInlineText}>{payingSub ? 'Paying…' : 'Pay ₹350'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View
          style={[
            styles.headerCardShopStatus,
            {
              borderTopColor: colors.border,
              marginTop: 12,
              paddingTop: 12,
            },
          ]}
        >
          <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <Text style={[styles.shopStatusTitleInline, { color: colors.text }]}>Shop status</Text>
            <Text style={[styles.shopStatusSubInline, { color: colors.textSubtle }]}>
              Open + active subscription: visible to all customer, Closed : hidden from customers.
            </Text>
          </View>
          {togglingShopOpen ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Switch
              value={isShopOpen}
              onValueChange={toggleShopOpen}
              trackColor={{ false: colors.border, true: colors.primaryBg }}
              thumbColor={Platform.OS === 'android' ? colors.primary : undefined}
              ios_backgroundColor={colors.border}
            />
          )}
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.textSubtle }]}>Waiting</Text>
          <Text style={[styles.statNum, { color: colors.text }]}>{waitingCount}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.textSubtle }]}>Serving</Text>
          <Text style={[styles.statNum, { color: colors.text }]}>{servingEntry ? `#${servingEntry.position}` : '-'}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.textSubtle }]}>Est. Time</Text>
          <Text style={[styles.statNum, { color: colors.text }]}>{waitingCount * 3}m</Text>
        </View>
      </View>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            { borderColor: colors.border, backgroundColor: colors.surface },
            activeTab === 'current' && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
          ]}
          onPress={() => setActiveTab('current')}
        >
          <Text
            style={[
              styles.tabText,
              { color: colors.textSubtle },
              activeTab === 'current' && { color: colors.primary },
            ]}
          >
            Current Queue
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            { borderColor: colors.border, backgroundColor: colors.surface },
            activeTab === 'history' && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
          ]}
          onPress={() => setActiveTab('history')}
        >
          <Text
            style={[
              styles.tabText,
              { color: colors.textSubtle },
              activeTab === 'history' && { color: colors.primary },
            ]}
          >
            History
          </Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'current' ? (
        <>
      <TouchableOpacity style={styles.primaryBtn} onPress={serveNext}><Text style={styles.primaryBtnText}>Serve Next Customer</Text></TouchableOpacity>
      <TouchableOpacity style={styles.walkInBtn} onPress={() => setShowWalkInInput((v) => !v)}><Text style={styles.primaryBtnText}>Add Walk-in Customer</Text></TouchableOpacity>
      {showWalkInInput ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.stepperLabel, { color: colors.textMuted }]}>Queue increase</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[
                styles.stepperBtn,
                { borderColor: colors.border, backgroundColor: colors.inputBg },
                walkInCount <= 1 && styles.stepperBtnDisabled,
              ]}
              onPress={() => setWalkInCount((v) => Math.max(1, Number(v || 1) - 1))}
              disabled={walkInCount <= 1 || addingWalkIn}
              activeOpacity={0.8}
            >
              <Text style={[styles.stepperBtnText, { color: colors.text }]}>−</Text>
            </TouchableOpacity>
            <View
              style={[
                styles.stepperValueBox,
                { borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
            >
              <Text style={[styles.stepperValue, { color: colors.text }]}>{String(walkInCount)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.stepperBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
              onPress={() => setWalkInCount((v) => Math.min(50, Number(v || 1) + 1))}
              disabled={addingWalkIn}
              activeOpacity={0.8}
            >
              <Text style={[styles.stepperBtnText, { color: colors.text }]}>+</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={walkInEstimate}
            onChangeText={setWalkInEstimate}
            placeholder="Estimated time (minutes)"
            placeholderTextColor={colors.placeholder}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              (addingWalkIn || walkInEstimate.trim() === '' || walkInCount < 1) && { opacity: 0.65 },
            ]}
            onPress={addWalkInCustomer}
            disabled={addingWalkIn || walkInEstimate.trim() === '' || walkInCount < 1}
          >
            <Text style={styles.primaryBtnText}>{addingWalkIn ? 'Adding...' : 'Add to Queue'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={[styles.section, { color: colors.text }]}>Current Queue</Text>
      {entries.map((entry) => {
        const status = String(entry.status || '').toLowerCase().trim();
        const canRemove = status === 'waiting' || status === 'serving';
        const groceryList = String(entry.groceryList || '').trim();
        const pickupExtra =
          entry.joinKind === 'priority_second'
            ? ' · Priority (₹25)'
            : entry.pickupAt && !Number.isNaN(new Date(entry.pickupAt).getTime())
              ? ` · Pickup ${new Date(entry.pickupAt).toLocaleString()}`
              : '';
        return (
          <View
            key={String(entry.id || entry.position)}
            style={[
              styles.queueRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
              status === 'serving' && { flexDirection: 'column', alignItems: 'stretch' },
            ]}
          >
            {status === 'serving' ? (
              <>
                <View style={styles.rowTop}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!groceryList) {
                        appAlert('Grocery list', 'No grocery list added for this customer.');
                        return;
                      }
                      appAlert('Grocery list', groceryList);
                    }}
                  >
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      #{entry.position} {(entry.user && entry.user.name) || entry.walkInName || 'Customer'}
                    </Text>
                    <Text style={[styles.rowMeta, { color: colors.textSubtle }]}>
                      {status || '-'}
                      {Number(entry.estimatedMinutes) > 0 ? ` • Est ${entry.estimatedMinutes} min` : ''}
                      {groceryList ? ' • Has grocery list' : ''}
                      {pickupExtra}
                    </Text>
                  </TouchableOpacity>

                  {entry?.user?.phone ? (
                    <TouchableOpacity
                      style={[styles.callTopBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                      onPress={() => openCall(entry.user.phone)}
                      activeOpacity={0.9}
                    >
                      <Feather name="phone-call" size={16} color={colors.primary} />
                      <View style={{ width: 8 }} />
                      <Text style={[styles.callTopText, { color: colors.text }]}>Call</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.bottomActions}>
                  <TouchableOpacity
                    style={[styles.removeBtn, { flex: 1 }]}
                    onPress={() => {
                      if (!canRemove) return;
                      appAlert('Remove customer?', 'This will remove the customer from the queue.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removeEntry(entry.id) },
                      ]);
                    }}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.doneBtn, { flex: 1 }]} onPress={() => completeEntry(entry.id)}>
                    <Text style={styles.doneText}>Complete</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.85}
                onPress={() => {
                  if (!groceryList) {
                    appAlert('Grocery list', 'No grocery list added for this customer.');
                    return;
                  }
                  appAlert('Grocery list', groceryList);
                }}
              >
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  #{entry.position} {(entry.user && entry.user.name) || entry.walkInName || 'Customer'}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSubtle }]}>
                  {status || '-'}
                  {Number(entry.estimatedMinutes) > 0 ? ` • Est ${entry.estimatedMinutes} min` : ''}
                  {groceryList ? ' • Has grocery list' : ''}
                  {pickupExtra}
                </Text>
              </TouchableOpacity>
            )}

            {status === 'waiting' ? (
              <TouchableOpacity
                style={[styles.removeBtn, { backgroundColor: colors.danger }]}
                onPress={() => {
                  if (!canRemove) return;
                  appAlert('Remove customer?', 'This will remove the customer from the queue.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeEntry(entry.id) },
                  ]);
                }}
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
        </>
      ) : (
        <>
          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Status</Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowStatusDropdown((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={[styles.dropdownText, { color: colors.text }]}>{statusLabel(historyFilter)}</Text>
            <Text style={[styles.dropdownChevron, { color: colors.textSubtle }]}>{showStatusDropdown ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showStatusDropdown ? (
            <View style={[styles.dropdownMenu, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {['all', 'completed', 'rejected'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setHistoryFilter(status);
                    setShowStatusDropdown(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, { color: colors.text }]}>{statusLabel(status)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <Text style={[styles.filterLabel, { color: colors.textMuted }]}>Date Range</Text>
          <View style={[styles.rangeCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.presetRow}>
              {[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7 days' },
                { id: '30d', label: 'Last 30 days' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.presetChip,
                    { borderColor: colors.border, backgroundColor: colors.inputBg },
                    activeRangePreset === p.id && { borderColor: colors.primary, backgroundColor: colors.primaryBg },
                  ]}
                  onPress={() => applyRangePreset(p.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: colors.textMuted },
                      activeRangePreset === p.id && { color: colors.primary },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.rangeRow}>
              <TouchableOpacity
                style={[styles.rangeField, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setActiveRangePreset('custom');
                  setShowFromDatePicker(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.rangeFieldLabel, { color: colors.textSubtle }]}>From</Text>
                <Text style={[styles.rangeFieldValue, { color: colors.text }]}>
                  {historyFromDate ? formatDateOnly(historyFromDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rangeField, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setActiveRangePreset('custom');
                  setShowToDatePicker(true);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.rangeFieldLabel, { color: colors.textSubtle }]}>To</Text>
                <Text style={[styles.rangeFieldValue, { color: colors.text }]}>
                  {historyToDate ? formatDateOnly(historyToDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rangeClearBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => applyRangePreset('all')}
                activeOpacity={0.85}
              >
                <Text style={[styles.rangeClearText, { color: colors.danger }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
          {showFromDatePicker ? (
            <DateTimePicker
              value={historyFromDate || new Date()}
              mode="date"
              display="default"
              onChange={(_, selectedDate) => {
                setShowFromDatePicker(false);
                if (selectedDate) setHistoryFromDate(selectedDate);
              }}
            />
          ) : null}
          {showToDatePicker ? (
            <DateTimePicker
              value={historyToDate || new Date()}
              mode="date"
              display="default"
              onChange={(_, selectedDate) => {
                setShowToDatePicker(false);
                if (selectedDate) setHistoryToDate(selectedDate);
              }}
            />
          ) : null}
          {historyLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : filteredHistoryEntries.length ? (
            filteredHistoryEntries.map((entry) => (
              <View key={String(entry.id)} style={[styles.queueRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>
                    #{entry.position} {(entry.user && entry.user.name) || entry.walkInName || 'Customer'}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textSubtle }]}>
                    {entry.status === 'done' ? 'completed' : 'rejected'}
                    {Number(entry.estimatedMinutes) > 0
                      ? ` • Est ${entry.estimatedMinutes} min`
                      : ''}
                  </Text>
                  <Text style={[styles.historyTime, { color: colors.textSubtle }]}>
                    {formatHistoryTime(entry.joinedAt)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.rowMeta, { color: colors.textSubtle }]}>No history found for this filter.</Text>
          )}
        </>
      )}
      <Modal
        visible={showEditShopModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditShopModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit shop details</Text>
              <TouchableOpacity
                onPress={() => {
                  resetEditFields();
                  setShowEditShopModal(false);
                }}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              >
                <Text style={[styles.modalClose, { color: colors.textSubtle }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Shop name"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={editAddress}
              onChangeText={setEditAddress}
              placeholder="Shop address"
              placeholderTextColor={colors.placeholder}
            />
            <TextInput
              style={[
                styles.input,
                { minHeight: 72, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text },
              ]}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              placeholder="Description"
              placeholderTextColor={colors.placeholder}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                onPress={() => {
                  resetEditFields();
                  setShowEditShopModal(false);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.modalBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, { backgroundColor: '#003366' }]}
                onPress={async () => {
                  await saveShopInfo();
                  setShowEditShopModal(false);
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '800', color: '#0b1c30', marginBottom: 12 },
  subInline: { marginTop: 8, fontSize: 12, fontWeight: '800', lineHeight: 16 },
  headerCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  headerCardTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerEditBtn: { marginLeft: 8, paddingTop: 2 },
  headerCardSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  headerCardShopStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shopStatusTitleInline: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  shopStatusSubInline: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  subPayInlineBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'center',
    flexShrink: 0,
  },
  subPayInlineText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  caption: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  shopName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  editIcon: { color: '#1d4ed8', fontSize: 20, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#e8f0ff',
  },
  tabText: { color: '#475569', fontWeight: '600' },
  tabTextActive: { color: '#1d4ed8' },
  filterLabel: { color: '#334155', fontSize: 12, fontWeight: '700', marginTop: 8 },
  dropdownTrigger: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownText: { color: '#0f172a', fontWeight: '600' },
  dropdownChevron: { color: '#64748b', fontSize: 12 },
  dropdownMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 10 },
  dropdownItemText: { color: '#0f172a', fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  filterBtnActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#e8f0ff',
  },
  filterText: { color: '#334155', fontWeight: '600' },
  filterTextActive: { color: '#1d4ed8' },
  rangeCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  presetChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  presetChipActive: { borderColor: '#1d4ed8', backgroundColor: '#e8f0ff' },
  presetChipText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  presetChipTextActive: { color: '#1d4ed8' },
  rangeRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  rangeField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  rangeFieldLabel: { color: '#64748b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  rangeFieldValue: { color: '#0f172a', fontWeight: '800', marginTop: 4 },
  rangeClearBtn: {
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  rangeClearText: { color: '#ef4444', fontWeight: '900' },
  statCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, padding: 10 },
  statNum: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  primaryBtn: { backgroundColor: '#003366', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  walkInBtn: { backgroundColor: '#0f5fd3', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  section: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  queueRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, padding: 12, marginBottom: 8 },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  historyTime: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  callTopBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  callTopText: { fontWeight: '800', fontSize: 14 },
  bottomActions: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 },
  removeBtn: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  removeText: { color: '#fff', fontWeight: '800' },
  doneBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  doneText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 14, padding: 14, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: '#0f172a', marginBottom: 8 },
  stepperLabel: { color: '#334155', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.5 },
  stepperBtnText: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  stepperValueBox: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  link: { color: '#2563eb', fontWeight: '600' },
  linkMuted: { color: '#64748b', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalClose: { fontSize: 20, fontWeight: '900' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontWeight: '800' },
  modalBtnPrimary: {
    flex: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '900' },
});
