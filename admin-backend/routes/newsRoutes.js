const express = require('express')
  , newsController = require('../controllers/newsController');

//Routes for matches 
module.exports = () => {
  const matchesRoutes = express.Router();
  matchesRoutes.post('/create', newsController.create);
  matchesRoutes.post('/delete', newsController.delete);
  matchesRoutes.post('/getNews', newsController.getNews);
  return matchesRoutes;
};