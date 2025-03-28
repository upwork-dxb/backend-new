const express = require('express');
const qtechGamesController = require('../controllers/qtechGamesController');
const QtechGamesValidator = require('../validator/qtechGamesValidator');
const ContentService = require('../service/contentService');
const ContentController = require('../controllers/contentController')

//Routes for qtechGames 
module.exports = () => {
  const qtechGamesRoutes = express.Router();
  qtechGamesRoutes.post('/createQtechGame', QtechGamesValidator.createQtechGame, qtechGamesController.createQtechGame);
  qtechGamesRoutes.get('/qtechGamesList', qtechGamesController.qtechGamesList);
  qtechGamesRoutes.patch('/updateQtechGame', QtechGamesValidator.updateQtechGame, qtechGamesController.updateQtechGame);
  qtechGamesRoutes.delete('/deleteQtechGame', QtechGamesValidator.deleteQtechGame, qtechGamesController.deleteQtechGame);
  qtechGamesRoutes.post('/uploadQtechGameImage', ContentService.qtechGame.single('image'), qtechGamesController.validateContentFile,qtechGamesController.uploadQtechGameImage, ContentController.errorHandler);
  return qtechGamesRoutes;
};