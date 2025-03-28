module.exports = {
  settlementUsersCrDr: function (parent_id, user_id, amount) {
    return [
      {
        'updateOne': {
          'filter': { _id: parent_id },
          'update': { '$inc': { balance: amount, balance_reference: amount } }
        }
      },
      {
        'updateOne': {
          'filter': { _id: user_id },
          'update': { '$inc': { balance: -amount, balance_reference: -amount } }
        }
      },
      {
        'updateOne': {
          'filter': { _id: user_id },
          'update': { '$inc': { total_settled_amount: amount, profit_loss: -amount } }
        }
      }
    ];
  },
  settlementAgentsCrDr: function (parent_id, user_id, amount) {
    return [
      {
        'updateOne': {
          'filter': { _id: parent_id },
          'update': { '$inc': { balance: amount, balance_reference: amount } }
        }
      },
      {
        'updateOne': {
          'filter': { _id: user_id },
          'update': { '$inc': { balance: -amount, balance_reference: -amount } }
        }
      },
      {
        'updateOne': {
          'filter': { _id: user_id },
          'update': { '$inc': { total_settled_amount: amount } }
        }
      }
    ];
  },
  settlementUsersAgentsAccStat: function (user_id, settlement_id, description, amount) {
    return [
      {
        '$match': {
          '_id': user_id
        }
      }, {
        '$project': {
          '_id': 0,
          'user_id': '$_id',
          'user_name': 1,
          'user_type_id': 1,
          'point': 1,
          'parent_id': 1,
          'parent_user_name': 1,
          'domain_name': 1,
          'description': {
            '$concat': ['Settlement: ', description]
          },
          'statement_type': '6',
          'amount': amount.toString(),
          'available_balance': '$balance',
          'match_id': settlement_id.toString()
        }
      }
    ];
  },
}