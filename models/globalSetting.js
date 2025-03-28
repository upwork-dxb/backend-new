const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * global setting model schema
 */
const GlobalSettingSchema = new Schema({

  site_title: { type: String, default: null },
  site_message: { type: String, default: null },
  is_tv: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_captcha: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_unmatched_bet: {
    type: Number,
    enum: [0, 1], default: 0
  },
  odds_limit: { type: Number, default: 0 },
  is_pdc_charge: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_pdc_distribute: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_pdc_refund: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_pdc_daily_deduct: {
    type: Number,
    enum: [0, 1], default: 0
  },
  pdc_charge: { type: Number, default: 0 },
  pdc_refund: { type: Number, default: 0 },
  logo: { type: String, default: null },
  favicon: { type: String, default: null },
  one_click_stack: [],
  match_stack: [],
  session_stack: [],
  bet_allow_time_before: { type: Number, default: 0 },
  super_admin_commission: { type: Number, default: 0 },
  show_commission: { type: Number, default: 0 },
  terms_conditions: { type: String, default: null },
  site_under_maintenance: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_socket: {
    type: Number,
    enum: [0, 1], default: 0
  },
  theam_code: { type: String, default: null },
  bet_password: { type: String, default: "123456" },
  auto_create: { type: Number, default: 0 },
  transaction_password_timeout: { type: Number, default: 1 },
  is_change_in_balance: { type: Number, default: 0 },
  version: { type: String, default: "1.0" },
  create_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GlobalSetting', GlobalSettingSchema);