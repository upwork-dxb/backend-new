const express = require("express");
const AuthAppControllerAdmin = require("../../admin-backend/controllers/authAppController");
const AuthAppValidatorAdmin = require("../../admin-backend/validator/authAppValidator");

//Routes for sports
module.exports = () => {
  const AuthAppRoutes = express.Router();

  AuthAppRoutes.post(
    "/getOtpToEnableApp",
    AuthAppControllerAdmin.getOtpToEnableApp
  );
  AuthAppRoutes.post(
    "/disableAuthApp",
    AuthAppValidatorAdmin.disableAuthApp,
    AuthAppControllerAdmin.disableAuthApp
  );
  AuthAppRoutes.post(
    "/getSecureAuthStatus",
    AuthAppControllerAdmin.getSecureAuthStatus
  );

  return AuthAppRoutes;
};
