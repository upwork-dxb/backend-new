const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Deactive fancy model schema
 */
const DeactiveFancySchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fancy_id: { type: String, required: true }
});

module.exports = mongoose.model('DeactiveFancy', DeactiveFancySchema);