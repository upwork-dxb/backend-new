const { ObjectId } = require("bson");
const { isObjectIdOrHexString } = require("mongoose");

// Models
const Market = require("../../../models/market");
const OddsProfitLoss = require('../../../models/oddsProfitLoss');

const {
  VALIDATION_ERROR,
  SUCCESS,
  SERVER_ERROR
} = require("../../../utils/constants");
const { resultResponse } = require('../../../utils/globalFunction');
const { fixFloatingPoint } = require('../../../utils')

function userBookQuery({
  market_id,
  user_id,
  agent_ids_to_exclued
}) {
  // return [
  //   {
  //     $match: {
  //       market_id,
  //       "win_loss_distribution.user_id": ObjectId(user_id),
  //       is_active: true,
  //     }
  //   },
  //   {
  //     $unwind: {
  //       path: "$win_loss_distribution",
  //       includeArrayIndex: "index"
  //     }
  //   },
  //   {
  //     $match: {
  //       "win_loss_distribution.user_id": {
  //         $nin: agent_ids_to_exclued
  //       }
  //     }
  //   },
  //   {
  //     $sort: {
  //       "win_loss_distribution.index": 1
  //     }
  //   },
  //   {
  //     $group: {
  //       _id: {
  //         user_id: "$user_id",
  //         selection_id: "$selection_id"
  //       },
  //       user_id: {
  //         $first: "$user_id"
  //       },
  //       user_name: {
  //         $first: "$user_name"
  //       },
  //       domain_name: {
  //         $first: "$domain_name"
  //       },
  //       match_date: {
  //         $first: "$match_date"
  //       },
  //       market_id: {
  //         $first: "$market_id"
  //       },
  //       selection_id: {
  //         $first: "$selection_id"
  //       },
  //       selection_name: {
  //         $first: "$selection_name"
  //       },
  //       sort_priority: {
  //         $first: "$sort_priority"
  //       },
  //       user_pl: {
  //         $first: "$user_pl"
  //       },
  //       user_commission_pl: {
  //         $first: "$user_commission_pl"
  //       },
  //       win_value: {
  //         $first: "$win_value"
  //       },
  //       loss_value: {
  //         $first: "$loss_value"
  //       },
  //       win_loss: {
  //         $first: "$win_loss"
  //       },
  //       win_loss_distribution: {
  //         $push: {
  //           user_id:
  //             "$win_loss_distribution.user_id",
  //           win_loss:
  //             "$win_loss_distribution.win_loss",
  //           p_l: "$win_loss_distribution.p_l",
  //           user_name:
  //             "$win_loss_distribution.user_name",
  //           user_type_id:
  //             "$win_loss_distribution.user_type_id",
  //           index: "$win_loss_distribution.index"
  //         }
  //       }
  //     }
  //   },
  //   {
  //     $addFields: {
  //       user_type_id: 1
  //     }
  //   }
  // ];

  return [
    {
      $match: {
        market_id,
        "win_loss_distribution.user_id": ObjectId(user_id),
        is_active: true
      }
    },
    {
      $addFields: {
        win_loss_distribution: {
          $let: {
            vars: {
              dist: "$win_loss_distribution",
              indices: {
                $filter: {
                  input: {
                    $range: [
                      0,
                      {
                        $size:
                          "$win_loss_distribution"
                      }
                    ]
                  },
                  as: "idx",
                  cond: {
                    $in: [
                      {
                        $arrayElemAt: [
                          "$win_loss_distribution.user_id",
                          { $add: ["$$idx", 1] }
                        ]
                      },
                      [
                        ObjectId(user_id)
                      ]
                    ]
                  }
                }
              }
            },
            in: {
              $filter: {
                input: "$$dist",
                as: "item",
                cond: {
                  $gt: [
                    {
                      $indexOfArray: [
                        "$$dist",
                        "$$item"
                      ]
                    },
                    {
                      $max: "$$indices"
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    {
      $project: {
        user_id: 1,
        user_name: 1,
        selection_name: 1,
        win_loss: 1,
        user_type_id: { $toInt: "1" },
        "win_loss_distribution.user_id": 1,
        "win_loss_distribution.user_name": 1,
        "win_loss_distribution.user_type_id": 1,
        "win_loss_distribution.win_loss": 1,
        "win_loss_distribution.index": 1
      }
    }
  ]
}

function getNestedValue(obj, keys) {
  // Used to fetch the Object based on the Keys Array, If not found then return undefined
  return keys.reduce((acc, key) => acc?.[key], obj);
}

function updateNestedValue(obj, keys, newValue) {
  let current = obj;

  keys.slice(0, -1).forEach((key) => {
    current[key] = current[key] || {}; // Ensure intermediate objects exist
    current = current[key];
  });

  // Update the final key's value
  current[keys[keys.length - 1]] = newValue;
}

function updateUserMap(
  userMap,
  win_loss_distribution,
  user_data,
  type = 'AGENT',
) {
  // Extract key from User_data
  const { user_id, user_name, user_type_id, selectionKey, win_loss } =
    user_data;

  // Get Parent Users Ids from
  const parentsUserIds = win_loss_distribution.map((i) => i.user_id);

  // Get Previous Obj for that User from UserMap, If not found returs undefined
  const previousObj = getNestedValue(userMap, parentsUserIds) || {};

  const updatedObj = {
    ...previousObj,
    type,
    user_id,
    user_name,
    user_type_id,
    [selectionKey]: fixFloatingPoint((previousObj[selectionKey] || 0) + win_loss),
  };

  // Set the Updated/New Object in the UserMap
  updateNestedValue(userMap, parentsUserIds, updatedObj);
}

function buildHierarchy(inputArray) {
  const userMap = {};

  // Iterate through the Input Array
  inputArray.forEach((item) => {

    const { user_id, selection_name, win_loss_distribution } = item;

    // Create Select Key
    const selectionKey = selection_name.toLowerCase().replace(/\s+/g, "_");

    // Iterate through Win Loss Distribution
    win_loss_distribution.forEach((win_loss_item, index) => {

      const upper_win_loss = win_loss_distribution.slice(0, index + 1);

      // Create or Update the agents data in "UserMap"
      updateUserMap(userMap, upper_win_loss, {
        ...win_loss_item,
        selectionKey,
      });
    });

    // Create or Update the user data in "UserMap"
    updateUserMap(
      userMap,
      [...win_loss_distribution, { user_id }],
      { ...item, selectionKey },
      "USER"
    );
  });

  return formatData(userMap);
}

function formatData(userMap, obj = { agents: [] }) {
  if (!userMap) return obj;

  Object.entries(userMap).forEach(([key, user]) => {
    if (!isObjectIdOrHexString(key)) return;

    // Filter non-ObjectId keys from user object
    const userObj = Object.entries(user)
      .filter(([userKey]) => !isObjectIdOrHexString(userKey))
      .reduce((acc, [userKey, value]) => {
        acc[userKey] = value;
        return acc;
      }, {});

    obj.agents.push({
      ...userObj,
      ...formatData(user), // Recursive call for nested agents
    });
  });

  obj = {
    agents: obj.agents.sort((a, b) =>  b.user_type_id - a.user_type_id),
  }

  return obj;
}

module.exports = {
  diamondUserBook: async function (req) {
    try {
      const { User: Self, joiData: { market_id } } = req;
      const user_id = Self._id;

      const market = await Market.findOne({ market_id }).select(["runners.selection_name"]).exec();

      if (!market) {
        return resultResponse(VALIDATION_ERROR, {
          msg: "No Market Found!!",
        });
      }

      const oddsProfitLossData = await OddsProfitLoss.aggregate(userBookQuery({
        market_id,
        user_id,
        agent_ids_to_exclued: Self.parent_level_ids.map(i => ObjectId(i.user_id)),
      }));

      let response = buildHierarchy(oddsProfitLossData);
      if (response.agents.length) {
        response = response.agents[0];
      }
      return resultResponse(SUCCESS, {
        msg: "User Book Fetched Successfully !!",
        data: response,
        metadata: {
          selections: market.runners.map(data => data.selection_name),
          selections_inner: market.runners.map(data => data.selection_name.toLowerCase().replace(/\s+/g, "_"))
        }
      });
    } catch (error) {
      return resultResponse(SERVER_ERROR, { msg: error.message })
    }
  },
};
