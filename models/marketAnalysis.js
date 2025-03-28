const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * Market Analysis model schema
 */
const marketAnalysisSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  match_id: { type: String, required: true },
  parent_ids: [{ type: String }],
}, {
  versionKey: false,
  timestamps: false,
  collection: 'market_analysis'
});

marketAnalysisSchema.index({ user_id: 1, match_id: 1 }, { unique: true, name: "market_analysis_unique" });
marketAnalysisSchema.index({ parent_ids: 1 }, { name: "home_matches_filter" });

module.exports = mongoose.model('market_analysis', marketAnalysisSchema);