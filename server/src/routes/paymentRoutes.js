const crypto = require('crypto');
const express = require('express');
const { Router } = require('express');
const { body } = require('express-validator');
const Razorpay = require('razorpay');
const Shop = require('../models/Shop');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { loadEnv } = require('../config/env');
const { validationResult } = require('express-validator');

const router = Router();
const env = loadEnv();

function verifyWebhook(req) {
  const sig = String(req.headers['x-razorpay-signature'] || '');
  if (!sig || !env.razorpayWebhookSecret) return false;
  const digest = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(req.body)
    .digest('hex');
  return digest === sig;
}

function requireRazorpayConfigured(res) {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    res.status(503).json({ message: 'Razorpay keys not configured on server' });
    return false;
  }
  return true;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

router.post(
  '/razorpay/order',
  auth(true),
  requireRole('owner'),
  [body('shopId').notEmpty().isMongoId()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      if (!requireRazorpayConfigured(res)) return;

      const { shopId } = req.body;
      const shop = await Shop.findOne({ _id: shopId, owner: req.user._id });
      if (!shop) return res.status(404).json({ message: 'Shop not found' });

      const rzp = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
      const amountPaise = 35000; // ₹350

      // Razorpay receipt must be <= 40 chars.
      const shortShop = String(shopId).slice(-8);
      const shortTs = String(Date.now()).slice(-8);
      const receipt = `sub_${shortShop}_${shortTs}`;

      const order = await rzp.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { shopId: String(shopId), ownerId: String(req.user._id), purpose: 'monthly_subscription' },
      });

      shop.subscription = shop.subscription || {};
      shop.subscription.pendingPaymentLinkId = order.id;
      shop.subscription.pendingPaymentLinkUrl = null;
      shop.subscription.lastPaymentStatus = 'pending';
      shop.subscription.monthlyCharge = 350;
      await shop.save();

      res.json({
        keyId: env.razorpayKeyId,
        amount: amountPaise,
        currency: 'INR',
        orderId: order.id,
        shopId: String(shop._id),
        shopName: shop.name,
      });
    } catch (e) {
      console.error('Razorpay order error:', e?.message || e);
      const status = e?.statusCode || 500;
      const msg = e?.error?.description || e?.error?.code || e?.message || 'Payment order failed';
      return       res.status(status).json({ message: msg });
    }
  }
);

/** Customer: ₹25 Razorpay order to skip ahead to 2nd place (only valid when queue is long; verified on join). */
router.post(
  '/razorpay/queue-priority-order',
  auth(true),
  [body('shopId').notEmpty().isMongoId()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      if (!requireRazorpayConfigured(res)) return;

      const cfg = loadEnv();
      const amountPaise =
        Number.isFinite(cfg.queuePriorityPricePaise) && cfg.queuePriorityPricePaise > 0
          ? cfg.queuePriorityPricePaise
          : 2500;
      const { shopId } = req.body;
      const shop = await Shop.findOne({ _id: shopId, isActive: true });
      if (!shop) {
        return res.status(404).json({ message: 'Shop not found or inactive' });
      }

      const rzp = new Razorpay({ key_id: cfg.razorpayKeyId, key_secret: cfg.razorpayKeySecret });
      const receipt = `qp_${String(shopId).slice(-8)}_${String(Date.now()).slice(-8)}`;
      const order = await rzp.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          purpose: 'queue_priority_second',
          shopId: String(shopId),
          userId: String(req.user._id),
        },
      });

      res.json({
        keyId: cfg.razorpayKeyId,
        amount: amountPaise,
        currency: 'INR',
        orderId: order.id,
        shopId: String(shop._id),
        shopName: shop.name,
      });
    } catch (e) {
      console.error('Queue priority Razorpay order error:', e?.message || e);
      const status = e?.statusCode || 500;
      const msg = e?.error?.description || e?.error?.code || e?.message || 'Payment order failed';
      return res.status(status).json({ message: msg });
    }
  }
);

router.post(
  '/razorpay/verify',
  auth(true),
  requireRole('owner'),
  [
    body('shopId').notEmpty().isMongoId(),
    body('razorpay_order_id').notEmpty().isString(),
    body('razorpay_payment_id').notEmpty().isString(),
    body('razorpay_signature').notEmpty().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      if (!requireRazorpayConfigured(res)) return;

      const { shopId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const shop = await Shop.findOne({ _id: shopId, owner: req.user._id });
      if (!shop) return res.status(404).json({ message: 'Shop not found' });

      const expected = crypto
        .createHmac('sha256', env.razorpayKeySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expected !== razorpay_signature) {
        shop.subscription = shop.subscription || {};
        shop.subscription.lastPaymentStatus = 'failed';
        shop.subscription.lastPaymentId = razorpay_payment_id || '';
        shop.subscription.pendingPaymentLinkId = null;
        shop.subscription.pendingPaymentLinkUrl = null;
        await shop.save().catch(() => {});
        return res.status(400).json({ message: 'Invalid payment signature' });
      }

      // Manual monthly payment: extend by 30 days from max(now, paidUntil).
      const now = new Date();
      const nextDue = shop?.subscription?.nextDueAt ? new Date(shop.subscription.nextDueAt) : null;
      const base = nextDue && nextDue > now ? nextDue : now;
      const newNextDueAt = addDays(base, 30);

      shop.subscription = shop.subscription || {};
      shop.subscription.isActive = true;
      shop.subscription.monthlyCharge = 350;
      shop.subscription.lastPaidAt = now;
      shop.subscription.nextDueAt = newNextDueAt;
      shop.subscription.lastPaymentId = razorpay_payment_id;
      shop.subscription.lastPaymentStatus = 'paid';
      shop.subscription.pendingPaymentLinkId = null;
      shop.subscription.pendingPaymentLinkUrl = null;

      // Keep legacy field updated for old UI/queries.
      shop.subscriptionPaidUntil = newNextDueAt;
      await shop.save();

      res.json({
        ok: true,
        subscription: shop.subscription,
      });
    } catch (e) {
      console.error('Razorpay verify error:', e?.message || e);
      next(e);
    }
  }
);

/**
 * Optional: Razorpay webhook (server-to-server).
 * Configure in Razorpay dashboard: URL = <SERVER>/api/payments/razorpay/webhook
 */
router.post(
  '/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      if (!env.razorpayWebhookSecret) {
        return res.status(500).json({ message: 'Webhook secret not configured' });
      }
      if (!verifyWebhook(req)) {
        return res.status(400).json({ message: 'Invalid webhook signature' });
      }

      const payload = JSON.parse(req.body.toString('utf8') || '{}');
      const event = String(payload?.event || '');
      const notes =
        payload?.payload?.payment?.entity?.notes ||
        payload?.payload?.order?.entity?.notes ||
        {};
      const shopId = notes?.shopId;

      // We only act on successful payment capture.
      if (event === 'payment.captured' && shopId) {
        const shop = await Shop.findById(shopId);
        if (shop) {
          const now = new Date();
          const nextDue = shop?.subscription?.nextDueAt ? new Date(shop.subscription.nextDueAt) : null;
          const base = nextDue && nextDue > now ? nextDue : now;
          const next = addDays(base, 30);
          shop.subscription = shop.subscription || {};
          shop.subscription.isActive = true;
          shop.subscription.monthlyCharge = 350;
          shop.subscription.lastPaidAt = now;
          shop.subscription.nextDueAt = next;
          shop.subscription.lastPaymentStatus = 'paid';
          shop.subscription.pendingPaymentLinkId = null;
          shop.subscription.pendingPaymentLinkUrl = null;
          shop.subscriptionPaidUntil = next;
          await shop.save();
        }
      }

      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  }
);

module.exports = router;

