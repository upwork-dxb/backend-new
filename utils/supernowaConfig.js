const isDev = process.env.SUPERNOWA_ENV === "development";

// 🔗 Base URLs
const BASE_URL = isDev
  ? "https://stageapi.worldcasinoonline.com"
  : "https://api.worldcasinoonline.com";

const AUTH_URL = isDev
  ? "https://stageapiauth.worldcasinoonline.com"
  : "https://auth.worldcasinoonline.com";

const ADAPTER_PATH = "/api/";

// 🔐 Partner Keys
const PRIMARY_PARTNER_KEY = isDev
  ? "CWF24UcZXqPjDw3j5DcaDRfUlPI6ZtU5I6xy2Yi8MfgpABvrZkLWlqYO1lroQzLUbpzf2x+jJfQ="
  : "dTjg+AHxWZcSRJRSY0VHxlSvtfxezFQtlDoE+C8zIVZnPvRjb8t8wABm1rXH2SPueuDrZ+ouq54=";

const POINT_PARTNER_KEY = isDev
  ? "DWa1pN49l+tnNGNc7kmpk8M85MK+QAolVcqtmsmRzI1C83t28LrIqX0zrG+Ks7n9kM7Ugw9OgXtdTkETGpfLuQ=="
  : "eq0Fm/4Ncitvv6KneM1KiD7Rw6zN5NBa0SGh98QVmbsu6IoidvztwDhzNWkZdMW4NMzgKhN3tDo=";

// 📡 API Endpoints
const SUPERNOWA_URL = AUTH_URL + ADAPTER_PATH;
const USER_BETS_URL = BASE_URL + ADAPTER_PATH + "bets";
const GAMES_LIST_URL = BASE_URL + ADAPTER_PATH + "games";
const USER_AUTH = "auth/userauthentication";

// ✅ Final export
module.exports = {
  USER_AUTH,
  SUPERNOWA_URL,
  USER_BETS_URL,
  GAMES_LIST_URL,
  SUPERNOWA_PARTNER_KEY: PRIMARY_PARTNER_KEY,
  SUPERNOWA_POINT_PARTNER_KEY: POINT_PARTNER_KEY,
  SUPERNOWA_PARTNER_KEYS: [PRIMARY_PARTNER_KEY, POINT_PARTNER_KEY],
  allowSNowaIp: ["127.0.0.1", "51.195.208.128"],
  INITIAL_ROUTE_PATH: "/api/snowa"
};
