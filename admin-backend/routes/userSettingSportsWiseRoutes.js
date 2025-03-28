const express = require('express');
const userSettingSportsWiseController = require('../controllers/userSettingSportsWiseController')
  , UserSettingsValidator = require('../validator/userSettingsValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for sports 
module.exports = () => {
  const userSettingSportsWiseRoutes = express.Router();
  userSettingSportsWiseRoutes.post('/update', userActivityLogger, userSettingSportsWiseController.update);
  userSettingSportsWiseRoutes.post('/getSportsWise', userSettingSportsWiseController.getSportsWise);
  userSettingSportsWiseRoutes.post('/update-commission', userActivityLogger, UserSettingsValidator.updateCommission, userSettingSportsWiseController.updateCommission);
  return userSettingSportsWiseRoutes;
};