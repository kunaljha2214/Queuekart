require('dotenv').config();

function loadEnv() {
  return {
    port: parseInt(process.env.PORT || '5000', 10),
    mongodbUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    clientOrigin: process.env.CLIENT_ORIGIN || '*',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    /** Optional: protect POST/DELETE /api/ads/units (header X-Ads-Admin-Key) */
    adsAdminKey: process.env.ADS_ADMIN_KEY || '',
  };
}

module.exports = { loadEnv };
