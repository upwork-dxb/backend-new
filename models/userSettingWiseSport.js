const mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , VALIDATION = require('../utils/validationConstant')
  , { LABEL_CHIP_SUMMARY } = require('../utils/constants');

/**
 * user setting sport wise model schema
 */

const UserSettingSportWiseSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true, unique: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  name: { type: String, required: true, minLength: 3, maxLength: 30 },
  domain_name: { type: String, required: true },
  check_event_limit: { type: Boolean, default: true },
  is_dealer: { type: Boolean, default: false },
  belongs_to_credit_reference: { type: Number, enum: [0, 1], default: 0 },
  belongs_to: { type: String, default: LABEL_CHIP_SUMMARY },
  is_demo: { type: Boolean, default: false },
  parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  parent_user_name: { type: String, default: null, minLength: 3, maxLength: 30 },
  parent_userSettingSportsWise: { type: Schema.Types.ObjectId, ref: 'UserSettingSportWise', required: true },
  partnerships: { type: Schema.Types.ObjectId, ref: 'Partnerships' },
  parent_partnerships: { type: Schema.Types.ObjectId, ref: 'Partnerships', required: true },
  match_commission: { type: Number, default: 0, min: 0, max: 99 },
  session_commission: { type: Number, default: 0, min: 0, max: 99 },
  parent_commission: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    user_name: { type: String, default: null, minLength: 3, maxLength: 30 },
    user_type_id: { type: Number, required: true },
    match_commission: { type: Number, default: 0 },
    session_commission: { type: Number, default: 0 }
  }],
  sports_settings: [{
    sport: { type: Schema.Types.ObjectId, ref: 'Sports', required: true },
    name: { type: String, required: true },
    sport_id: { type: String, required: true },
    // Market settings for sports
    market_min_stack: { type: Number, default: VALIDATION.market_min_stack },
    market_max_stack: { type: Number, default: VALIDATION.market_max_stack },
    market_min_odds_rate: { type: Number, default: VALIDATION.market_min_odds_rate },
    market_max_odds_rate: { type: Number, default: VALIDATION.market_max_odds_rate },
    market_bookmaker_min_odds_rate: { type: Number, default: VALIDATION.market_bookmaker_min_odds_rate },
    market_bookmaker_max_odds_rate: { type: Number, default: VALIDATION.market_bookmaker_max_odds_rate },
    market_bet_delay: { type: Number, default: VALIDATION.market_bet_delay },
    market_max_profit: { type: Number, default: VALIDATION.market_max_profit },
    market_advance_bet_stake: { type: Number, default: VALIDATION.market_advance_bet_stake },
    // Session settings for sports
    session_min_stack: { type: Number, default: VALIDATION.session_min_stack },
    session_max_stack: { type: Number, default: VALIDATION.session_max_stack },
    session_bet_delay: { type: Number, default: VALIDATION.session_bet_delay },
    session_max_profit: { type: Number, default: VALIDATION.session_max_profit }
  }],
  _ids: [Schema.Types.ObjectId]
}, {
  versionKey: false,
  timestamps: true,
  collection: 'user_settings_sports_wise'
});

module.exports = mongoose.model('UserSettingSportWise', UserSettingSportWiseSchema);