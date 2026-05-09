const admin = require('firebase-admin');
const User = require('../models/User');
const { loadEnv } = require('../config/env');

let didInit = false;

function initFirebaseOnce() {
  if (didInit) return;
  didInit = true;

  const env = loadEnv();
  const raw = String(env.firebaseServiceAccountJson || '').trim();
  if (!raw) {
    return;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    // Keep server running even if push is misconfigured.
    console.error('FCM init failed:', e?.message || e);
  }
}

function isFirebaseReady() {
  return admin.apps && admin.apps.length > 0;
}

async function cleanupInvalidTokens(userId, invalidTokens) {
  if (!invalidTokens?.length) return;
  await User.updateOne(
    { _id: userId },
    { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
  );
}

/**
 * Send a push notification to all known tokens for a user.
 * Payload uses the "notification" field for system tray + "data" for app handling.
 */
async function sendToUser(userId, payload) {
  initFirebaseOnce();
  if (!isFirebaseReady()) return { ok: false, skipped: true, reason: 'firebase_not_configured' };

  const user = await User.findById(userId).lean();
  const tokens = Array.isArray(user?.fcmTokens) ? user.fcmTokens.map((t) => t.token).filter(Boolean) : [];
  if (!tokens.length) return { ok: false, skipped: true, reason: 'no_tokens' };

  const message = {
    tokens,
    notification: payload?.notification || undefined,
    data: payload?.data || undefined,
    android: payload?.android || undefined,
    apns: payload?.apns || undefined,
  };

  const res = await admin.messaging().sendEachForMulticast(message);

  const invalid = [];
  res.responses.forEach((r, idx) => {
    if (r.success) return;
    const code = r.error?.code || '';
    // Common invalid-token codes:
    // - messaging/registration-token-not-registered
    // - messaging/invalid-registration-token
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      invalid.push(tokens[idx]);
    }
  });

  if (invalid.length) {
    try {
      await cleanupInvalidTokens(userId, invalid);
    } catch (e) {
      console.error('FCM token cleanup failed:', e?.message || e);
    }
  }

  return { ok: true, successCount: res.successCount, failureCount: res.failureCount };
}

module.exports = { sendToUser };

