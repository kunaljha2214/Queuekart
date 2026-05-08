const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const adController = require('../controllers/adController');
const { loadEnv } = require('../config/env');
const AdUnitModel = require('../models/AdUnit');
const AD_TYPES = AdUnitModel.AD_TYPES;
const PLATFORMS = AdUnitModel.PLATFORMS;

const router = Router();
const env = loadEnv();

function requireAdsAdmin(req, res, next) {
  const key = req.headers['x-ads-admin-key'];
  if (!env.adsAdminKey || key !== env.adsAdminKey) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

/** Mobile app reads this without auth */
router.get('/config', adController.listPublicConfig);

/** Admin-style management — set ADS_ADMIN_KEY and send X-Ads-Admin-Key header */
router.get('/units', requireAdsAdmin, adController.listAll);
router.post(
  '/units',
  requireAdsAdmin,
  [
    body('placementKey').trim().notEmpty(),
    body('adType').isIn(AD_TYPES),
    body('adUnitId').trim().notEmpty(),
    body('platform').optional().isIn(PLATFORMS),
    body('enabled').optional().isBoolean(),
    body('sortOrder').optional().isNumeric(),
  ],
  validate,
  adController.upsertUnit
);
router.delete('/units/:id', requireAdsAdmin, adController.deleteUnit);

module.exports = router;
