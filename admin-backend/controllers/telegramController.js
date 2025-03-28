const { STATUS_500, STATUS_200, STATUS_422 } = require('../../utils/httpStatusCode');

const bcrypt = require('bcrypt')
  , Joi = require('joi')
  , Responder = require('../../lib/expressResponder')
  , User = require('../../models/user')
  , OAuthToken = require('../../models/oAuthToken')
  , utils = require('../../utils')
  , { ResSuccess, ResError } = require('../../lib/expressResponder')
  , { TELEGRAM_BOT_ID, TELEGRAM_OTP_EXPIRE_TIME_SECOENDS } = require('../../environmentConfig')
  , { telegramGenerateCodeMsg, telegramStartMsg } = require('../../utils/systemMessages')
  , connectionIdLength = 8;
const {
  sendMessageToTelegram,
  telegramVerifyConnectionId,
  telegram2FaEnableUpdateStatus,
  setWebhookURL,
  removeWebhookUrl,
} = require("../service/telegramService");
const telegramService = require("../service/telegramService");
const { SUCCESS } = require("../../utils/constants");
const { updateLogStatus } = require('../service/userActivityLog');
const { LOG_SUCCESS, LOG_VALIDATION_FAILED } = require('../../config/constant/userActivityLogConfig');

module.exports = class TelegramController {
  /**
   * generate telegram connection id
   * @body {password} req  
   * @body {*} res 
   * @returns 
   */
  static async generateTelegramConnectionId(req, res) {
    return Joi.object({
      password: Joi.string().min(6).max(12).required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ password }) => {
        return User.findOne({ _id: req.User.id })
          .select(`password is_telegram_enable`)
          .then(async user => {
            if (!user) {
              return ResError(res, { msg: "User not found!", statusCode: STATUS_200 });
            }
            if (user.is_telegram_enable != undefined && user.is_telegram_enable == 1) {
              return ResError(res, { msg: "Telegram 2FA already enabled on the account!", statusCode: STATUS_422 });
            }
            if (!bcrypt.compareSync(password, req.User.password)) {
              return ResError(res, { msg: "Password did not match!", statusCode: STATUS_422 });
            }
            let connectionId = utils.generateReferCode(connectionIdLength).toUpperCase();
            User.findOneAndUpdate({ _id: req.User.id }, { $set: { otp: connectionId } }, { new: true })
              .then((updateConnection) => {
                return Responder.success(res, {
                  data: {
                    bot: TELEGRAM_BOT_ID, connection_id: connectionId,
                    message: telegramGenerateCodeMsg({ TELEGRAM_BOT_ID, TELEGRAM_OTP_EXPIRE_TIME_SECOENDS, connectionId })
                  }, msg: "Connection id updated."
                })
              }).catch((err) => Responder.error(res, { msg: err.message, statusCode: STATUS_500 }))
          });
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static async createTelegramConnectionId(req, res) {
    return telegramService
      .createTelegramConnectionId(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, result.data),
      )
      .catch((error) => ResError(res, error));
  }

  /**
   * Get message update from telegram this is webhook using for verify telegram connection id and update telegram status
   * @body {message} req 
   * @body {*} res 
   * @returns 
   */
  static async getUpdateFromTelegram(req, res) {
    if (Object.keys(req?.body?.message || {}).length === 0 && req.body.constructor === Object)
      return res.status(200).json({ "ok": true, "result": true });
    let { text, chat } = req.body.message;
    if (text == '/start') {
      await sendMessageToTelegram({ chat_id: chat.id, text: telegramStartMsg() })
    } else if (text == '/connect') {
      await sendMessageToTelegram({ chat_id: chat.id, text: 'You have to enter valid connection id.' })
    }
    /** to verify connection id */
    const action = text.split(" ");
    if (action.constructor == Array && action.length == 2 && action[0].toLowerCase() === '/connect') {
      await telegramVerifyConnectionId(action[1]).then(async (userData) => {
        if (!userData) {
          await sendMessageToTelegram({ chat_id: chat.id, text: 'You have to enter valid connection id.' })
        } else {
          if (userData.is_telegram_enable != undefined && userData.is_telegram_enable == 1)
            return await sendMessageToTelegram({ chat_id: chat.id, text: "Telegram 2FA already enabled on the account!" })
          
          if (userData.is_auth_app_enabled)
            return await sendMessageToTelegram({ chat_id: chat.id, text: "App 2FA already enabled on the account!" })
          
          await telegram2FaEnableUpdateStatus(userData, chat.id).then(async (update) => {
            let user_id = userData._id;
            await OAuthToken.deleteMany({ 'user.user_id': user_id.toString() })
              .then(() => {
                User.updateOne({ _id: user_id }, { "$unset": { sessionid: 1 }, is_online: 0 }).then().catch(console.error);
              });
            await sendMessageToTelegram({ chat_id: chat.id, text: '2-Step Verification is enabled, Now you can use this bot to login into your account.' })
          })
        }
      });
    }
    return res.status(200).json({ "ok": true, "result": true });
  }

  /**
   * set webhook url to telegram for get telegram bot messages
   * @body {*} req 
   * @body {*} res 
   * @returns 
   */
  static async setWebhookUrl(req, res) {
    await setWebhookURL()
      .then((response) => {
        if (response.status == 200) {
          return Responder.success(res, {
            data: response.data, msg: response.data.description
          })
        } else {
          Responder.error(res, response)
        }
      }).catch((err) => {
        Responder.error(res, { msg: err.message, statusCode: STATUS_500 })
      })
  }

  /**
* remove webhook url on telegram
* @body {*} req 
* @body {*} res 
* @returns 
*/
  static async removeWebhookUrl(req, res) {
    await removeWebhookUrl()
      .then((response) => {
        if (response.status == 200) {
          return Responder.success(res, {
            data: response.data, msg: response.data.description
          })
        } else {
          Responder.error(res, response)
        }
      }).catch((err) => {
        Responder.error(res, { msg: err.message, statusCode: STATUS_500 })
      })
  }
  /**
* Enable telegram auth
* @body {*} req 
* @body {*} res 
* @returns 
*/
  static async enableTelegramByParent(req, res) {
    return telegramService
      .enableTelegramByParent(req, res)
      .then((result) => {
        if (result.statusCode === SUCCESS) {
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data });
          return ResSuccess(res, result.data);
        } else {
          // Update activity log status.
          updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: result.data });
          return ResError(res, result.data);
        }
      })
      .catch((error) => {
        return ResError(res, error);
      });
  }

}