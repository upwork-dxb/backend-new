const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const supernowaSchema = new Schema({
  userId: { type: String },
  sessionid: { type: String },
  partnerKey: { type: String },
  user: { type: Object },
  gameData: { type: Object },
  transactionData: { type: Object },
  timestamp: { type: String },
  request_type: { type: String },
  response: { type: Object },
  request_ip: { type: String },
  comment: { type: String },
  path: { type: String },
  error: { type: String },
  refund_status: { type: Number },
  object_reference_id: { type: Schema.Types.ObjectId, ref: 'supernowa' },
}, {
  versionKey: false,
  timestamps: true,
  collection: 'supernowa'
});

supernowaSchema.index({ "transactionData.id": 1, "refund_status": 1 });
supernowaSchema.index({
  "partnerKey": 1, "request_type": 1, "refund_status": 1, "user.id": 1, "gameData.providerCode": 1,
  "gameData.gameCode": 1, "gameData.providerRoundId": 1
}, { name: "getAgentProfit" });
// supernowaSchema.index({
//   "user.id": 1, "user.currency": 1,
//   "gameData.providerCode": 1, "gameData.providerTransactionId": 1, "gameData.gameCode": 1,
//   "gameData.description": 1, "gameData.providerRoundId": 1,
//   "transactionData.id": 1, "transactionData.amount": 1, "transactionData.referenceId": 1,
// }, { name: "matchOnDebit" });
supernowaSchema.index({ "transactionData.id": 1 }, { name: "matchOnDebit" });

module.exports = mongoose.model('supernowa', supernowaSchema);