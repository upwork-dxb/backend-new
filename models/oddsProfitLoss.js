const mongoose = require('mongoose');
const marketSelections = require('./marketSelection');
const Schema = mongoose.Schema;
let MarketSelection = marketSelections("full");
delete MarketSelection["_id"];
delete MarketSelection["ex"];

/**
 * Odds profit loss model schema
 */
const OddsProfitLossSchema = new Schema({

  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  domain_name: { type: String, required: true },
  sport_id: { type: String, required: true },
  sport_name: { type: String, required: true },
  series_id: { type: String, required: true },
  series_name: { type: String, required: true },
  match_id: { type: String, required: true },
  match_name: { type: String, required: true },
  market_name: { type: String, required: true },
  match_date: { type: Date, required: true },
  market_type: { type: String, default: "OTHER" },
  ...MarketSelection,
  stacks_sum: { type: Number, default: 0, required: true },
  user_pl: { type: Number, required: true },
  user_commission_pl: { type: Number, required: true },
  max_liability: { type: Number, default: 0, required: true },
  is_active: { type: Boolean, default: true },
  is_demo: Boolean,
  win_loss_distribution: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    win_loss: { type: Number, default: 0 },
    p_l: { type: Number, default: 0 },
    added_pl: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    added_comm: { type: Number, default: 0 },
    share: { type: Number, required: true, min: 0, max: 100 },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    match_commission: { type: Number, default: 0, min: 0, max: 99 },
    session_commission: { type: Number, default: 0 },
    index: Number,
    _id: false
  }],
  parents: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }]
}, { versionKey: false, timestamps: true, collection: 'odds_profit_loss' });

OddsProfitLossSchema.index({ user_id: 1, market_id: 1, match_id: 1 }, { name: "getTeamPosition_user" });
OddsProfitLossSchema.index({ match_id: 1, market_id: 1, selection_id: 1 }, { name: "sp_set_result_oddsV2" });
OddsProfitLossSchema.index({ market_id: 1 }, { name: "fn_update_balance_liability_Query" });
OddsProfitLossSchema.index(
  {
    is_active: 1,
    "win_loss_distribution.user_id": 1,
    match_date: 1,
  },
  { name: "market_analysis" },
);
OddsProfitLossSchema.index(
  { market_id: 1, "win_loss_distribution.user_id": 1, },
  { name: "market_user_book" },
);
// 18/02/25 profiler suggested
OddsProfitLossSchema.index(
  { user_name: 1, },
);

module.exports = mongoose.model('odds_profit_loss', OddsProfitLossSchema);