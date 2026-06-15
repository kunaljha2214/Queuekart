const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { SHOP_SUB_CATEGORIES } = require('../constants/shopSubCategories');

const router = Router();

router.post(
  '/register/request-otp',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    body('phone')
      .optional({ checkFalsy: true })
      .isString()
      .trim()
      .matches(/^[0-9+\-\s()]{7,20}$/)
      .withMessage('Invalid phone number'),
    body('role').optional().isIn(['owner', 'customer']),
    body('shopSubCategory')
      .optional({ values: 'null' })
      .isIn(SHOP_SUB_CATEGORIES)
      .withMessage('Invalid shop subcategory'),
  ],
  authController.requestRegisterOtp
);

router.post(
  '/register/verify-otp',
  [
    body('email').isEmail().normalizeEmail(),
    body('otp').isLength({ min: 4, max: 8 }).isNumeric(),
  ],
  authController.verifyRegisterOtp
);

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().notEmpty(),
    body('role').optional().isIn(['owner', 'customer']),
  ],
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  authController.login
);

router.post(
  '/forgot-password/request-otp',
  [body('email').isEmail().normalizeEmail()],
  authController.requestLoginOtp
);

router.post(
  '/forgot-password/verify-otp',
  [body('email').isEmail().normalizeEmail(), body('otp').isLength({ min: 4, max: 8 }).isNumeric()],
  authController.verifyLoginOtp
);

router.get('/me', auth(true), authController.me);

router.patch(
  '/role',
  auth(true),
  [body('role').isIn(['owner', 'customer'])],
  authController.setRole
);

module.exports = router;
