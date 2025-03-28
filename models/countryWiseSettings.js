const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

/**
 * model schema
 */
const schema = new Schema(
  {
    sport_id: String,
    country_code: String,
    market_min_stack: Number,
    market_max_stack: Number,
    market_min_odds_rate: Number,
    market_max_odds_rate: Number,
    market_max_profit: Number,
    market_advance_bet_stake: Number,
    betting_will_start_time: Number,
    inplay_betting_allowed: Boolean,
  },
  {
    versionKey: false,
    timestamps: false,
    collection: "country_wise_settings",
  },
);

schema.index({ sport_id: 1, country_code: 1 });

module.exports = mongoose.model("country_wise_settings", schema);