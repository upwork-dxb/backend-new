const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const supernowaCDWLSchema = new Schema({
  user: { type: Object },
  gameData: { type: Object },
  transactionData: { type: Object },
  requestType: { type: String },
  error: { type: String },
  object_reference_id: { type: Schema.Types.ObjectId, ref: 'supernowa' },
  isProcessed: { type: Number },
}, {
  versionKey: false,
  timestamps: true,
  collection: 'supernowa_crdr_winloss'
});

supernowaCDWLSchema.index({
  "user.id": 1, "gameData.providerCode": 1, "gameData.gameCode": 1,
  "gameData.providerRoundId": 1, "gameData.description": 1, "requestType": 1
}, {
  unique: true, name: "user.id|gameData.providerCode|gameData.gameCode|gameData.providerRoundId|gameData.description|gameData.requestType"
});
supernowaCDWLSchema.index({
  "gameData.providerCode": 1, "gameData.gameCode": 1,
  "gameData.providerRoundId": 1, "gameData.description": 1
}, { name: "resultDeclare" });

module.exports = mongoose.model('supernowa_cd_wl', supernowaCDWLSchema);