const mongoose = require('mongoose')
  , Schema = mongoose.Schema;

// Qtech Game Schema
const qtechGameSchema = new mongoose.Schema({
  id: String,
  name: String,
  slug: String,
  provider: {
    id: String,
    name: String,
  },
  category: String,
  images: [],
  image_url: String,
  is_active: { type: Number, default: 0 },
  games_order: { type: Number, default: 0 },
  userFavorites: [{ type: String }],
}, {
  versionKey: false, // This will disable the __v field
});

module.exports = mongoose.model('qtech_game', qtechGameSchema);