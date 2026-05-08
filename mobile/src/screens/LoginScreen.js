import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { orderlyFlow } from '../theme/orderlyFlow';
import QueueKartLogoMark from '../components/QueueKartLogoMark';
import ThemeToggleSwitch from '../components/ThemeToggleSwitch';
import Feather from 'react-native-vector-icons/Feather';

const { colors, radius, spacing, type } = orderlyFlow;

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
  };
}

export default function LoginScreen({ navigation }) {
  const { isDark, toggleTheme } = useTheme();
  const ui = useMemo(() => getAuthPalette(isDark), [isDark]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { login, requestLoginOtp, loginWithOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'QueueKart',
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

  async function onSubmit() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      Alert.alert('Missing fields', 'Enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(normalizedEmail, normalizedPassword);
    } catch (e) {
      const msg =
        e.response?.data?.message || e.message || 'Could not sign in.';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Enter email', 'Please enter your account email first.');
      return;
    }
    setOtpLoading(true);
    try {
      const data = await requestLoginOtp(normalizedEmail);
      setOtpSent(true);
      setResendSeconds(30);
      Alert.alert('OTP sent', data.devOtp ? `Use OTP: ${data.devOtp}` : data.message);
    } catch (e) {
      Alert.alert('Could not send OTP', e.response?.data?.message || e.message);
    } finally {
      setOtpLoading(false);
    }
  }

  async function onVerifyOtpSignIn() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();
    if (!normalizedEmail || !normalizedOtp) {
      Alert.alert('Missing fields', 'Enter email and OTP.');
      return;
    }
    setOtpLoading(true);
    try {
      await loginWithOtp(normalizedEmail, normalizedOtp);
    } catch (e) {
      Alert.alert('OTP login failed', e.response?.data?.message || e.message);
    } finally {
      setOtpLoading(false);
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
            <QueueKartLogoMark size={52} />
            <Text style={[styles.brandName, type.brandName]}>QueueKart</Text>
          </View>

          <Text style={[styles.lead, type.body]}>
            Sign in to join queues or manage your shop.
          </Text>

          <View style={styles.card}>
            <View style={styles.field}>
              <Feather
                name="mail"
                size={18}
                color={ui.textMuted}
                accessibilityLabel="Email"
                style={styles.fieldIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={ui.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldIcon} accessibilityLabel="Password">
                🔒
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Password"
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
                style={styles.showHideBtn}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={isDark ? ui.link : ui.text}
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.forgotLink} activeOpacity={0.85}>
              <Text
                style={[
                  styles.forgotLinkText,
                  (otpLoading || resendSeconds > 0) && styles.forgotLinkTextDisabled,
                ]}
                onPress={otpLoading || resendSeconds > 0 ? undefined : onForgotPassword}
              >
                {otpLoading
                  ? 'Sending OTP…'
                  : resendSeconds > 0
                    ? `Resend OTP in ${resendSeconds}s`
                    : 'Forgot password? Send OTP'}
              </Text>
            </TouchableOpacity>

            {otpSent ? (
              <>
                <View style={styles.field}>
                  <Text style={styles.fieldIcon} accessibilityLabel="OTP">
                    #
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter OTP"
                    placeholderTextColor={ui.textMuted}
                    keyboardType="number-pad"
                    value={otp}
                    onChangeText={setOtp}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.otpButton, otpLoading && styles.buttonDisabled]}
                  onPress={onVerifyOtpSignIn}
                  disabled={otpLoading}
                  activeOpacity={0.88}
                >
                  <Text style={styles.otpButtonText}>
                    {otpLoading ? 'Verifying…' : 'Sign in with OTP'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={loading}
              activeOpacity={0.88}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.navigate('Register')}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
          >
            <Text style={styles.linkText}>Create an account</Text>
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
      paddingTop: spacing.stackLg,
      paddingBottom: spacing.stackLg,
      justifyContent: 'center',
    },
    brandRow: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.stackMd,
    },
    brandName: {
      color: ui.text,
      marginTop: 10,
    },
    headline: {
      color: ui.text,
      fontSize: 34,
      fontWeight: '800',
      lineHeight: 40,
      marginBottom: 10,
    },
    lead: {
      color: ui.textMuted,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      alignSelf: 'center',
      maxWidth: 320,
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
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.fieldBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ui.fieldBorder,
      paddingHorizontal: 14,
      marginBottom: spacing.stackSm + 4,
      minHeight: 54,
    },
    fieldIcon: {
      fontSize: 18,
      marginRight: 10,
      opacity: 0.85,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: ui.text,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    },
    showHideBtn: {
      paddingLeft: 10,
      paddingVertical: 8,
    },
    forgotLink: {
      alignSelf: 'flex-end',
      marginTop: -4,
      marginBottom: spacing.stackSm,
    },
    forgotLinkText: {
      color: ui.link,
      fontSize: 14,
      fontWeight: '600',
    },
    forgotLinkTextDisabled: {
      opacity: 0.6,
    },
    button: {
      backgroundColor: ui.primary,
      minHeight: 58,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.stackSm,
    },
    buttonDisabled: { opacity: 0.65 },
    buttonText: {
      color: ui.onPrimary,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    otpButton: {
      borderWidth: 1,
      borderColor: ui.primary,
      minHeight: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      marginBottom: spacing.stackSm,
      backgroundColor: 'transparent',
    },
    otpButtonText: {
      color: ui.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    link: {
      marginTop: spacing.stackLg,
      alignItems: 'center',
    },
    linkText: {
      color: ui.link,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
