const express = require('express');
const adminFancyController = require('../../admin-backend/controllers/fancyController');
const adminFancyValidator = require('../../admin-backend/validator/fancyValidator');

//Routes for fancy 
module.exports = () => {
  const fancyRoutes = express.Router();
  fancyRoutes.post('/fancies', adminFancyValidator.getFanciesOpen, adminFancyController.getFanciesOpen);
  fancyRoutes.post('/fanciesV2', adminFancyValidator.getFanciesOpen, adminFancyController.getFanciesOpenV2);
  fancyRoutes.get('/fanciesV2', adminFancyValidator.getFanciesOpen, adminFancyController.getFanciesOpenV2);
  fancyRoutes.post('/getFancy', adminFancyController.getFancy);
  fancyRoutes.post('/getFancies', adminFancyValidator.getFancies, adminFancyController.getFancies);
  fancyRoutes.post('/getFanciesV2', adminFancyValidator.getFancies, adminFancyController.getFanciesV2);
  fancyRoutes.post('/get-fancies', adminFancyValidator.getFancies, adminFancyController.getFancyCombine);
  fancyRoutes.post('/get-fanciesV2', adminFancyValidator.getFancies, adminFancyController.getFancyCombineV2);
  fancyRoutes.post('/getFancyLiveData', adminFancyValidator.getFancyLiveData, adminFancyController.getFancyLiveData);
  fancyRoutes.post('/getFancyLiveDataV2', adminFancyValidator.getFancyLiveData, adminFancyController.getFancyLiveDataV2);
  fancyRoutes.post('/getFanciesLiveData', adminFancyController.getFanciesLiveData);
  fancyRoutes.post('/getRunTimeFancyPosition', adminFancyController.getRunTimeFancyPosition);
  return fancyRoutes;
};