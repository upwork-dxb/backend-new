const express = require('express');
const Controller = require('../controllers/betLockController');
const Validator = require('../validator/betLockValidator');

module.exports = () => {
  const routes = express.Router();
  routes.post('/betLock', Validator.betLock, Controller.betLock);
  routes.post('/getBetLockList', Validator.getBetLockList, Controller.getBetLockList);
  return routes;
};