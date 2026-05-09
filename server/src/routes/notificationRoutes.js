const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const User = require('../models/User');

const router = Router();

router.post(
  '/token',
  auth(true),
  [
    body('token').isString().trim().notEmpty(),
    body('platform').optional().isIn(['android', 'ios', 'web']),
    body('deviceId').optional().isString().trim(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const token = String(req.body.token).trim();
      const platform = req.body.platform ? String(req.body.platform) : 'android';
      const deviceId = req.body.deviceId ? String(req.body.deviceId).trim() : '';

      const user = await User.findById(req.user._id);
      if (!user) return res.status(401).json({ message: 'User not found' });

      user.fcmTokens = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
      const existingIdx = user.fcmTokens.findIndex((t) => t.token === token);
      const row = { token, platform, deviceId, updatedAt: new Date() };
      if (existingIdx >= 0) user.fcmTokens[existingIdx] = { ...user.fcmTokens[existingIdx].toObject?.(), ...row };
      else user.fcmTokens.push(row);

      // Avoid unbounded growth
      if (user.fcmTokens.length > 20) {
        user.fcmTokens.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        user.fcmTokens = user.fcmTokens.slice(0, 20);
      }

      await user.save();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  '/token',
  auth(true),
  [body('token').optional().isString().trim()],
  async (req, res, next) => {
    try {
      const token = req.body?.token ? String(req.body.token).trim() : '';
      const user = await User.findById(req.user._id);
      if (!user) return res.status(401).json({ message: 'User not found' });
      if (!Array.isArray(user.fcmTokens) || user.fcmTokens.length === 0) return res.json({ ok: true });

      if (token) {
        user.fcmTokens = user.fcmTokens.filter((t) => t.token !== token);
      } else {
        user.fcmTokens = [];
      }

      await user.save();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;

