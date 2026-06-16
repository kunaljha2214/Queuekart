function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when shop is closed with a future reopening time. */
function isShopScheduledClosed(shop) {
  if (!shop || shop.isOpen !== false) return false;
  const nextOpenAt = parseDate(shop.nextOpenAt);
  if (!nextOpenAt) return true;
  return nextOpenAt.getTime() > Date.now();
}

/** True when the shop can serve customers / accept joins right now. */
function isShopCurrentlyOpen(shop) {
  if (!shop) return false;
  if (shop.isOpen !== false) return true;
  const nextOpenAt = parseDate(shop.nextOpenAt);
  if (nextOpenAt && nextOpenAt.getTime() <= Date.now()) return true;
  return false;
}

async function maybeAutoOpenShop(shop) {
  if (!shop || shop.isOpen !== false) return shop;
  const nextOpenAt = parseDate(shop.nextOpenAt);
  if (!nextOpenAt || nextOpenAt.getTime() > Date.now()) return shop;
  shop.isOpen = true;
  shop.nextOpenAt = null;
  await shop.save();
  return shop;
}

module.exports = {
  isShopScheduledClosed,
  isShopCurrentlyOpen,
  maybeAutoOpenShop,
  parseDate,
};
