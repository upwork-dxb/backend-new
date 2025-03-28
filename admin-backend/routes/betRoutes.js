const express = require('express')
  , BetController = require('../controllers/betController')
  , BetValidator = require('../validator/betValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger')
const { cors } = require('../../utils');

//Routes for bet 
module.exports = () => {
  const betRoutes = express.Router();
  betRoutes.post('/getTeamPosition', BetController.getTeamPosition);
  betRoutes.post('/getMarketsMaxLiability', BetController.getMarketsMaxLiability);
  betRoutes.post('/getFancyLiability', BetController.getFancyLiabilityBySharing);
  betRoutes.post('/getFanciesLiability', BetController.getFancyLiability);
  betRoutes.post('/getFancyLiabilityBySharing', BetController.getFancyLiabilityBySharing);
  betRoutes.post('/bets', BetController.bets);
  betRoutes.post('/openBets', BetController.openBets);
  betRoutes.post('/openBets/document', cors(), BetValidator.betsDocument, BetController.openBetsDocument);
  betRoutes.post('/unMatchedBets', BetController.unMatchedBets);
  betRoutes.post('/settledBets', BetController.settledBets);
  betRoutes.post('/fraudBets', BetController.fraudBets);
  betRoutes.post('/getMasterBetList', BetController.getMasterBetList);
  betRoutes.post('/diamondSettledBets', BetController.diamondSettledBets);
  betRoutes.post('/diamondSettledBets/document', cors(), BetValidator.betsDocument, BetController.diamondSettledBetsDocument);
  betRoutes.post('/deleteBet', userActivityLogger, BetValidator.deleteBet, BetController.deleteBet);
  betRoutes.post('/deleteBets', userActivityLogger, BetValidator.deleteBets, BetController.deleteBets);
  betRoutes.post('/cancelUnmatchedBet', BetController.cancelUnmatchedBet);
  betRoutes.post('/oddsResult', BetValidator.oddsResult, BetController.oddsResultV1);
  betRoutes.post('/oddsResultV2', BetController.oddsResult);
  betRoutes.post('/oddsRollback', BetController.oddsRollback);
  betRoutes.post('/oddsAbandoned', userActivityLogger, BetValidator.oddsAbandoned, BetController.oddsAbandoned);
  betRoutes.post('/sessionResult', BetValidator.sessionResult, BetController.sessionResult);
  betRoutes.post('/sessionResultV2', BetValidator.sessionResult, BetController.sessionResult);
  betRoutes.post('/fm/sessionResult', BetValidator.fmImportOrigin, BetValidator.sessionResult, BetController.sessionResult);
  betRoutes.post('/sessionRollback', BetValidator.sessionRollback, BetController.sessionRollback);
  betRoutes.post('/sessionRollbackV2', BetValidator.sessionRollback, BetController.sessionRollback);
  betRoutes.post('/fm/sessionRollback', BetValidator.fmImportOrigin, BetValidator.sessionRollback, BetController.sessionRollback);
  betRoutes.post('/sessionAbandoned', userActivityLogger, BetValidator.sessionAbandoned, BetController.sessionAbandoned);
  betRoutes.post('/fm/sessionAbandoned', BetValidator.fmImportOrigin, BetController.sessionAbandoned);
  betRoutes.post('/getExposure', BetController.getExposure);
  betRoutes.post('/getExposureV1', BetController.getExposure);
  betRoutes.post('/getExposureV2', BetController.getExposureV2);
  betRoutes.post('/getExposures', BetController.getExposures);
  betRoutes.post('/getExposuresV1', BetController.getExposures);
  betRoutes.post('/getExposuresV2', BetController.getExposuresV2);
  betRoutes.post('/getExposuresEventWise', BetValidator.getExposuresEventWise, BetController.getExposuresEventWise);
  betRoutes.post('/betResultDetails', BetValidator.betResultDetails, BetController.betResultDetails);
  betRoutes.post('/getBetsEventTypesList', BetValidator.getBetsEventTypesList, BetController.getBetsEventTypesList);
  betRoutes.post('/getResultProgress', BetValidator.getResultProgress, BetController.getResultProgress);
  betRoutes.post('/resetStruckResult', BetValidator.resetStruckResult, BetController.resetStruckResult);
  return betRoutes;
};