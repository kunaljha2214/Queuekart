const AdUnit = require('../models/AdUnit');

/**
 * Public: active ad units for mobile.
 * query.platform = android | ios (required for correct resolution)
 */
async function listPublicConfig(req, res, next) {
  try {
    const platform = String(req.query.platform || '').toLowerCase();
    if (platform !== 'android' && platform !== 'ios') {
      // App should never brick on ads; return empty config for unknown platforms.
      return res.json({ placements: [] });
    }

    const rows = await AdUnit.find({
      enabled: true,
      platform: { $in: [platform, 'all'] },
    })
      .sort({ sortOrder: 1, placementKey: 1 })
      .lean();

    /** Prefer platform-specific row over `all` for the same placementKey + adType */
    const merged = new Map();
    for (const row of rows) {
      const k = `${row.placementKey}\0${row.adType}`;
      const existing = merged.get(k);
      if (!existing) {
        merged.set(k, row);
        continue;
      }
      const existingSpecific = existing.platform !== 'all';
      const rowSpecific = row.platform !== 'all';
      if (rowSpecific && !existingSpecific) {
        merged.set(k, row);
      }
    }

    const placements = Array.from(merged.values()).map((r) => ({
      placementKey: r.placementKey,
      adType: r.adType,
      adUnitId: r.adUnitId,
      platform: r.platform,
      sortOrder: r.sortOrder,
    }));

    res.json({ placements });
  } catch (e) {
    console.error('ads/config:', e?.message || e);
    // Never fail the mobile app boot path because of ads DB errors.
    res.json({ placements: [] });
  }
}

/**
 * Protected: upsert one ad unit (manage via DB or API using ADS_ADMIN_KEY).
 */
async function upsertUnit(req, res, next) {
  try {
    const { placementKey, adType, adUnitId, platform, enabled, sortOrder, notes } = req.body;
    if (!placementKey || !adType || !adUnitId) {
      return res.status(400).json({ message: 'placementKey, adType, and adUnitId are required' });
    }
    const plat =
      platform === undefined || platform === null || platform === '' ? 'all' : String(platform);
    const doc = await AdUnit.findOneAndUpdate(
      { placementKey: String(placementKey).trim(), platform: plat },
      {
        placementKey: String(placementKey).trim(),
        adType,
        adUnitId: String(adUnitId).trim(),
        platform: plat,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        notes: notes != null ? String(notes) : '',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ unit: doc });
  } catch (e) {
    next(e);
  }
}

async function listAll(req, res, next) {
  try {
    const units = await AdUnit.find({}).sort({ placementKey: 1, platform: 1 }).lean();
    res.json({ units });
  } catch (e) {
    next(e);
  }
}

async function deleteUnit(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await AdUnit.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

module.exports = { listPublicConfig, upsertUnit, listAll, deleteUnit };
