const { ObjectId } = require("bson");
const BetsOdds = require("../../../models/betsOdds");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
} = require("../../../utils/constants");

module.exports.getBetsEventTypesList = async (req) => {
  try {
    const filter = Filter(req);
    const query = Query(filter);
    const result = await Model(query);
    return resultResponse(result.statusCode, result.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

async function Model(query) {
  try {
    const result = await BetsOdds.aggregate(query).allowDiskUse(true);

    if (result.length) return resultResponse(SUCCESS, { data: result });
    else return resultResponse(NOT_FOUND, "No types available yet!");
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function Filter(req) {
  const { match_id } = req.joiData;
  const { User: Self } = req;
  const user_id = ObjectId(Self._id);
  const filter = {
    "parents.user_id": ObjectId(user_id),
    delete_status: {
      $in: [0, 2],
    },
    bet_result_id: null,
    match_id,
  };

  return filter;
}

function Query(filter) {
  return [
    { $match: filter },
    {
      $project: {
        market_type: 1,
        type: "market",
      },
    },
    {
      $unionWith: {
        coll: "bets_fancies",
        pipeline: [
          { $match: filter },
          {
            $project: {
              market_type: "$category_name",
              type: "fancy",
              category: 1,
              category_name: 1,
            },
          },
        ],
      },
    },
    {
      $group: {
        _id: "$market_type",
        type: { $first: "$type" },
        category: { $first: "$category" },
        category_name: { $first: "$category_name" },
      },
    },
    {
      $project: {
        _id: 0,
        event_type: "$_id",
        type: 1,
        category: 1,
        category_name: 1,
      },
    },
    {
      $sort: {
        category: 1,
      },
    },
  ];
}
