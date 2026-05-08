const Queue = require('../models/Queue');
const Shop = require('../models/Shop');

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
    const active = queue.entries.filter(
      (e) => e.status === 'waiting' || e.status === 'serving'
    );
    const maxPos = active.reduce((m, e) => Math.max(m, e.position), 0);
    const listText = String(req.body?.groceryList || '').trim();
    queue.entries.push({
      user: req.user._id,
      walkInName: '',
      position: maxPos + 1,
      status: 'waiting',
      groceryList: listText ? listText.slice(0, 2000) : '',
    });
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
    const newEntry = queue.entries[queue.entries.length - 1];
    const ordered = queue.entries
      .filter((e) => e.status === 'waiting' || e.status === 'serving')
      .sort((a, b) => a.position - b.position);
    const yourPosition =
      ordered.findIndex((e) => e._id.equals(newEntry._id)) + 1;
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
    const entry = queue.entries.id(req.params.entryId);
    if (
      !entry ||
      !entry.user ||
      entry.user.toString() !== req.user._id.toString()
    ) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    entry.status = 'cancelled';
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
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
    entry.status = 'cancelled';
    await queue.save();
    await normalizePositions(queue);
    await queue.save();
    await queue.populate('entries.user', 'name email phone');
    emitQueueUpdate(io, shop._id.toString(), queue);
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
  join,
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
