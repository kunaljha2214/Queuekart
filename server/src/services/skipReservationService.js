const SkipReservation = require('../models/SkipReservation');

const RESERVE_MINUTES = 10;

async function purgeExpired(shopId) {
  await SkipReservation.deleteMany({
    shop: shopId,
    expiresAt: { $lte: new Date() },
  });
}

async function findReservation(shopId, targetPosition) {
  await purgeExpired(shopId);
  return SkipReservation.findOne({ shop: shopId, targetPosition }).lean();
}

async function listActiveReservations(shopId) {
  await purgeExpired(shopId);
  return SkipReservation.find({
    shop: shopId,
    expiresAt: { $gt: new Date() },
  }).lean();
}

function isReservedByOtherUser(reservations, targetPosition, userId) {
  const uid = String(userId);
  return reservations.some(
    (r) => r.targetPosition === targetPosition && String(r.userId) !== uid
  );
}

/**
 * Block another customer from starting payment for the same queue number.
 */
async function reserveSkipTarget({ shopId, targetPosition, userId, razorpayOrderId }) {
  await purgeExpired(shopId);

  const existing = await SkipReservation.findOne({ shop: shopId, targetPosition });
  const expiresAt = new Date(Date.now() + RESERVE_MINUTES * 60 * 1000);

  if (existing) {
    if (String(existing.userId) === String(userId)) {
      existing.expiresAt = expiresAt;
      existing.razorpayOrderId = razorpayOrderId || existing.razorpayOrderId;
      await existing.save();
      return { ok: true };
    }
    return {
      ok: false,
      status: 409,
      message: `Queue number ${targetPosition} is being paid for by another customer. Choose a different number.`,
    };
  }

  try {
    await SkipReservation.create({
      shop: shopId,
      targetPosition,
      userId,
      razorpayOrderId: razorpayOrderId || '',
      expiresAt,
    });
    return { ok: true };
  } catch (e) {
    if (e?.code === 11000) {
      return {
        ok: false,
        status: 409,
        message: `Queue number ${targetPosition} was just taken. Choose a different number.`,
      };
    }
    throw e;
  }
}

async function releaseSkipTarget({ shopId, targetPosition, userId }) {
  await SkipReservation.deleteOne({
    shop: shopId,
    targetPosition,
    userId,
  });
}

async function assertUserMayClaimSkipTarget({ shopId, targetPosition, userId }) {
  const doc = await findReservation(shopId, targetPosition);
  if (!doc) return { ok: true };
  if (String(doc.userId) === String(userId)) return { ok: true };
  return {
    ok: false,
    status: 409,
    message: `Queue number ${targetPosition} is reserved for another customer who is completing payment.`,
  };
}

module.exports = {
  listActiveReservations,
  isReservedByOtherUser,
  reserveSkipTarget,
  releaseSkipTarget,
  assertUserMayClaimSkipTarget,
};
