// Models
const betCount = require("../../../models/betCount");

const redisClient = require("../../../connections/redisConnections");
const {
  BET_COUNT,
  UNIQUE_IDENTIFIER_KEY,
} = require("../../../utils/constants");

async function getAndSetBetCount({ user_name, match_id }) {

  const key = !match_id
    ? `${BET_COUNT}${user_name}:*${UNIQUE_IDENTIFIER_KEY}`
    : `${BET_COUNT}${user_name}:${match_id}:*${UNIQUE_IDENTIFIER_KEY}`;

  const keys = await redisClient.keys(key);

  if (keys.length) {
    const data = await redisClient.mget(...keys);
    return data.filter(i => i).map(i => JSON.parse(i));
  } else {
    const data = await betCount.aggregate([
      { $match: { "parent_ids.user_name": user_name } },
      {
        $group: {
          _id: { event_id: "$event_id", match_id: "$match_id" },
          bet_count: { $sum: "$bet_count" },
        }
      }
    ]);

    const resData = data.map(i => {
      const { _id, bet_count } = i;
      const { event_id, match_id } = _id;
      return { bet_count, event_id, match_id };
    })
    const dataToInsert = [];

    for (const item of resData) {
      const { bet_count, event_id, match_id } = item;

      const key = `${BET_COUNT}${user_name}:${match_id}:${event_id}${UNIQUE_IDENTIFIER_KEY}`;
      const data = JSON.stringify({ bet_count, match_id, event_id });

      dataToInsert.push(key, data);
    }

    if (dataToInsert.length)
      await redisClient.mset(...dataToInsert);

    return resData;
  }

}
module.exports = {
  getAndAppendBetCount: async function (user_name, result, type = undefined) {
    let betCountData = await getAndSetBetCount({ user_name });

    for (const item of result) {
      let foundItems = [];
      if (type == 'MARKET') {
        foundItems = betCountData.filter(
          (i) => i.event_id == item.market_id
        );
      } else if (type == 'FANCY') {
        foundItems = betCountData.filter(
          (i) => i.event_id == item.fancy_id
        );
      } else {
        foundItems = betCountData.filter(
          (i) => i.event_id == item.marketId || (item.match_id ? i.match_id == item.match_id : true)
        );
      }
      const betCount = foundItems.reduce((acc, item) => acc + (item?.bet_count || 0), 0);
      item.bet_count = betCount;
    }

  }
};
