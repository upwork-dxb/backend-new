const express = require('express')
  , EventsController = require('../controllers/eventsController')
  , EventValidator = require('../validator/eventValidator')
  , userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for fancy 
module.exports = () => {
  const eventRoutes = express.Router();
  eventRoutes.post('/lists', EventsController.getEvents);
  eventRoutes.post('/fancy-match-lists', EventsController.fancyMatchLists);
  eventRoutes.post('/getLimites', EventsController.getLimites);
  eventRoutes.post('/updateLimites', userActivityLogger, EventsController.updateLimites);
  eventRoutes.post('/getEventsLimit', EventsController.getEventsLimit);
  eventRoutes.post('/update', EventsController.update);
  eventRoutes.post('/block', userActivityLogger, EventValidator.block, EventsController.block);
  eventRoutes.post('/updateTVandScoreBoardURL', EventsController.updateTVandScoreBoardURL);
  eventRoutes.post('/getTVandScoreBoardURL', EventsController.getTVandScoreBoardURL);
  return eventRoutes;
};