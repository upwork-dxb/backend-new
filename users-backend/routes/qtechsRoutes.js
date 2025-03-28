const express = require("express"),
  qtechValidator = require("../validator/qtechValidator"),
  qtechController = require("../controllers/qtechController");

module.exports = () => {
  const qtechRoutes = express.Router();
  qtechRoutes.get(
    "/accounts/:playerId/session",
    qtechValidator.validateQTechUserFields,
    qtechValidator.verifySession,
    qtechController.verifySession,
  );
  qtechRoutes.get(
    "/accounts/:playerId/balance",
    qtechValidator.validateQTechUserFields,
    qtechValidator.verifyPassKey,
    qtechValidator.verifySession,
    qtechController.getBalance,
  );
  qtechRoutes.post(
    "/transactions/",
    qtechValidator.validateQTechUserFields,
    qtechValidator.checkDuplicateEntry,
    qtechValidator.convertAmount,
    qtechValidator.transactions,
    qtechController.transactions,
  );
  qtechRoutes.post(
    "/transactions/rollback",
    qtechValidator.validateQTechUserFields,
    qtechValidator.checkDuplicateEntry,
    qtechValidator.convertAmount,
    qtechValidator.rollback,
    qtechController.rollback,
  );
  qtechRoutes.post(
    "/bonus/rewards",
    qtechValidator.validateQTechUserFields,
    qtechValidator.verifyPassKey,
    qtechValidator.validateRewardFields,
    qtechValidator.checkDuplicateEntry,
    qtechValidator.convertAmount,
    qtechValidator.verifySession,
  );
  return qtechRoutes;
};
