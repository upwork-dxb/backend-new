const b2cConstants = require("../utils/b2cConstants");
const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
* Account wallet request model schema
*/
let category_enums = Object.keys(b2cConstants.BANKING_METHODS);

const BankMethodRequestSchema = new Schema({
  parent_id: { type: Schema.Types.ObjectId, ref: 'User' },
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  user_name: { type: String, default: null },
  domain_method_assign_list: { type: Array, default: [] },
  parent_name: { type: String, default: null },
  type: { type: String, enum: b2cConstants.BANKING_TYPES },
  name: { type: String, default: null },
  category: { type: String, enum: category_enums },
  image: { type: String, default: null },
  status: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  is_updated_by_child: { type: Boolean },
  domain_name: { type: String, default: null },
  dataCount: { type: String, default: null },
  domain_id: { type: Schema.Types.ObjectId, default: null },
  operator_name: { type: String, default: null },
  methodTypeCount: { type: Number, default: 0 },
  operator_id: { type: Schema.Types.ObjectId, default: null },
  expireAt: Date,
  created_at: { type: Date, default: Date.now },
  // New field: b2c_dealers array
  b2c_dealers: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    user_name: { type: String },
    domain_id: { type: Schema.Types.ObjectId, ref: 'WebsiteSetting' },
    domain_name: { type: String },
    banktypeCount: { type: Number },
    _id: false // Disable _id creation for this subdocument
  }],
}, {

  timestamps: { createdAt: 'generated_at' },
  id: false,
  versionKey: false,
  collection: 'bank_methods'
});

// Indexing
BankMethodRequestSchema.index({ "user_id": 1, "parent_id": 1 });
BankMethodRequestSchema.index({ "user_id": 1, "type": 1, "category": 1 }, { unique: true });
BankMethodRequestSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 1 })

module.exports = mongoose.model('BankMethodRequest', BankMethodRequestSchema);