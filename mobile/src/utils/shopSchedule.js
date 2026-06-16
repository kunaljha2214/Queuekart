export function formatNextOpenAt(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export function isShopScheduledClosed(shop) {
  if (!shop || shop.isOpen !== false) return false;
  const next = shop.nextOpenAt ? new Date(shop.nextOpenAt) : null;
  if (next && !Number.isNaN(next.getTime()) && next.getTime() <= Date.now()) return false;
  return true;
}

export function getDefaultNextOpenAt() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function getMinVisitTime(shop, defaultLeadMs = 2 * 60 * 60 * 1000) {
  if (isShopScheduledClosed(shop) && shop.nextOpenAt) {
    const next = new Date(shop.nextOpenAt);
    if (!Number.isNaN(next.getTime())) return next;
  }
  return new Date(Date.now() + defaultLeadMs);
}
