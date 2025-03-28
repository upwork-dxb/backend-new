const { ObjectId } = require("bson");
const QtechGames = require('../../models/qtechGames');
const qtechGamesQuery = require('./qtechGamesQuery');
const globalFunction = require('../../utils/globalFunction');
const { SUCCESS, NOT_FOUND, SERVER_ERROR } = require('../../utils/constants');
const resultResponse = globalFunction.resultResponse;

function qtechGamesList(request) {
  return QtechGames.aggregate(qtechGamesQuery.qtechGames(request))
    .then(qtechGames => {
      if (qtechGames.length) {
        const response = {
          data: {
            items: qtechGames,
          },
        };
        return resultResponse(SUCCESS, response);
      } else {
        return resultResponse(NOT_FOUND, "Game list is empty");
      }
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

module.exports = { qtechGamesList }