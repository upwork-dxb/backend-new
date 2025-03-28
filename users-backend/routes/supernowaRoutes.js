const express = require('express')
  , supernowaController = require('../controllers/supernowaController')
  , { validateIp, validateUser, verifyPartnerKeyAndGames } = require("../service/supernowaService")

module.exports = () => {
  const supernowaRoutes = express.Router();
  supernowaRoutes.post('/auth', verifyPartnerKeyAndGames, supernowaController.auth);
  supernowaRoutes.post('/balance', validateIp, validateUser, supernowaController.balance);
  supernowaRoutes.post('/debit', validateIp, validateUser, verifyPartnerKeyAndGames, supernowaController.debit);
  supernowaRoutes.post('/credit', validateIp, validateUser, verifyPartnerKeyAndGames, supernowaController.credit);
  supernowaRoutes.post('/games', supernowaController.games);
  supernowaRoutes.post('/betLists', supernowaController.betLists);
  return supernowaRoutes;
};