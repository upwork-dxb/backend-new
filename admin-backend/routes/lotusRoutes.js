const express = require('express')
  , lotusValidator = require('../validator/lotusValidator')
  , lotusController = require('../controllers/lotusController')
const { cors } = require('../../utils');

module.exports = () => {
  const lotusRoutes = express.Router();
  lotusRoutes.post('/launchUrl', lotusValidator.launchUrl, lotusController.launchUrl);
  lotusRoutes.post('/launchInstantUrl', lotusValidator.launchInstantUrl, lotusController.launchInstantUrl);
  lotusRoutes.post('/lobbyUrl', lotusController.launchUrl);
  lotusRoutes.post('/abandoned', lotusController.abandoned);
  lotusRoutes.post('/getStatus', lotusController.getStatus);
  lotusRoutes.post('/resultDeclare', lotusController.resultDeclare);
  lotusRoutes.post('/retryResultDeclare', lotusValidator.retryResultDeclare, lotusController.retryResultDeclare);
  lotusRoutes.post('/manualResultDeclare', lotusValidator.manualResultDeclare, lotusController.manualResultDeclare);
  lotusRoutes.post('/getExposures', lotusController.getExposures);
  // lotusRoutes.post('/bets', lotusValidator.bets, lotusController.bets);
  lotusRoutes.post('/bets', lotusValidator.bets, lotusController.lotusBets);
  lotusRoutes.post('/bets/document', cors(), lotusValidator.lotusBetsDocument, lotusController.lotusBetsDocument);
  lotusRoutes.post('/betsCrDr', lotusValidator.lotusBetsCrDr, lotusController.lotusBetsCrDr);
  lotusRoutes.post('/betsCrDr/document', cors(), lotusValidator.lotusBetsCrDrDocument, lotusController.lotusBetsCrDrDocument);
  lotusRoutes.post('/bets/currentBets/document', cors(), lotusValidator.lotusBetsDocument, lotusController.lotusCurrentBetsDocument);
  lotusRoutes.post('/logs', lotusValidator.logs, lotusController.logs);
  lotusRoutes.post('/getRoundStatus', lotusValidator.getRoundStatus, lotusController.getRoundStatus);
  lotusRoutes.post('/clearExposure', lotusValidator.clearExposure, lotusController.clearExposure);
  lotusRoutes.post('/casinoResults', lotusValidator.casinoResults, lotusController.casinoResults);
  lotusRoutes.post('/casinoResults/document', cors(), lotusValidator.casinoResultsDocument, lotusController.casinoResultsDocument);
  return lotusRoutes;
};