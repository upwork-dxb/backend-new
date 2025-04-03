const CONSTANTS = {
  PROVIDERS: {
    QTECH: "QTech"
  },

  TRANSACTION_TYPES: {
    CREDIT: "CREDIT",
    DEBIT: "DEBIT"
  },

  DEFAULT_CURRENCY: "INR",

  GAME_TYPES: [
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
    "LOTTERY"
  ],

  ERRORS: {
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
    QT_RESULT_RETRY: "QT_RESULT_RETRY"
  },

  STATUS_CODES: {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    UNPROCESSABLE: 422,
    SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  },

  MISC: {
    QT_USER_ID_DELIMITER: "__"
  }
};

module.exports = CONSTANTS;
