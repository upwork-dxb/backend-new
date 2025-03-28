const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Deactive sport model schema
 */
const DeactiveSportSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sport_id: { type: String, required: true }
});

module.exports = mongoose.model('DeactiveSport', DeactiveSportSchema);