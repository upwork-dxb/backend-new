require('dotenv').config();
const mongoose = require('mongoose');
require('mongoose-double')(mongoose);
Schema = mongoose.Schema
  , SchemaTypes = mongoose.Schema.Types
  , { USER_TYPE_SUPER_ADMIN, LABEL_CHIP_SUMMARY } = require('../utils/constants')
  , VALIDATION = require('../utils/validationConstant');


/**
 * user model schema
 */
const UserSchema = new Schema({
  parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  parent_user_name: { type: String, default: null, minLength: 3, maxLength: 30 },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true, unique: true },
  name: { type: String, required: true, minLength: 3, maxLength: 30 },
  title: { type: String, default: '' },
  user_type_id: { type: Number, required: true, min: 0, max: 100 }, // 0=Super Admin, 1=Client, 2...∞ Agents
  is_dealer: { type: Boolean, default: false },
  is_b2c_dealer: { type: Boolean },
  is_default_dealer: { type: Boolean, default: false },
  allow_social_media_dealer: { type: Boolean },
  child_limit: { type: Number, default: 0, min: 0 },
  password: { type: String, required: true },
  // raw_password: { type: String, required: true, min: 6, max: 12 },
  transaction_password: { type: String, default: null },
  raw_transaction_password: { type: String, default: null },
  country_code: { type: String, default: null },
  ip_address: { type: String, default: null },
  last_login_ip_address: String,
  daily_bonus_amount: { type: SchemaTypes.Double, default: process.env.DEFAULT_DAILY_BONUS_AMOUNT, min: process.env.MIN_DAILY_BONUS_AMOUNT, max: process.env.MAX_DAILY_BONUS_AMOUNT },
  liability: { type: Number, default: 0, max: 0 },
  balance: { type: Number, default: 0, min: 0 },
  qtech_pending_balance: { type: Number, default: 0, min: 0 },
  bonus: { type: Number, default: 0 },
  default_balance: Number, // Use for demo users refilling balance.
  // Ukraine Concept
  balance_reference: { type: Number, default: 0, min: 0 },
  partnership: { type: Number, default: 0, min: 0, max: 100 },
  parent_partnership_share: { type: Number, default: 0, min: 0, max: 100 },
  share: { type: Number, default: 0, min: 0, max: 100 },
  profit_loss: { type: Number, default: 0, min: 0 },
  total_settled_amount: { type: Number, default: 0 },
  domain: { type: Schema.Types.ObjectId, ref: 'WebsiteSetting', default: null },
  domain_name: { type: String, default: null },
  point: { type: Number, required: true },
  exposure_limit: { type: Number, required: true, default: -1 },
  match_stack: { type: Array },
  self_lock_user: {
    type: Number,
    enum: [0, 1], default: 0
  },
  parent_lock_user: {
    type: Number,
    enum: [0, 1], default: 0
  },
  self_lock_betting: {
    type: Number,
    enum: [0, 1, 2], default: 0
  },
  parent_lock_betting: {
    type: Number,
    enum: [0, 1], default: 0
  },
  self_lock_fancy_bet: {
    type: Number,
    enum: [0, 1, 2], default: 0
  },
  parent_lock_fancy_bet: {
    type: Number,
    enum: [0, 1], default: 0
  },
  self_close_account: {
    type: Number,
    enum: [0, 1], default: 0
  },
  parent_close_account: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_multi_login_allow: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_online: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_change_password: {
    type: Number,
    enum: [0, 1], default: 0
  },
  // Ukraine Concept
  belongs_to_credit_reference: { // ∈
    type: Number,
    enum: [0, 1], default: 0
  },
  belongs_to: { type: String, default: LABEL_CHIP_SUMMARY },
  belongs_to_b2c: Boolean,
  refer_code: { type: String },
  //wallet account field
  domain_assign_list: { type: Array, default: [] },
  domain_assign_list_name: { type: Array, default: [] },
  total_deposit: { type: Number, default: 0, min: 0 },
  total_withdraw: { type: Number, default: 0, min: 0 },
  sports_permission: [{
    sport: { type: Schema.Types.ObjectId, ref: 'Sports' },
    sport_id: { type: String, required: true },
    name: { type: String, required: true, min: 4, max: 20 },
    is_allow: { type: Boolean, required: true, default: true },
    _id: false
  }],
  parent_level_ids: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    name: { type: String, required: true, minLength: 3, maxLength: 30 },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
  distribution: [{
    sport: { type: Schema.Types.ObjectId, ref: 'Sports', required: true },
    sport_id: { type: String, required: true },
    name: { type: String, required: true },
    parent_partnership_share: { type: Number, required: true, min: 0, max: 100 },
    share: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
  have_admin_rights: { type: Boolean, default: false },
  // Here we can check whether the SPO,SER,MAT,MAR settings are applicable or not.
  check_event_limit: { type: Boolean, default: true },
  is_demo: { type: Boolean, default: false },
  is_auto_demo: Boolean,
  markets_liability: {},
  sessions_liability: {},
  match_commission: { type: Number, default: 0, min: 0, max: 99 },
  session_commission: { type: Number, default: 0, min: 0, max: 99 },
  userSettingSportsWise: { type: Schema.Types.ObjectId, ref: 'UserSettingSportWise' },
  partnerships: { type: Schema.Types.ObjectId, ref: 'Partnerships' },
  parent_userSettingSportsWise: { type: Schema.Types.ObjectId, ref: 'UserSettingSportWise' },
  parent_partnerships: { type: Schema.Types.ObjectId, ref: 'Partnerships' },
  // Ukraine Concept
  credit_reference: { type: Number, default: VALIDATION.credit_reference_default, min: VALIDATION.credit_reference_min, max: VALIDATION.credit_reference_max },
  children_credit_reference: { type: Number },
  rate: { type: Number, default: VALIDATION.rate_default, min: VALIDATION.rate_min, max: VALIDATION.rate_max },
  mobile: { type: SchemaTypes.Double, default: VALIDATION.mobile_default, min: VALIDATION.mobile_min, max: VALIDATION.mobile_max },
  email: String,
  isChipSummary: Boolean,
  // super nowa
  sessionid: { type: String, trim: true, default: null },
  last_bet_place_time: { type: Date, trim: true, default: null },
  login_count: { type: Number, default: 0 },
  last_login_date_time: { type: Date, default: null },
  is_telegram_enable: { type: Number, default: 0 },
  telegram_chat_id: { type: String, default: null },
  otp: { type: String, default: null },
  expire_time: { type: Number, default: 0 },
  otp_purpose: { type: String, default: null },
  is_mobile_verify: { type: Number, default: 0 },
  lotusExposureTime: Number,
  // Virgo
  total_downline_users_count: { type: Number, default: 0 },
  total_downline_agents_count: { type: Number, default: 0 },
  total_users_online_count: { type: Number, default: 0 },
  total_agents_online_count: { type: Number, default: 0 },
  is_total_count_calculated: { type: Boolean, default: true },
  // Counts
  total_deposit_count: { type: Number, default: 0 },
  total_withdraw_count: { type: Number, default: 0 },
  //forgot password
  orderId: { type: String },
  is_verified: {
    type: Number,
    enum: [0, 1]
  },
  // Chip Summary
  settlement_pl: { type: Number, default: 0 },
  settlement_comm: { type: Number, default: 0 },
  settlement_pl_comm: { type: Number, default: 0 },
  is_settlement_amount_calculated: { type: Boolean },
  is_enable_telegram_default: { type: Number, default: 0 },
  city: { type: String },
  remark: { type: String },
  rule_accept: { type: Number, default: 0 },
  favorite_master: { type: Number, default: 0 },
  sport_pl: { type: Number, default: 0 },
  casino_pl: { type: Number, default: 0 },
  third_party_pl: { type: Number, default: 0 },
  // Auto Credit_Reference
  is_auto_credit_reference: { type: Number, default: 0 },
  // Diamond Settlement
  upline_settlement: { type: Number, default: 0 },
  downline_settlement: { type: Number, default: 0 },
  transaction_password_attempts: { type: Number, default: 0 },
  is_transaction_password_locked: { type: Boolean, default: false },
  // Auth App
  // Unique UUID generated by calling an API from the APP, One App can have multiple Users Accounts
  // It Helps in tracking all the Users Account sharing a common App Id
  auth_app_id: { type: String, default: null },
  user_auth_app_token: { type: String, default: null },
  is_auth_app_enabled: { type: Number, default: 0 },
  // Represent If any of the Secure Auth Enabled (Telegram or Auth App)
  is_secure_auth_enabled: { type: Number, default: 0 },

}, {
  versionKey: false,
  timestamps: true,
});

UserSchema.index({ 'parent_level_ids.user_id': 1, user_type_id: 1, sessions_liability: 1 });
UserSchema.index({ 'parent_level_ids.user_id': 1, user_type_id: 1, markets_liability: 1 });
UserSchema.index({ "parent_level_ids.user_id": 1, user_type_id: 1, self_close_account: 1, parent_close_account: 1 }, { name: "countAgentsUsersDownline" });
UserSchema.index({ is_demo: 1 }, { name: "demo_users_reset" });

UserSchema.index({ parent_user_name: 1 });

UserSchema.index({ 'parent_level_ids.user_id': 1, user_name: 1, parent_close_account: 1, self_close_account: 1 });

UserSchema.index({ 'parent_level_ids.user_id': 1, parent_close_account: 1, self_close_account: 1 });

UserSchema.index({
  parent_close_account: 1, parent_lock_user: 1, self_close_account: 1, self_lock_user: 1, is_dealer: 1, domain_name: 1, createdAt: 1
}, { name: "userRegister" });

UserSchema.index({
  'parent_level_ids.user_id': 1, belongs_to_credit_reference: 1, parent_close_account: 1, self_close_account: 1, belongs_to: 1
}, { name: "getUsersListDiamond_1" });

UserSchema.index({
  parent_id: 1, belongs_to_credit_reference: 1, parent_close_account: 1, self_close_account: 1, belongs_to: 1
}, { name: "getUsersListDiamond" });

UserSchema.set('toJSON', { virtuals: true, getters: true });

UserSchema.set('toObject', { getters: true });

UserSchema.virtual('user_id').get(function () {
  return this._id;
});

UserSchema.pre('save', function () {
  if (this.user_type_id != USER_TYPE_SUPER_ADMIN) {
    let fieldError = [];
    if (this.parent_id == null)
      fieldError.push('parent_id');
    if (this.parent_user_name == null)
      fieldError.push('parent_user_name');
    if (!this.domain)
      fieldError.push('domain');
    if (!this.domain_name)
      fieldError.push('domain_name');
    if (fieldError.length)
      throw new Error(fieldError.toString() + " is required for this type of user");
  }
});

module.exports = mongoose.model('User', UserSchema);

/*
UserSchema.set('toObject', { virtuals: true })
UserSchema.virtual("user_id")
  .get(function () {
    return this._id;
  })
  .set(function (x) {
    this.user_id = x;
  });
*/