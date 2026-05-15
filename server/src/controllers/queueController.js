const crypto = require('crypto');
const Razorpay = require('razorpay');
const Queue = require('../models/Queue');
const Shop = require('../models/Shop');
const UsedRazorpayPayment = require('../models/UsedRazorpayPayment');
const { loadEnv } = require('../config/env');
const { sendToUser } = require('../services/pushService');
const {
  getSkipPricePerRowPaise,
  getActiveOrdered,
  getEntryPosition,
  isTargetPositionLocked,
  computeSkipPricePaise,
  listSkipTargetOptions,
  reorderToTarget,
} = require('../utils/queueSkip');

function computeWaitMinutes({ orderedActiveEntries, yourIndex, perRealAheadMinutes }) {
  const ahead = orderedActiveEntries.slice(0, Math.max(0, yourIndex));
  const walkInMinutes = ahead.reduce((sum, e) => {
    const isWalkIn = !e.user;
    if (!isWalkIn) return sum;
    const m = Number.isFinite(e.estimatedMinutes) ? e.estimatedMinutes : 0;
    return sum + Math.max(0, m);
  }, 0);
  const realAhead = ahead.filter((e) => Boolean(e.user)).length;
  return walkInMinutes + realAhead * perRealAheadMinutes;
}

function entryCustomerLabel(entry) {
  const u = entry?.user;
  if (u && typeof u === 'object' && u.name) return String(u.name).trim();
  if (entry?.walkInName) return String(entry.walkInName).trim();
  return 'A customer';
}

/** Notify registered users at queue position 1 or 2 (once per entry). */
async function maybeNotifyTurnSoon({ shop, queue }) {
  const ordered = (queue.entries || [])
    .filter((e) => e.status === 'waiting' || e.status === 'serving')
    .sort((a, b) => a.position - b.position);

  const targets = ordered.filter(
    (e) => e.user && e.position <= 2 && !e.turnSoonNotifiedAt
  );
  if (!targets.length) return false;

  for (const target of targets) {
    target.turnSoonNotifiedAt = new Date();
    const pos = target.position;
    const body =
      pos <= 1
        ? `${shop.name} · You are next — please go to the shop`
        : `${shop.name} · Queue #${pos} — your turn is soon, please go to the shop`;
    await sendToUser(target.user._id || target.user, {
      notification: {
        title: 'Your turn is soon',
        body,
      },
      data: {
        type: 'turn_soon',
        shopId: String(shop._id),
        shopName: String(shop.name || ''),
        yourPosition: String(pos),
      },
    });
  }
  await queue.save();
  return true;
}

function emitQueueUpdate(io, shopId, queueDoc) {
  const payload = serializeQueue(queueDoc);
  io.to(`shop:${shopId}`).emit('queue:update', payload);
}

function serializeQueue(queue) {
  const entries = (queue.entries || [])
    .filter((e) => e.status !== 'done' && e.status !== 'cancelled')
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: e._id,
      user: e.user,
      walkInName: e.walkInName || '',
      estimatedMinutes: Number.isFinite(e.estimatedMinutes) ? e.estimatedMinutes : 0,
      groceryList: e.groceryList || '',
      pickupAt: e.pickupAt || null,
      joinKind:
        e.joinKind === 'priority_skip' || e.joinKind === 'priority_second'
          ? e.joinKind
          : 'standard',
      lockedSlot: Boolean(e.lockedSlot),
      skipRowsPaid: Number.isFinite(e.skipRowsPaid) ? e.skipRowsPaid : 0,
      position: e.position,
      status: e.status,
      joinedAt: e.joinedAt,
    }));
  return {
    shop: queue.shop,
    entries,
    totalWaiting: entries.filter((e) => e.status === 'waiting').length,
  };
}

async function getOrCreateQueue(shopId) {
  let queue = await Queue.findOne({ shop: shopId });
  if (!queue) {
    queue = await Queue.create({ shop: shopId, entries: [] });
  }
  return queue;
}

async function getQueue(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const queue = await getOrCreateQueue(shop._id);
    await queue.populate('entries.user', 'name email phone');
    res.json(serializeQueue(queue));
  } catch (e) {
    next(e);
  }
}

/** Authenticated: current user's place in line for a shop */
async function getMyStatus(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const queue = await getOrCreateQueue(shop._id);
    const entry = queue.entries.find(
      (e) =>
        e.user &&
        e.user.toString() === req.user._id.toString() &&
        e.status !== 'done' &&
        e.status !== 'cancelled'
    );
    if (!entry) {
      return res.json({ inQueue: false });
    }
    const ordered = queue.entries
      .filter((e) => e.status === 'waiting' || e.status === 'serving')
      .sort((a, b) => a.position - b.position);
    const yourPosition = ordered.findIndex((e) => e._id.equals(entry._id)) + 1;
    res.json({
      inQueue: true,
      yourEntryId: entry._id,
      yourPosition,
      status: entry.status,
      totalAhead: yourPosition > 0 ? yourPosition - 1 : 0,
    });
  } catch (e) {
    next(e);
  }
}

/** Authenticated: list shops where the user is currently waiting/serving */
async function getMyQueues(req, res, next) {
  try {
    const userId = req.user._id;
    const rows = await Queue.aggregate([
      { $unwind: '$entries' },
      {
        $match: {
          'entries.user': userId,
          'entries.status': { $in: ['waiting', 'serving'] },
        },
      },
      {
        $lookup: {
          from: 'shops',
          localField: 'shop',
          foreignField: '_id',
          as: 'shopDoc',
        },
      },
      { $unwind: { path: '$shopDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'shopDoc.owner',
          foreignField: '_id',
          as: 'ownerDoc',
        },
      },
      { $unwind: { path: '$ownerDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          shopId: '$shop',
          shopName: '$shopDoc.name',
          shopAddress: '$shopDoc.address',
          shopDescription: '$shopDoc.description',
          shopLocation: '$shopDoc.location',
          shopPhone: '$ownerDoc.phone',
          entryId: '$entries._id',
          status: '$entries.status',
          position: '$entries.position',
          joinedAt: '$entries.joinedAt',
          groceryList: '$entries.groceryList',
          pickupAt: '$entries.pickupAt',
        },
      },
      { $sort: { joinedAt: -1 } },
    ]);

    res.json({ queues: rows });
  } catch (e) {
    next(e);
  }
}

/** Authenticated: list shops where the user was previously in queue (done/cancelled) */
async function getMyQueueHistory(req, res, next) {
  try {
    const userId = req.user._id;
    const rows = await Queue.aggregate([
      { $unwind: '$entries' },
      {
        $match: {
          'entries.user': userId,
          'entries.status': { $in: ['done', 'cancelled'] },
        },
      },
      {
        $lookup: {
          from: 'shops',
          localField: 'shop',
          foreignField: '_id',
          as: 'shopDoc',
        },
      },
      { $unwind: { path: '$shopDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          shopId: '$shop',
          shopName: '$shopDoc.name',
          shopAddress: '$shopDoc.address',
          shopDescription: '$shopDoc.description',
          entryId: '$entries._id',
          status: '$entries.status',
          position: '$entries.position',
          joinedAt: '$entries.joinedAt',
          groceryList: '$entries.groceryList',
        },
      },
      { $sort: { joinedAt: -1 } },
      { $limit: 200 },
    ]);
    res.json({ queues: rows });
  } catch (e) {
    next(e);
  }
}

function parsePickupAt(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  // Customers can schedule pickup, but not too soon (avoid immediate/invalid scheduling).
  const min = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
  if (d.getTime() < min) return null;
  return d;
}

async function recordSkipPayment(req, shopId, paymentId) {
  if (!paymentId) return;
  try {
    await UsedRazorpayPayment.create({
      paymentId: String(paymentId).trim(),
      userId: req.user._id,
      shopId,
      purpose: 'queue_skip',
    });
  } catch (e) {
    if (e?.code !== 11000) {
      console.error('UsedRazorpayPayment create:', e?.message || e);
    }
  }
}

async function verifySkipQueuePayment(
  body,
  { shopId, userId, expectedAmountPaise, targetPosition, currentPosition }
) {
  const razorpay_order_id = String(body?.razorpay_order_id || '').trim();
  const razorpay_payment_id = String(body?.razorpay_payment_id || '').trim();
  const razorpay_signature = String(body?.razorpay_signature || '').trim();
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { ok: false, status: 400, message: 'Payment details required to skip rows' };
  }
  const env = loadEnv();
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    return { ok: false, status: 503, message: 'Payments not configured on server' };
  }
  const expectedSig = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (expectedSig !== razorpay_signature) {
    return { ok: false, status: 400, message: 'Invalid payment signature' };
  }
  const used = await UsedRazorpayPayment.findOne({ paymentId: razorpay_payment_id }).lean();
  if (used) {
    return { ok: false, status: 400, message: 'This payment was already used' };
  }
  try {
    const rzp = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
    const payment = await rzp.payments.fetch(razorpay_payment_id);
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount !== expectedAmountPaise) {
      return { ok: false, status: 400, message: 'Invalid payment amount' };
    }
    const st = String(payment.status || '').toLowerCase();
    if (st !== 'captured' && st !== 'authorized') {
      return { ok: false, status: 400, message: 'Payment not completed' };
    }
    const notes = payment.notes || {};
    const purpose = String(notes.purpose || '');
    if (purpose !== 'queue_skip' && purpose !== 'queue_priority_second') {
      return { ok: false, status: 400, message: 'Payment is not for queue skip' };
    }
    if (String(notes.shopId || '') !== String(shopId)) {
      return { ok: false, status: 400, message: 'Payment shop mismatch' };
    }
    if (String(notes.userId || '') !== String(userId)) {
      return { ok: false, status: 400, message: 'Payment account mismatch' };
    }
    if (Number(notes.targetPosition) !== Number(targetPosition)) {
      return { ok: false, status: 400, message: 'Payment target position mismatch' };
    }
    const rowsSkipped = Number(currentPosition) - Number(targetPosition);
    if (Number(notes.rowsSkipped) !== rowsSkipped) {
      return { ok: false, status: 400, message: 'Payment row count mismatch' };
    }
    return { ok: true };
  } catch (e) {
    console.error('skip payment fetch:', e?.message || e);
    return { ok: false, status: 400, message: 'Could not verify payment' };
  }
}

/** Available paid-skip targets (join preview or move while in queue). */
async function getSkipOptions(req, res, next) {
  try {
    const shop = await Shop.findById(req.params.shopId);
    if (!shop || !shop.isActive) {
      return res.status(404).json({ message: 'Shop not found or inactive' });
    }
    const queue = await getOrCreateQueue(shop._id);
    const ordered = getActiveOrdered(queue);
    const pricePerRowRupees = getSkipPricePerRowPaise() / 100;

    const entry = queue.entries.find(
      (e) =>
        e.user &&
        e.user.toString() === req.user._id.toString() &&
        (e.status === 'waiting' || e.status === 'serving')
    );

    if (!entry) {
      const projectedPosition = ordered.length + 1;
      const options = listSkipTargetOptions(ordered, projectedPosition, null);
      return res.json({
        inQueue: false,
        projectedPosition,
        pricePerRowRupees,
        options,
      });
    }

    const currentPosition = getEntryPosition(ordered, entry._id);
    const options = listSkipTargetOptions(ordered, currentPosition, entry._id);
    return res.json({
      inQueue: true,
      currentPosition,
      lockedSlot: Boolean(entry.lockedSlot),
      pricePerRowRupees,
      options,
    });
  } catch (e) {
    next(e);
  }
}

/** Move up in queue after payment (existing entry). */
async function skipPosition(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findById(req.params.shopId);
    if (!shop || !shop.isActive) {
      return res.status(404).json({ message: 'Shop not found or inactive' });
    }
    const targetPosition = parseInt(req.body.targetPosition, 10);
    if (!Number.isFinite(targetPosition) || targetPosition < 1) {
      return res.status(400).json({ message: 'targetPosition is required' });
    }

    const queue = await getOrCreateQueue(shop._id);
    const entry = queue.entries.find(
      (e) =>
        e.user &&
        e.user.toString() === req.user._id.toString() &&
        (e.status === 'waiting' || e.status === 'serving')
    );
    if (!entry) {
      return res.status(404).json({ message: 'You are not in this queue' });
    }
    if (entry.status !== 'waiting') {
      return res.status(400).json({ message: 'Only waiting customers can skip ahead' });
    }

    const ordered = getActiveOrdered(queue);
    const currentPosition = getEntryPosition(ordered, entry._id);
    if (targetPosition >= currentPosition) {
      return res.status(400).json({ message: 'Choose a queue number lower than your current one' });
    }
    if (isTargetPositionLocked(ordered, targetPosition, entry._id)) {
      return res.status(409).json({
        message: `Queue number ${targetPosition} is reserved by another customer who paid to skip`,
      });
    }

    const expectedAmountPaise = computeSkipPricePaise(currentPosition, targetPosition);
    const v = await verifySkipQueuePayment(req.body, {
      shopId: shop._id,
      userId: req.user._id,
      expectedAmountPaise,
      targetPosition,
      currentPosition,
    });
    if (!v.ok) {
      return res.status(v.status || 400).json({ message: v.message });
    }

    reorderToTarget(queue, entry._id, targetPosition);
    entry.lockedSlot = true;
    entry.skipRowsPaid = (Number(entry.skipRowsPaid) || 0) + (currentPosition - targetPosition);
    entry.joinKind = 'priority_skip';
    await queue.save();

    await recordSkipPayment(req, shop._id, req.body?.razorpay_payment_id);

    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    await maybeNotifyTurnSoon({ shop, queue });

    const orderedAfter = getActiveOrdered(queue);
    const yourPosition = getEntryPosition(orderedAfter, entry._id);

    res.json({
      ok: true,
      yourPosition,
      yourEntryId: entry._id,
      queue: serializeQueue(queue),
    });
  } catch (e) {
    next(e);
  }
}

async function join(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findById(req.params.shopId);
    if (!shop || !shop.isActive) {
      return res.status(404).json({ message: 'Shop not found or inactive' });
    }
    if (shop.isOpen === false) {
      return res.status(403).json({ message: 'This shop is closed and not accepting new queue joins' });
    }
    let queue = await getOrCreateQueue(shop._id);
    const existing = queue.entries.find(
      (e) =>
        e.user &&
        e.user.toString() === req.user._id.toString() &&
        e.status !== 'done' &&
        e.status !== 'cancelled'
    );
    if (existing) {
      const listText = String(req.body?.groceryList || '').trim();
      const nextText = listText ? listText.slice(0, 2000) : '';
      const prevText = String(existing.groceryList || '').trim();
      const changed = Boolean(nextText) && nextText !== prevText;
      if (changed) {
        existing.groceryList = nextText;
        await queue.save();
      }
      await queue.populate('entries.user', 'name email phone');
      if (changed) {
        emitQueueUpdate(io, shop._id.toString(), queue);
      }
      const payload = serializeQueue(queue);
      const position = queue.entries
        .filter((e) => e.status === 'waiting' || e.status === 'serving')
        .sort((a, b) => a.position - b.position)
        .findIndex((e) => e._id.equals(existing._id));
      return res.json({
        ...payload,
        yourEntryId: existing._id,
        yourPosition: position >= 0 ? position + 1 : existing.position,
      });
    }
    const env = loadEnv();
    const joinKindReq = String(req.body?.joinKind || 'standard').toLowerCase();
    const wantSkip =
      joinKindReq === 'priority_skip' ||
      joinKindReq === 'priority_second' ||
      joinKindReq === 'priority' ||
      joinKindReq === 'priority_pay';

    let targetPosition = parseInt(req.body.targetPosition, 10);
    if (wantSkip && !Number.isFinite(targetPosition)) {
      if (joinKindReq === 'priority_second') {
        targetPosition = 2;
      } else {
        return res.status(400).json({ message: 'targetPosition is required for paid skip' });
      }
    }

    const pickupParsed = parsePickupAt(req.body?.pickupAt);
    const pickupAt = pickupParsed || undefined;

    const orderedBefore = getActiveOrdered(queue);
    const projectedPosition = orderedBefore.length + 1;

    if (wantSkip) {
      if (targetPosition >= projectedPosition) {
        return res.status(400).json({
          message: 'Target queue number must be ahead of joining at the end of the line',
        });
      }
      if (isTargetPositionLocked(orderedBefore, targetPosition, null)) {
        return res.status(409).json({
          message: `Queue number ${targetPosition} is reserved by another customer who paid to skip`,
        });
      }
      const expectedAmountPaise = computeSkipPricePaise(projectedPosition, targetPosition);
      const v = await verifySkipQueuePayment(req.body, {
        shopId: shop._id,
        userId: req.user._id,
        expectedAmountPaise,
        targetPosition,
        currentPosition: projectedPosition,
      });
      if (!v.ok) {
        return res.status(v.status || 400).json({ message: v.message });
      }
    }

    const activeAll = queue.entries.filter(
      (e) => e.status === 'waiting' || e.status === 'serving'
    );
    const maxPos = activeAll.reduce((m, e) => Math.max(m, e.position), 0);
    const listText = String(req.body?.groceryList || '').trim();
    const rowsSkipped = wantSkip ? projectedPosition - targetPosition : 0;
    queue.entries.push({
      user: req.user._id,
      walkInName: '',
      position: maxPos + 1,
      status: 'waiting',
      groceryList: listText ? listText.slice(0, 2000) : '',
      pickupAt,
      joinKind: wantSkip ? 'priority_skip' : 'standard',
      lockedSlot: wantSkip,
      skipRowsPaid: wantSkip ? rowsSkipped : 0,
    });
    await queue.save();
    const newEntry = queue.entries[queue.entries.length - 1];

    if (wantSkip) {
      reorderToTarget(queue, newEntry._id, targetPosition);
    } else {
      await normalizePositions(queue);
    }
    await queue.save();

    if (wantSkip) {
      await recordSkipPayment(req, shop._id, req.body?.razorpay_payment_id);
    }

    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    const ordered = queue.entries
      .filter((e) => e.status === 'waiting' || e.status === 'serving')
      .sort((a, b) => a.position - b.position);
    const yourPosition =
      ordered.findIndex((e) => e._id.equals(newEntry._id)) + 1;

    const perRealAheadMinutes = Number.isFinite(env.fcmDefaultRealCustomerMinutes)
      ? env.fcmDefaultRealCustomerMinutes
      : 20;
    const waitMinutes = computeWaitMinutes({
      orderedActiveEntries: ordered,
      yourIndex: Math.max(0, yourPosition - 1),
      perRealAheadMinutes,
    });

    await sendToUser(req.user._id, {
      notification: {
        title: 'Queue joined',
        body: `${shop.name} · Your number: ${yourPosition} · Est wait: ${waitMinutes} min`,
      },
      data: {
        type: 'queue_joined',
        shopId: String(shop._id),
        shopName: String(shop.name || ''),
        yourPosition: String(yourPosition),
        waitMinutes: String(waitMinutes),
      },
    });

    if (shop.owner) {
      await sendToUser(shop.owner, {
        notification: {
          title: 'New customer joined',
          body: `${shop.name} · Queue number: ${yourPosition}`,
        },
        data: {
          type: 'owner_customer_joined',
          shopId: String(shop._id),
          shopName: String(shop.name || ''),
          position: String(yourPosition),
        },
      });
    }
    await maybeNotifyTurnSoon({ shop, queue });
    res.status(201).json({
      ...serializeQueue(queue),
      yourEntryId: newEntry._id,
      yourPosition,
    });
  } catch (e) {
    next(e);
  }
}

async function leave(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findById(req.params.shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const queue = await Queue.findOne({ shop: shop._id });
    if (!queue) {
      return res.json({ ok: true });
    }
    await queue.populate('entries.user', 'name email phone');
    const entry = queue.entries.id(req.params.entryId);
    const entryUserId = entry?.user?._id || entry?.user;
    if (!entry || !entryUserId || entryUserId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    const customerName = entryCustomerLabel(entry);
    entry.status = 'cancelled';
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    await maybeNotifyTurnSoon({ shop, queue });
    if (shop.owner) {
      await sendToUser(shop.owner, {
        notification: {
          title: 'Customer left queue',
          body: `${customerName} left ${shop.name}`,
        },
        data: {
          type: 'owner_customer_left',
          shopId: String(shop._id),
          shopName: String(shop.name || ''),
        },
      });
    }
    res.json({ ok: true, queue: serializeQueue(queue) });
  } catch (e) {
    next(e);
  }
}

async function ownerAddWalkIn(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const walkInName = String(req.body.walkInName || '').trim();
    if (!walkInName) {
      return res.status(400).json({ message: 'walkInName is required' });
    }
    const rawEstimate = req.body.estimatedMinutes;
    const estimatedMinutes =
      rawEstimate === undefined || rawEstimate === null || rawEstimate === ''
        ? 0
        : Number(rawEstimate);
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 0) {
      return res
        .status(400)
        .json({ message: 'estimatedMinutes must be a non-negative number' });
    }
    const queue = await getOrCreateQueue(shop._id);
    const active = queue.entries.filter(
      (e) => e.status === 'waiting' || e.status === 'serving'
    );
    const maxPos = active.reduce((m, e) => Math.max(m, e.position), 0);
    queue.entries.push({
      user: null,
      walkInName,
      estimatedMinutes,
      position: maxPos + 1,
      status: 'waiting',
    });
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    await maybeNotifyTurnSoon({ shop, queue });
    return res.status(201).json(serializeQueue(queue));
  } catch (e) {
    next(e);
  }
}

async function ownerHistory(req, res, next) {
  try {
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const queue = await getOrCreateQueue(shop._id);
    await queue.populate('entries.user', 'name email phone');

    const filter = String(req.query.status || 'all').toLowerCase();
    let allowedStatuses = ['done', 'cancelled'];
    if (filter === 'completed') allowedStatuses = ['done'];
    if (filter === 'rejected') allowedStatuses = ['cancelled'];

    const entries = (queue.entries || [])
      .filter((entry) => allowedStatuses.includes(entry.status))
      .sort(
        (a, b) =>
          new Date(b.joinedAt || b.createdAt || 0) -
          new Date(a.joinedAt || a.createdAt || 0)
      )
      .map((entry) => ({
        id: entry._id,
        user: entry.user,
        walkInName: entry.walkInName || '',
        estimatedMinutes: Number.isFinite(entry.estimatedMinutes)
          ? entry.estimatedMinutes
          : 0,
        position: entry.position,
        status: entry.status,
        joinedAt: entry.joinedAt,
      }));

    return res.json({
      shop: queue.shop,
      filter,
      entries,
    });
  } catch (e) {
    next(e);
  }
}

async function normalizePositions(queue) {
  const active = queue.entries
    .filter((e) => e.status === 'waiting' || e.status === 'serving')
    .sort((a, b) => a.position - b.position);
  active.forEach((e, i) => {
    e.position = i + 1;
  });
}

async function ownerNext(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const queue = await getOrCreateQueue(shop._id);
    const serving = queue.entries.find((e) => e.status === 'serving');
    if (serving) {
      serving.status = 'done';
    }
    const waiting = queue.entries
      .filter((e) => e.status === 'waiting')
      .sort((a, b) => a.position - b.position);
    if (waiting[0]) {
      waiting[0].status = 'serving';
    }
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    await maybeNotifyTurnSoon({ shop, queue });
    res.json(serializeQueue(queue));
  } catch (e) {
    next(e);
  }
}

async function ownerComplete(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const queue = await getOrCreateQueue(shop._id);
    const entry = queue.entries.id(req.params.entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    entry.status = 'done';
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    await maybeNotifyTurnSoon({ shop, queue });
    res.json(serializeQueue(queue));
  } catch (e) {
    next(e);
  }
}

async function ownerRemoveEntry(req, res, next) {
  try {
    const io = req.app.get('io');
    const shop = await Shop.findOne({
      _id: req.params.shopId,
      owner: req.user._id,
    });
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }
    const queue = await getOrCreateQueue(shop._id);
    const entry = queue.entries.id(req.params.entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    if (entry.status !== 'waiting' && entry.status !== 'serving') {
      return res.status(400).json({ message: 'Only waiting/serving entries can be removed' });
    }
    const removedUserId = entry.user ? entry.user.toString() : null;
    entry.status = 'cancelled';
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    await maybeNotifyTurnSoon({ shop, queue });
    if (removedUserId) {
      await sendToUser(removedUserId, {
        notification: {
          title: 'Removed from queue',
          body: `${shop.name} removed you from the queue`,
        },
        data: {
          type: 'queue_removed_by_owner',
          shopId: String(shop._id),
          shopName: String(shop.name || ''),
        },
      });
    }
    res.json(serializeQueue(queue));
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getQueue,
  getMyStatus,
  getMyQueues,
  getMyQueueHistory,
  getSkipOptions,
  join,
  skipPosition,
  leave,
  ownerNext,
  ownerAddWalkIn,
  ownerHistory,
  ownerComplete,
  ownerRemoveEntry,
  serializeQueue,
  emitQueueUpdate,
  getOrCreateQueue,
};
