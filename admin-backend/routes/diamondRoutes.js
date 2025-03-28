const express = require('express')
  , diamondsController = require('../controllers/diamondsController');

module.exports = () => {
  const diamondRoutes = express.Router();
  diamondRoutes.post('/abandoned', diamondsController.abandoned);
  diamondRoutes.post('/resultDeclare', diamondsController.resultDeclare);
  return diamondRoutes;
};