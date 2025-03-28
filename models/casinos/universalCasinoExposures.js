const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const schema = new Schema({

  // Internal usage fields.
  sportName: String,
  userName: String,
  domainName: String,
  parentLevels: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],

  // Aura casino fields.
  gameId: String,
  roundId: String,
  marketId: String,
  marketType: String,
  matchName: String,
  marketName: String,
  userId: String,
  calculateExposure: Number,
  selectionId: String,
  selectionName: String,
  stake: Number,
  odds: Number,
  pnl: Number,
  isBack: Boolean,
  pnl: Number,
  betId: String,
  betExposure: Number,
  operatorId: String,

  isProcessed: { type: Number, default: 0 }, // 0 = active round, 1 = completely processed, 2 = round cancelled.

}, {
  versionKey: false,
  timestamps: true,
  collection: 'universal_casino_exposures'
});

schema.index({ roundId: 1 });
schema.index({ userId: 1 });

module.exports = mongoose.model('universal_casino_exposures', schema);