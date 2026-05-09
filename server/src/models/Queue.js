const mongoose = require('mongoose');

const queueEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
    walkInName: { type: String, trim: true, default: '' },
    estimatedMinutes: { type: Number, min: 0, default: 0 },
    position: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['waiting', 'serving', 'done', 'cancelled'],
      default: 'waiting',
    },
    joinedAt: { type: Date, default: Date.now },
    groceryList: { type: String, trim: true, default: '' },
    /** Customer preferred pickup time (optional; null = flexible / queue order) */
    pickupAt: { type: Date, default: null },
    /** How the customer joined: end of line vs paid skip to 2nd */
    joinKind: {
      type: String,
      enum: ['standard', 'priority_second'],
      default: 'standard',
    },
    /** Prevent duplicate "turn soon" pushes */
    turnSoonNotifiedAt: { type: Date, default: null },
  },
  { _id: true }
);

const queueSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      unique: true,
    },
    entries: [queueEntrySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Queue', queueSchema);
