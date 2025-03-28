module.exports = {

  getCalculatedExposureAndStack: (params) => {

    const { roundId } = params;

    let filter = { isProcessed: 0 };

    if (roundId) {
      filter["roundId"] = roundId;
    }

    let matchConditions = { '$match': filter };

    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$userId',
          'userId': { '$first': '$userId' },
          'calculateExposure': {
            '$sum': '$calculateExposure'
          },
          'stackSum': {
            '$sum': '$stackSum'
          }
        }
      }
    ];

  },

  getCalculatedExposuresList: (params) => {

    const { roundId, updatedAt } = params;

    let filter = { isProcessed: 0 };

    if (roundId) {
      filter["roundId"] = roundId;
    }

    if (updatedAt) {
      filter["updatedAt"] = updatedAt;
    }

    let matchConditions = { '$match': filter };

    return [
      {
        ...matchConditions
      },
      {
        '$group': {
          '_id': '$roundId',
          'roundId': { '$first': '$roundId' },
          'gameId': { '$first': '$gameId' },
          'updatedAt': { '$last': '$updatedAt' },
        }
      }
    ];

  },

}