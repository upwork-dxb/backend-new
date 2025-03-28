const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const VALIDATION = require('../utils/validationConstant');

/**
 * fancy model schema
 */
const FancySchema = new Schema({
  sport_id: { type: String, required: true },
  sport_name: { type: String, required: true },
  series_id: { type: String, required: true },
  series_name: { type: String, required: true },
  match_id: { type: String, required: true },
  match_name: { type: String, required: true },
  match_date: { type: Date, default: null },
  centralId: { type: String, default: null },
  fancy_id: { type: String, required: true },
  name: { type: String, required: true },
  fancy_name: { type: String, required: true },
  selection_id: { type: String, required: true },
  session_value_yes: { type: String, default: 0 },
  session_value_no: { type: String, default: 0 },
  session_size_no: { type: String, default: 0 },
  session_size_yes: { type: String, default: 0 },
  is_active: {
    type: Number,
    enum: [0, 1, 2, 3, 4], default: 1 // 0=>Inactive, 1=>Active, 2=>Closed, 3=>Abandoned, 4=>NotUsed
  },
  category: { type: Number, default: 0 },
  category_name: { type: String, default: "NORMAL" },
  chronology: { type: Number, default: 0 },
  is_visible: { type: Boolean, default: true },
  is_manual: {
    type: Number,
    enum: [0, 1], default: 0
  },
  display_message: { type: String, default: "SUSPENDED" },
  is_lock: { type: Boolean, default: false },
  is_created: { type: Number, default: 1 },
  news: { type: String },
  // Session settings for sports
  session_min_stack: { type: Number, default: VALIDATION.session_min_stack },
  session_max_stack: { type: Number, default: VALIDATION.session_max_stack },
  session_live_min_stack: { type: Number },
  session_live_max_stack: { type: Number },
  session_max_profit: { type: Number, default: VALIDATION.session_max_profit },
  session_live_odds_validation: { type: Boolean, default: false },
  bet_count: { type: Number, default: 0 },
  // After result declared
  result_status: { type: String, default: "" },
  result: { type: Number, default: null },
  bet_result_id: { type: Schema.Types.ObjectId, ref: 'bet_results', default: null },
  is_result_declared: { type: Number, default: 0 },
  is_rollback: { type: Number, default: 0 },
  // Processing Status
  // 1 = Process Started, 2 = process success, 
  // 3 = not settled due to some error try again, 4 = closed around bull queue
  is_processing: { type: Number, default: 0 },
  processing_message: { type: String, default: "" },
  bull_job_ids: { type: [String], default: [] },
  bull_job_count: { type: Number, default: 0 },
  bull_job_last_updated_at: { type: Date, default: null },

  is_rollback_processing: { type: Number, default: 0 },
  rollback_processing_message: { type: String, default: "" },
  rollback_bull_job_ids: { type: [String], default: [] },
  rollback_bull_job_count: { type: Number, default: 0 },
  rollback_bull_job_last_updated_at: { type: Date, default: null },

  result_settled_at: { type: Date, default: null },
  result_settled_ip: { type: String },
  // Users block section
  self_blocked: [{ type: String }],
  parent_blocked: [{ type: String }],
  belong_to: { type: String, default: (process.env.UNIQUE_IDENTIFIER_KEY).toLocaleLowerCase() },

  // Result Cron
  result_value: { type: String },
  // 0 -> Can Be Started  1 -> In Progress  2 -> Completed  3 => Error
  result_cron_progress: { type: Number },
  result_cron_progress_message: { type: String },

  // Rollback Cron
  rollback_cron_progress: { type: Number },
  rollback_cron_progress_message: { type: String },

}, { versionKey: false, timestamps: true });

FancySchema.index({ fancy_id: 1 }, { unique: true });
FancySchema.index({ bet_count: 1 });
FancySchema.index({ fancy_name: 1 });
FancySchema.index({ is_active: 1, match_id: 1, is_visible: 1 });
FancySchema.index({ match_id: 1, sport_id: 1 });
FancySchema.index({ chronology: 1, createdAt: 1 }, { name: "matchDetailsSorting" });
FancySchema.index({ result_cron_progress: 1 });
FancySchema.index({ rollback_cron_progress: 1 });

// Suggested by mongodb profiller. 22-8-24
FancySchema.index({ is_result_declared: 1, bet_count: 1, _id: -1 });

module.exports = mongoose.model('Fancy', FancySchema);