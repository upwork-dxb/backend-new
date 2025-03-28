const moment = require("moment");
const { ObjectId } = require("bson");
const OddsProfitLoss = require("../../../models/oddsProfitLoss");
const utils = require("../../../utils");
const logger = require("../../../utils/loggers");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_USER,
} = require("../../../utils/constants");

async function getLiability(params) {
  const startTime = moment(); // Start timer for execution time measurement
  const executionTime = utils.getTimeTaken({ startTime }); // Calculate the time taken
  try {
    let query = getFullLiabilityQuery(params);

    let result = await OddsProfitLoss.aggregate(query).allowDiskUse(true);

    if (!result.length) {
      return resultResponse(NOT_FOUND, "No Liability found!");
    }

    logger.info(`getLiability Execution Time: ${executionTime}`);

    return resultResponse(SUCCESS, result);
  } catch (error) {
    // Log the error and return a server error response
    logger.error(`Error getLiability ${error.stack}`);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

module.exports.getLiability = getLiability;

async function getExposuresEventWise(req) {
  try {
    // Extract parameters with default fallback
    const { user_id: reqUserId, event_id = true } = req?.joiData || {};
    const user_id = ObjectId(reqUserId || req.User.user_id || req.User._id);
    const user_type_id = reqUserId
      ? req.user.user_type_id
      : req.User.user_type_id;

    // Fetch liability data
    const liabilityResponse = await getLiability({
      user_ids: [user_id],
      user_type_id,
      event_id,
    });

    if (liabilityResponse.statusCode !== SUCCESS) {
      // Return error response if fetching liabilities fails
      return resultResponse(liabilityResponse.statusCode, {
        msg: liabilityResponse.data,
      });
    }

    let exposures = liabilityResponse.data;
    const result = {};

    // Calculate totals if event_id is true
    if (event_id === true) {
      getExposuresEventWiseWrapper(exposures, result);
    }

    // Attach exposures data to the result
    result.data = exposures;

    // Return successful response
    return resultResponse(SUCCESS, result);
  } catch (error) {
    // Log detailed error and return server error response
    logger.error(
      `Error in getExposuresEventWise: ${error.message}\n${error.stack}`,
    );
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

function getExposuresEventWiseWrapper(exposures, result) {
  // Sort exposures by liability in ascending order
  exposures.sort((a, b) => a.liability - b.liability);

  // Aggregate liability and liability share
  const totals = exposures.reduce(
    (acc, { liability, liability_share }) => {
      acc.liability += liability;
      acc.liability_share += liability_share;
      return acc;
    },
    { liability: 0, liability_share: 0 }, // Initial accumulator values
  );

  // Attach totals to the result
  result.total_liability = totals.liability;
  result.total_liability_share = totals.liability_share;
}

module.exports.getExposuresEventWise = getExposuresEventWise;

// Gettings total liability agents wise of markets and fancy.
function getFullLiabilityQuery({ user_ids, user_type_id, event_id }) {
  const isEndUser = user_type_id == USER_TYPE_USER;
  let filterMarket = isEndUser
    ? {
        user_id: {
          $in: user_ids,
        },
        sort_priority: 1,
      }
    : {
        "win_loss_distribution.user_id": {
          $in: user_ids,
        },
      };
  let filterFancy = isEndUser
    ? {
        user_id: {
          $in: user_ids,
        },
      }
    : {
        "distribution.user_id": {
          $in: user_ids,
        },
      };
  if (typeof event_id === "string") {
    filterMarket = {
      ...filterMarket,
      market_id: event_id,
    };
    filterFancy = {
      ...filterFancy,
      fancy_id: event_id,
    };
  }

  const groupData = event_id
    ? {
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
        market_id: {
          $first: "$market_id",
        },
        market_name: {
          $first: "$market_name",
        },
      }
    : {};
  return [
    {
      $match: {
        ...filterMarket,
        is_active: true,
        is_demo: false,
      },
    },
    ...(isEndUser
      ? []
      : [
          {
            $addFields: {
              win_loss_distribution: {
                $first: {
                  $filter: {
                    input: "$win_loss_distribution",
                    as: "item",
                    cond: { $in: ["$$item.user_id", user_ids] },
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
                user_id: "$win_loss_distribution.user_id",
              },
              market_id: { $first: "$market_id" },
              win_loss: {
                $sum: "$win_loss_distribution.win_loss",
              },
              max_liability: { $sum: "$max_liability" },
              max_liability_full: { $sum: "$win_loss" },
              user_id: {
                $first: "$win_loss_distribution.user_id",
              },
              ...groupData,
            },
          },
          {
            $group: {
              _id: {
                market_id: "$market_id",
                user_id: "$user_id",
              },
              market_id: { $first: "$market_id" },
              win_loss: { $min: "$win_loss" },
              max_liability: { $first: "$max_liability" },
              max_liability_full: { $max: "$max_liability_full" },
              user_id: {
                $first: "$user_id",
              },
              ...groupData,
            },
          },
          {
            $group: {
              _id: event_id ? "$market_id" : "$user_id",
              market_id: { $first: "$market_id" },
              win_loss: {
                $sum: {
                  $cond: [{ $lt: ["$win_loss", 0] }, "$win_loss", 0],
                },
              },
              max_liability: { $sum: "$max_liability" },
              max_liability_full: { $sum: "$max_liability_full" },
              user_id: {
                $first: "$user_id",
              },
              ...groupData,
            },
          },
        ]),
    {
      $project: {
        _id: event_id ? "$market_id" : isEndUser ? "$user_id" : "$user_id",
        ...(event_id
          ? {
              sport_id: 1,
              sport_name: 1,
              series_id: 1,
              series_name: 1,
              match_id: 1,
              match_name: 1,
              match_date: 1,
              event_id: "$market_id",
              event_name: "$market_name",
              type: "Market",
            }
          : {}),
        liability: {
          $round: ["$max_liability", 2],
        },
        liability_full: isEndUser
          ? {
              $round: ["$max_liability_full", 2],
            }
          : {
              $multiply: [
                {
                  $round: ["$max_liability_full", 2],
                },
                -1,
              ],
            },
        liability_share: {
          $round: [isEndUser ? "$max_liability" : "$win_loss", 2],
        },
      },
    },
    {
      $unionWith: {
        coll: "fancy_score_positions",
        pipeline: [
          {
            $match: {
              ...filterFancy,
              is_active: true,
              is_demo: false,
            },
          },
          ...(isEndUser
            ? []
            : [
                {
                  $addFields: {
                    distribution: {
                      $first: {
                        $filter: {
                          input: "$distribution",
                          as: "item",
                          cond: { $in: ["$$item.user_id", user_ids] },
                        },
                      },
                    },
                  },
                },
              ]),
          {
            $project: {
              _id: event_id
                ? "$fancy_id"
                : isEndUser
                  ? "$user_id"
                  : "$distribution.user_id",
              ...(event_id
                ? {
                    sport_id: 1,
                    sport_name: 1,
                    series_id: 1,
                    series_name: 1,
                    match_id: 1,
                    match_name: 1,
                    match_date: 1,
                    event_id: "$fancy_id",
                    event_name: "$fancy_name",
                    type: "Fancy",
                  }
                : {}),
              liability: {
                $round: ["$liability", 2],
              },
              liability_full: isEndUser
                ? {
                    $round: ["$liability", 2],
                  }
                : {
                    $multiply: [
                      {
                        $round: ["$profit", 2],
                      },
                      -1,
                    ],
                  },
              liability_share: {
                $round: [
                  {
                    $divide: [
                      {
                        $multiply: [
                          isEndUser
                            ? "$liability"
                            : {
                                $multiply: [
                                  {
                                    $sum: "$bets_fancies.profit",
                                  },
                                  -1,
                                ],
                              },
                          isEndUser ? 100 : "$distribution.share",
                        ],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
            },
          },
        ],
      },
    },
    {
      $group: {
        _id: "$_id",
        ...(event_id
          ? {
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
                $first: "$event_id",
              },
              event_name: {
                $first: "$event_name",
              },
              type: {
                $first: "$type",
              },
            }
          : {}),
        liability: {
          $sum: { $round: ["$liability", 2] },
        },
        liability_full: {
          $sum: { $round: ["$liability_full", 2] },
        },
        liability_share: {
          $sum: { $round: ["$liability_share", 2] },
        },
      },
    },
    // {
    //   $sort: { match_date: 1, _id: 1, }
    // },
  ];
}

module.exports.getLiabilityUserList = async (users) => {
  let user_ids = users
    .filter((data) => data.user_type_id != USER_TYPE_USER)
    .map((data) => data.user_id);

  if (user_ids.length) {
    let agentLiability = await getLiability({ user_ids });
    if (agentLiability.statusCode == SUCCESS) {
      agentLiability = agentLiability.data;
    } else {
      agentLiability = [];
    }
    if (agentLiability) {
      for (const user of users) {
        let exposure = agentLiability.find(
          (data) => data._id.toString() == user.user_id.toString(),
        );
        if (exposure) {
          user.exposure = exposure?.liability;
          user.exposure_share = exposure?.liability_share;
        }
      }
    }
  }
};
