const {
  HR,
  GHR,
  SOCCER,
  TENNIS,
  CRICKET,
  MATCH_ODDS,
  LIVE_GAME_SPORT_ID,
  DIAMOND_CASINO_SPORT_ID,
  UNIVERSE_CASINO_SPORT_ID,
} = require("../../utils/constants");

module.exports = {
  marketAnalysis: function (agent_id) {
    return [
      {
        '$match': {
          'parent_ids': {
            '$in': [agent_id]
          }
        }
      },
      {
        '$group': {
          '_id': '$match_id'
        }
      }
    ];
  },
  getMatches: function (parentIds, user_id, series_id) {
    return [
      {
        "$match": {
          "series_id": series_id,
          "is_active": 1
        }
      },
      {
        "$lookup": {
          "from": "deactivematches",
          "localField": "match_id",
          "foreignField": "match_id",
          "as": "deactivematches"
        }
      },
      {
        "$addFields": {
          "is_created": "1",
          "from_db": "1"
        }
      },
      // {
      //   "$unwind": {
      //     "path": "$deactivematches",
      //     "preserveNullAndEmptyArrays": true
      //   }
      // },
      {
        "$project": {
          "user_id": 1,
          "match_date": 1,
          "is_manual": 1,
          "sport_id": 1,
          "series_id": 1,
          "match_id": 1,
          "name": 1,
          "is_created": 1,
          "from_db": 1,
          "is_active": {
            "$cond": [
              {
                "$in": [
                  user_id,
                  "$deactivematches.user_id"
                ]
              },
              "0",
              "1"
            ]
          },
          // "block_by_parent": {
          //   "$and": [
          //     { "$cond": [{ "$eq": ["$deactivematches.user_id", user_id] }, 1, 0] },
          //     { "$cond": [{ "$eq": ["$deactivematches.block_by_parent", 1] }, 1, 0] },
          //   ],
          // },
          // "blocker_parent_id": {
          //   "$ifNull": [
          //     "$deactivematches.blocker_parent_id",
          //     null
          //   ]
          // },
          // "allow_to_enable": { "$cond": [{ "$eq": ["$deactivematches.blocker_parent_id", view_user_id] }, 1, 0] },
          "b_id": {
            "$ifNull": [
              "$deactivematches.user_id",
              null
            ]
          }
        }
      },
      {
        "$group": {
          "_id": "$_id",
          "match_id": {
            "$first": "$match_id"
          },
          "match_date": {
            "$first": "$match_date"
          },
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
          // "block_by_parent": {
          //   "$first": "$block_by_parent"
          // },
          // "allow_to_enable": {
          //   "$first": "$allow_to_enable"
          // },
          // "blocker_parent_id": {
          //   "$first": "$blocker_parent_id"
          // },
          // "blocker_parent": {
          //   "$first": "$blocker_parent"
          // },
          "b_id": {
            "$first": "$b_id"
          }
        }
      },
      {
        "$match": {
          "b_id": {
            "$nin": parentIds
          },
          // "block_by_parent": {
          //   "$ne": true
          // }
        }
      },
      // {
      //   "$lookup": {
      //     "from": "users",
      //     "localField": "blocker_parent_id",
      //     "foreignField": "_id",
      //     "as": "blocker_parent"
      //   }
      // },
      {
        "$project": {
          "_id": 0,
          "match_date": 1,
          "is_manual": 1,
          "sport_id": 1,
          "series_id": 1,
          "match_id": 1,
          "name": 1,
          "is_created": 1,
          "is_active": 1,
          "from_db": 1,
          // "block_by_parent": 1,
          // "allow_to_enable": 1,
          // "blocker_parent_id": 1,
          // "blocker_parent_user_name": {
          //   "$concat": [
          //     {
          //       "$arrayElemAt": [
          //         "$blocker_parent.name",
          //         0
          //       ]
          //     },
          //     "(",
          //     {
          //       "$arrayElemAt": [
          //         "$blocker_parent.user_name",
          //         0
          //       ]
          //     },
          //     ")"
          //   ]
          // }
        }
      },
      {
        "$sort": { "match_id": 1 }
      }
    ]
  },
  homeMatches: function (parentIds) {
    return [
      {
        $lookup:
        {
          from: "sports",
          localField: "sport_id",
          foreignField: "sport_id",
          as: "sp"
        }
      },
      {
        $lookup:
        {
          from: "series",
          localField: "series_id",
          foreignField: "series_id",
          as: "sr"
        }
      },
      {
        $lookup:
        {
          from: "markets",
          localField: "match_id",
          foreignField: "match_id",
          as: "mr"
        }
      },
      {
        $lookup:
        {
          from: "deactivesport",
          localField: "sport_id",
          foreignField: "sport_id",
          as: "ds"
        }
      },
      {
        $lookup:
        {
          from: "deactiveseries",
          localField: "series_id",
          foreignField: "series_id",
          as: "dse"
        }
      },
      {
        $lookup:
        {
          from: "deactivematches",
          localField: "match_id",
          foreignField: "match_id",
          as: "dma"
        }
      },
      {
        $lookup:
        {
          from: "deactivemarke",
          localField: "market_id",
          foreignField: "market_id",
          as: "dmar"
        }
      },
      {
        $lookup:
        {
          from: "userfavourite",
          localField: "market_id",
          foreignField: "market_id",
          as: "uf"
        }
      },
      { $match: { $and: [{ "sp.is_active": 1, "sr.is_active": 1, "is_active": 1, "mr.is_active": 1, "mr.is_result_declared": 0, "mr.name": "Match Odds" }] } },
      {
        $project: {
          "_id": 0,
          sport_id: {
            "$arrayElemAt": [
              "$sp.sport_id",
              0
            ]
          },
          series_id: 1,
          match_id: 1,
          market_id: {
            "$arrayElemAt": [
              "$mr.market_id",
              0
            ]
          },
          match_date: 1,
          sport_name: {
            "$arrayElemAt": [
              "$sp.name",
              0
            ]
          },
          series_name: {
            "$arrayElemAt": [
              "$sr.name",
              0
            ]
          },
          "match_name": "$name",
          is_active: 1,
          is_fancy: {
            $switch: {
              branches: [
                { case: false, then: 1 }
              ],
              default: 0
            }
          },
          is_visible: {
            "$arrayElemAt": [
              "$mr.is_visible",
              0
            ]
          },
          is_favourite: {
            $switch: {
              branches: [
                { case: { $eq: ["$uf._id", null] }, then: 'N' }
              ],
              default: 'N'
            }
          },
          uf: "$uf._id",
          ds: "$ds.user_id",
          dse: "$dse.user_id",
          dma: "$dma.user_id",
          dmar: "$dmar.user_id",
          runner_json: {
            "$arrayElemAt": [
              "$mr.runners",
              0
            ]
          },
        }
      },
      {
        $match: {
          dse: { $nin: parentIds },
          dma: { $nin: parentIds },
          ds: { $nin: parentIds },
          dmar: { $nin: parentIds }
        }
      },
      {
        $project: {
          uf: 0,
          ds: 0,
          dse: 0,
          dma: 0,
          dmar: 0
        }
      }
    ]
  },
  getMatch: function (params) {
    let { series_id, sport_id, today, path } = params, filter = {}, groupQuery = {};
    if (params.hasOwnProperty("is_loggedin")) {
      let { sports_permission, sport_id } = params;
      filter = {
        $and: [
          ...(sport_id ? [{ sport_id }] : []),
          { sport_id: { $in: sports_permission.map((data) => data.sport_id) } },
        ],
      };
      if (today) {
        filter.match_date = { "$gte": new Date(today) }
      }
      groupQuery = {
        name: { $first: "$match_name" },
        sport_id: { $first: "$sport_id" },
        parent_blocked: { $first: "$parent_blocked" },
        self_blocked: { $first: "$self_blocked" }
      };
    }
    let filterOutter = { is_active: 1, is_visible: true, is_result_declared: 0 };

    if (path == "/getMatches" || path == "/matches") {
      if (!sport_id || [SOCCER, TENNIS, CRICKET].includes(sport_id)) {
        filterOutter["market_name"] = MATCH_ODDS;
      }

      filterOutter["sport_id"] = sport_id ? sport_id : {
        $in: [SOCCER, TENNIS, CRICKET]
      };

      if (today) {
        filterOutter.match_date = { "$gte": new Date(today) }
      }

      groupQuery = {
        ...groupQuery,
        match_name: { $first: "$match_name" },
        sport_id: { $first: "$sport_id" },
        sport_name: { $first: "$sport_name" },
        series_id: { $first: "$series_id" },
        series_name: { $first: "$series_name" },
        match_id: { $first: "$match_id" },
        match_name: { $first: "$match_name" },
        market_id: { $first: "$market_id" },
        inplay: { $first: "$inplay" },
      };
    }

    if (series_id) filterOutter["series_id"] = series_id;
    let matchConditions = { "$match": { ...filterOutter, ...filter } };

    if (path == "/getCountryCodeList"
      || path == "/getCountryCodeListOpen"
      || path == "/getCountryCodeListOnly") {
      matchConditions["$match"]["market_id"] = { $regex: ".+(?<!_m)$" }
      if (path == "/getCountryCodeListOpen")
        matchConditions["$match"]["sport_id"] = params.sport_id ? params.sport_id : { $in: [HR, GHR] }
      matchConditions = JSON.parse(JSON.stringify(matchConditions));
      if (filter?.match_date)
        matchConditions["$match"].match_date = { "$gte": today };

      let groupQuery = {};
      if (params?.include_count) {
        groupQuery = {
          match_count: { $count: {} }
        }
      }
      return [
        { ...matchConditions },
        {
          '$group': {
            '_id': '$country_code',
            'parent_blocked': {
              '$push': '$parent_blocked'
            },
            'self_blocked': {
              '$push': '$self_blocked'
            },
            ...groupQuery,
          }
        },
        {
          '$sort': {
            '_id': 1
          }
        },
        {
          '$project': {
            '_id': 0,
            'country_code': '$_id',
            'parent_blocked': {
              '$reduce': {
                'input': '$parent_blocked',
                'initialValue': [],
                'in': {
                  '$setUnion': [
                    '$$value', '$$this'
                  ]
                }
              }
            },
            'self_blocked': {
              '$reduce': {
                'input': '$self_blocked',
                'initialValue': [],
                'in': {
                  '$setUnion': [
                    '$$value', '$$this'
                  ]
                }
              }
            },
            ...(params?.include_count ? {
              'match_count': 1
            } : {})
          }
        }
      ];
    }

    return [
      { ...matchConditions },
      {
        $group: {
          _id: "$match_id",
          match_name: { $first: "$match_name" },
          match_date: { $first: { $dateToString: { format: "%d-%m-%Y %H:%M", date: "$match_date", timezone: "Asia/Kolkata" } } },
          match_id: { $first: "$match_id" },
          ...groupQuery
        }
      },
      {
        $sort: {
          match_date: -1
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