const mongoose = require('mongoose');

const AD_TYPES = ['banner', 'native', 'interstitial', 'rewarded', 'app_open'];
const PLATFORMS = ['android', 'ios', 'all'];

const adUnitSchema = new mongoose.Schema(
  {
    /** Stable key the app uses, e.g. nearby_shops_header */
    placementKey: { type: String, required: true, trim: true, index: true },
    adType: {
      type: String,
      required: true,
      enum: AD_TYPES,
    },
    /** Google AdMob ad unit ID (ca-app-pub-xxx/yyy) */
    adUnitId: { type: String, required: true, trim: true },
    platform: {
      type: String,
      enum: PLATFORMS,
      default: 'all',
    },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

adUnitSchema.index({ placementKey: 1, platform: 1 }, { unique: true });

const AdUnit = mongoose.model('AdUnit', adUnitSchema);
AdUnit.AD_TYPES = AD_TYPES;
AdUnit.PLATFORMS = PLATFORMS;
module.exports = AdUnit;
