const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the schema for the log collection
const UserActivitylogSchema = new Schema(
  {
    user_name: {
      type: String,
      required: true,
    },
    user_id: {
      type: String,
      required: true,
    },
    path: String,
    req: {
      headers: Object,
      data: {
        body: Object,
        query: Object,
      },
    },
    ip_details: Object,
    status: String,
    msg: String,
    expireAt: Date,
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

UserActivitylogSchema.index({ expireAt: 1 }, { expireAfterSeconds: 1 });
UserActivitylogSchema.index({ user_name: 1 });
UserActivitylogSchema.index({ user_id: 1 });
UserActivitylogSchema.index({ path: 1 });
UserActivitylogSchema.index({ "req.headers.origin": 1 });
UserActivitylogSchema.index({ "req.headers.host": 1 });
UserActivitylogSchema.index({
  "ip_details.ip": 1,
  "ip_details.city": 1,
  "ip_details.state": 1,
  "ip_details.country": 1,
  "ip_details.zipcode": 1,
  "ip_details.district": 1,
});

// Create the model using the schema
module.exports = mongoose.model("user_activity_log", UserActivitylogSchema);
