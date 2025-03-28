const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const schema = new Schema({

  gameId: String,
  roundId: String,
  marketId: String,
  operatorId: String,

  error: String,
  retryCount: Number,
  resultMessage: String,

  isProcessed: { type: Number, default: 0 },
  retryCount: Number,

  forCron: Boolean,

}, {
  versionKey: false,
  timestamps: true,
  collection: 'lotus_round_status'
});

schema.index({ "gameId": 1, "marketId": 1, "roundId": 1 });
schema.index({ "forCron": 1, "isProcessed": 1, "createdAt": 1 });

module.exports = mongoose.model('lotus_round_status', schema);