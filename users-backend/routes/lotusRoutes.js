const express = require('express')
  , adminLotusValidator = require('../../admin-backend/validator/lotusValidator')
  , adminLotusController = require('../../admin-backend/controllers/lotusController')
  , lotusValidator = require('../validator/lotusValidator')
  , lotusController = require('../controllers/lotusController');

module.exports = () => {
  const lotusRoutes = express.Router();
  lotusRoutes.post('/launchUrl', adminLotusValidator.launchUrl, adminLotusController.launchUrl);
  lotusRoutes.post('/lobbyUrl', adminLotusController.validateLobbyUrl, adminLotusController.launchUrl);
  // Thease are extrenal call back url used by lotus.
  lotusRoutes.post('/auth', lotusValidator.auth, lotusController.auth);
  lotusRoutes.post('/exposure', lotusValidator.exposure, lotusController.exposure);
  lotusRoutes.post('/results', lotusValidator.results, lotusController.results);
  lotusRoutes.post('/refund', lotusController.refund);
  lotusRoutes.post('/getExposures', adminLotusController.getExposures);
  // lotusRoutes.post('/bets', lotusValidator.bets, adminLotusController.bets);
  lotusRoutes.post('/bets', lotusValidator.bets, adminLotusController.lotusBets);
  lotusRoutes.post('/launchInstantUrl', adminLotusValidator.launchInstantUrl, adminLotusController.launchInstantUrl);
  lotusRoutes.post('/casinoResults', adminLotusValidator.casinoResults, adminLotusController.casinoResults);
  return lotusRoutes;
};