const mongoose = require('mongoose');

/**
 * Prevents replaying the same Razorpay payment_id for priority queue joins.
 */
const schema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, index: true },
    purpose: { type: String, default: 'queue_priority_second' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UsedRazorpayPayment', schema);
