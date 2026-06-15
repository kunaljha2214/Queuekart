import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { client, setStoredToken, TOKEN_KEY } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectSocket, disconnectSocket } from '../services/socket';
import { unregisterPushToken } from '../services/pushNotifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const t = await AsyncStorage.getItem(TOKEN_KEY);
      if (!t) {
        setUser(null);
        setToken(null);
        return;
      }
      setToken(t);
      const { data } = await client.get('/auth/me', {
        headers: { Authorization: `Bearer ${t}` },
      });
      setUser(data.user);
      connectSocket();
    } catch {
      await setStoredToken(null);
      setUser(null);
      setToken(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password });
    await setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket();
    return data;
  }, []);

  const requestLoginOtp = useCallback(async (email) => {
    const { data } = await client.post('/auth/forgot-password/request-otp', { email });
    return data;
  }, []);

  const loginWithOtp = useCallback(async (email, otp) => {
    const { data } = await client.post('/auth/forgot-password/verify-otp', { email, otp });
    await setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket();
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await client.post('/auth/register', payload);
    await setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket();
    return data;
  }, []);

  const requestRegisterOtp = useCallback(async (payload) => {
    const { data } = await client.post('/auth/register/request-otp', payload);
    return data;
  }, []);

  const verifyRegisterOtp = useCallback(async (email, otp) => {
    const { data } = await client.post('/auth/register/verify-otp', { email, otp });
    await setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket();
    return data;
  }, []);

  const logout = useCallback(async () => {
    disconnectSocket();
    unregisterPushToken().catch(() => {});
    await setStoredToken(null);
    setUser(null);
    setToken(null);
  }, []);

  const setRole = useCallback(async (role) => {
    const { data } = await client.patch('/auth/role', { role });
    await setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const { data } = await client.get('/auth/me');
    setUser(data.user);
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      isAuthed: !!user && !!token,
      login,
      requestLoginOtp,
      loginWithOtp,
      register,
      requestRegisterOtp,
      verifyRegisterOtp,
      logout,
      setRole,
      refreshUser,
    }),
    [
      user,
      token,
      ready,
      login,
      requestLoginOtp,
      loginWithOtp,
      register,
      requestRegisterOtp,
      verifyRegisterOtp,
      logout,
      setRole,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
