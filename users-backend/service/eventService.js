const BetsOdds = require('../../models/betsOdds')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require("../../utils/constants")
  , eventQuery = require('./eventQuery')
  , { resultResponse } = require('../../utils/globalFunction');

let getEvents = (params) => {
  let query = eventQuery.events(params);
  return BetsOdds.aggregate(query).then(events => {
    if (events.length)
      return resultResponse(SUCCESS, events);
    else
      return resultResponse(NOT_FOUND, "No events found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

module.exports = {
  getEvents
}