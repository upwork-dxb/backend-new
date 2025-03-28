const mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , VALIDATION = require('../utils/validationConstant');

/**
 * sports model schema
 */
const SportsSchema = new Schema({
  name: { type: String, required: true, trim: true },
  sport_id: { type: String, required: true, trim: true },
  is_manual: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_active: {
    type: Number,
    enum: [0, 1], default: 1
  },
  is_visible: { type: Boolean, default: true },
  is_virtual_sport: { type: Boolean, default: false },
  is_live_sport: {
    type: Number,
    enum: [0, 1], default: 0
  },
  providerCode: { type: String, default: null, trim: true },
  casinoProvider: { type: String, trim: true },
  order_by: { type: Number, default: 99 },
  casino_order_by: Number,
  currency: { type: String, default: 'INR' },
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
  inplay_betting_allowed: { type: Boolean, default: true },
  is_back_bet_allowed: { type: Boolean, default: true },
  is_lay_bet_allowed: { type: Boolean, default: true },
  inplay_max_volume_stake_0_10: { type: Number, default: 0 },
  inplay_max_volume_stake_10_40: { type: Number, default: 0 },
  inplay_max_volume_stake_40: { type: Number, default: 0 },
  max_volume_stake_0_10: { type: Number, default: 0 },
  max_volume_stake_10_40: { type: Number, default: 0 },
  max_volume_stake_40: { type: Number, default: 0 },
  // Session settings for sports
  session_min_stack: { type: Number, default: VALIDATION.session_min_stack },
  session_max_stack: { type: Number, default: VALIDATION.session_max_stack },
  session_max_profit: { type: Number, default: VALIDATION.session_max_profit },
  session_live_odds_validation: { type: Boolean, default: false },
  // Users block section
  self_blocked: [{ type: String }],
  parent_blocked: [{ type: String }],
}, {
  versionKey: false,
  timestamps: true,
  id: false
});

SportsSchema.set('toJSON', { virtuals: true });

SportsSchema.virtual('is_created').get(function () {
  return 1;
});
SportsSchema.virtual('from_db').get(function () {
  return 1;
});

SportsSchema.index({ is_active: 1, is_visible: 1, is_virtual_sport: 1 }, { name: 'openSports' });

SportsSchema.index({ is_virtual_sport: 1, order_by: 1 });

module.exports = mongoose.model('Sports', SportsSchema);