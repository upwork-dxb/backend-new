const express = require('express');
const GlobalSettingController = require('../controllers/globalSettingController');

//Routes for global setting 
module.exports = () => {
  const globalSettingRoutes = express.Router();
  globalSettingRoutes.post('/createGlobalSetting', GlobalSettingController.createGlobalSetting);
  globalSettingRoutes.post('/createApiUrlSetting', GlobalSettingController.createApiUrlSetting);
  globalSettingRoutes.get('/updateUseSocketStatus', GlobalSettingController.updateUseSocketStatus);
  globalSettingRoutes.get('/getGlobalSettingDetails', GlobalSettingController.getGlobalSettingDetails);
  globalSettingRoutes.get('/getSocketStatus', GlobalSettingController.getSocketStatus);
  globalSettingRoutes.post('/updateSocketStatus', GlobalSettingController.updateSocketStatus);
  globalSettingRoutes.post('/updateApiUrlSetting', GlobalSettingController.updateApiUrlSetting);
  globalSettingRoutes.post('/updateGlobalSettings', GlobalSettingController.updateGlobalSettings);
  return globalSettingRoutes;
};