/**
 * QueueKart mobile — React Native CLI (Android dev build).
 *
 * @format
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppAlertHost from './src/components/AppAlertHost';
import { AdsProvider } from './src/context/AdsContext';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { initPushListeners } from './src/services/pushNotifications';
import SplashScreen from './src/screens/SplashScreen';

const MIN_SPLASH_MS = 1500;

function AppShell() {
  const { isDark, ready } = useTheme();
  const [minElapsed, setMinElapsed] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (!ready || !minElapsed) return <SplashScreen />;
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

function App() {
  React.useEffect(() => {
    const cleanup = initPushListeners();
    return cleanup;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AdsProvider>
            <AppShell />
          </AdsProvider>
          <AppAlertHost />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
