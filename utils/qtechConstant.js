const QTECH = "QTech";
require("./constants").QTECH = QTECH;

module.exports = {
  QTECH,
  CREDIT: "CREDIT",
  DEBIT: "DEBIT",
  DEFAULT_CURRENCY: "INR",
  gameTypes: [
    "BINGO",
    "CASUALGAME",
    "ESPORTS",
    "INSTANTWIN",
    "LIVECASINO",
    "SCRATCHCARD",
    "SHOOTING",
    "SLOT",
    "SPORTS",
    "TABLEGAME",
    "VIDEOPOKER",
    "VIRTUAL_SPORTS",
    "LOTTERY",
  ],
  INVALID_TOKEN: "INVALID_TOKEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  QT_NOT_AVAILABLE: "QT_NOT_AVAILABLE",
  USER_BLOCKED: "USER_BLOCKED",
  LOGIN_FAILED: "LOGIN_FAILED",
  ACCOUNT_BLOCKED: "ACCOUNT_BLOCKED",
  REQUEST_DECLINED: "REQUEST_DECLINED",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  STATUS_400: 400,
  STATUS_401: 401,
  STATUS_403: 403,
  STATUS_404: 404,
  STATUS_422: 422,
  STATUS_500: 500,
  STATUS_503: 503,
  QT_RESULT_RETRY: "QT_RESULT_RETRY",
  QT_USER_ID_DELIMITER: "__",
};
