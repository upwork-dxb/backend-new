const express = require('express');
const AccountStatementController = require('../../admin-backend/controllers/accountStatementController');
const AccountStatementValidator = require('../../admin-backend/validator/accountStatementValidator');

//Routes for account statements 
module.exports = () => {
  const accountStatementRoutes = express.Router();
  accountStatementRoutes.post('/statements', AccountStatementValidator.statements, AccountStatementController.statements);
  accountStatementRoutes.post('/userAccountStatement', AccountStatementValidator.statements, AccountStatementController.userAccountStatement);
  accountStatementRoutes.get('/downloadStatementExcel', AccountStatementController.downloadStatementExcel);
  accountStatementRoutes.get('/downloadStatementsPdf', AccountStatementController.downloadStatementsPdf);
  return accountStatementRoutes;
};