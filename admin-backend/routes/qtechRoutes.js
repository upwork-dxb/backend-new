const express = require('express')
  , qtechValidator = require('../validator/qtechValidator')
  , qtechValidatorUser = require('../../users-backend/validator/qtechValidator')
  , qtechController = require('../controllers/qtechController');

module.exports = () => {
  const qtechRoutes = express.Router();
  qtechRoutes.post('/generateAccessToken', qtechController.generateAccessToken);
  qtechRoutes.get('/getAccessToken', qtechController.getAccessToken);
  qtechRoutes.get('/checkAccessTokenStatus', qtechController.checkAccessTokenStatus);
  qtechRoutes.delete('/revokeAccessToken', qtechController.revokeAccessToken);
  qtechRoutes.get('/gameList', qtechValidator.gameList, qtechController.gameList);
  qtechRoutes.get('/all/sports', qtechController.getSports);
  qtechRoutes.get('/providersByCurrency', qtechController.providersByCurrency);
  qtechRoutes.get('/providers', qtechController.providers);
  qtechRoutes.post('/resultDeclare', qtechValidator.resultDeclare, qtechController.resultDeclare);
  qtechRoutes.post('/resultsDeclare', qtechController.resultsDeclare);
  qtechRoutes.post('/pendingResults', qtechController.getPendingResults);
  qtechRoutes.post('/resettleBalance', qtechController.resettleBalance);
  qtechRoutes.post('/updateProviderCurrency', qtechValidator.updateProviderCurrency, qtechController.updateProviderCurrency);
  qtechRoutes.post('/playerHistory', qtechValidator.playerHistory, qtechController.playerHistory);
  qtechRoutes.post('/lobbyUrl', qtechValidatorUser.validateAccount, qtechController.lobbyUrl);
  qtechRoutes.post('/launchUrl', qtechValidatorUser.launchUrl, qtechValidatorUser.verifyProvider, qtechValidatorUser.validateAccount, qtechController.launchUrl);
  return qtechRoutes;
};