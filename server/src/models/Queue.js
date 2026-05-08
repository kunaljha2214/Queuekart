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
