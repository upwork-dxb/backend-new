const express = require('express');
const FancyController = require('../controllers/fancyController');
const FancyValidator = require('../validator/fancyValidator');

//Routes for fancy 
module.exports = () => {
  const fancyRoutes = express.Router();
  fancyRoutes.post('/createFancy', FancyController.createFancy);
  fancyRoutes.post('/updateFancyById', FancyController.updateFancyById);
  fancyRoutes.post('/updateFancy', FancyController.updateFancy);
  fancyRoutes.post('/updateFancyOrder', FancyValidator.updateFancyOrder, FancyController.updateFancyOrder);
  fancyRoutes.post('/getFancy', FancyController.getFancy);
  fancyRoutes.post('/getFancies', FancyValidator.getFancies, FancyController.getFancies);
  fancyRoutes.post('/getFanciesV2', FancyValidator.getFancies, FancyController.getFanciesV2);
  fancyRoutes.post('/get-fancies', FancyValidator.getFancies, FancyController.getFancyCombine);
  fancyRoutes.post('/get-fanciesV2', FancyValidator.getFancies, FancyController.getFancyCombineV2);
  fancyRoutes.post('/fancies', FancyValidator.getFanciesOpen, FancyController.getFanciesOpen);
  fancyRoutes.post('/fanciesV2', FancyValidator.getFanciesOpen, FancyController.getFanciesOpenV2);
  fancyRoutes.get('/fanciesV2', FancyValidator.getFanciesOpen, FancyController.getFanciesOpenV2);
  fancyRoutes.post('/getFancyLiveData', FancyValidator.getFancyLiveData, FancyController.getFancyLiveData);
  fancyRoutes.post('/getFancyLiveDataV2', FancyValidator.getFancyLiveData, FancyController.getFancyLiveDataV2);
  fancyRoutes.post('/getFanciesLiveData', FancyController.getFanciesLiveData);
  fancyRoutes.post('/updateFancyStatus', FancyController.updateFancyStatus);
  fancyRoutes.post('/getOnlineApiFancy', FancyController.getOnlineApiFancy);
  fancyRoutes.post('/getRunTimeFancyPosition', FancyController.getRunTimeFancyPosition);
  fancyRoutes.post('/getRunTimeFancyPositionV1', FancyController.getRunTimeFancyPositionV1);
  fancyRoutes.get('/getMatchesForResult', FancyController.getMatchesForResult);
  fancyRoutes.post('/fancyStake', FancyController.fancyStake);
  fancyRoutes.post('/fancyStakeUsersWise', FancyController.fancyStakeUsersWise);
  fancyRoutes.post('/fancyTotalStakeUsersWise', FancyController.fancyTotalStakeUsersWise);
  fancyRoutes.post('/results', FancyController.results);
  fancyRoutes.post('/fm/results', FancyController.results);
  fancyRoutes.post('/getResult', FancyController.getResult);
  fancyRoutes.post('/getFanciesCategory', FancyValidator.getFanciesCategory, FancyController.getFanciesCategory);
  return fancyRoutes;
};