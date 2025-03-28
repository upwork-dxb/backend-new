const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * telegram subscribers model schema
 */
const TelegramSubscribersSchema = new Schema({
  telegram: Object,
  user_id: { type: Schema.Types.ObjectId, ref: 'User', unique: true },
  user_type_id: { type: Number },
  chat_id: { type: String, required: true, unique: true },
  is_subscribed: { type: Boolean, required: true }
}, {
  versionKey: false,
  timestamps: true,
  collection: 'telegram_subscribers'
});

module.exports = mongoose.model('telegram_subscribers', TelegramSubscribersSchema);