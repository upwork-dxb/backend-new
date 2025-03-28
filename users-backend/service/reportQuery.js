module.exports = {

  eventsProfitLossQuery: (matchConditions) => {

    return [
      matchConditions,
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
          "type": 1,
          "winner_name": 1,
          "user_pl": 1,
          "user_commission_pl": 1,
          "net_pl": {
            "$add": ["$user_pl", "$user_commission_pl"]
          },
          "result_date": '$createdAt'
        }
      }
    ];
  }
}