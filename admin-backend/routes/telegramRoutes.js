const express = require('express');
const TelegramController = require('../controllers/telegramController');
const telegramValidator = require('../validator/telegramValidator');
const { enableTelegramLimiter } = require("../../utils");
const userActivityLogger = require('./middlewares/userActivityLogger');

//Routes for all user 
module.exports = () => {
  const telegramRoutes = express.Router();
  /** to generate token */
  telegramRoutes.post('/generateTelegramConnectionId', TelegramController.generateTelegramConnectionId);
  telegramRoutes.post(
    "/createTelegramConnectionId",
    enableTelegramLimiter,
    telegramValidator.createTelegramConnectionId,
    TelegramController.createTelegramConnectionId,
  );
  /** to get update from telegram this is webhook */
  telegramRoutes.post('/getUpdateFromTelegram', TelegramController.getUpdateFromTelegram);
  /** to set webhook url */
  telegramRoutes.post('/setWebhookUrl', TelegramController.setWebhookUrl);
  /** to remove webhook url */
  telegramRoutes.post('/removeWebhookUrl', TelegramController.removeWebhookUrl);
  /** Enable telegram auth */
  telegramRoutes.post(
    "/enableTelegramByParent",
    userActivityLogger,
    telegramValidator.enableTelegramByParent,
    TelegramController.enableTelegramByParent
  );
  return telegramRoutes;
};