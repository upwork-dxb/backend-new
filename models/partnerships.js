const mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , { LABEL_CHIP_SUMMARY } = require('../utils/constants');

/**
 * partnerships model schema
 */
const PartnershipsSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true, unique: true },
  name: { type: String, required: true, minLength: 3, maxLength: 30 },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  domain_name: { type: String, required: true },
  is_dealer: { type: Boolean, default: false },
  belongs_to_credit_reference: { type: Number, enum: [0, 1], default: 0 },
  belongs_to: { type: String, default: LABEL_CHIP_SUMMARY },
  is_demo: { type: Boolean, default: false },
  parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  parent_user_name: { type: String, default: null, minLength: 3, maxLength: 30 },
  userSettingSportsWise: { type: Schema.Types.ObjectId, ref: 'UserSettingSportWise' },
  parent_userSettingSportsWise: { type: Schema.Types.ObjectId, ref: 'UserSettingSportWise', required: true },
  parent_partnerships: { type: Schema.Types.ObjectId, ref: 'Partnerships', required: true },
  sports_share: [{
    sport: { type: Schema.Types.ObjectId, ref: 'Sports', required: true },
    sport_id: { type: String, required: true },
    name: { type: String, required: true },
    percentage: [{
      parent_share: { type: Number, required: true, min: 0, max: 100 },
      parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      parent_partnership_share: { type: Number, required: true, min: 0, max: 100 },
      user_share: { type: Number, required: true, min: 0, max: 100 },
      user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      user_type_id: { type: Number, required: true, min: 0, max: 100 },
      share: { type: Number, required: true, min: 0, max: 100 },
      user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true }
    }]
  }]
}, {
  versionKey: false,
  timestamps: true,
});

PartnershipsSchema.index({ user_id: 1, 'sports_share.sport_id': 1 }, { name: 'marketAndFancyBetPlace' });

module.exports = mongoose.model('Partnerships', PartnershipsSchema);