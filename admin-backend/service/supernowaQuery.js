module.exports = {
  getOldestRoundIs: function () {
    return [
      {
        "$group": {
          "_id": {
            "providerCode": '$gameData.providerCode',
            "gameCode": '$gameData.gameCode',
            "providerRoundId": '$gameData.providerRoundId'
          },
          "createdAt": {
            "$first": '$createdAt'
          }
        }
      },
      {
        "$sort": {
          "createdAt": 1
        }
      },
      {
        "$limit": 1
      }
    ];
  },
  downloadLogs: function (params) {
    let filter = {};
    const { from_date, to_date } = params;
    filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
    let matchConditions = { "$match": filter };
    return [
      {
        ...matchConditions
      },
      {
        $addFields: {
          dateIST: {
            $dateToString: {
              format: '%Y-%m-%d %H:%M:%S',
              date: '$createdAt',
              timezone: 'Asia/Calcutta'
            }
          }
        }
      }
    ];
  }
}