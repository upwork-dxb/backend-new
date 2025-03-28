const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Deactive series model schema
 */
const DeactiveSeriesSchema = new Schema({

  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  series_id: { type: String, required: true }
});

module.exports = mongoose.model('DeactiveSeries', DeactiveSeriesSchema);