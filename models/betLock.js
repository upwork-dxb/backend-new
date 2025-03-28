const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Bets count schema
 */
const schema = new Schema(
  {
    event_id: { type: String, required: true },
    category: Number,
    bet_lock: [{ type: String }],
    expireAt: { type: Schema.Types.Date },
  },
  { versionKey: false, timestamps: true, collection: "bet_locks" },
);

// Indexing
schema.index(
  { event_id: 1, category: 1, bet_lock: 1 },
  { name: "market_fancy_bet_lock" },
);
// Expire Index
schema.index({ expireAt: 1 }, { expireAfterSeconds: 1 });

module.exports = mongoose.model("bet_locks", schema);
