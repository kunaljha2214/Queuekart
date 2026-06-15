const mongoose = require('mongoose');

/** Holds a queue row while a customer completes Razorpay payment (prevents double-pay races). */
const skipReservationSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
    },
    targetPosition: { type: Number, required: true, min: 1 },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    razorpayOrderId: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

skipReservationSchema.index({ shop: 1, targetPosition: 1 }, { unique: true });
skipReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SkipReservation', skipReservationSchema);
