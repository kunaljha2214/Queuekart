import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import { TOKEN_KEY } from './api';

let socketInstance;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(API_BASE_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socketInstance;
}

export async function connectSocket() {
  const socket = getSocket();
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  socket.auth = token ? { token } : {};
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket() {
  if (socketInstance?.connected) {
    socketInstance.disconnect();
  }
}

export async function subscribeShopQueue(shopId, onUpdate) {
  const socket = await connectSocket();
  const roomHandler = (payload) => {
    onUpdate(payload);
  };
  socket.emit('shop:join', shopId);
  socket.on('queue:update', roomHandler);
  return () => {
    socket.off('queue:update', roomHandler);
    socket.emit('shop:leave', shopId);
  };
}
