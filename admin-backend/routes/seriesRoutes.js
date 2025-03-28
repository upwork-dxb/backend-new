const express = require('express')
  , SeriesController = require('../controllers/seriesController')
  , SeriesValidator = require('../validator/seriesValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for series 
module.exports = () => {
  const seriesRoutes = express.Router();
  // seriesRoutes.post('/createSeries', SeriesController.createSeries);
  seriesRoutes.post('/createSeries', SeriesValidator.createSeries, SeriesController.createSeriesV1);
  seriesRoutes.post('/fm/import', SeriesValidator.createSeries, SeriesValidator.fmImportOrigin, SeriesController.createSeriesV1);
  seriesRoutes.post('/updateSeriesStatus', userActivityLogger, SeriesValidator.updateSeriesStatus, SeriesController.updateSeriesStatus);
  seriesRoutes.post('/updateSeriesStatusV1', SeriesController.updateSeriesStatusV1);
  seriesRoutes.post('/getOnlineSeries', SeriesController.getOnlineSeries);
  seriesRoutes.post('/getJoinSeriessList', SeriesController.getJoinSeriessList);
  seriesRoutes.post('/getSeries', SeriesController.getSeries);
  seriesRoutes.post('/series', SeriesController.series);
  seriesRoutes.post('/getSeriesV1', SeriesController.getSeriesV1);
  return seriesRoutes;
};