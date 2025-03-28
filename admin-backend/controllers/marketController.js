const _ = require('lodash')
  , { ObjectId } = require("bson")
  , axios = require('axios')
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , getCurrentLine = require('get-current-line')
  , Responder = require('../../lib/expressResponder')
  , CONSTANTS = require('../../utils/constants')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , userService = require('../service/userService')
  , commonService = require('../service/commonService')
  , sportService = require('../service/sportService')
  , seriesService = require('../service/seriesService')
  , matchService = require('../service/matchService')
  , marketService = require('../service/marketService')
  , apiUrlSettingsService = require('../service/apiUrlSettingsService')
  , marketCreateRunners = require('../../utils/marketCreateRunners')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , { SocSuccess } = require('../../lib/socketResponder')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, REMOVED, HR, GHR } = require("../../utils/constants")
  , utils = require('../../utils')
  , { getSportIdSeriesIdByMatch, blockEvent, getMarketType } = utils
  , { createMarketRunners } = marketCreateRunners
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig');
const { STATUS_500, STATUS_422 } = require("../../utils/httpStatusCode");

module.exports = {
  async createMarket(req, res) {
    const createMarketSchema = Joi.object({
      sport_id: Joi.string().optional(),
      series_id: Joi.string().optional(),
      match_id: Joi.string().required(),
      market_id: Joi.string().required(),
      market_name: Joi.string().required(),
      runners: Joi.array().optional(),
      is_manual: Joi.string().valid(0, 1).optional()
    });
    try {
      await createMarketSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.error(res, { msg: "Something went wrong : " + error.details[0].message, statusCode: STATUS_422 })
    }
    try {

      let { sport_id, match_id, market_id, market_name, is_manual = is_manual || '0', runners } = req.body;

      let isSportDataExists = await sportService.isSportDataExists(sport_id);

      if ([NOT_FOUND, SERVER_ERROR].includes(isSportDataExists.statusCode)) {
        return ResError(res, { msg: isSportDataExists.data });
      }

      isSportDataExists = isSportDataExists.data;

      if (isSportDataExists.is_active == 0 || isSportDataExists.is_visible == false) {
        return ResError(res, { msg: "Sport are not active or visible yet!" });
      }

      let isMatchDataExists = await matchService.isMatchDataExists(match_id);

      if ([NOT_FOUND, SERVER_ERROR].includes(isMatchDataExists.statusCode)) {
        return ResError(res, { msg: isMatchDataExists.data });
      }

      isMatchDataExists = isMatchDataExists.data;

      if (isMatchDataExists.is_active == 0 || isMatchDataExists.is_visible == false) {
        return ResError(res, { msg: "Match are not active or visible yet!" });
      }

      let isSeriesDataExists = await seriesService.isSeriesDataExists(isMatchDataExists.series_id);

      if ([NOT_FOUND, SERVER_ERROR].includes(isSeriesDataExists.statusCode)) {
        return ResError(res, { msg: isSeriesDataExists.data });
      }

      isSeriesDataExists = isSeriesDataExists.data;

      if (isSeriesDataExists.is_active == 0 || isSeriesDataExists.is_visible == false) {
        return ResError(res, { msg: "Series are not active or visible yet!" });
      }

      let checkMarketExist = await marketService.checkMarketExist(market_id);
      if (checkMarketExist.statusCode == SUCCESS)
        return ResError(res, { msg: "Market data already exists!" });

      let getSportIdSeriesIdByMatchStatus = await getSportIdSeriesIdByMatch(match_id);

      if (!getSportIdSeriesIdByMatchStatus.SUCCESS) {
        return ResError(res, { msg: `Some required ids not found` });
      }

      delete getSportIdSeriesIdByMatchStatus.SUCCESS;
      Object.assign(req.body, getSportIdSeriesIdByMatchStatus);
      let marketMeta = getMarketType({ marketName: market_name });
      req.body.name = market_name;
      req.body.market_type = marketMeta.market_type;
      req.body.market_order = marketMeta.market_order;
      req.body.marketId = market_id;
      req.body.runners = (runners = runners || []);

      let isManualObj = {};
      if (!runners.length) {
        try {
          let onlineMarketRes = await axios.get(await apiUrlSettingsService.getMarketSelectionsUrl() + market_id, { timeout: 3000 });
          onlineMarketRes = onlineMarketRes.data;
          if (!Array.isArray(onlineMarketRes))
            onlineMarketRes = [];
          if (onlineMarketRes.length) {
            req.body.match_date = onlineMarketRes[0].event.openDate;
            req.body.country_code = onlineMarketRes[0].event?.countryCode;
            req.body.venue = onlineMarketRes[0].event?.venue;
            onlineMarketRes = onlineMarketRes[0].markets;
            if (onlineMarketRes != undefined) {
              if (!onlineMarketRes.length)
                throw new Error("Market data not found!");
              onlineMarketRes = onlineMarketRes[0];
              if (!onlineMarketRes.hasOwnProperty("runners"))
                throw new Error("Runners not found!");
              req.body.centralId = onlineMarketRes.centralId;
              req.body.is_manual = onlineMarketRes.isManual;
              req.body.market_start_time = onlineMarketRes?.marketStartTime;
              req.body.runners = createMarketRunners(market_id, onlineMarketRes.runners);

              if (onlineMarketRes?.isManual == '1') {
                req.body.cron_inplay = true;
                if (onlineMarketRes.marketName == CONSTANTS.BOOKMAKER) {
                  isManualObj = {
                    market_id: onlineMarketRes.marketId,
                    marketId: onlineMarketRes.marketId,
                    market_name: CONSTANTS.BOOKMAKER,
                    market_type: CONSTANTS.BOOKMAKER_TYPE
                  }
                }
              }

              if (sport_id == CONSTANTS.HR && onlineMarketRes.marketName.toLowerCase().includes(CONSTANTS.TO_BE_PLACED.toLocaleLowerCase())) {
                try {
                  const apiRes = await axios.get(CONSTANTS.GET_ODDS_API_DELAY + onlineMarketRes.marketId,
                    { timeOut: 2000 });
                  if (apiRes.data.length) {
                    const numberOfWinners = apiRes.data[0].numberOfWinners;
                    req.body["no_of_winners"] = numberOfWinners;
                  }
                } catch (err) {
                  req.body["no_of_winners"] = 3;
                }
              }

              marketService.setTWTTRates(onlineMarketRes);

            }
          }
        } catch (error) {
          return ResError(res, { msg: `Error to create market, runners ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}`, statusCode: STATUS_500 });
        }
      }
      if (!req.body.runners.length)
        return ResError(res, { msg: `Error to create market, runners not found ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` });

      if (req.body.market_type == CONSTANTS.TIED_MATCH_TYPE
        || req.body.market_type == CONSTANTS.COMPLETED_MATCH_TYPE) {
        req.body["cron_inplay"] = true;
      }

      let bmInc = {};
      let IsBookmaker = (new RegExp('bookmaker')).test(market_name.toLocaleLowerCase());
      if (IsBookmaker) {
        bmInc = { $inc: { bookmaker_count: 1 } };
      }

      new Market(req.body).save();
      await Match.updateOne(
        { match_id },
        {
          '$push': { marketIds: market_id, centralIds: req.body.centralId },
          ...isManualObj,
          ...bmInc
        }
      );
      req.IO.emit(match_id + "_new_market_added", SocSuccess({
        msg: "Market added...",
        hasData: true,
        data: { market_id }
      }));
      return ResSuccess(res, {
        msg: 'Market create successfully...', data: {
          "market_name": market_name,
          "centralId": req.body.centralId,
          "action": "set"
        }
      });
    } catch (error) {
      return ResError(res, { msg: 'Error to create Market ' + error.message, statusCode: STATUS_500 });
    }
  },
  async updateMarketStatus(req, res) {
    let { market_id, is_active, user_id } = req.body;

    if (!user_id)
      user_id = req.User.user_id || req.User._id;
    let loggedInUserDetails = await userService.getUserByUserId({ _id: user_id }, { user_type_id: 1 });
    if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
      return Responder.success(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` })
    loggedInUserDetails = loggedInUserDetails.data;
    let user_type_id = loggedInUserDetails.user_type_id;
    if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN) {
      let updateMarketStatusFromDB = await marketService.updateMarketStatus(market_id, is_active);
      if (updateMarketStatusFromDB.statusCode === CONSTANTS.SUCCESS) {
        req.IO.emit(updateMarketStatusFromDB.data.match_id + "_new_market_added", SocSuccess({
          msg: "Market updated...",
          hasData: true,
          data: { market_id }
        }));
        let msg = is_active == 1 ? "Market activated successfully..." : "Market deactivated successfully..."
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return Responder.success(res, { msg: msg });
      } else if (updateMarketStatusFromDB.statusCode === CONSTANTS.NOT_FOUND)
        return Responder.error(res, { msg: 'Market not found! please create it first...' });
      else if (updateMarketStatusFromDB.statusCode === CONSTANTS.ALREADY_EXISTS) {
        let msg = `Market already ${is_active == 1 ? 'activated' : 'de-activated'}...`
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return Responder.error(res, { msg: msg });
      }
      else {
        return Responder.error(res, { msg: 'Error while updating Market status! ' + updateMarketStatusFromDB.data });
      }
    } else {
      let userData = { user_id, market_id };
      let datafromService = await marketService.getDeactiveMarket(userData);
      if (datafromService.statusCode === CONSTANTS.SUCCESS) {
        let deleteDeactiveMarket = await marketService.deleteDeactiveMarket(userData);
        if (deleteDeactiveMarket.statusCode === CONSTANTS.SUCCESS) {
          let msg = `Child(s) market ${isBlockByParentRequest ? 'un-blocked' : 'activated'} successfully...`
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { msg: msg });
        }
        else {
          return Responder.error(res, { msg: `An Error Occurred ! ${user_type_id == 0 ? ',' + datafromService.data : ''}` });
        }
      } else if (datafromService.statusCode === CONSTANTS.NOT_FOUND) {
        if (isBlockByParentRequest)
          Object.assign(userData, { block_by_parent: 1, blocker_parent_id: req.User.user_id || req.User._id });
        let createDeactiveMarket = await marketService.createDeactiveMarket(userData);
        if (createDeactiveMarket.statusCode === CONSTANTS.SUCCESS) {
          let msg = `Child(s) market ${isBlockByParentRequest ? 'Blocked' : 'deactivated'} successfully...`
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { msg: msg });
        }
        else {
          return Responder.error(res, { msg: `An Error Occurred ! ${user_type_id == 0 ? ',' + datafromService.data : ''}` });
        }
      } else
        return Responder.error(res, { msg: `An Error Occurred ! ${user_type_id == 0 ? ',' + datafromService.data : ''}` });
    }
  },
  async getOnlineMarketOld(req, res) {
    let { match_id, sport_id, userid } = req.body;
    const profilechema = Joi.object({
      userid: Joi.string().required(),
      match_id: Joi.string().required(),
      sport_id: Joi.string().required()
    });
    try {
      await profilechema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.error(res, { msg: "Something went wrong : " + error.details[0].message })
    }

    let loggedInUserId = req.User._id;
    let loggedInUserDetails = await userService.getUserByUserId({ _id: loggedInUserId }, { user_type_id: 1, parent_level_ids: 1 });
    let logged_in_user_type_id = loggedInUserDetails.data.user_type_id;
    let userDetails = await userService.getUserByUserId({ _id: userid }, { user_type_id: 1, parent_level_ids: 1 });
    let user_type_id = userDetails.data.user_type_id;
    let apiUrlSettings = await commonService.getApiUrlSettings();
    let onlineMarketList = [];

    try {
      let onlineMarketRes = await axios.get(apiUrlSettings.data.online_market_url + match_id + "&sportId=" + sport_id, { timeout: 3000 });
      onlineMarketList = onlineMarketRes.data;
      if (!Array.isArray(onlineMarketList))
        onlineMarketList = [];
      // if (sport_id == 4 && onlineMarketList.length) {
      //   let onlySelectedMarkets = ['Match Odds', 'To Win the Toss'];
      //   onlineMarketList = onlineMarketList.filter(data => onlySelectedMarkets.includes(data.marketName));
      // }
    } catch (error) { onlineMarketList = []; }

    let mapsdata = onlineMarketList.map((element) => {
      return {
        market_id: element.marketId,
        name: element.marketName,
        match_id: match_id,
        is_fancy: false,
        sport_id: sport_id,
        is_active: 0,
        is_visible: 0,
        is_created: 0
      };
    });
    let getMarketFieldsName = { market_id: 1, name: 1, match_id: 1, sport_id: 1, is_active: 1, is_visible: 1, is_created: 1 }
    let allMarketList = await marketService.getAllMarkets(match_id, getMarketFieldsName);
    allMarketList = allMarketList.data;

    var marketIds = new Set(allMarketList.map(item => item.market_id));
    let apiMarketsAndDBMarketsList = [...allMarketList, ...mapsdata.filter(item => !marketIds.has(item.market_id))];

    let userAndAllParentIds = [];
    let parentIdsObject = userDetails.data.parent_level_ids;

    await parentIdsObject.forEach(element => {
      userAndAllParentIds.push(element.user_id);
    });
    userAndAllParentIds.push(userid);
    let userAndParentAllDeactiveMarket = await marketService.getUserAndParentAllDeactiveMarket(userAndAllParentIds);
    if (logged_in_user_type_id == 0) {
      if (userAndParentAllDeactiveMarket.statusCode === CONSTANTS.SUCCESS)
        userAndParentAllDeactiveMarket = userAndParentAllDeactiveMarket.data;

      if (userAndParentAllDeactiveMarket.length > 0) {
        let userAllMarketList = apiMarketsAndDBMarketsList.map((item) => {
          let findStatus = userAndParentAllDeactiveMarket.find(deactiveMarket => item.market_id === deactiveMarket.market_id);
          if (findStatus)
            item.is_active = 0;
          return item;
        });
        return Responder.success(res, { data: userAllMarketList, msg: " Market list." })
      }
      else
        return Responder.success(res, { data: apiMarketsAndDBMarketsList, msg: "Market list." })
    }

    let checkLoggedInUserIsParentOfUser = await commonService.getLoggedInUserIsParentOfUser(userid, loggedInUserId);
    if (checkLoggedInUserIsParentOfUser.statusCode === CONSTANTS.SUCCESS) {
      if (userAndParentAllDeactiveMarket.statusCode === CONSTANTS.SUCCESS)
        userAndParentAllDeactiveMarket = userAndParentAllDeactiveMarket.data;

      if (userAndParentAllDeactiveMarket.length > 0) {
        let userAllMarketList = allMarketList.map((item) => {
          let findStatus = userAndParentAllDeactiveMarket.find(deactiveMarket => item.market_id === deactiveMarket.market_id);
          if (findStatus)
            item.is_active = 0;
          return item;
        });
        return Responder.success(res, { data: userAllMarketList, msg: " Market list." })
      }
      else
        return Responder.success(res, { data: allMarketList, msg: "Market list." })
    }
    else {
      let allDeactiveMarketId = [];
      if (userAndParentAllDeactiveMarket.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveMarket = userAndParentAllDeactiveMarket.data;
        await userAndParentAllDeactiveSports.forEach(element => {
          allDeactiveMarketId.push(element.market_id);
        });
      }
      let allActiveMarketOfUser = await marketService.getAllMarketsNotInDeactiveMarket(allDeactiveMarketId, getMarketFieldsName);
      if (allActiveMarketOfUser.statusCode === CONSTANTS.SUCCESS)
        return Responder.success(res, { data: dbAndApiActiveMarkets, msg: "Market list." })
      else
        return Responder.success(res, { data: apiMarketsAndDBMarketsList, msg: "Market list." })
    }
  },
  async getOnlineMarket(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().optional(),
      sport_id: Joi.string().optional(),
      country_code: Joi.string().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async body => {
        let { match_id, sport_id, user_id } = body, user_type_id, NAME, PARENT_LEVEL_IDS = [];

        if (req.path == "/allRacingMarketsOpen") {
          return this.allRacingMarketOpen(req, res, body);
        }

        if (user_id) {
          user_type_id = req.user.user_type_id;
          PARENT_LEVEL_IDS = req.user.parent_level_ids;
          NAME = `${req.user.name}(${req.user.user_name})`;
        } else {
          user_type_id = req.User.user_type_id;
          PARENT_LEVEL_IDS = req.User.parent_level_ids;
          NAME = `${req.User.name}(${req.User.user_name})`;
          user_id = (req.User.user_id || req.User._id);
        }
        let loggedInUserId = (req.User.user_id || req.User._id)
          , is_self_view = loggedInUserId.toString() == user_id.toString();
        if (user_type_id == USER_TYPE_SUPER_ADMIN) {
          let onlineMarketList = [];
          try {
            let onlineMarketRes = await axios.get(await apiUrlSettingsService.getMarketsUrl() + match_id, { timeout: 3000 });
            onlineMarketList = onlineMarketRes.data;
            if (!Array.isArray(onlineMarketList))
              onlineMarketList = [];
            if (onlineMarketList.length) {
              onlineMarketList = onlineMarketList[0].markets;
              if (onlineMarketList == undefined)
                onlineMarketList = [];
            }
          } catch (error) { onlineMarketList = []; }
          // parse api data according to db columns.
          onlineMarketList = onlineMarketList.map(element => {
            return {
              sport_id,
              match_id,
              market_id: element.marketId,
              centralId: element.centralId,
              name: element.marketName,
              is_fancy: false,
              is_active: 0,
              is_visible: 0,
              is_created: 0
            };
          });

          let allMarketListFromDb = await marketService.getAllMarkets(
            { match_id },
            {
              _id: 0, market_id: 1, name: 1, match_id: 1, sport_id: 1, centralId: 1,
              is_active: 1, is_visible: 1, is_created: 1, is_lock: 1
            }
          );
          if (allMarketListFromDb.statusCode == CONSTANTS.SUCCESS) {
            allMarketListFromDb = allMarketListFromDb.data;
            let finalMarketist = _.unionBy(allMarketListFromDb, onlineMarketList, 'market_id');
            return ResSuccess(res, { msg: `${finalMarketist.length} market found...`, data: finalMarketist });
          }
          else if (onlineMarketList.length > 0)
            return ResSuccess(res, { msg: `${onlineMarketList.length} market found...`, data: onlineMarketList });
          else
            return ResError(res, { msg: "No market found" });
        } else {
          const { sports_permission } = (req.user || req.User);
          PARENT_LEVEL_IDS = PARENT_LEVEL_IDS.map(data => data.user_id.toString());
          let filter = { "is_active": 1, "is_visible": true, is_abandoned: 0 }
            , sportsPermission = { sport_id: { '$in': sports_permission.map(data => data.sport_id) } };
          if (match_id)
            filter["match_id"] = match_id;
          if (sport_id)
            filter["$and"] = [{ sport_id }, sportsPermission];
          if (req.path == "/allRacingMarkets") {
            filter["market_id"] = { $regex: ".+(?<!_m)$" };
            filter["$and"] = [{ sport_id: sport_id ? sport_id : { "$in": [HR, GHR] } }, sportsPermission];
            if (req?.body?.country_code)
              filter["country_code"] = req.body.country_code;
          }
          return Market.find(filter)
            .select("-_id sport_id sport_name match_id name market_id venue country_code market_start_time parent_blocked self_blocked match_tv_url has_tv_url inplay")
            .sort("market_start_time").limit(100).lean()
            .then(async events => {
              if (events.length) {
                let finalEventList = events;
                blockEvent({ finalEventList, user_id, is_self_view, PARENT_LEVEL_IDS });
                finalEventList = finalEventList.map(
                  ({ sport_id, sport_name, match_id, name, market_id, is_active, venue, country_code, market_start_time, match_tv_url, has_tv_url, inplay }) =>
                    ({ sport_id, sport_name, match_id, name, market_id, is_active, venue, country_code, market_start_time, match_tv_url, has_tv_url, inplay })
                ).filter(data => data);
                return ResSuccess(res, {
                  dataIs: { user_id, name: NAME }, loggedIn: { user_id: req.User.user_id, name: `${req.User.name}(${req.User.user_name})` },
                  data: finalEventList, msg: `${finalEventList.length} market(s) found...`,
                });
              } else
                return ResError(res, { msg: "No market(s) available yet!" });
            });
        }
      }).catch(error => {
        return ResError(res, error);
      });
  },
  allRacingMarketOpen(req, res, {
    match_id, sport_id, country_code
  }) {
    let filter = { "is_active": 1, "is_visible": true, is_abandoned: 0 };
    if (match_id)
      filter["match_id"] = match_id;
    filter["market_id"] = { $regex: ".+(?<!_m)$" };
    filter["sport_id"] = sport_id ? sport_id : { "$in": [HR, GHR] };
    if (country_code)
      filter["country_code"] = country_code;
    return Market.find(filter)
      .select("-_id sport_name match_id name market_id venue country_code market_start_time parent_blocked self_blocked match_tv_url has_tv_url inplay")
      .sort("market_start_time").limit(100).lean()
      .then(async events => {
        if (events.length) {
          let finalEventList = events;
          finalEventList = finalEventList.map(
            ({ sport_name, match_id, name, market_id, is_active, venue, country_code, market_start_time, match_tv_url, has_tv_url, inplay }) =>
              ({ sport_name, match_id, name, market_id, is_active, venue, country_code, market_start_time, match_tv_url, has_tv_url, inplay })
          ).filter(data => data);
          return ResSuccess(res, {
            data: finalEventList, msg: `${finalEventList.length} market(s) found...`,
          });
        } else
          return ResError(res, { msg: "No market(s) available yet!" });
      });
  },
  allRacingMarkets(req, res) {
    return Joi.object({
      sport_id: Joi.string().valid(HR, GHR).optional(),
      country_code: Joi.string().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => module.exports.getOnlineMarket(req, res)).catch(error => {
        return ResError(res, { error, statusCode: STATUS_500 });
      });
  },
  getMarketsByCountryCode(req, res) {
    return marketService.getMarketsByCountryCode(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  getMarketsByCountryCodeOpen(req, res) {
    return marketService.getMarketsByCountryCodeOpen(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  results(req, res) {
    return Joi.object({
      search: Joi.object({
        _id: JoiObjectId.objectId().optional(),
        sport_id: Joi.string().optional(),
        series_id: Joi.string().optional(),
        match_id: Joi.string().optional(),
        market_id: Joi.string().optional(),
        market_name: Joi.string().optional(),
        selection_id: Joi.number().optional(),
        selection_name: Joi.string().optional(),
        winner_name: Joi.string().optional(),
        is_abandoned: Joi.number().valid(0, 1).optional(),
        bet_result_id: Joi.optional(),
        createdAt: Joi.string().optional()
      }).optional(),
      limit: Joi.number().min(10).max(100).default(50).optional(),
      page: Joi.number().min(1).max(100).default(1).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        if (params)
          if (params.hasOwnProperty("search"))
            if (params.search.hasOwnProperty("_id"))
              params["search"]["_id"] = ObjectId(params["search"]["_id"]);
        if (req.path.includes("pending-markets"))
          params["pendingMarkets"] = 1;
        if (req.path.includes("results-rollback"))
          params["resultsRollback"] = 1;
        return marketService.results(params).then(result => {
          if (result.statusCode == NOT_FOUND || !result.data.length)
            return ResError(res, { status: true, msg: result.data, data: [] });
          else if (result.statusCode == SERVER_ERROR)
            return ResError(res, { msg: result.data });
          return ResSuccess(res, { data: result.data[0] });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  pendingMarkets(req, res) {
    return module.exports.results(req, res);
  },
  getMarketAgentUserPositions: function (req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      market_id: Joi.string().required(),
      master_book: Joi.boolean().optional(),
      user_book: Joi.boolean().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        let { user_id } = params, parents, parent_id, user_name, user_type_id;
        if (!user_id) {
          user_id = ObjectId(req.User.user_id || req.User._id);
          parent_id = req.User.parent_id;
          user_name = req.User.user_name;
          user_type_id = req.User.user_type_id;
          parents = req.User.parent_level_ids.map(data => data.user_id);
        } else {
          user_id = ObjectId(user_id);
          parent_id = req.user.parent_id;
          user_name = req.user.user_name;
          user_type_id = req.user.user_type_id;
          parents = req.user.parent_level_ids.map(data => data.user_id);
        }
        params.user_id = user_id;
        params.parent_id = parent_id;
        params.user_type_id = user_type_id;
        return marketService.getMarketAgentUserPositions(params, parents).then(result => {
          if (result.statusCode != SUCCESS)
            return ResError(res, { user_name, parent_id, msg: result.data });
          return ResSuccess(res, { user_name, parent_id, data: result.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      })
  },
  getRawEvents: function (req, res) {
    return Joi.object({
      event: Joi.string().valid().required(),
      filter: Joi.object().required(),
      projection: Joi.alternatives().try(Joi.object(), Joi.array()),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ event, filter, projection }) => {
        Models = { match: Match, market: Market };
        if (!Object.keys(filter).length)
          return ResError(res, { msg: "Value is required!", statusCode: STATUS_422 });
        return Models[event].findOne(filter, projection).then(event => {
          if (event)
            return ResSuccess(res, { data: event });
          return ResError(res, { msg: event + " data not found!" });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  getResult: function (req, res) {
    return Joi.object({
      market_id: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        return marketService.getResult(data).then(result => {
          if ([NOT_FOUND, REMOVED].includes(result.statusCode))
            return ResError(res, { msg: result.data });
          return ResSuccess(res, { data: result.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  diamondUserBook(req, res) {
    return marketService.diamondUserBook(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, result.data))
      .catch(error => ResError(res, error));
  },
}