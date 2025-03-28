const { resultResponse } = require("../../../utils/globalFunction");
const { lockUnlock, getBetLockList } = require('./betLock');

module.exports.betLock = async (req) => {

  const result = await marketBetLock(req);

  return resultResponse(result.statusCode, result.data);

}

async function marketBetLock(req) {

  const { market_id: event_id } = req.joiData;

  let updateFilter = { event_id };
  req.updateFilter = updateFilter;

  const result = await lockUnlock(req);

  return resultResponse(result.statusCode, result.data);

}

module.exports.getBetLockList = async (req) => {

  const { market_id: event_id } = req.joiData;
  const betLockFilter = { event_id };

  req.betLockFilter = betLockFilter;

  const result = await getBetLockList(req);

  return resultResponse(result.statusCode, result.data);

}