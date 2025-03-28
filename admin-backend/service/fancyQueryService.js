const { ObjectId } = require("bson");

module.exports = {
  getFancyQueryUserTypeIdZero: function (page, limit) {
    return [
      {
        "$project": {
          "_id": 0,
          "fancy_id": 1,
          "name": 1,
          "fancy_name": 1,
          "selection_id": 1,
          "is_active": 1,
          "is_created": '1',
          "is_lock": 1
        }
      },
      {
        "$sort": { "createdAt": 1 }
      },
      { "$skip": page },
      { "$limit": limit }
    ]
  },
  getFancyQueryUserTypeIdNonZero: function (parentIds, user_id, page, limit) {
    return [
      {
        "$project": {
          "_id": 0,
          "fancy_id": 1,
          "name": 1,
          "fancy_name": 1,
          "selection_id": 1,
          "is_created": '1',
          "is_active": 1,
          "is_lock": 1
        }
      },
      {
        "$sort": { "createdAt": 1 }
      },
      { "$skip": page },
      { "$limit": limit }
    ]
  },
  getFancyQuerySuperAdmin: function (match_id) {
    return [
      {
        "$match": {
          "match_id": match_id
        }
      },
      {
        "$project": {
          "_id": 0,
          "fancy_id": 1,
          "name": { "$concat": ["$name", "「", { "$toString": "$bet_count" }, "」"] },
          "selection_id": 1,
          "fancy_type_id": 1,
          "is_active": 1,
          "bet_count": 1,
          "createdAt": 1,
          "category": 1,
          "chronology": 1,
          "is_created": '1',
          "active_sort": {
            "$cond": {
              "if": {
                "$eq": ["$is_active", 1],
              },
              "then": 0,
              "else": 1,
            },
          }
        }
      },
      {
        "$sort": { "bet_count": -1, "active_sort": 1 }
      }
    ]
  },
  getFancyQueryForAgents: function (match_id, parentIds, user_id) {
    return [
      {
        "$match": {
          "match_id": match_id,
          "active": 1
        }
      },
      {
        $lookup: {
          from: "matches",
          localField: "match_id",
          foreignField: "match_id",
          as: "aliasMatches"
        }
      },
      {
        $lookup:
        {
          from: "series",
          localField: "series_id",
          foreignField: "series_id",
          as: "aliasSeries"
        }
      },
      {
        $lookup:
        {
          from: "sports",
          localField: "sport_id",
          foreignField: "sport_id",
          as: "aliasSports"
        }
      },
      {
        $lookup:
        {
          from: "deactivefancies",
          localField: "fancy_id",
          foreignField: "fancy_id",
          as: "aliasDeactivefancy"
        }
      },
      {
        "$addFields": {
          "is_created": 1
        }
      },
      {
        "$project": {
          sport_id: {
            "$arrayElemAt": [
              "$aliasSports.sport_id",
              0
            ]
          },
          sport_name: {
            "$arrayElemAt": [
              "$aliasSports.name",
              0
            ]
          },
          series_id: {
            "$arrayElemAt": [
              "$aliasSeries.series_id",
              0
            ]
          },
          series_name: {
            "$arrayElemAt": [
              "$aliasSeries.name",
              0
            ]
          },
          match_name: {
            "$arrayElemAt": [
              "$aliasMatches.name",
              0
            ]
          },
          match_id: {
            "$arrayElemAt": [
              "$aliasMatches.match_id",
              0
            ]
          },
          "fancy_id": 1,
          "name": 1,
          "selection_id": 1,
          "is_created": 1,
          "is_lock": 1,
          "active": {
            "$cond": [
              {
                "$in": [
                  user_id,
                  "$aliasDeactivefancy.user_id"
                ]
              },
              0,
              1
            ]
          },
          "aliasDeactivefancy": "$aliasDeactivefancy.user_id"
        }
      },
      {
        $match: {
          aliasDeactivefancy: { $nin: parentIds }
        }
      },
      {
        $project: {
          aliasDeactivefancy: 0
        }
      },
      {
        "$sort": { "createdAt": 1 }
      }
    ]
  },
  getFancyPositionQuery: function (user_id, fancy_id) {
    return [
      {
        '$match': {
          user_id: ObjectId(user_id),
          fancy_id
        }
      },
      {
        '$project': {
          'profit': 1,
          'liability': 1,
          'fancy_score_position_json': 1,
        }
      }
    ]
  },
  getFancyBetForAgentPositionQuery: function (user_id, fancy_id) {
    return [
      {
        "$match": {
          "delete_status": 0,
          "distribution.user_id": ObjectId(user_id),
          fancy_id
        }
      },
      {
        "$unwind": '$distribution'
      },
      {
        "$replaceRoot": {
          "newRoot": {
            "$mergeObjects": [
              {
                "per": '$share',
                "run": '$run',
                "is_back": '$is_back',
                "size": '$size',
                "stack": '$stack'
              }, '$distribution'
            ]
          }
        }
      },
      {
        "$match": {
          "user_id": ObjectId(user_id),
        }
      },
      {
        "$group": {
          "_id": {
            "run": '$run',
            "is_back": '$is_back',
            "size": '$size'
          },
          "stack": {
            "$sum": '$stack'
          },
          "share": {
            "$first": '$share'
          }
        }
      },
      {
        "$sort": {
          '_id.run': 1
        }
      },
      {
        "$project": {
          "_id": 0,
          "run": {
            "$toInt": '$_id.run'
          },
          "is_back": {
            "$toInt": '$_id.is_back'
          },
          "size": {
            "$toInt": '$_id.size'
          },
          "stack": {
            "$toInt": '$stack'
          },
          "per": '$share'
        }
      }
    ]
  },
  // session result declare initialations
  updateBetRecordsOnResultDeclareQuery: function (params) {
    const { match_id, fancy_id, bet_result_id, result } = params;
    return [
      {
        "updateMany": {
          "filter": {
            '$and': [
              { match_id },
              { fancy_id },
              { type: 2 },
              {
                '$or': [
                  {
                    '$and': [
                      { "is_back": { "$eq": 1 } },
                      { "run": { "$lte": result } }
                    ]
                  },
                  {
                    '$and': [
                      { "is_back": { "$eq": 0 } },
                      { "run": { "$gt": result } }
                    ]
                  }
                ]
              }
            ]
          },
          "update": [{
            "$set": {
              "bet_result_id": ObjectId(bet_result_id),
              "chips": '$profit',
              "is_result_declared": 1,
              "result": result,
              "result_settled_at": new Date(),
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": {
            '$and': [
              { match_id },
              { fancy_id },
              { type: 2 },
              {
                '$or': [
                  {
                    '$and': [
                      { "is_back": { "$eq": 1 } },
                      { "run": { "$gt": result } }
                    ]
                  },
                  {
                    '$and': [
                      { "is_back": { "$eq": 0 } },
                      { "run": { "$lte": result } }
                    ]
                  }
                ]
              }
            ]
          },
          "update": [{
            "$set": {
              "bet_result_id": ObjectId(bet_result_id),
              "chips": '$liability',
              "is_result_declared": 1,
              "result": result,
              "result_settled_at": new Date(),
            }
          }]
        }
      }
    ];
  },
  updateBetRecordsOnResultDeclareQueryV2: function (params) {
    const { match_id, fancy_id, bet_result_id, result } = params;
    return [
      {
        "updateMany": {
          "filter": {
            '$and': [
              { match_id },
              { fancy_id },
              {
                '$or': [
                  {
                    '$and': [
                      { "is_back": { "$eq": 1 } },
                      { "run": { "$lte": result } }
                    ]
                  },
                  {
                    '$and': [
                      { "is_back": { "$eq": 0 } },
                      { "run": { "$gt": result } }
                    ]
                  }
                ]
              }
            ]
          },
          "update": [{
            "$set": {
              "bet_result_id": ObjectId(bet_result_id),
              "chips": '$profit',
              "is_result_declared": 1,
              "result": result,
              "result_settled_at": new Date(),
            }
          }]
        }
      },
      {
        "updateMany": {
          "filter": {
            '$and': [
              { match_id },
              { fancy_id },
              {
                '$or': [
                  {
                    '$and': [
                      { "is_back": { "$eq": 1 } },
                      { "run": { "$gt": result } }
                    ]
                  },
                  {
                    '$and': [
                      { "is_back": { "$eq": 0 } },
                      { "run": { "$lte": result } }
                    ]
                  }
                ]
              }
            ]
          },
          "update": [{
            "$set": {
              "bet_result_id": ObjectId(bet_result_id),
              "chips": '$liability',
              "is_result_declared": 1,
              "result": result,
              "result_settled_at": new Date(),
            }
          }]
        }
      }
    ];
  },
  updateFSPBetRecordsOnResultDeclareQueryV2: function (params) {
    const { match_id, fancy_id, result } = params;
    return [
      {
        "updateMany": {
          "filter": {
            "$and": [
              { match_id },
              { fancy_id },
              {
                "$or": [
                  {
                    "$and": [
                      {
                        "bets_fancies.is_back": {
                          "$eq": 1
                        }
                      },
                      {
                        "bets_fancies.run": {
                          "$lte": result
                        }
                      }
                    ]
                  },
                  {
                    "$and": [
                      {
                        "bets_fancies.is_back": {
                          "$eq": 0
                        }
                      },
                      {
                        "bets_fancies.run": {
                          "$gt": result
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          },
          "update": [
            {
              "$set": {
                "bets_fancies": {
                  "$map": {
                    "input": "$bets_fancies",
                    "in": {
                      "$cond": {
                        "if": {
                          "$and": [
                            {
                              "$or": [
                                {
                                  "$and": [
                                    {
                                      "$eq": [
                                        "$$this.is_back",
                                        1
                                      ]
                                    },
                                    {
                                      "$lte": [
                                        "$$this.run",
                                        result
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "$and": [
                                    {
                                      "$eq": [
                                        "$$this.is_back",
                                        0
                                      ]
                                    },
                                    {
                                      "$gt": [
                                        "$$this.run",
                                        result
                                      ]
                                    }
                                  ]
                                }
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$mergeObjects": [
                            "$$this",
                            {
                              "chips": "$$this.profit"
                            }
                          ]
                        },
                        "else": "$$this"
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      },
      {
        "updateMany": {
          "filter": {
            "$and": [
              { match_id },
              { fancy_id },
              {
                "$or": [
                  {
                    "$and": [
                      {
                        "bets_fancies.is_back": {
                          "$eq": 1
                        }
                      },
                      {
                        "bets_fancies.run": {
                          "$gt": result
                        }
                      }
                    ]
                  },
                  {
                    "$and": [
                      {
                        "bets_fancies.is_back": {
                          "$eq": 0
                        }
                      },
                      {
                        "bets_fancies.run": {
                          "$lte": result
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          },
          "update": [
            {
              "$set": {
                "bets_fancies": {
                  "$map": {
                    "input": "$bets_fancies",
                    "in": {
                      "$cond": {
                        "if": {
                          "$and": [
                            {
                              "$or": [
                                {
                                  "$and": [
                                    {
                                      "$eq": [
                                        "$$this.is_back",
                                        1
                                      ]
                                    },
                                    {
                                      "$gt": [
                                        "$$this.run",
                                        result
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "$and": [
                                    {
                                      "$eq": [
                                        "$$this.is_back",
                                        0
                                      ]
                                    },
                                    {
                                      "$lte": [
                                        "$$this.run",
                                        result
                                      ]
                                    }
                                  ]
                                }
                              ]
                            }
                          ]
                        },
                        "then": {
                          "$mergeObjects": [
                            "$$this",
                            {
                              "chips": "$$this.liability"
                            }
                          ]
                        },
                        "else": "$$this"
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    ]
  },
  sp_set_result_fancy: function (params) {
    let {
      sport_id, sport_name,
      series_id, series_name,
      match_id, match_name, match_date,
      fancy_id, fancy_name,
      result
    } = params;
    result = result.toString();
    return [
      {
        '$match': {
          match_id,
          fancy_id,
          'delete_status': 0
        }
      }, {
        '$unwind': {
          'path': '$distribution'
        }
      }, {
        '$replaceRoot': {
          'newRoot': {
            '$mergeObjects': [{
              "root_user_id": "$user_id",
              "root_user_name": "$user_name",
              '_id': '$distribution.user_id',
              'user_name': '$user_name',
              'domain_name': '$domain_name',
              'bet_result_id': '$bet_result_id',
              'type': '$type',
              'stack': '$stack',
              'chips': '$chips',
              'user_pl': '$user_pl',
              'winner_name': '$result',
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
          'winner_name': {
            '$first': '$$CURRENT.winner_name'
          },
          'user_type_id': {
            '$first': '$$CURRENT.user_type_id'
          },
          'session_commission': {
            '$first': '$$CURRENT.session_commission'
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
          'user_pl': {
            '$first': '$user_pl'
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
              'session_commission': '$session_commission',
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
          'match_name': match_name,
          match_date,
          'event_id': fancy_id,
          'event_name': fancy_name,
          'description': {
            '$concat': [
              "PnL Fancy -> ", sport_name, " -> ", series_name, " -> ", match_name, " -> ", fancy_name, " -> Result( ", result, " )"]
          },
          'reffered_name': {
            '$concat': [
              sport_name, ' -> ',
              series_name, ' -> ',
              match_name, ' -> ',
              fancy_name, ' -> ',
              result,
            ]
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
  sp_set_result_fancyV2: function (params) {
    let {
      sport_name,
      series_name,
      match_id, match_name, match_date,
      fancy_id, fancy_name,
      bet_result_id, result
    } = params;
    result = result.toString();
    return [
      {
        '$match': {
          match_id,
          fancy_id,
        }
      },
      {
        '$unwind': '$bets_fancies'
      },
      {
        '$group': {
          '_id': '$user_id',
          'user_pl': {
            '$sum': '$bets_fancies.chips'
          },
          'doc': {
            '$first': '$$ROOT'
          }
        }
      },
      {
        '$replaceRoot': {
          'newRoot': {
            '$mergeObjects': [
              {
                '_id': '$_id',
                'user_pl': '$user_pl'
              }, '$doc'
            ]
          }
        }
      },
      {
        '$addFields': {
          'user_commission_pl': {
            '$cond': {
              'if': {
                '$gt': [
                  '$user_pl', 0
                ]
              },
              'then': {
                '$multiply': [
                  {
                    '$divide': [
                      {
                        '$multiply': [
                          '$user_pl', '$session_commission'
                        ]
                      }, 100
                    ]
                  }, -1
                ]
              },
              'else': 0
            }
          }
        }
      },
      {
        '$addFields': {
          'agents_pl_distribution': {
            '$map': {
              'input': {
                '$range': [
                  0,
                  { '$size': '$distribution' }
                ]
              },
              'as': 'idx',
              'in': {
                '$let': {
                  'vars': {
                    'row': {
                      '$arrayElemAt': [
                        '$distribution',
                        '$$idx'
                      ]
                    },
                    'addedPl': {
                      '$cond': {
                        'if': { '$eq': ['$$idx', 0] },
                        'then': {
                          '$multiply': [
                            {
                              '$divide': [
                                {
                                  '$multiply': [
                                    '$user_pl',
                                    {
                                      '$arrayElemAt': [
                                        '$distribution.share',
                                        '$$idx'
                                      ]
                                    }
                                  ]
                                },
                                100
                              ]
                            },
                            -1
                          ]
                        },
                        'else': {
                          '$sum': {
                            '$map': {
                              'input': {
                                '$slice': [
                                  '$distribution',
                                  0,
                                  '$$idx'
                                ]
                              },
                              'as': 'cumAgent',
                              'in': {
                                '$multiply': [
                                  {
                                    '$divide': [
                                      {
                                        '$multiply': [
                                          '$user_pl',
                                          '$$cumAgent.share'
                                        ]
                                      },
                                      100
                                    ]
                                  },
                                  -1
                                ]
                              }
                            }
                          }
                        }
                      }
                    },
                    'addedComm': {
                      '$cond': {
                        'if': { '$eq': ['$$idx', 0] },
                        'then': {
                          '$multiply': [
                            {
                              '$divide': [
                                {
                                  '$multiply': [
                                    '$user_commission_pl',
                                    {
                                      '$arrayElemAt': [
                                        '$distribution.share',
                                        '$$idx'
                                      ]
                                    }
                                  ]
                                },
                                100
                              ]
                            },
                            -1
                          ]
                        },
                        'else': {
                          '$sum': {
                            '$map': {
                              'input': {
                                '$slice': [
                                  '$distribution',
                                  0,
                                  '$$idx'
                                ]
                              },
                              'as': 'cumAgent',
                              'in': {
                                '$multiply': [
                                  {
                                    '$divide': [
                                      {
                                        '$multiply': [
                                          '$user_commission_pl',
                                          '$$cumAgent.share'
                                        ]
                                      },
                                      100
                                    ]
                                  },
                                  -1
                                ]
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  'in': {
                    'user_id': '$$row.user_id',
                    'user_name': '$$row.user_name',
                    'user_type_id': '$$row.user_type_id',
                    'match_commission': 0,
                    'session_commission': '$$row.session_commission',
                    'share': '$$row.share',
                    'p_l': {
                      '$round': [{
                        '$multiply': [
                          {
                            '$divide': [
                              {
                                '$multiply': [
                                  '$user_pl', '$$row.share'
                                ]
                              }, 100
                            ]
                          }, -1
                        ]
                      }, 2]
                    },
                    'commission': {
                      '$round': [{
                        '$cond': {
                          'if': {
                            '$lt': [
                              '$user_commission_pl', 0
                            ]
                          },
                          'then': {
                            '$multiply': [
                              {
                                '$divide': [
                                  {
                                    '$multiply': [
                                      '$user_commission_pl', '$$row.share'
                                    ]
                                  }, 100
                                ]
                              }, -1
                            ]
                          },
                          'else': 0
                        }
                      }, 2]
                    },
                    'index': '$$row.index',
                    'added_pl': { '$round': ['$$addedPl', 2] },
                    'added_comm': { '$round': ['$$addedComm', 2] },
                  }
                }
              }
            }
          }
        }
      },
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
          match_date,
          'event_id': fancy_id,
          'event_name': fancy_name,
          'winner_name': result,
          'bet_result_id': ObjectId(bet_result_id),
          'type': 1,
          'stack': 1,
          'user_pl': 1,
          'user_commission_pl': 1,
          'max_liability': {
            '$multiply': ['$liability', -1],
          },
          'liability': {
            '$multiply': ['$liability', -1],
          },
          'category_name': 1,
          'description': {
            '$concat': [
              sport_name, " / ", match_name, " / ", { $ifNull: ['$category_name', ''] }, " / ", fancy_name, " / ", result
              // "PnL Fancy -> ", sport_name, " -> ", series_name, " -> ", match_name, " -> ", fancy_name, " -> Result( ", result, " )"
            ]
          },
          'reffered_name': {
            '$concat': [
              sport_name, ' -> ',
              series_name, ' -> ',
              match_name, ' -> ',
              fancy_name, ' -> ',
              result,
            ]
          },
          'agents_pl_distribution': 1,
        }
      }
    ];
  },
  getFancyLiabilityQuery: function (user_id, match_id, fancy_ids) {
    let matchConditions = {
      "$match": {
        "distribution.user_id": ObjectId(user_id)
      }
    };
    if (match_id) {
      if (!Array.isArray(match_id))
        match_id = match_id.split(",");
      matchConditions["$match"]["match_id"] = { "$in": match_id }
    }
    if (fancy_ids) {
      if (!Array.isArray(fancy_ids))
        fancy_ids = fancy_ids.split(",");
      matchConditions["$match"]["fancy_id"] = { "$in": fancy_ids }
    }
    return [
      { ...matchConditions },
      {
        '$unwind': '$distribution'
      },
      {
        '$match': {
          'distribution.user_id': ObjectId(user_id)
        }
      },
      {
        '$group': {
          '_id': '$fancy_id',
          'fancy_id': {
            '$first': '$fancy_id'
          },
          'liability_full': {
            '$sum': '$liability'
          },
          'share': {
            '$first': '$distribution.share'
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'fancy_id': 1,
          'liability_full': 1,
          'liability': {
            '$divide': [
              {
                '$multiply': [
                  '$liability_full', '$share'
                ]
              }, 100
            ]
          }
        }
      }
    ]
  },
  getMatchesForFancyResult: function () {
    return [{
      $group: {
        '_id': '$match_id',
        'match_id': {
          '$first': '$match_id'
        },
        'match_name': {
          '$first': '$match_name'
        }
      }
    }]
  },
  ResultQuery: function (params) {
    const { page, limit, search } = params;
    let matchConditions = { "$match": { 'bet_count': { '$gt': 0 } } };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    let skip = (page - 1) * limit;
    return [
      {
        ...matchConditions
      },
      {
        '$sort': {
          '_id': -1
        }
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
          "fancy_id": 1,
          "fancy_name": 1,
          "session_value_yes": 1,
          "session_value_no": 1,
          "session_size_no": 1,
          "session_size_yes": 1,
          "is_active": 1,
          "belong_to": 1,
          "result_status": 1,
          "status": {
            "$switch": {
              "branches": [
                {
                  "case": { "$eq": ["$is_active", 0] },
                  "then": "Inactive"
                },
                {
                  "case": { "$eq": ["$is_active", 1] },
                  "then": "Active"
                },
                {
                  "case": { "$eq": ["$is_active", 2] },
                  "then": "Closed"
                }
              ],
              "default": "Abandoned"
            }
          },
          "result": 1,
          "createdAt": 1,
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
  fancyStake: function (params) {
    let { search, page, limit, from_date, to_date, user_id } = params;
    let matchConditions = { "$match": { "agents_pl_distribution.user_id": ObjectId(user_id), "type": 2 } };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    let skip = (page - 1) * limit;
    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$event_id',
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
          'stack': {
            '$sum': '$stack'
          },
          'date_time': {
            '$first': '$createdAt'
          }
        }
      },
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
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
  getStackOfAgents: function (filter, viewerId, lastAgentsId, params) {
    let { from_date, to_date } = params;
    if (from_date && to_date)
      filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    return [
      {
        '$match': {
          ...filter,
          'agents_pl_distribution.user_id': viewerId
        }
      },
      {
        '$unwind': '$agents_pl_distribution'
      },
      {
        '$match': {
          'agents_pl_distribution.user_id': {
            '$in': lastAgentsId
          }
        }
      },
      {
        '$group': {
          '_id': '$agents_pl_distribution.user_id',
          'user_id': {
            '$first': '$agents_pl_distribution.user_id'
          },
          'user_name': {
            '$first': '$agents_pl_distribution.user_name'
          },
          'user_type_id': {
            '$first': '$agents_pl_distribution.user_type_id'
          },
          'domain_name': {
            '$first': '$domain_name'
          },
          'stack': {
            '$sum': '$stack'
          },
          'commission': {
            '$sum': '$agents_pl_distribution.commission'
          },
        }
      }
    ];
  },
  getStackOfUsers: function (filter, userIds, params) {
    let { from_date, to_date } = params;
    if (from_date && to_date)
      filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    return [
      {
        '$match': {
          ...filter,
          'user_id': {
            '$in': userIds
          }
        }
      },
      {
        '$group': {
          '_id': '$user_id',
          'user_id': {
            '$first': '$user_id'
          },
          'user_name': {
            '$first': '$user_name'
          },
          'domain_name': {
            '$first': '$domain_name'
          },
          'stack': {
            '$sum': '$stack'
          },
          'commission': {
            '$sum': '$user_commission_pl'
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'user_id': 1,
          'user_name': 1,
          'domain_name': 1,
          'user_type_id': "1",
          'stack': 1,
          'commission': 1
        }
      }
    ];
  },
  getFancyLiabilityBySharing: function (params) {
    let { user_id, match_id, fancy_id, fancy_ids } = params,
      matchConditions = { "$match": { 'distribution.user_id': ObjectId(user_id) } };
    if (match_id)
      matchConditions["$match"]["match_id"] = match_id;
    if (fancy_id)
      matchConditions["$match"]["fancy_id"] = fancy_id;
    if (fancy_ids) {
      if (!Array.isArray(fancy_ids))
        fancy_ids = fancy_ids.split(",");
      matchConditions["$match"]["fancy_id"] = { "$in": fancy_ids };
    }
    return [
      {
        ...matchConditions
      },
      {
        '$unwind': '$distribution'
      },
      {
        '$match': {
          'distribution.user_id': ObjectId(user_id)
        }
      },
      {
        '$set': {
          'bets_fancies.per': '$distribution.share'
        }
      },
      {
        '$group': {
          '_id': '$fancy_id',
          'sport_id': { "$first": '$sport_id' },
          'sport_name': { "$first": '$sport_name' },
          'series_id': { "$first": '$series_id' },
          'series_name': { "$first": '$series_name' },
          'match_id': { "$first": '$match_id' },
          'match_name': { "$first": '$match_name' },
          'fancy_name': { "$first": '$fancy_name' },
          'fancy_id': { '$first': '$fancy_id' },
          'bets_fancies': {
            '$push': '$bets_fancies'
          }
        }
      },
      {
        '$addFields': {
          'event_name': '$fancy_name',
          'event_id': '$fancy_id',
          'type': 'Fancy',
          'bets_fancies': {
            '$reduce': {
              'input': '$bets_fancies',
              'initialValue': [],
              'in': {
                '$concatArrays': [
                  '$$value', '$$this'
                ]
              }
            }
          }
        }
      },
      {
        '$set': {
          'bets_fancies': {
            '$sortArray': {
              'input': '$bets_fancies',
              'sortBy': { 'run': 1 }
            }
          },
          'bets_fancies_size': { '$size': '$bets_fancies' }
        }
      },
      {
        '$match': {
          'bets_fancies_size': {
            '$ne': 0
          }
        }
      }
    ]
  }
}