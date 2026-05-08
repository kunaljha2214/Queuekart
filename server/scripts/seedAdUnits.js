/**
 * Seed default AdMob *test* ad units for development.
 * Run: node scripts/seedAdUnits.js (from server directory, with MONGODB_URI in .env)
 *
 * Replace adUnitId values with your production units from AdMob console when ready.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const AdUnit = require('../src/models/AdUnit');

/** Google sample ad unit IDs (official test publisher) */
const TEST_BANNER = 'ca-app-pub-3940256099942544/6300978111';
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';

function interstitialPair(placementKey, sortOrder, notes) {
  return [
    {
      placementKey,
      adType: 'interstitial',
      adUnitId: TEST_INTERSTITIAL_ANDROID,
      platform: 'android',
      enabled: true,
      sortOrder,
      notes: `${notes} (Android test)`,
    },
    {
      placementKey,
      adType: 'interstitial',
      adUnitId: TEST_INTERSTITIAL_IOS,
      platform: 'ios',
      enabled: true,
      sortOrder,
      notes: `${notes} (iOS test)`,
    },
  ];
}

async function run() {
  await connectDB();
  const docs = [
    {
      placementKey: 'nearby_shops_header',
      adType: 'banner',
      adUnitId: TEST_BANNER,
      platform: 'all',
      enabled: true,
      sortOrder: 0,
      notes: 'Banner below filters on Nearby shops',
    },
    {
      placementKey: 'my_queue_header',
      adType: 'banner',
      adUnitId: TEST_BANNER,
      platform: 'all',
      enabled: true,
      sortOrder: 10,
      notes: 'Banner below Active/History on My queue',
    },
    {
      placementKey: 'queue_shop_footer',
      adType: 'banner',
      adUnitId: TEST_BANNER,
      platform: 'all',
      enabled: true,
      sortOrder: 20,
      notes: 'Banner at bottom of single-shop queue scroll (test: enabled)',
    },
    ...interstitialPair('customer_join_queue_interstitial', 100, 'After customer joins queue'),
    ...interstitialPair('owner_remove_entry_interstitial', 110, 'After owner removes queue entry'),
    ...interstitialPair('owner_walk_in_interstitial', 120, 'After owner adds walk-in customer(s)'),
  ];

  for (const d of docs) {
    await AdUnit.findOneAndUpdate(
      { placementKey: d.placementKey, platform: d.platform },
      { $set: d },
      { upsert: true, new: true }
    );
    // eslint-disable-next-line no-console
    console.log('Upserted:', d.placementKey, d.platform, d.enabled ? '(enabled)' : '(disabled)');
  }
  // eslint-disable-next-line no-console
  console.log('\nApp loads these via GET /api/ads/config?platform=android|ios');
  console.log('Google test banner id:', TEST_BANNER);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
