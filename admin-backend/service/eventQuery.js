module.exports = {
  events: function (params) {
    const { user_id, search, type, isUserPanel, from_date, to_date, sports_id } = params;
    let matchConditions;
    if (isUserPanel) // users panel
      matchConditions = { "$match": { user_id } };
    else // agents panel
      matchConditions = { "$match": { 'parents.user_id': user_id } };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    switch (type) {
      case 'openBets':
        matchConditions["$match"]["delete_status"] = { "$in": [0, 2] };
        matchConditions["$match"]["bet_result_id"] = null;
        break;
      case 'settledBets':
        matchConditions["$match"]["delete_status"] = 0;
        matchConditions["$match"]["bet_result_id"] = { '$ne': null };
        break;
    }
    if (sports_id)
      matchConditions["$match"]["sport_id"] = { "$in": sports_id };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    return [
      {
        ...matchConditions
      }, {
        '$unionWith': {
          'coll': 'bets_fancies',
          'pipeline': [
            {
              ...matchConditions
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
                "type": 1,
                'market_id': '$fancy_id',
                'market_name': '$fancy_name'
              }
            }
          ]
        }
      }, {
        '$facet': {
          'sports': [
            {
              '$group': {
                '_id': '$sport_id',
                'sport_id': {
                  '$first': '$sport_id'
                },
                'sport_name': {
                  '$first': '$sport_name'
                }
              }
            }
          ],
          'series': [
            {
              '$group': {
                '_id': '$series_id',
                'series_id': {
                  '$first': '$series_id'
                },
                'series_name': {
                  '$first': '$series_name'
                }
              }
            }
          ],
          'matches': [
            {
              '$group': {
                '_id': '$match_id',
                'match_id': {
                  '$first': '$match_id'
                },
                'match_name': {
                  '$first': '$match_name'
                }
              }
            }
          ],
          'events_m_f': [
            {
              '$group': {
                '_id': '$market_id',
                'event_id': {
                  '$first': '$market_id'
                },
                'event_name': {
                  '$first': '$market_name'
                },
                'match_name': {
                  '$first': '$match_name'
                },
                "type": {
                  "$first": "$type"
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "event_id": 1,
                "event_name": {
                  "$concat": [
                    "$event_name", " (", "$match_name", ")"
                  ]
                },
                "type": 1
              }
            }
          ]
        }
      }
    ];
  },
  profitLossEvents: function (matchConditions, params) {

    const { event_type, EVENTS_TYPES } = params;
    let events = {};

    switch (event_type) {

      case EVENTS_TYPES.SPORTS:
        events["sports"] = [
          {
            "$group": {
              "_id": "$sport_id",
              "sport_id": {
                "$first": "$sport_id"
              },
              "sport_name": {
                "$first": "$sport_name"
              }
            }
          }
        ];
        break;

      case EVENTS_TYPES.SERIES:
        events["series"] = [
          {
            "$group": {
              "_id": "$series_id",
              "series_id": {
                "$first": "$series_id"
              },
              "series_name": {
                "$first": "$series_name"
              }
            }
          }
        ]
        break;

      case EVENTS_TYPES.MATCHES:
        events["matches"] = [
          {
            "$group": {
              "_id": "$match_id",
              "match_id": {
                "$first": "$match_id"
              },
              "match_name": {
                "$first": "$match_name"
              },
              "match_date": {
                "$first": "$match_date"
              }
            }
          }
        ]
        break;

      case EVENTS_TYPES.EVENTS_MARKETS_FANCIES:
        events["events_m_f"] = [
          {
            "$group": {
              "_id": "$event_id",
              "event_id": {
                "$first": "$event_id"
              },
              "event_name": {
                "$first": "$event_name"
              },
              "match_name": {
                "$first": "$match_name"
              },
              "match_date": {
                "$first": "$match_date"
              },
              "type": {
                "$first": "$type"
              }
            }
          },
          {
            "$project": {
              "_id": 0,
              "event_id": 1,
              "match_date": 1,
              "event_name": {
                "$concat": [
                  "$event_name", " (", "$match_name", ")"
                ]
              },
              "type": 1
            }
          }
        ]
        break;

    }

    return [
      matchConditions,
      {
        "$project": {
          "sport_id": 1,
          "sport_name": 1,
          "series_id": 1,
          "series_name": 1,
          "match_id": 1,
          "match_name": 1,
          "match_date": 1,
          "event_id": 1,
          "event_name": 1,
          "type": 1
        }
      },
      {
        "$facet": events
      }
    ]
  },
  matchResultRollback: function (params) {
    const { type, search } = params;
    let matchConditions = { "$match": { 'bet_count': { '$gt': 0 } } };
    if (type == "matchRollback")
      matchConditions["$match"]["bet_result_id"] = { "$ne": null };
    else
      matchConditions["$match"]["bet_result_id"] = null;
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    return [
      {
        ...matchConditions
      },
      {
        '$project': {
          'sport_id': 1,
          'sport_name': 1,
          'series_id': 1,
          'series_name': 1,
          'match_id': 1,
          'match_name': 1,
          'market_id': 1,
          'market_name': 1,
          'type': 1
        }
      }, {
        '$facet': {
          'sports': [
            {
              '$group': {
                '_id': '$sport_id',
                'sport_id': {
                  '$first': '$sport_id'
                },
                'sport_name': {
                  '$first': '$sport_name'
                }
              }
            }
          ],
          'series': [
            {
              '$group': {
                '_id': '$series_id',
                'series_id': {
                  '$first': '$series_id'
                },
                'series_name': {
                  '$first': '$series_name'
                }
              }
            }
          ],
          'matches': [
            {
              '$group': {
                '_id': '$match_id',
                'match_id': {
                  '$first': '$match_id'
                },
                'match_name': {
                  '$first': '$match_name'
                }
              }
            }
          ],
          'markets': [
            {
              '$project': {
                '_id': 0,
                'market_id': 1,
                'market_name': {
                  '$concat': ['$market_name', ' (', '$match_name', ')']
                }
              }
            }
          ]
        }
      }
    ];
  },
  fancyMatchLists: function () {
    return [
      {
        '$match': {
          'sport_id': "4",
          'enable_fancy': 1,
          'bet_count': { '$ne': 0 },
          'bet_count': { '$exists': true }
        }
      },
      {
        '$project': {
          '_id': 0,
          'series_id': 1,
          'series_name': 1,
          'match_id': 1,
          'match_name': 1,
          'match_date': 1,
          'name': {
            '$concat': [
              '$series_name', '(', '$series_id', ')', ' - ', '$match_name', '(', '$match_id', ')[', { '$toString': '$match_date' }, ']'
            ]
          }
        }
      }
    ];
  }
}