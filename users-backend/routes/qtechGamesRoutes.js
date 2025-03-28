const express = require('express');
const qtechGamesController = require('../controllers/qtechGamesController');
const adminQtechGamesController = require('../../admin-backend/controllers/qtechGamesController');
const QtechGamesValidator = require('../validator/qtechGamesValidator');

//Routes for qtechGames 
module.exports = () => {
  const qtechGamesRoutes = express.Router();
  qtechGamesRoutes.post('/setQtechGameFavoriteUnFavorite', QtechGamesValidator.setQtechGameFavoriteUnFavorite, qtechGamesController.setQtechGameFavoriteUnFavorite);
  qtechGamesRoutes.get('/favoriteQtechGamesList', qtechGamesController.favoriteQtechGamesList);
  qtechGamesRoutes.get('/activeQtechGamesList', adminQtechGamesController.qtechGamesList);
  return qtechGamesRoutes;
};