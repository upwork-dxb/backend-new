const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const lotusSchema = new Schema({
  roundId: String,
  marketId: String,
  operatorId: String,
  userId: String,
  auth_req: Object,
  auth_res: Object,
  exposure_req: Object,
  exposure_res: Object,
  results_req: Object,
  results_res: Object,
  refund_req: Object,
  refund_res: Object,
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
  collection: 'lotus'
});

lotusSchema.index({ "roundId": 1, "marketId": 1, "createdAt": -1 });
lotusSchema.index({ "roundId": 1, "marketId": 1, "createdAt": 1 });

module.exports = mongoose.model('lotus', lotusSchema);