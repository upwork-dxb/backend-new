const express = require('express')
  , EventsController = require('../controllers/eventsController');

//Routes for fancy 
module.exports = () => {
  const eventRoutes = express.Router();
  eventRoutes.post('/lists', EventsController.getEvents);
  eventRoutes.post('/getEventsLimit', EventsController.getEventsLimit);
  eventRoutes.post('/applyValidation', EventsController.applyValidation);
  return eventRoutes;
};