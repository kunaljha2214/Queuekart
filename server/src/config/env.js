require('dotenv').config();

/** Comma-separated allowed browser/RN dev Origins, or * (default). */
function parseCorsOrigins(raw) {
  const s = String(raw || '*').trim();
  if (!s || s === '*') return '*';
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return '*';
  if (parts.length === 1) return parts[0];
  return parts;
}

function loadEnv() {
  const clientOrigin = process.env.CLIENT_ORIGIN || '*';
  return {
    port: parseInt(process.env.PORT || '5000', 10),
    mongodbUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    clientOrigin,
    /** For Express + Socket.io: string, array of strings, or * */
    corsOrigins: parseCorsOrigins(clientOrigin),
    /** Firebase Admin SDK service account JSON string */
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    /** Push estimate: minutes per real customer ahead */
    fcmDefaultRealCustomerMinutes: parseInt(
      process.env.FCM_DEFAULT_REAL_CUSTOMER_MINUTES || '20',
      10
    ),
    /** Waiting customers must exceed this count to allow paid “join 2nd” (default 5 → 6+ waiting). */
    queuePriorityWaitingThreshold: parseInt(
      process.env.QUEUE_PRIORITY_WAITING_THRESHOLD || '5',
      10
    ),
    /** ₹25 skip fee in paise */
    queuePriorityPricePaise: parseInt(process.env.QUEUE_PRIORITY_PRICE_PAISE || '2500', 10),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    /** Optional: protect POST/DELETE /api/ads/units (header X-Ads-Admin-Key) */
    adsAdminKey: process.env.ADS_ADMIN_KEY || '',
  };
}

module.exports = { loadEnv };
