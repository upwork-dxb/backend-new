const express = require('express')
  , matchController = require('../controllers/matchController')
  , matchValidator = require('../validator/matchValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for matches 
module.exports = (socket) => {
  const matchesRoutes = express.Router();
  new matchController(socket);
  matchesRoutes.post('/createMatch', matchController.createMatch);
  matchesRoutes.post('/fm/import', matchValidator.fmImportOrigin, matchController.createMatch);
  matchesRoutes.post('/enableFancy', matchController.enableFancy);
  matchesRoutes.post('/updateMatchStatus', userActivityLogger, matchValidator.updateMatchStatus, matchController.updateMatchStatus);
  matchesRoutes.post('/getOnlineMatch', matchController.getOnlineMatch);
  matchesRoutes.post('/getMatches', matchController.getOnlineMatch);
  matchesRoutes.post('/matches', matchController.matches);
  matchesRoutes.post('/getCountryCodeList', matchController.getOnlineMatch);
  matchesRoutes.post('/getCountryCodeListOnly', matchController.getOnlineMatch);
  matchesRoutes.post('/matchesList', matchController.matchesList);
  matchesRoutes.post('/matchesListForFancy', matchController.matchesListForFancy);
  matchesRoutes.get('/matchesListForFancy', matchController.matchesListForFancy);
  matchesRoutes.post('/homeMatches', matchController.homeMatches);
  matchesRoutes.post('/homeMatchesV2', matchController.homeMatchesV2);
  matchesRoutes.get('/homeMatchesV2', matchController.homeMatchesV2);
  matchesRoutes.post('/homeMatchesOpen', matchValidator.homeMatchesOpen, matchController.homeMatchesOpen);
  matchesRoutes.get('/homeMatchesOpen', matchValidator.homeMatchesOpen, matchController.homeMatchesOpen);
  matchesRoutes.post('/homeMatchesRunners', matchController.homeMatchesRunners);
  matchesRoutes.post('/homeMatchesRunnersV2', matchController.homeMatchesRunnersV2);
  matchesRoutes.post('/matchDetails', matchController.matchDetails);
  matchesRoutes.post('/matchDetailsV2', matchController.matchDetailsV2);
  matchesRoutes.post('/matchDetailsRunners', matchController.matchDetailsRunners);
  matchesRoutes.post('/matchDetailsRunnersV2', matchController.matchDetailsRunnersV2);
  matchesRoutes.post('/matchDetailsOpen', matchValidator.matchDetailsOpen, matchController.matchDetailsOpen);
  matchesRoutes.post('/matchDetailsOpenV2', matchValidator.matchDetailsOpen, matchController.matchDetailsOpen);
  matchesRoutes.get('/matchDetailsOpenV2', matchValidator.matchDetailsOpen, matchController.matchDetailsOpen);
  matchesRoutes.post('/make-favourite', matchController.makeFavourite);
  matchesRoutes.post('/stopCasino', matchController.stopCasino);
  matchesRoutes.post('/flushCache', matchController.flushCache);
  matchesRoutes.post('/updateStreamingUrl', matchController.updateTVandScoreBoardURL);
  matchesRoutes.post('/updateStreamingUrlV1', matchController.updateTVandScoreBoardURLV1);
  matchesRoutes.post('/getTvUrlScoreboardUrl', matchValidator.getTvUrlScoreboardUrl, matchController.getTvUrlScoreboardUrl);
  matchesRoutes.post('/resetTVandScoreBoardURL', matchValidator.resetTVandScoreBoardURL, matchController.resetTVandScoreBoardURL);
  return matchesRoutes;
};