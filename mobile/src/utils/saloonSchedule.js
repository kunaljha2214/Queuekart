export function normalizePickupSlot(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setSeconds(0, 0);
  return d.getTime();
}

function isActiveQueueEntry(entry) {
  return entry && (entry.status === 'waiting' || entry.status === 'serving');
}

export function getTakenSaloonSlots(entries) {
  const taken = new Set();
  for (const e of entries || []) {
    if (!isActiveQueueEntry(e) || !e.pickupAt) continue;
    const key = normalizePickupSlot(e.pickupAt);
    if (key != null) taken.add(key);
  }
  return taken;
}

export function isSaloonSlotTaken(entries, pickupAt, excludeEntryId = null) {
  const slot = normalizePickupSlot(pickupAt);
  if (slot == null) return false;
  return (entries || []).some((e) => {
    if (!isActiveQueueEntry(e)) return false;
    if (excludeEntryId && String(e.id || e._id) === String(excludeEntryId)) return false;
    if (!e.pickupAt) return false;
    return normalizePickupSlot(e.pickupAt) === slot;
  });
}
