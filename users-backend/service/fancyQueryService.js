const { ObjectId } = require("bson");

module.exports = {
  getFancyBetForUserPositionQuery: function (user_id, fancy_id, bet_id) {
    let matchConditions = {
      '$match': {
        'delete_status': 0,
        user_id: ObjectId(user_id),
        fancy_id
      }
    };
    if (bet_id)
      matchConditions["$match"]["_id"] = { "$ne": ObjectId(bet_id) };
    return [
      { ...matchConditions },
      {
        '$group': {
          '_id': {
            'run': "$run",
            'is_back': "$is_back",
            'size': "$size"
          },
          'stack': {
            '$sum': '$stack'
          },
          'liability': {
            '$sum': '$liability',
          },
          'profit': {
            '$sum': '$profit',
          }
        }
      },
      {
        '$sort': { '_id.run': 1 }
      },
      {
        '$project': {
          '_id': 0,
          'run': {
            '$toInt': '$_id.run'
          },
          'is_back': {
            '$toInt': '$_id.is_back'
          },
          'size': {
            '$toInt': '$_id.size'
          },
          'stack': {
            '$toInt': '$stack'
          },
          'liability': {
            '$toInt': '$liability'
          },
          'profit': {
            '$toInt': '$profit'
          },
          'per': {
            '$toInt': '100'
          }
        }
      }
    ];
  }
}