const { Router } = require('express');
const { body } = require('express-validator');
const orderItemController = require('../controllers/orderItemController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = Router({ mergeParams: true });

router.get('/public', orderItemController.listPublic);

router.get(
  '/',
  auth(true),
  requireRole('owner'),
  orderItemController.list
);

router.post(
  '/',
  auth(true),
  requireRole('owner'),
  [
    body('name').trim().notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('description').optional(),
    body('sortOrder').optional().isInt(),
    body('isAvailable').optional().isBoolean(),
  ],
  orderItemController.create
);

router.patch(
  '/:itemId',
  auth(true),
  requireRole('owner'),
  orderItemController.update
);

router.delete(
  '/:itemId',
  auth(true),
  requireRole('owner'),
  orderItemController.remove
);

module.exports = router;
