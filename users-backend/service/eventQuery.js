module.exports = {
  events: function (params) {
    const { user_id, search } = params;
    let matchConditions = { "$match": { user_id, 'delete_status': { '$in': [0, 2] } } };
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
                "type": {
                  "$first": "$type"
                }
              }
            }
          ]
        }
      }
    ];
  }
}