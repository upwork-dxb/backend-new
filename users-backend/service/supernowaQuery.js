module.exports = {
  getAgentProfit: function (params) {
    const { user, gameData, partnerKey } = params
      , { id } = user, { providerCode, gameCode, providerRoundId } = gameData;
    return [
      {
        "$match": {
          "partnerKey": partnerKey,
          "request_type": 'bet',
          "refund_status": { '$ne': 1 },
          "user.id": id,
          "gameData.providerCode": providerCode,
          "gameData.gameCode": gameCode,
          "gameData.providerRoundId": providerRoundId,
          "path": "/debit"
        }
      },
      {
        "$group": {
          "_id": null,
          "agent_pl": {
            '$sum': '$transactionData.amount'
          }
        }
      },
      {
        "$project": {
          "agent_pl": 1
        }
      }
    ];
  },
  getBetAmount: function (params) {
    const { user, gameData, partnerKey } = params
      , { id } = user, { providerCode, gameCode, providerRoundId } = gameData;
    return [
      {
        "$match": {
          "partnerKey": partnerKey,
          "request_type": 'bet',
          "refund_status": { '$ne': 1 },
          "user.id": id,
          "gameData.providerCode": providerCode,
          "gameData.gameCode": gameCode,
          "gameData.providerRoundId": providerRoundId,
          "path": {
            "$in": [
              '/debit',
              '/credit'
            ]
          }
        }
      },
      {
        "$addFields": {
          'transactionData.amount': {
            "$cond": [
              {
                "$eq": ['$path', '/debit']
              },
              {
                "$multiply": ['$transactionData.amount', -1]
              },
              '$transactionData.amount'
            ]
          }
        }
      },
      {
        "$group": {
          "_id": null,
          "bet_amount": { "$sum": '$transactionData.amount' }
        }
      },
      {
        "$project": {
          "bet_amount": { "$multiply": [{ "$round": ['$bet_amount', 2] }, -1] }
        }
      }
    ]
  }
}