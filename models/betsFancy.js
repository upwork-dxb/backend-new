const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const distributionSchema = {
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  session_commission: { type: Number, default: 0 },
  share: { type: Number, required: true, min: 0, max: 100 },
  profit_share: { type: Number, required: true, default: 0 },
  loss_share: { type: Number, required: true, default: 0 },
  commission: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
  _id: false
};

const distribution = new Schema(distributionSchema);

/**
 * Bets odds model schema
 */
const eventDetails = {
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  domain_name: { type: String, default: null },
  sport_id: { type: String, required: true },
  sport_name: { type: String, required: true },
  series_id: { type: String, required: true },
  series_name: { type: String, required: true },
  match_id: { type: String, required: true },
  match_name: { type: String, required: true },
  match_date: { type: Date, required: true },
  fancy_id: { type: String, required: true },
  fancy_name: { type: String, required: true },
  selection_id: { type: Number, required: true },
  category: Number,
  category_name: { type: String, default: "NORMAL" },
};

const BetsFancySchema = new Schema({
  ...eventDetails,
  user_commission: { type: Number, default: 0 },
  run: { type: Number, required: true },
  size: { type: Number, required: true },
  stack: { type: Number, required: true },
  stack_inverse: { type: Number, required: true },
  is_back: {
    type: Number,
    enum: [0, 1], default: 0
  },
  liability: { type: Number, required: true },
  liability_per_bet: { type: Number, default: 0 },
  final_user_liability: { type: Number, default: 0 },
  profit: { type: Number, required: true },
  type: { type: Number, default: 2 },
  is_matched: {
    type: Number,
    enum: [0, 1], default: 1
  },
  device_type: { type: String },
  ip_address: { type: String, default: null },
  geolocation: Object,
  device_info: { type: String, default: null },
  mobile: { type: Boolean, default: false },
  delete_status: {
    type: Number,
    enum: [0, 1, 2, 3], default: 0 // 0 = Active, 1 = Deleted, 2 = Void, 3 = Abandoned
  },
  deleted_reason: String,
  deleted_by: String,
  deleted_from_ip: String,
  parents: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
  distribution: [distribution],
  is_fancy: { type: Number, default: 1 },
  // After result declared
  chips: { type: Number, default: 0 },
  result: { type: Number, default: null },
  bet_result_id: { type: Schema.Types.ObjectId, ref: 'bet_results', default: null },
  is_result_declared: { type: Number, default: 0 },
  result_settled_at: { type: Date, default: null },
  is_fraud_bet: {
    type: Number,
    enum: [0, 1, 2], default: 0
  },
  is_demo: Boolean,
  is_fraud_bet_comment: { type: String },
  is_unmatched_bet: Boolean,
}, { versionKey: false, timestamps: true });

// Indexing
BetsFancySchema.index({ "parents.user_id": 1, "match_id": 1 }, { name: 'bets' });
BetsFancySchema.index({ "fancy_id": 1, "match_id": 1, "is_back": 1, "run": 1 }, { name: 'updateBetRecordsOnResultDeclareQuery_full' });
BetsFancySchema.index({ "match_id": 1, "fancy_id": 1, "delete_status": 1 }, { "name": "sp_set_result_fancy" });
BetsFancySchema.index({ "_id": -1, "createdAt": -1 }, { name: 'bets_sort' });
BetsFancySchema.index({ "parents.user_id": 1, "delete_status": 1, "bet_result_id": 1 }, { name: 'openBets' }); // settledBets

BetsFancySchema.index({ 'parents.user_id': 1, 'is_result_declared': 1, 'createdAt': 1 }, { name: "turnOverReport" });

BetsFancySchema.index({ "user_id": 1, "is_result_declared": 1 }, { name: 'myMarket' });
// 18/02/25 profiler suggested
BetsFancySchema.index({ "user_name": 1, },);

module.exports = mongoose.model('bets_fancy', BetsFancySchema);