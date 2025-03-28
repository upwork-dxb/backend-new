process.env.NTBA_FIX_319 = 1;
const TelegramBot = require('node-telegram-bot-api')
  , { TELEGRAM_TOKEN } = require('./constants')
  , token = TELEGRAM_TOKEN && TELEGRAM_TOKEN != "" ? TELEGRAM_TOKEN : ''
  , bot = new TelegramBot(token, { polling: true })
  , { telegramSubscribe, telegramUserRegistration } = require("../admin-backend/service/telegramService")
  , b2cConstants = require("../utils/b2cConstants")

bot.on('message', async (msg) => {
  if (msg.text == '/start')
    bot.sendMessage(msg.chat.id, "Welcome To Beatific Exchange! To get our latest result updates type 'Result Subscribe'");
  if (["result subscribe", "result unsubscribe",].includes(msg.text.toLowerCase())) {
    try {
      let data = await telegramSubscribe(msg);
      if (data)
        bot.sendMessage(data.chat_id, data.msg);
    } catch (error) {
      console.error(error);
    }
  }
  let user_msg = (msg.text).split(" ");
  let bot_events = Object.values(b2cConstants.TELEGRAM_BOT);
  if (bot_events.includes(user_msg[0]))
    telegramUserRegistration(bot, msg.chat.id, user_msg);
});

exports.bot = bot;