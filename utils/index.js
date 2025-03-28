const path = require('path')
  , moment = require('moment')
  , axios = require('axios')
  , fs = require('fs').promises
  , fls = require('fs')
  , { v4: uuidv4 } = require('uuid')
  , writeFile = require('util').promisify(require('fs').writeFileSync)
  , domainFile = path.normalize(path.resolve(__dirname, "./domains.json"))
  , DeviceDetector = require('node-device-detector')
  , sportService = require('../admin-backend/service/sportService')
  , seriesService = require('../admin-backend/service/seriesService')
  , matchService = require('../admin-backend/service/matchService')
  , apiUrlSettingsService = require("../admin-backend/service/apiUrlSettingsService")
  , UserLoginLog = require('../models/userLoginLogs')
  , WebSites = require('../models/websiteSetting')
  , CONSTANTS = require('./constants')
  , counrtyCode = require('./counrtyCode.json')
  , currencies = require('../uploads/currency.json')
  , ACTIVE = "ACTIVE", OPEN = "OPEN", SUSPENDED = "SUSPENDED"
  , { rateLimit } = require('express-rate-limit')
  , redisClient = require("../connections/redisConnections")
const { AUTH_APP_JWT_SECRET, USER_BLOCK_TYPE } = require('../config/constant/user');
const { getFmIPAddressUID } = require("./getter-setter");
const jwt = require("jsonwebtoken");
const { resultResponse } = require('./globalFunction');
const cors = require('cors');
const { FETCH_DATA_FROM_FOR_FANCY, 
  FETCH_DATA_FROM_FOR_MARKET } = require('../config/constant/rateConfig');

module.exports = {
  getSportName: async (sport_id) => {
    let sport_name = await sportService.getSportDetails({ sport_id: sport_id }, { _id: 0, name: 1 });
    return sport_name.statusCode == CONSTANTS.SUCCESS ? sport_name.data.name : "";
  },
  getSeriesName: async (series_id) => {
    let series_name = await seriesService.getSeriesDetail({ series_id: series_id }, { _id: 0, name: 1 });
    return series_name.statusCode == CONSTANTS.SUCCESS ? series_name.data.name : "";
  },
  getSportIdSeriesIdByMatch: async (match_id) => {
    let responseFromDB = await matchService.getMatchDetails(
      { match_id: match_id },
      {
        _id: 0, sport_id: 1, sport_name: 1, series_id: 1, series_name: 1, match_name: 1, match_date: 1,
        market_min_stack: 1, market_max_stack: 1, market_min_odds_rate: 1, market_max_odds_rate: 1, market_max_profit: 1, market_advance_bet_stake: 1,
        session_min_stack: 1, session_max_stack: 1, session_max_profit: 1
      });
    if (responseFromDB.statusCode == CONSTANTS.SUCCESS) {
      return { SUCCESS: CONSTANTS.SUCCESS, ...responseFromDB.data };
    } else
      return { SUCCESS: false };
  },
  getAllEvents: (id) => {
    return matchService.getMatchDetails(
      id,
      { _id: 0, sport_id: 1, sport_name: 1, series_id: 1, series_name: 1, match_name: 1, match_id: 1 }
    ).then(responseFromDB => {
      if (responseFromDB.statusCode == CONSTANTS.SUCCESS)
        return { SUCCESS: CONSTANTS.SUCCESS, ...responseFromDB.data }
      return { SUCCESS: false };
    }).catch({ SUCCESS: false });
  },
  getDomainName: (hostName) => {
    return hostName.substring(hostName.lastIndexOf(".", hostName.lastIndexOf(".") - 1) + 1);
  },
  checkIsValidDomain: (domain) => {
    var re = new RegExp(/^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/);
    return domain.match(re);
  },
  getDomainWithoutSubdomain: (url) => {
    try {
      const urlParts = new URL(url).hostname.split('.')
      return urlParts
        .slice(0)
        .slice(-(urlParts.length === 4 ? 3 : 2))
        .join('.');
    } catch (error) {
      return "";
    }
  },
  getRequesterIp: (req) => {
    let ip_data = req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      (
        req.connection.remoteAddress ||
        req.client.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection.socket ? req.connection.socket.remoteAddress : null)
      ).slice(7);
    return ip_data;
  },
  isHostOrIP: () => {
    return RegExp([
      '^https?:\/\/([a-z0-9\\.\\-_%]+:([a-z0-9\\.\\-_%])+?@)?',
      '((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\\.){3}(25[0-5]|2[0-4',
      '][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])?',
      '(:[0-9]+)?(\/[^\\s]*)?$'
    ].join(''), 'i');
  },
  getGeoLocation: (IP) => {
    switch (CONSTANTS.DEFAULT_GEOLOCATION) {
      case CONSTANTS.IPGEOLOCATION:
        return module.exports.getIPGeolocation(IP).then(data => data);
    }
  },
  getIPGeolocation: async (IP) => {
    var config = {
      method: 'get',
      timeout: 2000,
      url: `${CONSTANTS.IPGEOLOCATION_URL}?apiKey=${CONSTANTS.IPGEOLOCATION_API_KEY}&ip=${IP}`,
    };
    let response = { status: false, data: {} };
    try {
      response = (await axios(config)).data;
      return {
        status: true,
        data: {
          ip: response.ip,
          country: response.country_name,
          state: response.state_prov,
          district: response.district,
          city: response.city,
          zipcode: response.zipcode,
          lat: response.latitude,
          long: response.longitude,
          isp: response.isp
        }
      };
    } catch (error) { };
    return response;
  },
  userLoginLogs: async function (user) {
    delete user._id;
    let geolocation = await module.exports.getIpDetails(user.ip_address);
    return {
      ...user,
      geolocation
    };
  },
  checkDomain: async function (req) {
    let domainName = module.exports.getDomainName(req.get('host'));
    if (!domainName.includes("localhost")) {
      if (Array.isArray(module.exports.checkIsValidDomain(domainName))) {
        // Store log for un-successful account access of different domain.
        if (req.domain_name != domainName) {
          req.loginUserLog.message = "You are not allowed to login!";
          UserLoginLog.create(await module.exports.userLoginLogs(req.loginUserLog)).then().catch(console.error);
          return req.loginUserLog.message;
        }
      } else {
        req.loginUserLog.message = "Ip login not allowed!";
        UserLoginLog.create(await module.exports.userLoginLogs(req.loginUserLog)).then().catch(console.error);
        return req.loginUserLog.message;
      }
    }
  },
  loadDomains: function () {
    WebSites.find().lean().select("-_id domain_name")
      .then(domainNames => writeFile(domainFile, JSON.stringify(domainNames.map(domain => domain.domain_name), null, 2), 'utf8')).catch(() => []);
  },
  corsOptions: {
    origin: async function (origin, callback) {
      let whitelist = [];
      try {
        whitelist = JSON.parse(await fs.readFile(domainFile, 'utf8'));
        if (process.env.ALLOW_ORIGINS == "true") {
          whitelist.push(""); // To enable for postman.
          // To enable localhost or IP request.
          if (origin.includes("localhost") || module.exports.isHostOrIP().test(origin))
            whitelist.push(origin);
        }
      } catch (error) { }
      if (whitelist.indexOf(module.exports.getDomainName(origin ? origin : "")) !== -1)
        callback(null, true);
      else if (whitelist.indexOf(origin) !== -1)
        callback(null, true);
      else
        callback(new Error('Requested origin not allowed!'));
    }
  },
  titleCase: function (str) {
    return str
      .split(' ')
      .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  },
  generateReferCode(count = 8) {
    var _sym = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'
      , str = '';
    for (var i = 0; i < count; i++)
      str += _sym[parseInt(Math.random() * (_sym.length))];
    return str;
  },
  generateRandomNumber(count = 8) {
    var _sym = '12345678901234567890123456789012345678909874653214'
      , str = '';
    for (var i = 0; i < count; i++)
      str += _sym[parseInt(Math.random() * (_sym.length))];
    return str;
  },
  objectToQueryParams(data) {
    return Object.keys(data).map(key => `${key}=${data[key]}`).join("&");
  },
  removeStaticContent(path) {
    if (fls.existsSync(path))
      fls.unlinkSync(path);
  },
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  toFix(rate) {
    return (Math.round((rate + Number.EPSILON) * 100) / 100)
  },
  exponentialToFixed(value) {
    return parseFloat(parseFloat(value).toFixed(2));
  },
  fixFloatingPoint(value, epsilon = 1e-10) {
    return Math.abs(value) < epsilon ? 0 : module.exports.exponentialToFixed(value);
  },
  getStaticContent: (dir) => path.normalize(path.resolve(__dirname, "../uploads/" + dir)),
  INVALID_TOKEN: "INVALID_TOKEN", INVALID_TOKEN_STATUS: 400,
  ACCOUNT_BLOCKED: "ACCOUNT_BLOCKED", ACCOUNT_BLOCKED_STATUS: 403,
  UNKNOWN_ERROR: "UNKNOWN_ERROR", UNKNOWN_ERROR_STATUS: 500,
  LOGIN_FAILED: "LOGIN_FAILED", LOGIN_FAILED_STATUS: 401,
  VALIDATION_ERROR: "VALIDATION_ERROR", VALIDATION_ERROR_STATUS: 422,
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS", INSUFFICIENT_FUNDS_STATUS: 422,
  GAME_NOT_AVAILABLE: "GAME_NOT_AVAILABLE", GAME_NOT_AVAILABLE_STATUS: 423,
  SSUCCESS: "SUCCESS", SSUCCESS_STATUS: 200,
  blockEvent(data) {
    let { finalEventList, user_id, is_self_view, PARENT_LEVEL_IDS } = data;
    for (let [index, event] of finalEventList.entries()) {
      event.is_active = true;
      if (event.parent_blocked.length) {
        if (event.parent_blocked.includes(user_id))
          event.is_active = false;
        if (USER_BLOCK_TYPE == 'DEFAULT') {
          if (is_self_view)
            if (event.parent_blocked.includes(user_id))
              delete finalEventList[index];
          if (user_id)
            if (event.parent_blocked.some(ai => PARENT_LEVEL_IDS.includes(ai)))
              delete finalEventList[index];
        }
      }
      if (event.self_blocked.length) {
        if (is_self_view)
          if (event.self_blocked.includes(user_id))
            event.is_active = false;
        if (USER_BLOCK_TYPE == 'DEFAULT') {
          if (user_id)
            if (event.self_blocked.includes(user_id))
              event.is_active = false;
          if (event.self_blocked.some(ai => PARENT_LEVEL_IDS.includes(ai)))
            delete finalEventList[index];
        }
      }
    }
  },
  marketOddsFormatter(MARKET) {
    try {
      let selections = {}, availableToBack = [], availableToLay = []
        , runners = [], matched = "0";
      if (MARKET.hasOwnProperty("rt")) {
        if (MARKET.rt.length) {
          for (const runner of MARKET.rt) {
            if (selections[runner.ri] == undefined)
              runner.ri = parseInt(runner.ri);
            if (selections[runner.ri] == undefined) {
              availableToBack = []; availableToLay = [];
              selections[runner.ri] = {
                "selectionId": runner.ri,
                "status": (MARKET.hasOwnProperty("isBookmaker")) ? ACTIVE : (runner.st ? ACTIVE : SUSPENDED),
              }
              if (runner.ib) {
                availableToBack[runner.pr] = {
                  "price": runner.rt,
                  "size": runner.bv
                }
              } else {
                availableToLay[runner.pr] = {
                  "price": runner.rt,
                  "size": runner.bv
                }
              }
              selections[runner.ri] = {
                ...selections[runner.ri],
                "ex": {
                  availableToBack,
                  availableToLay
                }
              }
            } else {
              if (runner.ib) {
                if (runner.hasOwnProperty("tv"))
                  matched = runner.tv;
                selections[runner.ri].ex.availableToBack[runner.pr] = {
                  "price": runner.rt,
                  "size": runner.bv
                }
              } else {
                selections[runner.ri].ex.availableToLay[runner.pr] = {
                  "price": runner.rt,
                  "size": runner.bv
                };
              }
            }
          }
        }
        runners = Object.values(selections);
        if (MARKET.hasOwnProperty("isBookmaker"))
          if (MARKET.hasOwnProperty("rt"))
            if (!MARKET.rt.length)
              runners = [];
        let market = {
          "marketId": MARKET.bmi,
          "status": MARKET.ms == 1 ? OPEN : SUSPENDED,
          "inplay": MARKET.ip ? true : false,
          matched,
          runners
        }
        return {
          status: true,
          data: market
        };
      }
      return { status: false };
    } catch (error) {
      return { status: false };
    }
  },
  fancyFormatter(FANCY) {
    try {
      let fancy_id, SelectionId, BackPrice1 = 0, BackSize1 = 0, LayPrice1 = 0, LaySize1 = 0, GameStatus = SUSPENDED
      if (FANCY.hasOwnProperty("rt")) {
        if (FANCY.rt.length) {
          for (const fancy of FANCY.rt) {
            SelectionId = fancy.ri;
            if (fancy.ib) {
              BackPrice1 = fancy.rt;
              BackSize1 = fancy.pt;
            } else {
              LayPrice1 = fancy.rt;
              LaySize1 = fancy.pt;
            }
          }
        }
        if (!SelectionId)
          SelectionId = `${FANCY.bmi.toString()}1`;
        fancy_id = FANCY.eid + "_" + SelectionId;
        if (FANCY.hasOwnProperty("ms"))
          GameStatus =
            FANCY.ms == 1 ? "" : // 1	Open
              FANCY.ms == 2 ? "In Active" : // 2	In Active
                FANCY.ms == 3 ? SUSPENDED : // 3	Suspended
                  FANCY.ms == 4 ? "Closed" : // 4	Closed
                    FANCY.ms == 9 ? "Ball Start" : SUSPENDED // 9	Ball Start
        else
          GameStatus = SUSPENDED;
        return {
          status: true,
          data: {
            fancy_id,
            SelectionId,
            BackPrice1,
            BackSize1,
            LayPrice1,
            LaySize1,
            GameStatus
          }
        }
      }
      return { status: false };
    } catch (error) {
      return { status: false };
    }
  },
  getChunkSize(type) {
    let chunkType = {};
    chunkType[CONSTANTS.INPLAY] = 10; chunkType[CONSTANTS.DELAY] = 10; chunkType[CONSTANTS.BOOKMAKER_TYPE] = 1; chunkType[CONSTANTS.MANUAL_BOOKMAKER_TYPE] = 0;
    return chunkType[type];
  },
  getTimeTaken(params = {
    startTime: moment()
  }) {

    const { startTime } = params;

    // Step 1: Create two Moment objects
    // const startTime = moment('2024-08-26 08:00:00'); // Example start time
    const endTime = moment();   // Example end time

    // Step 2: Calculate the difference in milliseconds
    const durationInMilliseconds = endTime.diff(startTime);

    // Step 3: Convert the duration to a human-readable format
    const duration = moment.duration(durationInMilliseconds);

    const hours = duration.hours();     // Extract hours
    const minutes = duration.minutes(); // Extract minutes
    const seconds = duration.seconds(); // Extract seconds
    const milliseconds = duration.milliseconds(); // Extract seconds

    return (`Total time taken: ${hours ? hours + " hours, " : ""}${minutes ? minutes + " minutes, " : ""}${seconds ? seconds + " seconds and " : ""}${milliseconds} milliseconds`);

  },
  generateUUID() {

    // Function to shuffle a string (UUID in this case)
    function shuffleString(str) {
      const arr = str.split('');
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.join('');
    }

    // Function to generate and shuffle a UUID
    function generateAndShuffleUUID() {
      const uuid = uuidv4();
      const shuffledUUID = shuffleString(uuid);
      return shuffledUUID;
    }

    // Example usage: Generate and shuffle a UUID
    const shuffledUuid = generateAndShuffleUUID();

    // Output the shuffled UUID
    return (shuffledUuid).replace(/-/g, "_");
  },
  checkMarketType(marketName, mType) {
    return (new RegExp(mType.toLowerCase())).test(marketName.toLowerCase());
  },
  soccerMarketOrder(marketName, mType) {
    return module.exports.checkMarketType(marketName, "Over/Under 0.5 Goals")
      ? 2 :
      module.exports.checkMarketType(marketName, "Over/Under 1.5 Goals")
        ? 3 :
        module.exports.checkMarketType(marketName, "Over/Under 2.5 Goals")
          ? 4 :
          module.exports.checkMarketType(marketName, "Over/Under 3.5 Goals")
            ? 5 : 6
  },
  getMarketType(data) {
    const { marketName } = data;
    let market =
      module.exports.checkMarketType(marketName, CONSTANTS.MATCH_ODDS)
        ? { market_type: CONSTANTS.MATCH_ODDS, market_order: 1 } :
        module.exports.checkMarketType(marketName, CONSTANTS.BOOKMAKER)
          ? { market_type: CONSTANTS.BOOKMAKER, market_order: 2 } :
          module.exports.checkMarketType(marketName, CONSTANTS.TWTT)
            ? { market_type: CONSTANTS.TWTT, market_order: 3 } :
            module.exports.checkMarketType(marketName, CONSTANTS.WINNER_ODDS)
              ? { market_type: CONSTANTS.WINNER_ODDS, market_order: 1 } :
              module.exports.checkMarketType(marketName, CONSTANTS.TIED_MATCH)
                ? { market_type: CONSTANTS.TIED_MATCH, market_order: 4 } :
                module.exports.checkMarketType(marketName, CONSTANTS.COMPLETED_MATCH)
                  ? { market_type: CONSTANTS.COMPLETED_MATCH, market_order: 5 } :
                  module.exports.checkMarketType(marketName, CONSTANTS.OVER_UNDER)
                    ? {
                      market_type: CONSTANTS.OVER_UNDER,
                      market_order: module.exports.soccerMarketOrder(marketName, "")
                    } : module.exports.checkMarketType(marketName, CONSTANTS.TO_BE_PLACED)
                      ? { market_type: CONSTANTS.TO_BE_PLACED_TYPE, market_order: 1 }
                      : { market_type: CONSTANTS.OTHER, market_order: 1 };
    return {
      market_type: market.market_type.toUpperCase().replace(/ /g, "_"),
      market_order: market.market_order
    }
  },
  limiter: rateLimit({
    windowMs: 1000 * 10, // 10 Seconds
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      "msg": "Too many requests, please try again later.",
      "status": false
    }
  }),
  enableTelegramLimiter: rateLimit({
    windowMs: 1000 * 10, // 10 Seconds
    limit: 1,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      "msg": "Too many requests, please try again later.",
      "status": false
    }
  }),
  isFetchDataFromForMarketDB: () => {
    return FETCH_DATA_FROM_FOR_MARKET.toLowerCase() == 'db';
  },
  isFetchDataFromForFancyDB: () => {
    return FETCH_DATA_FROM_FOR_FANCY.toLowerCase() == 'db';
  },
  resetPasswolimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      "msg": 'Too many password reset requests from this IP, please try again after an hour',
      "status": false
    }
  }),
  getCountryCodeOnly() {
    let countryCodeArray = counrtyCode;
    // Get only country codes
    return countryCodeArray.map(data => data.code);
  },
  getCurrencyCodeList() {
    return currencies.map(data => data.currency_code);
  },
  getCurrencies(req, res) {
    return res.json({ data: currencies });
  },
  getIpDetails: async (ip_address) => {
    let geolocation = {};
    try {
      let redisIpAddressData = await redisClient.get(
        getFmIPAddressUID(ip_address)
      );
      if (redisIpAddressData) {
        geolocation = JSON.parse(redisIpAddressData);
      } else {
        geolocation = await axios.get(
          await apiUrlSettingsService.getIpAddressDetailsUrl(ip_address),
          { timeout: 3000 }
        );
        if (!geolocation.data.error) {
          geolocation = geolocation.data.data;
        } else {
          geolocation = {};
        }
        if (Object.keys(geolocation).length == 0) {
          geolocation = {
            ip: ip_address,
          };
        }
      }
      return typeof geolocation === "string" ? JSON.parse(geolocation) : geolocation;
    } catch (err) {
      return geolocation;
    }
  },
  createJWT: (payload) => {
    return jwt.sign(payload, AUTH_APP_JWT_SECRET);
  },
  verifyJWT: (token) => {
    try {
      const decoded = jwt.verify(token, AUTH_APP_JWT_SECRET, { ignoreExpiration: true });
      return resultResponse(CONSTANTS.SUCCESS, decoded);
    } catch (error) {
      return resultResponse(CONSTANTS.SERVER_ERROR, { msg: "Invalid Token Provided.." })
    }
  },
  removeDecimal: (number) => {
    return Math.trunc(number);
  },
  cors: (options = {}) => {
    return cors({
      exposedHeaders: ["Content-Disposition"], // Expose Content-Disposition header
    });
  }
};