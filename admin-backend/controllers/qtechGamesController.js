const { SUCCESS } = require('../../utils/constants');
const path = require('path')
const { ResError, ResSuccess } = require('../../lib/expressResponder');
const QtechGames = require('../../models/qtechGames');
const qtechGamesService = require('../service/qtechGamesService');
const UPLOAD_PATH = path.normalize(path.resolve(__dirname, "../../uploads"));
const { removeStaticContent } = require('../../utils');
const { STATUS_500 } = require('../../utils/httpStatusCode')

module.exports = {
  createQtechGame: function (req, res) {
    const { id } = req.body;
    return QtechGames.findOne({ id: req.body.id })
      .select("id")
      .then(qtechGame => {
        if (qtechGame) {
          const result = ResError(res, { msg: "Game already added!" });
          return result;
        }
        const result = QtechGames.create(req.body)
          .then(createdGame => {
            if (createdGame) {
              const result = ResSuccess(res, { msg: "Game Added successfully." });
              return result;
            } else {
              const result = ResError(res, { msg: "Game not added." });
              return result;
            }
          })
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
        return result;
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  qtechGamesList: function (req, res) {
    return qtechGamesService.qtechGamesList(req)
      .then(response => {
        let result;
        if (response.statusCode === SUCCESS) {
          result = ResSuccess(res, { ...response.data });
        } else {
          result = ResError(res, { msg: response.data });
        }
        return result;
      })
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  updateQtechGame: function (req, res) {
    const { id } = req.body;
    delete req.body.id;
    return QtechGames.findOneAndUpdate({ id }, req.body)
      .then(result => {
        if (result) {
          return ResSuccess(res, { msg: "Game updated successfully." });
        } else {
          return ResError(res, { msg: "Game status not updated or game not found." });
        }
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  deleteQtechGame: function (req, res) {
    const { id } = req.body;
    return QtechGames.findOneAndDelete({ id })
      .then(result => {
        if (result) {
          return ResSuccess(res, { msg: "Game deleted successfully." });
        } else {
          return ResError(res, { msg: "Game not found." });
        }
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  getQtechGame: function (req, res) {
    const { id } = req.body;
    return QtechGames.findOne({ id }, { _id: 0, name: 1, slug: 1, provider: 1, category: 1, images: 1, image_url: 1 })
      .then(result => {
        if (result) {
          return ResSuccess(res, { data: result, msg: "Game info." });
        } else {
          return ResError(res, { msg: "Game not found." });
        }
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  validateContentFile: function (req, res, next) {
    if (!req.file) {
      throw new Error("Image file not found!");
    }
    req.body.image_url = "qtech_game/" + req.file.filename;
    next();
  },
  uploadQtechGameImage: async function (req, res) {
    const { id } = req.body;
    const qtechGames = await QtechGames.findOne({ id }, { image_url: 1 });
    delete req.body.id;
    return QtechGames.findOneAndUpdate({ id }, req.body)
      .then(result => {
        if (result) {
          if (qtechGames) {
            qtechGames.image_url = UPLOAD_PATH + "/" + qtechGames.image_url;
            removeStaticContent(qtechGames.image_url);
          }
          return ResSuccess(res, { msg: "Game image updated successfully." });
        } else {
          return ResError(res, { msg: "Game status not updated or game not found." });
        }
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

}