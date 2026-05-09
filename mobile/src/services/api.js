import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

const TOKEN_KEY = '@queuekart/token';

const client = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  client.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err.response?.status;
      const url = err.config?.baseURL != null ? `${err.config.baseURL}${err.config.url || ''}` : '';
      if (status != null) {
        console.warn('[API]', err.config?.method?.toUpperCase(), url, status, err.response?.data);
      }
      return Promise.reject(err);
    }
  );
}

export { client, TOKEN_KEY };

export async function setStoredToken(token) {
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}
