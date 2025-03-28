const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * ConcurrencyControl model schema
 */
const ConcurrencyControlSchema = new Schema({
  key: { type: String, required: true, unique: true },
  expire_at: { type: Schema.Types.Date },
}, {
  versionKey: false,
  timestamps: true,
  collection: 'concurrency_controls',
  id: false
});

ConcurrencyControlSchema.index({ expire_at: 1 }, { expireAfterSeconds: 1 });
module.exports = mongoose.model('ConcurrencyControls', ConcurrencyControlSchema);