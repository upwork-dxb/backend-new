const { ObjectId } = require("bson");
const _ = require("lodash");
const moment = require("moment");
const FancyScorePosition = require("../../../models/fancyScorePosition");
const logger = require("../../../utils/loggers");
const utils = require("../../../utils");
const { resultResponse } = require("../../../utils/globalFunction");
const { createFancyLiability } = require("../fancyService");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_USER,
} = require("../../../utils/constants");

module.exports.getFancyAnalysis = async (req) => {
  const startTime = moment();
  const { calling, LOG_REF_CODE } = req.log;

  logger.info(`${LOG_REF_CODE} ${calling} Starting getFancyAnalysis`);

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
      user_type_id === USER_TYPE_USER ? "user_id" : "distribution.user_id"
    ] = ObjectId(user_id);

    // Get the start of the current day (UTC 00:00) for filtering matches from today
    // let today = new Date();
    // let from_date = new Date(today.setUTCHours(0, 0, 0, 0));

    // Add a condition to filter matches happening today onwards
    // filter["match_date"] = { $gte: from_date };

    // Ensure that only records with non-empty bets_fancies are considered
    filter["bets_fancies"] = { $ne: [] };

    // Prepare the MongoDB $match stage for aggregation query with the above filter
    let matchConditions = { $match: filter };

    // Get the fancy analysis query with appropriate conditions and user_id
    let query = getFancyAnalysisQuery(matchConditions, user_id);
    logger.info(`${LOG_REF_CODE} getFancyAnalysis query`, { filter });

    // Execute the aggregation pipeline query using FancyScorePosition model
    let result = await FancyScorePosition.aggregate(query);
    logger.info(`${LOG_REF_CODE} getFancyAnalysis Query result`, {
      recordsFound: result.length,
    });

    // Return a not found response if no data matches the query
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Fancy Analysis data not found!");
    }

    // If data is found, sort it by fancy_id in ascending order and return a formatted response
    const sortedData = _.orderBy(result, ["fancy_id"], ["asc"]);
    result = createFancyLiability({ analysis: true }, sortedData);

    // Generate the response with the analysis data
    return resultResponse(SUCCESS, result);
  } catch (error) {
    logger.error(`${LOG_REF_CODE} Error getFancyAnalysis ${error.stack}`);
    // Return server error with the error message in case of exceptions
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    logger.info(
      `${LOG_REF_CODE} getFancyAnalysis Execution Time: ${utils.getTimeTaken({ startTime })}`,
    );
  }
};

function getFancyAnalysisQuery(matchConditions, user_id) {
  return [
    matchConditions,
    {
      $set: {
        bets_fancies: {
          $map: {
            input: "$bets_fancies",
            as: "bets_fancies",
            in: {
              $mergeObjects: [
                "$$bets_fancies",
                {
                  per: {
                    $let: {
                      vars: {
                        dist: {
                          $arrayElemAt: [
                            "$distribution",
                            {
                              $indexOfArray: ["$distribution.user_id", user_id],
                            },
                          ],
                        },
                      },
                      in: "$$dist.share",
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: "$fancy_id",
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
        fancy_name: {
          $first: "$fancy_name",
        },
        fancy_id: {
          $first: "$fancy_id",
        },
        category: {
          $first: "$category",
        },
        event_name: {
          $first: "$fancy_name",
        },
        event_id: {
          $first: "$fancy_id",
        },
        type: {
          $first: 2,
        },
        type_name: {
          $first: "Fancy",
        },
        bets_fancies: {
          $push: "$bets_fancies",
        },
      },
    },
    {
      $addFields: {
        bets_fancies: {
          $reduce: {
            input: "$bets_fancies",
            initialValue: [],
            in: {
              $concatArrays: ["$$value", "$$this"],
            },
          },
        },
      },
    },
    {
      $set: {
        bets_fancies: {
          $sortArray: {
            input: "$bets_fancies",
            sortBy: {
              run: 1,
            },
          },
        },
        bets_fancies_size: {
          $size: "$bets_fancies",
        },
      },
    },
  ];
}
