const express = require('express')
  , SportsController = require('../controllers/sportsController')
  , adminSportsController = require('../../admin-backend/controllers/sportsController');

//Routes for sports 
module.exports = () => {
  const sportsRoutes = express.Router();
  sportsRoutes.get('/getAllSportsList', SportsController.getAllSportsList);
  sportsRoutes.post('/getAllActiveSports', SportsController.getAllActiveSports);
  sportsRoutes.post('/getJoinSportsList', SportsController.getJoinSportsList);
  sportsRoutes.post('/getSports', SportsController.getSports);
  sportsRoutes.post('/sports', adminSportsController.sports);
  return sportsRoutes;
};