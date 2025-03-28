const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * Matches model schema
 */
const supernowaGameDataSchema = new Schema({
  providerCode: { type: String, required: true },
  gameCode: { type: String, required: true },
  providerRoundId: { type: String, required: true },
  error: { type: String },
}, {
  versionKey: false,
  timestamps: true,
  collection: 'supernowa_game_data'
});

supernowaGameDataSchema.index({
  providerCode: 1, gameCode: 1, providerRoundId: 1
}, { unique: true, name: "resultDeclareParams" });

module.exports = mongoose.model('supernowa_game_data', supernowaGameDataSchema);