const express = require('express')
  , GlobalSettingController = require('../controllers/globalSettingController');

//Routes for global setting 
module.exports = () => {
  const globalSettingRoutes = express.Router();
  globalSettingRoutes.get('/getGlobalSettingDetails', GlobalSettingController.getGlobalSettingDetails);
  globalSettingRoutes.get('/getSocketStatus', GlobalSettingController.getSocketStatus);
  return globalSettingRoutes;
};