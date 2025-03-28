const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

const qtechRoundsStatusSchema = new Schema({
  providerCode: String,
  gameId: String,
  gameRoundId: String,
  gameName: String,
  roundId: String,
  playerId: String,
  userName: String,
  error: String,
  retryCount: Number,
  resultMessage: String,
}, {
  versionKey: false,
  timestamps: true,
  collection: 'qtech_rounds_status'
});

qtechRoundsStatusSchema.index({ "createdAt": 1 });
qtechRoundsStatusSchema.index({ "roundId": 1, "retry": 1 });

module.exports = mongoose.model('qtech_rounds_status', qtechRoundsStatusSchema);