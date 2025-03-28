const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * telegram subscribers model schema
 */
const tvAndScoreboardSetting = new Schema({
  domains: [],
  premimum_match_tv_url: { type: String, trim: true, default: "" },
  non_premimum_match_tv_url: { type: String, trim: true, default: "" },
  match_scoreboard_url: { type: String, trim: true, default: "" },
  match_id: { type: String, required: true, unique: true },
  expireAt: Date
}, {
  versionKey: false,
  timestamps: true,
  collection: 'tv_and_scoreboard_setting'
});
tvAndScoreboardSetting.index({ "expireAt": 1 }, { expireAfterSeconds: 1 })

module.exports = mongoose.model('tv_and_scoreboard_setting', tvAndScoreboardSetting);