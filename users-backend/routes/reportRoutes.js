const express = require('express');
const reportValidator = require('../validator/reportValidator');
const ReportController = require('../controllers/reportController');

//Routes for Reports
module.exports = () => {
  const reportRoutes = express.Router();
  reportRoutes.post('/eventsProfitLoss', reportValidator.eventsProfitLoss, ReportController.eventsProfitLoss);
  // Ukraine Concept
  reportRoutes.post('/userP_L', ReportController.userP_L);
  reportRoutes.post('/sportsP_L', ReportController.P_L);
  reportRoutes.post('/matchWiseP_L', ReportController.P_L);
  reportRoutes.post('/usersPLByMarket', ReportController.P_L);
  reportRoutes.post('/eventsStackAndCommission', ReportController.P_L);
  return reportRoutes;
};