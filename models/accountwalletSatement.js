const mongoose = require('mongoose')
  , Schema = mongoose.Schema;
const VALIDATION = require('../utils/validationConstant');
/**
* Account wallet request model schema
*/

const accountInfoDetailsSchema = {
  method_name: { type: String },
  bank_holder_name: { type: String },
  bank_name: { type: String },
  ifsc_code: { type: String },
  account_no: { type: String },
  others: { type: String },
  _id: false
};

const accountInfoDetails = new Schema(accountInfoDetailsSchema);

const AccountWalletRequestSchema = new Schema({
  parent_id: { type: Schema.Types.ObjectId, ref: 'User' },
  agent_id: { type: Schema.Types.ObjectId, ref: 'User' },
  wallet_parent_id: { type: Schema.Types.ObjectId, ref: 'User' },
  wallet_trader_id: { type: Schema.Types.ObjectId, ref: 'User' },
  parent_user_name: { type: String, default: null },
  wallet_parent_user_name: { type: String, default: null },
  wallet_trader_user_name: { type: String, default: null },
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  user_type_id: { type: Number, default: null, min: 0, max: 100 }, // 4=Super Operator, 3=Operator, 2...∞ Traders
  user_name: { type: String, default: null },
  name: { type: String, default: null },
  mobile: { type: SchemaTypes.Double, default: VALIDATION.mobile_default, min: VALIDATION.mobile_min, max: VALIDATION.mobile_max },
  point: { type: Number, default: null },
  dataCount: { type: Number, default: 0 },
  domain_name: { type: String, default: null },
  domain: { type: Schema.Types.ObjectId, ref: 'WebsiteSetting' },
  trader_assign_withdraw_request: { type: Schema.Types.ObjectId, default: null },
  trader_assign_withdraw_request_name: { type: String, default: null },
  walletagents: { type: Array, default: [] },
  images: { type: String, default: '' },
  verify_by: { type: String, default: '' },
  reference_no: { type: String, default: '' },
  user_reference_no: { type: String },
  description: { type: String, default: null },
  remark: { type: String, default: null },
  statement_type: { type: String, default: 'DEPOSIT' },
  // DEPOSIT//WITHDRAW, 
  amount: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  bonus_data_obj: {
    type: {
      name: { type: String },
      bonus_type: { type: String },
      is_active: { type: Boolean },
      display_text: { type: String },
      percentage: { type: Number },
    }
  },
  is_signup_credit: { type: Number, default: 0 },
  is_daily_bonus_amount: { type: Number, default: 0 },
  available_balance: { type: Number, default: 0 },
  payment_deatails: { type: Array, default: [] },
  // PENDING // REJECTED // ACCEPETED // PROGRESS
  status: { type: String, default: 'PENDING' },
  country_code: { type: String },
  pendingstatus: { type: Number, default: 0 },
  // cloud image upload fields [content_meta, self_host]
  content_meta: Object,
  self_host: { type: Boolean, default: true },
  parents: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    name: { type: String, required: true, minLength: 3, maxLength: 30 },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
  account_info_details: accountInfoDetails,
  created_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'generated_at' },
  id: false,
  versionKey: false,
  collection: 'accountwallet_statements'
});

// Indexing
AccountWalletRequestSchema.index({ "user_id": 1, "generated_at": -1 }, { name: 'getAccountWalletStatement' });
AccountWalletRequestSchema.index({ "user_id": 1, "statement_type": 1, "generated_at": -1 });
AccountWalletRequestSchema.index({ "parents.user_id": 1, "created_at": 1, "status": 1, "name": 1, "amount": 1 });

AccountWalletRequestSchema.index({ "reference_no": 1, "amount": 1 }, { name: "validateReferenceNo" });

AccountWalletRequestSchema.index({ "status": 1, "pendingstatus": 1, "walletagents": 1 }, { name: "getwalletTransactionRequest" });

// Suggested by mongodb profiller. 22-8-24
AccountWalletRequestSchema.index({
  "trader_assign_withdraw_request": 1, "status": 1, "created_at": 1
}, { name: "traderwithdrawlist" });

AccountWalletRequestSchema.index({
  'statement_type': 1, 'walletagents': 1, 'status': 1, 'user_name': 1, 'parent_user_name': 1, 'mobile': 1, 'amount': 1
}, { name: "getprogesswithdrawList" });

AccountWalletRequestSchema.index({ 'walletagents': 1, 'statement_type': 1, 'status': 1, 'created_at': -1 });

module.exports = mongoose.model('AccountWalletStatement', AccountWalletRequestSchema);