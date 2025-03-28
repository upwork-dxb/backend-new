const { ObjectId } = require("bson");
const moment = require("moment");
const OddsProfitLoss = require("../../../models/oddsProfitLoss");
const logger = require("../../../utils/loggers");
const { resultResponse } = require("../../../utils/globalFunction");
const utils = require("../../../utils");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_USER,
} = require("../../../utils/constants");

module.exports.getMarketAnalysis = async (req) => {
  const startTime = moment();
  const { calling, LOG_REF_CODE } = req.log;

  logger.info(`${LOG_REF_CODE} ${calling} Starting getMarketAnalysis`);

  try {
    var { user_id } = req.joiData;
    const { User: Self, user: Child } = req;

    // Convert user_id to ObjectId if it's a valid string representation
    var user_id = ObjectId(user_id || Self.user_id || Self._id);
    var user_type_id = user_id ? Child.user_type_id : Self.user_type_id;

    // Initialize the filter object to only consider active users and filter by user_id in distribution
    let filter = {
      is_active: true,
    };

    filter[
      user_type_id === USER_TYPE_USER
        ? "user_id"
        : "win_loss_distribution.user_id"
    ] = ObjectId(user_id);

    // Create the match stage for aggregation based on the filter.
    const matchConditions = { $match: filter };

    // Generate the aggregation pipeline query using the market query service.
    const query = getMarketAnalysisQuery(matchConditions, user_id, user_type_id);
    logger.info(`${LOG_REF_CODE} getMarketAnalysis query`, { filter });

    // Execute the aggregation query on the 'OddsProfitLoss' collection.
    const result = await OddsProfitLoss.aggregate(query);

    logger.info(`${LOG_REF_CODE} getMarketAnalysis Query result`, {
      recordsFound: result.length,
    });

    // If no results are found, return a "not found" response.
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Market Analysis data not found!");
    }

    // Sort the results by sport_id, match_id, and team_id in ascending order.
    const sortedData = result.sort(
      (a, b) =>
        a.sport_id - b.sport_id ||
        a.match_id - b.match_id ||
        a.team_sort_priority - b.team_sort_priority,
    );

    // Return the successful response with the sorted data.
    return resultResponse(SUCCESS, sortedData);
  } catch (error) {
    logger.error(`${LOG_REF_CODE} Error getMarketAnalysis ${error.stack}`);
    // Log the error for debugging purposes and return a server error response.
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    logger.info(
      `${LOG_REF_CODE} getMarketAnalysis Execution Time: ${utils.getTimeTaken({ startTime })}`,
    );
  }
};

function getMarketAnalysisQuery(matchConditions, user_id, user_type_id) {
  return [
    matchConditions,
    {
      $addFields: {
        win_loss_distribution: {
          $first: {
            $filter: {
              input: "$win_loss_distribution",
              as: "item",
              cond: {
                $eq: ["$$item.user_id", user_id],
              },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: {
          market_id: "$market_id",
          selection_id: "$selection_id",
        },
        sport_id: {
          $first: "$sport_id",
        },
        sport_name: {
          $first: "$sport_name",
        },
        series_id: {
          $first: "$series_id",
        },
        series_name: {
          $first: "$series_name",
        },
        match_id: {
          $first: "$match_id",
        },
        match_name: {
          $first: "$match_name",
        },
        match_date: {
          $first: "$match_date",
        },
        event_id: {
          $first: "$market_id",
        },
        event_name: {
          $first: "$market_name",
        },
        event_type: {
          $first: "$market_type",
        },
        team_id: {
          $first: "$selection_id",
        },
        team_name: {
          $first: "$selection_name",
        },
        team_sort_priority: {
          $first: "$sort_priority",
        },
        win_loss: {
          $sum: {
            $round: [user_type_id == USER_TYPE_USER ? "$win_loss" : "$win_loss_distribution.win_loss", 2],
          },
        },
        win_loss_total_exposure: {
          $sum: {
            $multiply: [
              {
                $round: ["$win_loss", 2],
              },
              -1,
            ],
          },
        },
        type: {
          $first: 1,
        },
        type_name: {
          $first: "market",
        },
      },
    },
    {
      $project: {
        _id: 0,
        sport_id: 1,
        sport_name: 1,
        series_id: 1,
        series_name: 1,
        match_id: 1,
        match_name: 1,
        match_date: 1,
        event_id: 1,
        event_name: 1,
        event_type: 1,
        team_id: 1,
        team_name: 1,
        team_sort_priority: 1,
        win_loss: {
          $round: ["$win_loss", 2],
        },
        win_loss_total_exposure: {
          $round: ["$win_loss_total_exposure", 2],
        },
        type: 1,
        type_name: 1,
      },
    },
  ];
}
