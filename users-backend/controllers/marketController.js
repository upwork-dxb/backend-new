const adminMarketController = require('../../admin-backend/controllers/marketController')

module.exports = {
  getRawEvents: function (req, res) {
    return adminMarketController.getRawEvents(req, res);
  }
}