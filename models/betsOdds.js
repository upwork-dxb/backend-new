const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const marketSelections = require('./marketSelection');
let MarketSelection = marketSelections("full");
delete MarketSelection["ex"];

function getP_L(value) {
  if (typeof value !== 'undefined')
    return parseFloat(value.toString());
  return value;
};

function getP_L_Inverse(value) {
  return -(getP_L(value));
};

const distributionSchema = {
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  win_loss: { type: Number, default: 0 },
  p_l: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  share: { type: Number, required: true, min: 0, max: 100 },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  match_commission: { type: Number, default: 0, min: 0, max: 99 },
  session_commission: { type: Number, default: 0 },
  index: Number,
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
  market_id: { type: String, required: true },
  market_name: { type: String, required: true },
  market_type: String,
};

const BetsOddsSchema = new Schema({
  ...eventDetails,
  distribution: [distribution],
  selection_id: { type: Number, required: true },
  selection_name: { type: String, required: true },
  sort_name: { type: String, default: null },
  winner_name: { type: String, default: null },
  odds: { type: Number, required: true },
  size: { type: Number, required: true },
  stack: { type: Number, required: true },
  stack_inverse: { type: Number, required: true },
  p_l: { type: Number, required: true },
  chips: { type: Number, default: 0 },
  user_pl: { type: Number, default: 0 },
  is_back: {
    type: Number,
    enum: [0, 1], default: 0
  },
  liability: { type: Number, required: true },
  liability_per_bet: { type: Number, default: 0 },
  bet_result_id: { type: Schema.Types.ObjectId, ref: 'bet_results', default: null },
  result: { type: Number, default: -11111 },
  user_commission: { type: Number, default: 0 },
  is_matched: {
    type: Number,
    enum: [0, 1], default: 0
  },
  type: { type: Number, default: 1 },
  device_type: { type: String },
  ip_address: { type: String, default: null },
  geolocation: Object,
  mobile: { type: Boolean, default: false },
  device_info: { type: String, default: null },
  delete_status: {
    type: Number,
    enum: [0, 1, 2], default: 0 // 0 = active, 1 = deleted, 2 = void
  },
  deleted_reason: String,
  deleted_by: String,
  deleted_from_ip: String,
  bet_matched_at: { type: Number, default: 0 },
  hr_bet_id: Schema.Types.ObjectId,
  parents: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
  runners: {
    type: [{
      ...eventDetails,
      ...MarketSelection,
      stacks_sum: { type: Number, default: 0, required: true },
      user_pl: { type: Number, required: true },
      user_commission_pl: { type: Number, required: true },
      max_liability: { type: Number, default: 0, required: true },
      win_loss_distribution: [Object.assign(distribution, { win_loss: { type: Number, default: 0 } })]
    }],
    required: true
  },
  is_fancy: { type: Number, default: 0 },
  is_result_declared: { type: Number, default: 0 },
  result_settled_at: { type: Date, default: null },
  is_fraud_bet: {
    type: Number,
    enum: [0, 1, 2], default: 0
  },
  is_demo: Boolean,
  is_fraud_bet_comment: { type: String },
  is_unmatched_bet: Boolean,
}, { versionKey: false, timestamps: true, collection: 'bets_odds' });

BetsOddsSchema.set('toJSON', { virtuals: true, getters: true });

// Indexing
BetsOddsSchema.index({ "_id": -1, "createdAt": -1 }, { name: 'bets_sort' });
BetsOddsSchema.index({ "parents.user_id": 1, "delete_status": 1, "bet_result_id": 1 }, { name: 'openBets' }); // settledBets
BetsOddsSchema.index({ "parents.user_id": 1, "match_id": 1, "bet_result_id": 1 });
BetsOddsSchema.index({ "user_id": 1, "match_id": 1, "bet_result_id": 1 });
BetsOddsSchema.index({ "match_id": 1, "market_id": 1, "result": 1 }); // oddsResult.updateBetRecordsOnResultDeclareQuery
BetsOddsSchema.index({ "match_id": 1, "market_id": 1, "selection_id": 1, "result": 1 }); // oddsResult.updateBetRecordsOnResultDeclareQuery
BetsOddsSchema.index({ "match_id": 1, "market_id": 1, "delete_status": 1 }); // oddsResult.sp_set_result_odds
BetsOddsSchema.index({ "distribution.index": 1 }); // oddsResult.sp_set_result_odds
BetsOddsSchema.index({ "user_id": 1, "market_id": 1, "delete_status": 1, "_id": 1 }, { name: "bet_delete" }); // betservice.deleteBet
BetsOddsSchema.index({ "delete_status": 1, "is_fraud_bet": 1, "ip_address": 1, "market_id": 1 }, { name: "fraud_bet" });
BetsOddsSchema.index({ "delete_status": 1, "market_id": 1, "user_name": 1, "createdAt": -1 }, { name: "check_fraud_bets" });
BetsOddsSchema.index({ "user_id": 1, "delete_status": 1, "bet_result_id": 1 });
BetsOddsSchema.index({ "parents.user_id": 1, "is_fancy": 1, "match_id": 1, "bet_result_id": 1 });

BetsOddsSchema.index({ 'user_id': 1, 'delete_status': 1, 'sport_id': 1, 'bet_result_id': 1 });

BetsOddsSchema.index({ 'user_id': 1, 'delete_status': 1, 'bet_result_id': 1, 'createdAt': 1 });

BetsOddsSchema.index({ 'parents.user_id': 1, 'delete_status': 1, 'sport_id': 1, 'bet_result_id': 1 });

BetsOddsSchema.index({ 'market_id': 1 }, { name: "oddsAbandoned" });

BetsOddsSchema.index({ 'parents.user_id': 1, 'delete_status': 1, 'bet_result_id': 1, 'updatedAt': 1 }, { name: "bets1" });

BetsOddsSchema.index({ 'parents.user_id': 1, 'is_result_declared': 1, 'createdAt': 1 }, { name: "turnOverReport" });

BetsOddsSchema.index({ "user_id": 1, "is_result_declared": 1 }, { name: 'myMarket' });
// 18/02/25 profiler suggested
BetsOddsSchema.index({ "user_name": 1, },);

module.exports = mongoose.model('BetsOdds', BetsOddsSchema);