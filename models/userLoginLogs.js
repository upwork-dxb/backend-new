const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * user login logs model schema
 */
const UserLoginLogsSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
  name: { type: String, required: true, minLength: 3, maxLength: 30 },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  domain_name: { type: String, required: true },
  domain: { type: String, required: true },
  parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  parent_user_name: { type: String, default: null, minLength: 3, maxLength: 30 },
  mobile: { type: Boolean, default: false },
  accessToken: String,
  login_time: { type: Date, default: Date.now },
  logout_time: Date,
  login_status: {
    type: String,
    enum: ["login_success", "login_failed"]
  },
  is_online: {
    type: Number,
    enum: [0, 1], default: 0
  },
  is_demo: Boolean,
  message: String,
  geolocation: Object,
  ip_address: String,
  browser_info: String,
  device_info: String,
  parent_level_ids: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
    user_type_id: { type: Number, required: true, min: 0, max: 100 },
    _id: false
  }],
  expireAt: Date
}, {
  versionKey: false,
  timestamps: false,
  collection: 'user_login_logs'
});

UserLoginLogsSchema.index({ "expireAt": 1 }, { expireAfterSeconds: 1 })
UserLoginLogsSchema.index({ "user_name": 1 })
UserLoginLogsSchema.index({ "ip_address": 1 })
UserLoginLogsSchema.index({ "parent_level_ids.user_id": 1 }); // Index on user_id in parent_level_ids
UserLoginLogsSchema.index({ "domain_name": 1 });
module.exports = mongoose.model('UserLoginLog', UserLoginLogsSchema);