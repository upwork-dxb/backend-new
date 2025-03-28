const express = require('express');
const WebsiteController = require('../controllers/websiteController');
const WebsiteSettingValidator = require('../validator/websiteSettingValidator');

//Routes for website settings
module.exports = () => {
  const websiteSettingRoutes = express.Router();
  websiteSettingRoutes.post('/createWebSiteSetting', WebsiteController.createNewWebsite);
  websiteSettingRoutes.get('/getAllWebsite', WebsiteController.getWebsiteList);
  websiteSettingRoutes.post('/updateWebsite/:id', WebsiteController.updateWebsite);
  websiteSettingRoutes.post('/deleteWebsiteDomain/:id', WebsiteController.deleteWebsiteDomain);
  websiteSettingRoutes.post('/checkWebsiteName', WebsiteController.checkWebsiteName);
  websiteSettingRoutes.post('/checkSiteTitleData', WebsiteController.checkSiteTitleData);
  websiteSettingRoutes.post('/searchDomains', WebsiteController.searchDomains);
  websiteSettingRoutes.post('/createThemeSetting', WebsiteController.createThemeSetting);
  websiteSettingRoutes.post('/getThemeSetting', WebsiteController.getThemeSettings);
  websiteSettingRoutes.post('/updateWebsiteTvUrlSetting', WebsiteController.updateWebsiteTvUrlSetting);
  websiteSettingRoutes.post('/updateDomainNewToOld', WebsiteSettingValidator.updateDomainNewToOld, WebsiteController.updateDomainNewToOld);
  websiteSettingRoutes.post('/getDomainWiseCounts', WebsiteSettingValidator.getDomainWiseCounts, WebsiteController.getDomainWiseCounts);
  websiteSettingRoutes.post('/updateCasinoConversionRate', WebsiteController.updateCasinoConversionRate);
  websiteSettingRoutes.post('/allowUnmatchedBet', WebsiteSettingValidator.allowUnmatchedBet, WebsiteController.verifyDomainIsExists, WebsiteController.allowUnmatchedBet);
  websiteSettingRoutes.post('/updateBonusAllowed', WebsiteSettingValidator.updateBonusAllowed, WebsiteController.assignField, WebsiteController.verifyDomainIsExists, WebsiteController.updateBonusAllowed);
  websiteSettingRoutes.post('/updateBonusData', WebsiteSettingValidator.updateBonusData, WebsiteController.assignField, WebsiteController.verifyDomainIsExists, WebsiteController.updateBonusData);
  websiteSettingRoutes.post(
    "/allowDiamondRateLimit",
    WebsiteSettingValidator.allowDiamondRateLimit,
    WebsiteController.assignField,
    WebsiteController.verifyDomainIsExists,
    WebsiteController.allowDiamondRateLimit
  );
  return websiteSettingRoutes;
};