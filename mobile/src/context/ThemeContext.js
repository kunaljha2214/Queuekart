import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@queuekart/theme';
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light');
  const [ready, setReady] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (!mounted) return;
        if (stored === 'light' || stored === 'dark') {
          setMode(stored);
        }
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = useCallback(async (nextMode) => {
    if (!['light', 'dark'].includes(nextMode)) return;
    setMode(nextMode);
    await AsyncStorage.setItem(THEME_KEY, nextMode);
  }, []);

  const toggleTheme = useCallback(async () => {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    await AsyncStorage.setItem(THEME_KEY, nextMode);
  }, [mode]);

  const value = useMemo(
    () => ({
      ready,
      mode,
      isDark: mode === 'dark',
      setTheme,
      toggleTheme,
    }),
    [ready, mode, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

