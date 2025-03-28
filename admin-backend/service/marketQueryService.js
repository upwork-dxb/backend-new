const { ObjectId } = require("bson");

module.exports = {
  getMarketQueryForAgents: function (match_id, sport_id, parentIds, user_id) {
    return [
      {
        "$match": {
          "match_id": match_id,
          "sport_id": sport_id,
          "is_active": 1
        }
      },
      {
        $lookup:
        {
          from: "deactivemarkets",
          localField: "market_id",
          foreignField: "market_id",
          as: "aliasDeactiveMarket"
        }
      },
      {
        "$addFields": {
          "is_created": 1
        }
      },
      {
        "$project": {
          "market_id": 1,
          "name": 1,
          "match_id": 1,
          "sport_id": 1,
          "is_created": 1,
          "is_active": {
            "$cond": [
              {
                "$in": [
                  user_id,
                  "$aliasDeactiveMarket.user_id"
                ]
              },
              0,
              1
            ]
          },
          "aliasDeactiveMarket": "$aliasDeactiveMarket.user_id"
        }
      },
      {
        $match: {
          aliasDeactiveMarket: { $nin: parentIds }
        }
      },
      {
        $project: {
          aliasDeactiveMarket: 0
        }
      },
      {
        "$sort": { "create_at": 1 }
      }
    ]
  },
  ResultQuery: function (params) {
    const { page, limit, search } = params;
    let matchConditions = { "$match": { 'bet_count': { '$gt': 0 } } }
      , sort = { '_id': -1 };
    if (params["pendingMarkets"]) {
      matchConditions["$match"]["bet_result_id"] = null;
      matchConditions["$match"]["is_result_declared"] = 0;
      matchConditions["$match"]["is_abandoned"] = 0;
      sort = { match_date: 1 };
    }
    if (params["resultsRollback"]) {
      matchConditions["$match"]["bet_result_id"] = { "$ne": null };
      sort = { updatedAt: -1 };
    }
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    let skip = (page - 1) * limit;
    return [
      {
        ...matchConditions
      },
      {
        '$sort': sort
      },
      {
        "$project": {
          "sport_id": 1,
          "sport_name": 1,
          "series_id": 1,
          "series_name": 1,
          "match_id": 1,
          "match_name": 1,
          "match_date": 1,
          "market_id": 1,
          "market_name": 1,
          "market_type": 1,
          "selection_id": '$result_selection_id',
          "selection_name": {
            '$cond': {
              'if': {
                '$eq': [
                  '$is_abandoned', 0
                ]
              },
              'then': '$result_selection_name',
              'else': 'Abandoned'
            }
          },
          "result": {
            '$cond': {
              'if': {
                '$eq': [
                  '$is_abandoned', 0
                ]
              },
              'then': '$bet_result_id',
              'else': 'Abandoned'
            }
          },
          "is_abandoned": 1,
          "runners.selection_id": 1,
          "runners.selection_name": 1,
          "runners.sort_priority": 1,
          "createdAt": 1,
          "updatedAt": 1,
          "result_status": 1,
          "bet_count": 1,
          "result_settled_at": 1,
          "result_settled_ip": 1,
        }
      },
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }]
        }
      },
    ]
  },
  getMarketAgentUserPositions: function (market_id, lastAgentsId, AgentsDirectUsers, ownAndParents) {
    return [
      {
        '$match': {
          market_id,
          'win_loss_distribution.user_id': {
            // Own and its downline agents
            '$in': [...ownAndParents, ...lastAgentsId]
          }
        }
      }, {
        '$addFields': {
          'win_loss_distribution': {
            '$map': {
              'input': '$win_loss_distribution',
              'as': 'win_loss_distribution',
              'in': {
                'user_id': '$$win_loss_distribution.user_id',
                'user_type_id': '$$win_loss_distribution.user_type_id',
                'user_name': '$$win_loss_distribution.user_name',
                'win_loss': {
                  '$cond': {
                    'if': {
                      '$in': [
                        // Here we match next parents and set the win_loss value to zero.
                        '$$win_loss_distribution.user_id', lastAgentsId
                      ]
                    },
                    'then': 0,
                    'else': '$$win_loss_distribution.win_loss'
                  }
                }
              }
            }
          }
        }
      }, {
        '$unwind': '$win_loss_distribution'
      }, {
        '$match': {
          'user_id': {
            // Here we remove the agent direct clients.
            '$nin': AgentsDirectUsers
          },
          'win_loss_distribution.user_id': {
            // Here we match own and its agents after unwind.
            '$in': [...ownAndParents, ...lastAgentsId]
          }
        }
      }, {
        '$group': {
          '_id': {
            'user_id': '$user_id',
            'selection_id': '$selection_id'
          },
          'user_id': {
            '$last': '$win_loss_distribution.user_id'
          },
          'user_type_id': {
            '$last': '$win_loss_distribution.user_type_id'
          },
          'user_name': {
            '$last': '$win_loss_distribution.user_name'
          },
          'domain_name': {
            '$first': '$domain_name'
          },
          'win_loss': {
            '$sum': '$win_loss_distribution.win_loss'
          },
          'win_loss_total_exposure': {
            '$first': '$win_loss'
          },
          'selection_id': {
            '$first': '$selection_id'
          },
          'selection_name': {
            '$first': '$selection_name'
          }
        }
      }, {
        '$group': {
          '_id': {
            'user_id': '$user_id',
            'selection_id': '$selection_id'
          },
          'user_id': {
            '$first': '$user_id'
          },
          'user_type_id': {
            '$first': '$user_type_id'
          },
          'user_name': {
            '$first': '$user_name'
          },
          'domain_name': {
            '$first': '$domain_name'
          },
          'win_loss': {
            '$sum': '$win_loss'
          },
          'win_loss_total_exposure': {
            '$sum': '$win_loss_total_exposure'
          },
          'selection_id': {
            '$first': '$selection_id'
          },
          'selection_name': {
            '$first': '$selection_name'
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'user_id': 1,
          'user_type_id': 1,
          'user_name': 1,
          'domain_name': 1,
          'win_loss': {
            '$round': ["$win_loss", 2]
          },
          'win_loss_total_exposure': {
            '$multiply': [{ '$round': ['$win_loss_total_exposure', 2] }, -1]
          },
          'selection_id': 1,
          'selection_name': 1
        }
      }, {
        '$match': {
          'user_id': {
            '$in': lastAgentsId
          }
        }
      }
    ];
  },
  getMarketUserPositions: function (market_id, users) {
    return [
      {
        '$match': {
          market_id,
          'user_id': {
            '$in': users
          }
        }
      }, {
        '$group': {
          '_id': {
            'user_id': '$user_id',
            'selection_id': '$selection_id'
          },
          'user_id': {
            '$first': '$user_id'
          },
          'user_name': {
            '$last': '$user_name'
          },
          'domain_name': {
            '$first': '$domain_name'
          },
          'win_loss': {
            '$sum': '$win_loss'
          },
          'selection_id': {
            '$first': '$selection_id'
          },
          'selection_name': {
            '$first': '$selection_name'
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'user_id': 1,
          'user_type_id': { '$toInt': "1" },
          'user_name': 1,
          'domain_name': 1,
          'win_loss': {
            '$multiply': [{ '$round': ['$win_loss', 2] }, -1]
          },
          'win_loss_total_exposure': {
            '$multiply': [{ '$round': ['$win_loss', 2] }, -1]
          },
          'selection_id': 1,
          'selection_name': 1
        }
      }
    ];
  },
  positionTotalOwnParent: function (user_id, parent_id, market_id, lastAgentsId, ownAndParents, matchTotalOwnParent, users, parentsAndViewer) {
    return [
      {
        $match: {
          $and: [
            { market_id },
            matchTotalOwnParent
          ]
        }
      },
      {
        '$addFields': {
          'win_loss_distribution': {
            '$map': {
              'input': '$win_loss_distribution',
              'as': 'win_loss_distribution',
              'in': {
                'user_id': '$$win_loss_distribution.user_id',
                'user_type_id': '$$win_loss_distribution.user_type_id',
                'user_name': '$$win_loss_distribution.user_name',
                'win_loss': {
                  '$cond': {
                    'if': {
                      '$in': [
                        // Here we match next parents and set the win_loss value to zero.
                        '$$win_loss_distribution.user_id', lastAgentsId
                      ]
                    },
                    'then': 0,
                    'else': '$$win_loss_distribution.win_loss'
                  }
                }
              }
            }
          }
        }
      },
      {
        "$unwind": "$win_loss_distribution"
      },
      {
        '$facet': {
          'total': [
            {
              "$match": {
                "win_loss_distribution.user_id": {
                  '$in': [...ownAndParents, ...lastAgentsId, ...users]
                }
              }
            },
            {
              '$group': {
                '_id': '$selection_id',
                'win_loss': {
                  '$sum': '$win_loss_distribution.win_loss'
                },
                'selection_id': {
                  '$first': '$selection_id'
                },
                'selection_name': {
                  '$first': '$selection_name'
                }
              }
            },
            {
              '$project': {
                '_id': 0,
                'win_loss': {
                  '$round': [
                    '$win_loss',
                    2
                  ]
                },
                'selection_id': 1,
                'selection_name': 1
              }
            }
          ],
          'own': [{
            '$match': {
              'win_loss_distribution.user_id': user_id
            }
          },
          {
            '$group': {
              '_id': '$selection_id',
              'win_loss': {
                '$sum': '$win_loss_distribution.win_loss'
              },
              'selection_id': {
                '$first': '$selection_id'
              },
              'selection_name': {
                '$first': '$selection_name'
              }
            }
          },
          {
            '$project': {
              '_id': 0,
              'win_loss': {
                '$round': [
                  '$win_loss',
                  2
                ]
              },
              'selection_id': 1,
              'selection_name': 1
            }
          }
          ],
          'parent': [
            {
              '$match': {
                'win_loss_distribution.user_id': {
                  '$in': parentsAndViewer
                }
              }
            },
            {
              '$group': {
                '_id': '$selection_id',
                'win_loss': {
                  '$sum': '$win_loss_distribution.win_loss'
                },
                'selection_id': {
                  '$first': '$selection_id'
                },
                'selection_name': {
                  '$first': '$selection_name'
                }
              }
            },
            {
              '$project': {
                '_id': 0,
                'win_loss': {
                  '$round': [
                    '$win_loss',
                    2
                  ]
                },
                'selection_id': 1,
                'selection_name': 1
              }
            }
          ]
        }
      }
    ];
  },
  getMarketsByCountryCode: function (request) {
    const { sport_id, country_code } = request.body;
    const userData = (request?.user || request?.User);
    let filter = {
      country_code, is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
      market_id: { $regex: ".+(?<!_m)$" }
    };

    if (userData && userData.sports_permission) {
      filter['$and'] = [{ sport_id }, { sport_id: { '$in': userData.sports_permission.map(data => data.sport_id) } }];
    } else {
      filter['sport_id'] = sport_id;
    }

    let matchConditions = { "$match": filter };
    return [
      {
        ...matchConditions
      },
      {
        '$sort': {
          'market_start_time': 1
        }
      },
      {
        '$group': {
          '_id': '$venue',
          'markets': {
            '$push': {
              'market_id': '$market_id',
              'market_start_time': '$market_start_time',
              'sport_name': '$sport_name',
              'match_id': '$match_id',
              'name': '$name',
              'is_active': '$is_active',
              'venue': '$venue',
              'country_code': '$country_code',
              'match_tv_url': '$match_tv_url',
              'has_tv_url': '$has_tv_url',
              'inplay': '$inplay',
            }
          },
          'parent_blocked': {
            '$push': '$parent_blocked'
          },
          'self_blocked': {
            '$push': '$self_blocked'
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'venue': '$_id',
          'markets': {
            '$slice': [
              '$markets', 10
            ]
          },
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
          }
        }
      }
    ]
  }
}