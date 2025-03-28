const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

/**
 * Account statements model schema
 */
const AccountStatementSchema = new Schema({
  parent_id: { type: Schema.Types.ObjectId, ref: 'User' },
  parent_user_name: { type: String, default: null },
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  user_type_id: { type: Number, default: null, min: 0, max: 100 }, // 0=Super Admin, 1=Client, 2...∞ Agents
  user_name: { type: String, default: null },
  name: { type: String, default: null },
  point: { type: Number, default: null },
  domain_name: { type: String, default: null },
  agents: [{
    user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    user_type_id: { type: Number, min: 0, max: 100 },
    _id: false
  }],
  description: { type: String, default: null },
  remark: { type: String, default: null },
  statement_type: { type: Number, default: 0 },
  sub_statement_type: { type: String },
  // 1=Free Chips Cr/Dr, 2= Match Profit/Loss, 3=Match Commission, 
  // 4=Session Profit/Loss, 5=Session Commission, 6=Settlement 7=Bonus
  amount: { type: Number, default: 0 },
  available_balance: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  sport_id: String,
  sport_name: String,
  series_id: String,
  series_name: String,
  match_id: String,
  match_name: String,
  match_date: Date,
  market_id: String,
  market_name: String,
  market_type: String,
  event_id: String,
  event_name: String,
  auraMarketId: String,
  auraRountId: String,
  type: {
    type: Number,
    enum: [0, 1, 2], default: 0 // 0=Other, 1=Market, 2=Fancy
  },
  is_demo: Boolean,
  isRollback: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
}, {
  versionKey: false,
  timestamps: { createdAt: 'generated_at' },
  id: false,
  collection: 'account_statements'
});

// Indexing
AccountStatementSchema.index({ "user_id": 1, "generated_at": 1, "_id": 1 }, { name: 'accountStmtAsc' });

AccountStatementSchema.index({ "user_id": 1, "generated_at": 1, "statement_type": 1, "_id": 1 }, { name: 'accountStmtWithTypeAsc' });

// 18/02/25 profiler suggested
AccountStatementSchema.index({ "user_name": 1, }, { name: 'accountStmtSearch' });

module.exports = mongoose.model('AccountStatement', AccountStatementSchema);