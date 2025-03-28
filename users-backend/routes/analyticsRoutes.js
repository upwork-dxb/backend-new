const express = require('express')
  , analyticsController = require('../controllers/analyticsController')

module.exports = () => {
  const analyticsRoutes = express.Router();
  analyticsRoutes.post('/getTotalBetsWithPL', analyticsController.transactionalData);
  return analyticsRoutes;
};