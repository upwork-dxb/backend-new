module.exports = {
  getTotalUsersCountByGameRound: (request) => {
    const { roundId } = request.body;
    let matchConditions = { "$match": { roundId, completed: "true" } };
    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$userId',
        }
      }
    ];
  },
  userProfitLossRoundWise: (request) => {
    const { roundId } = request.body;
    let matchConditions = { "$match": { roundId, isProcessed: 0 } };
    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$userId',
          'userId': { '$first': '$userId' },
          'roundId': { '$first': '$roundId' },
          'clientRoundId': { '$first': '$clientRoundId' },
          'balance': {
            '$sum': '$amount'
          }
        }
      }
    ];
  },
  userProfitLossRoundWiseV1: (request) => {
    const { roundId, playerId } = request.body;
    let matchConditions = { "$match": { roundId, playerId, isProcessed: 0 } };
    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$userId',
          'userId': { '$first': '$userId' },
          'roundId': { '$first': '$roundId' },
          'clientRoundId': { '$first': '$clientRoundId' },
          'balance': {
            '$sum': '$amount'
          }
        }
      }
    ];
  }
}