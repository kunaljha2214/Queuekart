const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    sortOrder: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

orderItemSchema.index({ shop: 1, sortOrder: 1 });

module.exports = mongoose.model('OrderItem', orderItemSchema);
