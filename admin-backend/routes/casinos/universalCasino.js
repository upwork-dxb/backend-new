const express = require('express')
  , universalCasinoValidator = require('../../validator/casinos/universalCasino')
  , universalCasinoController = require('../../controllers/casinos/universalCasino');

module.exports = () => {
  const routes = express.Router();
  routes.post('/generateAccessToken', universalCasinoController.generateAccessToken);
  routes.get('/checkAccessTokenStatus', universalCasinoController.checkAccessTokenStatus);
  routes.post('/launchUrl', universalCasinoValidator.launchUrl, universalCasinoController.launchUrl);
  routes.post('/lobbyUrl', universalCasinoController.launchUrl);
  routes.post('/retryResultDeclare', universalCasinoValidator.retryResultDeclare, universalCasinoController.retryResultDeclare);
  routes.post('/manualResultDeclare', universalCasinoValidator.manualResultDeclare, universalCasinoController.manualResultDeclare);
  routes.post('/getRoundStatus', universalCasinoValidator.getRoundStatus, universalCasinoController.getRoundStatus);
  routes.post('/voidResult', universalCasinoValidator.voidResult, universalCasinoController.voidResult);
  routes.post('/getRoundsList', universalCasinoController.getRoundsList);
  routes.post('/logs', universalCasinoValidator.logs, universalCasinoController.logs);
  return routes;
};