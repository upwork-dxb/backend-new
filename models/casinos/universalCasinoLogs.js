const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const schema = new Schema({
  roundId: String,
  marketId: String,
  operatorId: String,
  userId: String,
  request: Object,
  response: Object,
  request_ip: String,
  winnerSelectionId: String,
  winnerSelectionName: String,
  comment: String,
  error: String,
  path: String,
  log_by: String,
  line_no: String,
}, {
  versionKey: false,
  timestamps: true,
  collection: 'universal_casino_logs'
});

schema.index({ "roundId": 1, "marketId": 1, "createdAt": -1 });
schema.index({ "roundId": 1, "marketId": 1, "createdAt": 1 });

module.exports = mongoose.model('universal_casino_logs', schema);