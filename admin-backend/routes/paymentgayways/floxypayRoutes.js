const express = require('express')
const webhook = require('../../paymentgateways/floxypay/webhook');
const payout = require('../../paymentgateways/floxypay/payout');
const paymentStatus = require('../../paymentgateways/floxypay/paymentStatus');
const statement = require('../../paymentgateways/floxypay/statement');

module.exports = () => {
  const floxyPayRoutes = express.Router();
  floxyPayRoutes.post('/deposit-webhook', webhook.webhook);
  floxyPayRoutes.post('/withdraw-webhook', payout.payout);
  floxyPayRoutes.get('/payment-status', paymentStatus.paymentStatus);
  floxyPayRoutes.get('/statements', statement.statements);
  floxyPayRoutes.post('/checkTransactionStatus', statement.checkTransactionStatus);
  return floxyPayRoutes;
};