import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { client } from '../services/api';
import { subscribeShopQueue } from '../services/socket';
import { appAlert } from '../utils/appAlert';

export default function OwnerDashboard({ navigation }) {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState({ entries: [] });
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingShop, setSavingShop] = useState(false);
  const [showWalkInInput, setShowWalkInInput] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [addingWalkIn, setAddingWalkIn] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={toggleTheme}>
            <Text style={styles.link}>{isDark ? 'Light' : 'Dark'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={styles.linkMuted}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await client.get('/shops');
        if (!alive) return;
        const list = data.shops || [];
        setShops(list);
        if (list.length) setShopId(list[0]._id);
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
    if (!shopId) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};
    (async () => {
      try {
        const { data } = await client.get(`/queues/${shopId}`);
        if (!cancelled) setQueue(data);
        unsubscribe = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) appAlert('Queue', e.response?.data?.message || e.message);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [shopId]);

  const activeShop = useMemo(() => shops.find((s) => s._id === shopId), [shops, shopId]);
  useEffect(() => {
    if (!activeShop) return;
    setEditName(activeShop.name || '');
    setEditAddress(activeShop.address || '');
    setEditDescription(activeShop.description || '');
  }, [activeShop]);

  const entries = queue.entries || [];
  const waitingCount = entries.filter((e) => e.status === 'waiting').length;
  const servingEntry = entries.find((e) => e.status === 'serving');
  const estimateMinutes = waitingCount * 3;

  async function serveNext() {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/next`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function completeEntry(entryId) {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/complete/${entryId}`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function saveShopInfo() {
    if (!shopId) return;
    try {
      setSavingShop(true);
      const { data } = await client.patch(`/shops/${shopId}`, {
        name: editName.trim(),
        address: editAddress.trim(),
        description: editDescription.trim(),
      });
      setShops((prev) => prev.map((s) => (s._id === shopId ? data.shop : s)));
      appAlert('Saved', 'Shop details updated.');
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    } finally {
      setSavingShop(false);
    }
  }

  async function addWalkInCustomer() {
    if (!walkInName.trim()) {
      appAlert('Required', 'Enter walk-in customer name.');
      return;
    }
    try {
      setAddingWalkIn(true);
      const { data } = await client.post(`/queues/${shopId}/owner/walk-in`, {
        walkInName: walkInName.trim(),
      });
      setQueue(data);
      setWalkInName('');
      setShowWalkInInput(false);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    } finally {
      setAddingWalkIn(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!activeShop) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No shop found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Shop</Text>

      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.caption}>Shop Name</Text>
          <Text style={styles.shopName}>{activeShop.name}</Text>
        </View>
        <Text style={styles.editIcon}>✎</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.caption}>Waiting</Text>
          <Text style={styles.statNum}>{waitingCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.caption}>Serving</Text>
          <Text style={styles.statNum}>{servingEntry ? `#${servingEntry.position}` : '-'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.caption}>Est. Time</Text>
          <Text style={styles.statNum}>{estimateMinutes}m</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={serveNext}>
        <Text style={styles.primaryBtnText}>Serve Next Customer</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.walkInBtn} onPress={() => setShowWalkInInput((v) => !v)}>
        <Text style={styles.primaryBtnText}>Add Walk-in Customer</Text>
      </TouchableOpacity>

      {showWalkInInput ? (
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={walkInName}
            onChangeText={setWalkInName}
            placeholder="Walk-in customer name"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={addWalkInCustomer} disabled={addingWalkIn}>
            <Text style={styles.primaryBtnText}>{addingWalkIn ? 'Adding...' : 'Add to Queue'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.section}>Current Queue</Text>
      {entries.map((entry) => (
        <View key={String(entry.id || entry.position)} style={styles.queueRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              #{entry.position} {(entry.user && entry.user.name) || entry.walkInName || 'Customer'}
            </Text>
            <Text style={styles.rowMeta}>{entry.status}</Text>
          </View>
          {entry.status === 'serving' ? (
            <TouchableOpacity style={styles.doneBtn} onPress={() => completeEntry(entry.id)}>
              <Text style={styles.doneText}>Complete</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.section}>Edit Shop Details</Text>
        <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Shop name" />
        <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} placeholder="Shop address" />
        <TextInput
          style={[styles.input, { minHeight: 72 }]}
          value={editDescription}
          onChangeText={setEditDescription}
          placeholder="Description"
          multiline
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={saveShopInfo} disabled={savingShop}>
          <Text style={styles.primaryBtnText}>{savingShop ? 'Saving...' : 'Save shop info'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#0b1c30', marginBottom: 12 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  caption: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  shopName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  editIcon: { color: '#1d4ed8', fontSize: 20, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, padding: 10 },
  statNum: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  section: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  queueRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, padding: 12, marginBottom: 8 },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  doneBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  doneText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 14, padding: 14, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: '#0f172a', marginBottom: 8 },
  primaryBtn: { backgroundColor: '#003366', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  walkInBtn: { backgroundColor: '#0f5fd3', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: '#2563eb', fontWeight: '600' },
  linkMuted: { color: '#64748b', fontWeight: '600' },
});
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  ScrollView,
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
import { subscribeShopQueue } from '../services/socket';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') return Geolocation.requestAuthorization('whenInUse');
  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return fine === PermissionsAndroid.RESULTS.GRANTED;
}

export default function OwnerDashboard({ navigation }) {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState({ entries: [] });
  const [loading, setLoading] = useState(true);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingShop, setSavingShop] = useState(false);
  const [addingWalkIn, setAddingWalkIn] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={toggleTheme}>
            <Text style={styles.link}>{isDark ? 'Light' : 'Dark'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={styles.linkMuted}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await client.get('/shops');
        if (!alive) return;
        const list = data.shops || [];
        setShops(list);
        if (list.length) setShopId(list[0]._id);
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
    if (!shopId) return;
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      try {
        const { data } = await client.get(`/queues/${shopId}`);
        if (!cancelled) setQueue(data);
        cleanup = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) appAlert('Queue', e.response?.data?.message || e.message);
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [shopId]);

  const activeShop = useMemo(() => shops.find((s) => s._id === shopId), [shops, shopId]);
  useEffect(() => {
    if (!activeShop) return;
    setEditName(activeShop.name || '');
    setEditAddress(activeShop.address || '');
    setEditDescription(activeShop.description || '');
  }, [activeShop]);

  const entries = queue.entries || [];
  const waiting = entries.filter((e) => e.status === 'waiting').length;
  const serving = entries.find((e) => e.status === 'serving');
  const est = waiting * 3;

  async function saveShop() {
    if (!shopId) return;
    try {
      setSavingShop(true);
      const payload = { name: editName.trim(), address: editAddress.trim(), description: editDescription.trim() };
      const { data } = await client.patch(`/shops/${shopId}`, payload);
      setShops((prev) => prev.map((s) => (s._id === shopId ? data.shop : s)));
      appAlert('Saved', 'Shop details updated.');
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    } finally {
      setSavingShop(false);
    }
  }

  async function serveNext() {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/next`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function complete(entryId) {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/complete/${entryId}`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function addWalkIn() {
    if (!walkInName.trim()) {
      appAlert('Required', 'Enter walk-in customer name.');
      return;
    }
    try {
      setAddingWalkIn(true);
      const { data } = await client.post(`/queues/${shopId}/owner/walk-in`, {
        walkInName: walkInName.trim(),
      });
      setQueue(data);
      setWalkInName('');
      setShowWalkIn(false);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    } finally {
      setAddingWalkIn(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!activeShop) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No shop found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Shop</Text>
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.caption}>Shop Name</Text>
          <Text style={styles.shopName}>{activeShop.name}</Text>
        </View>
        <Text style={styles.editIcon}>✎</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}><Text style={styles.caption}>Waiting</Text><Text style={styles.statNum}>{waiting}</Text></View>
        <View style={styles.stat}><Text style={styles.caption}>Serving</Text><Text style={styles.statNum}>{serving ? `#${serving.position}` : '-'}</Text></View>
        <View style={styles.stat}><Text style={styles.caption}>Est Time</Text><Text style={styles.statNum}>{est}m</Text></View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={serveNext}>
        <Text style={styles.primaryBtnText}>Serve Next Customer</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.walkInBtn} onPress={() => setShowWalkIn((v) => !v)}>
        <Text style={styles.primaryBtnText}>Add Walk-in Customer</Text>
      </TouchableOpacity>

      {showWalkIn ? (
        <View style={styles.card}>
          <TextInput style={styles.input} value={walkInName} onChangeText={setWalkInName} placeholder="Walk-in customer name" />
          <TouchableOpacity style={styles.primaryBtn} onPress={addWalkIn} disabled={addingWalkIn}>
            <Text style={styles.primaryBtnText}>{addingWalkIn ? 'Adding...' : 'Add to Queue'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.section}>Current Queue</Text>
      {entries.map((e) => (
        <View key={String(e.id || e.position)} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>#{e.position} {(e.user && e.user.name) || e.walkInName || 'Customer'}</Text>
            <Text style={styles.rowMeta}>{e.status}</Text>
          </View>
          {e.status === 'serving' ? (
            <TouchableOpacity style={styles.doneBtn} onPress={() => complete(e.id)}>
              <Text style={styles.doneText}>Complete</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.section}>Edit Shop Details</Text>
        <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Shop name" />
        <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} placeholder="Shop address" />
        <TextInput style={[styles.input, { minHeight: 72 }]} value={editDescription} onChangeText={setEditDescription} multiline placeholder="Description" />
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={async () => {
            const ok = await ensureLocationPermission();
            if (!ok) appAlert('Permission', 'Location permission denied');
            else appAlert('Location', 'Location permission available');
          }}
        >
          <Text style={styles.outlineText}>Refresh location</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={saveShop} disabled={savingShop}>
          <Text style={styles.primaryBtnText}>{savingShop ? 'Saving...' : 'Save shop info'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#0b1c30', marginBottom: 12 },
  headerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 14, padding: 14, marginBottom: 12 },
  caption: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  shopName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  editIcon: { color: '#1d4ed8', fontSize: 20, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, padding: 10 },
  statNum: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  primaryBtn: { backgroundColor: '#003366', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  walkInBtn: { backgroundColor: '#0f5fd3', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  section: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, padding: 12, marginBottom: 8 },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  doneBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  doneText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 14, padding: 14, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: '#0f172a', marginBottom: 8 },
  outlineBtn: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  outlineText: { color: '#2563eb', fontWeight: '700' },
  link: { color: '#2563eb', fontWeight: '600' },
  linkMuted: { color: '#64748b', fontWeight: '600' },
});
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  ScrollView,
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
import { subscribeShopQueue } from '../services/socket';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') return Geolocation.requestAuthorization('whenInUse');
  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return fine === PermissionsAndroid.RESULTS.GRANTED;
}

export default function OwnerDashboard({ navigation }) {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingShop, setCreatingShop] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [updatingShop, setUpdatingShop] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopAddressInput, setShopAddressInput] = useState('');
  const [shopCoords, setShopCoords] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoords, setEditCoords] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [showWalkInInput, setShowWalkInInput] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={toggleTheme}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>
              {isDark ? 'Light' : 'Dark'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={{ color: '#64748b', fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await client.get('/shops');
        const list = data.shops || [];
        if (!alive) return;
        setShops(list);
        if (list.length) setShopId(list[0]._id);
      } catch (e) {
        appAlert('Error', e.response?.data?.message || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (shops.length > 0 || shopCoords) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureLocationPermission();
      if (!ok || cancelled) return;
      Geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setShopCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (!cancelled) setShopCoords(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shops.length, shopCoords]);

  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    let removeSocket = () => {};
    async function sync() {
      try {
        const [{ data: q }, { data: it }] = await Promise.all([
          client.get(`/queues/${shopId}`),
          client.get(`/shops/${shopId}/items`),
        ]);
        if (!cancelled) {
          setQueue(q);
          setItems(it.items || []);
        }
        removeSocket = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) appAlert('Queue', e.response?.data?.message || e.message);
      }
    }
    sync();
    return () => {
      cancelled = true;
      removeSocket();
    };
  }, [shopId]);

  useEffect(() => {
    const active = shops.find((s) => s._id === shopId);
    if (!active) return;
    setEditName(active.name || '');
    setEditAddress(active.address || '');
    setEditDescription(active.description || '');
    const coordinates = active.location?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      setEditCoords({ lng: Number(coordinates[0]), lat: Number(coordinates[1]) });
    } else {
      setEditCoords(null);
    }
  }, [shopId, shops]);

  async function refreshLocation(setter) {
    try {
      setRefreshingLocation(true);
      const ok = await ensureLocationPermission();
      if (!ok) {
        appAlert('Permission needed', 'Location permission is required.');
        return;
      }
      await new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            setter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            resolve();
          },
          () => {
            appAlert('Location error', 'Could not fetch current location.');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      });
    } finally {
      setRefreshingLocation(false);
    }
  }

  async function createShop() {
    if (!shopNameInput.trim() || !shopAddressInput.trim() || !shopCoords) {
      appAlert('Check form', 'Name, address, and location are required.');
      return;
    }
    try {
      setCreatingShop(true);
      const { data } = await client.post('/shops', {
        name: shopNameInput.trim(),
        address: shopAddressInput.trim(),
        lat: shopCoords.lat,
        lng: shopCoords.lng,
      });
      setShops((prev) => [data.shop, ...prev]);
      setShopId(data.shop._id);
      setShopNameInput('');
      setShopAddressInput('');
    } catch (e) {
      appAlert('Create shop failed', e.response?.data?.message || e.message);
    } finally {
      setCreatingShop(false);
    }
  }

  async function updateShopInfo() {
    if (!shopId) return;
    if (!editName.trim() || !editAddress.trim()) {
      appAlert('Check form', 'Shop name and address are required.');
      return;
    }
    try {
      setUpdatingShop(true);
      const payload = {
        name: editName.trim(),
        address: editAddress.trim(),
        description: editDescription.trim(),
      };
      if (editCoords) {
        payload.lat = editCoords.lat;
        payload.lng = editCoords.lng;
      }
      const { data } = await client.patch(`/shops/${shopId}`, payload);
      setShops((prev) => prev.map((s) => (s._id === shopId ? data.shop : s)));
      appAlert('Updated', 'Shop info saved.');
    } catch (e) {
      appAlert('Update failed', e.response?.data?.message || e.message);
    } finally {
      setUpdatingShop(false);
    }
  }

  async function callNext() {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/next`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function completeEntry(entryId) {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/complete/${entryId}`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function addWalkInCustomer() {
    if (!walkInName.trim()) {
      appAlert('Enter name', 'Walk-in customer name is required.');
      return;
    }
    try {
      setAddingWalkIn(true);
      const { data } = await client.post(`/queues/${shopId}/owner/walk-in`, {
        walkInName: walkInName.trim(),
      });
      setQueue(data);
      setWalkInName('');
      setShowWalkInInput(false);
    } catch (e) {
      appAlert('Could not add customer', e.response?.data?.message || e.message);
    } finally {
      setAddingWalkIn(false);
    }
  }

  async function addItem() {
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || Number.isNaN(price)) {
      appAlert('Check item', 'Enter name and valid price.');
      return;
    }
    try {
      await client.post(`/shops/${shopId}/items`, { name: itemName.trim(), price });
      setItemName('');
      setItemPrice('');
      const { data } = await client.get(`/shops/${shopId}/items`);
      setItems(data.items || []);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  const entries = queue?.entries || [];
  const waitingCount = entries.filter((e) => e.status === 'waiting').length;
  const servingEntry = entries.find((e) => e.status === 'serving');
  const estimateMinutes = waitingCount * 3;
  const activeShop = useMemo(() => shops.find((s) => s._id === shopId), [shops, shopId]);

  if (loading && !shops.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!shops.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No shop yet</Text>
        <Text style={styles.emptyText}>Create your first shop to start serving queue.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Shop name</Text>
          <TextInput style={styles.input} value={shopNameInput} onChangeText={setShopNameInput} />
          <Text style={styles.label}>Shop address</Text>
          <TextInput style={styles.input} value={shopAddressInput} onChangeText={setShopAddressInput} />
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={[styles.input, styles.readonlyInput]}
            editable={false}
            value={shopCoords ? `${shopCoords.lat.toFixed(6)}, ${shopCoords.lng.toFixed(6)}` : 'Fetching...'}
          />
          <TouchableOpacity style={styles.outlineBtn} onPress={() => refreshLocation(setShopCoords)}>
            <Text style={styles.outlineBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh location'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={createShop} disabled={creatingShop}>
            <Text style={styles.primaryBtnText}>{creatingShop ? 'Creating…' : 'Create shop'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Your Shop</Text>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mutedLabel}>Shop Name</Text>
          <Text style={styles.shopName}>{activeShop?.name || 'My Shop'}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>✎</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Waiting</Text>
          <Text style={styles.statValue}>{waitingCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Serving</Text>
          <Text style={styles.statValue}>{servingEntry ? `#${servingEntry.position}` : '-'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Est. Time</Text>
          <Text style={styles.statValue}>{estimateMinutes}m</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={callNext}>
        <Text style={styles.primaryBtnText}>Serve Next Customer</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.walkInBtn} onPress={() => setShowWalkInInput((v) => !v)}>
        <Text style={styles.walkInBtnText}>Add Walk-in Customer</Text>
      </TouchableOpacity>

      {showWalkInInput ? (
        <View style={styles.card}>
          <Text style={styles.label}>Walk-in customer name</Text>
          <TextInput
            style={styles.input}
            value={walkInName}
            onChangeText={setWalkInName}
            placeholder="Enter customer name"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={addWalkInCustomer} disabled={addingWalkIn}>
            <Text style={styles.primaryBtnText}>{addingWalkIn ? 'Adding…' : 'Add to Queue'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Current Queue</Text>
      {entries.length === 0 ? (
        <Text style={styles.placeholder}>No customers in queue right now.</Text>
      ) : (
        entries.map((entry) => {
          const displayName =
            (typeof entry.user === 'object' && entry.user?.name) ||
            entry.walkInName ||
            'Customer';
          return (
            <View key={entry.id?.toString() || `${entry.position}`} style={styles.queueRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  #{entry.position} {displayName}
                </Text>
                <Text style={styles.rowMeta}>{entry.status}</Text>
              </View>
              {entry.status === 'serving' ? (
                <TouchableOpacity style={styles.smallBtn} onPress={() => completeEntry(entry.id)}>
                  <Text style={styles.smallBtnText}>Complete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Edit Shop Details</Text>
        <Text style={styles.label}>Shop name</Text>
        <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
        <Text style={styles.label}>Shop address</Text>
        <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={editDescription}
          onChangeText={setEditDescription}
          multiline
        />
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={[styles.input, styles.readonlyInput]}
          editable={false}
          value={editCoords ? `${editCoords.lat.toFixed(6)}, ${editCoords.lng.toFixed(6)}` : 'Not set'}
        />
        <TouchableOpacity style={styles.outlineBtn} onPress={() => refreshLocation(setEditCoords)}>
          <Text style={styles.outlineBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh location'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={updateShopInfo} disabled={updatingShop}>
          <Text style={styles.primaryBtnText}>{updatingShop ? 'Saving…' : 'Save shop info'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Menu Items</Text>
        {items.map((it) => (
          <Text key={it._id} style={styles.menuLine}>
            {it.name} - ${Number(it.price).toFixed(2)}
          </Text>
        ))}
        <Text style={styles.label}>Add item</Text>
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#94a3b8"
          value={itemName}
          onChangeText={setItemName}
        />
        <TextInput
          style={styles.input}
          placeholder="Price"
          placeholderTextColor="#94a3b8"
          keyboardType="decimal-pad"
          value={itemPrice}
          onChangeText={setItemPrice}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={addItem}>
          <Text style={styles.primaryBtnText}>Add menu item</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  emptyText: { color: '#64748b', marginTop: 8, marginBottom: 16, textAlign: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#0b1c30', marginBottom: 12 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 14,
    marginBottom: 12,
  },
  mutedLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  shopName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fbff',
  },
  iconBtnText: { color: '#1d4ed8', fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 10,
  },
  statLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  statValue: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  placeholder: { color: '#94a3b8', marginBottom: 12 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 14,
    marginTop: 12,
  },
  label: { color: '#334155', fontWeight: '600', fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  readonlyInput: { backgroundColor: '#f8fafc', color: '#64748b' },
  descriptionInput: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: '#003366',
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  walkInBtn: {
    backgroundColor: '#0f5fd3',
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  walkInBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  outlineBtnText: { color: '#2563eb', fontWeight: '700' },
  smallBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  menuLine: { color: '#334155', marginBottom: 6 },
});
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  ScrollView,
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
import { subscribeShopQueue } from '../services/socket';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') return Geolocation.requestAuthorization('whenInUse');
  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return fine === PermissionsAndroid.RESULTS.GRANTED;
}

export default function OwnerDashboard({ navigation }) {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingShop, setCreatingShop] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [updatingShop, setUpdatingShop] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopAddressInput, setShopAddressInput] = useState('');
  const [shopCoords, setShopCoords] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoords, setEditCoords] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [showWalkInInput, setShowWalkInInput] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={toggleTheme}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>{isDark ? 'Light' : 'Dark'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={{ color: '#64748b', fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await client.get('/shops');
        const list = data.shops || [];
        if (!alive) return;
        setShops(list);
        if (list.length) setShopId(list[0]._id);
      } catch (e) {
        appAlert('Error', e.response?.data?.message || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (shops.length > 0 || shopCoords) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureLocationPermission();
      if (!ok || cancelled) return;
      Geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setShopCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (!cancelled) setShopCoords(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shops.length, shopCoords]);

  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    let removeSocket = () => {};
    async function sync() {
      try {
        const [{ data: q }, { data: it }] = await Promise.all([
          client.get(`/queues/${shopId}`),
          client.get(`/shops/${shopId}/items`),
        ]);
        if (!cancelled) {
          setQueue(q);
          setItems(it.items || []);
        }
        removeSocket = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) appAlert('Queue', e.response?.data?.message || e.message);
      }
    }
    sync();
    return () => {
      cancelled = true;
      removeSocket();
    };
  }, [shopId]);

  useEffect(() => {
    const active = shops.find((s) => s._id === shopId);
    if (!active) return;
    setEditName(active.name || '');
    setEditAddress(active.address || '');
    setEditDescription(active.description || '');
    const coordinates = active.location?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      setEditCoords({ lng: Number(coordinates[0]), lat: Number(coordinates[1]) });
    } else {
      setEditCoords(null);
    }
  }, [shopId, shops]);

  async function refreshLocation(setter) {
    try {
      setRefreshingLocation(true);
      const ok = await ensureLocationPermission();
      if (!ok) {
        appAlert('Permission needed', 'Location permission is required.');
        return;
      }
      await new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            setter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            resolve();
          },
          () => {
            appAlert('Location error', 'Could not fetch current location.');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      });
    } finally {
      setRefreshingLocation(false);
    }
  }

  async function createShop() {
    if (!shopNameInput.trim() || !shopAddressInput.trim() || !shopCoords) {
      appAlert('Check form', 'Name, address, and location are required.');
      return;
    }
    try {
      setCreatingShop(true);
      const { data } = await client.post('/shops', {
        name: shopNameInput.trim(),
        address: shopAddressInput.trim(),
        lat: shopCoords.lat,
        lng: shopCoords.lng,
      });
      setShops((prev) => [data.shop, ...prev]);
      setShopId(data.shop._id);
      setShopNameInput('');
      setShopAddressInput('');
    } catch (e) {
      appAlert('Create shop failed', e.response?.data?.message || e.message);
    } finally {
      setCreatingShop(false);
    }
  }

  async function updateShopInfo() {
    if (!shopId) return;
    if (!editName.trim() || !editAddress.trim()) {
      appAlert('Check form', 'Shop name and address are required.');
      return;
    }
    try {
      setUpdatingShop(true);
      const payload = {
        name: editName.trim(),
        address: editAddress.trim(),
        description: editDescription.trim(),
      };
      if (editCoords) {
        payload.lat = editCoords.lat;
        payload.lng = editCoords.lng;
      }
      const { data } = await client.patch(`/shops/${shopId}`, payload);
      setShops((prev) => prev.map((s) => (s._id === shopId ? data.shop : s)));
      appAlert('Updated', 'Shop info saved.');
    } catch (e) {
      appAlert('Update failed', e.response?.data?.message || e.message);
    } finally {
      setUpdatingShop(false);
    }
  }

  async function callNext() {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/next`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function completeEntry(entryId) {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/complete/${entryId}`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function addWalkInCustomer() {
    if (!walkInName.trim()) {
      appAlert('Enter name', 'Walk-in customer name is required.');
      return;
    }
    try {
      setAddingWalkIn(true);
      const { data } = await client.post(`/queues/${shopId}/owner/walk-in`, {
        walkInName: walkInName.trim(),
      });
      setQueue(data);
      setWalkInName('');
      setShowWalkInInput(false);
    } catch (e) {
      appAlert('Could not add customer', e.response?.data?.message || e.message);
    } finally {
      setAddingWalkIn(false);
    }
  }

  async function addItem() {
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || Number.isNaN(price)) {
      appAlert('Check item', 'Enter name and valid price.');
      return;
    }
    try {
      await client.post(`/shops/${shopId}/items`, { name: itemName.trim(), price });
      setItemName('');
      setItemPrice('');
      const { data } = await client.get(`/shops/${shopId}/items`);
      setItems(data.items || []);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  const entries = queue?.entries || [];
  const waitingCount = entries.filter((e) => e.status === 'waiting').length;
  const servingEntry = entries.find((e) => e.status === 'serving');
  const estimateMinutes = waitingCount * 3;
  const activeShop = useMemo(() => shops.find((s) => s._id === shopId), [shops, shopId]);

  if (loading && !shops.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!shops.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No shop yet</Text>
        <Text style={styles.emptyText}>Create your first shop to start serving queue.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Shop name</Text>
          <TextInput style={styles.input} value={shopNameInput} onChangeText={setShopNameInput} />
          <Text style={styles.label}>Shop address</Text>
          <TextInput style={styles.input} value={shopAddressInput} onChangeText={setShopAddressInput} />
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={[styles.input, styles.readonlyInput]}
            editable={false}
            value={shopCoords ? `${shopCoords.lat.toFixed(6)}, ${shopCoords.lng.toFixed(6)}` : 'Fetching...'}
          />
          <TouchableOpacity style={styles.outlineBtn} onPress={() => refreshLocation(setShopCoords)}>
            <Text style={styles.outlineBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh location'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={createShop} disabled={creatingShop}>
            <Text style={styles.primaryBtnText}>{creatingShop ? 'Creating…' : 'Create shop'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Your Shop</Text>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mutedLabel}>Shop Name</Text>
          <Text style={styles.shopName}>{activeShop?.name || 'My Shop'}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>✎</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Waiting</Text>
          <Text style={styles.statValue}>{waitingCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Serving</Text>
          <Text style={styles.statValue}>{servingEntry ? `#${servingEntry.position}` : '-'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Est. Time</Text>
          <Text style={styles.statValue}>{estimateMinutes}m</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={callNext}>
        <Text style={styles.primaryBtnText}>Serve Next Customer</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.walkInBtn} onPress={() => setShowWalkInInput((v) => !v)}>
        <Text style={styles.walkInBtnText}>Add Walk-in Customer</Text>
      </TouchableOpacity>

      {showWalkInInput ? (
        <View style={styles.card}>
          <Text style={styles.label}>Walk-in customer name</Text>
          <TextInput
            style={styles.input}
            value={walkInName}
            onChangeText={setWalkInName}
            placeholder="Enter customer name"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={addWalkInCustomer} disabled={addingWalkIn}>
            <Text style={styles.primaryBtnText}>{addingWalkIn ? 'Adding…' : 'Add to Queue'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Current Queue</Text>
      {entries.length === 0 ? (
        <Text style={styles.placeholder}>No customers in queue right now.</Text>
      ) : (
        entries.map((entry) => {
          const displayName =
            (typeof entry.user === 'object' && entry.user?.name) ||
            entry.walkInName ||
            'Customer';
          return (
            <View key={entry.id?.toString() || `${entry.position}`} style={styles.queueRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>#{entry.position} {displayName}</Text>
                <Text style={styles.rowMeta}>{entry.status}</Text>
              </View>
              {entry.status === 'serving' ? (
                <TouchableOpacity style={styles.smallBtn} onPress={() => completeEntry(entry.id)}>
                  <Text style={styles.smallBtnText}>Complete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Edit Shop Details</Text>
        <Text style={styles.label}>Shop name</Text>
        <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
        <Text style={styles.label}>Shop address</Text>
        <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} />
        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, styles.descriptionInput]} value={editDescription} onChangeText={setEditDescription} multiline />
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={[styles.input, styles.readonlyInput]}
          editable={false}
          value={editCoords ? `${editCoords.lat.toFixed(6)}, ${editCoords.lng.toFixed(6)}` : 'Not set'}
        />
        <TouchableOpacity style={styles.outlineBtn} onPress={() => refreshLocation(setEditCoords)}>
          <Text style={styles.outlineBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh location'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={updateShopInfo} disabled={updatingShop}>
          <Text style={styles.primaryBtnText}>{updatingShop ? 'Saving…' : 'Save shop info'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Menu Items</Text>
        {items.map((it) => (
          <Text key={it._id} style={styles.menuLine}>{it.name} - ${Number(it.price).toFixed(2)}</Text>
        ))}
        <Text style={styles.label}>Add item</Text>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#94a3b8" value={itemName} onChangeText={setItemName} />
        <TextInput style={styles.input} placeholder="Price" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={itemPrice} onChangeText={setItemPrice} />
        <TouchableOpacity style={styles.primaryBtn} onPress={addItem}>
          <Text style={styles.primaryBtnText}>Add menu item</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  emptyText: { color: '#64748b', marginTop: 8, marginBottom: 16, textAlign: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#0b1c30', marginBottom: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe4f0', padding: 14, marginBottom: 12 },
  mutedLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  shopName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fbff' },
  iconBtnText: { color: '#1d4ed8', fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#dbe4f0', padding: 10 },
  statLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  statValue: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  placeholder: { color: '#94a3b8', marginBottom: 12 },
  queueRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#dbe4f0', borderRadius: 12, backgroundColor: '#fff', padding: 12, marginBottom: 8 },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe4f0', padding: 14, marginTop: 12 },
  label: { color: '#334155', fontWeight: '600', fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a', backgroundColor: '#fff', marginBottom: 6 },
  readonlyInput: { backgroundColor: '#f8fafc', color: '#64748b' },
  descriptionInput: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: '#003366', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  walkInBtn: { backgroundColor: '#0f5fd3', borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  walkInBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  outlineBtnText: { color: '#2563eb', fontWeight: '700' },
  smallBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  menuLine: { color: '#334155', marginBottom: 6 },
});
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  ScrollView,
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
import { subscribeShopQueue } from '../services/socket';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    return Geolocation.requestAuthorization('whenInUse');
  }
  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return fine === PermissionsAndroid.RESULTS.GRANTED;
}

export default function OwnerDashboard({ navigation }) {
  const { logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [creatingShop, setCreatingShop] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopAddressInput, setShopAddressInput] = useState('');
  const [shopCoords, setShopCoords] = useState(null);

  const [updatingShop, setUpdatingShop] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoords, setEditCoords] = useState(null);

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  const [walkInName, setWalkInName] = useState('');
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [showWalkInInput, setShowWalkInInput] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={toggleTheme}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>
              {isDark ? 'Light' : 'Dark'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={{ color: '#64748b', fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await client.get('/shops');
        const list = data.shops || [];
        if (!alive) return;
        setShops(list);
        if (list.length) setShopId(list[0]._id);
      } catch (e) {
        appAlert('Error', e.response?.data?.message || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (shops.length > 0 || shopCoords) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureLocationPermission();
      if (!ok || cancelled) return;
      Geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setShopCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (!cancelled) setShopCoords(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shops.length, shopCoords]);

  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    let removeSocket = () => {};
    async function sync() {
      try {
        const [{ data: q }, { data: it }] = await Promise.all([
          client.get(`/queues/${shopId}`),
          client.get(`/shops/${shopId}/items`),
        ]);
        if (!cancelled) {
          setQueue(q);
          setItems(it.items || []);
        }
        removeSocket = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) appAlert('Queue', e.response?.data?.message || e.message);
      }
    }
    sync();
    return () => {
      cancelled = true;
      removeSocket();
    };
  }, [shopId]);

  useEffect(() => {
    const active = shops.find((s) => s._id === shopId);
    if (!active) return;
    setEditName(active.name || '');
    setEditAddress(active.address || '');
    setEditDescription(active.description || '');
    const coordinates = active.location?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      setEditCoords({ lng: Number(coordinates[0]), lat: Number(coordinates[1]) });
    } else {
      setEditCoords(null);
    }
  }, [shopId, shops]);

  async function createShop() {
    if (!shopNameInput.trim() || !shopAddressInput.trim() || !shopCoords) {
      appAlert('Check form', 'Name, address, and location are required.');
      return;
    }
    try {
      setCreatingShop(true);
      const { data } = await client.post('/shops', {
        name: shopNameInput.trim(),
        address: shopAddressInput.trim(),
        lat: shopCoords.lat,
        lng: shopCoords.lng,
      });
      const created = data.shop;
      setShops((prev) => [created, ...prev]);
      setShopId(created._id);
      setShopNameInput('');
      setShopAddressInput('');
    } catch (e) {
      appAlert('Create shop failed', e.response?.data?.message || e.message);
    } finally {
      setCreatingShop(false);
    }
  }

  async function refreshLocation(setter) {
    try {
      setRefreshingLocation(true);
      const ok = await ensureLocationPermission();
      if (!ok) {
        appAlert('Permission needed', 'Location permission is required.');
        return;
      }
      await new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            setter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            resolve();
          },
          () => {
            appAlert('Location error', 'Could not fetch current location.');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      });
    } finally {
      setRefreshingLocation(false);
    }
  }

  async function updateShopInfo() {
    if (!shopId) return;
    if (!editName.trim() || !editAddress.trim()) {
      appAlert('Check form', 'Shop name and address are required.');
      return;
    }
    try {
      setUpdatingShop(true);
      const payload = {
        name: editName.trim(),
        address: editAddress.trim(),
        description: editDescription.trim(),
      };
      if (editCoords) {
        payload.lat = editCoords.lat;
        payload.lng = editCoords.lng;
      }
      const { data } = await client.patch(`/shops/${shopId}`, payload);
      const updated = data.shop;
      setShops((prev) => prev.map((s) => (s._id === shopId ? updated : s)));
      appAlert('Updated', 'Shop info saved.');
    } catch (e) {
      appAlert('Update failed', e.response?.data?.message || e.message);
    } finally {
      setUpdatingShop(false);
    }
  }

  async function callNext() {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/next`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function completeEntry(entryId) {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/complete/${entryId}`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function addWalkInCustomer() {
    if (!walkInName.trim()) {
      appAlert('Enter name', 'Walk-in customer name is required.');
      return;
    }
    try {
      setAddingWalkIn(true);
      const { data } = await client.post(`/queues/${shopId}/owner/walk-in`, {
        walkInName: walkInName.trim(),
      });
      setQueue(data);
      setWalkInName('');
      setShowWalkInInput(false);
    } catch (e) {
      appAlert('Could not add customer', e.response?.data?.message || e.message);
    } finally {
      setAddingWalkIn(false);
    }
  }

  async function addItem() {
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || Number.isNaN(price)) {
      appAlert('Check item', 'Enter name and valid price.');
      return;
    }
    try {
      await client.post(`/shops/${shopId}/items`, {
        name: itemName.trim(),
        price,
      });
      setItemName('');
      setItemPrice('');
      const { data } = await client.get(`/shops/${shopId}/items`);
      setItems(data.items || []);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  const entries = queue?.entries || [];
  const waitingCount = entries.filter((e) => e.status === 'waiting').length;
  const servingEntry = entries.find((e) => e.status === 'serving');
  const estimateMinutes = waitingCount * 3;
  const activeShop = useMemo(() => shops.find((s) => s._id === shopId), [shops, shopId]);

  if (loading && !shops.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!shops.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No shop yet</Text>
        <Text style={styles.emptyText}>Create your first shop to start serving queue.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Shop name</Text>
          <TextInput style={styles.input} value={shopNameInput} onChangeText={setShopNameInput} />
          <Text style={styles.label}>Shop address</Text>
          <TextInput style={styles.input} value={shopAddressInput} onChangeText={setShopAddressInput} />
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={[styles.input, styles.readonlyInput]}
            editable={false}
            value={shopCoords ? `${shopCoords.lat.toFixed(6)}, ${shopCoords.lng.toFixed(6)}` : 'Fetching...'}
          />
          <TouchableOpacity style={styles.outlineBtn} onPress={() => refreshLocation(setShopCoords)}>
            <Text style={styles.outlineBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh location'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={createShop} disabled={creatingShop}>
            <Text style={styles.primaryBtnText}>{creatingShop ? 'Creating…' : 'Create shop'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Your Shop</Text>

      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mutedLabel}>Shop Name</Text>
          <Text style={styles.shopName}>{activeShop?.name || 'My Shop'}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>✎</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Waiting</Text>
          <Text style={styles.statValue}>{waitingCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Serving</Text>
          <Text style={styles.statValue}>{servingEntry ? `#${servingEntry.position}` : '-'}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Est. Time</Text>
          <Text style={styles.statValue}>{estimateMinutes}m</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={callNext}>
        <Text style={styles.primaryBtnText}>Serve Next Customer</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.walkInBtn}
        onPress={() => setShowWalkInInput((v) => !v)}
      >
        <Text style={styles.walkInBtnText}>Add Walk-in Customer</Text>
      </TouchableOpacity>

      {showWalkInInput ? (
        <View style={styles.card}>
          <Text style={styles.label}>Walk-in customer name</Text>
          <TextInput
            style={styles.input}
            value={walkInName}
            onChangeText={setWalkInName}
            placeholder="Enter customer name"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={addWalkInCustomer}
            disabled={addingWalkIn}
          >
            <Text style={styles.primaryBtnText}>
              {addingWalkIn ? 'Adding…' : 'Add to Queue'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Current Queue</Text>
      {entries.length === 0 ? (
        <Text style={styles.placeholder}>No customers in queue right now.</Text>
      ) : (
        entries.map((entry) => {
          const displayName =
            (typeof entry.user === 'object' && entry.user?.name) ||
            entry.walkInName ||
            'Customer';
          return (
            <View key={entry.id?.toString() || `${entry.position}`} style={styles.queueRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>#{entry.position} {displayName}</Text>
                <Text style={styles.rowMeta}>{entry.status}</Text>
              </View>
              {entry.status === 'serving' ? (
                <TouchableOpacity style={styles.smallBtn} onPress={() => completeEntry(entry.id)}>
                  <Text style={styles.smallBtnText}>Complete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Edit Shop Details</Text>
        <Text style={styles.label}>Shop name</Text>
        <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
        <Text style={styles.label}>Shop address</Text>
        <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={editDescription}
          onChangeText={setEditDescription}
          multiline
        />
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={[styles.input, styles.readonlyInput]}
          editable={false}
          value={editCoords ? `${editCoords.lat.toFixed(6)}, ${editCoords.lng.toFixed(6)}` : 'Not set'}
        />
        <TouchableOpacity style={styles.outlineBtn} onPress={() => refreshLocation(setEditCoords)}>
          <Text style={styles.outlineBtnText}>{refreshingLocation ? 'Refreshing…' : 'Refresh location'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={updateShopInfo} disabled={updatingShop}>
          <Text style={styles.primaryBtnText}>{updatingShop ? 'Saving…' : 'Save shop info'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Menu Items</Text>
        {items.map((it) => (
          <Text key={it._id} style={styles.menuLine}>
            {it.name} - ${Number(it.price).toFixed(2)}
          </Text>
        ))}
        <Text style={styles.label}>Add item</Text>
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#94a3b8"
          value={itemName}
          onChangeText={setItemName}
        />
        <TextInput
          style={styles.input}
          placeholder="Price"
          placeholderTextColor="#94a3b8"
          keyboardType="decimal-pad"
          value={itemPrice}
          onChangeText={setItemPrice}
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={addItem}>
          <Text style={styles.primaryBtnText}>Add menu item</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  emptyText: { color: '#64748b', marginTop: 8, marginBottom: 16, textAlign: 'center' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#0b1c30', marginBottom: 12 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 14,
    marginBottom: 12,
  },
  mutedLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  shopName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fbff',
  },
  iconBtnText: { color: '#1d4ed8', fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 10,
  },
  statLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  statValue: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  placeholder: { color: '#94a3b8', marginBottom: 12 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    padding: 14,
    marginTop: 12,
  },
  label: { color: '#334155', fontWeight: '600', fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  readonlyInput: { backgroundColor: '#f8fafc', color: '#64748b' },
  descriptionInput: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: '#003366',
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  walkInBtn: {
    backgroundColor: '#0f5fd3',
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  walkInBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  outlineBtnText: { color: '#2563eb', fontWeight: '700' },
  smallBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  menuLine: { color: '#334155', marginBottom: 6 },
});
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { subscribeShopQueue } from '../services/socket';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    return Geolocation.requestAuthorization('whenInUse');
  }
  const fine = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return fine === PermissionsAndroid.RESULTS.GRANTED;
}

export default function OwnerDashboard({ navigation }) {
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [queue, setQueue] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [creatingShop, setCreatingShop] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);
  const [updatingShop, setUpdatingShop] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopAddressInput, setShopAddressInput] = useState('');
  const [shopCoords, setShopCoords] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoords, setEditCoords] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={toggleTheme}>
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>
              {isDark ? 'Light' : 'Dark'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => logout()}>
            <Text style={{ color: '#64748b', fontWeight: '600' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, logout, toggleTheme, isDark]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await client.get('/shops');
        const list = data.shops || [];
        if (!alive) return;
        setShops(list);
        if (list.length) {
          setShopId((prev) => prev || list[0]._id);
        }
      } catch (e) {
        appAlert('Error', e.response?.data?.message || e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (shops.length > 0 || shopCoords) return;
    let cancelled = false;
    (async () => {
      const ok = await ensureLocationPermission();
      if (!ok || cancelled) return;
      Geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setShopCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          if (!cancelled) {
            setShopCoords(null);
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shops.length, shopCoords]);

  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    let removeSocket = () => {};

    async function sync() {
      try {
        const [{ data: q }, { data: it }] = await Promise.all([
          client.get(`/queues/${shopId}`),
          client.get(`/shops/${shopId}/items`),
        ]);
        if (!cancelled) {
          setQueue(q);
          setItems(it.items || []);
        }
        removeSocket = await subscribeShopQueue(shopId, (payload) => {
          if (!cancelled) setQueue(payload);
        });
      } catch (e) {
        if (!cancelled) {
          appAlert('Queue', e.response?.data?.message || e.message);
        }
      }
    }

    sync();

    return () => {
      cancelled = true;
      removeSocket();
    };
  }, [shopId]);

  useEffect(() => {
    const active = shops.find((s) => s._id === shopId);
    if (!active) return;
    setEditName(active.name || '');
    setEditAddress(active.address || '');
    setEditDescription(active.description || '');
    const coordinates = active.location?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      setEditCoords({ lng: Number(coordinates[0]), lat: Number(coordinates[1]) });
    } else {
      setEditCoords(null);
    }
  }, [shopId, shops]);

  async function callNext() {
    try {
      const { data } = await client.post(`/queues/${shopId}/owner/next`);
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function completeEntry(entryId) {
    try {
      const { data } = await client.post(
        `/queues/${shopId}/owner/complete/${entryId}`
      );
      setQueue(data);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function addItem() {
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || Number.isNaN(price)) {
      appAlert('Check item', 'Enter name and valid price.');
      return;
    }
    try {
      await client.post(`/shops/${shopId}/items`, {
        name: itemName.trim(),
        price,
      });
      setItemName('');
      setItemPrice('');
      const { data } = await client.get(`/shops/${shopId}/items`);
      setItems(data.items || []);
    } catch (e) {
      appAlert('Error', e.response?.data?.message || e.message);
    }
  }

  async function createShop() {
    if (!shopNameInput.trim()) {
      appAlert('Check form', 'Shop name is required.');
      return;
    }
    if (!shopAddressInput.trim()) {
      appAlert('Check form', 'Shop address is required.');
      return;
    }
    if (!shopCoords) {
      appAlert(
        'Location missing',
        'Could not fetch location. Turn on location and try again.'
      );
      return;
    }
    try {
      setCreatingShop(true);
      const { data } = await client.post('/shops', {
        name: shopNameInput.trim(),
        address: shopAddressInput.trim(),
        lat: shopCoords.lat,
        lng: shopCoords.lng,
      });
      const created = data.shop;
      setShops((prev) => [created, ...prev]);
      setShopId(created._id);
      setShopNameInput('');
      setShopAddressInput('');
    } catch (e) {
      appAlert('Create shop failed', e.response?.data?.message || e.message);
    } finally {
      setCreatingShop(false);
    }
  }

  async function refreshShopLocation() {
    try {
      setRefreshingLocation(true);
      const ok = await ensureLocationPermission();
      if (!ok) {
        appAlert('Permission needed', 'Location permission is required.');
        return;
      }
      await new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            setShopCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            resolve();
          },
          () => {
            appAlert('Location error', 'Could not fetch current location.');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      });
    } finally {
      setRefreshingLocation(false);
    }
  }

  async function refreshEditLocation() {
    try {
      setRefreshingLocation(true);
      const ok = await ensureLocationPermission();
      if (!ok) {
        appAlert('Permission needed', 'Location permission is required.');
        return;
      }
      await new Promise((resolve) => {
        Geolocation.getCurrentPosition(
          (pos) => {
            setEditCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            resolve();
          },
          () => {
            appAlert('Location error', 'Could not fetch current location.');
            resolve();
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
      });
    } finally {
      setRefreshingLocation(false);
    }
  }

  async function updateShopInfo() {
    if (!shopId) return;
    if (!editName.trim()) {
      appAlert('Check form', 'Shop name is required.');
      return;
    }
    if (!editAddress.trim()) {
      appAlert('Check form', 'Shop address is required.');
      return;
    }
    try {
      setUpdatingShop(true);
      const payload = {
        name: editName.trim(),
        address: editAddress.trim(),
        description: editDescription.trim(),
      };
      if (editCoords) {
        payload.lat = editCoords.lat;
        payload.lng = editCoords.lng;
      }
      const { data } = await client.patch(`/shops/${shopId}`, payload);
      const updated = data.shop;
      setShops((prev) => prev.map((s) => (s._id === shopId ? updated : s)));
      appAlert('Updated', 'Shop info saved successfully.');
    } catch (e) {
      appAlert('Update failed', e.response?.data?.message || e.message);
    } finally {
      setUpdatingShop(false);
    }
  }

  const entries = queue?.entries || [];

  if (loading && !shops.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!shops.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No shop yet</Text>
        <Text style={styles.emptyText}>Create your first shop to start serving queue.</Text>
        <View style={styles.createCard}>
          <Text style={styles.createLabel}>Shop name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sharma Tea Stall"
            placeholderTextColor="#888"
            value={shopNameInput}
            onChangeText={setShopNameInput}
          />
          <Text style={styles.createLabel}>Shop address</Text>
          <TextInput
            style={styles.input}
            placeholder="Full address"
            placeholderTextColor="#888"
            value={shopAddressInput}
            onChangeText={setShopAddressInput}
          />
          <Text style={styles.createLabel}>Auto-fetched location</Text>
          <TextInput
            style={[styles.input, styles.readonlyInput]}
            editable={false}
            value={
              shopCoords
                ? `${shopCoords.lat.toFixed(6)}, ${shopCoords.lng.toFixed(6)}`
                : 'Fetching current location...'
            }
          />
          <TouchableOpacity
            style={[styles.ghostBtn, refreshingLocation && styles.buttonDisabled]}
            onPress={refreshShopLocation}
            disabled={refreshingLocation}
          >
            <Text style={styles.ghostBtnText}>
              {refreshingLocation ? 'Refreshing…' : 'Refresh location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, creatingShop && styles.buttonDisabled]}
            onPress={createShop}
            disabled={creatingShop}
          >
            <Text style={styles.addBtnText}>
              {creatingShop ? 'Creating shop…' : 'Create shop'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={entries}
      keyExtractor={(item) => item.id?.toString() || String(item.position)}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Text style={styles.sectionLabel}>Active shop</Text>
          <View style={styles.shopPicker}>
            {shops.map((s) => (
              <TouchableOpacity
                key={s._id}
                style={[
                  styles.shopChip,
                  shopId === s._id && styles.shopChipActive,
                ]}
                onPress={() => setShopId(s._id)}
              >
                <Text
                  style={[
                    styles.shopChipText,
                    shopId === s._id && styles.shopChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.nextBtn} onPress={callNext}>
            <Text style={styles.nextBtnText}>Serve next customer</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>Queue ({entries.length})</Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.placeholder}>No one is in line right now.</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>
              #{item.position} —{' '}
              {typeof item.user === 'object' && item.user?.name
                ? item.user.name
                : 'Customer'}
            </Text>
            <Text style={styles.rowMeta}>{item.status}</Text>
          </View>
          {item.status === 'serving' ? (
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => completeEntry(item.id)}
            >
              <Text style={styles.smallBtnText}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Text style={styles.sectionLabel}>Edit shop info</Text>
          <TextInput
            style={styles.input}
            placeholder="Shop name"
            placeholderTextColor="#888"
            value={editName}
            onChangeText={setEditName}
          />
          <TextInput
            style={styles.input}
            placeholder="Shop address"
            placeholderTextColor="#888"
            value={editAddress}
            onChangeText={setEditAddress}
          />
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Description (optional)"
            placeholderTextColor="#888"
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
          />
          <TextInput
            style={[styles.input, styles.readonlyInput]}
            editable={false}
            value={
              editCoords
                ? `${editCoords.lat.toFixed(6)}, ${editCoords.lng.toFixed(6)}`
                : 'Location not set'
            }
          />
          <TouchableOpacity
            style={[styles.ghostBtn, refreshingLocation && styles.buttonDisabled]}
            onPress={refreshEditLocation}
            disabled={refreshingLocation}
          >
            <Text style={styles.ghostBtnText}>
              {refreshingLocation ? 'Refreshing…' : 'Refresh location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, updatingShop && styles.buttonDisabled]}
            onPress={updateShopInfo}
            disabled={updatingShop}
          >
            <Text style={styles.addBtnText}>
              {updatingShop ? 'Saving…' : 'Save shop info'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Menu items</Text>
          {items.map((it) => (
            <Text key={it._id} style={styles.menuLine}>
              {it.name} — ${Number(it.price).toFixed(2)}
            </Text>
          ))}
          <Text style={styles.addLabel}>Add item</Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#888"
            value={itemName}
            onChangeText={setItemName}
          />
          <TextInput
            style={styles.input}
            placeholder="Price"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
            value={itemPrice}
            onChangeText={setItemPrice}
          />
          <TouchableOpacity style={styles.addBtn} onPress={addItem}>
            <Text style={styles.addBtnText}>Add menu item</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f8f9fa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#64748b', textAlign: 'center' },
  createCard: {
    width: '100%',
    maxWidth: 420,
    marginTop: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
  },
  createLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 6,
  },
  headerBlock: { padding: 16, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  shopPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  shopChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    maxWidth: '100%',
  },
  shopChipActive: { backgroundColor: '#2563eb' },
  shopChipText: { color: '#334155', fontWeight: '600' },
  shopChipTextActive: { color: '#fff' },
  nextBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  placeholder: { paddingHorizontal: 16, color: '#94a3b8', fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  rowMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  smallBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  footer: { padding: 16, paddingBottom: 40 },
  menuLine: { fontSize: 15, color: '#334155', marginBottom: 6 },
  addLabel: { marginTop: 16, marginBottom: 8, fontWeight: '600', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  descriptionInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  readonlyInput: {
    color: '#64748b',
    backgroundColor: '#f8fafc',
  },
  buttonDisabled: { opacity: 0.6 },
  addBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  ghostBtnText: { color: '#2563eb', fontWeight: '700' },
  addBtnText: { color: '#fff', fontWeight: '700' },
});
