/** Normalize visit time to minute precision for slot comparison. */
function normalizePickupSlot(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setSeconds(0, 0);
  return d.getTime();
}

function isActiveQueueEntry(entry) {
  return entry && (entry.status === 'waiting' || entry.status === 'serving');
}

/** True when another active entry already has this visit time. */
function isSaloonPickupSlotTaken(entries, pickupAt, excludeEntryId = null) {
  const slot = normalizePickupSlot(pickupAt);
  if (slot == null) return false;
  return (entries || []).some((e) => {
    if (!isActiveQueueEntry(e)) return false;
    if (excludeEntryId && String(e._id) === String(excludeEntryId)) return false;
    if (!e.pickupAt) return false;
    return normalizePickupSlot(e.pickupAt) === slot;
  });
}

module.exports = {
  normalizePickupSlot,
  isSaloonPickupSlotTaken,
};
