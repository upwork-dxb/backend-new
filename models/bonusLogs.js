const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Website settings model schema
 */
const BonusLogsSchema = new Schema({
  domain_id: { type: Schema.Types.ObjectId, ref: 'WebsiteSetting', required: true },
  domain_name: { type: String, required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
  name: { type: String, required: true },
  bonus_type: { type: String, required: true },
  new_value: { type: String, required: true },
  old_value: { type: String, required: true },
  updated_field: { type: String, required: true },
}, {
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'bonus_logs'
});

// Creating indexes
BonusLogsSchema.index({ domain_name: 1 });  // Single index on domain_name

module.exports = mongoose.model('BonusLogs', BonusLogsSchema);