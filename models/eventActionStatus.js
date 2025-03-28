const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * event action status model schema
 */
const eventActionStatusSchema = new Schema({
  event_id: { type: String, required: true },
  in_progress_status: { type: Number, default: 0 }, // 0 Process ready, 1 = Process in-progress, 2 = Process completed.
  type: {
    type: String,
    enum: ["market", "fancy"], default: "market"
  },
  action_type: {
    type: String,
    enum: ["Result", "Rollback", "Abandoned"], default: "Result"
  },
  comment: String,
  error: String,
}, {
  versionKey: false,
  timestamps: true,
  collection: 'event_action_status'
});

eventActionStatusSchema.index({ "event_id": 1, "action_type": 1 });

module.exports = mongoose.model('event_action_status', eventActionStatusSchema);