import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { useTheme } from '../context/ThemeContext';
import { registerAppAlert } from '../utils/appAlert';

const defaultState = {
  title: '',
  message: '',
  buttons: [{ text: 'OK', style: 'default' }],
};

export default function AppAlertHost() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState(defaultState);

  const show = useCallback((next) => {
    setConfig({
      title: next?.title ?? '',
      message: next?.message ?? '',
      buttons: Array.isArray(next?.buttons) && next.buttons.length ? next.buttons : defaultState.buttons,
    });
    setVisible(true);
  }, []);

  useEffect(() => {
    registerAppAlert(show);
    return () => registerAppAlert(null);
  }, [show]);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const colors = isDark
    ? {
        overlay: 'rgba(0,0,0,0.55)',
        card: '#111a2b',
        border: '#243047',
        title: '#f8fafc',
        message: '#94a3b8',
        iconBg: '#172554',
        icon: '#60a5fa',
        primary: '#60a5fa',
        primaryText: '#0b1220',
        mutedBtnBorder: '#334155',
        mutedBtnText: '#cbd5e1',
        dangerBg: '#450a0a',
        dangerText: '#fca5a5',
        dangerBorder: '#7f1d1d',
      }
    : {
        overlay: 'rgba(15,23,42,0.45)',
        card: '#ffffff',
        border: '#e2e8f0',
        title: '#0f172a',
        message: '#64748b',
        iconBg: '#e8f0ff',
        icon: '#1d4ed8',
        primary: '#1d4ed8',
        primaryText: '#ffffff',
        mutedBtnBorder: '#cbd5e1',
        mutedBtnText: '#475569',
        dangerBg: '#fef2f2',
        dangerText: '#b91c1c',
        dangerBorder: '#fecaca',
      };

  const cardMaxW = Math.min(340, width - 48);
  const btns = config.buttons;
  const isStacked = btns.length > 2;

  function onPressButton(btn) {
    const fn = btn.onPress;
    close();
    if (fn) {
      requestAnimationFrame(() => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
    }
  }

  function buttonStyle(btn) {
    if (btn.style === 'destructive') {
      return {
        backgroundColor: colors.dangerBg,
        borderColor: colors.dangerBorder,
        borderWidth: 1,
      };
    }
    if (btn.style === 'cancel') {
      return {
        backgroundColor: 'transparent',
        borderColor: colors.mutedBtnBorder,
        borderWidth: 1,
      };
    }
    return {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      borderWidth: 1,
    };
  }

  function labelStyle(btn) {
    if (btn.style === 'destructive') return { color: colors.dangerText };
    if (btn.style === 'cancel') return { color: colors.mutedBtnText };
    return { color: colors.primaryText };
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={[styles.wrap, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { maxWidth: cardMaxW, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.iconBg }]}>
            <Feather name="info" size={22} color={colors.icon} />
          </View>
          <Text style={[styles.title, { color: colors.title }]}>{config.title}</Text>
          {config.message ? (
            <Text style={[styles.message, { color: colors.message }]}>{config.message}</Text>
          ) : null}
          <View style={[isStacked ? styles.col : styles.row, { marginTop: 20 }]}>
            {btns.map((btn, i) => (
              <TouchableOpacity
                key={`${btn.text}-${i}`}
                activeOpacity={0.88}
                onPress={() => onPressButton(btn)}
                style={[
                  styles.btn,
                  isStacked ? styles.btnStacked : styles.btnInline,
                  buttonStyle(btn),
                ]}
              >
                <Text style={[styles.btnLabel, labelStyle(btn)]}>{btn.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  message: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'stretch',
  },
  col: {
    flexDirection: 'column',
    gap: 10,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInline: {
    flex: 1,
    minWidth: 0,
  },
  btnStacked: {
    width: '100%',
  },
  btnLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
