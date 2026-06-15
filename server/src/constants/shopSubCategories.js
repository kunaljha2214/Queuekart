const SHOP_SUB_CATEGORIES = ['grocery', 'saloon'];

const SHOP_SUB_CATEGORY_LABELS = {
  grocery: 'Grocery',
  saloon: 'Saloon',
};

function isValidShopSubCategory(value) {
  return SHOP_SUB_CATEGORIES.includes(value);
}

module.exports = {
  SHOP_SUB_CATEGORIES,
  SHOP_SUB_CATEGORY_LABELS,
  isValidShopSubCategory,
};
