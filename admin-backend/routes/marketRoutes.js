const express = require('express')
  , marketController = require('../controllers/marketController')
  , marketValidator = require('../validator/marketValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for markets 
module.exports = () => {
  const marketRoutes = express.Router();
  marketRoutes.post('/createMarket', marketController.createMarket);
  marketRoutes.post('/fm/import', marketValidator.fmImportOrigin, marketController.createMarket);
  marketRoutes.post('/results', marketController.results);
  marketRoutes.post('/pending-markets', marketController.pendingMarkets);
  marketRoutes.post('/getResult', marketController.getResult);
  marketRoutes.post('/results-rollback', marketController.results);
  marketRoutes.post('/updateMarketStatus', userActivityLogger, marketValidator.updateMarketStatus, marketController.updateMarketStatus);
  marketRoutes.post('/getOnlineMarket', marketController.getOnlineMarket);
  marketRoutes.post('/getMarkets', marketController.getOnlineMarket);
  marketRoutes.post('/getRawEvents', marketController.getRawEvents);
  marketRoutes.post('/getMarketAgentUserPositions', marketController.getMarketAgentUserPositions);
  marketRoutes.post('/allRacingMarkets', marketController.allRacingMarkets);
  marketRoutes.post('/getMarketsByCountryCode', marketValidator.getMarketsByCountryCode, marketController.getMarketsByCountryCode);
  marketRoutes.post('/diamondUserBook', marketValidator.diamondUserBook, marketController.diamondUserBook);
  return marketRoutes;
};