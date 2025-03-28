const mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , marketSelections = require('./marketSelection')
  , VALIDATION = require('../utils/validationConstant');

/**
 * Matches model schema
 */
const MatchesSchema = new Schema({
  sport_id: { type: String, required: true },
  sport_name: { type: String, default: "" },
  series_id: { type: String, required: true },
  series_name: { type: String, default: "" },
  match_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  match_name: { type: String, required: true },
  market_id: { type: String, default: "" },
  marketId: { type: String, default: "" },
  centralId: { type: String, default: null },
  market_name: { type: String, default: "" },
  market_type: { type: String, default: "OTHER" },
  market: { type: Schema.Types.ObjectId, default: null },
  status: { type: String, default: "SUSPENDED" },
  inplay: { type: Boolean, default: false },
  cron_inplay: { type: Boolean, default: false },
  match_date: { type: Date, default: null },
  start_date: { type: Date, default: null },
  marketIds: { type: Array, default: [] },
  centralIds: { type: Array, default: [] },
  country_code: String,
  is_manual: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_active: {
    type: Number,
    enum: [0, 1], default: 1
  },
  is_visible: { type: Boolean, default: true },
  enable_fancy: {
    type: Number,
    enum: [0, 1], default: 0
  },
  // Market
  is_result_declared: {
    type: Number,
    enum: [0, 1], default: 0
  },
  runners: {
    type: [marketSelections()],
    required: true
  },
  is_abandoned: {
    type: Number,
    enum: [0, 1], default: 0
  },
  bet_count: { type: Number, default: 0 },
  fancy_count: { type: Number, default: 0 },
  market_count: { type: Number, default: 0 },
  bookmaker_count: { type: Number, default: 0 },
  match_tv_url: { type: String, default: null },
  has_tv_url: { type: Boolean, default: false },
  has_sc_url: { type: Boolean, default: false },
  match_scoreboard_url: { type: String, default: null },
  is_lock: { type: Boolean, default: false },
  // Market settings for sports
  market_min_stack: { type: Number, default: VALIDATION.market_min_stack },
  market_max_stack: { type: Number, default: VALIDATION.market_max_stack },
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
  // Session settings for sports
  session_min_stack: { type: Number, default: VALIDATION.session_min_stack },
  session_max_stack: { type: Number, default: VALIDATION.session_max_stack },
  session_max_profit: { type: Number, default: VALIDATION.session_max_profit },
  session_category_limites: Object,
  session_category_locked: Object,
  session_live_odds_validation: { type: Boolean, default: false },
  // Users block section
  self_blocked: [{ type: String }],
  parent_blocked: [{ type: String }],
  my_favorites: [{ type: String }],
}, {
  versionKey: false,
  timestamps: true,
  id: false
});

MatchesSchema.index({ market_id: 1 });
MatchesSchema.index({ market: 1 });
MatchesSchema.index({ sport_id: 1 });
MatchesSchema.index({ series_id: 1 });
MatchesSchema.index({ inplay: 1 });
MatchesSchema.index({ is_active: 1, is_visible: 1, sport_id: 1, is_abandoned: 1, is_result_declared: 1, inplay: -1, match_date: -1 });
MatchesSchema.index({ bet_count: 1, sport_id: 1, enable_fancy: 1 }, { name: 'fancyMatchLists' });
MatchesSchema.index({ is_active: 1, is_visible: 1, is_result_declared: 1, sport_id: 1, enable_fancy: 1, is_abandoned: 1, cron_inplay: 1, match_date: 1 }, { name: 'cron_socket' });

// Suggested by mongodb profiller. 22-8-24
MatchesSchema.index({ is_abandoned: 1, is_result_declared: 1, is_visible: 1, centralId: 1, inplay: -1, match_date: -1 });

MatchesSchema.set('toJSON', { virtuals: true });

MatchesSchema.virtual('is_created').get(function () {
  return 1;
});
MatchesSchema.virtual('from_db').get(function () {
  return 1;
});

module.exports = mongoose.model('Matches', MatchesSchema);