const axios = require('axios')

// https://t.me/upwx_exchange_dev_bot
const BOT_TOKEN = "7042931884:AAGCC3DyBUsM6VZ1iE25Hvy8K1Fkpg1ofXQ";

const BOT_MESSAGE_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

const SERVER_IDENTIFIER = process.env.UNIQUE_IDENTIFIER_KEY;

const IS_ENABLE = process.env.ALERT_SERVICE_ENABLE == "true" ? true : false;

const RAHUL = '7072969060'
const UpworkResultAlert = '-1002465572181'

const ChatType = {
  Default: [RAHUL],
  ResultDeclare: [UpworkResultAlert],
}

function sendMessageAlertToTelegram(params) {

  if (!IS_ENABLE) {
    return;
  }

  try {

    const { message } = params;
    let {chatType} = params
    
    if (!chatType) {
      chatType = 'Default'
    }

    if (!Object.keys(ChatType).includes(chatType)) {
      throw new Error("Invalid ChatType Provided to sendMessageAlertToTelegram ChatType: " + chatType);
    }

    ChatType[chatType].forEach(chat_id => {

      const options = {
        method: 'POST',
        url: BOT_MESSAGE_URL,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        data: {
          'chat_id': chat_id,
          'text': `SERVER: ${SERVER_IDENTIFIER}\n${message}`
        },
      };

      axios.request(options).then().catch(console.error);

    });

  } catch (error) {
    console.error(error);
  }
}

module.exports = {
  sendMessageAlertToTelegram
};