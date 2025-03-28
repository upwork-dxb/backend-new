const express = require('express')
const deposit = require('../../../admin-backend/paymentgateways/floxypay/deposit');
const withdrawal = require('../../../admin-backend/paymentgateways/floxypay/withdrawal');
const statement = require('../../../admin-backend/paymentgateways/floxypay/statement');

module.exports = () => {
  const floxyPayRoutes = express.Router();
  floxyPayRoutes.post('/deposit', deposit.generateOrder);
  floxyPayRoutes.post('/withdrawal', withdrawal.withdrawToAccount);
  floxyPayRoutes.get('/statements', statement.statements);
  floxyPayRoutes.post('/checkPaymentStatus', statement.checkPaymentStatus);
  floxyPayRoutes.post('/checkTransactionStatus', statement.checkTransactionStatus);
  return floxyPayRoutes;
};