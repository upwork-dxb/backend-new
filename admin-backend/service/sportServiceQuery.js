const {
  RACING_SPORTS,
  LIVE_GAME_SPORT_ID,
  DIAMOND_CASINO_SPORT_ID,
} = require("../../utils/constants");
module.exports = {
  getAgentSports: function (parentIds, user_id, sports_permission) {
    return [
      {
        $match: {
          sport_id: {
            $in: sports_permission.map((data) => data.sport_id),
          },
        },
      },
      {
        $lookup: {
          from: "deactivesports",
          localField: "sport_id",
          foreignField: "sport_id",
          as: "deactivesports",
        },
      },
      {
        $addFields: {
          is_created: "1",
          from_db: "1",
        },
      },
      {
        $project: {
          user_id: 1,
          is_manual: 1,
          sport_id: 1,
          name: 1,
          is_created: 1,
          from_db: 1,
          is_active: {
            $cond: [
              {
                $in: [user_id, "$deactivesports.user_id"],
              },
              "0",
              "1",
            ],
          },
          b_id: {
            $ifNull: ["$deactivesports.user_id", null],
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          sport_id: {
            $first: "$sport_id",
          },
          is_manual: {
            $first: "$is_manual",
          },
          name: {
            $first: "$name",
          },
          is_created: {
            $first: "$is_created",
          },
          from_db: {
            $first: "$from_db",
          },
          is_active: {
            $first: "$is_active",
          },
          b_id: {
            $first: "$b_id",
          },
        },
      },
      {
        $match: {
          b_id: {
            $nin: parentIds,
          },
        },
      },
      {
        $project: {
          _id: 0,
          sport_id: 1,
          name: 1,
          is_active: 1,
          is_manual: 1,
          is_created: 1,
          from_db: 1,
        },
      },
      {
        $sort: { order_by: 1, sport_id: -1 },
      },
    ];
  },
  userLockV1: function ({ user_id }) {
    const currectDate = new Date(new Date().setUTCHours(0, 0, 0, 0));
    return [
      {
        $match: {
          is_active: 1,
          is_visible: true,
          is_abandoned: 0,
          is_result_declared: 0,
          sport_id: {
            $nin: [LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID],
          },
          match_date: {
            $gte: currectDate,
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $addFields: {
          type: "market",
          series_id: {
            $cond: [
              {
                $in: ["$sport_id", RACING_SPORTS],
              },
              "$country_code",
              "$series_id",
            ],
          },
          series_name: {
            $cond: [
              {
                $in: ["$sport_id", RACING_SPORTS],
              },
              "$country_code",
              "$series_name",
            ],
          },
          match_date: "$market_start_time",
        },
      },
      {
        $unionWith: {
          coll: "fancies",
          pipeline: [
            {
              $match: {
                match_date: {
                  $gte: currectDate,
                },
                is_active: 1,
                is_visible: true,
                is_result_declared: 0,
              },
            },
            {
              $group: {
                _id: {
                  category: "$category",
                  match_id: "$match_id",
                },
                market_id: {
                  $first: "$fancy_id",
                },
                market_name: {
                  $first: "$category_name",
                },
                market_type: {
                  $first: "$category_name",
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
                category: {
                  $first: "$category",
                },
                parent_blocked: {
                  $addToSet: "$parent_blocked",
                },
                self_blocked: {
                  $addToSet: "$self_blocked",
                },
                fancy_count: {
                  $count: {},
                },
              },
            },
            {
              $project: {
                market_id: 1,
                market_name: 1,
                market_type: 1,
                sport_id: 1,
                sport_name: 1,
                series_id: 1,
                series_name: 1,
                match_id: 1,
                match_name: 1,
                match_date: 1,
                fancy_count: 1,
                category: 1,
                type: "fancy",
                parent_blocked: {
                  $reduce: {
                    input: "$parent_blocked",
                    initialValue: [],
                    in: {
                      $concatArrays: ["$$value", "$$this"],
                    },
                  },
                },
                self_blocked: {
                  $reduce: {
                    input: "$self_blocked",
                    initialValue: [],
                    in: {
                      $concatArrays: ["$$value", "$$this"],
                    },
                  },
                },
              },
            },
            {
              $match: {
                fancy_count: {
                  $gt: 1,
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          "is_blocked_by_parent": {
            "$cond": [
              {
                "$in": [
                  user_id.toString(),
                  "$parent_blocked"
                ]
              },
              true,
              false
            ]
          },
          "is_blocked_by_self": {
            "$cond": [
              {
                "$in": [
                  user_id.toString(),
                  "$self_blocked"
                ]
              },
              true,
              false
            ]
          }
        }
      },
      {
        $group: {
          _id: {
            sport_id: "$sport_id",
            series_id: "$series_id",
            match_id: "$match_id",
          },
          match_name: {
            $first: "$match_name",
          },
          series_name: {
            $first: "$series_name",
          },
          sport_id: {
            $first: "$sport_id",
          },
          sport_name: {
            $first: "$sport_name",
          },
          match_date: {
            $first: "$match_date",
          },
          match_is_blocked_by_parent: { "$push": "$is_blocked_by_parent" },
          match_is_blocked_by_self: { "$push": "$is_blocked_by_self" },
          count: {
            $count: {},
          },
          markets: {
            $push: {
              market_id: "$market_id",
              market_name: "$market_name",
              market_type: "$market_type",
              match_date: "$match_date",
              type: "$type",
              category: "$category",
              match_id: "$match_id",
              "is_blocked_by_parent": "$is_blocked_by_parent",
              "is_blocked_by_self": "$is_blocked_by_self"
            },
          },
        },
      },
      {
        $addFields: {
          "is_blocked_by_parent": {
            "$cond": {
              "if": {
                "$allElementsTrue": "$match_is_blocked_by_parent"
              },
              "then": true,
              "else": false
            }
          },
          "is_blocked_by_self": {
            "$cond": {
              "if": {
                "$allElementsTrue": "$match_is_blocked_by_self"
              },
              "then": true,
              "else": false
            }
          }
        },
      },
      {
        $group: {
          _id: {
            sport_id: "$_id.sport_id",
            series_id: "$_id.series_id",
          },
          match_name: {
            $first: "$match_name",
          },
          series_name: {
            $first: "$series_name",
          },
          sport_name: {
            $first: "$sport_name",
          },
          "series_is_blocked_by_parent": {
            "$push": "$match_is_blocked_by_parent"
          },
          "series_is_blocked_by_self": {
            "$push": "$match_is_blocked_by_self"
          },
          count: {
            $count: {},
          },
          matches: {
            $push: {
              match_id: "$_id.match_id",
              match_name: "$match_name",
              match_date: "$match_date",
              "is_blocked_by_parent": "$is_blocked_by_parent",
              "is_blocked_by_self": "$is_blocked_by_self",
              count: "$count",
              Match: "$markets",
            },
          },
        },
      },
      {
        $addFields: {
          "is_blocked_by_parent": {
            "$cond": {
              "if": {
                "$allElementsTrue": {
                  "$reduce": {
                    "input": "$series_is_blocked_by_parent",
                    "initialValue": [],
                    "in": {
                      "$concatArrays": [
                        "$$value",
                        "$$this"
                      ]
                    }
                  }
                }
              },
              "then": true,
              "else": false
            }
          },
          "is_blocked_by_self": {
            "$cond": {
              "if": {
                "$allElementsTrue": {
                  "$reduce": {
                    "input": "$series_is_blocked_by_self",
                    "initialValue": [],
                    "in": {
                      "$concatArrays": [
                        "$$value",
                        "$$this"
                      ]
                    }
                  }
                }
              },
              "then": true,
              "else": false
            }
          }
        },
      },
      {
        $sort: { "_id.series_id": 1 },
      },
      {
        $group: {
          _id: {
            sport_id: "$_id.sport_id",
          },
          match_name: {
            $first: "$match_name",
          },
          series_name: {
            $first: "$series_name",
          },
          sport_name: {
            $first: "$sport_name",
          },
          "sport_is_blocked_by_parent": {
            "$push": "$series_is_blocked_by_parent"
          },
          "sport_is_blocked_by_self": {
            "$push": "$series_is_blocked_by_self"
          },
          count: {
            $count: {},
          },
          series: {
            $push: {
              series_id: "$_id.series_id",
              series_name: "$series_name",
              "is_blocked_by_parent": "$is_blocked_by_parent",
              "is_blocked_by_self": "$is_blocked_by_self",
              count: "$count",
              matches: {
                $sortArray: {
                  input: "$matches",
                  sortBy: {
                    match_date: 1,
                  },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          sport_id: "$_id.sport_id",
          sport_name: "$sport_name",
          series: 1,
          count: 1,
          "is_blocked_by_parent": {
            "$cond": {
              "if": {
                "$allElementsTrue": {
                  "$reduce": {
                    "input": "$sport_is_blocked_by_parent",
                    "initialValue": [],
                    "in": {
                      "$concatArrays": [
                        "$$value",
                        {
                          "$reduce": {
                            "input": "$$this",
                            "initialValue": [],
                            "in": {
                              "$concatArrays": [
                                "$$value",
                                "$$this"
                              ]
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              },
              "then": true,
              "else": false
            }
          },
          "is_blocked_by_self": {
            "$cond": {
              "if": {
                "$allElementsTrue": {
                  "$reduce": {
                    "input": "$sport_is_blocked_by_self",
                    "initialValue": [],
                    "in": {
                      "$concatArrays": [
                        "$$value",
                        {
                          "$reduce": {
                            "input": "$$this",
                            "initialValue": [],
                            "in": {
                              "$concatArrays": [
                                "$$value",
                                "$$this"
                              ]
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              },
              "then": true,
              "else": false
            }
          }
        },
      },
    ];
  },
};
