const express = require('express')
  , matchController = require('../controllers/matchController')
  , adminMatchController = require('../../admin-backend/controllers/matchController')
  , matchValidator = require('../../admin-backend/validator/matchValidator');

module.exports = (socket) => {
  const matchesRoutes = express.Router();
  new matchController(socket);
  matchesRoutes.post('/matches', adminMatchController.getMatches);
  matchesRoutes.post('/getMatches', adminMatchController.getMatches);
  matchesRoutes.post('/getCountryCodeList', adminMatchController.getOnlineMatch);
  matchesRoutes.post('/getCountryCodeListOpen', adminMatchController.getOnlineMatch);
  matchesRoutes.post('/getCountryCodeListOnly', adminMatchController.getOnlineMatch);
  matchesRoutes.post('/matchesList', adminMatchController.matchesList);
  matchesRoutes.post('/homeMatches', adminMatchController.homeMatches);
  matchesRoutes.post('/homeMatchesV2', adminMatchController.homeMatchesV2);
  matchesRoutes.get('/homeMatchesV2', adminMatchController.homeMatchesV2);
  matchesRoutes.post('/homeMatchesOpen', matchValidator.homeMatchesOpen, adminMatchController.homeMatchesOpen);
  matchesRoutes.get('/homeMatchesOpen', matchValidator.homeMatchesOpen, adminMatchController.homeMatchesOpen);
  matchesRoutes.post('/gethomeMatches', adminMatchController.homeMatches);
  matchesRoutes.post('/homeMatchesRunners', adminMatchController.homeMatchesRunners);
  matchesRoutes.post('/homeMatchesRunnersV2', adminMatchController.homeMatchesRunnersV2);
  matchesRoutes.post('/getMatchDetails', adminMatchController.matchDetails);
  matchesRoutes.post('/matchDetails', adminMatchController.matchDetails);
  matchesRoutes.post('/matchDetailsV2', adminMatchController.matchDetailsV2);
  matchesRoutes.post('/match-details', adminMatchController.matchDetailsCombine);
  matchesRoutes.post('/match-detailsV2', adminMatchController.matchDetailsCombineV2);
  matchesRoutes.post('/matchDetailsOpen', matchValidator.matchDetailsOpen, adminMatchController.matchDetailsOpen);
  matchesRoutes.post('/matchDetailsOpenV2', matchValidator.matchDetailsOpen, adminMatchController.matchDetailsOpen);
  matchesRoutes.get('/matchDetailsOpenV2', matchValidator.matchDetailsOpen, adminMatchController.matchDetailsOpen);
  matchesRoutes.post('/make-favourite', adminMatchController.makeFavourite);
  matchesRoutes.post('/matchDetailsRunners', adminMatchController.matchDetailsRunners);
  matchesRoutes.post('/matchDetailsRunnersV2', adminMatchController.matchDetailsRunnersV2);
  matchesRoutes.post('/getTvUrlScoreboardUrl', matchValidator.getTvUrlScoreboardUrl, adminMatchController.getTvUrlScoreboardUrl);
  return matchesRoutes;
};