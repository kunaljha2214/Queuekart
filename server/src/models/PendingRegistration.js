const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    role: {
      type: String,
      enum: ['owner', 'customer'],
      default: 'customer',
    },
    otpHash: { type: String, required: true, select: false },
    otpExpiresAt: { type: Date, required: true, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
