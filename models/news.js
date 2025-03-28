const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const newsSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true, unique: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  heading: { type: String, required: true },
  description: { type: String }
}, {
  versionKey: false,
  timestamps: true,
  collection: 'news'
});

module.exports = mongoose.model('news', newsSchema);