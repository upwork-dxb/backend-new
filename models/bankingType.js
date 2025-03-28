const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
* Account wallet method type request model schema
*/
const BankTypeRequestSchema = new Schema({
  parent_id: { type: Schema.Types.ObjectId, ref: 'User' },
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  method_id: { type: Schema.Types.ObjectId, ref: 'BankMethodRequest' },
  method_name: { type: String, default: null },
  domain_type_assign_list: { type: Array, default: [] },
  user_name: { type: String, default: null },
  domain_type_name: { type: String, default: null },
  domain_type_id: { type: Schema.Types.ObjectId, default: null },
  parent_name: { type: String, default: null },
  mobile_no: { type: String, default: null },
  bank_holder_name: String,
  bank_name: String,
  ifsc_code: String,
  account_no: String,
  others: String,
  payment_qr: String,
  // cloud image upload fields [content_meta, self_host]
  content_meta: Object,
  self_host: Boolean,
  type: { type: String, default: null },
  operator_assign_list_id: { type: Schema.Types.ObjectId, default: null },
  operator_assign_list_name: { type: String, default: null },
  status: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  is_b2c_dealer: { type: Boolean },
  expireAt: Date,
  created_at: { type: Date, default: Date.now },
}, {
  timestamps: { createdAt: 'generated_at' },
  id: false,
  versionKey: false,
  collection: 'bank_types'
});

// Indexing
BankTypeRequestSchema.index({ "user_id": 1, "parent_id": 1 });
BankTypeRequestSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 1 })

module.exports = mongoose.model('BankTypeRequest', BankTypeRequestSchema);