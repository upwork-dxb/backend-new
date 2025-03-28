const express = require("express");
const AuthAppController = require("../controllers/authAppController");
const AuthAppValidator = require("../validator/authAppValidator");

//Routes for sports
module.exports = () => {
  const AuthAppRoutes = express.Router();

  // Routes to be Used in Android Application
  AuthAppRoutes.post(
    "/open/addAccount",
    AuthAppValidator.addAccount,
    AuthAppController.addAccount
  );
  AuthAppRoutes.post(
    "/open/verifyOTP",
    AuthAppValidator.verifyOTP,
    AuthAppController.verifyOTP
  );
  AuthAppRoutes.post("/open/getAppId", AuthAppController.getAppId);
  AuthAppRoutes.post("/open/getOTP", AuthAppController.getOTP);
  AuthAppRoutes.post("/open/removeAccount", AuthAppController.removeAccount);


  // Routes to be Used in Website/Admin Panels
  AuthAppRoutes.post("/getOtpToEnableApp", AuthAppController.getOtpToEnableApp);
  AuthAppRoutes.post(
    "/disableAuthApp",
    AuthAppValidator.disableAuthApp,
    AuthAppController.disableAuthApp
  );
  AuthAppRoutes.post(
    "/adminRemoveAuthApp",
    AuthAppValidator.adminRemoveAuthApp,
    AuthAppController.adminRemoveAuthApp
  );
  AuthAppRoutes.post(
    "/getSecureAuthStatus",
    AuthAppController.getSecureAuthStatus
  );

  return AuthAppRoutes;
};
