const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

const fancyScorePositionSchema = {
  key: { type: String, required: true },
  value: { type: Number, required: true },
  _id: false
};

const fancyScorePosition = new Schema(fancyScorePositionSchema);

const distributionSchema = {
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  user_type_id: { type: Number, required: true, min: 0, max: 100 },
  session_commission: { type: Number, default: 0 },
  share: { type: Number, required: true, min: 0, max: 100 },
  commission: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
  _id: false
};

const distribution = new Schema(distributionSchema);

/**
 * fancy model schema
 */
const FancySchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  sport_id: { type: String, required: true },
  sport_name: { type: String, required: true },
  series_id: { type: String, required: true },
  series_name: { type: String, required: true },
  match_id: { type: String, required: true },
  match_name: { type: String, required: true },
  match_date: { type: Date },
  fancy_id: { type: String, required: true },
  fancy_name: { type: String, required: true },
  category: { type: Number, default: 0 },
  category_name: { type: String, default: "NORMAL" },
  selection_id: { type: String, required: true },
  liability: { type: Number, required: true },
  profit: { type: Number, required: true },
  session_commission: { type: Number, default: 0 },
  domain_name: { type: String, required: true },
  stack: { type: Number, required: true },
  type: { type: Number, default: 2 },
  fancy_score_position_json: [fancyScorePosition],
  bets_fancies: [],
  distribution: [distribution],
  is_active: { type: Boolean, default: true },
  is_demo: Boolean,
}, { versionKey: false, timestamps: true });

FancySchema.index({ "fancy_id": 1 });
FancySchema.index({ "match_id": 1, "fancy_id": 1 }, { name: "sp_set_result_fancyV2" });
FancySchema.index({ "match_id": 1, "distribution.user_id": 1 }, { name: "get_fancy_liability_by_share" });
FancySchema.index(
  { "match_id": 1, "fancy_id": 1, "bets_fancies.is_back": 1, "bets_fancies.run": 1 },
  { name: "updateFSPBetRecordsOnResultDeclareQueryV2" }
);

FancySchema.index(
  {
    is_active: 1,
    "distribution.user_id": 1,
    match_date: 1
  },
  {
    name: "fancy_analysis"
  },
);
// 18/02/25 profiler suggested
FancySchema.index(
  {
    user_name: 1,
  },
);

module.exports = mongoose.model('fancy_score_position', FancySchema);