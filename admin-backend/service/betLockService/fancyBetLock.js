const { resultResponse } = require("../../../utils/globalFunction");
const { lockUnlock, getBetLockList } = require('./betLock');

module.exports.betLock = async (req) => {

  const result = await fancyBetLock(req);

  return resultResponse(result.statusCode, result.data);

}

async function fancyBetLock(req) {

  const { match_id: event_id, category } = req.joiData;
  let updateFilter = { event_id, category };

  req.updateFilter = updateFilter;

  const result = await lockUnlock(req);

  return resultResponse(result.statusCode, result.data);

}

module.exports.getBetLockList = async (req) => {

  const { match_id: event_id, category } = req.joiData;
  const betLockFilter = { event_id, category };

  req.betLockFilter = betLockFilter;

  const result = await getBetLockList(req);

  return resultResponse(result.statusCode, result.data);

}