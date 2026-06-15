const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    subCategory: {
      type: String,
      enum: ['grocery', 'saloon'],
      default: null,
    },
    /** Saloon shops only: services offered (preset + custom). */
    saloonServices: [
      {
        name: { type: String, required: true, trim: true },
        isCustom: { type: Boolean, default: false },
      },
    ],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    address: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    /** Open = visible to customers (when subscription also allows). Closed = hidden from nearby. */
    isOpen: { type: Boolean, default: true },
    /** Legacy field (kept for backward compatibility) */
    subscriptionPaidUntil: { type: Date, default: null },
    /** Manual monthly subscription (₹350) */
    subscription: {
      isActive: { type: Boolean, default: false },
      monthlyCharge: { type: Number, default: 350 },
      lastPaidAt: { type: Date, default: null },
      nextDueAt: { type: Date, default: null },
      lastPaymentId: { type: String, default: '' },
      lastPaymentStatus: {
        type: String,
        enum: ['unpaid', 'pending', 'paid', 'failed'],
        default: 'unpaid',
      },
      pendingPaymentLinkId: { type: String, default: null },
      pendingPaymentLinkUrl: { type: String, default: null },
    },
  },
  { timestamps: true }
);

shopSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Shop', shopSchema);
