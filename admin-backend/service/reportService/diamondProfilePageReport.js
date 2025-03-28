const { ObjectId } = require("bson");
const moment = require("moment");
const UserProfitLoss = require("../../../models/userProfitLoss");
const utils = require("../../../utils");
const logger = require("../../../utils/loggers");
const { resultResponse } = require("../../../utils/globalFunction");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  USER_TYPE_USER,
  LIVE_SPORTS,
  RACING_SPORTS,
  MANUAL_CASINOS_IDS,
  QT,
} = require("../../../utils/constants");

// Retrieves a paginated list of users with specific filtering and aggregation.
module.exports.ptsReport = async (req) => {
  const startTime = moment(); // Start timer for execution time measurement
  const LOG_REF_CODE = utils.generateUUID(); // Unique log reference for this operation

  try {
    const query = Query(req); // Generate the aggregation query

    let result = (await UserProfitLoss.aggregate(query))[0];

    if (!Object.keys(result).length) {
      return resultResponse(SUCCESS, {
        data: {
          casino: 0,
          sports: 0,
          third_party: 0,
        },
      });
    }

    const executionTime = utils.getTimeTaken({ startTime }); // Calculate the time taken
    logger.info(
      `${LOG_REF_CODE} ptsReport Execution Time: ${executionTime}`, // Log execution time
    );

    result = {
      casino: result.casino || 0,
      sports: result.sports || 0,
      third_party: result.third_party || 0,
    };
    return resultResponse(SUCCESS, { data: result });
  } catch (error) {
    // Log the error and return a server error response
    logger.error(`${LOG_REF_CODE} Error ptsReport ${error.stack}`);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
};

function Query(req) {
  const { user: Child } = req;
  if (Child.user_type_id == USER_TYPE_USER) {
    return userQuery(Child);
  } else {
    return agentQuery(Child);
  }
}

function userQuery(user) {
  const user_id = user.user_id || user._id;
  return [
    {
      $match: {
        user_id: ObjectId(user_id),
      },
    },
    {
      $facet: {
        casino: [
          {
            $match: {
              sport_id: {
                $in: MANUAL_CASINOS_IDS,
              },
            },
          },
          {
            $group: {
              _id: null,
              points: {
                $sum: {
                  $add: ["$user_pl", "$user_commission_pl"],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              points: {
                $round: ["$points", 2],
              },
            },
          },
        ],
        sports: [
          {
            $match: {
              sport_id: {
                $in: [...LIVE_SPORTS, ...RACING_SPORTS],
              },
            },
          },
          {
            $group: {
              _id: null,
              points: {
                $sum: {
                  $add: ["$user_pl", "$user_commission_pl"],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              points: {
                $round: ["$points", 2],
              },
            },
          },
        ],
        third_party: [
          {
            $match: {
              casinoProvider: QT,
            },
          },
          {
            $group: {
              _id: null,
              points: {
                $sum: {
                  $add: ["$user_pl", "$user_commission_pl"],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              points: {
                $round: ["$points", 2],
              },
            },
          },
        ],
      },
    },
    {
      $project: {
        casino: {
          $first: "$casino.points",
        },
        sports: {
          $first: "$sports.points",
        },
        third_party: {
          $first: "$third_party.points",
        },
      },
    },
  ];
}

function agentQuery(user) {
  const user_id = user.user_id || user._id;
  return [
    {
      $match: {
        "agents_pl_distribution.user_id": ObjectId(user_id),
      },
    },
    {
      $addFields: {
        agents_pl_distribution: {
          $first: {
            $filter: {
              input: "$agents_pl_distribution",
              as: "item",
              cond: {
                $eq: ["$$item.user_id", ObjectId(user_id)],
              },
            },
          },
        },
      },
    },
    {
      $facet: {
        casino: [
          {
            $match: {
              sport_id: {
                $in: MANUAL_CASINOS_IDS,
              },
            },
          },
          {
            $group: {
              _id: null,
              points: {
                $sum: {
                  $add: [
                    "$agents_pl_distribution.p_l",
                    "$agents_pl_distribution.commission",
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              points: {
                $round: ["$points", 2],
              },
            },
          },
        ],
        sports: [
          {
            $match: {
              sport_id: {
                $in: [...LIVE_SPORTS, ...RACING_SPORTS],
              },
            },
          },
          {
            $group: {
              _id: null,
              points: {
                $sum: {
                  $add: [
                    "$agents_pl_distribution.p_l",
                    "$agents_pl_distribution.commission",
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              points: {
                $round: ["$points", 2],
              },
            },
          },
        ],
        third_party: [
          {
            $match: {
              casinoProvider: QT,
            },
          },
          {
            $group: {
              _id: null,
              points: {
                $sum: {
                  $add: [
                    "$agents_pl_distribution.p_l",
                    "$agents_pl_distribution.commission",
                  ],
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              points: {
                $round: ["$points", 2],
              },
            },
          },
        ],
      },
    },
    {
      $project: {
        casino: {
          $first: "$casino.points",
        },
        sports: {
          $first: "$sports.points",
        },
        third_party: {
          $first: "$third_party.points",
        },
      },
    },
  ];
}
