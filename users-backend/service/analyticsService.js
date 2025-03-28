const analyticsQuery = require('./analyticsQueryService')
  , BetsOdds = require("../../models/betsOdds")
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction')


async function transactionalService(data) {
  let query = analyticsQuery.transactionalQuery(data)
  return BetsOdds.aggregate(query).then(transactionalQuery => {
    if (transactionalQuery) {
      if (transactionalQuery[0] == undefined) {
        bets = []
      } else {
        bets = transactionalQuery[0]
      }
      transactional = transactionalQuery.slice(1)
      return resultResponse(SUCCESS, { betsAndPlData: bets, transactionalData: transactional });
    } else
      return resultResponse(NOT_FOUND, "data not  found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

module.exports = {
  transactionalService,
}