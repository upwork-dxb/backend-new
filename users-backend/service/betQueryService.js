const { ObjectId } = require("bson");

module.exports = {
  myBetsQuery: function (params) {
    let { user_id, match_id, limit, page, search, from_date, to_date } = params;

    let matchConditions = {
      "$match": {
        "user_id": ObjectId(user_id)
      }
    }

    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };

    if (match_id)
      matchConditions['$match']['match_id'] = match_id;
    if (params["IsSettledBets"])
      matchConditions["$match"]["bet_result_id"] = { '$ne': null };

    let fancyConditions = JSON.parse(JSON.stringify(matchConditions));
    fancyConditions['$match']['user_id'] = ObjectId(user_id);
    if (from_date && to_date)
      fancyConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };

    if (search) {
      if (search.constructor.name === "Object") {
        if (search["market_id"]) {
          if (!Array.isArray(search["market_id"]))
            search["market_id"] = search["market_id"].split(",");
          search["market_id"] = { "$in": search["market_id"] };
        }
        if (search["fancy_id"]) {
          if (!Array.isArray(search["fancy_id"]))
            search["fancy_id"] = search["fancy_id"].split(",");
          search["fancy_id"] = { "$in": search["fancy_id"] };
        }
        if (search["_id"]) {
          search["_id"] = ObjectId(search["_id"]);
        }
        Object.assign(matchConditions["$match"], search);
        Object.assign(fancyConditions["$match"], search);
      }
    }
    let skip = (page - 1) * limit;
    let query = [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 0,
          "bet_id": "$_id",
          "user_id": 1,
          "user_name": 1,
          "sport_name": 1,
          "sport_id": 1,
          "series_name": 1,
          "series_id": 1,
          "match_id": 1,
          "match_name": 1,
          "market_id": 1,
          "market_name": 1,
          "event_type": "$market_type",
          "selection_name": 1,
          "odds": 1,
          "stack": 1,
          "liability": 1,
          "profit": "$p_l",
          "p_l": '$chips',
          "chips": 1,
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
          "is_matched": 1,
          "size": 1,
          "createdAt": 1,
          "result_settled_at": 1,
          "is_result_declared": 1,
          "ip_address": 1,
          "device_info": 1,
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
                "sport_name": 1,
                "sport_id": 1,
                "series_name": 1,
                "series_id": 1,
                "match_id": 1,
                "match_name": 1,
                'market_id': '$fancy_id',
                'market_name': '$fancy_name',
                "event_type": "$category_name",
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
                'size': 1,
                'odds': '$run',
                'stack': 1,
                "liability": 1,
                "chips": 1,
                'is_back': 1,
                "profit": 1,
                'p_l': '$chips',
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
                'winner_name': '$result',
                'createdAt': 1,
                "is_matched": 1,
                "result_settled_at": 1,
                "is_result_declared": 1,
                "ip_address": 1,
                "device_info": 1,
              }
            }
          ]
        }
      },
      {
        '$sort': {
          '_id': -1,
          'createdAt': -1
        }
      }
    ]
    if (!params["IsBets"] && !params["IsPlBets"])
      query.push({
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
                      'then': { '$round': ['$chips', 2] },
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
      });
    return query;
  },
  oddsProfitLoss: function (user_id, market_id) {
    return [
      {
        '$match': {
          'market_id': market_id,
          'user_id': user_id,
          'delete_status': 0
        }
      }, {
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
                        '$is_back' == 0, '$liability', '$stack'
                      ]
                    },
                    'else': 0
                  }
                },
                'win_value': {
                  '$cond': {
                    'if': {
                      '$eq': [
                        '$$row.selection_id', '$selection_id'
                      ]
                    },
                    'then': {
                      '$cond': [
                        '$is_back' == 0, '$liability', '$p_l'
                      ]
                    },
                    'else': 0
                  }
                },
                'is_back': '$is_back',
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
                        '$is_back' == 0, '$p_l', {
                          '$multiply': [
                            '$stack', -1
                          ]
                        }
                      ]
                    }
                  }
                },
                'distribution': {
                  '$map': {
                    'input': '$distribution',
                    'as': 'distribution',
                    'in': {
                      'user_id': '$$distribution.user_id',
                      'user_type_id': '$$distribution.user_type_id',
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
                                                  '$is_back' == 0, '$liability', '$p_l'
                                                ]
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
                                                  '$is_back' == 0, '$p_l', {
                                                    '$multiply': [
                                                      '$stack', -1
                                                    ]
                                                  }
                                                ]
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
          '_id': 0
        }
      }, {
        '$unwind': {
          'path': '$runners'
        }
      }, {
        '$unwind': {
          'path': '$runners.distribution'
        }
      }, {
        '$group': {
          '_id': '$runners.selection_id',
          'win_loss_distribution': {
            '$push': '$runners.distribution'
          },
          'win_value': {
            '$sum': '$runners.win_value'
          },
          'loss_value': {
            '$sum': '$runners.loss_value'
          },
          'win_loss': {
            '$sum': '$runners.distribution.win_loss'
          }
        }
      }, {
        '$unwind': {
          'path': '$win_loss_distribution'
        }
      }, {
        '$group': {
          '_id': {
            'user_name': '$win_loss_distribution.user_name',
            'selection_id': '$_id'
          },
          'win_value': {
            '$first': '$win_value'
          },
          'loss_value': {
            '$first': '$loss_value'
          },
          'win_loss': {
            '$first': '$win_loss'
          },
          'win_loss_distribution': {
            '$sum': '$win_loss_distribution.win_loss'
          }
        }
      }, {
        '$group': {
          '_id': '$_id.selection_id',
          'win_loss_distribution': {
            '$push': {
              'win_loss': '$win_loss_distribution',
              'user_name': '$_id.user_name'
            }
          },
          'win_value': {
            '$first': '$win_value'
          },
          'loss_value': {
            '$first': '$loss_value'
          },
          'win_loss': {
            '$first': '$win_loss'
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "selection_id": '$_id',
          "win_loss_distribution": "$win_loss_distribution",
          "win_value": "$win_value",
          "loss_value": "$loss_value",
          "win_loss": "$win_loss"
        }
      }
    ]
  },
  betsStackSumQuery: function (user_id, match_id, market_id) {
    return [
      {
        "$match": {
          "user_id": user_id,
          match_id,
          "market_id": market_id,
          "bet_result_id": null,
          "delete_status": 0
        }
      },
      {
        "$group": {
          "_id": "$user_id",
          "stackSum": {
            "$sum": "$stack"
          }
        }
      },
      {
        "$project": {
          "_id": 0,
        }
      }
    ];
  }
}