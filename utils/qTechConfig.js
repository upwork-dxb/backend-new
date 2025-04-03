const isDev = process.env.QTECH_ENV === "development";

// 🔗 Base URLs
const QTECH_BASE_URL = isDev
  ? "https://api-int.qtplatform.com"
  : "https://api.qtplatform.com";

const QTECH_ROUTE_PATH = "/api/qtech";

// 🔐 Credentials
const QTECH_USERNAME = isDev ? "api_runscasino" : "";
const QTECH_PASSWORD = isDev ? "beDasea4" : "";
const QTECH_PASSKEY = isDev
  ? "63b93fd67cd4b42b8de10495"
  : "649896c838ae5d7fd0f7f403";

// ✅ Whitelisted IPs
const QTECH_WHITELISTING_IP = isDev
  ? ["127.0.0.1", "3.1.243.244", "202.175.253.62"]
  : [
      "127.0.0.1",
      "52.77.32.26",
      "18.162.217.103",
      "18.184.243.189",
      "34.241.71.150",
      "34.243.156.16",
      "52.79.203.127",
      "52.76.231.168",
      "202.175.253.62"
    ];

// 🔧 API Versions & Paths
const API_VERSION = {
  v1: "/v1/",
  v2: "/v2/"
};

const PATHS = {
  TOKEN: "auth/token",
  LOBBY: "games/lobby-url",
  GAME_LIST: "games",
  LAUNCH: "games/{gameId}/launch-url",
  HISTORY: "players/{userId}/service-url",
  TRANSACTIONS: "transactions"
};

// 🛠️ Helper: Replace path params
const buildUrl = (template, values) =>
  Object.entries(values).reduce(
    (url, [key, val]) => url.replace(`{${key}}`, val),
    template
  );

// 📦 Exported Config
const QTECH_CONFIG = {
  QTECH_USERNAME,
  QTECH_PASSWORD,
  QTECH_PASSKEY,
  QTECH_BASE_URL,
  QTECH_ROUTE_PATH,
  QTECH_WHITELISTING_IP,

  API: {
    TOKEN: `${QTECH_BASE_URL}${API_VERSION.v1}${PATHS.TOKEN}`,
    LOBBY: `${QTECH_BASE_URL}${API_VERSION.v1}${PATHS.LOBBY}`,
    LAUNCH: (gameId) =>
      `${QTECH_BASE_URL}${API_VERSION.v1}${buildUrl(PATHS.LAUNCH, { gameId })}`,
    HISTORY: (userId) =>
      `${QTECH_BASE_URL}${API_VERSION.v1}${buildUrl(PATHS.HISTORY, { userId })}`,
    GAME_LIST: `${QTECH_BASE_URL}${API_VERSION.v2}${PATHS.GAME_LIST}`,
    TRANSACTIONS: `${QTECH_BASE_URL}/${PATHS.TRANSACTIONS}`
  }
};

module.exports = QTECH_CONFIG;
