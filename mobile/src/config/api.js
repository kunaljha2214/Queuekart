/**
 * Production host on Render (no trailing slash).
 * - Axios: `${API_BASE_URL}/api`
 * - Socket.io: same origin as API_BASE_URL
 *
 * On Render, set CLIENT_ORIGIN to this exact URL (recommended) or to * so CORS + Socket.io match the app.
 */
export const CLIENT_ORIGIN = 'https://queuekart.onrender.com';
export const API_BASE_URL = CLIENT_ORIGIN;

/** If true, use Google sample ad units when the server has no matching placement (e.g. release APK against an unseeded API). */
export const FORCE_ADMOB_TEST_IDS = false;
