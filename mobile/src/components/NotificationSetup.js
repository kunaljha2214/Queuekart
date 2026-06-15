import React, { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { registerPushToken } from '../services/pushNotifications';

/** After login, wait for UI then request notification permission + register FCM token. */
export default function NotificationSetup() {
  const { isAuthed } = useAuth();
  const ranForSession = useRef(false);

  useEffect(() => {
    if (!isAuthed) {
      ranForSession.current = false;
      return;
    }
    if (ranForSession.current) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        if (cancelled) return;
        ranForSession.current = true;
        await registerPushToken();
      });
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthed]);

  return null;
}
