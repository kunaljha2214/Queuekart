const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
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
    phone: { type: String, trim: true, default: '', index: true },
    /** Primary role used after RoleSelection; both flows may exist for same account if you extend later */
    role: {
      type: String,
      enum: ['owner', 'customer'],
      default: 'customer',
    },
    otpLoginHash: { type: String, select: false, default: null },
    otpLoginExpiresAt: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
