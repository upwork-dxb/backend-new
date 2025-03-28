const { SUCCESS } = require('../../utils/constants');
const { ResError, ResSuccess } = require('../../lib/expressResponder');
const QtechGames = require('../../models/qtechGames');
const qtechGamesService = require('../../admin-backend/service/qtechGamesService');
const { STATUS_500 } = require('../../utils/httpStatusCode')

module.exports = {
  setQtechGameFavoriteUnFavorite: function (req, res) {
    const { id } = req.body;
    return QtechGames.findOne({ id })
      .select("userFavorites")
      .then(qtechGame => {
        if (!qtechGame) {
          return ResError(res, { msg: "Game not found!" });
        }
        let user_id = req.User.user_id || req.User._id;
        let msg = "Game added to favorites!";
        if (JSON.parse(JSON.stringify(qtechGame)).hasOwnProperty("userFavorites")) {
          if (qtechGame.userFavorites.includes(user_id)) {
            qtechGame.userFavorites.pull(user_id);
            msg = "Game removed from favorites!";
          } else {
            qtechGame.userFavorites.push(user_id);
          }
          qtechGame.save();
          return ResSuccess(res, { msg });
        }
        // If userFavorites is undefined or empty, initialize it with an array.
        qtechGame.userFavorites = [user_id];
        qtechGame.save();
        return ResSuccess(res, { msg });
      })
      .catch(error => ResError(res, error));
  },
  favoriteQtechGamesList: function (req, res) {
    return qtechGamesService.qtechGamesList(req)
      .then(result => {
        if (result.statusCode === SUCCESS) {
          return ResSuccess(res, result.data);
        } else {
          return ResError(res, { msg: result.data });
        }
      })
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }
}