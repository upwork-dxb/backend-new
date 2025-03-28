const express = require('express')
  , SeriesController = require('../controllers/seriesController')
  , adminSeriesController = require('../../admin-backend/controllers/seriesController')

//Routes for sports 
module.exports = () => {
  const SeriesRoutes = express.Router();
  SeriesRoutes.post('/getOnlineSeries', SeriesController.getOnlineSeries);
  SeriesRoutes.post('/getSeries', SeriesController.getSeries);
  SeriesRoutes.post('/series', adminSeriesController.series);
  return SeriesRoutes;
};