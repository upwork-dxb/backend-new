const { ObjectId } = require("bson")

module.exports = {
  transactionalQuery: function (data) {
    const { user_id } = data;
    return [
      {
        '$match': {
          "user_id": ObjectId(user_id),
          'delete_status': {
            '$in': [0, 2],
          },
          'bet_result_id': {
            '$ne': null,
          },
        },
      },
      {
        '$unionWith': {
          'coll': "bets_fancies",
          'pipeline': [
            {
              '$match': {
                "user_id": ObjectId(user_id),
                'delete_status': {
                  '$in': [0, 2],
                },
                'bet_result_id': {
                  '$ne': null,
                },
              },
            },
          ]
        }
      },
      {
        '$group': {
          '_id': null,
          'casino_bets': {
            '$sum': {
              '$cond': [
                {
                  '$or': [
                    {
                      '$eq': ["$sport_id", "-100"],
                    },
                    {
                      '$eq': ["$casinoProvider", "QT"],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          'sports_bets': {
            '$sum': {
              '$cond': [
                {
                  '$in': ["$sport_id", ["1", "2", "4"]],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        '$unionWith': {
          'coll': "user_profit_loss",
          'pipeline': [
            {
              '$match': {
                'user_id': ObjectId(user_id),
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
      },
      {
        '$group': {
          '_id': null,
          'casino_bets': {
            '$sum': "$casino_bets",
          },
          'sports_bets': {
            '$sum': "$sports_bets",
          },
          'total_bets': {
            '$sum': {
              '$add': ["$casino_bets", "$sports_bets"],
            },
          },
          'casino_pl': {
            '$sum': "$casino_pl",
          },
          'sports_pl': {
            '$sum': "$sport_pl",
          },
          'total_pl': {
            '$sum': "$total_pl",
          },
        },
      },
      {
        '$project': {
          '_id': 0,
          'casino_bets': 1,
          'sports_bets': 1,
          'total_bets': 1,
          'casino_pl': 1,
          'sports_pl': 1,
          'total_pl': 1
        },
      },
      {
        '$unionWith': {
          'coll': "accountwallet_statements",
          'pipeline': [
            {
              '$match': {
                'user_id': ObjectId(user_id),
                'statement_type': {
                  '$in': [
                    "DEPOSIT_REQUEST",
                    "WITHDRAW_REQUEST",
                  ],
                },
                'status': {
                  '$eq': "ACCEPTED",
                },
              },
            },
            {
              '$group': {
                '_id': {
                  'statement_type': "$statement_type",
                  'status': "$status",
                  'name': "$_id",
                },
                'amount': {
                  '$first': "$amount",
                },
              },
            },
            {
              '$group': {
                '_id': "$_id.statement_type",
                'total_amount': {
                  '$sum': "$amount",
                },
              },
            },
            {
              '$project': {
                '_id': 0,
                'statement_type': '$_id',
                'total_amount': 1,
              },
            },
          ]
        },
      },
    ]
  },
}