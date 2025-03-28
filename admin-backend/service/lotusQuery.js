const { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER } = require("../../utils/constants");
const { ObjectId } = require("bson");

module.exports = {

  getPendingMarketsList: (params) => {

    const { marketId, updatedAt } = params;

    let filter = { isProcessed: 0 };

    if (marketId) {
      filter["marketId"] = marketId;
    }

    if (updatedAt) {
      filter["updatedAt"] = updatedAt;
    }

    let matchConditions = { '$match': filter };

    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$marketId',
          'marketId': { '$first': '$marketId' },
          'operatorId': { '$first': '$operatorId' },
        }
      }
    ];

  },

  casinoResults: (request) => {

    let { limit, page, match_id, from_date } = request.joiData;

    let skip = (page - 1) * limit;

    let filter = { match_id: match_id };

    if (from_date) {
      let startOfDay = new Date(new Date(from_date).setUTCHours(0, 0, 0, 0));
      let endOfDay = new Date(new Date(from_date).setUTCHours(23, 59, 59, 999));
      filter["createdAt"] = { '$gte': startOfDay, '$lte': endOfDay };
    }

    return [
      { $match: filter },
      {
        $project: {
          sport_name: 1,
          series_name: 1,
          match_name: 1,
          market_name: 1,
          winner_name: 1,
          index_cards: 1,
          cards: 1,
          round_id: 1,
          createdAt: 1,
          market_id: 1,
          _id: 0
        },
      },
      {
        '$facet': {
          "metadata": [
            {
              '$group': {
                '_id': null,
                'total': { '$sum': 1 }, // Count total documents
              }
            },
            { '$addFields': { "page": page } },
            {
              '$project': {
                '_id': 0,
              }
            },
          ],
          "data": [
            {
              '$sort': {
                '_id': -1,
                'createdAt': -1
              }
            },
            { "$skip": skip },
            { "$limit": limit }
          ]
        }
      }
    ];

  },

  lotusBetsQuery: (request) => {
    let { user_id, is_void, bets_type, from_date, to_date, limit, page, isBack } = request.joiData;

    let skip = (page - 1) * limit;

    let filter = {};

    // Apply filters based on the provided parameters
    if (from_date && to_date) {
      filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    }

    if (is_void) {
      filter["betvoid"] = is_void;
    }

    if (request.joiData?.marketId) {
      filter["marketId"] = request.joiData.marketId;
    }

    if (request.joiData?.gameId) {
      filter["gameId"] = request.joiData.gameId;
    }

    if (request.joiData?.roundId) {
      filter["roundId"] = request.joiData.roundId;
    }

    if (isBack) {
      filter["isBack"] = isBack;
    }

    if (isBack == false) {
      filter["isBack"] = isBack;
    }

    filter["isProcessed"] = (bets_type === "settled") ? 1 : (bets_type === "cancelled") ? 2 : 0;

    user_id = user_id ? user_id : request.User.user_id.toString();

    // Apply user-based filters based on user type
    if (request.User.user_type_id === USER_TYPE_USER) {
      filter["userId"] = user_id;
    } else if (request.User.user_type_id === USER_TYPE_SUPER_ADMIN) {
      if (user_id !== request.User.user_id) {
        filter["userId"] = user_id;
      }
    } else {
      filter["parentLevels.user_id"] = ObjectId(request.User.user_id);
      if (user_id && user_id !== request.User.user_id) {
        filter["userId"] = user_id;
      }
    }

    return [
      { "$match": filter },
      {
        "$facet": {
          "metadata": [
            {
              "$group": {
                "_id": null,
                "total": { "$sum": 1 },
                "total_profit": {
                  "$sum": {
                    "$cond": {
                      "if": { "$eq": ["$isProcessed", 1] },
                      "then": "$chips",
                      "else": "$stake"
                    }
                  }
                },
              }
            },
            {
              "$addFields": {
                "currentPage": page,
                "totalPages": {
                  "$ceil": {
                    "$divide": ["$total", limit]
                  }
                }
              }
            },
            {
              "$project": {
                "_id": 0
              }
            }
          ],
          "data": [
            { "$sort": { "createdAt": -1 } },
            { "$skip": skip },
            { "$limit": limit },
            {
              "$project": {
                "_id": 1,
                "userName": 1,
                "domainName": 1,
                "matchName": 1,
                "marketType": 1,
                "userId": 1,
                "marketId": 1,
                "runnerName": 1,
                "stake": 1,
                "odds": 1,
                "pnl": 1,
                "isProcessed": 1,
                "liability": 1,
                "isBack": 1,
                "roundId": 1,
                "marketName": 1,
                "betvoid": 1,
                "operatorId": 1,
                "chips": 1,
                "createdAt": 1
              }
            }
          ]
        }
      },
      {
        "$project": {
          "metadata": { "$arrayElemAt": ["$metadata", 0] }, // Converts the array to an object
          "data": 1
        }
      }
    ];
  },
  lotusBetsCrDrQuery: (request) => {
    let { user_id, bets_type, from_date, limit, page } = request.joiData;
    let skip = (page - 1) * limit;
    let filter = {};
    // Apply filters based on the provided parameters
    if (from_date) {
      const startDate = new Date(from_date); // No need to append extra time
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 1);

      filter["createdAt"] = {
        "$gte": startDate,
        "$lt": endDate
      };
    }
    if (request.joiData?.provider) {
      filter["providerCode"] = request.joiData.provider;
    }
    filter["isProcessed"] = (bets_type === "settled") ? 1 : (bets_type === "cancelled") ? 2 : 0;
    user_id = user_id ? user_id : request.User.user_id.toString();
    filter.userId = ObjectId(user_id)
    return [
      { "$match": filter },
      {
        "$facet": {
          "metadata": [
            {
              "$group": {
                "_id": null,
                "total": { "$sum": 1 }
              }
            },
            {
              "$addFields": {
                "currentPage": { "$literal": page },
                "totalPages": {
                  "$ceil": {
                    "$divide": ["$total", limit]
                  }
                }
              }
            },
            {
              "$project": {
                "_id": 0
              }
            }
          ],
          "data": [
            { "$sort": { "createdAt": 1 } },
            { "$skip": skip },
            { "$limit": limit },
            {
              "$setWindowFields": {
                "partitionBy": "$userId",
                "sortBy": { "createdAt": 1 },
                "output": {
                  "total": {
                    "$sum": "$amount",
                    "window": {
                      "documents": ["unbounded", "current"]
                    }
                  }
                }
              }
            },
            {
              "$project": {
                "_id": 1,
                "userId": 1,
                "txnId": 1,
                "txnType": 1,
                "amount": 1,
                "total": 1,
                "providerCode": 1,
                "gameRoundId": 1,
                "gameName": 1,
                "isProcessed": 1,
                "createdAt": 1
              }
            }
          ]
        }
      },
      {
        "$project": {
          "metadata": { "$arrayElemAt": ["$metadata", 0] },
          "data": 1
        }
      }
    ];
  }

}