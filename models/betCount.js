const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Bets count schema
 */
const BetCountsSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user_name: { type: String, required: true },
  match_id: { type: String, required: true },
  event_id: { type: String, required: true }, // fancy and market id
  bet_count: { type: Number, required: true, default: 1 },
  last_update_type: { type: Number, defalut: 1 },
  // 1 means last updation is an increase || -1 means last updation is a decrease
  type: {
    type: Number, // Consume less data storage compared to storing string data.
    enum: [1, 2], default: 1 // 1 for Market, 2 for Session
  },
  parent_ids: [{
    user_id: { type: Schema.Types.ObjectId },
    user_name: { type: String }
  }],
  expire_at: { type: Schema.Types.Date },
}, { versionKey: false, timestamps: true, collection: 'bet_counts' });

// Indexing
BetCountsSchema.index({ 'parent_ids.user_name': 1 }, { name: 'parentId_user_name' });
BetCountsSchema.index({ user_id: 1, match_id: 1, event_id: 1, }, { name: 'user_match_event_id' });
BetCountsSchema.index({ match_id: 1, event_id: 1, }, { name: 'match_event_id' });

// Expire Index
BetCountsSchema.index({ expire_at: 1 }, { expireAfterSeconds: 1 });


module.exports = mongoose.model('bet_counts', BetCountsSchema);