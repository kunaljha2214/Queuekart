import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OwnerDashboard from '../screens/OwnerDashboardV2';
import NearbyShopsScreen from '../screens/NearbyShopsScreen';
import QueueScreen from '../screens/QueueScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { ready, isAuthed, user } = useAuth();
  const { isDark } = useTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={isAuthed ? user?.role || 'user' : 'guest'}
      screenOptions={{
        headerTitleAlign: 'center',
        contentStyle: { backgroundColor: isDark ? '#0b1220' : '#f8f9fa' },
        headerStyle: { backgroundColor: isDark ? '#111a2b' : '#ffffff' },
        headerTintColor: isDark ? '#f8fafc' : '#0f172a',
      }}
    >
      {!isAuthed ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ title: 'QueueKart' }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ title: 'Create account' }}
          />
        </>
      ) : user?.role === 'owner' ? (
        <>
          <Stack.Screen
            name="OwnerDashboard"
            component={OwnerDashboard}
            options={{ title: 'Your shop' }}
          />
          <Stack.Screen
            name="NearbyShops"
            component={NearbyShopsScreen}
            options={{ title: 'Nearby shops' }}
          />
          <Stack.Screen
            name="Queue"
            component={QueueScreen}
            options={{ title: 'Queue' }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="NearbyShops"
            component={NearbyShopsScreen}
            options={{ title: 'Nearby shops' }}
          />
          <Stack.Screen
            name="Queue"
            component={QueueScreen}
            options={{ title: 'Your queue' }}
          />
          <Stack.Screen
            name="OwnerDashboard"
            component={OwnerDashboard}
            options={{ title: 'Your shop' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
