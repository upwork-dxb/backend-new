const express = require('express')
  , qtechValidator = require('../validator/qtechValidator')
  , qtechController = require('../../admin-backend/controllers/qtechController');

module.exports = () => {
  const qtechRoutes = express.Router();
  qtechRoutes.get('/gameList', qtechValidator.gameList, qtechController.gameList);
  qtechRoutes.get('/all/sports', qtechController.getSports);
  qtechRoutes.get('/providers', qtechController.providers);
  qtechRoutes.post('/lobbyUrl', qtechValidator.validateAccount, qtechController.lobbyUrl);
  qtechRoutes.post('/launchUrl', qtechValidator.launchUrl, qtechValidator.verifyProvider, qtechValidator.validateAccount, qtechController.launchUrl);
  qtechRoutes.post('/playerHistory', qtechValidator.playerHistory, qtechController.playerHistory);
  return qtechRoutes;
};