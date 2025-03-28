// const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcrypt');
const { ObjectId } = require("bson")
  , TelegramSubscribers = require('../../models/telegramSubscribers')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, TELEGRAM_SENT_MESSAGE_URL, TELEGRAM_SET_WEBHOOK_URL, USER_TYPE_USER, VALIDATION_ERROR, VALIDATION_FAILED, USER_TYPE_SUPER_ADMIN, OTP_PURPOSE } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction')
  , User = require('../../models/user')
  , { SUPER, MANAGER, OPERATOR, REGISTRATION_KEY, ACCEPT_DEPOSIT_KEY, ACCEPT_WITHDRAW_KEY, REJECT_DEPOSIT_KEY } = require("../../utils/b2cConstants").TELEGRAM_BOT
  , axios = require('axios')
  , walletService = require('../service/walletService')
  , { ADMIN_PORT_1 } = require('../../config')
// const token = TELEGRAM_TOKEN && TELEGRAM_TOKEN != "" ? TELEGRAM_TOKEN : '';
// , bot = new TelegramBot(token, { polling: false });
const utils = require('../../utils');
const { telegramGenerateCodeMsg } = require('../../utils/systemMessages');
const {
  TELEGRAM_WEBHOOK_URL,
  TELEGRAM_OTP_EXPIRE_TIME_SECOENDS,
  TELEGRAM_BOT_ID,
} = require("../../environmentConfig");
const saltRounds = 10;

function subscribeUnsubscribe(params) {
  return TelegramSubscribers.findOneAndUpdate(
    { chat_id: params.chat_id },
    params,
    { upsert: true, new: true, runValidators: true },
  ).lean().select("-_id chat_id")
    .then(telegram => {
      if (telegram)
        return resultResponse(SUCCESS, telegram);
      return resultResponse(NOT_FOUND, "Data not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function telegramSubscribe(msg) {
  try {
    let data;
    if (msg.text.toLowerCase() == "result subscribe") {
      data = {
        chat_id: msg.chat.id,
        telegram: {
          from: msg.from,
          chat: msg.chat
        },
        is_subscribed: 1,
        msg: `Hello ${msg.from.first_name}! You have successfully subscribed for result updates.\nFor opt out please type "Result Unsubscribe"`
      }
    }
    if (msg.text.toLowerCase() == "result unsubscribe") {
      data = {
        chat_id: msg.chat.id,
        is_subscribed: 0,
        msg: `You have unsubscribed for result updates.\nSubscribe again? please type "Result Subscribe"`
      }
    }
    if (data) {
      return subscribeUnsubscribe(data).then(result => {
        if (result.statusCode == SUCCESS)
          return { chat_id: result.data.chat_id, msg: data.msg };
      })
    }
  } catch (error) {
    console.error(error);
  }
}

function getActiveSubscribers() {
  return TelegramSubscribers.find({ is_subscribed: true }).select("-_id chat_id").lean()
    .then(data => resultResponse(data.length ? SUCCESS : NOT_FOUND, data)).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function sendMessage(bot, message) {
  getActiveSubscribers().then(subscribers => {
    subscribers.data.map(({ chat_id }) => bot.sendMessage(chat_id, message));
  }).catch(console.error);
}

function sendHtmlMessage(bot, message) {
  getActiveSubscribers().then(subscribers => {
    subscribers.data.map(({ chat_id }) => bot.sendMessage(chat_id, message, { parse_mode: 'html' }));
  }).catch(console.error);
}

let getInfoByUserId = async (user_id) => {
  return TelegramSubscribers.findOne({ user_id: user_id }, { user_id: 1, chat_id: 1, user_type_id: 1 })
    .then(botInfo => {
      return resultResponse(SUCCESS, botInfo);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

function telegramUserRegistration(bot, chat_id, user_msg) {
  if (user_msg[0] === SUPER) {
    bot.sendMessage(chat_id, `We cordially invite you to commence the registration process as an super.\n\nFor security purposes and in adherence to best practices, please provide your username and password following the specified format outlined below:-\n\n<${REGISTRATION_KEY}><SPACE><USERNAME><SPACE><PASSWORD>\n\nEx:-\n${REGISTRATION_KEY} your_username your_password`);
  } else if (user_msg[0] === MANAGER) {
    bot.sendMessage(chat_id, `We cordially invite you to commence the registration process as an manager.\n\nFor security purposes and in adherence to best practices, please provide your username and password following the specified format outlined below:-\n\n<${REGISTRATION_KEY}><SPACE><USERNAME><SPACE><PASSWORD>\n\nEx:-\n${REGISTRATION_KEY} your_username your_password`);
  } else if (user_msg[0] === OPERATOR) {
    bot.sendMessage(chat_id, `We cordially invite you to commence the registration process as an operator.\n\nFor security purposes and in adherence to best practices, please provide your username and password following the specified format outlined below:-\n\n<${REGISTRATION_KEY}><SPACE><USERNAME><SPACE><PASSWORD>\n\nEx:-\n${REGISTRATION_KEY} your_username your_password`);
  } else if (user_msg[0] === REGISTRATION_KEY && user_msg.length === 3) {

    User.findOne({ user_name: user_msg[1] })
      .select(`_id user_type_id belongs_to`)
      .then(async user => {
        if (!user) {
          bot.sendMessage(chat_id, "Invalid credentials! Please try again.");
          return;
        }
        TelegramSubscribers.findOne({ chat_id: chat_id, user_id: user._id }).select("_id chat_id user_id").then(telegramInfo => {
          if (telegramInfo) {
            bot.sendMessage(chat_id, "You have already subscribed to manage the B2C activities.");
            return;
          }
          let data = {
            'user_name': user_msg[1],
            'password': user_msg[2],
            'grant_type': 'password'
          };
          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `http://127.0.0.1:${ADMIN_PORT_1}/api/v1/user/adminLogin`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic YXBwbGljYXRpb246c2VjcmV0'
            },
            data: data
          };
          axios.request(config)
            .then((response) => {
              if (!response.data.status) {
                bot.sendMessage(chat_id, response.data.msg);
                return;
              }
              if (user.belongs_to !== "B2C_MANAGER") {
                bot.sendMessage(chat_id, "Your account is not associated with the any B2C account type.");
                return;
              }
              TelegramSubscribers.findOneAndUpdate(
                { chat_id: chat_id },
                { user_id: user._id, user_type_id: user.user_type_id },
                { upsert: true, new: true, runValidators: true },
              ).lean().select("_id chat_id user_id user_type_id").then(telegram => {
                if (telegram) {
                  if (telegram.user_type_id === 4) bot.sendMessage(chat_id, "You have successfully subscribed as a super to manage B2C transactions.");
                  if (telegram.user_type_id === 15) bot.sendMessage(chat_id, "You have successfully subscribed as a manager to manage B2C transactions.");
                  if (telegram.user_type_id === 14) bot.sendMessage(chat_id, "You have successfully subscribed as a operator to manage B2C transactions.");
                }
              }).catch(error => console.log(error));
            }).catch(error => console.log(error));
        }).catch(error => console.log(error));
      }).catch(error => console.log(error));
  } else if (user_msg[0] === ACCEPT_DEPOSIT_KEY && user_msg.length === 3) {
    TelegramSubscribers.findOne({ chat_id: chat_id }).select("_id chat_id user_id").then(telegramInfo => {
      if (telegramInfo) {
        User.findOne({ _id: telegramInfo.user_id }).select(`_id user_name`)
          .then(async user => {
            if (user) {
              let dataObj = {
                statement_id: user_msg[1],
                reference_no: user_msg[2],
                user_id: String(telegramInfo.user_id),
                parent_id: "",
                crdr: 1,
                req: {
                  body: {}
                },
                res: {}
              };
              let resData = await walletService.depositAccepetedRequest(dataObj, user);
              bot.sendMessage(chat_id, resData.data);
            }
          }).catch(error => console.log(error));
      }
    }).catch(error => console.log(error));
  } else if (user_msg[0] === ACCEPT_WITHDRAW_KEY && user_msg.length === 3) {
    TelegramSubscribers.findOne({ chat_id: chat_id }).select("_id chat_id user_id").then(telegramInfo => {
      if (telegramInfo) {
        User.findOne({ _id: telegramInfo.user_id }).select(`_id user_name`)
          .then(async user => {
            if (user) {
              let dataObj = {
                statement_id: user_msg[1],
                user_id: String(telegramInfo.user_id),
                remark: user_msg[2],
                file: { filename: "" },
              };
              let resData = await walletService.withdrawacceptedRequest(dataObj, user);
              if (resData.statusCode === SERVER_ERROR) bot.sendMessage(chat_id, resData.data);
              else if (resData.statusCode === SUCCESS) bot.sendMessage(chat_id, "Withdraw Request Successfully...");
            }
          }).catch(error => console.log(error));
      }
    }).catch(error => console.log(error));
  } else if (user_msg[0] === REJECT_DEPOSIT_KEY && user_msg.length === 3) {
    TelegramSubscribers.findOne({ chat_id: chat_id }).select("_id chat_id user_id").then(telegramInfo => {
      if (telegramInfo) {
        User.findOne({ _id: telegramInfo.user_id }).select(`_id user_name`)
          .then(async user => {
            if (user) {
              let dataObj = {
                statement_id: user_msg[1],
                user_id: String(telegramInfo.user_id),
                remark: user_msg[2],
              };
              let resData = await walletService.depositrejectedRequest(dataObj, user);
              if (resData.statusCode === SERVER_ERROR) bot.sendMessage(chat_id, resData.data);
              else if (resData.statusCode === SUCCESS) bot.sendMessage(chat_id, "Deposit Request Rejected....");
            }
          }).catch(error => console.log(error));
      }
    }).catch(error => console.log(error));
  }
}

async function telegramVerifyConnectionId(connectionId) {
  try {
    return await User.findOne({ otp: connectionId })
      .select(`_id is_telegram_enable otp telegram_chat_id is_auth_app_enabled`);
  } catch (error) {
    return error;
  }
}

async function telegram2FaEnableUpdateStatus(userData, chatId) {
  try {
    return await User.updateOne({ _id: userData._id }, { $set: { telegram_chat_id: chatId, otp: "", is_telegram_enable: 1, is_secure_auth_enabled: 1 } });
  } catch (error) {
    return error;
  }
}

async function telegramOtpUpdate(payload) {
  try {
    let { user_id, otp, telegram_chat_id } = payload;
    let expire_time = new Date(new Date().getTime() + (TELEGRAM_OTP_EXPIRE_TIME_SECOENDS / 60) * 60000);
    await sendMessageToTelegram({ chat_id: telegram_chat_id, text: `*Login Code: ${otp}* . Do *not* give this code to anyone, even if they say they are from Telegram! Its valid for ${TELEGRAM_OTP_EXPIRE_TIME_SECOENDS} sec.` });
    let salt = bcrypt.genSaltSync(saltRounds);
    otp = bcrypt.hashSync(otp, salt);
    return await User.updateOne({ _id: user_id }, {
      $set: {
        otp,
        expire_time,
        otp_purpose: OTP_PURPOSE.TELEGRAM
      }
    });
  } catch (error) {
    return error;
  }
}

/**
* this method useing for send message to telegram bot
* @body {chat_id,text} req 
* @body {*} res 
* @returns 
*/
async function sendMessageToTelegram(payload) {
  try {
    const { chat_id, text } = payload
    const encodedParams = new URLSearchParams();
    encodedParams.set('chat_id', chat_id);
    encodedParams.set('text', text);
    encodedParams.set('parse_mode', 'Markdown');
    encodedParams.set('entities', '');
    encodedParams.set('disable_web_page_preview', '');
    encodedParams.set('disable_notification', '');
    encodedParams.set('reply_to_message_id', '');
    encodedParams.set('allow_sending_without_reply', '');
    encodedParams.set('reply_markup', '');
    const options = {
      method: 'POST',
      url: TELEGRAM_SENT_MESSAGE_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      data: encodedParams,
    };
    await axios.request(options).then((response) => {
    }).catch((err) => {
      return err;
    })
  } catch (err) {
    return err;
  }
}

/**
* set webhook url
* @body {*} req 
* @body {*} res 
* @returns 
*/
async function setWebhookURL() {
  try {
    return await axios({
      method: 'get',
      url: `${TELEGRAM_SET_WEBHOOK_URL}${TELEGRAM_WEBHOOK_URL}&drop_pending_updates=true`,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    return error;
  }
}

/**
* remove webhook url
* @body {*} req 
* @body {*} res 
* @returns 
*/
async function removeWebhookUrl() {
  try {
    return await axios({
      method: 'get',
      url: TELEGRAM_SET_WEBHOOK_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    return error;
  }
}

async function createTelegramConnectionId(req) {
  try {
    const connectionIdLength = 8; // Length of the generated connection ID
    const { user_id, password, isUser } = req.joiData; // Extract user ID and password from request data

    // Fetch the user from the database by ID, selecting only required fields
    let user = await User.findOne({ _id: ObjectId(user_id) })
      .select("password is_telegram_enable user_type_id")
      .lean()
      .exec();

    // Check if user exists
    if (!user) {
      return resultResponse(NOT_FOUND, { msg: "User not found!" });
    }
    if (isUser && user.user_type_id != USER_TYPE_USER) {
      return resultResponse(VALIDATION_ERROR, { msg: "You are not allowed to access the resource!" });
    } else if (!isUser && user.user_type_id == USER_TYPE_USER) {
      return resultResponse(VALIDATION_ERROR, { msg: "You are not allowed to access the resource!" });
    }
    // Check if Telegram 2FA is already enabled
    if (
      user.is_telegram_enable !== undefined &&
      user.is_telegram_enable === 1
    ) {
      return resultResponse(NOT_FOUND, {
        msg: "Telegram 2FA already enabled on the account!",
      });
    }

    // Verify the provided password matches the stored password
    if (!bcrypt.compareSync(password, user.password)) {
      return resultResponse(NOT_FOUND, { msg: "Password did not match!" });
    }

    // Generate a new connection ID and ensure it is in uppercase
    let connectionId = utils
      .generateReferCode(connectionIdLength)
      .toUpperCase();

    // Update the user's OTP with the newly generated connection ID
    await User.updateOne(
      { _id: ObjectId(user._id) },
      { $set: { otp: connectionId } },
    );

    // Prepare and return the success response
    return resultResponse(SUCCESS, {
      bot: TELEGRAM_BOT_ID,
      connection_id: connectionId,
      message: telegramGenerateCodeMsg({
        TELEGRAM_BOT_ID,
        TELEGRAM_OTP_EXPIRE_TIME_SECOENDS,
        connectionId,
      }),
      msg: "Connection ID updated.",
    });
  } catch (error) {
    // Handle and return server errors
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function enableTelegramByParent(request) {
  const { user_id, is_enable_telegram_default } = request.body;
  if (user_id == request.User._id) {
    return resultResponse(VALIDATION_FAILED, { msg: "You are not permitted to do this action!" })
  }
  if (request.User.user_type_id != USER_TYPE_SUPER_ADMIN && request.User._id != request.user.parent_id) {
    return resultResponse(VALIDATION_FAILED, { msg: "You are not permitted to do this action!" })
  }
  const userDetails = await User.findOne({ _id: ObjectId(user_id) }, { _id: 1 }).lean();
  if (!userDetails)
    return resultResponse(VALIDATION_FAILED, "The user ID you provided does not exits.")
  return User.updateOne({ "_id": ObjectId(user_id) }, { "$set": { is_enable_telegram_default } })
    .then(() => resultResponse(SUCCESS, `Telegram authentication ${is_enable_telegram_default == 1 ? 'enabled' : 'disabled'} successfully updated.`))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

module.exports = {
  subscribeUnsubscribe,
  telegramSubscribe,
  getActiveSubscribers,
  sendMessage,
  sendHtmlMessage,
  telegramUserRegistration,
  getInfoByUserId,
  telegramVerifyConnectionId,
  telegram2FaEnableUpdateStatus,
  telegramOtpUpdate,
  sendMessageToTelegram,
  setWebhookURL,
  removeWebhookUrl,
  createTelegramConnectionId,
  enableTelegramByParent
};