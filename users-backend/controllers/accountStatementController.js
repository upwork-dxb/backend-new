const adminAccountStatementController = require('../../admin-backend/controllers/accountStatementController');

module.exports = class AccountStatementController {

  static statements(req, res) {
    return adminAccountStatementController.statements(req, res);
  }
}