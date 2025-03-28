const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotVerifiedMobileNoSchema = new Schema({
  mobile: { type: String },
  country_code: { type: String },
  is_verified: {
    type: Number,
    enum: [0, 1],
    default: 0,
  },
  orderId: { type: String },
}, {
  versionKey: false,
  timestamps: true,
});

NotVerifiedMobileNoSchema.index({ mobile: 1, country_code: 1 });
NotVerifiedMobileNoSchema.index({ orderId: 1 });
NotVerifiedMobileNoSchema.index({ 'mobile': 1 }, { name: "existingMobile" });

module.exports = mongoose.model('not_verified_mobile_no', NotVerifiedMobileNoSchema);