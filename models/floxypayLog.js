const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Floxy pay log Schema 
const floxyPayLog = new mongoose.Schema({
  user_id: { type: String, index: true },
  requestBody: Object,
  paymentGatewayResponse: Object,
  orderId: { type: String, index: true },
  status: String,
  transactionType: String,
  amount: String,
  log_ref_code: String,
  parent_level_ids: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    _id: false
  }],
  host: String
},
  {
    timestamps: true,
    versionKey: false // This will disable the __v field
  });

module.exports = mongoose.model('floxypay_log', floxyPayLog);