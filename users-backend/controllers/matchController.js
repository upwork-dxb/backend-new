const adminMatchController = require('../../admin-backend/controllers/matchController');

module.exports = class MatchController {

  constructor(io) {
    new adminMatchController(io);
  }
}