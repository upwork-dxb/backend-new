const { ObjectId } = require("bson")
  , { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, LABEL_DIAMOND, LABEL_B2C_MANAGER } = require("../../utils/constants");

module.exports = {
  getUsersExposure: function (user_id) {
    return [
      {
        $match: {
          $and: [
            {
              user_type_id: 1,
              "parent_level_ids.user_id": user_id
            },
            {
              $or: [
                {
                  markets_liability: {
                    $exists: true,
                    $ne: null
                  }
                },
                {
                  sessions_liability: {
                    $exists: true,
                    $ne: null
                  }
                }
              ]
            }
          ]
        }
      }, {
        $project: {
          _id: 0,
          markets_liability: 1,
          sessions_liability: 1
        }
      }, {
        $facet: {
          markets: [
            {
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: [
                    '$markets_liability'
                  ]
                }
              }
            }
          ],
          fancies: [
            {
              $replaceRoot: {
                newRoot: {
                  $mergeObjects: [
                    '$sessions_liability'
                  ]
                }
              }
            }
          ]
        }
      }
    ]
  },
  creditReferenceLogs: (params) => {
    const { user_id, search, user_name, page, limit } = params;
    let skip = (page - 1) * limit;
    let matchConditions = { "$match": { user_id: ObjectId(user_id) } };
    if (user_name)
      matchConditions["$match"]["user_name"] = user_name;
    if (search)
      matchConditions["$match"]["$or"] = [
        { old_credit_reference: isNaN(parseInt(search)) ? -1 : parseInt(search) },
        { new_credit_reference: isNaN(parseInt(search)) ? -1 : parseInt(search) },
        { user_name: { $regex: new RegExp(search, "i") } }, { name: { $regex: new RegExp(search, "i") } }, { from: { $regex: new RegExp(search, "i") } }
      ];
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 0,
          "from": 1,
          "user_name": 1,
          "name": 1,
          "old_credit_reference": 1,
          "new_credit_reference": 1,
          "createdAt": 1
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
  getPasswordChangedHistory: (params) => {
    const { User: Self, user_id, search, user_name, page, limit, from_date, to_date } = params;
    let skip = (page - 1) * limit;
    let matchConditions = {};
    if (user_id) {
      matchConditions = { "$match": { user_id: ObjectId(user_id) } };
    } else {
      matchConditions = { "$match": { changed_by_user_id: ObjectId(Self._id) } };
    }
    if (from_date && to_date)
      matchConditions["$match"]["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    if (user_name)
      matchConditions["$match"]["user_name"] = user_name;
    if (search)
      matchConditions["$match"]["$or"] = [
        { user_name: { $regex: new RegExp(search, "i") } },
        { comment: { $regex: new RegExp(search, "i") } },
      ];
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 0,
          "user_name": 1,
          "changed_by_user_name": 1,
          "changed_by_user": 1,
          "comment": 1,
          "mobile": 1,
          "geolocation": 1,
          "ip_address": 1,
          "device_info": 1,
          "createdAt": 1
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
  getBalanceReferenceSum: (user_id) => {
    return [{
      "$match": {
        "parent_id": ObjectId(user_id)
      }
    }, {
      "$group": {
        "_id": null,
        "balance_reference": {
          "$sum": '$balance_reference'
        }
      }
    }]
  },
  usersLogs: (params) => {
    const { user_id, user_type_id, search, page, limit } = params;
    let skip = (page - 1) * limit;
    let matchConditions = { "$match": { "parent_level_ids.user_id": ObjectId(user_id) } };
    if (user_type_id == USER_TYPE_SUPER_ADMIN)
      matchConditions = { "$match": { "$or": [{ "parent_level_ids.user_id": ObjectId(user_id) }, { user_id: ObjectId(user_id) }] } };
    if (search)
      if (search.constructor.name === "Object") {
        if (search.hasOwnProperty("geolocation")) {
          let geolocation = {};
          Object.keys(search.geolocation).map(key => {
            geolocation[`geolocation.${key}`] = search.geolocation[key];
          });
          Object.assign(search, geolocation);
          delete search.geolocation;
        }
        Object.assign(matchConditions["$match"], search);
      }
    let fields = {};
    if (user_type_id != USER_TYPE_SUPER_ADMIN)
      fields = {
        "user_name": 1,
        "name": 1,
        "login_time": 1,
        "logout_time": 1,
        "ip_address": 1,
        "browser_info": 1,
        "device_info": 1,
      };
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 0,
          ...fields
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
  getUsersListCRef: (params) => {
    const { user_id, page, limit, only_end_users, is_self_view, user_name } = params;
    let skip = (page - 1) * limit;
    let filter = { "parent_id": ObjectId(user_id), self_close_account: 0, parent_close_account: 0 };
    if (is_self_view)
      filter["user_type_id"] = { "$ne": 1 };
    if (only_end_users)
      filter["user_type_id"] = 1;
    filter["belongs_to_credit_reference"] = 1;
    filter["belongs_to"] = { "$ne": LABEL_B2C_MANAGER };
    if (user_name)
      filter["user_name"] = { "$regex": new RegExp(user_name, "i") };
    let matchConditions = { "$match": filter };
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 1,
          "user_id": "$_id",
          "user_name": 1,
          "user_type_id": 1,
          "parent_id": 1,
          "label": {
            "$switch": {
              "branches": [
                { "case": { "$eq": [9, "$user_type_id"] }, "then": "Super Admin" },
                { "case": { "$eq": [8, "$user_type_id"] }, "then": "White Label" },
                { "case": { "$eq": [7, "$user_type_id"] }, "then": "Sub Admin" },
                { "case": { "$eq": [6, "$user_type_id"] }, "then": "Hyper" },
                { "case": { "$eq": [5, "$user_type_id"] }, "then": "Senior Super" },
                { "case": { "$eq": [4, "$user_type_id"] }, "then": "Super" },
                { "case": { "$eq": [3, "$user_type_id"] }, "then": "Master" },
                { "case": { "$eq": [2, "$user_type_id"] }, "then": "Agent" },
                { "case": { "$eq": [1, "$user_type_id"] }, "then": "User" },
                { "case": { "$eq": [0, "$user_type_id"] }, "then": "Main" },
              ],
              "default": "Label"
            }
          },
          "credit_reference": 1,
          "partnership": 1,
          "balance": 1,
          "exposure": {
            "$cond": [{ "$eq": ["$user_type_id", USER_TYPE_USER] }, "$liability", { "$toInt": "0" }]
          },
          "available_balance": "$balance_reference",
          "parent_lock_user": 1,
          "self_lock_user": 1,
          "exposure_limit": 1,
          "self_lock_betting": 1,
          "self_lock_fancy_bet": 1,
          "check_event_limit": 1,
          "mobile": 1,
          "createdAt": 1,
          "login_count": 1,
          "last_login_date_time": 1,
          "ip_address": 1,
          "reference_pl": { "$subtract": ["$balance", "$credit_reference"] },
          "is_b2c_dealer": 1,
          "status": {
            "$cond": [{ "$eq": [1, { "$max": ["$self_lock_user", "$parent_lock_user"] }] }, "locked", "active"]
          }
        }
      },
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }]
        }
      },
      {
        '$addFields': {
          "metadata": {
            "$arrayElemAt": ["$metadata", 0]
          }
        }
      }
    ];
  },
  getUsersListDiamond: (request) => {
    const { user_id, page, limit, only_end_users, is_self_view, search, status } = request.body
      , { user_id: Self } = request.User;
    let skip = (page - 1) * limit;
    let filter = {
      "parent_id": ObjectId(user_id), self_close_account: 0, parent_close_account: 0, belongs_to_credit_reference: 1, belongs_to: LABEL_DIAMOND
    };
    if (is_self_view)
      filter["user_type_id"] = { "$ne": 1 };
    if (only_end_users)
      filter["user_type_id"] = 1;
    if (status == "Active") {
      filter["self_lock_user"] = 0;
      filter["parent_lock_user"] = 0;
    }
    else if (status == "Inactive") {
      filter["self_lock_user"] = 1;
      filter["parent_lock_user"] = 1;
    }
    let matchConditions = { "$match": filter };
    if (search)
      if (search.constructor.name === "Object") {
        delete filter["parent_id"];
        filter["parent_level_ids.user_id"] = ObjectId(Self);
        if (search.hasOwnProperty("user_name"))
          search["user_name"] = { "$regex": new RegExp(search.user_name, "i") };
        if (search.hasOwnProperty("domain"))
          search["domain"] = ObjectId(search.domain);
        Object.assign(matchConditions["$match"], search);
      }
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 1,
          "user_id": "$_id",
          "user_name": 1,
          "user_type_id": 1,
          "domain_name": 1,
          "domain": 1,
          "mobile": 1,
          "credit_reference": 1,
          "pts": "$balance_reference",
          "client_pl": { "$subtract": ["$balance_reference", "$credit_reference"] },
          "exposure": {
            "$cond": [{ "$eq": ["$user_type_id", USER_TYPE_USER] }, "$liability", { "$toInt": "0" }]
          },
          "available_pts": "$balance",
          "share": 1,
          "title": 1,
          "parent_lock_user": 1,
          "self_lock_user": 1,
          "exposure_limit": 1,
          "self_lock_betting": 1,
          "self_lock_fancy_bet": 1,
          "parent_lock_betting": 1,
          "parent_lock_fancy_bet": 1,
          "self_close_account": 1,
          "parent_close_account": 1,
          "check_event_limit": 1,
          "is_b2c_dealer": 1,
          "parent_id": 1,
          "is_multi_login_allow": 1,
        }
      },
      {
        '$addFields': {
          "client_pl_share": {
            "$divide": [{
              "$multiply": [{
                "$subtract": [{ "$cond": [{ "$eq": ["$user_type_id", USER_TYPE_USER] }, 0, 100] }, "$share"]
              }, "$client_pl"]
            }, 100]
          }
        }
      },
      { "$sort": { "parent_lock_user": 1, "self_lock_user": 1 } }, // Adding the sort stage here
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }]
        }
      },
      {
        '$addFields': {
          "metadata": {
            "$arrayElemAt": ["$metadata", 0]
          }
        }
      }
    ];
  },
  getDiamondUsersTotalCr: (request) => {
    const { user_id, only_end_users, is_self_view, search } = request.body;
    const { user_id: Self } = request.User;
    let filter = {
      "parent_id": ObjectId(user_id),
      self_close_account: 0,
      parent_close_account: 0,
      belongs_to_credit_reference: 1,
      belongs_to: LABEL_DIAMOND,
    };
    if (is_self_view) {
      filter["user_type_id"] = { "$ne": 1 };
    }
    if (only_end_users) {
      filter["user_type_id"] = 1;
    }
    if (search) {
      if (search.constructor.name === "Object") {
        delete filter["parent_id"];
        filter["parent_level_ids.user_id"] = ObjectId(Self);

        if (search.hasOwnProperty("user_name")) {
          filter["user_name"] = { "$regex": new RegExp(search.user_name, "i") };
        }

        if (search.hasOwnProperty("domain")) {
          filter["domain"] = ObjectId(search.domain);
        }
        // Merge search criteria into the filter
        Object.assign(filter, search);
      }
    }
    return [
      { "$match": filter },
      {
        "$project": {
          "user_type_id": 1,
          "credit_reference": 1,
          "pts": "$balance_reference",
          "client_pl": { "$subtract": ["$balance_reference", "$credit_reference"] },
          "exposure": {
            "$cond": [{ "$eq": ["$user_type_id", USER_TYPE_USER] }, "$liability", { "$toInt": "0" }]
          },
          "available_pts": "$balance",
          "share": 1,
        }
      },
      {
        '$addFields': {
          "client_pl_share": {
            "$divide": [{
              "$multiply": [{
                "$subtract": [{ "$cond": [{ "$eq": ["$user_type_id", USER_TYPE_USER] }, 0, 100] }, "$share"]
              }, "$client_pl"]
            }, 100]
          }
        }
      },
      {
        '$group': {
          '_id': null,
          'total_credit_reference': { '$sum': '$credit_reference' },
          'total_pts': { '$sum': '$pts' },
          'total_client_pl': { '$sum': '$client_pl' },
          'total_exposure': { '$sum': '$exposure' },
          'total_available_pts': { '$sum': '$available_pts' },
          'total_client_pl_share': { '$sum': '$client_pl_share' },
          'data': { '$push': '$$ROOT' }
        }
      },
      {
        '$project': {
          'total_credit_reference': 1,
          'total_pts': 1,
          'total_client_pl': 1,
          'total_exposure': 1,
          'total_available_pts': 1,
          'total_client_pl_share': 1
        }
      }
    ]
  },
  closedUsersList: (params) => {
    const { user_id, page, limit } = params;
    let skip = (page - 1) * limit;
    let filter = {
      "parent_id": ObjectId(user_id),
      "$or": [
        { 'self_close_account': 1 },
        { 'parent_close_account': 1 }
      ]
    };
    let matchConditions = { "$match": filter };
    return [
      {
        ...matchConditions
      },
      {
        "$project": {
          "_id": 1,
          "name": 1,
          "user_name": 1,
          "closed_at": "$updatedAt"
        }
      },
      {
        '$facet': {
          "metadata": [{ "$count": "total" }, { '$addFields': { "page": page } }],
          "data": [{ "$skip": skip }, { "$limit": limit }]
        }
      },
      {
        '$addFields': {
          "metadata": {
            "$arrayElemAt": ["$metadata", 0]
          }
        }
      }
    ];
  },
  getUserByUserName: (req) => {
    const { user_type_id, user_id } = req.User || req.user; // Destructure logging user details
    const user_name = req.body.user_name; // User name from request body
    let matchCondition = {
      user_name: {
        $regex: user_name
      }
    };
    // Additional filter for non-admin users (user_type_id !== 0)
    if (user_type_id != USER_TYPE_SUPER_ADMIN) {
      matchCondition["parent_level_ids.user_id"] = ObjectId(user_id);
    }
    return [
      {
        $match: matchCondition
      },
      {
        $project: {
          user_name: 1,
          parent_user_name: 1,
          parent_id: 1,
          user_type_id: 1,
          _id: 1,
        }
      }
    ];
  },
  getClientPL(req) {
    return [
      {
        '$match': {
          '_id': ObjectId(req.User._id)
        }
      }, {
        '$addFields': {
          'client_pl': {
            '$subtract': [
              '$balance_reference', '$credit_reference'
            ]
          }
        }
      }, {
        '$addFields': {
          'client_pl_share': {
            '$divide': [
              {
                '$multiply': [
                  {
                    '$subtract': [
                      {
                        '$cond': [
                          {
                            '$eq': [
                              '$user_type_id', 0
                            ]
                          }, 0, 100
                        ]
                      }, '$share'
                    ]
                  }, '$client_pl'
                ]
              }, 100
            ]
          }
        }
      }, {
        '$project': {
          '_id': 0,
          'Client PL Share': {
            '$round': [
              '$client_pl_share', 2
            ]
          }
        }
      }
    ];
  },
  setAdminLoginData(params) {
    const { user_id, ip_address, parents_user_name_arr, } = params
    return [
      {
        "updateOne": {
          "filter": { _id: user_id },
          "update": {
            $inc: { login_count: 1 },
            $set: {
              last_login_date_time: new Date(), ip_address,
            }
          }
        }
      },
      {
        "updateMany": {
          "filter": {
            user_name: { '$in': parents_user_name_arr }
          },
          "update": { '$inc': { total_agents_online_count: 1 } }
        }
      }
    ]
  },
  getFieldForRedisUser() {
    return {
      _id: 1,
      name: 1,
      user_name: 1,
      user_type_id: 1,
      title: 1,
      is_demo: 1,
      password: 1,
      parent_level_ids: 1,
      exposure_limit: 1,
      partnership: 1,
      parent_id: 1,
      parent_name: 1,
      point: 1,
      parent_user_name: 1,
      self_lock_user: 1,
      parent_lock_user: 1,
      last_login_ip_address: 1,
      self_lock_betting: 1,
      parent_lock_betting: 1,
      self_lock_fancy_bet: 1,
      parent_lock_fancy_bet: 1,
      self_close_account: 1,
      parent_close_account: 1,
      userSettingSportsWise: 1,
      partnerships: 1,
      domain_name: 1,
      have_admin_rights: 1,
      sports_permission: 1,
      belongs_to: 1,
      is_change_password: 1,
      domain: 1,
      is_multi_login_allow: 1,
      isChipSummary: 1,
      transaction_password: 1,
      telegram_chat_id: 1,
      is_telegram_enable: 1,
      // raw_password: 1,
      expire_time: 1,
      otp: 1,
      belongs_to_b2c: 1,
      check_event_limit: 1,
      is_dealer: 1,
      is_b2c_dealer: 1,
      is_enable_telegram_default: 1,
      rule_accept: 1,
      mobile: 1,
      is_auto_credit_reference: 1,
      transaction_password_attempts: 1,
      is_transaction_password_locked: 1,
      is_auth_app_enabled: 1,
      is_secure_auth_enabled: 1,
      otp_purpose: 1,
      is_auto_demo: 1,
      auth_app_id: 1,
      allow_social_media_dealer: 1,
    };
  }
}