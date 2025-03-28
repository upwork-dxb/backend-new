const { LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID, HR, GHR, MATCH_ODDS } = require("../../utils/constants");

module.exports = {
  getAgentSeries: function (parentIds, user_id, sport_id) {
    return [
      {
        "$match": {
          "sport_id": sport_id,
          "is_active": 1
        }
      },
      {
        "$lookup": {
          "from": "deactiveseries",
          "localField": "series_id",
          "foreignField": "series_id",
          "as": "deactiveseries"
        }
      },
      {
        "$addFields": {
          "is_created": "1",
          "from_db": "1"
        }
      },
      {
        "$project": {
          "user_id": 1,
          "sport_id": 1,
          "series_id": 1,
          "name": 1,
          "is_manual": 1,
          "is_created": 1,
          "create_at": 1,
          "from_db": 1,
          "is_active": {
            "$cond": [
              {
                "$in": [
                  user_id,
                  "$deactiveseries.user_id"
                ]
              },
              "0",
              "1"
            ]
          },
          "block_series_id": {
            "$ifNull": [
              "$deactiveseries.user_id",
              null
            ]
          }
        }
      },
      {
        "$group": {
          "_id": "$_id",
          "is_manual": {
            "$first": "$is_manual"
          },
          "sport_id": {
            "$first": "$sport_id"
          },
          "series_id": {
            "$first": "$series_id"
          },
          "name": {
            "$first": "$name"
          },
          "is_created": {
            "$first": "$is_created"
          },
          "from_db": {
            "$first": "$from_db"
          },
          "is_active": {
            "$first": "$is_active"
          },
          "block_series_id": {
            "$first": "$block_series_id"
          }
        }
      },
      {
        "$match": {
          "block_series_id": {
            "$nin": parentIds
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "sport_id": 1,
          "series_id": 1,
          "name": 1,
          "is_manual": 1,
          "is_created": 1,
          "is_active": 1,
          "from_db": 1,
        }
      },
      {
        "$sort": { "series_id": 1 }
      }
    ]
  },

  getAgentSeriesV1: function (parentDeactiveSeriesIds, userSelfDeactiveSeriesIds, sport_id) {
    return [
      {
        "$match": {
          "sport_id": sport_id,
          "is_active": 1,
          "series_id": {
            "$nin": parentDeactiveSeriesIds
          }
        }
      },
      {
        "$addFields": {
          "is_created": "1",
          "from_db": "1"
        }
      },
      {
        "$project": {
          "user_id": 1,
          "sport_id": 1,
          "series_id": 1,
          "name": 1,
          "is_manual": 1,
          "is_created": 1,
          "from_db": 1,
          "is_active": {
            "$cond": [
              {
                "$anyElementTrue": {
                  "$map": {
                    "input": userSelfDeactiveSeriesIds,
                    "as": "el",
                    "in": { "$eq": ["$$el", "$series_id"] }
                  }
                }
              },
              0,
              1
            ]
          }
        }
      },
      {
        "$sort": { "series_id": 1 }
      }
    ]
  },
  getSeries: function (params) {
    let { sport_id, include_count } = params, matchConditions = {}, groupQuery = {};
    if (params.hasOwnProperty("is_loggedin")) {
      let { sports_permission } = params
      matchConditions = { sport_id: { $in: sports_permission.map(data => data.sport_id) } };
      groupQuery = {
        name: { $first: "$series_name" },
        sport_id: { $first: "$sport_id" },
        parent_blocked: { $first: "$parent_blocked" },
        self_blocked: { $first: "$self_blocked" }
      };
    }
    let matchOddsFilter = { market_name: MATCH_ODDS };
    if ([LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(sport_id)) {
      matchOddsFilter = {};
    }

    if (include_count) {
      groupQuery = {
        ...groupQuery,
        count: { $count: {} }
      }
    }

    return [
      {
        $match: {
          ...matchConditions,
          is_active: 1,
          is_visible: true,
          sport_id: sport_id,
          is_result_declared: 0,
          '$and': [
            { sport_id: { '$nin': [HR, GHR] } },
          ],
          ...matchOddsFilter
        }
      },
      {
        $group: {
          _id: "$series_id",
          series_name: { $first: "$series_name" },
          series_id: { $first: "$series_id" },
          ...groupQuery,
        }
      },
      {
        $sort: {
          series_name: -1
        }
      },
      {
        $project: {
          _id: 0
        }
      }
    ]
  }

}