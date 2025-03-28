const express = require('express')
  , BetController = require('../controllers/betController')
  , BetValidator = require('../validator/betValidator')
  , BetValidatorAdmin = require('../../admin-backend/validator/betValidator')
  , BetControllerAdmin = require('../../admin-backend/controllers/betController');

//Routes for bet 
module.exports = () => {
  const betRoutes = express.Router();
  betRoutes.post('/saveBet', BetController.saveBet);
  betRoutes.post('/saveHrBet', BetValidator.validateHorseRacingBet, BetController.saveHrBet);
  betRoutes.post('/saveFancyBet', BetController.saveFancyBet);
  betRoutes.post('/bets', BetController.bets);
  betRoutes.post('/plBets', BetController.plBets);
  betRoutes.post('/openBets', BetController.openBets);
  betRoutes.post('/diamondOpenBets', BetController.diamondOpenBets);
  betRoutes.post('/unmatchedBets', BetController.unmatchedBets);
  betRoutes.post('/settledBets', BetController.settledBets);
  betRoutes.post('/diamondSettledBets', BetController.diamondSettledBets);
  betRoutes.post('/voidBets', BetController.voidBets);
  betRoutes.post('/userSettledBetList', BetController.userSettledBetList);
  betRoutes.post('/getTeamPosition', BetController.getTeamPosition);
  betRoutes.post('/getFancyLiability', BetController.getFancyLiability);
  betRoutes.post('/getExposures', BetController.getExposures);
  betRoutes.post('/getExposuresV2', BetController.getExposuresV2);
  betRoutes.post('/cancelUnmatchedBet', BetControllerAdmin.cancelUnmatchedBet);
  betRoutes.post('/cancelUnmatchedBetAll', BetControllerAdmin.cancelUnmatchedBetAll);
  betRoutes.post('/marketAnalysis', BetController.marketAnalysis);
  betRoutes.post('/betResultDetails', BetValidatorAdmin.betResultDetails, BetControllerAdmin.betResultDetails);
  return betRoutes;
};