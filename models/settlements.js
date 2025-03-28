const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Settlement sport model schema
 */
const SettlementSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parent_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action_by: { type: Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  comment: { type: String, default: "" },
  type: {
    type: Number,
    enum: [0, 1, 2], default: 0
    // 0=Previous status of user(amount > 0 then user in profit and parent will pay)
    // 1=Credit(Parent paid to user)
    // 2=Debit(Parent received from user)
  },
}, { versionKey: false, timestamps: true, collection: 'settlements' });

SettlementSchema.index({ user_id: 1 });

module.exports = mongoose.model('settlements', SettlementSchema);