const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Website settings model schema
 */
const WebsiteSettingSchema = new Schema({
  host_name: { type: String, default: null, minLength: 3, maxLength: 30 },
  site_title: { type: String, default: null, minLength: 3, maxLength: 30 },
  domain_name: { type: String, default: null, minLength: 3, maxLength: 30 },
  is_tv_url_premium: { type: Number, default: 0 },
  casino_conversion_rate: { type: Number, default: 1 },
  unmatch_bet_allowed: { type: Boolean, default: false },
  bonus_allowed: { type: Boolean, default: false },
  diamond_rate_limit_enabled: { type: Boolean, default: false },
  bonus_data: {
    type: [
      {
        name: { type: String },
        bonus_type: { type: String },
        is_active: { type: Boolean },
        display_text: { type: String },
        percentage: { type: Number },
        _id: false // added by rah
      },
    ]
  }
}, {
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'website_settings'
});

module.exports = mongoose.model('WebsiteSetting', WebsiteSettingSchema);