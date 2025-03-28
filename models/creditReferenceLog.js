const mongoose = require('mongoose')
  , VALIDATION = require('../utils/validationConstant')
/**
 * credit_reference_log model schema
 */

module.exports = mongoose.model('credit_reference_log',
  new mongoose.Schema({
    from: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_type_id: { type: Number, required: true, min: 0, max: 100 }, // 0=Super Admin, 1=Client, 2...∞ Agents
    old_credit_reference: { type: Number, default: VALIDATION.credit_reference_default, min: VALIDATION.credit_reference_min, max: VALIDATION.credit_reference_max },
    new_credit_reference: { type: Number, default: VALIDATION.credit_reference_default, min: VALIDATION.credit_reference_min, max: VALIDATION.credit_reference_max },
  }, { versionKey: false, timestamps: true, collection: 'credit_reference_log' })
);