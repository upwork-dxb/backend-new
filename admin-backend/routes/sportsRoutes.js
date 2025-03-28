const express = require('express');
const SportsController = require('../controllers/sportsController')
  , SportsValidator = require('../validator/sportsValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for sports 
module.exports = () => {
  const sportsRoutes = express.Router();
  sportsRoutes.post('/createNewSport', SportsController.createNewSport);
  sportsRoutes.post('/import', SportsController.import);
  sportsRoutes.get('/getAllSportsList', SportsController.getAllSportsList);
  sportsRoutes.get('/getUserSportsPartnerShipsDetails/:id', SportsController.getUserSportsPartnerShipsDetails);
  sportsRoutes.post('/getUserSportsWiseSettingDetails', SportsController.getUserSportsWiseSettingDetails);
  sportsRoutes.post('/updateSportWiseSettingDetails', SportsController.updateSportWiseSettingDetails);
  sportsRoutes.post('/updateSportsStatus', userActivityLogger, SportsValidator.updateSportsStatus, SportsController.updateSportsStatus);
  sportsRoutes.post('/getAllActiveSports', SportsController.getAllActiveSports);
  sportsRoutes.post('/getSports', SportsController.getSports);
  sportsRoutes.post('/blockEvents', SportsController.getSports);
  sportsRoutes.post('/sports', SportsController.sports);
  sportsRoutes.post('/userlock', SportsValidator.userlock, SportsController.getSports);
  sportsRoutes.post('/userlockV1', SportsValidator.userlock, SportsController.userLockV1);
  sportsRoutes.post('/getLiveCasinoSports', SportsController.getLiveCasinoSports);
  return sportsRoutes;
};