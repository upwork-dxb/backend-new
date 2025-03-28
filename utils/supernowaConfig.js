const BASE_URL = process.env.SUPERNOWA_ENV == "development"
  ? "https://stageapi.worldcasinoonline.com" : "https://api.worldcasinoonline.com"
  , AUTH_URL = process.env.SUPERNOWA_ENV == "development"
    ? "https://stageapiauth.worldcasinoonline.com" : "https://auth.worldcasinoonline.com"
  , ADAPTER_URL = "/api/"
  , SUPERNOWA_URL = AUTH_URL + ADAPTER_URL
  , USER_AUTH = "auth/userauthentication"
  , USER_BETS_URL = BASE_URL + ADAPTER_URL + "bets"
  , GAMES_LIST_URL = BASE_URL + ADAPTER_URL + "games"
  , PRIMARY_PARTNER_KEY = process.env.SUPERNOWA_ENV == "development"
    ? "CWF24UcZXqPjDw3j5DcaDRfUlPI6ZtU5I6xy2Yi8MfgpABvrZkLWlqYO1lroQzLUbpzf2x+jJfQ="
    : "dTjg+AHxWZcSRJRSY0VHxlSvtfxezFQtlDoE+C8zIVZnPvRjb8t8wABm1rXH2SPueuDrZ+ouq54="
  , POINT_PARTNER_KEY = process.env.SUPERNOWA_ENV == "development"
    ? "DWa1pN49l+tnNGNc7kmpk8M85MK+QAolVcqtmsmRzI1C83t28LrIqX0zrG+Ks7n9kM7Ugw9OgXtdTkETGpfLuQ=="
    : "eq0Fm/4Ncitvv6KneM1KiD7Rw6zN5NBa0SGh98QVmbsu6IoidvztwDhzNWkZdMW4NMzgKhN3tDo=";

module.exports = {
  USER_AUTH, SUPERNOWA_URL, USER_BETS_URL, GAMES_LIST_URL,
  SUPERNOWA_PARTNER_KEY: PRIMARY_PARTNER_KEY, SUPERNOWA_POINT_PARTNER_KEY: POINT_PARTNER_KEY,
  SUPERNOWA_PARTNER_KEYS: [
    PRIMARY_PARTNER_KEY, POINT_PARTNER_KEY
  ],
  allowSNowaIp: ["127.0.0.1", "51.195.208.128"],
  INITIAL_ROUTE_PATH: "/api/snowa"
}