const mongoose = require('mongoose')
  , Schema = mongoose.Schema;
/**
 * user_profit_loss model schema
 */

const agentsPLDistributionSchema = {
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  match_commission: { type: Number, default: 0 },
  session_commission: { type: Number, default: 0 },
  p_l: { type: Number, required: true },
  added_pl: { type: Number, default: 0 },
  commission: { type: Number, required: true },
  added_comm: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
  _id: false
};

const agentsPLDistribution = new Schema(agentsPLDistributionSchema, { strict: false });

const userProfitLossSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  domain_name: { type: String, default: null },
  sport_id: { type: String, required: true },
  sport_name: { type: String, required: true },
  series_id: { type: String, required: true },
  series_name: { type: String, required: true },
  match_id: { type: String, required: true },
  match_name: { type: String, required: true },
  match_date: { type: Date, default: null },
  event_id: { type: String, required: true },
  event_name: { type: String, required: true },
  market_type: String,
  winner_name: { type: String, default: null },
  bet_result_id: { type: Schema.Types.ObjectId, ref: 'bet_results', required: true },
  type: {
    type: Number,
    enum: [1, 2], default: 1 // 1 for Market, 2 for Session
  },
  stack: { type: Number, required: true },
  user_pl: { type: Number, required: true },
  user_commission_pl: { type: Number, required: true },
  max_liability: { type: Number, required: true },
  liability: { type: Number },
  description: { type: String, required: true },
  reffered_name: { type: String, required: true },
  agents_pl_distribution: [agentsPLDistribution],
  is_demo: Boolean,
  casinoProvider: String,
  transactionDataId: String,
  qtRoundId: String,
  qtClientRoundId: String,
  auraMarketId: String,
  auraRountId: String,
  parents: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
}, { versionKey: false, timestamps: true, collection: 'user_profit_loss' });

userProfitLossSchema.index({ "bet_result_id": 1 });
userProfitLossSchema.index({ "event_id": 1 });
userProfitLossSchema.index({ "user_pl": 1, "user_commission_pl": 1 });
userProfitLossSchema.index({ "agents_pl_distribution.user_id": 1, "event_id": 1, "event_name": 1 }, { "name": "fancyStakeAgents" });
userProfitLossSchema.index({ "user_id": 1, "event_id": 1, "event_name": 1 }, { "name": "fancyStakeUsers" });
userProfitLossSchema.index({ "agents_pl_distribution.user_id": 1, "sport_id": 1, "createdAt": 1 }, { "name": "matchWiseP_L" });
userProfitLossSchema.index({ "agents_pl_distribution.user_id": 1, "createdAt": 1 }, { "name": "sportsPL" });
userProfitLossSchema.index({ "user_id": 1, "createdAt": 1 }, { "name": "sportsPLOnlyUsers" });
userProfitLossSchema.index({ "user_id": 1, "_id": -1, "createdAt": 1 }, { "name": "eventsProfitLoss" });
userProfitLossSchema.index({ "agents_pl_distribution.user_id": 1 });
userProfitLossSchema.index({ "agents_pl_distribution.user_id": 1, "user_id": 1 });
userProfitLossSchema.index({ "casinoProvider": 1, "createdAt": 1 });
// 18/02/25 profiler suggested
userProfitLossSchema.index({ "user_name": 1, },);

module.exports = mongoose.model('user_profit_loss', userProfitLossSchema);