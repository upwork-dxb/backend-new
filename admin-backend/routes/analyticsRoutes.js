const express = require('express')
  , analyticsController = require('../controllers/analyticsController')
  , analyticsValidator = require('../validator/analyticsValidator');

module.exports = () => {
  const analyticsRoutes = express.Router();
  analyticsRoutes.post('/userByBank', analyticsValidator.userByBankValidator, analyticsController.getUsersByBank);
  analyticsRoutes.post('/userByIPaddress', analyticsValidator.userByIPvalidator, analyticsController.getUserByIP);
  return analyticsRoutes;
};