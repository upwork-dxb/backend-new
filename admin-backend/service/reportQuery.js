const { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER } = require("../../utils/constants");
const { ObjectId } = require("bson");
let PLAndCommission = {
  "total": { "$round": ['$user_pl', 2] },
  "commission": { "$round": ['$user_commission_pl', 2] }
};

module.exports = {
  own_parent_acc_query: function (user_id, parent_ids, user_type_id) {
    switch (user_type_id) {
      case USER_TYPE_SUPER_ADMIN:
        return [
          {
            $match: {
              'agents_pl_distribution.user_id': user_id,
            }
          }, {
            $unwind: {
              path: '$agents_pl_distribution'
            }
          }, {
            $match: {
              'agents_pl_distribution.user_id': user_id
            }
          }, {
            $group: {
              _id: '$agents_pl_distribution.user_id',
              own_commission: {
                $sum: '$agents_pl_distribution.commission'
              },
              own_pl: {
                $sum: {
                  $add: [
                    '$agents_pl_distribution.p_l',
                    '$agents_pl_distribution.commission'
                  ]
                }
              }
            }
          }, {
            $project: {
              _id: 0,
              own_pl: {
                $round: [
                  '$own_pl',
                  2
                ]
              },
              own_commission: {
                $round: [
                  '$own_commission',
                  2
                ]
              },
              parent_pl: "0.00",
              parent_ac: "0.00"
            }
          }
        ]
      case USER_TYPE_USER:
        return [
          {
            $match: {
              user_id: user_id,
            }
          }, {
            $group: {
              _id: '$user_id',
              own_commission: {
                $sum: '$user_commission_pl'
              },
              own_pl: {
                $sum: {
                  $add: [
                    '$user_pl',
                    '$user_commission_pl'
                  ]
                }
              }
            }
          }, {
            $project: {
              _id: 0,
              own_commission: {
                $round: [
                  '$own_commission',
                  2
                ]
              },
              own_pl: {
                $round: [
                  '$own_pl',
                  1
                ]
              },
              parent_commission: {
                $round: [
                  {
                    $multiply: [
                      '$own_commission',
                      -1
                    ]
                  },
                  2
                ]
              },
              parent_ac: {
                $round: [
                  {
                    $multiply: [
                      '$own_pl',
                      -1
                    ]
                  },
                  2
                ]
              }
            }
          }
        ]
      default:
        return {
          own_query: [
            {
              $match: {
                'agents_pl_distribution.user_id': user_id,
              }
            },
            {
              $unwind: '$agents_pl_distribution'
            },
            {
              $match: {
                'agents_pl_distribution.user_id': user_id
              }
            },
            {
              $group: {
                _id: '$agents_pl_distribution.user_id',
                own_commission: {
                  $sum: '$agents_pl_distribution.commission'
                },
                own_pl: {
                  $sum: {
                    $add: [
                      '$agents_pl_distribution.p_l',
                      '$agents_pl_distribution.commission'
                    ]
                  }
                }
              }
            },
            {
              $project: {
                own_pl: {
                  $round: [
                    '$own_pl',
                    2
                  ]
                },
                own_commission: {
                  $round: [
                    '$own_commission',
                    2
                  ]
                }
              }
            },
          ],
          parent_query: [
            {
              $match: {
                'agents_pl_distribution.user_id': user_id,
              }
            },
            {
              $unwind: '$agents_pl_distribution'
            },
            {
              $match: {
                'agents_pl_distribution.user_id': {
                  $in: parent_ids
                }
              }
            },
            {
              $group: {
                _id: null,
                parent_ac: {
                  $sum: {
                    $add: [
                      '$agents_pl_distribution.p_l',
                      '$agents_pl_distribution.commission'
                    ]
                  }
                },
                parent_commission: {
                  $sum: '$agents_pl_distribution.commission'
                }
              }
            },
            {
              $project: {
                parent_ac: {
                  $round: [
                    '$parent_ac',
                    2
                  ]
                },
                parent_commission: {
                  $round: [
                    '$parent_commission',
                    2
                  ]
                }
              }
            },
          ]
        };
      // return [
      //   {
      //     $match: {
      //       'agents_pl_distribution.user_id': user_id
      //     }
      //   }, {
      //     $facet: {
      //       own: [
      //         {
      //           $unwind: '$agents_pl_distribution'
      //         },
      //         {
      //           $match: {
      //             'agents_pl_distribution.user_id': user_id
      //           }
      //         },
      //         {
      //           $group: {
      //             _id: '$agents_pl_distribution.user_id',
      //             own_commission: {
      //               $sum: '$agents_pl_distribution.commission'
      //             },
      //             own_pl: {
      //               $sum: {
      //                 $add: [
      //                   '$agents_pl_distribution.p_l',
      //                   '$agents_pl_distribution.commission'
      //                 ]
      //               }
      //             }
      //           }
      //         },
      //         {
      //           $project: {
      //             own_pl: {
      //               $round: [
      //                 '$own_pl',
      //                 2
      //               ]
      //             },
      //             own_commission: {
      //               $round: [
      //                 '$own_commission',
      //                 2
      //               ]
      //             }
      //           }
      //         }
      //       ],
      //       parent: [
      //         {
      //           $unwind: '$agents_pl_distribution'
      //         },
      //         {
      //           $match: {
      //             'agents_pl_distribution.user_id': {
      //               $in: parent_ids
      //             }
      //           }
      //         },
      //         {
      //           $group: {
      //             _id: null,
      //             parent_ac: {
      //               $sum: {
      //                 $add: [
      //                   '$agents_pl_distribution.p_l',
      //                   '$agents_pl_distribution.commission'
      //                 ]
      //               }
      //             },
      //             parent_commission: {
      //               $sum: '$agents_pl_distribution.commission'
      //             }
      //           }
      //         },
      //         {
      //           $project: {
      //             parent_ac: {
      //               $round: [
      //                 '$parent_ac',
      //                 2
      //               ]
      //             },
      //             parent_commission: {
      //               $round: [
      //                 '$parent_commission',
      //                 2
      //               ]
      //             }
      //           }
      //         }
      //       ]
      //     }
      //   }, {
      //     $project: {
      //       own_commission: {
      //         $first: '$own.own_commission'
      //       },
      //       own_pl: {
      //         $first: '$own.own_pl'
      //       },
      //       parent_commission: {
      //         $first: '$parent.parent_commission'
      //       },
      //       parent_ac: {
      //         $first: '$parent.parent_ac'
      //       }
      //     }
      //   }
      // ]
    }
  },
  own_total_settled_query: function (user_id) {
    return [{
      $match: {
        $or: [
          {
            _id: user_id
          },
          {
            parent_id: user_id
          }
        ]
      }
    }, {
      $group: {
        _id: null,
        parent_user_name: {
          $first: '$parent_user_name'
        },
        total_cash: {
          $sum: {
            $subtract: [
              {
                $cond: [
                  {
                    $eq: [
                      '$_id',
                      user_id
                    ]
                  },
                  '$total_settled_amount',
                  0
                ]
              },
              {
                $cond: [
                  {
                    $eq: [
                      '$parent_id',
                      user_id
                    ]
                  },
                  '$total_settled_amount',
                  0
                ]
              }
            ]
          }
        },
        own_total_settled_amount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$_id',
                  user_id
                ]
              },
              '$total_settled_amount',
              0
            ]
          }
        }
      }
    }, {
      $project: {
        _id: 0,
        parent_user_name: { $toLower: { '$ifNull': ["$parent_user_name", "Super"] } },
        parent_name: { '$ifNull': ["$parent_user_name", "Super"] },
        total_cash: {
          $round: [
            '$total_cash',
            2
          ]
        },
        own_total_settled_amount: {
          $round: [
            '$own_total_settled_amount',
            2
          ]
        }
      }
    }]
  },
  settlementReport: function (user_id, parents_id, lastAgentsId, AgentsDirectUsers, user_type_id, search, dates) {
    let res = {}
    let AgentDirectUsersQuery = [
      {
        '$match': {
          "user_id": {
            '$in': AgentsDirectUsers,
          },
        }
      }, {
        '$group': {
          '_id': '$user_id',
          'settlement_amount_comm': {
            '$sum': '$user_commission_pl'
          },
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
          'user_id': '$_id',
          'settlement_amount_comm': {
            '$multiply': [
              '$settlement_amount_comm', -1
            ]
          },
          'settlement_amount': {
            '$multiply': [
              '$settlement_amount', -1
            ]
          }
        }
      }
    ];
    if (user_type_id == USER_TYPE_USER) {
      res = { agent_direct_users_query: AgentDirectUsersQuery };
      return res;
    }
    let query = [{ '$facet': {} }];
    if (lastAgentsId.length) {
      let agents_query = [
        {
          "$match": {
            'agents_pl_distribution.user_id': {
              "$in": [user_id, ...parents_id, ...lastAgentsId],
            },
          }
        }, {
          "$unwind": {
            "path": '$agents_pl_distribution'
          }
        }, {
          "$match": {
            'agents_pl_distribution.user_id': {
              "$in": [user_id, ...parents_id, ...lastAgentsId]
            }
          }
        }, {
          "$group": {
            "_id": "$user_id",
            "user_name": { "$first": "$user_name" },
            "parent_user_name": { "$last": "$agents_pl_distribution.user_name" },
            "parent_user_id": { "$last": "$agents_pl_distribution.user_id" },
            "agents_pl_distribution": {
              "$push": "$agents_pl_distribution"
            }
          }
        }, {
          "$addFields": {
            "agents_pl_distribution": {
              "$filter": {
                "input": "$agents_pl_distribution",
                "as": "item",
                "cond": { "$in": ["$$item.user_id", [user_id, ...parents_id]] }
              }
            }
          }
        }, {
          "$addFields": {
            "agents": {
              "$reduce": {
                "input": "$agents_pl_distribution",
                "initialValue": {
                  "p_l_sum": 0,
                  "commission_sum": 0
                },
                "in": {
                  "p_l_sum": { "$add": ["$$this.p_l", "$$value.p_l_sum"] },
                  "commission_sum": { "$add": ["$$this.commission", "$$value.commission_sum"] }
                }
              }
            }
          }
        }, {
          "$group": {
            "_id": "$parent_user_id",
            "root_user_id": { "$first": "$_id" },
            "root_user_name": { "$first": "$user_name" },
            "user_name": { "$first": "$parent_user_name" },
            "settlement_amount_comm": { "$sum": "$agents.commission_sum" },
            "settlement_amount": {
              "$sum": {
                "$add": ["$agents.p_l_sum", "$agents.commission_sum"]
              }
            }
          }
        }, {
          "$project": {
            "_id": 0,
            "root_user_id": 1,
            "root_user_name": 1,
            "user_id": "$_id",
            "user_name": 1,
            "settlement_amount_comm": {
              "$round": ["$settlement_amount_comm", 2]
            },
            "settlement_amount": {
              "$round": ["$settlement_amount", 2]
            }
          }
        }, {
          "$match": {
            "user_id": { "$nin": parents_id.length ? [user_id, ...parents_id] : [user_id] }
          }
        }
      ]
      query[0]['$facet']['agents'] = agents_query;
      res['agents_query'] = agents_query;
    }
    if (AgentsDirectUsers.length) {
      query[0]['$facet']['agent_direct_users'] = AgentDirectUsersQuery;
      res['agent_direct_users_query'] = AgentDirectUsersQuery;
    }
    return res;
  },
  settlementReportUsers: function (user_ids, user_type_id, search) {
    let query = [
      {
        '$project': {
          '_id': 0,
          'user_id': '$_id',
          'user_type_id': 1,
          'name': 1,
          'user_name': 1,
          'parent_id': 1,
          'settlement_amount': "$total_settled_amount"
        }
      }
    ];
    if (Array.isArray(user_ids))
      query.unshift({
        '$match': {
          '_id': {
            '$in': user_ids
          }
        }
      });
    if (!Array.isArray(user_ids))
      query.unshift({
        '$match': {
          'parent_id': user_ids
        }
      });
    return query;
  },
  eventsProfitLossQuery: (params) => {
    const { user_id, search, from_date, to_date, page, limit } = params;
    let skip = (page - 1) * limit;
    let matchConditions = { "$match": { 'agents_pl_distribution.user_id': user_id } };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    return [
      {
        ...matchConditions
      }, {
        "$unwind": {
          path: '$agents_pl_distribution'
        }
      }, {
        "$match": {
          'agents_pl_distribution.user_id': user_id
        }
      },
      {
        "$group": {
          "_id": '$event_id',
          "match_date": {
            "$first": '$match_date'
          },
          "sport_id": {
            "$first": '$sport_id'
          },
          "sport_name": {
            "$first": '$sport_name'
          },
          "series_name": {
            "$first": '$series_name'
          },
          "match_id": {
            "$first": '$match_id'
          },
          "match_name": {
            "$first": '$match_name'
          },
          "event_id": {
            "$first": '$event_id'
          },
          "event_name": {
            "$first": '$event_name'
          },
          "type": {
            "$first": '$type'
          },
          "p_l": {
            "$sum": '$agents_pl_distribution.p_l'
          },
          "p_l_full": {
            "$sum": '$user_pl'
          },
          "winner_name": {
            "$first": '$winner_name'
          },
          "commission": {
            "$sum": '$agents_pl_distribution.commission'
          },
          "commission_full": {
            "$sum": '$user_commission_pl'
          },
          "user_pl": {
            "$sum": '$user_pl'
          },
          "net_pl": {
            "$sum": {
              "$add": [
                '$agents_pl_distribution.p_l',
                '$agents_pl_distribution.commission'
              ]
            }
          },
          "net_pl_full": {
            "$sum": {
              "$add": [
                '$user_pl',
                '$user_commission_pl'
              ]
            }
          },
          "result_date": {
            "$first": '$createdAt'
          }
        }
      }, {
        "$project": {
          "_id": 0,
          "match_date": 1,
          "sport_id": 1,
          "sport_name": 1,
          "series_name": 1,
          "match_id": 1,
          "match_name": 1,
          "event_id": 1,
          "event_name": 1,
          "user_pl": {
            "$multiply": [{
              "$round": ['$user_pl', 2]
            }, -1]
          },
          "type": 1,
          "winner_name": 1,
          "p_l": {
            "$round": ['$p_l', 2]
          },
          "commission": {
            "$round": ['$commission', 2]
          },
          "net_pl": {
            "$round": ['$net_pl', 2]
          },
          "p_l_full": {
            "$multiply": [{ "$round": ['$p_l_full', 2] }, -1]
          },
          "commission_full": {
            "$multiply": [{ "$round": ['$commission_full', 2] }, -1]
          },
          "net_pl_full": {
            "$multiply": [{ "$round": ['$net_pl_full', 2] }, -1]
          },
          "result_date": 1
        }
      }, {
        "$facet": {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }],
          "sum": [
            {
              "$group": {
                "_id": null,
                "p_l": { "$sum": '$p_l' },
                "commission": { "$sum": '$commission' },
                "net_pl": { "$sum": '$net_pl' }
              }
            },
            {
              "$project": {
                "_id": 0,
                "p_l": {
                  "$round": ['$p_l', 2]
                },
                "commission": {
                  "$round": ['$commission', 2]
                },
                "net_pl": {
                  "$round": ['$net_pl', 2]
                }
              }
            }
          ]
        }
      }
    ];
  },
  eventsProfitLossQueryV1: (matchConditions, user_id) => {
    return [
      matchConditions,
      {
        "$unwind": {
          "path": "$agents_pl_distribution"
        }
      },
      {
        "$match": {
          "agents_pl_distribution.user_id": user_id
        }
      },
      {
        "$group": {
          "_id": "$event_id",
          "match_date": {
            "$first": "$match_date"
          },
          "sport_id": {
            "$first": "$sport_id"
          },
          "sport_name": {
            "$first": "$sport_name"
          },
          "series_name": {
            "$first": "$series_name"
          },
          "match_id": {
            "$first": "$match_id"
          },
          "match_name": {
            "$first": "$match_name"
          },
          "event_id": {
            "$first": "$event_id"
          },
          "event_name": {
            "$first": "$event_name"
          },
          "type": {
            "$first": "$type"
          },
          "p_l": {
            "$sum": "$agents_pl_distribution.p_l"
          },
          "p_l_full": {
            "$sum": "$user_pl"
          },
          "winner_name": {
            "$first": "$winner_name"
          },
          "commission": {
            "$sum": "$agents_pl_distribution.commission"
          },
          "commission_full": {
            "$sum": "$user_commission_pl"
          },
          "user_pl": {
            "$sum": "$user_pl"
          },
          "net_pl": {
            "$sum": {
              "$add": [
                "$agents_pl_distribution.p_l",
                "$agents_pl_distribution.commission"
              ]
            }
          },
          "net_pl_full": {
            "$sum": {
              "$add": ["$user_pl", "$user_commission_pl"]
            }
          },
          "result_date": {
            "$first": "$createdAt"
          }
        }
      },
      {
        "$sort": {
          "_id": -1
        }
      },
      {
        "$project": {
          "_id": 0,
          "match_date": 1,
          "sport_id": 1,
          "sport_name": 1,
          "series_name": 1,
          "match_id": 1,
          "match_name": 1,
          "event_id": 1,
          "event_name": 1,
          "user_pl": {
            "$multiply": [
              {
                "$round": ["$user_pl", 2]
              },
              -1
            ]
          },
          "type": 1,
          "winner_name": 1,
          "p_l": {
            "$round": ["$p_l", 2]
          },
          "commission": {
            "$round": ["$commission", 2]
          },
          "net_pl": {
            "$round": ["$net_pl", 2]
          },
          "p_l_full": {
            "$multiply": [
              {
                "$round": ["$p_l_full", 2]
              },
              -1
            ]
          },
          "commission_full": {
            "$multiply": [
              {
                "$round": ["$commission_full", 2]
              },
              -1
            ]
          },
          "net_pl_full": {
            "$multiply": [
              {
                "$round": ["$net_pl_full", 2]
              },
              -1
            ]
          },
          "result_date": 1
        }
      }
    ]
  },
  eventsProfitLossCountQueryV1: (matchConditions, user_id) => {
    return [
      matchConditions,
      {
        "$unwind": {
          "path": "$agents_pl_distribution"
        }
      },
      {
        "$match": {
          "agents_pl_distribution.user_id": user_id
        }
      },
      {
        "$count": "total"
      },
    ];
  },
  eventsProfitLossSumQueryV1: (matchConditions, user_id) => {
    return [
      matchConditions,
      {
        "$unwind": {
          "path": "$agents_pl_distribution"
        }
      },
      {
        "$match": {
          "agents_pl_distribution.user_id": user_id
        }
      },
      {
        "$group": {
          "_id": null,
          "p_l": { "$sum": "$agents_pl_distribution.p_l" },
          "commission": { "$sum": "$agents_pl_distribution.commission" },
          "net_pl": {
            "$sum": {
              "$add": [
                "$agents_pl_distribution.p_l",
                "$agents_pl_distribution.commission"
              ]
            }
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "p_l": { "$round": ["$p_l", 2] },
          "commission": { "$round": ["$commission", 2] },
          "net_pl": { "$round": ["$net_pl", 2] }
        }
      }
    ];
  },
  settlements: function (user_id) {
    return [
      {
        '$match': { user_id }
      }
    ]
  },
  getUsersSportsPL: function (user_id, search, AgentsDirectUsers, params) {
    let { from_date, to_date, international_casinos } = params;
    let matchConditions = {
      "$match": {
        "user_id": {
          "$in": AgentsDirectUsers
        }
      }
    };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    let casinoProvider = {};
    if (!international_casinos) {
      casinoProvider = {
        // If casino provider is null we use same sport_id.
        "sport_id": { "$ifNull": ["$casinoProvider", "$sport_id", "$casinoProvider"] },
        "sport_name": { "$ifNull": ["$casinoProvider", "$sport_name", "$casinoProvider"] },
      };
    }
    return [
      {
        ...matchConditions
      },
      {
        "$unwind": "$agents_pl_distribution"
      },
      {
        "$match": {
          "agents_pl_distribution.user_id": user_id
        }
      },
      {
        "$addFields": {
          ...casinoProvider,
          "casino_provider": "$casinoProvider"
        }
      },
      {
        "$group": {
          "_id": {
            "user_id": "$user_id",
            "sport_id": "$sport_id",
            "type": "$type"
          },
          "user_id": {
            "$first": "$user_id"
          },
          "user_name": {
            "$first": "$user_name"
          },
          "user_pl": {
            "$sum": "$user_pl"
          },
          "commission": {
            "$sum": "$user_commission_pl"
          },
          "share_commission": {
            "$sum": "$agents_pl_distribution.commission"
          },
          "share": {
            "$first": "$agents_pl_distribution.share"
          },
          "sport_name": {
            "$first": "$sport_name"
          },
          "type": {
            "$first": "$type"
          },
          "casino_provider": {
            "$first": "$casino_provider"
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "user_id": 1,
          "user_name": 1,
          "user_type_id": "1",
          "share_commission": 1,
          "casino_provider": 1,
          "share": {
            "$concat": [{ "$toString": "$share" }, "%"]
          },
          "user_pl": {
            "$multiply": [
              "$user_pl",
              -1
            ]
          },
          "commission": {
            "$multiply": [
              "$commission",
              -1
            ]
          },
          "sport_name": {
            "$cond": [
              {
                "$eq": [
                  "$type",
                  1
                ]
              },
              "$sport_name",
              "Session"
            ]
          }
        }
      }
    ];
  },
  getAgentsSportsPL: function (user_id, search, lastAgentsId, AgentsDirectUsers, params) {
    let { from_date, to_date, international_casinos } = params;
    let matchConditions = {
      "$match": {
        "agents_pl_distribution.user_id": {
          "$in": lastAgentsId
        }
      }
    };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    let casinoProvider = {};
    if (!international_casinos) {
      casinoProvider = {
        // If casino provider is null we use same sport_id.
        "sport_id": { "$ifNull": ["$casinoProvider", "$sport_id", "$casinoProvider"] },
        "sport_name": { "$ifNull": ["$casinoProvider", "$sport_name", "$casinoProvider"] },
      };
    }
    return [
      {
        "$facet": {
          "p_l": [
            {
              ...matchConditions
            },
            {
              "$unwind": "$agents_pl_distribution"
            },
            {
              "$match": {
                "agents_pl_distribution.user_id": {
                  "$in": lastAgentsId
                },
                "user_id": {
                  "$nin": AgentsDirectUsers
                }
              }
            },
            {
              "$addFields": {
                ...casinoProvider,
                "casino_provider": "$casinoProvider"
              }
            },
            {
              "$group": {
                "_id": {
                  "user_id": "$agents_pl_distribution.user_id",
                  "sport_id": "$sport_id",
                  "type": "$type"
                },
                "user_id": {
                  "$first": "$agents_pl_distribution.user_id"
                },
                "user_name": {
                  "$first": "$agents_pl_distribution.user_name"
                },
                "user_type_id": {
                  "$first": "$agents_pl_distribution.user_type_id"
                },
                "user_pl": {
                  "$sum": "$user_pl"
                },
                "commission": {
                  "$sum": "$user_commission_pl"
                },
                "share": {
                  "$first": "$agents_pl_distribution.share"
                },
                "sport_name": {
                  "$first": "$sport_name"
                },
                "type": {
                  "$first": "$type"
                },
                "casino_provider": {
                  "$first": "$casino_provider"
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "user_id": 1,
                "user_name": 1,
                "user_type_id": 1,
                "casino_provider": 1,
                "user_pl": {
                  "$multiply": [
                    "$user_pl",
                    -1
                  ]
                },
                "commission": {
                  "$multiply": [
                    "$commission",
                    -1
                  ]
                },
                "share": {
                  "$concat": [{ "$toString": "$share" }, "%"]
                },
                "sport_name": {
                  "$cond": [
                    {
                      "$eq": [
                        "$type",
                        1
                      ]
                    },
                    "$sport_name",
                    "Session"
                  ]
                }
              }
            }
          ],
          "commission": [
            {
              ...matchConditions
            },
            {
              "$unwind": "$agents_pl_distribution"
            },
            {
              "$match": {
                "agents_pl_distribution.user_id": {
                  "$in": [user_id, ...lastAgentsId]
                },
                "user_id": {
                  "$nin": AgentsDirectUsers
                }
              }
            },
            {
              "$addFields": {
                ...casinoProvider,
                "casino_provider": "$casinoProvider"
              }
            },
            {
              "$group": {
                "_id": {
                  "user_id": "$user_id",
                  "sport_id": "$sport_id",
                  "type": "$type"
                },
                "user_id": {
                  "$first": "$user_id"
                },
                "user_name": {
                  "$first": "$user_name"
                },
                "sport_id": {
                  "$first": "$sport_id"
                },
                "sport_name": {
                  "$first": "$sport_name"
                },
                "type": {
                  "$first": "$type"
                },
                "casino_provider": {
                  "$first": "$casino_provider"
                },
                "agents_pl_distribution": {
                  "$push": "$agents_pl_distribution"
                }
              }
            },
            {
              "$addFields": {
                "share_commission": {
                  "$sum": {
                    "$map": {
                      "input": "$agents_pl_distribution",
                      "as": "distribution",
                      "in": {
                        "$cond": [
                          {
                            "$eq": [
                              "$$distribution.user_id",
                              user_id
                            ]
                          },
                          "$$distribution.commission",
                          0
                        ]
                      }
                    }
                  }
                },
                "agent_user_id": {
                  "$last": "$agents_pl_distribution.user_id"
                },
                "agent_user_name": {
                  "$last": "$agents_pl_distribution.user_name"
                },
                "user_type_id": {
                  "$last": "$agents_pl_distribution.user_type_id"
                }
              }
            },
            {
              "$group": {
                "_id": {
                  "user_id": "$agent_user_id",
                  "sport_id": "$sport_id",
                  "type": "$type"
                },
                "user_id": {
                  "$first": "$user_id"
                },
                "user_name": {
                  "$first": "$agent_user_name"
                },
                "user_type_id": {
                  "$first": "$user_type_id"
                },
                "share_commission": {
                  "$sum": "$share_commission"
                },
                "sport_name": {
                  "$first": "$sport_name"
                },
                "type": {
                  "$first": "$type"
                },
                "casino_provider": {
                  "$first": "$casino_provider"
                }
              }
            },
            {
              "$project": {
                "_id": 0,
                "user_id": "$_id.user_id",
                "user_name": 1,
                "user_type_id": 1,
                "casino_provider": 1,
                "share_commission": {
                  "$round": [
                    "$share_commission",
                    2
                  ]
                },
                "sport_name": {
                  "$cond": [
                    {
                      "$eq": [
                        "$type",
                        1
                      ]
                    },
                    "$sport_name",
                    "Session"
                  ]
                }
              }
            }
          ]
        }
      }
    ];
  },
  downlinePLUsers: function (user_id, search, AgentsDirectUsers, params) {
    let { from_date, to_date } = params;
    let matchConditions = {
      "$match": {
        "user_id": {
          "$in": AgentsDirectUsers
        }
      }
    };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    return [
      {
        ...matchConditions
      },
      {
        "$unwind": "$agents_pl_distribution"
      },
      {
        "$match": {
          "agents_pl_distribution.user_id": user_id
        }
      },
      {
        "$group": {
          "_id": {
            "user_id": '$user_id'
          },
          "user_id": {
            "$first": '$user_id'
          },
          "user_name": {
            "$first": '$user_name'
          },
          "user_pl": {
            "$sum": '$user_pl'
          },
          "commission": {
            "$sum": '$user_commission_pl'
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "user_id": 1,
          "user_name": 1,
          "user_type_id": '1',
          "total": {
            "$multiply": [{ "$round": ['$user_pl', 2] }, -1]
          },
          "commission": {
            "$multiply": [{ "$round": ['$commission', 2] }, -1]
          }
        }
      }
    ];
  },
  downlinePLAgents: function (search, lastAgentsId, AgentsDirectUsers, params) {
    let { from_date, to_date } = params;
    let matchConditions = {
      "$match": {
        "agents_pl_distribution.user_id": {
          "$in": lastAgentsId
        }
      }
    };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (search)
      if (search.constructor.name === "Object")
        Object.assign(matchConditions["$match"], search);
    return [
      {
        ...matchConditions
      },
      {
        "$unwind": "$agents_pl_distribution"
      },
      {
        "$match": {
          "agents_pl_distribution.user_id": {
            "$in": lastAgentsId
          },
          "user_id": {
            "$nin": AgentsDirectUsers
          }
        }
      }, {
        "$group": {
          "_id": {
            "user_id": '$agents_pl_distribution.user_id'
          },
          "user_id": {
            "$first": '$agents_pl_distribution.user_id'
          },
          "user_name": {
            "$first": '$agents_pl_distribution.user_name'
          },
          "user_type_id": {
            "$first": '$agents_pl_distribution.user_type_id'
          },
          "user_pl": {
            "$sum": '$user_pl'
          },
          "commission": {
            "$sum": '$user_commission_pl'
          }
        }
      }, {
        "$project": {
          "_id": 0,
          "user_id": 1,
          "user_name": 1,
          "user_type_id": 1,
          "total": {
            "$multiply": [{ "$round": ['$user_pl', 2] }, -1]
          },
          "commission": {
            "$multiply": [{ "$round": ['$commission', 2] }, -1]
          },
        }
      }
    ];
  },
  sportsP_L: function (params) {
    const { user_id, from_date, to_date, is_user } = params;
    let matchConditions = { "$match": { 'agents_pl_distribution.user_id': user_id } };
    if (is_user)
      matchConditions = { "$match": { user_id } };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    return [
      {
        ...matchConditions
      },
      {
        "$group": {
          "_id": {
            "sport_id": '$sport_id',
            "type": '$type'
          },
          "type": {
            "$first": '$type'
          },
          "sport_id": {
            "$first": '$sport_id'
          },
          "sport_name": {
            "$first": '$sport_name'
          },
          "user_pl": {
            "$sum": '$user_pl'
          },
          "user_commission_pl": {
            "$sum": '$user_commission_pl'
          },
          "casinoProvider": {
            "$first": '$casinoProvider'
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "sport_id": {
            "$cond": {
              "if": { "$eq": ['$casinoProvider', 'QT'] },
              "then": 'QT',
              "else": '$sport_id'
            }
          },
          "type": 1,
          "sport_name": {
            "$cond": [
              {
                "$eq": [
                  '$type', 1
                ]
              },
              '$sport_name',
              'Session'
            ]
          },
          ...PLAndCommission
        }
      }
    ]
  },
  matchWiseP_L: function (params) {
    const { user_id, sport_id, type, is_user, from_date, to_date, page, limit } = params;
    let { search } = params;
    let matchConditions = { "$match": { 'agents_pl_distribution.user_id': user_id, sport_id } };
    if (is_user)
      matchConditions = { "$match": { user_id, sport_id } };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (type)
      matchConditions["$match"]["type"] = type;
    if (search)
      matchConditions["$match"]["$or"] = [
        { match_name: { $regex: new RegExp(search, "i") } },
        { user_pl: isNaN(parseFloat(search)) ? -1 : parseFloat(search) },
        { user_commission_pl: isNaN(parseFloat(search)) ? -1 : parseFloat(search) },
      ];
    let skip = (page - 1) * limit;
    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': {
            'match_id': '$match_id'
          },
          'match_name': {
            '$first': '$match_name'
          },
          'match_date': {
            '$first': '$match_date'
          },
          'user_pl': {
            '$sum': '$user_pl'
          },
          'user_commission_pl': {
            '$sum': '$user_commission_pl'
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'match_id': '$_id.match_id',
          'match_name': '$match_name',
          'match_date': '$match_date',
          ...PLAndCommission
        }
      },
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }]
        }
      }
    ];
  },
  usersPLByMarket: function (params) {
    const { user_id, is_user, market_id, page, limit } = params;
    let { search } = params;
    let matchConditions = { "$match": { 'agents_pl_distribution.user_id': user_id, "event_id": market_id } };
    if (is_user)
      matchConditions = { "$match": { user_id, "event_id": market_id } };
    if (search)
      matchConditions["$match"]["$or"] = [
        { user_name: { $regex: new RegExp(search, "i") } },
        { user_pl: isNaN(parseFloat(search)) ? -1 : parseFloat(search) },
        { user_commission_pl: isNaN(parseFloat(search)) ? -1 : parseFloat(search) },
      ];
    let skip = (page - 1) * limit;
    return [
      {
        ...matchConditions
      },
      {
        "$group": {
          "_id": '$user_id',
          "user_id": {
            "$first": '$user_id'
          },
          "user_name": {
            "$first": '$user_name'
          },
          "sport_name": {
            "$first": '$sport_name'
          },
          "match_id": {
            "$first": '$match_id'
          },
          "match_name": {
            "$first": '$match_name'
          },
          "market_id": {
            "$first": '$event_id'
          },
          "market_name": {
            "$first": '$event_name'
          },
          "winner_name": {
            "$first": '$winner_name'
          },
          "user_pl": {
            "$sum": '$user_pl'
          },
          "user_commission_pl": {
            "$sum": '$user_commission_pl'
          },
          "settle_date_time": {
            "$first": '$createdAt'
          }
        }
      },
      {
        "$project": {
          "_id": 0,
          "user_id": 1,
          "user_name": 1,
          "sport_name": 1,
          "match_id": 1,
          "match_name": 1,
          "market_id": 1,
          "market_name": 1,
          "winner_name": 1,
          ...PLAndCommission,
          "settle_date_time": 1
        }
      },
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }]
        }
      }
    ];
  },
  eventsStackAndCommission: function (params) {
    const { user_id, sport_id, is_user, from_date, to_date } = params;
    let matchConditions = { "$match": { 'agents_pl_distribution.user_id': user_id, sport_id } };
    if (is_user)
      matchConditions = { "$match": { user_id, sport_id } };
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    return [
      {
        ...matchConditions
      },
      {
        "$addFields": {
          "event_type": {
            "$cond": [{ "$eq": ['$type', 2] }, 'Fancy', '$event_name']
          }
        }
      },
      {
        "$group": {
          "_id": {
            "event_type": '$event_type'
          },
          "event_name": {
            "$first": '$event_type'
          },
          "stack": {
            "$sum": '$stack'
          },
          "user_commission_pl": {
            "$sum": '$user_commission_pl'
          }
        }
      },
      {
        "$project": {
          "_id": 0
        }
      }
    ];
  },
  sportsPL: function (req) {

    const { user_id } = req.User;

    const { from_date, to_date } = req.body;

    let filter = { 'agents_pl_distribution.user_id': ObjectId(user_id) };

    if (from_date && to_date) {
      filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    }

    let matchConditions = { '$match': filter };

    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$sport_id',
          'sport_id': {
            '$first': '$sport_id'
          },
          'sport_name': {
            '$first': '$sport_name'
          },
          'casinoProvider': {
            '$first': '$casinoProvider'
          },
          'profit_loss': {
            '$sum': {
              '$add': [
                '$user_pl', '$user_commission_pl'
              ]
            }
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'sport_id': 1,
          'sport_name': {
            '$cond': [
              {
                '$eq': [
                  '$casinoProvider', null
                ]
              }, '$sport_name', '$casinoProvider'
            ]
          },
          'casinoProvider': {
            '$cond': [
              {
                '$eq': [
                  '$casinoProvider', null
                ]
              }, '$sport_id', '$casinoProvider'
            ]
          },
          'profit_loss': {
            '$round': [
              '$profit_loss', 2
            ]
          }
        }
      },
      {
        '$group': {
          '_id': '$casinoProvider',
          'sport_id': {
            '$first': '$sport_id'
          },
          'sport_name': {
            '$first': '$sport_name'
          },
          'casinoProvider': {
            '$first': '$casinoProvider'
          },
          'profit_loss': {
            '$sum': '$profit_loss'
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'profit_loss': {
            '$round': [
              '$profit_loss', 2
            ]
          },
          'sport_id': 1,
          'sport_name': 1
        }
      }
    ];
  },
  sportsWiseOnlyPL: function (req) {

    const { user_id } = req.User;

    const { from_date, to_date } = req.body;

    let filter = {
      'agents_pl_distribution.user_id': ObjectId(user_id),
      '$or': [
        { is_demo: false },
        { is_demo: { $exists: false } }
      ]
    };

    if (from_date && to_date) {
      filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    }

    let matchConditions = { '$match': filter };

    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': {
            'sport_id': '$sport_id',
            'type': '$type'
          },
          'sport_id': {
            '$first': '$sport_id'
          },
          'sport_name': {
            '$first': '$sport_name'
          },
          'type': {
            '$first': '$type'
          },
          'casinoProvider': {
            '$first': '$casinoProvider'
          },
          'profit_loss': {
            '$sum': {
              '$add': [
                '$user_pl', '$user_commission_pl'
              ]
            }
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'sport_id': 1,
          'type': 1,
          'sport_name': {
            '$cond': [
              {
                '$eq': [
                  '$casinoProvider', null
                ]
              }, {
                '$cond': [
                  {
                    '$eq': [
                      '$type', 2
                    ]
                  }, 'Session', '$sport_name'
                ]
              }, '$casinoProvider'
            ]
          },
          'casinoProvider': {
            '$cond': [
              {
                '$eq': [
                  '$casinoProvider', null
                ]
              }, {
                '$cond': [
                  {
                    '$eq': [
                      '$type', 2
                    ]
                  }, 'session', '$sport_id'
                ]
              }, '$casinoProvider'
            ]
          },
          'profit_loss': {
            '$round': [
              '$profit_loss', 2
            ]
          }
        }
      }, {
        '$group': {
          '_id': '$casinoProvider',
          'sport_id': {
            '$first': '$sport_id'
          },
          'sport_name': {
            '$first': '$sport_name'
          },
          'casinoProvider': {
            '$first': '$casinoProvider'
          },
          'profit_loss': {
            '$sum': '$profit_loss'
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'profit_loss': {
            '$round': [
              {
                '$multiply': [
                  '$profit_loss', -1
                ]
              }, 2
            ]
          },
          'sport_id': 1,
          'sport_name': 1
        }
      }
    ];
  }
}