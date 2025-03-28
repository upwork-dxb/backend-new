const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Deactive match model schema
 */

const DeactiveMatchSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  match_id: { type: String, required: true },
  block_by_parent: { type: Number, default: 0 },
  blocker_parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { versionKey: false });

module.exports = mongoose.model('DeactiveMatch', DeactiveMatchSchema);