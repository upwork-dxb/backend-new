const { ObjectId } = require("bson")

module.exports = {
  getUserByBank: function (data) {
    const { user_id, agent_ids } = data
    const limit = data.limit || 10;
    const page = data.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          'parent_id': ObjectId(user_id)
          // {
          //   $in:[...agent_ids]
          // }
        }
      },
      {
        '$group': {
          '_id': {
            'account_no': "$account_no",
            'bank_name': "$bank_name",
          },
          'total_user_count': {
            '$sum': 1,
          },
        },
      },
      { '$sort': { 'total_user_count': -1 } },
      {
        '$project': {
          '_id': 0,
          'account_no': "$_id.account_no",
          'bank_name': "$_id.bank_name",
          'total_user_count': 1,
        }
      },
      {
        '$addFields': {
          'page': page,
        }
      },
      { '$skip': skip },
      { '$limit': limit }
    ]

  },
  getUserBankData: function (data) {
    const { account_no, user_id } = data;
    const limit = data.limit || 10;
    const page = data.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          'parent_id': ObjectId(user_id),
          'account_no': account_no
        }
      },
      {
        '$group': {
          '_id': {
            'account_no': '$account_no',
          },
          'user_details': {
            '$push': {
              'account_no': '$account_no',
              'ifsc_code': '$ifsc_code',
              'bank_name': '$bank_name',
              'user_name': '$user_name',
              'bank_holder_name': '$bank_holder_name',
              'date': {
                '$dateToString': {
                  'format': '%Y-%m-%d %H:%M:%S',
                  'date': {
                    '$toDate': '$created_at'
                  },
                  'timezone': 'Asia/Kolkata'
                }
              }
            }
          },
          'total_user_count': {
            '$sum': 1,
          }
        }
      },
      {
        '$project': {
          '_id': 0,
          'total_user_count': 1,
          'user_details': { $slice: ['$user_details', skip, limit] }
        }
      },
      {
        '$addFields': {
          'page': page,
        }
      },
    ]
  },
  getUserByIP: function (data) {
    const { from_date, to_date, user_id } = data;
    const limit = data.limit || 10;
    const page = data.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          'user_id': ObjectId(user_id),
          'login_time': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date)
          }
        }
      },
      {
        '$sort': {
          'login_time': -1
        }
      },
      {
        '$group': {
          '_id': "$ip_address",
          'total_user_count': { '$sum': 1 },
          'device_info': { '$first': '$device_info' },
          'browser_info': { '$first': '$browser_info' },
          'geo': { '$first': '$geolocation' },
          'last_login_time': { '$first': '$login_time' }
        }
      },
      {
        '$project': {
          '_id': 0,
          'ip_address': '$_id',
          'device_info': 1,
          'browser_info': 1,
          'geo': 1,
          'last_login_time': 1,
          'total_user_count': 1
        }
      },
      {
        '$addFields': {
          'page': page,
        }
      },
      { '$skip': skip },
      { '$limit': limit }
    ]
  },
  getUserDataByIP: function (data) {
    const { from_date, to_date, ip_address } = data;
    const limit = data.limit || 10;
    const page = data.page || 1;
    let skip = (page - 1) * limit;
    return [
      {
        '$match': {
          'createdAt': {
            '$gte': new Date(from_date),
            '$lt': new Date(to_date),
          },
          'ip_address': ip_address
        }
      },
      {
        '$group': {
          '_id': {
            'ip_address': '$ip_address',
          },
          'user_data': {
            '$push': {
              'name': '$geolocation',
              'parent_user_name': '$parent_user_name',
            },
          },
          'total_user_count': {
            '$sum': 1,
          },
        },
      },
      {
        '$sort': {
          'total_user_count': -1,
        },
      },
      {
        '$project': {
          '_id': 0,
          'ip_address': '$_id.ip_address',
          'total_user_count': 1,
          'user_data': { '$slice': ['$user_data', skip, limit] },
        },
      },
      {
        '$addFields': {
          'page': page,
        }
      },
    ]
  },

}