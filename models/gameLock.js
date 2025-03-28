const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Game Locks schema
 */
const schema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parent_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    is_self_block: { type: Boolean },
    user_name: { type: String, required: true },
    parent_user_name: { type: String, required: true },
    sport_id: { type: String, required: true },
    sport_name: { type: String },
    series_id: { type: String },
    series_name: { type: String },
    match_id: { type: String },
    match_name: { type: String },
    market_id: { type: String },
    category: { type: String },
    name: { type: String, required: true }, // sport_name | series_name | match_name
    market_name: { type: String }, // market_name | fancy_category_name
    event: { type: String },
  },
  { versionKey: false, timestamps: true, collection: "game_locks" },
);

// Indexing
schema.index(
  { sport_id: 1, series_id: 1, match_id: 1 },
  { name: "sport_series_match_game_lock" },
);

schema.index(
  { user_id: 1, parent_id: 1, sport_id: 1, series_id: 1, match_id: 1, market_id: 1, category: 1 },
  { name: "unique_per_user_game_lock", unique: true, },
);
schema.index(
  { user_id: 1 },
  { name: "user_id" },
);

module.exports = mongoose.model("game_locks", schema);
