const { ObjectId } = require("bson");
const { USER_TYPE_USER } = require('../../utils/constants');

module.exports = {
  qtechGames: (request) => {
    const userId = request.User.user_id || request.User._id;
    const userType = request.User.user_type_id;
    let matchConditions;
    if (request.path === "/favoriteQtechGamesList") {
      matchConditions = { "$match": { "is_active": 1, "userFavorites": userId } };
    } else {
      if (userType === USER_TYPE_USER) {
        matchConditions = { "$match": { "is_active": 1 } };
      } else {
        matchConditions = { "$match": { "is_active": { $in: [0, 1] } } };
      }
    }
    return [
      {
        $addFields: {
          isFavorited: {
            $in: [userId, '$userFavorites'],
          },
        },
      },
      matchConditions,
      {
        $sort: {
          games_order: 1, // 1 for ascending order, -1 for descending order
        },
      },
      {
        $project: {
          userFavorites: 0,
        },
      },
    ];
  }
}