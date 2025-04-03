// Fixes a polling issue on some node-telegram-bot-api versions
process.env.NTBA_FIX_319 = 1;

const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_TOKEN } = require('./constants');
const {
  telegramSubscribe,
  telegramUserRegistration
} = require('../admin-backend/service/telegramService');
const b2cConstants = require('../utils/b2cConstants');

// Validate token before starting bot
if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN.trim() === '') {
  console.error('❌ Telegram Bot Token is missing or invalid. Exiting...');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Handle incoming messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text?.trim() || '';

  if (messageText.toLowerCase() === '/start') {
    return bot.sendMessage(chatId, `👋 Welcome to Beatific Exchange!\nTo get live updates, type "Result Subscribe"`);
  }

  // Handle subscription requests
  if (['result subscribe', 'result unsubscribe'].includes(messageText.toLowerCase())) {
    try {
      const data = await telegramSubscribe(msg);
      if (data) bot.sendMessage(data.chat_id, data.msg);
    } catch (error) {
      console.error('❌ Subscription Error:', error);
      bot.sendMessage(chatId, 'An error occurred while processing your request.');
    }
    return;
  }

  // Handle custom commands (e.g., register)
  const userCommand = messageText.split(' ')[0];
  const validCommands = Object.values(b2cConstants.TELEGRAM_BOT);

  if (validCommands.includes(userCommand)) {
    telegramUserRegistration(bot, chatId, messageText.split(' '));
  }
});

// Export bot instance (optional for external use/testing)
module.exports = { bot };
