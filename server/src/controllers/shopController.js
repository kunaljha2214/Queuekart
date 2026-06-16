const { validationResult } = require('express-validator');
const Shop = require('../models/Shop');
const Queue = require('../models/Queue');
const { isValidShopSubCategory } = require('../constants/shopSubCategories');
const { normalizeSaloonServices } = require('../constants/saloonServices');
const { maybeAutoOpenShop } = require('../utils/shopSchedule');

const ONE_DAY_MS = 1 * 24 * 60 * 60 * 1000;

/** Customer-visible shops: active + subscription/grace OK (includes temporarily closed). */
function customerListableShopMatch() {
  const graceSince = new Date(Date.now() - ONE_DAY_MS);
  return {
    isActive: true,
    $or: [
      { 'subscription.isActive': true },
      { 'subscription.nextDueAt': { $gt: graceSince } },
      { subscriptionPaidUntil: { $gt: graceSince } },
      { subscriptionPaidUntil: null, createdAt: { $gt: graceSince } },
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
    const { name, description, lng, lat, address, subCategory, saloonServices } = req.body;
    const resolvedSubCategory = isValidShopSubCategory(subCategory)
      ? subCategory
      : isValidShopSubCategory(req.user.shopSubCategory)
        ? req.user.shopSubCategory
        : null;

    if (!resolvedSubCategory) {
      return res.status(400).json({ message: 'Shop subcategory is required' });
    }

    const normalizedSaloonServices =
      resolvedSubCategory === 'saloon' ? normalizeSaloonServices(saloonServices) : [];

    if (resolvedSubCategory === 'saloon' && normalizedSaloonServices.length === 0) {
      return res.status(400).json({ message: 'At least one saloon service is required' });
    }

    const createdAt = new Date();
    const nextDueAt = new Date(createdAt);
    nextDueAt.setDate(nextDueAt.getDate() + 1); // 1-day grace for first payment
    const shop = await Shop.create({
      name,
      description,
      subCategory: resolvedSubCategory,
      saloonServices: normalizedSaloonServices,
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
    const subCategory = String(req.query.subCategory || '').trim();
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: 'lat and lng query params required' });
    }
    const shops = await Shop.find({
      ...customerListableShopMatch(),
      ...(isValidShopSubCategory(subCategory) ? { subCategory } : {}),
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
    const subCategory = String(req.query.subCategory || '').trim();
    const filter = { ...customerListableShopMatch() };
    if (q) {
      filter.name = { $regex: escapeRegex(q), $options: 'i' };
    }
    if (isValidShopSubCategory(subCategory)) {
      filter.subCategory = subCategory;
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
    let shop = await Shop.findById(req.params.id).populate('owner', 'name phone');
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    shop = await maybeAutoOpenShop(shop);
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
    const { name, description, lng, lat, address, isActive, isOpen, nextOpenAt, subCategory, saloonServices } =
      req.body;
    if (name != null) shop.name = name;
    if (description != null) shop.description = description;
    if (address != null) shop.address = address;
    if (typeof isActive === 'boolean') shop.isActive = isActive;
    if (typeof isOpen === 'boolean') {
      if (isOpen) {
        shop.isOpen = true;
        shop.nextOpenAt = null;
      } else {
        const parsed = nextOpenAt ? new Date(nextOpenAt) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ message: 'Next opening date and time is required when closing the shop' });
        }
        if (parsed.getTime() <= Date.now() + 5 * 60 * 1000) {
          return res.status(400).json({ message: 'Next opening must be at least 5 minutes from now' });
        }
        shop.isOpen = false;
        shop.nextOpenAt = parsed;
      }
    }
    if (isValidShopSubCategory(subCategory)) shop.subCategory = subCategory;
    if (saloonServices != null) {
      if (shop.subCategory !== 'saloon') {
        return res.status(400).json({ message: 'Services apply only to saloon shops' });
      }
      const normalized = normalizeSaloonServices(saloonServices);
      if (normalized.length === 0) {
        return res.status(400).json({ message: 'At least one saloon service is required' });
      }
      shop.saloonServices = normalized;
    }
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
