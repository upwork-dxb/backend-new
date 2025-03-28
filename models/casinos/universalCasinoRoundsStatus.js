const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const schema = new Schema({

  gameId: String,
  eventId: String,
  eventName: String,
  roundId: String,

  users_id: Array,
  error: String,
  retryCount: Number,
  resultMessage: String,

  isProcessed: { type: Number, default: 0 },
  retryCount: Number,

  forCron: Boolean,

}, {
  versionKey: false,
  timestamps: true,
  collection: 'universal_casino_rounds_status'
});

schema.index({ roundId: 1, isProcessed: 1, marketId: 1, gameId: 1 });

module.exports = mongoose.model('universal_casino_rounds_status', schema);