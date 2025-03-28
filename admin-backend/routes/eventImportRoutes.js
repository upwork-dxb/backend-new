const express = require('express')
  , eventImportController = require('../controllers/eventImportController');

module.exports = () => {
  const eventImportRoutes = express.Router();
  eventImportRoutes.get('/GetToken', eventImportController.validateIp, eventImportController.getTokenValidate, eventImportController.getToken);
  eventImportRoutes.post('/IsValidToken', eventImportController.validateIp, eventImportController.IsValidToken);
  eventImportRoutes.post('/SaveImportMarketData', eventImportController.validateIp, eventImportController.saveImportMarketData);
  eventImportRoutes.post('/formostEventImport', eventImportController.validateIp, eventImportController.formostEventImport);
  return eventImportRoutes;
};