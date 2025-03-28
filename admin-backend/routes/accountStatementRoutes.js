const express = require('express');
const AccountStatementController = require('../controllers/accountStatementController');
const AccountStatementValidator = require('../validator/accountStatementValidator');
const userActivityLogger = require('./middlewares/userActivityLogger');
const { cors } = require('../../utils');

//Routes for account statements 
module.exports = () => {
  const accountStatementRoutes = express.Router();
  accountStatementRoutes.post('/chipInOut', AccountStatementController.chipInOut);
  accountStatementRoutes.post('/chipInChipOutDiamond', AccountStatementValidator.chipInOutDiamond, AccountStatementController.chipInOutDiamond);
  accountStatementRoutes.post('/statements', AccountStatementValidator.statements, AccountStatementController.statements);
  accountStatementRoutes.post('/statements/document', cors(), AccountStatementValidator.statementsDocument, AccountStatementController.statementsDocument);
  accountStatementRoutes.post('/userAccountStatement', AccountStatementController.userAccountStatement);
  accountStatementRoutes.post('/makeSettlement', AccountStatementValidator.makeSettlement, userActivityLogger, AccountStatementController.makeSettlement);
  accountStatementRoutes.post('/makeSettlementV2', AccountStatementValidator.makeSettlement, userActivityLogger, AccountStatementController.makeSettlement);
  accountStatementRoutes.post('/makeSettlementDiamond', AccountStatementValidator.makeSettlementDiamond, userActivityLogger, AccountStatementController.makeSettlementDiamond);
  accountStatementRoutes.post('/makeSettlementDiamondMulti', AccountStatementValidator.makeSettlementDiamondMulti, userActivityLogger, AccountStatementController.makeSettlementDiamondMulti);
  accountStatementRoutes.get('/downloadStatementExcel', AccountStatementController.downloadStatementExcel);
  accountStatementRoutes.get('/downloadStatementsPdf', AccountStatementController.downloadStatementsPdf);
  return accountStatementRoutes;
};