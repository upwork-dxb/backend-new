const ADAPTER_URL_V1 = "/v1/";
const ADAPTER_URL_V2 = "/v2/";
const ACCESS_TOKEN = "auth/token";
const LOBBY_URL = "games/lobby-url";
const GAME_LIST = "games";
const LAUNCH_URL = "games/{gameId}/launch-url";
const GAME_HISTORY_URL = "players/{userId}/service-url";
const TRANSACTIONS_URL = "transactions";

const QTECH_BASE_URL =
  process.env.QTECH_ENV == "development"
    ? "https://api-int.qtplatform.com"
    : "https://api.qtplatform.com";
const QTECH_USERNAME =
  process.env.QTECH_ENV == "development" ? "api_runscasino" : "";
const QTECH_PASSWORD =
  process.env.QTECH_ENV == "development" ? "beDasea4" : "";
const QTECH_PASSKEY =
  process.env.QTECH_ENV == "development"
    ? "63b93fd67cd4b42b8de10495"
    : "649896c838ae5d7fd0f7f403";
const QTECH_WHITELISTING_IP =
  process.env.QTECH_ENV == "development"
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
        "202.175.253.62",
      ];
const QTECH_ROUTE_PATH =
  process.env.QTECH_ENV == "development" ? "/api/qtech" : "/api/qtech";

module.exports = {
  QTECH_USERNAME,
  QTECH_PASSWORD,
  QTECH_PASSKEY,
  QTECH_WHITELISTING_IP,
  QTECH_ROUTE_PATH,
  QTECH_BASE_URL,
  QTECH_ACCESS_TOKEN_URL: QTECH_BASE_URL + ADAPTER_URL_V1 + ACCESS_TOKEN,
  QTECH_LOBBY_URL: QTECH_BASE_URL + ADAPTER_URL_V1 + LOBBY_URL,
  QTECH_LAUNCH_URL: QTECH_BASE_URL + ADAPTER_URL_V1 + LAUNCH_URL,
  QTECH_GAME_HISTORY_URL: QTECH_BASE_URL + ADAPTER_URL_V1 + GAME_HISTORY_URL,
  QTECH_GAME_LIST_URL: QTECH_BASE_URL + ADAPTER_URL_V2 + GAME_LIST,
  QTECH_TRANSACTIONS_URL: QTECH_BASE_URL + TRANSACTIONS_URL,
};
