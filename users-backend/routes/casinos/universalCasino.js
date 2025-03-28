const express = require('express')
  , adminUniversalCasinoValidator = require('../../../admin-backend/validator/casinos/universalCasino')
  , adminUniversalCasinoController = require('../../../admin-backend/controllers/casinos/universalCasino')
  , universalCasinoValidator = require('../../validator/casinos/universalCasino')
  , universalCasinoController = require('../../controllers/casinos/universalCasino');

module.exports = () => {
  const routes = express.Router();
  routes.post('/launchUrl', adminUniversalCasinoValidator.launchUrl, adminUniversalCasinoController.launchUrl);
  routes.post('/lobbyUrl', adminUniversalCasinoController.launchUrl);
  routes.post('/auth', universalCasinoValidator.auth, universalCasinoController.auth);
  routes.post('/getBalance', universalCasinoController.getBalance);
  routes.post('/placeBet', universalCasinoValidator.placeBet, universalCasinoController.placeBet);
  routes.post('/settlements', universalCasinoController.settlements);
  return routes;
};