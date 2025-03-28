const express = require('express');
const AdminBetController = require('../../admin-backend/controllers/betController');
const WebsiteSettingController = require('../../admin-backend/controllers/websiteController');
const Validator = require('../../admin-backend/validator/index');

module.exports = () => {

  const routes = express.Router();

  routes.post('/casino-exposures', AdminBetController.casinoExposures);
  routes.post('/qtech-exposures', Validator.qtechExposures, AdminBetController.qtechExposures);
  routes.get('/getCasinoConversionRate', WebsiteSettingController.getCasinoConversionRate);

  return routes;

};