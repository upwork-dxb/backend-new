const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

const qtechCrDrWinLossSchema = new Schema({
  userId: Schema.Types.ObjectId,
  userName: String,
  playerId: String,
  txnId: String,
  txnType: String,
  roundId: String,
  amount: Number,
  currency: String,
  providerCode: String,
  clientRoundId: String,
  gameRoundId: String,
  gameName: String,
  error: String,
  message: String,
  object_reference_id: Schema.Types.ObjectId,
  isProcessed: { type: Number, default: 0 },
  parent_level_ids: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    name: { type: String, required: true, minLength: 3, maxLength: 30 },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
}, {
  versionKey: false,
  timestamps: true,
  collection: 'qtech_crdr_winloss'
});

qtechCrDrWinLossSchema.index({ "roundId": 1 });
qtechCrDrWinLossSchema.index({ "txnId": 1 });
qtechCrDrWinLossSchema.index({ "isProcessed": 1, 'txnType': 1, 'parent_level_ids.user_id': 1 });
qtechCrDrWinLossSchema.index({ "isProcessed": 1, 'txnType': 1, 'userId': 1 });
qtechCrDrWinLossSchema.index({ "roundId": 1, "isProcessed": 1 });

module.exports = mongoose.model('qtech_crdr_winloss', qtechCrDrWinLossSchema);