const { Router } = require('express');
const { body, query } = require('express-validator');
const shopController = require('../controllers/shopController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { SHOP_SUB_CATEGORIES } = require('../constants/shopSubCategories');

const router = Router();

router.get(
  '/nearby',
  [
    query('lat').notEmpty(),
    query('lng').notEmpty(),
    query('maxDistance').optional(),
    query('subCategory').optional().isIn(SHOP_SUB_CATEGORIES),
  ],
  shopController.nearby
);

router.get('/directory', auth(true), [
  query('q').optional().isString(),
  query('subCategory').optional().isIn(SHOP_SUB_CATEGORIES),
], shopController.listDirectory);

router.get('/:id', shopController.getById);

router.post(
  '/',
  auth(true),
  requireRole('owner'),
  [
    body('name').trim().notEmpty(),
    body('lng').isFloat(),
    body('lat').isFloat(),
    body('description').optional(),
    body('address').optional(),
    body('subCategory').optional().isIn(SHOP_SUB_CATEGORIES),
    body('saloonServices').optional().isArray(),
    body('saloonServices.*.name').optional().trim().notEmpty(),
    body('saloonServices.*.isCustom').optional().isBoolean(),
  ],
  shopController.create
);

router.get('/', auth(true), requireRole('owner'), shopController.listMine);

router.patch(
  '/:id',
  auth(true),
  requireRole('owner'),
  [
    body('name').optional().trim().notEmpty(),
    body('lng').optional().isFloat(),
    body('lat').optional().isFloat(),
    body('description').optional(),
    body('address').optional(),
    body('subCategory').optional().isIn(SHOP_SUB_CATEGORIES),
    body('isActive').optional().isBoolean(),
    body('isOpen').optional().isBoolean(),
    body('saloonServices').optional().isArray(),
    body('saloonServices.*.name').optional().trim().notEmpty(),
    body('saloonServices.*.isCustom').optional().isBoolean(),
  ],
  shopController.update
);

module.exports = router;
