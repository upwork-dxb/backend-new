const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Deactive market model schema
 */
const DeactiveMarketSchema = new Schema({

  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  market_id: { type: String, required: true }
});

module.exports = mongoose.model('DeactiveMarket', DeactiveMarketSchema);