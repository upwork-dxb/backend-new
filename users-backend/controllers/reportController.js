const adminReportController = require('../../admin-backend/controllers/reportController');

module.exports = {
  eventsProfitLoss: function (req, res) {
    req.body.is_user = true;
    return adminReportController.eventsProfitLoss(req, res);
  },
  // Ukraine Concept
  userP_L: (req, res) => adminReportController.downlineP_L(req, res),
  P_L: (req, res) => {
    req.is_user = true;
    adminReportController.P_L(req, res);
  }
}