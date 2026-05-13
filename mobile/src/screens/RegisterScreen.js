import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { orderlyFlow } from '../theme/orderlyFlow';
import ThemeToggleSwitch from '../components/ThemeToggleSwitch';
import Feather from 'react-native-vector-icons/Feather';
import { appAlert } from '../utils/appAlert';

const { colors, radius, spacing, type } = orderlyFlow;
const shopLogo = require('../assets/logo-shop.png');

function getAuthPalette(isDark) {
  if (isDark) {
    return {
      pageBg: '#0b1220',
      cardBg: '#111a2b',
      cardBorder: '#22314a',
      text: '#f8fafc',
      textMuted: '#a9bbd4',
      fieldBg: '#0e1728',
      fieldBorder: '#2a3a55',
      primary: '#3b82f6',
      onPrimary: '#ffffff',
      link: '#93c5fd',
      roleBg: '#122038',
      roleActiveBg: '#1d4ed8',
      roleActiveText: '#ffffff',
    };
  }

  return {
    pageBg: '#f4f7fb',
    cardBg: '#ffffff',
    cardBorder: '#dbe4f0',
    text: colors.onSurface,
    textMuted: colors.onSurfaceVariant,
    fieldBg: '#f8fbff',
    fieldBorder: '#d8e1ec',
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    link: colors.primary,
    roleBg: '#f8fbff',
    roleActiveBg: colors.primaryContainer,
    roleActiveText: colors.onPrimaryContainer,
  };
}

export default function RegisterScreen({ navigation }) {
  const { isDark, toggleTheme } = useTheme();
  const ui = useMemo(() => getAuthPalette(isDark), [isDark]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { requestRegisterOtp, verifyRegisterOtp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('customer');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <ThemeToggleSwitch isDark={isDark} onToggle={toggleTheme} />,
    });
  }, [navigation, isDark, toggleTheme]);

  React.useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  async function onRequestOtp() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const normalizedPhone = phone.trim();

    if (!name.trim() || !normalizedEmail || !normalizedPhone || normalizedPassword.length < 6) {
      appAlert(
        'Check form',
        'Name, phone, and email are required; password must be at least 6 characters.'
      );
      return;
    }
    setLoading(true);
    try {
      const data = await requestRegisterOtp({
        name: name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        password: normalizedPassword,
        role,
      });
      setOtpSent(true);
      setResendSeconds(30);
      appAlert('OTP sent', data.message || 'Please check your email for OTP.');
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.response?.data?.errors?.[0]?.msg ||
        e.message ||
        'Registration failed.';
      appAlert('Could not register', msg);
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtpAndCreate() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();
    if (!normalizedEmail || !normalizedOtp) {
      appAlert('Missing fields', 'Enter email and OTP.');
      return;
    }
    setLoading(true);
    try {
      await verifyRegisterOtp(normalizedEmail, normalizedOtp);
    } catch (e) {
      const msg =
        e.response?.data?.message ||
        e.response?.data?.errors?.[0]?.msg ||
        e.message ||
        'OTP verification failed.';
      appAlert('Could not verify OTP', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <Image
              source={shopLogo}
              style={styles.brandLogo}
              resizeMode="contain"
            />
            <Text style={[styles.brandName, type.brandName]}>QueueKart</Text>
          </View>

          <Text style={[styles.lead, type.body]}>
            Create your account and start saving time today.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>I am signing up as</Text>
            <View style={styles.roleRow}>
              {['customer', 'owner'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleChip, role === r && styles.roleChipActive]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[styles.roleChipText, role === r && styles.roleChipTextActive]}
                  >
                    {r === 'customer' ? 'Customer' : 'Shop owner'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={ui.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={ui.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={ui.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="At least 6 characters"
                placeholderTextColor={ui.textMuted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.85}
                style={styles.eyeBtn}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={isDark ? ui.link : ui.text}
                />
              </TouchableOpacity>
            </View>

            {otpSent ? (
              <>
                <Text style={styles.label}>OTP</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter OTP sent to email"
                  placeholderTextColor={ui.textMuted}
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={setOtp}
                />
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={onVerifyOtpAndCreate}
                  disabled={loading}
                  activeOpacity={0.88}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Verifying…' : 'Verify OTP & Create account'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resendLink, (loading || resendSeconds > 0) && styles.resendLinkDisabled]}
                  onPress={onRequestOtp}
                  disabled={loading || resendSeconds > 0}
                  activeOpacity={0.85}
                >
                  <Text style={styles.resendLinkText}>
                    {resendSeconds > 0 ? `Resend OTP in ${resendSeconds}s` : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={onRequestOtp}
                disabled={loading}
                activeOpacity={0.88}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Sending OTP…' : 'Send OTP'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.navigate('Login')}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
          >
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(ui) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: ui.pageBg,
    },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: spacing.marginMobile,
      paddingTop: spacing.stackSm,
      paddingBottom: spacing.stackLg,
      justifyContent: 'center',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginTop: 0,
      marginBottom: spacing.stackMd,
    },
    brandName: {
      color: ui.text,
      marginLeft: 12,
    },
    brandLogo: { width: 46, height: 46 },
    headline: {
      color: ui.text,
      fontSize: 34,
      fontWeight: '800',
      lineHeight: 40,
    },
    lead: {
      color: ui.textMuted,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: spacing.stackLg + 4,
    },
    card: {
      backgroundColor: ui.cardBg,
      borderRadius: 22,
      padding: spacing.gutter + 8,
      borderWidth: 1,
      borderColor: ui.cardBorder,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1,
          shadowRadius: 22,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: ui.text,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: ui.fieldBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: ui.text,
      backgroundColor: ui.fieldBg,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: ui.fieldBorder,
      borderRadius: 14,
      backgroundColor: ui.fieldBg,
    },
    passwordInput: {
      flex: 1,
      borderWidth: 0,
      paddingRight: 12,
    },
    eyeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    roleRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 16 },
    roleChip: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.fieldBorder,
      alignItems: 'center',
      backgroundColor: ui.roleBg,
    },
    roleChipActive: {
      borderColor: ui.primary,
      backgroundColor: ui.roleActiveBg,
    },
    roleChipText: { fontSize: 15, color: ui.textMuted, fontWeight: '600' },
    roleChipTextActive: { color: ui.roleActiveText, fontWeight: '700' },
    button: {
      backgroundColor: ui.primary,
      minHeight: 58,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: ui.onPrimary, fontSize: 17, fontWeight: '700' },
    link: {
      marginTop: spacing.stackSm,
      alignItems: 'center',
    },
    resendLink: {
      alignSelf: 'center',
      marginTop: spacing.stackSm,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    resendLinkDisabled: { opacity: 0.6 },
    resendLinkText: {
      color: ui.link,
      fontSize: 14,
      fontWeight: '600',
    },
    linkText: {
      color: ui.link,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
