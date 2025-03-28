const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const schema = new Schema({

  // Internal usage fields.
  userName: String,
  domainName: String,
  parentLevels: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],

  // Universal casino fields.
  roundId: String,
  gameId: String,
  matchName: String,
  marketId: String,
  marketName: String,
  marketType: String,
  selectionId: String,
  selectionName: String,
  userId: String,
  betId: String,
  calculateExposure: Number,
  stake: Number,
  odds: Number,
  pnl: Number,
  liability: Number,
  status: String,
  side: String,
  pl: Object,
  betExposure: Number,
  betvoid: Boolean,
  operatorId: String,
  runners: Object,

  isProcessed: { type: Number, default: 0 }, // 0 = bet place completed, 1 = Bet settled, 2 = Round Cancel.

}, {
  versionKey: false,
  timestamps: true,
  collection: 'universal_casino_bets'
});

schema.index({ roundId: 1 });
schema.index({ userId: 1 });
schema.index({ betId: 1 });

module.exports = mongoose.model('universal_casino_bets', schema);