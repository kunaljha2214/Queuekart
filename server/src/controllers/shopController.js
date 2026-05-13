const { validationResult } = require('express-validator');
const Shop = require('../models/Shop');
const Queue = require('../models/Queue');

const ONE_DAY_MS = 1 * 24 * 60 * 60 * 1000;

/** Same visibility rules as nearby: active, open, subscription/grace OK. */
function customerListableShopMatch() {
  const graceSince = new Date(Date.now() - ONE_DAY_MS);
  return {
    isActive: true,
    $and: [
      { $or: [{ isOpen: true }, { isOpen: { $exists: false } }] },
      {
        $or: [
          { 'subscription.isActive': true },
          { 'subscription.nextDueAt': { $gt: graceSince } },
          { subscriptionPaidUntil: { $gt: graceSince } },
          { subscriptionPaidUntil: null, createdAt: { $gt: graceSince } },
        ],
      },
    ],
  };
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function enrichShopsWithQueueCount(shops) {
  if (!shops.length) {
    return [];
  }
  const shopIds = shops.map((s) => s._id);
  const queues = await Queue.find({ shop: { $in: shopIds } })
    .select('shop entries.status')
    .lean();

  const queueCountByShop = new Map();
  for (const q of queues) {
    const entries = Array.isArray(q.entries) ? q.entries : [];
    const active = entries.filter((e) => e.status === 'waiting' || e.status === 'serving').length;
    queueCountByShop.set(String(q.shop), active);
  }

  return shops.map((s) => ({
    ...s,
    queueCount: queueCountByShop.get(String(s._id)) ?? 0,
  }));
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name, description, lng, lat, address } = req.body;
    const createdAt = new Date();
    const nextDueAt = new Date(createdAt);
    nextDueAt.setDate(nextDueAt.getDate() + 1); // 1-day grace for first payment
    const shop = await Shop.create({
      name,
      description,
      owner: req.user._id,
      address: address || '',
      isOpen: true,
      location: {
        type: 'Point',
        coordinates: [Number(lng), Number(lat)],
      },
      subscription: {
        isActive: false,
        monthlyCharge: 350,
        lastPaidAt: null,
        nextDueAt,
        lastPaymentId: '',
        lastPaymentStatus: 'unpaid',
        pendingPaymentLinkId: null,
        pendingPaymentLinkUrl: null,
      },
    });
    await Queue.create({ shop: shop._id, entries: [] });
    res.status(201).json({ shop });
  } catch (e) {
    next(e);
  }
}

async function listMine(req, res, next) {
  try {
    const shops = await Shop.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ shops });
  } catch (e) {
    next(e);
  }
}

async function nearby(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const maxDistance = parseInt(req.query.maxDistance || '5000', 10);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: 'lat and lng query params required' });
    }
    const shops = await Shop.find({
      ...customerListableShopMatch(),
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: maxDistance,
        },
      },
    })
      .populate('owner', 'name email phone')
      .limit(50)
      .lean();

    const enriched = await enrichShopsWithQueueCount(shops);
    res.json({ shops: enriched });
  } catch (e) {
    next(e);
  }
}

/** Authenticated: all customer-visible shops (no geo). Optional ?q= name substring. */
async function listDirectory(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const filter = { ...customerListableShopMatch() };
    if (q) {
      filter.name = { $regex: escapeRegex(q), $options: 'i' };
    }
    const shops = await Shop.find(filter)
      .populate('owner', 'name email phone')
      .sort({ name: 1 })
      .limit(200)
      .lean();
    const enriched = await enrichShopsWithQueueCount(shops);
    res.json({ shops: enriched });
  } catch (e) {
    next(e);
  }
}

async function getById(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.id).populate('owner', 'name phone');
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    res.json({ shop });
  } catch (e) {
    next(e);
  }
}

async function update(req, res, next) {
  try {
    const shop = await Shop.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const { name, description, lng, lat, address, isActive, isOpen } = req.body;
    if (name != null) shop.name = name;
    if (description != null) shop.description = description;
    if (address != null) shop.address = address;
    if (typeof isActive === 'boolean') shop.isActive = isActive;
    if (typeof isOpen === 'boolean') shop.isOpen = isOpen;
    if (lng != null && lat != null) {
      shop.location = {
        type: 'Point',
        coordinates: [Number(lng), Number(lat)],
      };
    }
    await shop.save();
    res.json({ shop });
  } catch (e) {
    next(e);
  }
}

module.exports = { create, listMine, nearby, listDirectory, getById, update };
