const { ObjectId } = require("bson")
  , { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER } = require('../../utils/constants')

module.exports = {
  getTeamPositionQuery: function (user_id, match_id, market_ids) {
    let matchConditions = {
      "$match": {
        "win_loss_distribution.user_id": ObjectId(user_id)
      }
    };
    if (match_id) {
      if (!Array.isArray(match_id))
        match_id = match_id.split(",");
      matchConditions["$match"]["match_id"] = { "$in": match_id }
    }
    if (market_ids) {
      if (!Array.isArray(market_ids))
        market_ids = market_ids.split(",");
      matchConditions["$match"]["market_id"] = { "$in": market_ids }
    }
    return [
      { ...matchConditions }, {
        "$addFields": {
          "win_loss_distribution": {
            "$first": {
              "$filter": {
                "input": "$win_loss_distribution",
                "as": "item",
                "cond": { "$eq": ["$$item.user_id", ObjectId(user_id)] }
              }
            }
          }
        }
      }, {
        "$group": {
          "_id": {
            "market_id": '$market_id',
            "selection_id": "$selection_id",
          },
          "market_id": { "$first": '$market_id' },
          "selection_id": { "$first": '$selection_id' },
          "selection_name": { "$first": '$selection_name' },
          "sort_priority": { "$first": '$sort_priority' },
          "win_loss": { "$sum": '$win_loss_distribution.win_loss' },
          "win_loss_total_exposure": { "$sum": '$win_loss' },
        }
      }, {
        "$project": {
          "_id": 0,
          "market_id": 1,
          "selection_id": 1,
          "selection_name": 1,
          "sort_priority": 1,
          "win_loss": 1,
          "win_loss_total_exposure": {
            '$multiply': [{ '$round': ['$win_loss_total_exposure', 2] }, -1]
          }
        }
      }
    ]
  },
  getMarketWiseLiablity: function (params) {
    let { user_id, match_id, market_ids } = params;
    let matchConditions = {
      "$match": {
        "win_loss_distribution.user_id": ObjectId(user_id)
      }
    };
    if (match_id) {
      if (!Array.isArray(match_id))
        match_id = match_id.split(",");
      matchConditions["$match"]["match_id"] = { "$in": match_id }
    }
    if (market_ids) {
      if (!Array.isArray(market_ids))
        market_ids = market_ids.split(",");
      matchConditions["$match"]["market_id"] = { "$in": market_ids }
    }
    return [
      { ...matchConditions },
      {
        '$addFields': {
          'win_loss_distribution': {
            '$first': {
              '$filter': {
                'input': '$win_loss_distribution',
                'as': 'item',
                "cond": { "$eq": ["$$item.user_id", ObjectId(user_id)] }
              }
            }
          }
        }
      },
      {
        '$group': {
          '_id': {
            'market_id': '$market_id',
            'selection_id': '$selection_id'
          },
          'sport_id': {
            '$first': '$sport_id'
          },
          'sport_name': {
            '$first': '$sport_name'
          },
          'series_id': {
            '$first': '$series_id'
          },
          'series_name': {
            '$first': '$series_name'
          },
          'match_id': {
            '$first': '$match_id'
          },
          'match_name': {
            '$first': '$match_name'
          },
          'market_id': {
            '$first': '$market_id'
          },
          'market_name': {
            '$first': '$market_name'
          },
          'selection_id': {
            '$first': '$selection_id'
          },
          'selection_name': {
            '$first': '$selection_name'
          },
          'sort_priority': {
            '$first': '$sort_priority'
          },
          'win_loss': {
            '$sum': '$win_loss_distribution.win_loss'
          },
          'win_loss_total_exposure': {
            '$sum': '$win_loss'
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'sport_id': 1,
          'sport_name': 1,
          'series_id': 1,
          'series_name': 1,
          'match_id': 1,
          'match_name': 1,
          'event_name': '$market_name',
          'event_id': '$market_id',
          'type': 'Market',
          'market_id': 1,
          'market_name': 1,
          'selection_id': 1,
          'selection_name': 1,
          'sort_priority': 1,
          'win_loss': 1,
          'win_loss_total_exposure': {
            '$multiply': [
              {
                '$round': [
                  '$win_loss_total_exposure', 2
                ]
              }, -1
            ]
          }
        }
      },
      {
        '$group': {
          '_id': '$market_id',
          'exposure': {
            '$push': '$win_loss'
          },
          'total_exposure': {
            '$push': '$win_loss_total_exposure'
          },
          'sport_id': {
            '$first': '$sport_id'
          },
          'sport_name': {
            '$first': '$sport_name'
          },
          'series_id': {
            '$first': '$series_id'
          },
          'series_name': {
            '$first': '$series_name'
          },
          'match_id': {
            '$first': '$match_id'
          },
          'match_name': {
            '$first': '$match_name'
          },
          'event_name': {
            '$first': '$event_name'
          },
          'event_id': {
            '$first': '$event_id'
          },
          'type': {
            '$first': '$type'
          }
        }
      }
    ]
  },
  BetsQuery: function (params) {
    let { user_id, user_type_id, match_id, market_id, fancy_id, limit, page, search, path, from_date, to_date } = params;
    let matchConditions = {
      "$match": {
        "parents.user_id": ObjectId(user_id),
        "is_demo": false
      }
    }
    if (path == "/fraudBets")
      matchConditions = {
        "$match": {
          is_fraud_bet: { $in: [1, 2] }
        }
      }
    if (match_id)
      matchConditions['$match']['match_id'] = match_id;
    let fancyConditions = JSON.parse(JSON.stringify(matchConditions));
    fancyConditions['$match']['parents.user_id'] = ObjectId(user_id);
    if (market_id || fancy_id) {
      if (!Array.isArray(market_id) || !Array.isArray(fancy_id)) {
        market_id = market_id.split(",");
        fancy_id = fancy_id.split(",");
      }
      matchConditions["$match"]["market_id"] = { "$in": market_id }
      fancyConditions["$match"]["fancy_id"] = { "$in": fancy_id }
    }
    if (from_date && to_date) {
      if (path == "/settledBets" || path == "/bets") {
        matchConditions["$match"]["updatedAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
        fancyConditions["$match"]["updatedAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
      } else {
        matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
        fancyConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
      }
    }

    if (!search.amount_from && search.amount_to) {
      matchConditions["$match"]["stack"] = { '$lte': search.amount_to };
      fancyConditions["$match"]["stack"] = { '$lte': search.amount_to };
      delete search.amount_to;
    } else if (search.amount_from && !search.amount_to) {
      matchConditions["$match"]["stack"] = { '$gte': search.amount_from };
      fancyConditions["$match"]["stack"] = { '$lte': search.amount_to };
      delete search.amount_from;
    } else if (search.amount_from && search.amount_to) {
      matchConditions["$match"]["stack"] = { '$gte': search.amount_from, '$lte': search.amount_to };
      fancyConditions["$match"]["stack"] = { '$gte': search.amount_from, '$lte': search.amount_to };
      delete search.amount_to;
      delete search.amount_from;
    }

    if (search.user_id) {
      if (search.user_type_id != USER_TYPE_USER) {
        matchConditions["$match"]['parents.user_id'] = search.user_id;
        fancyConditions["$match"]['parents.user_id'] = search.user_id;
        delete search.user_id;
      }
      delete search.user_type_id;
    }
    if (search)
      if (search.constructor.name === "Object") {
        Object.assign(matchConditions["$match"], search);
        Object.assign(fancyConditions["$match"], search);
      }
    let skip = (page - 1) * limit;
    let Project = {
      "user_name": 1, "market_name": 1, "selection_name": 1
    }, fancyProject = {};
    fancyProject['user_name'] = 1;
    fancyProject['geolocation'] = 1;
    fancyProject['market_id'] = '$fancy_id';
    fancyProject['market_name'] = '$fancy_name';
    if (path == "/fraudBets") {
      Project = { ...Project, is_fraud_bet: 1, is_fraud_bet_comment: 1 };
      fancyProject = { ...fancyProject, is_fraud_bet: 1, is_fraud_bet_comment: 1 };
    }
    if (["/openBets", "/settledBets", "/getMasterBetList", "/fraudBets", "/diamondSettledBets"].includes(path)) {
      Project = { ...Project, sport_name: 1, series_name: 1, match_name: 1, geolocation: 1, device_info: 1 };
      fancyProject = { ...fancyProject, sport_name: 1, series_name: 1, match_name: 1, geolocation: 1, device_info: 1 };
    }
    let p_l = "$chips";
    if (user_type_id == USER_TYPE_SUPER_ADMIN) {
      Project = {
        ...Project,
        "user_name": {
          "$concat": [
            "$user_name", "(", { "$toString": "$user_id" }, ")"
          ]
        },
        "market_name": {
          "$concat": [
            "$market_name", "(", "$market_id", ")"
          ]
        },
        "selection_name": {
          "$concat": [
            "$selection_name", "(", { "$toString": "$selection_id" }, ")"
          ]
        },
        "geolocation": 1
      };
      fancyProject['user_name'] = {
        "$concat": [
          "$user_name", "(", { "$toString": "$user_id" }, ")"
        ]
      };
      fancyProject['market_name'] = {
        "$concat": [
          "$fancy_name", "(", '$fancy_id', ")"
        ]
      };
      if (["/openBets", "/settledBets", "/bets", "/diamondSettledBets"].includes(path)) {
        let eventsWithId = {
          sport_name: {
            '$concat': [
              "$sport_name", "(", "$sport_id", ")"
            ]
          },
          series_name: {
            '$concat': [
              "$series_name", "(", "$series_id", ")"
            ]
          },
          match_name: {
            '$concat': [
              "$match_name", "(", "$match_id", ")"
            ]
          }
        };
        Project = { ...Project, ...eventsWithId };
        if (path == "/openBets")
          Project = {
            ...Project, "sport_id": 1, "match_id": 1, marketId: {
              "$concat": [
                { "$arrayElemAt": [{ "$split": ["$market_id", "."] }, 0] },
                ".",
                { "$arrayElemAt": [{ "$split": ["$market_id", "."] }, 1] },
                ".",
                { "$arrayElemAt": [{ "$split": ["$market_id", "."] }, 2] },
              ]
            }
          };
        fancyProject = { ...fancyProject, ...eventsWithId };
      }
    }
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 0,
          "bet_id": "$_id",
          "user_id": 1,
          "domain_name": 1,
          ...Project,
          "market_id": 1,
          "event_type": "$market_type",
          "odds": 1,
          "stack": 1,
          'liability': 1,
          "profit": "$p_l",
          "chips": 1,
          "p_l": '$chips',
          "is_back": 1,
          "winner_name": 1,
          "delete_status": 1,
          'deleted_reason': {
            '$cond': {
              'if': {
                '$eq': [
                  '$delete_status', 1
                ]
              },
              'then': '$deleted_reason',
              'else': ''
            }
          },
          "is_fancy": 1,
          "size": 1,
          "ip_address": 1,
          "match_date": 1,
          "updatedAt": 1,
          "createdAt": 1,
          "is_matched": 1,
          "result_settled_at": 1,
          "is_result_declared": 1,
          "game_type": {
            "$cond": {
              "if": { "$eq": ["$market_type", "MATCH_ODDS"] },
              "then": "Match",
              "else": "Match1"
            }
          }
        }
      },
      {
        '$unionWith': {
          'coll': 'bets_fancies',
          'pipeline': [
            {
              ...fancyConditions
            },
            {
              '$project': {
                '_id': 0,
                "bet_id": "$_id",
                'user_id': 1,
                'user_name': 1,
                "domain_name": 1,
                ...fancyProject,
                'selection_name': {
                  '$cond': {
                    'if': {
                      '$eq': [
                        '$is_back', 1
                      ]
                    },
                    'then': 'YES',
                    'else': 'NO'
                  }
                },
                "event_type": "$category_name",
                'odds': '$run',
                'stack': 1,
                'liability': 1,
                'profit': 1,
                'chips': 1,
                p_l,
                'is_back': 1,
                'delete_status': 1,
                'deleted_reason': {
                  '$cond': {
                    'if': {
                      '$eq': [
                        '$delete_status', 1
                      ]
                    },
                    'then': '$deleted_reason',
                    'else': ''
                  }
                },
                'is_fancy': 1,
                'size': 1,
                'winner_name': '$result',
                'ip_address': 1,
                'match_date': 1,
                "updatedAt": 1,
                'createdAt': 1,
                "is_matched": 1,
                "result_settled_at": 1,
                "is_result_declared": 1,
                "game_type": "Fancy"
              }
            }
          ]
        }
      },
      {
        '$facet': {
          "metadata": [
            {
              '$group': {
                '_id': null,
                'total': { '$sum': 1 }, // Count total documents
                'total_profit': {
                  '$sum': {
                    '$cond': {
                      'if': { '$eq': ['$is_result_declared', 1] },
                      'then': '$chips',
                      'else': '$stack'
                    }
                  }
                } // Sum of profit field
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
    ]
  },
  updateBetRecordsOnResultDeclareQuery: function (params) {
    const { match_id, market_id, selection_id, selection_name, bet_result_id } = params;
    return [
      {
        "updateMany": {
          "filter": { match_id, market_id, selection_id, result: null },
          "update": [{
            "$set": {
              "result": { "$cond": [{ "$eq": ["$is_back", 0] }, 0, 1] },
              "chips": { "$cond": [{ "$eq": ["$is_back", 0] }, "$liability", "$p_l"] }
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, selection_id: { $ne: selection_id }, result: null },
          "update": [{
            "$set": {
              "result": { "$cond": [{ "$eq": ["$is_back", 0] }, 0, 1] },
              "chips": { "$cond": [{ "$eq": ["$is_back", 0] }, "$stack", "$stack_inverse"] }
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, result: null },
          "update": {
            "$set": {
              "result": -1,
              "chips": 0
            }
          }
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id },
          "update": [
            {
              "$set": {
                "bet_result_id": ObjectId(bet_result_id),
                "winner_name": selection_name,
                "user_pl": "$chips",
                "is_result_declared": 1,
                "result_settled_at": new Date(),
              }
            }
          ]
        }
      }
    ];
  },
  updateBetRecordsOnResultDeclareQueryV2: function (params) {
    const { match_id, market_id, selection_id, selection_ids, selection_name, bet_result_id, is_tbp } = params;
    return [
      {
        "updateMany": {
          "filter": {
            match_id, market_id, selection_id: (is_tbp
              ? { $in: selection_id.toString().split(',').map(i => parseInt(i)) }
              : selection_id), result: -11111, is_matched: 1
          },
          "update": [{
            "$set": {
              "result": { "$cond": [{ "$eq": ["$is_back", 0] }, 0, 1] },
              "chips": { "$cond": [{ "$eq": ["$is_back", 0] }, "$liability", "$p_l"] }
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, selection_id: { $in: selection_ids }, result: -11111, is_matched: 1 },
          "update": [{
            "$set": {
              "result": { "$cond": [{ "$eq": ["$is_back", 0] }, 0, 1] },
              "chips": { "$cond": [{ "$eq": ["$is_back", 0] }, "$stack", "$stack_inverse"] }
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, result: -11111, is_matched: 0 },
          "update": {
            "$set": {
              "result": -1,
              "chips": 0
            }
          }
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, is_matched: 0, delete_status: 0 },
          "update": {
            "$set": {
              "delete_status": 2,
              "deleted_reason": "Void Un Matched Bets after Result."
            }
          }
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id },
          "update": [
            {
              "$set": {
                "bet_result_id": ObjectId(bet_result_id),
                "winner_name": selection_name,
                "user_pl": "$chips",
                "is_result_declared": 1,
                "result_settled_at": new Date(),
              }
            }
          ]
        }
      }
    ];
  },
  updateOddsProfitLossForToBePlaceResult: function (params) {
    const { match_id, market_id, selection_id, selection_ids } = params;
    return [
      {
        "updateMany": {
          "filter": { match_id, market_id },
          "update": [{
            "$set": {
              "user_pl": 0,
              "win_loss": 0,
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, selection_id: { $in: selection_id.toString().split(',').map(i => parseInt(i)) } },
          "update": [{
            "$set": {
              "user_pl": "$win_value",
              "win_loss": "$win_value",
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": { match_id, market_id, selection_id: { $in: selection_ids } },
          "update": [{
            "$set": {
              "user_pl": "$loss_value",
              "win_loss": "$loss_value",
            }
          }]
        }
      }
    ];
  },
  sp_set_result_odds: function (params) {
    const {
      sport_id, sport_name,
      series_id, series_name,
      match_id, match_name, match_date,
      market_id, market_name,
      selection_name
    } = params;
    return [
      {
        '$match': {
          match_id,
          market_id,
          'delete_status': 0
        }
      }, {
        $addFields: {
          "root_user_id": "$user_id",
          "root_user_name": "$user_name"
        }
      }, {
        '$unwind': {
          'path': '$distribution'
        }
      }, {
        '$replaceRoot': {
          'newRoot': {
            '$mergeObjects': [{
              "root_user_id": "$root_user_id",
              "root_user_name": "$root_user_name",
              '_id': '$distribution.user_id',
              'user_name': '$user_name',
              'domain_name': '$domain_name',
              'bet_result_id': '$bet_result_id',
              'type': '$type',
              'stack': '$stack',
              'chips': '$chips',
              'user_pl': '$user_pl',
              'winner_name': '$winner_name',
              'user_commission': '$user_commission'
            }, '$distribution']
          }
        }
      }, {
        '$group': {
          '_id': {
            '_id': '$_id',
            "root_user_id": "$root_user_id",
          },
          "root_user_id": {
            '$first': '$$CURRENT.root_user_id'
          },
          "root_user_name": {
            '$first': '$$CURRENT.root_user_name'
          },
          'user_id': {
            '$first': '$$CURRENT.user_id'
          },
          'user_name': {
            '$first': '$$CURRENT.user_name'
          },
          'domain_name': {
            '$first': '$$CURRENT.domain_name'
          },
          'bet_result_id': {
            '$first': '$$CURRENT.bet_result_id'
          },
          'type': {
            '$first': '$$CURRENT.type'
          },
          'winner_name': {
            '$first': '$$CURRENT.winner_name'
          },
          'stack': {
            '$sum': '$stack'
          },
          'chips': {
            '$sum': '$chips'
          },
          'user_pl': {
            '$sum': '$chips'
          },
          'p_l': {
            '$sum': '$p_l'
          },
          'user_commission': {
            '$first': '$user_commission'
          },
          'share': {
            '$first': '$$CURRENT.share'
          },
          'user_type_id': {
            '$first': '$$CURRENT.user_type_id'
          },
          'match_commission': {
            '$first': '$$CURRENT.match_commission'
          },
          'commission': {
            '$first': '$$CURRENT.commission'
          },
          'index': {
            '$first': '$$CURRENT.index'
          }
        }
      }, {
        '$sort': {
          'index': 1
        }
      }, {
        '$group': {
          '_id': '$root_user_id',
          'user_id': {
            '$first': '$root_user_id'
          },
          'user_name': {
            '$first': '$root_user_name'
          },
          'domain_name': {
            '$first': '$domain_name'
          },
          'bet_result_id': {
            '$first': '$bet_result_id'
          },
          'type': {
            '$first': '$type'
          },
          'stack': {
            '$first': '$stack'
          },
          'chips': {
            '$first': '$chips'
          },
          'user_pl': {
            '$first': '$user_pl'
          },
          'winner_name': {
            '$first': '$winner_name'
          },
          'user_commission': {
            '$first': '$user_commission'
          },
          'agents_pl_distribution': {
            '$push': {
              'user_id': '$user_id',
              'user_name': '$user_name',
              'user_type_id': '$user_type_id',
              'index': '$index',
              'match_commission': '$match_commission',
              'share': '$share',
              'p_l': {
                '$round': [{
                  '$cond': {
                    'if': {
                      '$lt': ['$chips', 0]
                    },
                    'then': {
                      '$abs': {
                        '$divide': [{
                          '$multiply': ['$chips', '$share']
                        }, 100]
                      }
                    },
                    'else': {
                      '$multiply': [{
                        '$abs': {
                          '$divide': [{
                            '$multiply': ['$chips', '$share']
                          }, 100]
                        }
                      }, -1]
                    }
                  }
                }, 2]
              },
              'commission': {
                '$round': [{
                  '$cond': {
                    'if': {
                      '$gt': ['$chips', 0]
                    },
                    'then': {
                      "$divide": [{
                        "$multiply": [{
                          "$abs": {
                            "$divide": [{
                              "$multiply": [{
                                "$abs": "$chips"
                              }, "$user_commission"]
                            }, 100]
                          }
                        }, '$share']
                      }, 100]
                    },
                    'else': 0
                  }
                }, 2]
              }
            }
          }
        }
      },
      {
        '$addFields': {
          "user_commission_pl": {
            '$cond': {
              'if': {
                '$gt': ['$chips', 0]
              },
              'then': {
                "$multiply": [{
                  "$abs": {
                    "$divide": [{
                      "$multiply": [{
                        "$abs": "$chips"
                      }, "$user_commission"]
                    }, 100]
                  }
                }, -1]
              },
              'else': 0
            }
          },
          'sport_id': sport_id,
          'sport_name': sport_name,
          'series_id': series_id,
          'series_name': series_name,
          'match_id': match_id,
          match_date,
          'match_name': match_name,
          'event_id': market_id,
          'event_name': market_name,
          'description': {
            '$concat': [match_name, " - ", market_name, " - ", {
              '$cond': {
                'if': {
                  '$gte': ['$chips', 0]
                },
                'then': 'Profit',
                'else': 'Loss'
              }
            }, ` [ Winner : ${selection_name} ]`]
          },
          'reffered_name': {
            '$concat': [sport_name, ' -> ', match_name, ' -> ', market_name]
          }
        }
      },
      {
        '$project': {
          '_id': 0
        }
      }
    ];
  },
  sp_set_result_oddsV2: function (params) {
    const {
      sport_name,
      match_id, match_name,
      market_id, market_name,
      selection_id, selection_name,
      bet_result_id,
      is_tbp
    } = params;
    return [
      {
        '$match': {
          match_id,
          market_id,
          ...(is_tbp ? {} : { "selection_id": parseInt(selection_id) })
        }
      },
      ...(is_tbp ? [{
        $group: {
          _id: "$user_id",
          user_id: { $first: "$user_id" },
          user_name: { $first: "$user_name" },
          is_demo: { $first: "$is_demo" },
          domain_name: { $first: "$domain_name" },
          sport_id: { $first: "$sport_id" },
          sport_name: { $first: "$sport_name" },
          series_id: { $first: "$series_id" },
          series_name: { $first: "$series_name" },
          match_id: { $first: "$match_id" },
          match_name: { $first: "$match_name" },
          match_date: { $first: "$match_date" },
          market_id: { $first: "$market_id" },
          market_name: { $first: "$market_name" },
          market_type: { $first: "$market_type" },
          stacks_sum: { $first: "$stacks_sum" },
          max_liability: { $first: "$max_liability" },
          user_pl: { $sum: "$user_pl" },
          user_commission_pl: { $first: "$user_commission_pl" },
          win_loss_distribution: { $first: "$win_loss_distribution" }
        }
      }] : []),
      {
        '$project': {
          '_id': 0,
          'user_id': 1,
          'user_name': 1,
          'domain_name': 1,
          'is_demo': 1,
          'sport_id': 1,
          'sport_name': 1,
          'series_id': 1,
          'series_name': 1,
          'match_id': 1,
          'match_name': 1,
          'match_date': 1,
          'event_id': "$market_id",
          'event_name': "$market_name",
          'market_type': 1,
          'winner_name': selection_name,
          'bet_result_id': ObjectId(bet_result_id),
          'type': { '$toInt': "1" },
          'stack': "$stacks_sum",
          'user_pl': 1,
          'user_commission_pl': 1,
          'max_liability': {
            '$multiply': ['$max_liability', -1],
          },
          'liability': {
            '$multiply': ['$max_liability', -1],
          },
          'description': {
            '$concat': [sport_name, ' / ', match_name, ' / ', { $ifNull: ['$market_type', ''] }, ' / ', selection_name]
            // [match_name, " - ", market_name, " - ", {
            //   '$cond': {
            //     'if': {
            //       '$gte': ['$user_pl', 0]
            //     },
            //     'then': 'Profit',
            //     'else': 'Loss'
            //   }
            // }, ` [ Winner : ${selection_name} ]`]
          },
          'reffered_name': {
            '$concat': [sport_name, ' -> ', match_name, ' -> ', market_name]
          },
          'agents_pl_distribution': "$win_loss_distribution"
        }
      }
    ]
  },
  // here we are going to update user liability & balance to its original event initial data. odds_profit_loss Query.
  fn_update_balance_liability_Query: function (pMarketId, pUserId, pLiabilityType) {
    let matchConditions = {
      "$match": {
        "market_id": pMarketId
      }
    }
    if (pUserId != 0)
      matchConditions["$match"]["user_id"] = ObjectId(pUserId);
    let liability_Query = [
      { ...matchConditions },
      {
        '$project': {
          "_id": 0,
          "win_loss": 1,
          "user_id": 1
        }
      },
      {
        '$group': {
          "_id": "$user_id",
          "user_id": { "$first": "$user_id" },
          "liability": {
            "$min": "$win_loss"
          }
        }
      },
      {
        '$project': {
          "_id": 0
        }
      },
      {
        '$match': {
          "liability": {
            "$lt": 0
          }
        }
      }
    ];
    if (pLiabilityType == 'add')
      liability_Query.push(
        {
          '$project': {
            'user_id': 1,
            'liability': '$liability'
          }
        }
      );
    if (pLiabilityType == 'sub')
      liability_Query.push(
        {
          '$project': {
            'user_id': 1,
            'liability': {
              '$multiply': [
                '$liability', -1
              ]
            }
          }
        }
      );
    return liability_Query;
  },
  fn_update_balance_liability_QueryV2: function (pMarketId, pUserId, pLiabilityType) {
    let matchConditions = {
      "$match": {
        "market_id": pMarketId
      }
    }
    if (pUserId != 0)
      matchConditions["$match"]["user_id"] = ObjectId(pUserId);
    let liability_Query = [
      { ...matchConditions },
      {
        '$group': {
          "_id": "$user_id",
          "user_id": { "$first": "$user_id" },
          "liability": {
            "$first": "$max_liability"
          }
        }
      }
    ];
    if (pLiabilityType == 'add')
      liability_Query.push(
        {
          '$project': {
            'user_id': 1,
            'liability': '$liability'
          }
        }
      );
    if (pLiabilityType == 'sub')
      liability_Query.push(
        {
          '$project': {
            'user_id': 1,
            'liability': {
              '$multiply': [
                '$liability', -1
              ]
            }
          }
        }
      );
    return liability_Query;
  },
  fn_update_balance_liability_sessionV2: function (pFancyId, pUserId, pLiabilityType) {
    let matchConditions = {
      "$match": {
        "fancy_id": pFancyId
      }
    }
    let liability_Query = [
      { ...matchConditions }
    ];
    if (pLiabilityType == 'add')
      liability_Query.push(
        {
          '$project': {
            'user_id': 1,
            'liability': '$liability'
          }
        }
      );
    if (pLiabilityType == 'sub')
      liability_Query.push(
        {
          '$project': {
            'user_id': 1,
            'liability': {
              '$multiply': [
                '$liability', -1
              ]
            }
          }
        }
      );
    return liability_Query;
  },
  account_statements: function (bet_result_id, pIsFancy = 0, pIsRollback = '0') {
    var statementType = '2', statementTypeComm = '3', marketType = '1', rollBackText = '';
    if (pIsFancy == 1) {
      statementType = '4';
      statementTypeComm = '5';
      marketType = '2';
    }
    let user_p_l = '$user_pl', user_available_balance_pl = { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$user_pl'] };
    let user_comm = '$user_commission_pl', user_available_balance_comm = { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$user_pl', '$user_commission_pl'] };
    let agent_p_l = '$amount', agent_available_balance_pl = { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$amount'] };
    let agent_comm = '$commission', agent_available_balance_comm = { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$p_l', '$commission'] };
    if (pIsRollback == '1') {
      rollBackText = 'Rollback Result: ';
      user_p_l = {
        '$multiply': [
          '$user_pl', -1
        ]
      };
      user_available_balance_pl = { '$subtract': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }, '$user_pl'] };
      user_comm = {
        '$multiply': [
          '$user_commission_pl', -1
        ]
      };
      user_available_balance_comm = { '$subtract': [{ '$subtract': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }, '$user_pl'] }, '$user_commission_pl'] };

      agent_p_l = {
        '$multiply': [
          '$amount', -1
        ]
      };
      agent_available_balance_pl = { '$subtract': ['$amount', { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }] };
      agent_comm = {
        '$multiply': [
          '$commission', -1
        ]
      };
      agent_available_balance_comm = { '$subtract': [{ '$subtract': ['$p_l', '$commission'] }, { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }] };
    }
    return [
      {
        '$match': {
          'bet_result_id': ObjectId(bet_result_id)
        }
      },
      {
        '$facet': {
          'users_account_statement_pl': [
            {
              '$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': '_id',
                'as': 'user'
              }
            },
            {
              '$project': {
                '_id': 0,
                'user_id': 1,
                'user_name': 1,
                'user_type_id': { '$first': '$user.user_type_id' },
                'point': { '$first': '$user.point' },
                'parent_id': { '$first': '$user.parent_id' },
                'parent_user_name': { '$first': '$user.parent_user_name' },
                'agents': { '$first': '$user.parent_level_ids' },
                'description': { '$concat': [rollBackText, '$description'] },
                'statement_type': statementType,
                'amount': user_p_l,
                'available_balance': user_available_balance_pl,
                'sport_id': 1,
                'sport_name': 1,
                'series_id': 1,
                'series_name': 1,
                'match_id': 1,
                'match_name': 1,
                'match_date': 1,
                'event_id': 1,
                'event_name': 1,
                'type': marketType,
                'isRollback': pIsRollback,
                'created_at': '$createdAt'
              }
            }
          ],
          'agents_account_statement_pl': [
            {
              '$unwind': '$agents_pl_distribution'
            },
            {
              '$replaceRoot': {
                'newRoot': {
                  '$mergeObjects': [{
                    '_id': '$agents_pl_distribution.user_id',
                    'sport_id': '$sport_id',
                    'sport_name': '$sport_name',
                    'series_id': '$series_id',
                    'series_name': '$series_name',
                    'match_id': '$match_id',
                    'match_name': '$match_name',
                    'match_date': '$match_date',
                    'event_id': '$event_id',
                    'event_name': '$event_name',
                    'description': '$description',
                    'createdAt': '$createdAt',
                  }, '$agents_pl_distribution']
                }
              }
            },
            {
              '$group': {
                '_id': '$_id',
                'user_id': { '$first': '$_id' },
                'sport_id': { '$first': '$sport_id' },
                'sport_name': { '$first': '$sport_name' },
                'series_id': { '$first': '$series_id' },
                'series_name': { '$first': '$series_name' },
                'match_id': { '$first': '$match_id' },
                'match_name': { '$first': '$match_name' },
                'match_date': { '$first': '$match_date' },
                'event_id': { '$first': '$event_id' },
                'event_name': { '$first': '$event_name' },
                'description': { '$first': '$description' },
                'createdAt': { '$first': '$createdAt' },
                'amount': {
                  '$sum': '$p_l'
                }
              }
            },
            {
              '$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': '_id',
                'as': 'user'
              }
            },
            {
              '$project': {
                '_id': 0,
                'user_id': 1,
                'user_name': { '$first': '$user.user_name' },
                'user_type_id': { '$first': '$user.user_type_id' },
                'point': { '$first': '$user.point' },
                'parent_id': { '$first': '$user.parent_id' },
                'parent_user_name': { '$first': '$user.parent_user_name' },
                'agents': { '$first': '$user.parent_level_ids' },
                'description': { '$replaceOne': { 'input': { '$replaceOne': { 'input': { '$concat': [rollBackText, '$description'] }, 'find': "odd Loss", 'replacement': "" } }, 'find': "odd Profit", 'replacement': "" } },
                'statement_type': statementType,
                'amount': agent_p_l,
                'available_balance': agent_available_balance_pl,
                'sport_id': 1,
                'sport_name': 1,
                'series_id': 1,
                'series_name': 1,
                'match_id': 1,
                'match_name': 1,
                'match_date': 1,
                'event_id': 1,
                'event_name': 1,
                'type': marketType,
                'isRollback': pIsRollback,
                'created_at': '$createdAt'
              }
            }
          ],
          'users_account_statement_comm': [
            {
              '$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': '_id',
                'as': 'user'
              }
            },
            {
              '$project': {
                '_id': 0,
                'user_id': 1,
                'user_name': 1,
                'user_type_id': { '$first': '$user.user_type_id' },
                'point': { '$first': '$user.point' },
                'parent_id': { '$first': '$user.parent_id' },
                'parent_user_name': { '$first': '$user.parent_user_name' },
                'agents': { '$first': '$user.parent_level_ids' },
                'description': { '$concat': [rollBackText, 'Commission on ', '$description'] },
                'statement_type': statementTypeComm,
                'amount': user_comm,
                'available_balance': user_available_balance_comm,
                'sport_id': 1,
                'sport_name': 1,
                'series_id': 1,
                'series_name': 1,
                'match_id': 1,
                'match_name': 1,
                'match_date': 1,
                'event_id': 1,
                'event_name': 1,
                'type': marketType,
                'isRollback': pIsRollback,
                'created_at': '$createdAt'
              }
            }
          ],
          'agents_account_statement_comm': [
            {
              '$unwind': '$agents_pl_distribution'
            },
            {
              '$replaceRoot': {
                'newRoot': {
                  '$mergeObjects': [{
                    '_id': '$agents_pl_distribution.user_id',
                    'sport_id': '$sport_id',
                    'sport_name': '$sport_name',
                    'series_id': '$series_id',
                    'series_name': '$series_name',
                    'match_id': '$match_id',
                    'match_name': '$match_name',
                    'match_date': '$match_date',
                    'event_id': '$event_id',
                    'event_name': '$event_name',
                    'description': '$description',
                    'createdAt': '$createdAt',
                  }, '$agents_pl_distribution']
                }
              }
            },
            {
              '$group': {
                '_id': '$_id',
                'user_id': { '$first': '$_id' },
                'sport_id': { '$first': '$sport_id' },
                'sport_name': { '$first': '$sport_name' },
                'series_id': { '$first': '$series_id' },
                'series_name': { '$first': '$series_name' },
                'match_id': { '$first': '$match_id' },
                'match_name': { '$first': '$match_name' },
                'match_date': { '$first': '$match_date' },
                'event_id': { '$first': '$event_id' },
                'event_name': { '$first': '$event_name' },
                'description': { '$first': '$description' },
                'createdAt': { '$first': '$createdAt' },
                'p_l': {
                  '$sum': '$p_l'
                },
                'commission': {
                  '$sum': '$commission'
                }
              }
            },
            {
              '$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': '_id',
                'as': 'user'
              }
            },
            {
              '$project': {
                '_id': 0,
                'user_id': 1,
                'user_name': { '$first': '$user.user_name' },
                'user_type_id': { '$first': '$user.user_type_id' },
                'point': { '$first': '$user.point' },
                'parent_id': { '$first': '$user.parent_id' },
                'parent_user_name': { '$first': '$user.parent_user_name' },
                'agents': { '$first': '$user.parent_level_ids' },
                'description': { '$replaceOne': { 'input': { '$replaceOne': { 'input': { '$concat': [rollBackText, 'Commission on ', '$description'] }, 'find': "odd Loss", 'replacement': "" } }, 'find': "odd Profit", 'replacement': "" } },
                'statement_type': statementTypeComm,
                'amount': agent_comm,
                'available_balance': agent_available_balance_comm,
                'sport_id': 1,
                'sport_name': 1,
                'series_id': 1,
                'series_name': 1,
                'match_id': 1,
                'match_name': 1,
                'match_date': 1,
                'event_id': 1,
                'event_name': 1,
                'type': marketType,
                'isRollback': pIsRollback,
                'created_at': '$createdAt'
              }
            }
          ]
        }
      }
    ]
  },
  account_statementsV2_casino: function (bet_result_id, pIsFancy = 0, pIsRollback = '0', statement_for) {
    var statementType = '2', statementTypeComm = '3', marketType = '1', rollBackText = '';
    if (pIsFancy == 1) {
      statementType = '4';
      statementTypeComm = '5';
      marketType = '2';
    }
    let user_p_l = { '$round': ['$user_pl', 2] }, user_available_balance_pl = { '$round': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }, 2] };
    let user_comm = { '$round': ['$user_commission_pl', 2] }, user_available_balance_comm = { '$round': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$user_commission_pl'] }, 2] };
    let agent_p_l = { '$round': ['$amount', 2] }, agent_available_balance_pl = { '$round': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$amount'] }, 2] };
    let agent_comm = { '$round': ['$commission', 2] }, agent_available_balance_comm = { '$round': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$p_l', '$commission'] }, 2] };
    let user_pl_user_commission = { '$round': [{ '$add': ['$user_pl', '$user_commission_pl'] }, 2] };
    let agent_added_pl = { '$round': ['$added_pl', 2] };
    let agent_added_comm = { '$round': ['$added_comm', 2] };
    if (pIsRollback == '1') {
      rollBackText = 'Rollback Result: ';
      user_p_l = { '$round': [{ '$multiply': ['$user_pl', -1] }, 2] };
      user_available_balance_pl = { '$round': [{ '$subtract': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }] }, 2] };
      user_comm = { '$round': [{ '$multiply': ['$user_commission_pl', -1] }, 2] };
      user_available_balance_comm = { '$round': [{ '$subtract': [{ '$subtract': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }] }, '$user_commission_pl'] }, 2] };

      agent_p_l = { '$round': [{ '$multiply': ['$amount', -1] }, 2] };
      agent_available_balance_pl = { '$round': [{ '$subtract': ['$amount', { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }] }, 2] };
      agent_comm = { '$round': [{ '$multiply': ['$commission', -1] }, 2] };
      agent_available_balance_comm = { '$round': [{ '$subtract': [{ '$subtract': ['$p_l', '$commission'] }, { '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }] }, 2] };
      user_pl_user_commission = { '$multiply': [{ '$round': [{ '$add': ['$user_pl', '$user_commission_pl'] }, 2] }, -1] };

      agent_added_pl = { '$multiply': [{ '$round': ['$added_pl', 2] }, -1] };
      agent_added_comm = { '$multiply': [{ '$round': ['$added_comm', 2] }, -1] };
    }
    if (statement_for == "USERS")
      return [
        {
          '$match': {
            'bet_result_id': ObjectId(bet_result_id),
            '$or': [{ 'user_pl': { '$ne': 0 } }, { 'user_commission_pl': { '$ne': 0 } }]
          }
        },
        {
          '$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': '_id',
            'as': 'user'
          }
        },
        {
          '$project': {
            '_id': 0,
            'user_id': 1,
            'user_name': 1,
            'user_type_id': { '$first': '$user.user_type_id' },
            'point': { '$first': '$user.point' },
            'parent_id': { '$first': '$user.parent_id' },
            'parent_user_name': { '$first': '$user.parent_user_name' },
            'agents': { '$first': '$user.parent_level_ids' },
            'description': { '$concat': [rollBackText, '$description'] },
            'description_comm': { '$concat': [rollBackText, 'Commission on ', '$description'] },
            'statement_type': statementType,
            'statement_type_comm': statementTypeComm,
            'amount': user_p_l,
            'amount_comm': user_comm,
            'available_balance': user_available_balance_pl,
            'available_balance_comm': user_available_balance_comm,
            'domain_name': 1,
            'sport_id': 1,
            'casinoProvider': 1,
            'sport_name': 1,
            'series_id': 1,
            'series_name': 1,
            'match_id': 1,
            'match_name': 1,
            'match_date': 1,
            'event_id': 1,
            'event_name': 1,
            'type': marketType,
            'isRollback': pIsRollback,
            'created_at': '$createdAt'
          }
        },
        {
          '$addFields': {
            'user_pl': { '$round': [{ '$add': ['$amount', '$amount_comm'] }, 2] }
          }
        }
      ];
    else
      return [
        {
          '$match': {
            'bet_result_id': ObjectId(bet_result_id),
            'is_demo': false
          }
        },
        {
          '$unwind': '$agents_pl_distribution'
        },
        {
          '$replaceRoot': {
            'newRoot': {
              '$mergeObjects': [{
                '_id': '$agents_pl_distribution.user_id',
                'domain_name': '$domain_name',
                'sport_id': '$sport_id',
                'casinoProvider': '$casinoProvider',
                'sport_name': '$sport_name',
                'series_id': '$series_id',
                'series_name': '$series_name',
                'match_id': '$match_id',
                'match_name': '$match_name',
                'match_date': '$match_date',
                'event_id': '$event_id',
                'event_name': '$event_name',
                'description': '$description',
                'createdAt': '$createdAt',
                // Ukraine Concept
                'user_pl': '$user_pl',
                'user_commission_pl': '$user_commission_pl',
              }, '$agents_pl_distribution']
            }
          }
        },
        {
          '$group': {
            '_id': '$_id',
            'user_id': { '$first': '$_id' },
            'domain_name': { '$first': '$domain_name' },
            'sport_id': { '$first': '$sport_id' },
            'casinoProvider': { '$first': '$casinoProvider' },
            'sport_name': { '$first': '$sport_name' },
            'series_id': { '$first': '$series_id' },
            'series_name': { '$first': '$series_name' },
            'match_id': { '$first': '$match_id' },
            'match_name': { '$first': '$match_name' },
            'match_date': { '$first': '$match_date' },
            'event_id': { '$first': '$event_id' },
            'event_name': { '$first': '$event_name' },
            'description': { '$first': '$description' },
            'createdAt': { '$first': '$createdAt' },
            'amount': {
              '$sum': '$p_l'
            },
            'p_l': {
              '$sum': '$p_l'
            },
            'added_pl': {
              '$sum': { '$round': ['$added_pl', 2] }
            },
            'commission': {
              '$sum': '$commission'
            },
            'added_comm': {
              '$sum': { '$round': ['$added_comm', 2] }
            },
            // Ukraine Concept
            "user_pl": {
              "$sum": "$user_pl"
            },
            "user_commission_pl": {
              "$sum": "$user_commission_pl"
            }
          }
        },
        {
          '$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': '_id',
            'as': 'user'
          }
        },
        {
          '$project': {
            '_id': 0,
            'user_id': 1,
            'user_name': { '$first': '$user.user_name' },
            'user_type_id': { '$first': '$user.user_type_id' },
            'point': { '$first': '$user.point' },
            'parent_id': { '$first': '$user.parent_id' },
            'parent_user_name': { '$first': '$user.parent_user_name' },
            'agents': { '$first': '$user.parent_level_ids' },
            'description': { '$replaceOne': { 'input': { '$replaceOne': { 'input': { '$concat': [rollBackText, '$description'] }, 'find': "odd Loss", 'replacement': "" } }, 'find': "odd Profit", 'replacement': "" } },
            'description_comm': { '$replaceOne': { 'input': { '$replaceOne': { 'input': { '$concat': [rollBackText, 'Commission on ', '$description'] }, 'find': "odd Loss", 'replacement': "" } }, 'find': "odd Profit", 'replacement': "" } },
            'statement_type': statementType,
            'statement_type_comm': statementTypeComm,
            'amount': agent_p_l,
            'amount_comm': agent_comm,
            'available_balance': agent_available_balance_pl,
            'available_balance_comm': agent_available_balance_comm,
            'domain_name': 1,
            'sport_id': 1,
            'casinoProvider': 1,
            'sport_name': 1,
            'series_id': 1,
            'series_name': 1,
            'match_id': 1,
            'match_name': 1,
            'match_date': 1,
            'event_id': 1,
            'event_name': 1,
            'type': marketType,
            'isRollback': pIsRollback,
            'created_at': '$createdAt',
            // Ukraine Concept
            "user_pl": user_pl_user_commission,
            "added_pl": agent_added_pl,
            "added_comm": agent_added_comm,
          }
        },
        {
          '$addFields': {
            'p_l': { '$round': [{ '$add': ['$amount', '$amount_comm'] }, 2] }
          }
        }
      ];
  },
  account_statementsV2: function (bet_result_id, pIsFancy = 0, pIsRollback = '0', statement_for) {
    var statementType = '2', statementTypeComm = '3', marketType = '1', rollBackText = '';
    if (pIsFancy == 1) {
      statementType = '4';
      statementTypeComm = '5';
      marketType = '2';
    }
    let user_p_l = { '$round': ['$user_pl', 2] },
      user_available_balance_pl = {
        "$round": [
          {
            "$add": [
              {
                "$first": "$user.balance"
              },
              {
                "$abs": {
                  "$first": "$user.liability"
                }
              },
              "$user_pl"
            ]
          },
          2
        ]
      };
    let user_comm = { '$round': ['$user_commission_pl', 2] }, user_available_balance_comm = { '$round': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }, '$user_pl', '$user_commission_pl'] }, 2] };
    let agent_p_l = { '$round': ['$amount', 2] },
      agent_available_balance_pl = {
        "$round": [
          {
            "$add": [
              {
                "$first": "$user.balance"
              },
              {
                "$first": "$user.profit_loss"
              },
              {
                "$abs": {
                  "$first": "$user.liability"
                }
              },
              "$amount"
            ]
          },
          2
        ]
      };
    let agent_comm = { '$round': ['$commission', 2] },
      agent_available_balance_comm = {
        "$round": [
          {
            "$add": [
              {
                "$first": "$user.balance"
              },
              {
                "$first": "$user.profit_loss"
              },
              {
                "$abs": {
                  "$first": "$user.liability"
                }
              },
              "$p_l",
              "$commission"
            ]
          },
          2
        ]
      };
    let user_pl_user_commission = { '$round': [{ '$add': ['$user_pl', '$user_commission_pl'] }, 2] };
    let agent_added_pl = { '$round': ['$added_pl', 2] };
    let agent_added_comm = { '$round': ['$added_comm', 2] };
    if (pIsRollback == '1') {
      rollBackText = 'Rollback Result: ';
      user_p_l = { '$round': [{ '$multiply': ['$user_pl', -1] }, 2] };
      user_available_balance_pl = {
        "$round": [
          {
            "$subtract": [
              {
                "$add": [
                  {
                    "$first": "$user.balance"
                  },
                  {
                    "$abs": {
                      "$first": "$user.liability"
                    }
                  }
                ]
              },
              "$user_pl"
            ]
          },
          2
        ]
      };
      user_comm = { '$round': [{ '$multiply': ['$user_commission_pl', -1] }, 2] };
      user_available_balance_comm = { '$round': [{ '$subtract': [{ '$subtract': [{ '$add': [{ '$first': '$user.balance' }, { '$abs': { '$first': '$user.liability' } }] }, '$user_pl'] }, '$user_commission_pl'] }, 2] };

      agent_p_l = { '$round': [{ '$multiply': ['$amount', -1] }, 2] };
      agent_available_balance_pl = {
        "$round": [
          {
            "$subtract": [
              {
                "$add": [
                  {
                    "$first": "$user.balance"
                  },
                  {
                    "$first": "$user.profit_loss"
                  },
                  {
                    "$abs": {
                      "$first": "$user.liability"
                    }
                  }
                ]
              },
              "$amount",
            ]
          },
          2
        ]
      };
      agent_comm = { '$round': [{ '$multiply': ['$commission', -1] }, 2] };
      agent_available_balance_comm = {
        "$round": [
          {
            "$subtract": [
              {
                "$add": [
                  {
                    "$first": "$user.balance"
                  },
                  {
                    "$first": "$user.profit_loss"
                  },
                  {
                    "$abs": {
                      "$first": "$user.liability"
                    }
                  }
                ]
              },
              {
                "$add": [
                  "$p_l",
                  "$commission"
                ]
              }
            ]
          },
          2
        ]
      };
      user_pl_user_commission = { '$multiply': [{ '$round': [{ '$add': ['$user_pl', '$user_commission_pl'] }, 2] }, -1] };

      agent_added_pl = { '$multiply': [{ '$round': ['$added_pl', 2] }, -1] };
      agent_added_comm = { '$multiply': [{ '$round': ['$added_comm', 2] }, -1] };
    }
    if (statement_for == "USERS")
      return [
        {
          '$match': {
            'bet_result_id': ObjectId(bet_result_id),
            '$or': [{ 'user_pl': { '$ne': 0 } }, { 'user_commission_pl': { '$ne': 0 } }]
          }
        },
        {
          '$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': '_id',
            'as': 'user'
          }
        },
        {
          '$project': {
            '_id': 0,
            'user_id': 1,
            'user_name': 1,
            'user_type_id': { '$first': '$user.user_type_id' },
            'is_demo': 1,
            'point': { '$first': '$user.point' },
            'parent_id': { '$first': '$user.parent_id' },
            'parent_user_name': { '$first': '$user.parent_user_name' },
            'agents': { '$first': '$user.parent_level_ids' },
            'description': { '$concat': [rollBackText, '$description'] },
            'description_comm': { '$concat': [rollBackText, 'Commission on ', '$description'] },
            'statement_type': statementType,
            'statement_type_comm': statementTypeComm,
            'amount': user_p_l,
            'amount_comm': user_comm,
            'available_balance': user_available_balance_pl,
            'available_balance_comm': user_available_balance_comm,
            'domain_name': 1,
            'sport_id': 1,
            'sport_name': 1,
            'series_id': 1,
            'series_name': 1,
            'match_id': 1,
            'match_name': 1,
            'match_date': 1,
            'event_id': 1,
            'event_name': 1,
            'market_type': 1,
            'type': marketType,
            'isRollback': pIsRollback,
            'created_at': '$createdAt',
            'auraMarketId': 1,
            'auraRountId': 1,
          }
        },
        {
          '$addFields': {
            'user_pl': { '$round': [{ '$add': ['$amount', '$amount_comm'] }, 2] }
          }
        }
      ];
    else
      return [
        {
          '$match': {
            'bet_result_id': ObjectId(bet_result_id),
            'is_demo': false
          }
        },
        {
          '$unwind': '$agents_pl_distribution'
        },
        {
          '$replaceRoot': {
            'newRoot': {
              '$mergeObjects': [{
                '_id': '$agents_pl_distribution.user_id',
                'domain_name': '$domain_name',
                'sport_id': '$sport_id',
                'sport_name': '$sport_name',
                'series_id': '$series_id',
                'series_name': '$series_name',
                'match_id': '$match_id',
                'match_name': '$match_name',
                'match_date': '$match_date',
                'event_id': '$event_id',
                'event_name': '$event_name',
                'market_type': '$market_type',
                'description': '$description',
                'createdAt': '$createdAt',
                // Ukraine Concept
                'user_pl': '$user_pl',
                'user_commission_pl': '$user_commission_pl',
                'auraMarketId': '$auraMarketId',
                'auraRountId': '$auraRountId',
              }, '$agents_pl_distribution']
            }
          }
        },
        {
          '$group': {
            '_id': '$_id',
            'user_id': { '$first': '$_id' },
            'domain_name': { '$first': '$domain_name' },
            'sport_id': { '$first': '$sport_id' },
            'sport_name': { '$first': '$sport_name' },
            'series_id': { '$first': '$series_id' },
            'series_name': { '$first': '$series_name' },
            'match_id': { '$first': '$match_id' },
            'match_name': { '$first': '$match_name' },
            'match_date': { '$first': '$match_date' },
            'event_id': { '$first': '$event_id' },
            'event_name': { '$first': '$event_name' },
            'market_type': { '$first': '$market_type' },
            'description': { '$first': '$description' },
            'createdAt': { '$first': '$createdAt' },
            'auraMarketId': { '$first': '$auraMarketId' },
            'auraRountId': { '$first': '$auraRountId' },
            'amount': {
              '$sum': '$p_l'
            },
            'p_l': {
              '$sum': '$p_l'
            },
            'added_pl': {
              '$sum': { '$round': ['$added_pl', 2] }
            },
            'commission': {
              '$sum': '$commission'
            },
            'added_comm': {
              '$sum': { '$round': ['$added_comm', 2] }
            },
            // Ukraine Concept
            "user_pl": {
              "$sum": "$user_pl"
            },
            "user_commission_pl": {
              "$sum": "$user_commission_pl"
            }
          }
        },
        {
          '$lookup': {
            'from': 'users',
            'localField': 'user_id',
            'foreignField': '_id',
            'as': 'user'
          }
        },
        {
          '$project': {
            '_id': 0,
            'user_id': 1,
            'user_name': { '$first': '$user.user_name' },
            'user_type_id': { '$first': '$user.user_type_id' },
            'point': { '$first': '$user.point' },
            'parent_id': { '$first': '$user.parent_id' },
            'parent_user_name': { '$first': '$user.parent_user_name' },
            'agents': { '$first': '$user.parent_level_ids' },
            'description': { '$replaceOne': { 'input': { '$replaceOne': { 'input': { '$concat': [rollBackText, '$description'] }, 'find': "odd Loss", 'replacement': "" } }, 'find': "odd Profit", 'replacement': "" } },
            'description_comm': { '$replaceOne': { 'input': { '$replaceOne': { 'input': { '$concat': [rollBackText, 'Commission on ', '$description'] }, 'find': "odd Loss", 'replacement': "" } }, 'find': "odd Profit", 'replacement': "" } },
            'statement_type': statementType,
            'statement_type_comm': statementTypeComm,
            'amount': agent_p_l,
            'amount_comm': agent_comm,
            'available_balance': agent_available_balance_pl,
            'available_balance_comm': agent_available_balance_comm,
            'domain_name': 1,
            'sport_id': 1,
            'sport_name': 1,
            'series_id': 1,
            'series_name': 1,
            'match_id': 1,
            'match_name': 1,
            'match_date': 1,
            'event_id': 1,
            'event_name': 1,
            'market_type': 1,
            'type': marketType,
            'isRollback': pIsRollback,
            'created_at': '$createdAt',
            'auraMarketId': 1,
            'auraRountId': 1,
            // Ukraine Concept
            "user_pl": user_pl_user_commission,
            "added_pl": agent_added_pl,
            "added_comm": agent_added_comm,
          }
        },
        {
          '$addFields': {
            'p_l': { '$round': [{ '$add': ['$amount', '$amount_comm'] }, 2] }
          }
        }
      ];
  },
  // here we update users(profit loss & balance) & its agents(profit loss).
  fn_update_balance_on_result: function (pBetResultId, pIsFancy, pIsRollback) {
    let user_pl_user_commission = { '$add': ['$user_pl', '$user_commission_pl'] }
      , agent_p_l = { '$add': ['$p_l', '$commission'] };
    if (pIsRollback == 1) {
      user_pl_user_commission = { '$multiply': [{ '$add': ['$user_pl', '$user_commission_pl'] }, -1] }
        , agent_p_l = {
          '$multiply': [
            { '$add': ['$p_l', '$commission'] }, -1
          ]
        };
    }
    let agents_pl = [
      {
        '$unwind': "$agents_pl_distribution"
      },
      {
        '$replaceRoot': {
          'newRoot': {
            '$mergeObjects': [{
              '_id': '$agents_pl_distribution.user_id',
              // Ukraine Concept
              'user_pl': '$user_pl',
              'user_commission_pl': '$user_commission_pl',
            }, '$agents_pl_distribution']
          }
        }
      },
      {
        '$group': {
          '_id': "$_id",
          'user_id': { '$first': "$_id" },
          'p_l': {
            '$sum': '$p_l'
          },
          'commission': {
            '$sum': '$commission'
          },
          // Ukraine Concept
          "user_pl": {
            "$sum": "$user_pl"
          },
          "user_commission_pl": {
            "$sum": "$user_commission_pl"
          }
        }
      },
      {
        '$project': {
          'user_id': "$user_id",
          'p_l': agent_p_l,
          // Ukraine Concept
          "user_pl": user_pl_user_commission,
        }
      }
    ];
    return [
      {
        '$match': {
          'bet_result_id': ObjectId(pBetResultId)
        }
      },
      {
        '$facet': {
          'users_pl': [
            {
              '$project': {
                '_id': 0,
                'user_id': 1,
                'user_pl': user_pl_user_commission
              }
            }
          ],
          'agents_pl': agents_pl
        }
      }
    ];
  },
  fnSaveOddsProfitLoss: function (match) {
    return [
      match
      , {
        '$addFields': {
          'runners': {
            '$map': {
              'input': '$runners',
              'as': 'row',
              'in': {
                'selection_id': '$$row.selection_id',
                'name': '$$row.name',
                'stack': {
                  '$cond': {
                    'if': {
                      '$eq': [
                        '$$row.selection_id', '$selection_id'
                      ]
                    },
                    'then': {
                      '$cond': [
                        {
                          '$eq': [
                            '$is_back', 0
                          ]
                        }, '$liability', '$stack'
                      ]
                    },
                    'else': 0
                  }
                },
                'is_back': '$is_back',
                'win_value': {
                  '$cond': {
                    'if': {
                      '$eq': [
                        '$$row.selection_id', '$selection_id'
                      ]
                    },
                    'then': {
                      '$cond': [
                        { '$eq': ['$is_matched', 0] },
                        0,
                        {
                          '$cond': [
                            { '$eq': ['$is_back', 0] },
                            '$liability', '$p_l'
                          ]
                        }
                      ],
                    },
                    'else': 0
                  }
                },
                'loss_value': {
                  '$cond': {
                    'if': {
                      '$eq': [
                        '$$row.selection_id', '$selection_id'
                      ]
                    },
                    'then': 0,
                    'else': {
                      '$cond': [
                        { '$eq': ['$is_matched', 0] },
                        0,
                        {
                          '$cond': [
                            {
                              '$eq': [
                                '$is_back', 0
                              ]
                            }, '$p_l', {
                              '$multiply': [
                                '$stack', -1
                              ]
                            }
                          ]
                        }
                      ],
                    }
                  }
                },
                'unmatched_win_value': {
                  '$cond': [
                    { '$eq': ['$is_matched', 1] },
                    0,
                    {
                      '$cond': [
                        { '$eq': ['$is_back', 0] },
                        {
                          '$cond': [
                            { '$eq': ['$$row.selection_id', '$selection_id'] },
                            0,
                            '$p_l'
                          ]
                        },
                        {
                          '$cond': [
                            { '$eq': ['$$row.selection_id', '$selection_id'] },
                            '$p_l',
                            0
                          ]
                        }
                      ]
                    }
                  ],
                },
                'unmatched_loss_value': {
                  '$cond': [
                    { '$eq': ['$is_matched', 1] },
                    0,
                    {
                      '$cond': [
                        { '$eq': ['$is_back', 0] },
                        {
                          '$cond': [
                            { '$eq': ['$$row.selection_id', '$selection_id'] },
                            '$liability',
                            0,
                          ]
                        },
                        {
                          '$cond': [
                            { '$eq': ['$$row.selection_id', '$selection_id'] },
                            0,
                            '$liability',
                          ]
                        }
                      ]
                    }
                  ],
                },
                'distribution': {
                  '$map': {
                    'input': '$distribution',
                    'as': 'distribution',
                    'in': {
                      'user_id': '$$distribution.user_id',
                      'user_type_id': '$$distribution.user_type_id',
                      'index': '$$distribution.index',
                      'user_name': '$$distribution.user_name',
                      'share': '$$distribution.share',
                      'win_loss': {
                        '$add': [
                          {
                            '$ifNull': [
                              {
                                '$divide': [
                                  {
                                    '$multiply': [
                                      {
                                        '$multiply': [
                                          {
                                            '$cond': {
                                              'if': {
                                                '$eq': [
                                                  '$$row.selection_id', '$selection_id'
                                                ]
                                              },
                                              'then': {
                                                '$cond': [
                                                  { '$eq': ['$is_matched', 0] },
                                                  0,
                                                  {
                                                    '$cond': [
                                                      { '$eq': ['$is_back', 0] },
                                                      '$liability', '$p_l'
                                                    ]
                                                  }
                                                ],
                                              },
                                              'else': 0
                                            }
                                          }, -1
                                        ]
                                      }, '$$distribution.share'
                                    ]
                                  }, 100
                                ]
                              }, 0
                            ]
                          }, {
                            '$ifNull': [
                              {
                                '$divide': [
                                  {
                                    '$multiply': [
                                      {
                                        '$multiply': [
                                          {
                                            '$cond': {
                                              'if': {
                                                '$eq': [
                                                  '$$row.selection_id', '$selection_id'
                                                ]
                                              },
                                              'then': 0,
                                              'else': {
                                                '$cond': [
                                                  { '$eq': ['$is_matched', 0] },
                                                  0,
                                                  {
                                                    '$cond': [
                                                      {
                                                        '$eq': [
                                                          '$is_back', 0
                                                        ]
                                                      }, '$p_l', {
                                                        '$multiply': [
                                                          '$stack', -1
                                                        ]
                                                      }
                                                    ]
                                                  }
                                                ],
                                              }
                                            }
                                          }, -1
                                        ]
                                      }, '$$distribution.share'
                                    ]
                                  }, 100
                                ]
                              }, 0
                            ]
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }, {
        '$project': {
          'runners': 1,
          'stack': 1,
          'user_commission': 1,
          '_id': 0
        }
      }, {
        '$unwind': {
          'path': '$runners'
        }
      }, {
        '$group': {
          '_id': '$runners.selection_id',
          'win_loss_distribution': {
            '$push': '$runners.distribution'
          },
          'stack': {
            '$sum': '$runners.stack'
          },
          'win_value': {
            '$sum': '$runners.win_value'
          },
          'loss_value': {
            '$sum': '$runners.loss_value'
          },
          'unmatched_win_value': {
            '$sum': '$runners.unmatched_win_value'
          },
          'unmatched_loss_value': {
            '$sum': '$runners.unmatched_loss_value'
          },
          'stacks_sum': {
            '$sum': '$stack'
          },
          'user_commission': {
            '$first': '$user_commission'
          },
        }
      }, {
        '$unwind': {
          'path': '$win_loss_distribution'
        }
      }, {
        '$unwind': {
          'path': '$win_loss_distribution'
        }
      }, {
        '$replaceRoot': {
          'newRoot': {
            '$mergeObjects': [
              {
                '_id': '$_id',
                'win_value': '$win_value',
                'loss_value': '$loss_value',
                'unmatched_win_value': '$unmatched_win_value',
                'unmatched_loss_value': '$unmatched_loss_value',
                'stack': '$stack',
                'stacks_sum': '$stacks_sum',
                'user_commission': '$user_commission',
                'match_commission': '$user_commission',
              }, '$win_loss_distribution'
            ]
          }
        }
      }, {
        '$project': {
          'win_loss': {
            '$round': [
              '$win_loss', 2
            ]
          },
          'win_value': 1,
          'loss_value': 1,
          'unmatched_win_value': 1,
          'unmatched_loss_value': 1,
          'stack': 1,
          'user_id': 1,
          'user_type_id': 1,
          'index': 1,
          'user_name': 1,
          'share': 1,
          'stacks_sum': 1,
          'user_commission': 1,
          'match_commission': 1,
        }
      }, {
        '$group': {
          '_id': {
            'user_name': '$user_name',
            'selection_id': '$_id'
          },
          'user_type_id': {
            '$first': '$$CURRENT.user_type_id'
          },
          'index': {
            '$first': '$$CURRENT.index'
          },
          'user_name': {
            '$first': '$$CURRENT.user_name'
          },
          'user_id': {
            '$first': '$$CURRENT.user_id'
          },
          'share': {
            '$first': '$$CURRENT.share'
          },
          'win_loss': {
            '$sum': '$win_loss'
          },
          'stack': {
            '$first': '$stack'
          },
          'win_value': {
            '$first': '$win_value'
          },
          'loss_value': {
            '$first': '$loss_value'
          },
          'unmatched_win_value': {
            '$first': '$unmatched_win_value'
          },
          'unmatched_loss_value': {
            '$first': '$unmatched_loss_value'
          },
          'stacks_sum': {
            '$first': '$stacks_sum'
          },
          'user_commission': {
            '$first': '$user_commission'
          },
          'match_commission': {
            '$first': '$match_commission'
          },
        }
      }, {
        '$sort': {
          'index': 1
        }
      }, {
        '$group': {
          '_id': '$_id.selection_id',
          'selection_id': {
            '$first': '$_id.selection_id'
          },
          'win_loss_distribution': {
            '$push': {
              'user_id': '$user_id',
              'user_name': '$user_name',
              'user_type_id': '$user_type_id',
              'win_loss': '$win_loss',
              'p_l': '$win_loss',
              'share': '$share',
              'match_commission': '$match_commission',
              'index': '$index'
            }
          },
          'win_loss': {
            '$sum': {
              '$multiply': [
                '$win_loss', -1
              ]
            }
          },
          'stack': {
            '$first': '$stack'
          },
          'win_value': {
            '$first': '$win_value'
          },
          'loss_value': {
            '$first': '$loss_value'
          },
          'unmatched_win_value': {
            '$first': '$unmatched_win_value'
          },
          'unmatched_loss_value': {
            '$first': '$unmatched_loss_value'
          },
          'stacks_sum': {
            '$first': '$stacks_sum'
          },
          'user_commission': {
            '$first': '$user_commission'
          },
        }
      }, {
        '$addFields': {
          'user_pl': '$win_loss'
        }
      }, {
        '$project': {
          '_id': 0
        }
      }
    ]
  },
  getExposuresQuery: function (markets, fancies) {
    return [
      {
        '$match': {
          'market_id': {
            '$in': markets
          },
          'bet_count': {
            '$ne': 0
          },
          'bet_result_id': {
            '$eq': null
          },
          'is_result_declared': {
            '$eq': 0
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "sport_id": 1,
          "sport_name": 1,
          "series_id": 1,
          "series_name": 1,
          "match_id": 1,
          "match_name": 1,
          "event_name": "$market_name",
          "event_id": "$market_id",
          "type": "Market"
        }
      },
      {
        '$unionWith': {
          'coll': 'fancies',
          'pipeline': [
            {
              '$match': {
                'fancy_id': {
                  '$in': fancies
                },
                'bet_count': {
                  '$ne': 0
                },
                'bet_result_id': {
                  '$eq': null
                },
                'is_result_declared': {
                  '$eq': 0
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "sport_id": 1,
                "sport_name": 1,
                "series_id": 1,
                "series_name": 1,
                "match_id": 1,
                "match_name": 1,
                "event_name": "$fancy_name",
                "event_id": "$fancy_id",
                "type": "Fancy"
              }
            }
          ]
        }
      },
      {
        '$sort': {
          'match_id': 1
        }
      }
    ]
  },
  getEventsHavingLiability: function (markets, fancies) {
    return [
      {
        '$match': {
          'market_id': {
            '$in': markets
          },
          'bet_count': {
            '$ne': 0
          },
          'bet_result_id': {
            '$eq': null
          },
          'is_result_declared': {
            '$eq': 0
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "event_id": "$market_id",
          "type": "Market"
        }
      },
      {
        '$unionWith': {
          'coll': 'fancies',
          'pipeline': [
            {
              '$match': {
                'fancy_id': {
                  '$in': fancies
                },
                'bet_count': {
                  '$ne': 0
                },
                'bet_result_id': {
                  '$eq': null
                },
                'is_result_declared': {
                  '$eq': 0
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "event_id": "$fancy_id",
                "type": "Fancy"
              }
            }
          ]
        }
      },
      {
        '$sort': {
          'match_id': 1
        }
      }
    ]
  },
  getExposuresV2Query: function (data) {
    let { user_id, userTypeId, isOnlyExposure } = data;
    let marketMatchConditions, fancyMatchConditions;
    let groupLiabilityConditions = {
      "_id": null,
      "liabilitySum": {
        "$sum": "$liability"
      },
    }
    let projectConditions = {
      "_id": 0,
      "liabilitySum": 1,
    }
    if (!isOnlyExposure) {
      groupLiabilityConditions = { ...groupLiabilityConditions, data: { $push: "$$ROOT" } };
      projectConditions = { ...projectConditions, "data": 1 };
    }
    if (userTypeId == USER_TYPE_USER) { // users panel
      let matchFields = { "$match": { user_id, is_active: true } };
      marketMatchConditions = matchFields;
      fancyMatchConditions = matchFields;
    }
    else { // agents panel
      let matchQuerry = { is_active: true }
      marketMatchConditions = { "$match": { ...matchQuerry, "win_loss_distribution.user_id": user_id } };
      fancyMatchConditions = { "$match": { ...matchQuerry, "distribution.user_id": user_id } };
    }
    return [
      { ...marketMatchConditions }, {
        $group: {
          _id: '$market_id',
          "doc": {
            "$min": {
              "win_loss": "$win_loss",
              "max_liability": "$max_liability",
              "market_id": "$market_id",
              "market_name": "$market_name",
              "sport_id": "$sport_id",
              "sport_name": "$sport_name",
              "series_id": "$series_id",
              "series_name": "$series_name",
              "match_id": "$match_id",
              "match_name": "$match_name",
              "selection_id": "$selection_id",
              "selection_name": "$selection_name",
            }
          },
        }
      },
      { "$replaceRoot": { "newRoot": "$doc" } },
      {
        "$project": {
          "_id": 0,
          "event_id": "$market_id",
          "event_name": "$market_name",
          "sport_id": 1,
          "sport_name": 1,
          "series_id": 1,
          "series_name": 1,
          "match_id": 1,
          "match_name": 1,
          "selection_id": 1,
          "selection_name": 1,
          "liability": "$max_liability",
          "type": "Market",
        }
      },
      {
        $unionWith: {
          coll: "fancy_score_positions",
          pipeline: [
            { ...fancyMatchConditions },
            {
              "$project": {
                "_id": 0,
                "event_id": "$fancy_id",
                "event_name": "$fancy_name",
                "sport_id": 1,
                "sport_name": 1,
                "series_id": 1,
                "series_name": 1,
                "match_id": 1,
                "match_name": 1,
                "selection_id": 1,
                "selection_name": "$fancy_name",
                "liability": "$liability",
                "type": "Fancy"
              }
            }
          ]
        }
      },
      { $group: groupLiabilityConditions },
      { $project: projectConditions }
    ]
  },
  casinoExposures: function (request) {

    let { user_id } = request.body;

    user_id = user_id ? user_id : request.User.user_id.toString();

    let filter = { isProcessed: 0 };

    // If user wants to see the active exposure.
    if (request.User.user_type_id == USER_TYPE_USER) {

      filter["userId"] = user_id;

      // If super admin want to see the specific user active exposure.
    } else if (request.User.user_type_id == USER_TYPE_SUPER_ADMIN) {

      // If super admin user id is not equal to self id.
      if (user_id != request.User.user_id) {
        filter["userId"] = user_id;
      }

    } else {

      // If agent want to see their users exposure.
      filter["parentLevels.user_id"] = ObjectId(request.User.user_id);
      if (user_id != request.User.user_id) {
        if (user_id) {
          filter["userId"] = user_id;
        }
      }

    }

    let matchConditions = { "$match": filter };

    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 0,
          "sportName": 1,
          "userName": 1,
          "userId": 1,
          "marketType": 1,
          "matchName": 1,
          "marketId": 1,
          "marketName": 1,
          "roundId": 1,
          "calculateExposure": 1,
          "operatorId": 1,
          "exposureTime": "$updatedAt"
        }
      },
      {
        '$unionWith': {
          'coll': 'universal_casino_calculated_exposures',
          'pipeline': [
            {
              ...matchConditions
            },
            {
              '$project': {
                "_id": 0,
                "sportName": 1,
                "userName": 1,
                "userId": 1,
                "marketType": 1,
                "matchName": 1,
                "marketId": 1,
                "marketName": 1,
                "roundId": 1,
                "calculateExposure": 1,
                "operatorId": 1,
                "exposureTime": "$updatedAt"
              }
            }
          ]
        }
      },
      {
        "$group": {
          "_id": "$marketId",
          "sportName": { "$first": "$sportName" },
          "userName": { "$first": "$userName" },
          "userId": { "$push": "$userId" },
          "marketType": { "$first": "$marketType" },
          "matchName": { "$first": "$matchName" },
          "marketId": { "$first": "$marketId" },
          "marketName": { "$first": "$marketName" },
          "roundId": { "$first": "$roundId" },
          "calculateExposure": { "$sum": "$calculateExposure" },
          "operatorId": { "$first": "$operatorId" },
          "exposureTime": { "$first": "$exposureTime" }
        }
      },
      {
        "$facet": {
          "data": [
            {
              "$project": {
                "_id": 0,
                "sportName": 1,
                "userName": 1,
                "userId": 1,
                "marketType": 1,
                "matchName": 1,
                "marketId": 1,
                "marketName": 1,
                "roundId": 1,
                "calculateExposure": 1,
                "operatorId": 1,
                "exposureTime": 1,
              }
            }
          ],
          "metadata": [
            {
              "$group": {
                "_id": null,
                "exposureSum": {
                  "$sum": "$calculateExposure"
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "exposureSum": 1
              }
            }
          ]
        }
      },
      {
        "$project": {
          "liabilitySum": { "$arrayElemAt": ["$metadata.exposureSum", 0] },
          "data": 1,
        }
      }
    ]
  },
  qtechExposures: function (request) {

    let { user_id } = request.joiData;
    const selfUserId = request.User._id.toString()
    user_id = user_id ? user_id : selfUserId;

    let filter = { isProcessed: 0, txnType: "DEBIT" };

    // If user wants to see the active exposure.
    if (request.User.user_type_id == USER_TYPE_USER) {

      filter["userId"] = ObjectId(selfUserId);

      // If super admin want to see the specific user active exposure.
    } else if (request.User.user_type_id == USER_TYPE_SUPER_ADMIN) {

      // If super admin user id is not equal to self id.
      if (user_id != selfUserId) {
        filter["userId"] = ObjectId(user_id);
      }

    } else {

      // If agent want to see their users exposure.
      filter["parent_level_ids.user_id"] = ObjectId(selfUserId);
      if (user_id != selfUserId) {
        if (user_id) {
          filter["userId"] = ObjectId(user_id);
        }
      }

    }

    let matchConditions = { "$match": filter };

    return [
      {
        ...matchConditions
      },
      {
        $group: {
          _id: "$roundId",
          roundId: { $first: "$roundId" },
          userId: { $first: "$userId" },
          providerCode: { $first: "$providerCode" },
          gameName: { $first: "$gameName" },
          createdAt: { $first: "$createdAt" },
          exposure: { $sum: { $abs: "$amount" } }
        }
      },  
      {
        $sort: { createdAt: -1 }
      },
      {
        "$facet": {
          "data": [
            {
              "$project": {
                "_id": 0,
                "roundId": 1,
                "userId": 1,
                "providerCode": 1,
                "gameName": 1,
                "exposure": 1,
                "createdAt": 1,
              }
            }
          ],
          "metadata": [
            {
              "$group": {
                "_id": null,
                "exposureSum": {
                  "$sum": "$exposure"
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "exposureSum": 1
              }
            }
          ]
        }
      },
      {
        "$project": {
          "liabilitySum": { "$arrayElemAt": ["$metadata.exposureSum", 0] },
          "data": 1,
        }
      }
    ]
  },
}