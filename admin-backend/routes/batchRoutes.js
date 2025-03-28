const express = require('express');
const batchValidator = require('../validator/batchValidator');
const batchController = require('../controllers/batchController');

module.exports = () => {
  const batchRoutes = express.Router();
  batchRoutes.post('/getBatchesList', batchValidator.getBatchesList, batchController.getBatchesList);
  batchRoutes.post('/processBatch', batchValidator.processBatch, batchController.processBatch);
  return batchRoutes;
};