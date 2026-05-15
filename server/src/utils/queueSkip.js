const { loadEnv } = require('../config/env');

function getSkipPricePerRowPaise() {
  const env = loadEnv();
  const v = Number(env.queueSkipPricePaise);
  return Number.isFinite(v) && v > 0 ? v : 600;
}

function getActiveOrdered(queue) {
  return (queue.entries || [])
    .filter((e) => e.status === 'waiting' || e.status === 'serving')
    .sort((a, b) => a.position - b.position);
}

function getEntryPosition(ordered, entryId) {
  const idx = ordered.findIndex((e) => e._id.equals(entryId));
  return idx >= 0 ? idx + 1 : null;
}

/** True if another user's paid-skip entry occupies this 1-based queue row. */
function isTargetPositionLocked(ordered, targetPosition, exceptEntryId = null) {
  if (!Number.isFinite(targetPosition) || targetPosition < 1) return true;
  const occupant = ordered[targetPosition - 1];
  if (!occupant) return false;
  if (exceptEntryId && occupant._id.equals(exceptEntryId)) return false;
  return Boolean(occupant.lockedSlot);
}

function computeSkipPricePaise(currentPosition, targetPosition) {
  const rows = Number(currentPosition) - Number(targetPosition);
  if (!Number.isFinite(rows) || rows <= 0) return 0;
  return rows * getSkipPricePerRowPaise();
}

function listSkipTargetOptions(ordered, currentPosition, exceptEntryId = null) {
  const pricePerRow = getSkipPricePerRowPaise();
  const options = [];
  for (let t = 1; t < currentPosition; t += 1) {
    if (isTargetPositionLocked(ordered, t, exceptEntryId)) continue;
    const rowsSkipped = currentPosition - t;
    options.push({
      targetPosition: t,
      rowsSkipped,
      amountPaise: rowsSkipped * pricePerRow,
      amountRupees: (rowsSkipped * pricePerRow) / 100,
    });
  }
  return options;
}

function reorderToTarget(queue, entryId, targetPosition) {
  const active = getActiveOrdered(queue);
  const entry = queue.entries.id(entryId);
  if (!entry) return;
  const others = active.filter((e) => !e._id.equals(entry._id));
  const idx = Math.max(0, Math.min(targetPosition - 1, others.length));
  const ordered = [...others.slice(0, idx), entry, ...others.slice(idx)];
  ordered.forEach((e, i) => {
    e.position = i + 1;
  });
}

module.exports = {
  getSkipPricePerRowPaise,
  getActiveOrdered,
  getEntryPosition,
  isTargetPositionLocked,
  computeSkipPricePaise,
  listSkipTargetOptions,
  reorderToTarget,
};
