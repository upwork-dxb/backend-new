module.exports = {
  getTeamPositionQuery: function (user_id, match_id, market_id, runners) {
    let matchConditions = {
      "$match": {
        "user_id": user_id
      }
    };
    if (match_id) {
      if (!Array.isArray(match_id))
        match_id = match_id.split(",");
      matchConditions["$match"]["match_id"] = { "$in": match_id }
    }
    if (market_id) {
      if (!Array.isArray(market_id))
        market_id = market_id.split(",");
      matchConditions["$match"]["market_id"] = { "$in": market_id }
    }
    let project = {
      "$project": {
        "_id": 0,
        "match_id": 1,
        "market_id": 1,
        "selection_id": 1,
        "selectionId": 1,
        "selection_name": 1,
        "name": 1,
        "sort_priority": 1,
        "stack": 1,
        "sort_name": 1,
        "win_value": 1,
        "loss_value": 1,
        "win_loss": 1,
        "stacks_sum": 1,
        "user_pl": 1,
        "user_commission_pl": 1,
        "win_loss": { "$sum": ["$win_value", "$loss_value"] },
        "unmatched_loss_value": 1,
        "unmatched_win_value": 1,
      }
    };
    if (!runners.length) {
      project = {
        "$project": {
          "_id": 0,
          "match_id": 1,
          "market_id": 1,
          "selection_id": 1,
          "sort_priority": 1,
          "stacks_sum": 1,
          "user_pl": 1,
          "user_commission_pl": 1,
          "win_value": 1,
          "loss_value": 1,
          "win_loss": { "$sum": ["$win_value", "$loss_value"] }
        }
      }
    }
    return [
      {
        ...matchConditions
      },
      {
        ...project
      },
      {
        "$sort": { "sort_name": 1 }
      }
    ]
  }
}