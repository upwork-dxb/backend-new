const express = require('express')
  , adminMarketController = require('../../admin-backend/controllers/marketController')
  , marketValidator = require('../validator/marketValidator');

//Routes for markets 
module.exports = () => {
  const marketRoutes = express.Router();
  marketRoutes.post('/getRawEvents', adminMarketController.getRawEvents);
  marketRoutes.post('/allRacingMarkets', adminMarketController.allRacingMarkets);
  marketRoutes.post('/allRacingMarketsOpen', adminMarketController.allRacingMarkets);
  marketRoutes.post('/getMarketsByCountryCode', marketValidator.getMarketsByCountryCode, adminMarketController.getMarketsByCountryCode);
  marketRoutes.post('/getMarketsByCountryCodeOpen', marketValidator.getMarketsByCountryCode, adminMarketController.getMarketsByCountryCodeOpen);
  return marketRoutes;
};