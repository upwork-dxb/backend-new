const mongoose = require('mongoose');
/**
 * bet_results model schema
 */

module.exports = mongoose.model('bet_results',
  new mongoose.Schema({
    sport_id: { type: String, required: true },
    sport_name: { type: String },
    series_id: { type: String, required: true },
    series_name: { type: String },
    match_id: { type: String, required: true },
    match_name: { type: String },
    match_date: { type: Date },
    market_id: { type: String, required: true },
    market_name: { type: String },
    category_name: { type: String },
    selection_id: { type: String, required: true },
    result: { type: String, required: true, default: 0 },
    winner_name: { type: String, required: true },
    type: {
      type: Number,
      enum: [1, 2], default: 1 // 1=Odds, 2=Session
    },
    index_cards: { type: [String], default: [] }, // Optional, store index cards if present
    cards: [
      {
        runnerId: { type: String },
        name: { type: String },
        status: { type: String },
        runnerId: { type: String },
        cards: { type: [String] },
      },
    ],
    round_id: { type: String },
  }, { versionKey: false, timestamps: true })
    .index({ "market_id": 1, "match_id": 1, "series_id": 1, "sport_id": 1 })
    .index({ "match_id": 1, "createdAt": 1 })
);