const { ObjectId } = require("bson")
  , { USER_TYPE_USER } = require('../../utils/constants');

module.exports = {

  getStatements: function (matchConditions, sort = {}) {
    if (Object.keys(sort).length === 0) {
      sort = { _id: -1 }; // Sort by creation date descending by default
    }
    return [
      {
        ...matchConditions
      },
      { $sort: sort },
      {
        "$project": {
          "date": "$generated_at",
          "user_id": 1,
          "user_name": 1,
          "user_type_id": 1,
          // "point": 1,
          // "domain_name": 1,
          // "parent_id": 1,
          "parent_user_name": 1,
          "credit_debit": "$amount",
          "balance": "$available_balance",
          "statement_type": 1,
          "sport_id": 1,
          "match_id": 1,
          "event_id": 1,
          "type": 1,
          "description": 1,
          "remark": 1,
          "bonus": 1,
          "match_date": 1,
          "auraMarketId": 1,
          "auraRountId": 1,
          "sport_id": 1,
          "isRollback": 1,
        }
      }
    ]
  },
  makeSettlement: function (data) {
    const { user_id, parent_id, parents, user_type_id } = data;
    let query = [
      {
        "$match": {
          "$or": [
            {
              "_id": ObjectId(parent_id)
            },
            {
              "_id": ObjectId(user_id)
            }
          ]
        }
      },
      {
        "$group": {
          "_id": null,
          "user_id": {
            "$last": "$_id"
          },
          "user_type_id": {
            "$last": "$user_type_id"
          },
          "name": {
            "$last": "$name"
          },
          "user_name": {
            "$last": "$user_name"
          },
          "parent_id": {
            "$last": "$parent_id"
          },
          "user_balance": {
            "$last": "$balance"
          },
          "settlement_amount": {
            "$last": "$total_settled_amount"
          },
          "parent_user_name": {
            "$first": "$user_name"
          },
          "parent_name": {
            "$first": "$name"
          },
          "parent_balance": {
            "$first": "$balance"
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "user_id": 1,
          "user_type_id": 1,
          "name": 1,
          "user_name": 1,
          "parent_id": 1,
          "user_balance": {
            '$round': ["$user_balance", 2]
          },
          "settlement_amount": 1,
          "user": {
            "$concat": [
              "$name",
              "(",
              "$user_name",
              ")"
            ]
          },
          "parent": {
            "$concat": [
              "$parent_name",
              "(",
              "$parent_user_name",
              ")"
            ]
          },
          "parent_balance": {
            '$round': ["$parent_balance", 2]
          }
        }
      }
    ];
    if (user_type_id == USER_TYPE_USER)
      return query;
    let agentQuery = [
      {
        "$unionWith": {
          "coll": "user_profit_loss",
          "pipeline": [
            {
              "$match": {
                "agents_pl_distribution.user_id": ObjectId(user_id)
              }
            },
            {
              "$unwind": "$agents_pl_distribution"
            },
            {
              "$match": {
                "agents_pl_distribution.user_id": {
                  "$in": parents
                }
              }
            },
            {
              "$group": {
                "_id": null,
                "settlement_amount": {
                  "$sum": {
                    "$add": [
                      "$agents_pl_distribution.p_l",
                      "$agents_pl_distribution.commission"
                    ]
                  }
                }
              }
            }
          ]
        }
      },
      {
        "$group": {
          "_id": null,
          "user_id": {
            "$first": "$user_id"
          },
          "user_type_id": {
            "$first": "$user_type_id"
          },
          "name": {
            "$first": "$name"
          },
          "user_name": {
            "$first": "$user_name"
          },
          "parent_id": {
            "$first": "$parent_id"
          },
          "user_balance": {
            "$first": "$user_balance"
          },
          "settlement_amount": {
            "$sum": "$settlement_amount"
          },
          "parent_balance": {
            "$first": "$parent_balance"
          },
          "user": {
            "$first": "$user"
          },
          "parent": {
            "$first": "$parent"
          }
        }
      }
    ]
    return [...query, ...agentQuery];
  },
  makeSettlementV2: function (data) {
    const { user_id, parent_id, parents, user_type_id } = data;
    let query = [
      {
        $match: {
          $or: [
            { _id: ObjectId(parent_id) },
            { _id: ObjectId(user_id) }
          ]
        }
      },
      {
        $group: {
          _id: null,
          user_id: { $last: "$_id" },
          user_type_id: { $last: "$user_type_id" },
          name: { $last: "$name" },
          user_name: { $last: "$user_name" },
          parent_id: { $last: "$parent_id" },
          user_balance: { $last: "$balance" },
          settlement_amount: {
            $last: "$settlement_pl_comm"
          },
          total_settled_amount: {
            $last: "$total_settled_amount"
          },
          parent_user_name: { $first: "$user_name" },
          parent_name: { $first: "$name" },
          parent_balance: { $first: "$balance" }
        }
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          user_type_id: 1,
          name: 1,
          user_name: 1,
          parent_id: 1,
          user_balance: {
            $round: ["$user_balance", 2]
          },
          settlement_amount: {
            $round: [
              {
                $add: [
                  "$settlement_amount",
                  "$total_settled_amount"
                ]
              },
              2
            ]
          },
          user: {
            $concat: ["$name", "(", "$user_name", ")"]
          },
          parent: {
            $concat: ["$parent_name", "(", "$parent_user_name", ")"
            ]
          },
          parent_balance: {
            $round: ["$parent_balance", 2]
          }
        }
      }
    ]
    return query;
  },
  userProfitLossSettlementAmountQuery: function (user_id, parents_id, type_is_user) {
    if (type_is_user)
      return [
        {
          '$match': { user_id }
        }, {
          '$group': {
            '_id': '$user_id',
            'settlement_amount': {
              '$sum': {
                '$add': [
                  '$user_pl',
                  '$user_commission_pl'
                ]
              }
            }
          }
        }, {
          '$project': {
            '_id': 0,
            'settlement_amount': {
              '$multiply': ['$settlement_amount', -1]
            }
          }
        }
      ];
    return [
      {
        '$match': {
          'agents_pl_distribution.user_id': {
            '$all': [
              user_id, ...parents_id
            ]
          }
        }
      }, {
        '$unwind': '$agents_pl_distribution'
      }, {
        '$match': {
          'agents_pl_distribution.user_id': {
            '$in': parents_id
          }
        }
      }, {
        '$group': {
          '_id': null,
          'agents_pl_distribution': {
            '$push': '$agents_pl_distribution'
          }
        }
      }, {
        '$addFields': {
          'agents_pl_distribution': {
            '$reduce': {
              'input': '$agents_pl_distribution',
              'initialValue': {
                'p_l_sum': 0,
                'commission_sum': 0
              },
              'in': {
                'p_l_sum': {
                  '$add': [
                    '$$this.p_l',
                    '$$value.p_l_sum'
                  ]
                },
                'commission_sum': {
                  '$add': [
                    '$$this.commission',
                    '$$value.commission_sum'
                  ]
                }
              }
            }
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'settlement_amount': {
            '$add': [
              '$agents_pl_distribution.p_l_sum',
              '$agents_pl_distribution.commission_sum'
            ]
          }
        }
      }
    ]
  },
  betsPL: function (params) {
    const { to_date, from_date, user_id } = params;
    return [
      {
        '$match': {
          'parents.user_id': ObjectId(user_id),
          'createdAt': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
          'bet_result_id': { '$ne': null },
          'delete_status': {
            '$in': [0, 2]
          },
        },
      },
      {
        '$unionWith': {
          'coll': 'bets_fancies',
          'pipeline': [
            {
              '$match': {
                "parents.user_id": ObjectId(user_id),
                'createdAt': {
                  '$gte': new Date(from_date),
                  '$lte': new Date(to_date),
                },
                'delete_status': {
                  '$in': [0, 2]
                },
                'bet_result_id': {
                  '$ne': null
                }
              }
            },
          ]
        }
      },
      {
        '$group': {
          '_id': null,
          'total_bets': {
            '$sum': 1
          },
          'total_volume': {
            '$sum': "$stack",
          },
        },
      },
      {
        '$unionWith': {
          'coll': "user_profit_loss",
          'pipeline': [
            {
              '$match': {
                'agents_pl_distribution.user_id': ObjectId(user_id),
                'createdAt': {
                  '$gte': new Date(from_date),
                  '$lt': new Date(to_date)
                },
                '$or': [
                  { 'sport_id': { '$in': ["1", "2", "4", "-100"] } },
                  { 'casinoProvider': "QT" }
                ]
              }
            },
            {
              '$group': {
                '_id': null,
                'casino_pl': {
                  '$sum': {
                    '$cond': [
                      {
                        '$or': [
                          { '$eq': ["$sport_id", "-100"] },
                          { '$eq': ["$casinoProvider", "QT"] }
                        ]
                      },
                      "$user_pl",
                      0
                    ]
                  }
                },
                'sport_pl': {
                  '$sum': {
                    '$cond': [
                      {
                        '$in': ["$sport_id", ["1", "2", "4"]]
                      },
                      {
                        '$add': ["$user_pl", "$user_commission_pl"]
                      },
                      0
                    ]
                  }
                },
              }
            },
            {
              '$group': {
                '_id': null,
                'sport_pl': {
                  '$sum': { '$round': [{ '$multiply': ['$sport_pl', -1] }, 2] }
                },
                'casino_pl': {
                  '$sum': { '$round': [{ '$multiply': ['$casino_pl', -1] }, 2] }
                },
                'total_pl': {
                  '$sum': {
                    '$add': [
                      { '$multiply': ['$casino_pl', -1] },
                      { '$multiply': ['$sport_pl', -1] }
                    ]
                  }
                }
              }
            }, {
              '$project': {
                'sport_pl': 1,
                'casino_pl': 1,
                'total_pl': { '$round': ['$total_pl', 2] }
              }
            }
          ],
        },
      },
      {
        '$unionWith': {
          'coll': "accountwallet_statements",
          'pipeline': [
            {
              '$match': {
                "walletagents": ObjectId(user_id),
                'statement_type': { '$in': ["DEPOSIT_REQUEST", "WITHDRAW_REQUEST"] },
                'status': { '$eq': "ACCEPTED" },
                'created_at': {
                  '$gte': new Date(from_date),
                  '$lt': new Date(to_date),
                },
              },
            },
            {
              '$group': {
                '_id': 'null',
                'total_deposit': {
                  '$sum': {
                    '$cond': [
                      { '$eq': ['$statement_type', 'DEPOSIT_REQUEST'] },
                      '$amount',
                      0
                    ]
                  }
                },
                'total_withdraw': {
                  '$sum': {
                    '$cond': [
                      { '$eq': ['$statement_type', 'WITHDRAW_REQUEST'] },
                      '$amount',
                      0
                    ]
                  }
                }
              }
            }, {
              '$project': {
                'total_dw_pl': { '$subtract': ['$total_deposit', '$total_withdraw'] }
              }
            }
          ]
        }
      },
      {
        '$unionWith': {
          'coll': "accountwallet_statements",
          'pipeline': [
            {
              '$match': {
                "walletagents": ObjectId(user_id),
                'statement_type': { '$in': ["DEPOSIT_REQUEST", "WITHDRAW_REQUEST"] },
                'created_at': {
                  '$gte': new Date(from_date),
                  '$lt': new Date(to_date),
                },
              },
            },
            {
              '$group': {
                '_id': {
                  'statement_type': '$statement_type',
                  'status': '$status',
                  'name': '$name'
                },
                'amount': { '$sum': '$amount' },
                'count': { '$sum': 1 },
              },
            },
            {
              '$sort': {
                '_id.statement_type': 1,
                'amount': -1,
              },
            },
            {
              '$group': {
                '_id': {
                  'status': '$_id.status',
                  'statement_type': '$_id.statement_type',
                },
                'user_count': { '$sum': 1 },
                'total_amount': { '$sum': '$amount' },
              },
            },
          ],
        },
      },
      {
        '$project': {
          '_id': 0,
          'status': "$_id.status",
          'statementType': "$_id.statement_type",
          'user_count': 1,
          'total_amount': 1,
          'trasactional_data': 1,
          'total_bets': 1,
          'total_volume': 1,
          'casino_pl': 1,
          'sport_pl': 1,
          'total_pl': 1,
          'total_dw_pl': 1
        },
      },
    ]
  },
  transactionQuery: function (params) {
    const { to_date, from_date, user_id, user_type_id } = params;
    const limit = params.limit || 10;
    return [
      {
        '$match': {
          "parents.user_id": ObjectId(user_id),
          'statement_type': { '$in': ["DEPOSIT_REQUEST", "WITHDRAW_REQUEST"] },
          'created_at': { '$gte': new Date(from_date), '$lt': new Date(to_date) },
          'status': "ACCEPTED"
        }
      },
      {
        '$group': {
          '_id': { 'statement_type': "$statement_type", 'name': "$name" },
          'count': { '$sum': 1 },
          'total_amount': { '$sum': "$amount" }
        }
      },
      {
        '$sort': { 'total_amount': -1 }
      },
      {
        '$group': {
          '_id': "$_id.statement_type",
          'data': {
            '$push': { 'name': "$_id.name", 'total_amount': "$total_amount" }
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'statement_type': "$_id",
          'data': { '$slice': ["$data", 0, limit] }
        }
      },
      {
        '$project': {
          'statement_type': 1,
          "data.name": 1,
          "data.total_amount": 1
        }
      }
    ]
  },
  topWinners: function (params) {
    const { from_date, to_date, user_id } = params;
    const limit = params.limit || 10;
    const page = params.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          "agents_pl_distribution.user_id": ObjectId(user_id),
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ],
          'createdAt': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
        },
      }, {
        '$group': {
          '_id': {
            'user_name': "$user_name",
          },
          'user_pl': {
            '$sum': "$user_pl",
          },
        },
      }, {
        '$match': {
          'user_pl': {
            '$gt': 0,
          },
        },
      }, {
        '$project': {
          '_id': 0,
          'user_name': "$_id.user_name",
          'user_pl': { '$round': ["$user_pl", 2] },
        },
      }, {
        '$sort': {
          'user_pl': -1,
        },
      }, {
        '$addFields': {
          'page': page,
        }
      },
      { '$skip': skip },
      { '$limit': limit }
    ]

  },
  topLosers: function (params) {
    const { from_date, to_date, user_id } = params;
    const limit = params.limit || 10;
    const page = params.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          'agents_pl_distribution.user_id': ObjectId(user_id),
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ],
          'createdAt': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
        },
      },
      {
        '$group': {
          '_id': {
            'user_name': "$user_name",
          },
          'user_pl': {
            '$sum': "$user_pl",
          },
        },
      },
      {
        '$match': {
          'user_pl': {
            '$lt': 0,
          },
        },
      },
      {
        '$project': {
          '_id': 0,
          'user_name': "$_id.user_name",
          'user_pl': { '$round': ["$user_pl", 2] },
        }
      },
      {
        '$sort': {
          'user_pl': 1,
        },
      },
      {
        '$addFields': {
          'page': 1,
        }
      },
      { '$skip': skip },
      { '$limit': limit }
    ]
  },
  loginBetsQuery: function (params) {
    const { from_date, to_date, user_id } = params;
    return [
      {
        '$match': {
          "parents.user_id": ObjectId(
            user_id
          ),
          'createdAt': {
            '$gte': new Date(
              from_date
            ),
            '$lte': new Date(
              to_date
            ),
          },
          'bet_result_id': { '$ne': null },
          'delete_status': {
            '$in': [0, 2]
          },
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ]
        },
      },
      {
        '$unionWith': {
          'coll': 'bets_fancies',
          'pipeline': [
            {
              '$match': {
                "parents.user_id": ObjectId(
                  user_id
                ),
                'createdAt': {
                  '$gte': new Date(
                    from_date
                  ),
                  '$lte': new Date(
                    to_date
                  ),
                },
                'bet_result_id': { '$ne': null },
                'delete_status': {
                  '$in': [0, 2]
                },
                '$or': [
                  { is_demo: false },
                  { is_demo: { $exists: false } }
                ]
              }
            },
          ]
        }
      },
      {
        '$group': {
          '_id': {
            '$hour': "$createdAt",
          },
          'total_bets': {
            '$sum': 1,
          },
          'total_user_count': {
            '$sum': 0,
          },
        },
      },
      {
        '$unionWith': {
          'coll': "oauth_tokens",
          'pipeline': [
            {
              '$match': {
                "user.parent_id":
                  user_id,
                'createdAt': {
                  '$gte': new Date(
                    from_date
                  ),
                  '$lte': new Date(
                    to_date
                  ),
                },
              },
            },
            {
              '$group': {
                '_id': {
                  '$hour': "$createdAt",
                },
                'user_count': {
                  '$sum': 1,
                },
                'total_bets': {
                  '$sum': 0,
                },
              },
            },
          ],
        },
      },
      {
        '$group': {
          '_id': {
            '$toString': "$_id",
          },
          'bet_placed_user': {
            '$sum': "$total_bets",
          },
          'loggedin_user': {
            '$sum': "$user_count",
          },
        },
      },
      {
        '$project': {
          '_id': 0,
          'time': {
            '$concat': [
              {
                '$toString': "$_id",
              },
              ":00",
            ],
          },
          'loggedin_user': 1,
          'bet_placed_user': 1,
        },
      },
      {
        '$project': {
          'time': 1,
          'loggedin_user': 1,
          'bet_placed_user': 1,
          'time_num': {
            '$toInt': {
              '$substr': [
                "$time",
                0,
                {
                  '$subtract': [
                    {
                      '$strLenCP': "$time",
                    },
                    3,
                  ],
                },
              ],
            },
          },
        },
      },
      {
        '$sort': {
          'time_num': 1,
        },
      },
      {
        '$project': {
          '_id': 0,
          'time': 1,
          'loggedin_user': 1,
          'bet_placed_user': 1,
        },
      },
      {
        '$facet': {
          'complete_time_frames': [
            {
              '$project': {
                '_id': 0,
                'time': 1,
                'loggedin_user': 1,
                'bet_placed_user': 1,
              },
            },
            {
              '$group': {
                '_id': null,
                'time_frames': {
                  '$push': "$$ROOT",
                },
              },
            },
            {
              '$project': {
                '_id': 0,
                'time_frames': {
                  '$concatArrays': [
                    {
                      '$map': {
                        'input': {
                          '$range': [0, 24],
                        },
                        'as': "i",
                        'in': {
                          'time': {
                            '$concat': [
                              {
                                '$toString': "$$i",
                              },
                              ":00",
                            ],
                          },
                          'loggedin_user': {
                            '$reduce': {
                              'input': {
                                '$filter': {
                                  'input':
                                    "$time_frames",
                                  'as': "tf",
                                  'cond': {
                                    '$eq': [
                                      {
                                        '$toInt': {
                                          '$arrayElemAt':
                                            [
                                              {
                                                '$split':
                                                  [
                                                    "$$tf.time",
                                                    ":",
                                                  ],
                                              },
                                              0,
                                            ],
                                        },
                                      },
                                      "$$i",
                                    ],
                                  },
                                },
                              },
                              'initialValue': 0,
                              'in': "$$this.loggedin_user",
                            },
                          },
                          'bet_placed_user': {
                            '$reduce': {
                              'input': {
                                '$filter': {
                                  'input':
                                    "$time_frames",
                                  'as': "tf",
                                  'cond': {
                                    '$eq': [
                                      {
                                        '$toInt': {
                                          '$arrayElemAt':
                                            [
                                              {
                                                '$split':
                                                  [
                                                    "$$tf.time",
                                                    ":",
                                                  ],
                                              },
                                              0,
                                            ],
                                        },
                                      },
                                      "$$i",
                                    ],
                                  },
                                },
                              },
                              'initialValue': 0,
                              'in': "$$this.bet_placed_user",
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
      {
        '$project': {
          'time': {
            '$arrayElemAt': [
              "$complete_time_frames.time_frames",
              0,
            ],
          },
        },
      },
      {
        '$unwind': {
          'path': "$time",
        },
      },
      {
        '$replaceRoot': {
          'newRoot': "$time",
        },
      },
    ]
  },
  topGames: function (params) {
    const { from_date, to_date, user_id } = params;
    return [
      {
        '$match': {
          "parents.user_id": ObjectId(
            user_id
          ),
          'createdAt': {
            '$gte': new Date(
              from_date
            ),
            '$lte': new Date(
              to_date
            ),
          },
          '$or': [
            {
              'sport_id': {
                '$in': ["1", "2", "4", "-100"],
              },
            },
            {
              'casinoProvider': "QT",
            },
          ],
          'delete_status': {
            '$in': [0, 2],
          },
          'bet_result_id': {
            '$ne': null,
          },
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ]
        },
      },
      {
        '$unionWith': {
          'coll': "bets_fancies",
          'pipeline': [
            {
              '$match': {
                "parents.user_id": ObjectId(
                  user_id
                ),
                'createdAt': {
                  '$gte': new Date(
                    from_date
                  ),
                  '$lte': new Date(
                    to_date
                  ),
                },
                '$or': [
                  {
                    'sport_id': {
                      '$in': ["1", "2", "4", "-100"],
                    },
                  },
                  {
                    'casinoProvider': "QT",
                  },
                ],
                'delete_status': {
                  '$in': [0, 2],
                },
                'bet_result_id': {
                  '$ne': null,
                },
                '$or': [
                  { is_demo: false },
                  { is_demo: { $exists: false } }
                ]
              },
            },
          ],
        },
      },
      {
        '$group': {
          '_id': "$sport_name",
          'total_bets': {
            '$sum': 1,
          },
        },
      },
      {
        '$project': {
          '_id': 0,
          'provider': "$_id",
          'total_bets': 1,
        },
      },
      {
        '$unionWith': {
          'coll': "user_profit_loss",
          'pipeline': [
            {
              '$match': {
                "agents_pl_distribution.user_id":
                  ObjectId(
                    user_id
                  ),
                'createdAt': {
                  '$gte': new Date(
                    from_date
                  ),
                  '$lte': new Date(
                    to_date
                  ),
                },
                '$or': [
                  {
                    'sport_id': {
                      '$in': ["1", "2", "4", "-100"],
                    },
                  },
                  {
                    'casinoProvider': "QT",
                  },
                ],
              },
            },
            {
              '$group': {
                '_id': {
                  'provider': "$sport_name",
                },
                'user_pl': {
                  '$sum': "$user_pl",
                },
                'total_bets': {
                  '$sum': 0,
                },
                'user_count': {
                  '$addToSet': "$user_id",
                },
              },
            },
            {
              '$project': {
                'user_pl': {
                  '$round': ["$user_pl", 2],
                },
                'user_count': {
                  '$size': "$user_count",
                },
                'total_bets': 1,
                'provider': "$_id.provider",
              },
            },
            {
              '$project': {
                '_id': 0,
                'provider': 1,
                'total_bets': 1,
                'user_count': 1,
                'user_pl': {
                  '$multiply': ["$user_pl", -1],
                },
              },
            },
          ],
        },
      },
      {
        '$group': {
          '_id': {
            'provider': "$provider",
          },
          'total_bets': {
            '$sum': "$total_bets",
          },
          'user_count': {
            '$sum': "$user_count",
          },
          'user_pl': {
            '$sum': "$user_pl",
          },
        },
      },
      {
        '$sort': {
          'user_pl': -1,
        }
      },
      {
        '$project': {
          '_id': 0,
          'provider': "$_id.provider",
          'total_bets': 1,
          'user_count': 1,
          'user_pl': 1,
        },
      },
    ]
  },
  topCasinoGames: function (params) {
    const { from_date, to_date, user_id } = params;
    const limit = params.limit || 10;
    const page = params.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          "agents_pl_distribution.user_id": ObjectId(
            user_id
          ),
          '$or': [
            {
              'sport_id': {
                '$in': ["-100"],
              },
            },
            {
              'casinoProvider': "QT",
            },
          ],
          'createdAt': {
            '$gte': new Date(from_date),
            '$lte': new Date(to_date),
          },
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ],
        },
      },
      {
        '$group': {
          '_id': {
            'match_name': "$match_name",
            'provider': "$sport_name",
          },
          'user_pl': {
            '$sum': "$user_pl",
          },
          'user_count': {
            '$addToSet': "$user_id",
          },
        },
      },
      {
        '$project': {
          'user_pl': {
            '$round': ["$user_pl", 2],
          },
          'user_count': {
            '$size': "$user_count",
          },
        },
      },
      {
        '$project': {
          '_id': 0,
          'game': "$_id.match_name",
          'provider': "$_id.provider",
          'user_count': 1,
          'user_pl': {
            '$multiply': ["$user_pl", -1],
          },
        },
      },
      {
        '$sort': {
          'user_pl': -1,
        },
      },
      {
        '$addFields': {
          'page': 1,
        }
      },
      { '$skip': skip },
      { '$limit': limit }
    ]
  },
  clientsQuery: function (params) {
    const { from_date, to_date, user_id } = params;
    return [
      {
        '$facet': {
          'matchedDocs': [
            {
              '$match': {
                "user.parent_id":
                  user_id,
                'createdAt': {
                  '$gte': new Date(
                    from_date
                  ),
                  '$lte': new Date(
                    to_date
                  ),
                },
                "user.is_demo": false
              },
            },
            {
              '$group': {
                '_id': "$user.parent_id",
                'loggedInUsers': {
                  '$sum': 1,
                },
              },
            },
          ],
          'loginLogs': [
            {
              '$unionWith': {
                'coll': "user_login_logs",
                'pipeline': [
                  {
                    '$match': {
                      "parent_level_ids.user_id": ObjectId(user_id),
                      'login_time': {
                        '$gte': new Date(from_date),
                        '$lte': new Date(to_date),
                      },
                      'is_online': 1,
                      'is_demo': false,
                    },
                  },
                  {
                    '$group': {
                      '_id': "$parent_level_ids.user_id",
                      'active_users': {
                        '$sum': 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        '$project': {
          '_id': 0,
          'loggedInUsers': {
            '$cond': {
              'if': {
                '$gt': [
                  {
                    '$size': "$matchedDocs",
                  },
                  0,
                ],
              },
              'then': {
                '$sum': "$matchedDocs.loggedInUsers",
              },
              'else': 0,
            },
          },
          'active_users': {
            '$cond': {
              'if': {
                '$gt': [
                  {
                    '$size': "$loginLogs",
                  },
                  0,
                ],
              },
              'then': {
                '$sum': "$loginLogs.active_users",
              },
              'else': 0,
            },
          },
        },
      },
    ]
  },
  BetsCountWithPLQuery: function (params) {
    const { from_date, to_date, user_id } = params;
    return [
      {
        '$match': {
          'parents.user_id': ObjectId(user_id),
          'createdAt': {
            '$gte': new Date(from_date),
            '$lte': new Date(to_date)
          },
          'bet_result_id': { '$ne': null },
          'delete_status': { '$in': [0, 2] },
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ]
        },
      },
      {
        '$unionWith': {
          'coll': "bets_fancies",
          'pipeline': [
            {
              '$match': {
                'parents.user_id': ObjectId(user_id),
                'createdAt': {
                  '$gte': new Date(from_date),
                  '$lte': new Date(to_date)
                },
                'bet_result_id': { '$ne': null },
                'delete_status': { '$in': [0, 2] },
                '$or': [
                  { is_demo: false },
                  { is_demo: { $exists: false } }
                ]
              },
            },
          ]
        }
      },
      {
        '$group': {
          '_id': {
            '$dateToString': {
              'format': "%Y-%m-%d",
              'date': "$createdAt"
            }
          },
          'total_bets': { '$sum': 1 },
          'total_pl': { '$sum': 0 },
          'total_volume': { '$sum': "$stack" }
        }
      },
      {
        '$sort': { "_id": 1 }
      },
      {
        '$unionWith': {
          'coll': "user_profit_loss",
          'pipeline': [
            {
              '$match': {
                "agents_pl_distribution.user_id": ObjectId(user_id),
                'createdAt': {
                  '$gte': new Date(from_date),
                  '$lte': new Date(to_date),
                },
              },
            },
            {
              '$group': {
                '_id': {
                  '$dateToString': {
                    'format': "%Y-%m-%d",
                    'date': "$createdAt",
                  },
                },
                'total_pl': {
                  '$sum': {
                    '$add': ["$user_pl", "$user_commission_pl"]
                  },
                },
              },
            },
          ],
        },
      },
      {
        '$project': {
          '_id': 1,
          'total_bets': 1,
          'total_volume': 1,
          'total_pl': 1,
        },
      },
      {
        '$group': {
          '_id': "$_id",
          'total_bets': { '$first': "$total_bets" },
          'total_volume': { '$first': "$total_volume" },
          'total_pl': { '$sum': "$total_pl" },
        },
      },
      {
        '$group': {
          '_id': null,
          'data': {
            '$push': {
              'date': "$_id",
              'total_bets': "$total_bets",
              'total_pl': { '$multiply': ["$total_pl", -1] },
              'total_volume': "$total_volume"
            }
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'data': {
            '$map': {
              'input': {
                '$range': [
                  0,
                  {
                    '$add': [
                      {
                        '$divide': [
                          {
                            '$subtract': [
                              {
                                '$dateFromParts': {
                                  'year': { '$year': new Date(to_date) },
                                  'month': { '$month': new Date(to_date) },
                                  'day': { '$dayOfMonth': new Date(to_date) }
                                }
                              },
                              {
                                '$dateFromParts': {
                                  'year': { '$year': new Date(from_date) },
                                  'month': { '$month': new Date(from_date) },
                                  'day': { '$dayOfMonth': new Date(from_date) }
                                }
                              }
                            ]
                          },
                          86400000
                        ]
                      },
                      1
                    ]
                  }
                ]
              },
              'as': "day",
              'in': {
                'date': {
                  '$dateToString': {
                    'format': "%Y-%m-%d",
                    'date': {
                      '$add': [
                        new Date(from_date),
                        {
                          '$multiply': [
                            "$$day",
                            86400000
                          ]
                        }
                      ]
                    }
                  }
                },
                'total_bets': {
                  '$let': {
                    'vars': {
                      'matchedData': {
                        '$arrayElemAt': [
                          {
                            '$filter': {
                              'input': "$data",
                              'cond': {
                                '$eq': [
                                  "$$this.date",
                                  {
                                    '$dateToString': {
                                      'format': "%Y-%m-%d",
                                      'date': {
                                        '$add': [
                                          new Date(from_date),
                                          {
                                            '$multiply': [
                                              "$$day",
                                              86400000
                                            ]
                                          }
                                        ]
                                      }
                                    }
                                  }
                                ]
                              }
                            }
                          },
                          0
                        ]
                      }
                    },
                    'in': {
                      '$ifNull': [
                        "$$matchedData.total_bets",
                        0
                      ]
                    }
                  }
                },
                'total_pl': {
                  '$let': {
                    'vars': {
                      'matchedData': {
                        '$arrayElemAt': [
                          {
                            '$filter': {
                              'input': "$data",
                              'cond': {
                                '$eq': [
                                  "$$this.date",
                                  {
                                    '$dateToString': {
                                      'format': "%Y-%m-%d",
                                      'date': {
                                        '$add': [
                                          new Date(from_date),
                                          {
                                            '$multiply': [
                                              "$$day",
                                              86400000
                                            ]
                                          }
                                        ]
                                      }
                                    }
                                  }
                                ]
                              }
                            }
                          },
                          0
                        ]
                      }
                    },
                    'in': {
                      '$ifNull': [
                        "$$matchedData.total_pl",
                        0
                      ]
                    }
                  }
                },
                'total_volume': {
                  '$let': {
                    'vars': {
                      'matchedData': {
                        '$arrayElemAt': [
                          {
                            '$filter': {
                              'input': "$data",
                              'cond': {
                                '$eq': [
                                  "$$this.date",
                                  {
                                    '$dateToString': {
                                      'format': "%Y-%m-%d",
                                      'date': {
                                        '$add': [
                                          new Date(from_date),
                                          {
                                            '$multiply': [
                                              "$$day",
                                              86400000
                                            ]
                                          }
                                        ]
                                      }
                                    }
                                  }
                                ]
                              }
                            }
                          },
                          0
                        ]
                      }
                    },
                    'in': {
                      '$ifNull': [
                        "$$matchedData.total_volume",
                        0
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        '$unwind': "$data"
      },
      {
        '$project': {
          'date': "$data.date",
          'total_pl': { '$round': ["$data.total_pl", 2] },
          'total_volume': "$data.total_volume",
          'total_bets': "$data.total_bets"
        }
      }
    ]
  },
  openBetsQuery: function (params) {
    const { from_date, to_date, user_id } = params;
    return [
      {
        '$match': {
          'parents.user_id': ObjectId(user_id),
          'sport_name': {
            '$in': ['Cricket', 'Tennis', 'Soccer', 'Casino']
          },
          'createdAt': {
            '$gte': new Date(from_date),
            '$lte': new Date(to_date)
          },
          'delete_status': { '$in': [0, 2] },
          'bet_result_id': null,
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ]
        }
      },
      {
        '$group': {
          '_id': '$sport_name',
          'bets_count': { '$sum': 1 },
          'total_volume': { '$sum': '$liability' }
        }
      },
      {
        '$project': {
          'sport_name': '$_id',
          'bets_count': 1,
          'total_volume': 1,
          '_id': 0
        }
      },
      {
        '$facet': {
          'foundSports': [
            {
              '$unionWith': {
                'coll': 'bets_fancies',
                'pipeline': [
                  {
                    '$match': {
                      'parents.user_id': ObjectId(user_id),
                      'sport_name': {
                        '$in': ['Cricket', 'Tennis', 'Soccer', 'Casino']
                      },
                      'createdAt': {
                        '$gte': new Date(from_date),
                        '$lte': new Date(to_date)
                      },
                      'delete_status': { '$in': [0, 2] },
                      'bet_result_id': null,
                      '$or': [
                        { is_demo: false },
                        { is_demo: { $exists: false } }
                      ]
                    }
                  },
                  {
                    '$group': {
                      '_id': '$sport_name',
                      'bets_count': { '$sum': 1 },
                      'total_volume': { '$sum': '$liability' }
                    }
                  },
                  {
                    '$project': {
                      'sport_name': '$_id',
                      'bets_count': 1,
                      'total_volume': 1,
                      '_id': 0
                    }
                  }
                ]
              }
            }
          ],
          'allSports': [
            {
              '$group': {
                '_id': null,
                'sport_name': { '$addToSet': 'Cricket' }
              }
            },
            {
              '$addFields': {
                'sport_name': {
                  '$setUnion': [
                    '$sport_name',
                    ['Tennis'],
                    ['Soccer'],
                    ['Casino']
                  ]
                }
              }
            },
            {
              '$unwind': '$sport_name'
            },
            {
              '$group': {
                '_id': '$sport_name',
                'bets_count': { '$first': 0 },
                'total_volume': { '$first': 0 }
              }
            },
            {
              '$project': {
                'sport_name': '$_id',
                'bets_count': 1,
                'total_volume': 1,
                '_id': 0
              }
            }
          ]
        }
      },
      {
        '$project': {
          'sports': {
            '$concatArrays': ['$foundSports', '$allSports']
          }
        }
      },
      {
        '$unwind': '$sports'
      },
      {
        '$replaceRoot': {
          'newRoot': '$sports'
        }
      },
      {
        '$group': {
          '_id': '$sport_name',
          'bets_count': { '$sum': '$bets_count' },
          'total_volume': { '$sum': '$total_volume' }
        }
      },
      {
        '$project': {
          'sport_name': '$_id',
          'bets_count': 1,
          'total_volume': 1,
          '_id': 0
        }
      }
    ]

  },
  usersDataQuery: function (params) {
    const { from_date, to_date, user_id } = params;
    return [
      {
        '$facet': {
          'total_users': [
            {
              '$match': {
                "parent_level_ids.user_id": ObjectId(user_id),
                "is_demo": false,
              },
            },
            {
              '$group': {
                '_id': null,
                'total_user': { '$sum': 1 },
              },
            },
            {
              '$project': {
                'total_user': 1,
                '_id': 0,
              },
            },
          ],
          'total_clients': [  // New facet to count only user_type_id: 1
            {
              '$match': {
                "parent_level_ids.user_id": ObjectId(user_id),
                "is_demo": false,
                "user_type_id": 1
              },
            },
            {
              '$group': {
                '_id': null,
                'total_client': { '$sum': 1 },
              },
            },
            {
              '$project': {
                'total_client': 1,
                '_id': 0,
              },
            },
          ],
          'filtered_users': [
            {
              '$match': {
                "parent_level_ids.user_id": ObjectId(user_id),
                'createdAt': {
                  '$gte': new Date(from_date),
                  '$lte': new Date(to_date),
                },
                "is_demo": false,
              },
            },
            {
              '$group': {
                '_id': null,
                'new_user': { '$sum': 1 },
              },
            },
          ],
        },
      },
      {
        '$project': {
          'total_user': { '$ifNull': [{ '$arrayElemAt': ["$total_users.total_user", 0] }, 0] },
          'total_client': { '$ifNull': [{ '$arrayElemAt': ["$total_clients.total_client", 0] }, 0] }, // Added total_client
          'new_user': { '$ifNull': [{ '$arrayElemAt': ["$filtered_users.new_user", 0] }, 0] },
          'old_user': { '$subtract': [{ '$arrayElemAt': ["$total_users.total_user", 0] }, { '$arrayElemAt': ["$filtered_users.new_user", 0] }] },
          '_id': 0,
        },
      },
      {
        '$project': {
          // 'total_user': 1,
          'total_client': 1,  // Include total_client in the final output
          'new_user': { '$ifNull': ["$new_user", 0] },
          'old_user': { '$subtract': ["$total_user", { '$ifNull': ["$new_user", 0] }] },
        },
      },
    ]
  },
  betsQuery: function (params) {
    const { to_date, from_date, user_id } = params;
    return [
      {
        '$match': {
          'parents.user_id': ObjectId(user_id),
          'createdAt': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
          'bet_result_id': { '$ne': null },
          'delete_status': {
            '$in': [0, 2]
          },
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ]
        },
      },
      {
        '$unionWith': {
          'coll': 'bets_fancies',
          'pipeline': [
            {
              '$match': {
                "parents.user_id": ObjectId(user_id),
                'createdAt': {
                  '$gte': new Date(from_date),
                  '$lte': new Date(to_date),
                },
                'delete_status': {
                  '$in': [0, 2]
                },
                'bet_result_id': {
                  '$ne': null
                },
                '$or': [
                  { is_demo: false },
                  { is_demo: { $exists: false } }
                ]
              }
            },
          ]
        }
      },
      {
        '$group': {
          '_id': null,
          'total_bets': {
            '$sum': 1
          },
          'total_volume': {
            '$sum': "$stack",
          },
        },
      },
      {
        '$project': {
          '_id': 0,
          'total_bets': 1,
          'total_volume': 1
        }
      }
    ]
  },
  dwQuery: function (params) {
    const { to_date, from_date, user_id } = params
    return [
      {
        '$match': {
          "parents.user_id": ObjectId(user_id),
          'statement_type': { '$in': ["DEPOSIT_REQUEST", "WITHDRAW_REQUEST"] },
          'status': 'ACCEPTED',
          'created_at': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
        },
      },
      {
        '$group': {
          '_id': null,
          'total_deposit': {
            '$sum': {
              '$cond': { 'if': { '$eq': ['$statement_type', 'DEPOSIT_REQUEST'] }, 'then': '$amount', 'else': 0 }
            }
          },
          'total_withdraw': {
            '$sum': {
              '$cond': { 'if': { '$eq': ['$statement_type', 'WITHDRAW_REQUEST'] }, 'then': '$amount', 'else': 0 }
            }
          }
        }
      },
      {
        '$project': {
          'total_dw_pl': { '$subtract': ['$total_deposit', '$total_withdraw'] }
        }
      }
    ]
  },
  plQuery: function (params) {
    const { to_date, from_date, user_id } = params;
    return [
      {
        '$match': {
          'agents_pl_distribution.user_id': ObjectId(user_id),
          '$or': [
            { is_demo: false },
            { is_demo: { $exists: false } }
          ],
          'createdAt': {
            '$gte': new Date(from_date),
            '$lte': new Date(to_date)
          },
          '$or': [
            { 'sport_id': { '$in': ["1", "2", "4", "-100"] } },
            { 'casinoProvider': "QT" }
          ]
        }
      },
      {
        '$group': {
          '_id': null,
          'casino_pl': {
            '$sum': {
              '$cond': [
                {
                  '$or': [
                    { '$eq': ["$sport_id", "-100"] },
                    { '$eq': ["$casinoProvider", "QT"] }
                  ]
                },
                "$user_pl",
                0
              ]
            }
          },
          'sport_pl': {
            '$sum': {
              '$cond': [
                {
                  '$in': ["$sport_id", ["1", "2", "4"]]
                },
                {
                  '$add': ["$user_pl", "$user_commission_pl"]
                },
                0
              ]
            }
          },
        }
      },
      {
        '$group': {
          '_id': null,
          'sport_pl': {
            '$sum': { '$round': [{ '$multiply': ['$sport_pl', -1] }, 2] }
          },
          'casino_pl': {
            '$sum': { '$round': [{ '$multiply': ['$casino_pl', -1] }, 2] }
          },
          'total_pl': {
            '$sum': {
              '$add': [
                { '$multiply': ['$casino_pl', -1] },
                { '$multiply': ['$sport_pl', -1] }
              ]
            }
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'sport_pl': 1,
          'casino_pl': 1,
          'total_pl': { '$round': ['$total_pl', 2] }
        }
      }
    ]
  },
  totalProfitLossQuery: function (params) {
    const { user_id } = params;
    return [
      {
        '$match': {
          'agents_pl_distribution.user_id': ObjectId(user_id),
        }
      },
      {
        '$group': {
          '_id': null,
          'profit_loss': {
            '$sum': {
              '$add': [
                '$user_pl',
                '$user_commission_pl'
              ]
            }
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'profit_loss': { '$multiply': [{ '$round': ['$profit_loss', 2] }, -1] }
        }
      }
    ]
  },
  statementQuery: function (params) {
    const { to_date, from_date, user_id } = params;
    return [
      {
        '$match': {
          "parents.user_id": ObjectId(user_id),
          'statement_type': { '$in': ["DEPOSIT_REQUEST", "WITHDRAW_REQUEST"] },
          'created_at': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
        },
      },
      {
        '$group': {
          '_id': {
            'statement_type': '$statement_type',
            'status': '$status',
            'name': '$name'
          },
          'amount': { '$sum': '$amount' },
          'count': { '$sum': 1 },
        },
      },
      {
        '$sort': {
          '_id.statement_type': 1,
          'amount': -1,
        },
      },
      {
        '$group': {
          '_id': {
            'status': '$_id.status',
            'statement_type': '$_id.statement_type',
          },
          'user_count': { '$sum': 1 },
          'total_amount': { '$sum': '$amount' },
        },
      },
      {
        '$project': {
          '_id': 0,
          'status': "$_id.status",
          'statementType': "$_id.statement_type",
          'user_count': 1,
          'total_amount': 1,
        }
      }
    ]
  },
  downloadStatements: function (params) {
    const { user_id, sport_id, statement_type, from_date, to_date, search } = params;
    let statement_type_condition = [];
    switch (statement_type) {
      case 1:
        statement_type_condition = [1];
        break;
      case 2:
        statement_type_condition = [2, 4];
        break;
      case 3:
        statement_type_condition = [3, 5];
        break;
      case 4:
        statement_type_condition = [6];
        break;
      case 5:
        statement_type_condition = [1, 6];
        break;
      case 6:
        statement_type_condition = [2, 3, 4, 5];
        break;
      default:
        break;
    }

    let matchConditions = { "$match": { user_id } };
    if (statement_type)
      matchConditions["$match"]['statement_type'] = { '$in': statement_type_condition };
    if (sport_id)
      matchConditions["$match"]['sport_id'] = sport_id;
    if (from_date && to_date) {
      const fromDate = new Date(from_date);
      const toDate = new Date(to_date);
      matchConditions["$match"]["generated_at"] = { '$gte': fromDate, '$lte': toDate };
    }
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);

    return [
      {
        ...matchConditions
      },
      {
        $sort: {
          "generated_at": -1
        }
      },
      {
        "$project": {
          "date": "$generated_at",
          "user_id": 1,
          "user_name": 1,
          "user_type_id": 1,
          "point": 1,
          "domain_name": 1,
          "parent_id": 1,
          "parent_user_name": 1,
          "credit_debit": "$amount",
          "balance": "$available_balance",
          "statement_type": 1,
          "match_id": 1,
          "event_id": 1,
          "type": 1,
          "description": 1,
          "remark": 1,
        }
      }
    ];
  }
}