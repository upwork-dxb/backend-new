const express = require('express');
const TelegramController = require('../../admin-backend/controllers/telegramController');
const UserTelegramController = require('../controllers/telegramController');
const telegramValidator = require('../../admin-backend/validator/telegramValidator');
const { enableTelegramLimiter } = require("../../utils");

//Routes for all user 
module.exports = () => {
  const telegramRoutes = express.Router();
  // new TelegramController(socket);
  /** to generate token */
  telegramRoutes.post('/generateTelegramConnectionId', TelegramController.generateTelegramConnectionId);
  telegramRoutes.post(
    "/createTelegramConnectionId",
    enableTelegramLimiter,
    telegramValidator.createTelegramConnectionId,
    UserTelegramController.createTelegramConnectionId,
  );
  /** to get update from telegram */
  telegramRoutes.post('/getUpdateFromTelegram', TelegramController.getUpdateFromTelegram);

  return telegramRoutes;
};