const express = require("express"),
  WhatsappController = require("../../admin-backend/controllers/whatsappController"),
  whatsappValidator = require("../../admin-backend/validator/whatsappValidator"),
  { resetPasswolimiter } = require("../../utils");

//Routes for all user
module.exports = () => {
  const whatsappRoute = express.Router();
  /** to send otp */
  whatsappRoute.post("/send-code", WhatsappController.sendCode);
  /** to get update from telegram */
  whatsappRoute.post("/re-send", WhatsappController.reSendCode);
  /** to get update from whatsapp */
  whatsappRoute.post("/verify", WhatsappController.verifyCode);
  /** to get country code */
  whatsappRoute.get("/getCountryCode", WhatsappController.getCountryCode);
  /* Reset password vai what's app otp  */
  whatsappRoute.post(
    "/resetPassword",
    resetPasswolimiter,
    whatsappValidator.resetPassword,
    WhatsappController.resetPassword
  );
  whatsappRoute.post(
    "/verifyResetPasswordOtp",
    whatsappValidator.verifyResetPasswordOtp,
    WhatsappController.verifyResetPasswordOtp
  );
  whatsappRoute.post(
    "/resendResetPasswordOtp",
    whatsappValidator.resendResetPasswordOtp,
    WhatsappController.resendResetPasswordOtp
  );
  whatsappRoute.post(
    "/setPassword",
    whatsappValidator.setPassword,
    WhatsappController.setPassword
  );

  return whatsappRoute;
};
