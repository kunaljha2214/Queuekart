const { Router } = require('express');
const { body } = require('express-validator');
const queueController = require('../controllers/queueController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = Router({ mergeParams: true });

router.get('/me', auth(true), queueController.getMyQueues);

router.get('/me/history', auth(true), queueController.getMyQueueHistory);

router.get('/:shopId/me', auth(true), queueController.getMyStatus);

router.post(
  '/:shopId/join',
  auth(true),
  [body('groceryList').optional().isString().isLength({ max: 2000 })],
  queueController.join
);

router.delete(
  '/:shopId/leave/:entryId',
  auth(true),
  queueController.leave
);

router.post(
  '/:shopId/owner/next',
  auth(true),
  requireRole('owner'),
  queueController.ownerNext
);

router.post(
  '/:shopId/owner/walk-in',
  auth(true),
  requireRole('owner'),
  [
    body('walkInName').trim().notEmpty(),
    body('estimatedMinutes').optional().isFloat({ min: 0 }),
  ],
  queueController.ownerAddWalkIn
);

router.post(
  '/:shopId/owner/complete/:entryId',
  auth(true),
  requireRole('owner'),
  queueController.ownerComplete
);

router.post(
  '/:shopId/owner/remove/:entryId',
  auth(true),
  requireRole('owner'),
  queueController.ownerRemoveEntry
);

router.get(
  '/:shopId/owner/history',
  auth(true),
  requireRole('owner'),
  queueController.ownerHistory
);

router.get('/:shopId', queueController.getQueue);

module.exports = router;
