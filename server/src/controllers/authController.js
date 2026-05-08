const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const { signToken } = require('../utils/token');
const { sendOtpEmail } = require('../services/emailService');

function authPayload(user) {
  const token = signToken(user._id, user.role);
  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone || '',
    },
  };
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function register(req, res, next) {
  try {
    return res.status(400).json({
      message:
        'Direct registration is disabled. First call /api/auth/register/request-otp, then /api/auth/register/verify-otp.',
    });
  } catch (e) {
    next(e);
  }
}

async function requestRegisterOtp(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = req.body.email.toLowerCase();
    const password = req.body.password;
    const name = req.body.name.trim();
    const role = req.body.role === 'owner' ? 'owner' : 'customer';
    const phone = String(req.body.phone || '').trim();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({ message: 'Phone already registered' });
      }
    }

    const otp = generateOtpCode();
    const [passwordHash, otpHash] = await Promise.all([
      bcrypt.hash(password, 10),
      bcrypt.hash(otp, 10),
    ]);

    await PendingRegistration.findOneAndUpdate(
      { email },
      {
        email,
        passwordHash,
        name,
        phone,
        role,
        otpHash,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await sendOtpEmail({
        toEmail: email,
        toName: name,
        otp,
        expiryMinutes: 5,
      });
    } catch (mailError) {
      console.error('Failed to send registration OTP email:', mailError.message);
      await PendingRegistration.deleteOne({ email });
      return res.status(502).json({
        message: 'Failed to send OTP email. Please try again shortly.',
      });
    }

    return res.json({ message: 'OTP sent to your email' });
  } catch (e) {
    next(e);
  }
}

async function verifyRegisterOtp(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = req.body.email.toLowerCase();
    const otp = req.body.otp.trim();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const pending = await PendingRegistration.findOne({ email }).select(
      '+passwordHash +otpHash +otpExpiresAt'
    );

    if (!pending || !pending.otpHash || !pending.otpExpiresAt) {
      return res.status(401).json({ message: 'Wrong OTP' });
    }

    if (pending.otpExpiresAt.getTime() < Date.now()) {
      await PendingRegistration.deleteOne({ email });
      return res.status(401).json({ message: 'OTP expired' });
    }

    const isValid = await bcrypt.compare(otp, pending.otpHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Wrong OTP' });
    }

    const user = await User.create({
      email: pending.email,
      passwordHash: pending.passwordHash,
      name: pending.name,
      phone: String(pending.phone || '').trim(),
      role: pending.role,
    });

    await PendingRegistration.deleteOne({ email });

    return res.status(201).json(authPayload(user));
  } catch (e) {
    next(e);
  }
}

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+passwordHash'
    );
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    res.json(authPayload(user));
  } catch (e) {
    next(e);
  }
}

async function requestLoginOtp(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ email }).select('+otpLoginHash +otpLoginExpiresAt');
    if (!user) {
      return res.status(404).json({ message: 'No account found for this email' });
    }

    const otp = generateOtpCode();
    user.otpLoginHash = await bcrypt.hash(otp, 10);
    user.otpLoginExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    try {
      await sendOtpEmail({
        toEmail: user.email,
        toName: user.name,
        otp,
        expiryMinutes: 5,
      });
    } catch (mailError) {
      console.error('Failed to send OTP email:', mailError.message);
      user.otpLoginHash = null;
      user.otpLoginExpiresAt = null;
      await user.save();
      return res.status(502).json({
        message: 'Failed to send OTP email. Please try again shortly.',
      });
    }

    res.json({ message: 'OTP sent to your email' });
  } catch (e) {
    next(e);
  }
}

async function verifyLoginOtp(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const email = req.body.email.toLowerCase();
    const otp = req.body.otp.trim();

    const user = await User.findOne({ email }).select('+otpLoginHash +otpLoginExpiresAt');
    if (!user || !user.otpLoginHash || !user.otpLoginExpiresAt) {
      return res.status(401).json({ message: 'Wrong OTP' });
    }
    if (user.otpLoginExpiresAt.getTime() < Date.now()) {
      return res.status(401).json({ message: 'OTP expired' });
    }
    const isValid = await bcrypt.compare(otp, user.otpLoginHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Wrong OTP' });
    }

    user.otpLoginHash = null;
    user.otpLoginExpiresAt = null;
    await user.save();

    res.json(authPayload(user));
  } catch (e) {
    next(e);
  }
}

async function me(req, res, next) {
  try {
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        phone: req.user.phone || '',
      },
    });
  } catch (e) {
    next(e);
  }
}

async function setRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!['owner', 'customer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    req.user.role = role;
    await req.user.save();
    const token = signToken(req.user._id, req.user.role);
    res.json({
      token,
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
      },
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  register,
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestLoginOtp,
  verifyLoginOtp,
  me,
  setRole,
};
