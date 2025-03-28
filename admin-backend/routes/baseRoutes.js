const express = require('express');
const BetController = require('../controllers/betController');
const { getCurrencies } = require('../../utils');
const Validator = require('../validator/index');

module.exports = () => {
  const baseRoutes = express.Router();
  baseRoutes.post('/resetDemoUsersData', BetController.resetDemoUsersData);
  baseRoutes.post('/casino-exposures', BetController.casinoExposures);
  baseRoutes.post('/qtech-exposures', Validator.qtechExposures, BetController.qtechExposures);
  baseRoutes.get('/getCurrencyList', getCurrencies);
  baseRoutes.post('/event-analysis', Validator.eventAnalysis, BetController.eventAnalysis);
  return baseRoutes;
};