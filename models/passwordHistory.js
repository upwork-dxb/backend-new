const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * Password History model schema
 */
const passwordHistorySchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
  comment: { type: String, required: true },
  changed_by_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  changed_by_user_name: String,
  changed_by_user: String,
  mobile: { type: Boolean, default: false },
  ip_address: { type: String },
  geolocation: Object,
  device_info: { type: String },
}, { versionKey: false, timestamps: { createdAt: true, updatedAt: false }, collection: 'password_history' });

passwordHistorySchema.index({ user_id: 1 });

module.exports = mongoose.model('password_history', passwordHistorySchema);