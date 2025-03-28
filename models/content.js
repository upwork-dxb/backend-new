const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const contentSchema = new Schema({
  title: { type: String, required: true, minLength: 3, maxLength: 80, trim: true },
  slug: { type: String, minLength: 3, maxLength: 80, trim: true },
  description: String,
  category: String,
  content_meta: Object,
  self_host: { type: Boolean, default: true },
  website: { type: String, trim: true },
  content_type: { type: String, required: true, trim: true },
  content: { type: String },
  content_mobile: { type: String },
  is_active: { type: Boolean, default: false },
}, {
  versionKey: false,
  timestamps: false,
  collection: 'contents'
});

contentSchema.index({ slug: 1 });

module.exports = mongoose.model('content', contentSchema);