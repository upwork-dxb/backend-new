const express = require('express')
  , newsController = require('../../admin-backend/controllers/newsController');

//Routes for matches 
module.exports = () => {
  const matchesRoutes = express.Router();
  matchesRoutes.post('/getNews', newsController.getNews);
  return matchesRoutes;
};