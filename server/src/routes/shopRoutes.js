const { Router } = require('express');
const { body, query } = require('express-validator');
const shopController = require('../controllers/shopController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = Router();

router.get(
  '/nearby',
  [
    query('lat').notEmpty(),
    query('lng').notEmpty(),
    query('maxDistance').optional(),
  ],
  shopController.nearby
);

router.get('/directory', auth(true), shopController.listDirectory);

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
    body('isActive').optional().isBoolean(),
    body('isOpen').optional().isBoolean(),
  ],
  shopController.update
);

module.exports = router;
