const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const FailedBatchesLogsSchema = new Schema(
  {
    queue_name: { type: String, required: true },
    batch_data: {
      type: Object,
    },
    failed_reason: { type: String, required: true },
    error_stack: { type: String, required: true },
    job_id: { type: String, required: true },
    status: { type: String, default: "FAILED" },
    expire_at: { type: Schema.Types.Date },
  },
  {
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: true },
    collection: "failed_batches_logs",
  },
);

// Expire Indec
FailedBatchesLogsSchema.index({ expire_at: 1 }, { expireAfterSeconds: 1 });

FailedBatchesLogsSchema.index({ status: 1, queue_name: 1 }, { name: 'status_queue_name' });
FailedBatchesLogsSchema.index({ job_id: 1, }, { name: 'job_id' });

module.exports = mongoose.model("FailedBatchesLogs", FailedBatchesLogsSchema);
