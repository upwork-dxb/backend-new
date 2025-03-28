const { ResSuccess, ResError } = require("../../lib/expressResponder");
const telegramService = require("../../admin-backend/service/telegramService");
const { SUCCESS } = require("../../utils/constants");

module.exports = class TelegramController {
  static async createTelegramConnectionId(req, res) {
    req.joiData.isUser = true;
    return telegramService
      .createTelegramConnectionId(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, result.data)
      )
      .catch((error) => ResError(res, error));
  }
};
