const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the schema for the log collection
const UserSatckSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, required: true },
    gameButtons: [
      {
        label: { type: String, required: true },
        value: { type: Number, required: true },
        _id: false
      },
    ],
    casinoButtons: [
      {
        label: { type: String, required: true },
        value: { type: Number, required: true },
        _id: false
      },
    ],
    parent_level_ids: [{
      user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      user_name: { type: String, required: true, minLength: 3, maxLength: 30, trim: true },
      name: { type: String, required: true, minLength: 3, maxLength: 30 },
      user_type_id: { type: Number, required: true, min: 0, max: 100 },
      _id: false
    }],
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

UserSatckSchema.index({ user_id: 1 });

// Create the model using the schema
module.exports = mongoose.model("user_stack", UserSatckSchema);
