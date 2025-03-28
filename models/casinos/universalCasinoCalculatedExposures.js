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

  // Aura casino fields.
  roundId: String,
  marketId: String,
  marketType: String,
  gameId: String,
  matchName: String,
  marketName: String,
  userId: String,
  calculateExposure: Number,
  stackSum: { type: Number, default: 0 },
  operatorId: String,

  isProcessed: { type: Number, default: 0 }, // 0 = active round, 1 = completely processed, 2 = round cancelled.

}, {
  versionKey: false,
  timestamps: true,
  collection: 'universal_casino_calculated_exposures'
});

schema.index({ roundId: 1, isProcessed: 1, marketId: 1, userId: 1, updatedAt: 1 });
schema.index({ "parentLevels.user_id": 1 });

module.exports = mongoose.model('universal_casino_calculated_exposures', schema);