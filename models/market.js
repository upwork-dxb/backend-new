const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const marketSelections = require('./marketSelection');
const VALIDATION = require('../utils/validationConstant');

/**
 * Markets model schema
 */
const MarketsSchema = new Schema({
  sport_id: { type: String, required: true },
  sport_name: { type: String, required: true },
  series_id: { type: String, required: true },
  series_name: { type: String, required: true },
  match_id: { type: String, required: true },
  match_name: { type: String, required: true },
  match_date: { type: Date, default: null },
  market_id: { type: String, required: true },
  marketId: { type: String, required: true },
  name: { type: String, required: true },
  market_name: { type: String, required: true },
  market_order: { type: Number, default: 0 },
  market_type: { type: String, default: "OTHER" },
  status: { type: String, default: "SUSPENDED" },
  inplay: { type: Boolean, default: false },
  cron_inplay: { type: Boolean, default: false },
  centralId: { type: String, required: true },
  country_code: String,
  venue: String,
  market_start_time: Date,
  runners: {
    type: [marketSelections()],
    required: true
  },
  is_active: {
    type: Number,
    enum: [0, 1], default: 1
  },
  is_visible: { type: Boolean, default: true },
  is_manual: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_result_declared: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_abandoned: {
    type: Number,
    enum: [0, 1], default: 0
  },
  enable_fancy: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_created: { type: Number, default: 1 },
  news: { type: String },
  matched: { type: String, default: "0" },
  totalMatched: { type: Number, default: 0 },
  // Market settings for sports
  market_min_stack: { type: Number, default: VALIDATION.market_min_stack },
  live_market_min_stack: { type: Number },
  market_max_stack: { type: Number, default: VALIDATION.market_max_stack },
  live_market_max_stack: { type: Number },
  market_min_odds_rate: { type: Number, default: VALIDATION.market_min_odds_rate },
  market_max_odds_rate: { type: Number, default: VALIDATION.market_max_odds_rate },
  market_back_rate_range: { type: Number, default: 0 },
  market_lay_rate_range: { type: Number, default: 0 },
  market_bookmaker_min_odds_rate: { type: Number, default: VALIDATION.market_bookmaker_min_odds_rate },
  market_bookmaker_max_odds_rate: { type: Number, default: VALIDATION.market_bookmaker_max_odds_rate },
  market_max_profit: { type: Number, default: VALIDATION.market_max_profit },
  market_advance_bet_stake: { type: Number, default: VALIDATION.market_advance_bet_stake },
  market_live_odds_validation: { type: Boolean, default: false },
  unmatch_bet_allowed: { type: Boolean, default: false },
  no_of_unmatch_bet_allowed: { type: Number, default: 0 },
  volume_stake_enable: { type: Boolean, default: true },
  min_volume_limit: { type: Number, default: VALIDATION.min_volume_limit },
  betting_will_start_time: { type: Number, default: 0 },
  is_back_bet_allowed: { type: Boolean, default: true },
  is_lay_bet_allowed: { type: Boolean, default: true },
  inplay_max_volume_stake_0_10: { type: Number, default: 0 },
  inplay_max_volume_stake_10_40: { type: Number, default: 0 },
  inplay_max_volume_stake_40: { type: Number, default: 0 },
  max_volume_stake_0_10: { type: Number, default: 0 },
  max_volume_stake_10_40: { type: Number, default: 0 },
  max_volume_stake_40: { type: Number, default: 0 },
  inplay_betting_allowed: { type: Boolean, default: true },
  is_lock: { type: Boolean, default: false },
  bet_count: { type: Number, default: 0 },
  // After result declared
  result_status: { type: String, default: "" },
  bet_result_id: { type: Schema.Types.ObjectId, ref: 'bet_results', default: null },
  type: { type: Number, default: 1 },
  result_selection_id: { type: String, default: "" },
  result_selection_name: { type: String, default: "" },
  is_rollback: { type: Number, default: 0 },
  // Processing Status
  // 1 = Process Started, 2 = process success, 
  // 3 = not settled due to some error try again, 4 = closed around bull queue
  is_processing: { type: Number, default: 0 },
  processing_message: { type: String, default: "" },
  bull_job_ids: { type: [String], default: [] },
  bull_job_count: { type: Number, default: 0 },
  bull_job_last_updated_at: { type: Date, default: null },

  is_rollback_processing: { type: Number, default: 0 },
  rollback_processing_message: { type: String, default: "" },
  rollback_bull_job_ids: { type: [String], default: [] },
  rollback_bull_job_count: { type: Number, default: 0 },
  rollback_bull_job_last_updated_at: { type: Date, default: null },

  match_tv_url: { type: String, default: null },
  has_tv_url: { type: Boolean, default: false },
  result_settled_at: { type: Date, default: null },
  result_settled_ip: { type: String },
  // Users block section
  self_blocked: [{ type: String }],
  parent_blocked: [{ type: String }],
  // For HR
  no_of_winners: { type: Number },
  // Un Matched Bets
  unmatch_bets: {
    type: [{
      bet_id: { type: Schema.Types.ObjectId },
      user_id: { type: Schema.Types.ObjectId },
      user_name: { type: String },
      odds: { type: Number },
      is_back: { type: Number },
      selection_id: { type: Number },
      is_matched: { type: Number, default: 0 },
      delete_status: { type: Number, default: 0 }
    }], default: []
  },
  belong_to: { type: String, default: (process.env.UNIQUE_IDENTIFIER_KEY).toLocaleLowerCase() },
  
  // Result Cron
  result_value: { type: String },
  // 0 -> Can Be Started  1 -> In Progress  2 -> Completed  3 => Error
  result_cron_progress: { type: Number },
  result_cron_progress_message: { type: String },

  // Rollback Cron
  rollback_cron_progress: { type: Number },
  rollback_cron_progress_message: { type: String },
}, {
  versionKey: false,
  timestamps: true,
  id: false,
  collection: 'markets'
});

MarketsSchema.set('toJSON', { virtuals: true });
MarketsSchema.index({ match_id: 1, market_id: 1 }, { unique: true });
MarketsSchema.index({ market_id: 1, bet_count: 1, bet_result_id: 1, is_result_declared: 1 });

MarketsSchema.index({ is_active: 1, is_visible: 1, is_result_declared: 1, market_name: 1, sport_id: 1 }, {
  name: "matches_list"
});

MarketsSchema.index({
  is_abandoned: 1, is_processing: 1, is_result_declared: 1, is_rollback: 1, bet_result_id: 1, match_date: 1, bet_count: 1
}, { name: "resultQuery" });

MarketsSchema.index({ bet_result_id: 1, bet_count: 1 });

MarketsSchema.index({ 'runners.market_id': 1, 'runners.selection_id': 1 }, { name: 'oddsResultPreProcess' });

MarketsSchema.index({ market_id: 1, 'runners.selectionId': 1 }, { name: 'validateMarketBeforeBetPlace' });

MarketsSchema.index({
  is_active: 1, is_visible: 1, is_abandoned: 1, is_result_declared: 1, match_scoreboard_url: 1,
  match_tv_url: 1, centralId: 1, sport_id: 1, match_date: 1
}, { name: 'updateTVandScoreBoardURL' });

MarketsSchema.index({
  is_active: 1, is_visible: 1, is_abandoned: 1, is_result_declared: 1, market_start_time: 1,
  centralId: 1, sport_id: 1
});

MarketsSchema.index({
  is_active: 1, is_visible: 1, is_abandoned: 1, is_result_declared: 1, cron_inplay: 1, market_type: 1, sport_id: 1, match_date: 1, market_id: 1
}, { name: "cron_socket" });

// Suggested by mongodb profiller. 22-8-24
MarketsSchema.index({
  sport_id: 1, bet_count: 1, _id: -1
});

MarketsSchema.index({
  is_active: 1, is_visible: 1, is_abandoned: 1, is_result_declared: 1, "unmatch_bets.is_matched": 1, "unmatch_bets.delete_status": 1
}, { name: "convertUnMatchedBets" });

MarketsSchema.index({ result_cron_progress: 1 });
MarketsSchema.index({ rollback_cron_progress: 1 });

module.exports = mongoose.model('markets', MarketsSchema);