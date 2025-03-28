const express = require('express');
const ReportController = require('../controllers/reportController');
const ReportValidator = require('../validator/reportValidator')
const { cors } = require('../../utils');

//Routes for Reports 
module.exports = () => {
  const reportRoutes = express.Router();
  reportRoutes.post('/settlementReport', ReportValidator.settlementReportV2, ReportController.settlementReportV2);
  reportRoutes.post('/settlementReportV2', ReportValidator.settlementReportV2, ReportController.settlementReportV2);
  reportRoutes.post('/settlementCollectionHistory', ReportValidator.settlementCollectionHistory, ReportController.settlementCollectionHistory);
  reportRoutes.post('/settlementCollectionHistoryV2', ReportValidator.settlementCollectionHistory, ReportController.settlementCollectionHistory);
  reportRoutes.post('/eventsProfitLoss', ReportValidator.eventsProfitLoss, ReportController.eventsProfitLoss);
  reportRoutes.post('/sportsWiseUsersPL', ReportController.sportsWiseUsersPL);
  reportRoutes.post('/downlineP_L', ReportController.downlineP_L);
  reportRoutes.post('/sportsP_L', ReportController.P_L);
  reportRoutes.post('/matchWiseP_L', ReportController.P_L);
  reportRoutes.post('/usersPLByMarket', ReportController.P_L);
  reportRoutes.post('/getTotalReport', ReportValidator.getReportStatements, ReportController.getReportStatements);
  reportRoutes.post('/getSportsLivePlDashboard', ReportValidator.getSportsLivePlDashboard, ReportController.sportsPL);
  reportRoutes.post('/sportsWiseOnlyPL', ReportController.sportsWiseOnlyPL);
  reportRoutes.post('/userAuthList', ReportValidator.userAuthList, ReportController.userAuthList);
  reportRoutes.post('/ptsReport', ReportValidator.ptsReport, ReportController.ptsReport);
  reportRoutes.post('/turn-over', ReportValidator.turnover, ReportController.turnover);
  reportRoutes.post('/partywinLossReport', ReportValidator.partywinLossReport, ReportController.partywinLossReport);
  reportRoutes.post('/partywinLossReport/document', cors(), ReportValidator.partywinLossReportDocument, ReportController.partywinLossReportDocument);
  reportRoutes.post('/userAuthList/document', cors(), ReportValidator.userAuthListDocument, ReportController.userAuthListDocument);
  reportRoutes.post('/turn-over/document', cors(), ReportValidator.turnoverDocument, ReportController.turnoverDocument);
  return reportRoutes;
};