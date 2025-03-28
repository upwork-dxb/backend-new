const express = require('express')
  , supernowaController = require('../controllers/supernowaController')
  , userSupernowaController = require('../../users-backend/controllers/supernowaController');

module.exports = () => {
  const supernowaRoutes = express.Router();
  supernowaRoutes.post('/resultDeclare', supernowaController.resultDeclare);
  supernowaRoutes.post('/download-logs', supernowaController.downloadLogs);
  supernowaRoutes.get('/download', supernowaController.download);
  supernowaRoutes.post('/betLists', userSupernowaController.betLists);
  supernowaRoutes.post('/games', userSupernowaController.games);
  return supernowaRoutes;
}