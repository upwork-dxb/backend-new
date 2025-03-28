const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

const qtechSchema = new Schema({
  userId: String,
  userName: String,

  txnId: String,
  txnType: String,
  playerId: String,
  roundId: String,
  amount: Number,
  balance: Number,
  referenceId: String,
  currency: String,
  device: String,
  clientType: String,
  category: String,
  completed: String,
  providerCode: String,
  clientRoundId: String,
  gameId: String,
  gameRoundId: String,
  gameName: String,
  created: String,
  betId: String,
  rewardType: String,
  rewardTitle: String,

  request: Object,
  response: Object,
  request_ip: String,
  path: String,
  error: String,
  message: String,
  refund_status: Number,
  object_reference_id: { type: Schema.Types.ObjectId, ref: 'qtech' },
}, {
  versionKey: false,
  timestamps: true,
  collection: 'qtech'
});

qtechSchema.index({ "roundId": 1, "completed": 1 });
qtechSchema.index({ "txnId": 1 });
qtechSchema.index({ "object_reference_id": 1 });

module.exports = mongoose.model('qtech', qtechSchema);