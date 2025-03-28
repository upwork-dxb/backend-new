const express = require('express')
const BonusValidator = require('../validator/bonusValidator');
const BonusController = require('../controllers/bonusController');

//Routes for fancy 
module.exports = () => {
  const Routes = express.Router();
  Routes.post('/logs',BonusValidator.logs, BonusController.logs);
  return Routes;
};