const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const lotusBetsSchema = new Schema({

  // Internal usage fields.
  userName: String,
  domainName: String,
  parentLevels: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],

  // Aura casino fields.
  matchName: String,
  marketType: String,
  userId: String,
  calculateExposure: Number,
  gameId: String,
  marketId: String,
  runnerId: String,
  runnerName: String,
  stake: Number,
  odds: Number,
  pnl: Number,
  chips: Number,
  liability: Number,
  status: String,
  isBack: Boolean,
  roundId: String,
  marketName: String,
  orderId: String,
  pl: Number,
  betExposure: Number,
  betvoid: Boolean,
  operatorId: String,
  runners: Object,

  isProcessed: { type: Number, default: 0 }, // 0 = bet place completed, 1 = Bet settled, 2 = Round Cancel.

}, {
  versionKey: false,
  timestamps: true,
  collection: 'lotus_bets'
});

lotusBetsSchema.index({ "roundId": 1 });
lotusBetsSchema.index({ "marketId": 1 });
lotusBetsSchema.index({ "userId": 1 });
lotusBetsSchema.index({ "betvoid": 1 });
lotusBetsSchema.index({ "isProcessed": 1 });
lotusBetsSchema.index({ "parentLevels.user_id": 1 });
lotusBetsSchema.index({ "orderId": 1 });
lotusBetsSchema.index({ 'parentLevels.user_id': 1, 'isProcessed': 1, 'createdAt': 1 }, { name: "turnOverReport" });

module.exports = mongoose.model('lotus_bets', lotusBetsSchema);