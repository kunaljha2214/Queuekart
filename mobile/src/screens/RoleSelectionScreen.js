import React, { useLayoutEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ThemeToggleSwitch from '../components/ThemeToggleSwitch';
import { appAlert } from '../utils/appAlert';

export default function RoleSelectionScreen({ navigation }) {
  const { user, setRole } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [selected, setSelected] = useState(user?.role || 'customer');
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ThemeToggleSwitch isDark={isDark} onToggle={toggleTheme} />
      ),
    });
  }, [navigation, toggleTheme, isDark]);

  async function apply() {
    if (selected === user?.role) {
      navigation.goBack();
      return;
    }
    setLoading(true);
    try {
      await setRole(selected);
    } catch (e) {
      appAlert(
        'Update failed',
        e.response?.data?.message || e.message || 'Try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.lead}>
        Choose how you use QueueKart. You can change this later from here.
      </Text>
      <TouchableOpacity
        style={[styles.card, selected === 'customer' && styles.cardActive]}
        onPress={() => setSelected('customer')}
      >
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.cardBody}>Find nearby shops and join their queue.</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.card, selected === 'owner' && styles.cardActive]}
        onPress={() => setSelected('owner')}
      >
        <Text style={styles.cardTitle}>Shop owner</Text>
        <Text style={styles.cardBody}>Manage your shop queue and menu items.</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={apply}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  lead: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 20,
    lineHeight: 22,
  },
  card: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  cardBody: { fontSize: 15, color: '#64748b' },
  button: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
