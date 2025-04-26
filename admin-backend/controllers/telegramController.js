const bcrypt = require('bcrypt');
const Joi = require('joi');
const User = require('../../models/user');
const OAuthToken = require('../../models/oAuthToken');
const utils = require('../../utils');
const Responder = require('../../lib/expressResponder');
const { ResSuccess, ResError } = require('../../lib/expressResponder');
const { STATUS_500, STATUS_200, STATUS_422 } = require('../../utils/httpStatusCode');
const { TELEGRAM_BOT_ID, TELEGRAM_OTP_EXPIRE_TIME_SECOENDS } = require('../../environmentConfig');
const { telegramGenerateCodeMsg, telegramStartMsg } = require('../../utils/systemMessages');
const {
  sendMessageToTelegram,
  telegramVerifyConnectionId,
  telegram2FaEnableUpdateStatus,
  setWebhookURL,
  removeWebhookUrl,
  createTelegramConnectionId,
  enableTelegramByParent,
} = require("../service/telegramService");
const { SUCCESS } = require("../../utils/constants");
const { updateLogStatus } = require('../service/userActivityLog');
const { LOG_SUCCESS, LOG_VALIDATION_FAILED } = require('../../config/constant/userActivityLogConfig');

const connectionIdLength = 8;

module.exports = class TelegramController {

  static async generateTelegramConnectionId(req, res) {
    try {
      const { password } = await Joi.object({
        password: Joi.string().min(6).max(12).required(),
      }).validateAsync(req.body, { abortEarly: false });

      const user = await User.findById(req.User.id).select('password is_telegram_enable');

      if (!user) {
        return ResError(res, { msg: "User not found!", statusCode: STATUS_200 });
      }

      if (user.is_telegram_enable === 1) {
        return ResError(res, { msg: "Telegram 2FA already enabled on the account!", statusCode: STATUS_422 });
      }

      if (!bcrypt.compareSync(password, req.User.password)) {
        return ResError(res, { msg: "Password did not match!", statusCode: STATUS_422 });
      }

      const connectionId = utils.generateReferCode(connectionIdLength).toUpperCase();

      await User.findByIdAndUpdate(req.User.id, { $set: { otp: connectionId } }, { new: true });

      return Responder.success(res, {
        data: {
          bot: TELEGRAM_BOT_ID,
          connection_id: connectionId,
          message: telegramGenerateCodeMsg({ TELEGRAM_BOT_ID, TELEGRAM_OTP_EXPIRE_TIME_SECOENDS, connectionId }),
        },
        msg: "Connection ID updated.",
      });

    } catch (error) {
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

  static async createTelegramConnectionId(req, res) {
    try {
      const result = await createTelegramConnectionId(req, res);
      return result.statusCode === SUCCESS
        ? ResSuccess(res, result.data)
        : ResError(res, result.data);
    } catch (error) {
      return ResError(res, error);
    }
  }

  static async getUpdateFromTelegram(req, res) {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'object' || Object.keys(message).length === 0) {
        return res.status(200).json({ ok: true, result: true });
      }

      const { text, chat } = message;
      if (!text || !chat?.id) {
        return res.status(200).json({ ok: true, result: true });
      }

      if (text === '/start') {
        await sendMessageToTelegram({ chat_id: chat.id, text: telegramStartMsg() });
      } else if (text.toLowerCase().startsWith('/connect')) {
        const action = text.split(' ');
        if (action.length === 2) {
          const connectionId = action[1];
          const userData = await telegramVerifyConnectionId(connectionId);

          if (!userData) {
            await sendMessageToTelegram({ chat_id: chat.id, text: 'Invalid connection ID. Please try again.' });
          } else if (userData.is_telegram_enable === 1) {
            await sendMessageToTelegram({ chat_id: chat.id, text: "Telegram 2FA already enabled on the account!" });
          } else if (userData.is_auth_app_enabled) {
            await sendMessageToTelegram({ chat_id: chat.id, text: "App 2FA already enabled on the account!" });
          } else {
            await telegram2FaEnableUpdateStatus(userData, chat.id);
            const userId = userData._id;

            await OAuthToken.deleteMany({ 'user.user_id': userId.toString() });
            await User.updateOne({ _id: userId }, { $unset: { sessionid: 1 }, is_online: 0 });

            await sendMessageToTelegram({ chat_id: chat.id, text: '2-Step Verification enabled. You can now use this bot for login.' });
          }
        } else {
          await sendMessageToTelegram({ chat_id: chat.id, text: 'Please provide a valid connection ID.' });
        }
      }

      return res.status(200).json({ ok: true, result: true });

    } catch (error) {
      console.error("Telegram Webhook Error:", error);
      return res.status(200).json({ ok: true, result: true }); // Always return 200 to Telegram
    }
  }

  static async setWebhookUrl(req, res) {
    try {
      const response = await setWebhookURL();
      if (response.status === 200) {
        return Responder.success(res, { data: response.data, msg: response.data.description });
      }
      return Responder.error(res, { msg: response.data.description, statusCode: response.status });
    } catch (error) {
      return Responder.error(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

  static async removeWebhookUrl(req, res) {
    try {
      const response = await removeWebhookUrl();
      if (response.status === 200) {
        return Responder.success(res, { data: response.data, msg: response.data.description });
      }
      return Responder.error(res, { msg: response.data.description, statusCode: response.status });
    } catch (error) {
      return Responder.error(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

  static async enableTelegramByParent(req, res) {
    try {
      const result = await enableTelegramByParent(req, res);
      if (result.statusCode === SUCCESS) {
        updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data });
        return ResSuccess(res, result.data);
      } else {
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: result.data });
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

};
