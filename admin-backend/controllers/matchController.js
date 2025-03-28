const { isFetchDataFromForMarketDB } = require('../../utils/index');

const moment = require('moment')
  , axios = require('axios')
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ObjectId } = require("bson")
  , getCurrentLine = require('get-current-line')
  , Responder = require('../../lib/expressResponder')
  , publisher = require("../../connections/redisConnections")
  , Sports = require('../../models/sports')
  , Series = require('../../models/series')
  , match = require('../../models/match')
  , Match = require('../../models/match')
  , market = require('../../models/market')
  , Market = require('../../models/market')
  , Fancy = require('../../models/fancy')
  , CountryWiseSettings = require('../../models/countryWiseSettings')
  , TvAndScoreboardSetting = require('../../models/tvAndScoreboardUrlSetting')
  , userService = require('../service/userService')
  , sportService = require('../service/sportService')
  , seriesService = require('../service/seriesService')
  , matchService = require('../service/matchService')
  , marketService = require('../service/marketService')
  , apiUrlSettingsService = require('../service/apiUrlSettingsService')
  , marketCreateRunners = require('../../utils/marketCreateRunners')
  , utils = require('../../utils')
  , CONSTANTS = require('../../utils/constants')
  , { STATUS_400, STATUS_401, STATUS_403, STATUS_404, STATUS_422, STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')
  , { ResSuccess, ResError } = require('../../lib/expressResponder')
  , { SocSuccess, SocError } = require('../../lib/socketResponder')
  , {
    SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_SUPER_ADMIN,
    LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID
  } = require("../../utils/constants")
  , { getSeriesName, getSportName, blockEvent, getMarketType } = utils;
let { createMarketRunners } = marketCreateRunners;
const events = ['homeMatches', 'homeMatchesRunners', "matchDetails"]
  , subscribe_event = "subscribe_event", unsubscribe_event = "unsubscribe_event", set_unset_markets = "set_unset_markets"
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig');

module.exports = class MatchController {

  constructor(io) {
    io.on('connection', function (socket) {
      socket.on(subscribe_event, (data) => subscribe_unsubscribe(socket, subscribe_event, data));
      socket.on(unsubscribe_event, (data) => subscribe_unsubscribe(socket, unsubscribe_event, data));
      socket.on(set_unset_markets, data => {
        Joi.object({
          centralIds: Joi.array().items({
            market_id: Joi.string().trim().optional(),
            market_name: Joi.string().trim().required(),
            centralId: Joi.string().trim().required(),
            action: Joi.string().default("set").valid("set", "unset").trim().optional()
          }).min(1).max(300).required(),
        }).validateAsync(data, { abortEarly: false })
          .then(async ({ centralIds }) => {
            const { have_admin_rights } = socket.User;
            if (have_admin_rights) {
              publisher.publish(set_unset_markets, JSON.stringify(centralIds)).then().catch();
              io.to(socket.id).emit("success", SocSuccess(`Event(s) added successfully...`));
            } else
              io.to(socket.id).emit("error", SocError({ msg: "You are not permitted to do this action!" }));
          }).catch(error => io.to(socket.id).emit("error", SocError(error)));
      });
      for (var i in events) {
        (function (e) {
          socket.on(e, function (data) {
            MatchController[e]({
              isSocketCall: 1,
              User: socket.User,
              body: data,
              socket,
              event: e
            });
          });
        })(events[i]);
      }
    });
    function subscribe_unsubscribe(socket, eventType, data) {
      Joi.object({
        eventIds: Joi.array().min(1).max(300).required(),
      }).validateAsync(data, { abortEarly: false })
        .then(({ eventIds }) => {
          if (eventType == subscribe_event)
            socket.join(eventIds);
          else if (eventType == unsubscribe_event)
            eventIds.map(event => socket.leave(event));
          io.to(socket.id).emit("success", SocSuccess({ msg: `Event(s) ${eventType.replace("_event", " ")} successfully...`, event_code: eventType }));
        }).catch(error => {
          io.to(socket.id).emit("error", SocError(error));
        });
    }
  }

  static async createMatch(req, res) {
    const createMatchSchema = Joi.object({
      sport_id: Joi.string().required(),
      series_id: Joi.string().required(),
      match_id: Joi.string().required(),
      match_date: Joi.string().required(),
      is_manual: Joi.number().valid(0, 1),
      name: Joi.string().required(),
      // market parameters.
      market_id: Joi.string().optional(),
      market_name: Joi.string().optional(),
      runners: Joi.array().optional(),
    });
    try {
      await createMatchSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.error(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }
    try {
      let {
        series_id, sport_id, match_id,
        name, match_name = name,
        is_manual = is_manual || '0',
        match_date = moment(match_date).format('YYYY-MM-DD H:mm:ss'),
        start_date = match_date, market_name, market_id, runners
      } = req.body;

      let isSportDataExists = await sportService.isSportDataExists(sport_id);

      if ([NOT_FOUND, SERVER_ERROR].includes(isSportDataExists.statusCode)) {
        return ResError(res, { msg: isSportDataExists.data });
      }

      isSportDataExists = isSportDataExists.data;

      if (isSportDataExists.is_active == 0 || isSportDataExists.is_visible == false) {
        return ResError(res, { msg: "Sport are not active or visible yet!" });
      }

      let isSeriesDataExists = await seriesService.isSeriesDataExists(series_id);

      if ([NOT_FOUND, SERVER_ERROR].includes(isSeriesDataExists.statusCode)) {
        return ResError(res, { msg: isSeriesDataExists.data });
      }

      isSeriesDataExists = isSeriesDataExists.data;

      if (isSeriesDataExists.is_active == 0 || isSeriesDataExists.is_visible == false) {
        return ResError(res, { msg: "Series are not active or visible yet!" });
      }

      let checkMatchExist = await matchService.isMatchDataExists(match_id);

      if (checkMatchExist.statusCode == SUCCESS) {
        await matchService.updateMatchMarketDateTime(req);
        return ResError(res, { msg: "Match data already exists!" });
      }

      let sport_name = await getSportName(sport_id)

      let series_name = await getSeriesName(series_id);

      let matchModel = await new match(Object.assign(req.body, {
        sport_name, series_name, name, match_name, is_manual, match_date, start_date
      })).save();

      // Here we update the series createdAt date, which will help us prevent updating older series in the event limit API.
      Series.findOneAndUpdate({ series_id }, { createdAt: moment() }, { timestamps: false }).then().catch(console.error);

      let marketsName = [], marketCreateResponse = [];
      try {
        if (market_id == undefined && market_name == undefined && runners == undefined) {
          try {
            let onlineMarketLists = [];
            let onlineMarketRes = await axios.get(await apiUrlSettingsService.getMatchMarketsUrl() + match_id, { timeout: 3000 });
            onlineMarketLists = onlineMarketRes.data;
            if (!Array.isArray(onlineMarketLists))
              onlineMarketLists = [];
            if (onlineMarketLists.length) {
              onlineMarketLists = onlineMarketLists[0].markets;
              if (onlineMarketLists != undefined) {
                if (onlineMarketLists.length) {
                  let marketIds = [], centralIds = [], bookmaker_count = 0;
                  let isOneIsManual = {};
                  for (const onlineMarketList of onlineMarketLists) {
                    let bk_ly = [];
                    for (let index = 1; index <= 3; index++) {
                      bk_ly.push({
                        "size": "--",
                        "price": "--"
                      });
                    }
                    let marketMeta = getMarketType({ marketName: onlineMarketList.marketName })
                      , market_type = marketMeta.market_type
                      , market_order = marketMeta.market_order;
                    let marketData = {
                      sport_id, sport_name, series_id, series_name, match_id, match_name,
                      market_id: onlineMarketList.marketId,
                      marketId: onlineMarketList.marketId,
                      name: onlineMarketList.marketName,
                      market_name: onlineMarketList.marketName,
                      market_type,
                      market_order,
                      centralId: onlineMarketList.centralId,
                      country_code: onlineMarketList?.countryCode,
                      is_manual: onlineMarketList?.isManual,
                      match_date,
                      market_start_time: onlineMarketList?.marketStartTime,
                      venue: onlineMarketList?.venue,
                      runners: createMarketRunners(onlineMarketList.marketId, onlineMarketList.runners)
                    };

                    // https://trello.com/c/9Z9ScyWK/131-the-tied-market-rates-will-fetch-directly-from-live-apis
                    if (market_type == CONSTANTS.TIED_MATCH_TYPE
                      || market_type == CONSTANTS.COMPLETED_MATCH_TYPE) {
                      marketData["cron_inplay"] = true;
                    }

                    if (sport_id == CONSTANTS.HR && onlineMarketList.marketName.toLowerCase().includes(CONSTANTS.TO_BE_PLACED.toLocaleLowerCase())) {
                      try {
                        const apiRes = await axios.get(CONSTANTS.GET_ODDS_API_DELAY + onlineMarketList.marketId,
                          { timeOut: 2000 });
                        if (apiRes.data.length) {
                          const numberOfWinners = apiRes.data[0].numberOfWinners;
                          marketData["no_of_winners"] = numberOfWinners;
                        }
                      } catch (err) {
                        marketData["no_of_winners"] = 3;
                      }
                    }

                    if (onlineMarketList?.isManual == '1') {
                      marketData["cron_inplay"] = true;
                      if (onlineMarketList.marketName == CONSTANTS.BOOKMAKER) {
                        isOneIsManual = {
                          market_id: onlineMarketList.marketId,
                          marketId: onlineMarketList.marketId,
                          market_name: CONSTANTS.BOOKMAKER,
                          market_type: CONSTANTS.BOOKMAKER_TYPE
                        }
                      }
                    }

                    let market_object = await new market(marketData);
                    if (onlineMarketList.marketName == 'Match Odds' || onlineMarketList.marketName == 'Winner') {
                      let marketDataForMatch = {
                        market_id: marketData.market_id,
                        marketId: marketData.market_id,
                        market: market_object._id,
                        market_name: marketData.name,
                        market_type: marketData.market_type,
                        centralId: marketData.centralId,
                        country_code: marketData?.country_code,
                        runners: marketData.runners
                      };

                      if (onlineMarketList?.isManual == '1') {
                        marketDataForMatch["cron_inplay"] = true;
                      }

                      if ([CONSTANTS.HR, CONSTANTS.GHR].includes(sport_id)) {
                        let eventSettingsByCountryWise = await CountryWiseSettings
                          .findOne({ sport_id, country_code: marketDataForMatch.country_code })
                          .select("-_id -country_code -sport_id")
                          .lean();
                        if (eventSettingsByCountryWise) {
                          Object.assign(marketDataForMatch, eventSettingsByCountryWise);
                        }
                      }
                      await match.findByIdAndUpdate(matchModel._id, marketDataForMatch);
                      market_object.save();
                    } else
                      market_object.save();
                    marketsName.push(onlineMarketList.marketName);
                    marketCreateResponse.push({
                      market_id: onlineMarketList.marketId,
                      market_name: onlineMarketList.marketName,
                      centralId: onlineMarketList.centralId,
                      action: "set"
                    });
                    marketIds.push(onlineMarketList.marketId);
                    if (onlineMarketList.centralId)
                      centralIds.push(onlineMarketList.centralId);

                    let IsBookmaker = (new RegExp('bookmaker')).test(onlineMarketList.marketName.toLocaleLowerCase());
                    if (IsBookmaker) {
                      bookmaker_count++;
                    }

                    marketService.setTWTTRates(onlineMarketList);

                  }

                  if (sport_id == CONSTANTS.CRICKET && isOneIsManual?.market_id) {
                    await match.findByIdAndUpdate(matchModel._id, isOneIsManual);
                  }
                  if (marketIds.length)
                    await match.findByIdAndUpdate(matchModel._id, { marketIds, centralIds, bookmaker_count });
                } else {
                  await match.findByIdAndRemove(matchModel._id);
                  return ResError(res, { msg: "Something went wrong in Market(Match Odds) creation : Third party api provider issue(runners) there!" });
                }
              } else {
                await match.findByIdAndRemove(matchModel._id);
                return ResError(res, { msg: "Something went wrong in Market(Match Odds) creation : Third party api provider issue there!" });
              }
            } else {
              await match.findByIdAndRemove(matchModel._id);
              return ResError(res, { msg: `Error to create market, Api's gives empty list ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` });
            }
          } catch (error) {
            await match.findByIdAndRemove(matchModel._id);
            return ResError(res, { msg: "Something went wrong in Market(Match Odds) creation : " + error.message, statusCode: STATUS_500 });
          }
        } else {
          if (market_id && market_name && Array.isArray(runners))
            await new market(
              (
                (
                  { sport_id, sport_name, series_id, series_name, match_id, match_name, market_id, name, market_name, runners, is_manual }
                ) =>
                (
                  { sport_id, sport_name, series_id, series_name, match_id, match_name, market_id, name, market_name, runners, is_manual }
                )
              )
                (Object.assign(req.body, { name: market_name }))
            ).save();
          else {
            await match.findByIdAndRemove(matchModel._id);
            return ResError(res, { msg: "Something went wrong in Market(Match Odds) creation : some parameters is missing!" });
          }
        }
      } catch (error) {
        await match.findByIdAndRemove(matchModel._id);
        return ResError(res, { msg: "Something went wrong in Market(Match Odds) creation : " + error.message, statusCode: STATUS_500 });
      }
      req.IO.emit(match_id + "_new_market_added", SocSuccess({
        msg: "Match added...",
        hasData: true,
        data: marketCreateResponse
      }));
      return ResSuccess(res, { msg: `Match & Market(${marketsName.toString()}) created successfully...`, data: marketCreateResponse });
    } catch (error) {
      return ResError(res, { msg: "Something went wrong in match creation : " + error.message, statusCode: STATUS_500 });
    }
  }

  static async updateMatchStatus(req, res) {
    let { match_id, is_active, user_id } = req.body;
    let enterSuperAdminBlock = true, isBlockByParentRequest = false;
    if (user_id) {
      enterSuperAdminBlock = false, isBlockByParentRequest = true;
      user_id = ObjectId(user_id);
    }
    if (!user_id)
      user_id = req.User.user_id;
    let loggedInUserDetails = await userService.getUserByUserId({ _id: user_id }, { user_type_id: 1 });
    if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
      return ResError(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` });
    loggedInUserDetails = loggedInUserDetails.data;
    let user_type_id = loggedInUserDetails.user_type_id;
    if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN && enterSuperAdminBlock) {
      let updateMatchStatusFromDB = await matchService.updateMatchStatus(match_id, is_active);
      if (updateMatchStatusFromDB.statusCode === CONSTANTS.SUCCESS) {
        let markets = [];
        if (!is_active) {
          markets = await marketService.getMarketDetails({ match_id }, ["-_id", "centralId", "market_id", "market_name"]).then(data => data);
          if (markets.statusCode == SUCCESS) {
            markets = markets.data.map(data => (data.action = "unset", data));
          } else markets = [];
        }
        req.IO.emit(match_id + "_new_market_added", SocSuccess({
          msg: "Match updated...",
          hasData: true,
          data: markets
        }));
        let msg = is_active == 1 ? "Match activated successfully..." : "Match deactivated successfully..."
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return ResSuccess(res, { msg: msg, data: markets });
      } else if (updateMatchStatusFromDB.statusCode === CONSTANTS.NOT_FOUND)
        return ResError(res, { msg: 'Match not found! please create it first...' });
      else if (updateMatchStatusFromDB.statusCode === CONSTANTS.ALREADY_EXISTS) {
        let msg = `Match already ${is_active == 1 ? 'activated' : 'de-activated'}...`
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return ResError(res, { msg: msg });
      }
      else {
        return ResError(res, { msg: 'Error while updating match status! ' + updateMatchStatusFromDB.data });
      }
    } else {
      let userData = { user_id, match_id };
      let datafromService = await matchService.getDeactiveMatch(userData);
      if (isBlockByParentRequest) { // Block when child already have deactived its match.
        if (datafromService.statusCode == CONSTANTS.SUCCESS) {
          if (!datafromService.data.block_by_parent) {
            let updateCondition = { block_by_parent: 1, blocker_parent_id: req.User.user_id || req.User._id };
            await matchService.updateDeactiveMatch(datafromService.data._id, updateCondition);
            let msg = 'Child(s) match block successfully...'
            // Update activity log status.
            updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
            return ResSuccess(res, { msg: msg });
          }
        }
      }
      if (datafromService.statusCode === CONSTANTS.SUCCESS) {
        let deleteDeactiveMatch = await matchService.deleteDeactiveMatch(userData);
        if (deleteDeactiveMatch.statusCode === CONSTANTS.SUCCESS) {
          let msg = `Child(s) match ${isBlockByParentRequest ? 'un-blocked' : 'activated'} successfully...`
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return ResSuccess(res, { msg: msg });
        }
        else
          return ResError(res, { msg: `An Error Occurred ! ${user_type_id == 0 ? ',' + datafromService.data : ''}` });
      } else if (datafromService.statusCode === CONSTANTS.NOT_FOUND) {
        if (isBlockByParentRequest)
          Object.assign(userData, { block_by_parent: 1, blocker_parent_id: req.User.user_id || req.User._id });
        let createDeactiveMatch = await matchService.createDeactiveMatch(userData);
        if (createDeactiveMatch.statusCode === CONSTANTS.SUCCESS) {
          let msg = `Child(s) match ${isBlockByParentRequest ? 'Blocked' : 'deactivated'} successfully...`
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return ResSuccess(res, { msg: msg });
        }
        else {
          return ResError(res, { msg: `An Error Occurred ! ${user_type_id == 0 ? ',' + datafromService.data : ''}` });
        }
      } else
        return ResError(res, { msg: `An Error Occurred ! ${user_type_id == 0 ? ',' + datafromService.data : ''}` });
    }
  }

  static async getOnlineMatch(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      sport_id: Joi.string().optional(),
      series_id: Joi.string().optional(),
      include_count: Joi.boolean().default(false).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async body => {
        let { sport_id, series_id, user_id, include_count } = body, user_type_id, NAME, PARENT_LEVEL_IDS = [];

        const isListOnly = req.path.includes('getCountryCodeListOnly');
        if (req.path == '/getCountryCodeListOpen') {
          return MatchController.getCountryCodeListOpen(req, res, body);
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
        if (!isListOnly && user_type_id == USER_TYPE_SUPER_ADMIN) {
          // if super admin logged in.
          let onlineSeriesRes = [];
          try {
            onlineSeriesRes = await axios.get(await apiUrlSettingsService.getMatchesUrl() + series_id, { timeout: 3000 });
            onlineSeriesRes = onlineSeriesRes.data;
            if (!Array.isArray(onlineSeriesRes))
              onlineSeriesRes = [];
          } catch (error) { onlineSeriesRes = []; }
          // parse api data according to db columns.
          onlineSeriesRes = onlineSeriesRes.map(element => {
            return {
              sport_id, series_id,
              match_id: element.event.id,
              name: element.event.name,
              match_name: element.event.name,
              is_manual: parseInt(element.is_manual) || parseInt(element.event.is_manual) || 0,
              match_date: element.event.openDate, centralId: element.event.centralID,
              is_created: 0, is_active: 0, is_visible: 0, inplay: false,
              market_count: element.marketCount || element.event.marketCount || "0",
            }
          });
          var today = new Date();
          today.setDate(today.getDate() - 3);
          let Filter = { series_id };
          if (![LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(sport_id))
            Filter["match_date"] = {
              "$gte": today //new Date((new Date().getTime() - (4 * 24 * 60 * 60 * 1000)))
            };
          let getAllMatchesFromDB = await matchService.getAllMatches(Filter, {
            _id: 0, sport_id: 1, series_id: 1, match_id: 1, name: 1, match_scoreboard_url: 1,
            match_date: 1, is_manual: 1, is_active: 1, is_visible: 1, match_tv_url: 1, country_code: 1,
            is_created: 1, enable_fancy: 1, match_name: 1, inplay: 1, is_lock: 1, centralId: 1
          });
          if (!onlineSeriesRes.length && getAllMatchesFromDB.statusCode == SUCCESS)
            if (!getAllMatchesFromDB.data.length)
              return ResError(res, { dataIs: NAME, msg: "nothing yet in API and DB!" });
          if ([LIVE_GAME_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(sport_id))
            onlineSeriesRes = [];
          if (onlineSeriesRes.length) { //If api have some matches
            let finalApiDbMatchesList = [], finalApiMatchesList = [];
            getAllMatchesFromDB = JSON.parse(JSON.stringify(getAllMatchesFromDB.data));
            onlineSeriesRes.map(apiData => {
              let getMergedMatches = getAllMatchesFromDB.find(dbData => dbData.match_id == apiData.match_id);
              if (getMergedMatches != undefined)
                finalApiDbMatchesList.push({
                  ...apiData, ...getMergedMatches
                });
              else
                finalApiMatchesList.push({ ...apiData });
            });
            return ResSuccess(res, { dataIs: NAME, msg: `${finalApiMatchesList.length} API, ${finalApiDbMatchesList.length} DB : matches found.`, data: [...finalApiDbMatchesList, ...finalApiMatchesList] });
          } else {
            // if DB have some matches
            if (getAllMatchesFromDB.statusCode == SUCCESS)
              return ResSuccess(res, { dataIs: NAME, msg: `${getAllMatchesFromDB.data.length} matches found in DB`, data: getAllMatchesFromDB.data });
            else if ([NOT_FOUND, SERVER_ERROR].includes(getAllMatchesFromDB.statusCode))
              return ResError(res, { dataIs: NAME, msg: NOT_FOUND == getAllMatchesFromDB.statusCode ? "No Matches available yet!" : `Error while getting matches from db : ${getAllMatchesFromDB.data}` });
          }
          return ResError(res, { dataIs: NAME, msg: "Nothing happened at this moment!" });
        } else {
          const { sports_permission } = (req.user || req.User);
          PARENT_LEVEL_IDS = PARENT_LEVEL_IDS.map(data => data.user_id.toString());
          let filter = { sports_permission, series_id, sport_id, path: req.path, is_loggedin: true, include_count };
          if (![LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID].includes(sport_id)) {
            var today = new Date();
            today.setDate(today.getDate() - 3);
            filter["today"] = today;
          }
          return matchService.getMatch(filter)
            .then(async events => {
              if (events.statusCode == SUCCESS) {
                let finalEventList = events.data;
                blockEvent({ finalEventList, user_id, is_self_view, PARENT_LEVEL_IDS });
                finalEventList = finalEventList.map(
                  ({ sport_id, name, match_id, is_active, match_date, country_code, match_count }) => ({
                    sport_id, name, match_id, is_active, match_date, country_code, match_count
                  })
                ).filter(data => data);
                return ResSuccess(res, {
                  dataIs: { user_id, name: NAME }, loggedIn: { user_id: req.User.user_id, name: `${req.User.name}(${req.User.user_name})` },
                  data: finalEventList, msg: `${finalEventList.length} match(s) found...`,
                });
              } else
                return ResError(res, { msg: "No match(s) available yet!" });
            });
        }
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static async getCountryCodeListOpen(req, res, { sport_id, series_id }) {
    var today = new Date();
    today.setDate(today.getDate() - 3);
    return matchService.getMatch({ series_id, today, sport_id, path: req.path })
      .then(async events => {
        if (events.statusCode == SUCCESS) {
          let finalEventList = events.data;
          finalEventList = finalEventList.map(
            ({ sport_id, name, match_id, is_active, match_date, country_code }) => ({ sport_id, name, match_id, is_active, match_date, country_code })
          ).filter(data => data);
          return ResSuccess(res, {
            data: finalEventList, msg: `${finalEventList.length} country(s) found...`,
          });
        } else
          return ResError(res, { msg: "No match(s) available yet!" });
      });
  }

  static async homeMatches(req, res) {

    if (isFetchDataFromForMarketDB()) {
      req.functionName = 'homeMatches';
    } else {
      req.functionName = 'homeMatchesV2';

      if (req.method == "GET") {
        res.setHeader("Cache-Control", "public, max-age=30");
      }
    }

    // Validate & Fetch Data and return
    return matchService.homeMatchesDetailsMain(req, res);
  }

  static async homeMatchesV2(req, res) {
    req.functionName = 'homeMatchesV2';
    // Validate & Fetch Data and return
    if (req.method == "GET") {
      res.setHeader("Cache-Control", "public, max-age=30");
    }
    return matchService.homeMatchesDetailsMain(req, res);
  }

  static async homeMatchesRunners(req, res) {
    req.body.only_runners = 1;
    return MatchController.homeMatches(req, res);
  }

  static async homeMatchesRunnersV2(req, res) {
    req.body.only_runners = 1;
    return MatchController.homeMatchesV2(req, res);
  }

  static async matchDetails(req, res) {
    if (isFetchDataFromForMarketDB()) {
      req.functionName = 'matchDetails';
    } else {
      req.functionName = 'matchDetailsV2';
    }

    // Validate & Fetch Data and return
    return matchService.homeMatchesDetailsMain(req, res);
  }

  static async matchDetailsV2(req, res) {
    req.functionName = 'matchDetailsV2';

    // Validate & Fetch Data and return
    return matchService.homeMatchesDetailsMain(req, res);
  }

  static async matchDetailsCombine(req, res) {
    req.body.combine = true;
    return MatchController.matchDetails(req, res);
  }

  static async matchDetailsCombineV2(req, res) {
    req.body.combine = true;
    return MatchController.matchDetailsV2(req, res);
  }

  static async matchDetailsRunners(req, res) {
    req.body.only_runners = 1;
    return MatchController.matchDetails(req, res);
  }

  static async matchDetailsRunnersV2(req, res) {
    req.body.only_runners = 1;
    return MatchController.matchDetailsV2(req, res);
  }

  static async open(req, res) {
    let service;

    const isFetchFromDB = isFetchDataFromForMarketDB();

    if (req.path == "/matchDetailsOpen") {
      service = isFetchFromDB
        ? matchService.matchDetailsOpen(req.body)
        : matchService.matchDetailsV2({ ...req.joiData, path: req.path });
    } else if (req.path == "/matchDetailsOpenV2") {
      service = matchService.matchDetailsV2({ ...req.joiData, path: req.path });
    } else {
      service = isFetchFromDB
        ? matchService.homeMatchesOpen(req.joiData)
        : matchService.homeMatchesOpenV2(req.joiData);
    }

    return service
      .then(getUserDetailsFromDB => {
        if (getUserDetailsFromDB.statusCode === CONSTANTS.SUCCESS)
          return ResSuccess(res, { data: getUserDetailsFromDB.data });
        else
          return ResSuccess(res, { data: [] });
      }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static async homeMatchesOpen(req, res) {
    return MatchController.open(req, res);
  }

  static async matchesList(req, res) {
    req.body.matchesList = true;
    return MatchController.open(req, res);
  }

  static async matchesListForFancy(req, res) {
    return matchService.matchesListForFancy()
      .then(getUserDetailsFromDB => {
        if (getUserDetailsFromDB.statusCode === CONSTANTS.SUCCESS)
          return ResSuccess(res, { data: getUserDetailsFromDB.data });
        else
          return ResError(res, { data: [] });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static async matchDetailsOpen(req, res) {
    MatchController.open(req, res);
  }

  static enableFancy(req, res) {
    return Joi.object({
      match_id: Joi.string().required(),
      enable_fancy: Joi.number().valid(0, 1).default(0).required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ match_id, enable_fancy }) => {
        if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN)
          return ResError(res, { msg: "You are not an administrator!" });
        return Match.updateOne({ match_id }, { enable_fancy }).then(match => {
          if (!match.matchedCount)
            return ResError(res, { msg: "Match not found!" });
          if (!enable_fancy) {
            Fancy.updateMany(
              { match_id, is_active: 1 },
              { $set: { is_active: 0 } }
            ).then().catch(console.error);
          }
          return ResSuccess(res, "Fancy is" + (enable_fancy ? " enable " : " disable ") + "successfully...");
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error)
      });
  }

  static makeFavourite(req, res) {
    return Joi.object({
      match_id: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ match_id }) => {
        return Match.findOne({ match_id }).select("my_favorites")
          .then(match => {
            if (!match)
              return ResError(res, { msg: "Match not found!" });
            if (JSON.parse(JSON.stringify(match)).hasOwnProperty("my_favorites")) {
              let user_id = (req.User.user_id || req.User._id)
              let msg = "Market added in favourites!";
              if (match.my_favorites.length) {
                if (match.my_favorites.includes(user_id)) {
                  match.my_favorites.pull(user_id);
                  msg = "Market removed from favourites!";
                } else
                  match.my_favorites.push(user_id);
                match.save();
                return ResSuccess(res, { msg });
              }
              match.my_favorites.push(user_id);
              match.save();
              return ResSuccess(res, { msg });
            }
            return ResError(res, { msg: "Nothing to favourite yet!" });
          }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static matches(req, res) {
    return Joi.object({
      series_id: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        req.body.matches = true;
        return MatchController.open(req, res);
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getMatches(req, res) {
    return Joi.object({
      series_id: Joi.string().optional(),
      sport_id: Joi.string().optional(),
      today: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        if (req.User) {
          req.body.is_loggedin = true;
          req.body.sports_permission = req.User.sports_permission;
        }
        req.body.path = req.path;
        return matchService.getMatch(req.body)
          .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: "No match found." }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // Stop Casino
  static async stopCasino(req, res) {
    try {
      await Sports.updateOne({ sport_id: "-100" }, { is_visible: false });
      await Series.updateMany({ sport_id: "-100" }, { is_visible: false });
      await Match.updateMany({ sport_id: "-100" }, { is_visible: false });
      await Market.updateMany({ sport_id: "-100" }, { is_visible: false });
      return ResSuccess(res, { msg: "Casino de-activated..." });
    } catch (error) {
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  }

  static updateTVandScoreBoardURL(req, res) {
    try {
      matchService.updateTVandScoreBoardURL().then().catch(console.error);
      return ResSuccess(res, { msg: "Updating matches scoreboard & TV url's is under process..." });
    } catch (error) {
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  }

  static flushCache(req, res) {
    return matchService.flushCache(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, error));
  }

  static updateTVandScoreBoardURLV1(req, res) {
    try {
      matchService.updateTVandScoreBoardURLV1().then().catch(console.error);
      return ResSuccess(res, { msg: "Updating matches scoreboard & TV url's is under process..." });
    } catch (error) {
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  }

  static async homeMatchesLineMarketOpen(req, res) {
    req.body.is_line_market = 1;
    return MatchController.open(req, res);
  }

  static async matchDetailsLineMarket(req, res) {
    req.body.is_line_market = 1;
    return MatchController.matchDetails(req, res);
  }

  static async getTvUrlScoreboardUrl(req, res) {
    try {
      // Retrieve the document from the MongoDB collection based on the match ID
      const domainName = getMainDomain(req.hostname);
      const match = await TvAndScoreboardSetting.findOne({ "match_id": req.body.match_id });
      if (!match) {
        return ResError(res, { msg: "No data found.", statusCode: STATUS_200 });
      }
      // Check if the provided domain name exists in the domains array
      const domainExists = match.domains.includes(domainName);
      let tvUrl;
      if (domainExists) {
        tvUrl = match.premimum_match_tv_url;
      } else {
        tvUrl = match.non_premimum_match_tv_url;
      }
      // Return the complete document
      let resData = {
        match_scoreboard_url: match.match_scoreboard_url,
        tv_url: tvUrl
      };
      return ResSuccess(res, { data: resData });
    } catch (error) {
      return ResError(res, { msg: 'Internal server error', statusCode: STATUS_500 });
    }
  }

  static async resetTVandScoreBoardURL(req, res) {
    try {
      matchService.resetTVandScoreBoardURL().then().catch(console.error);
      return ResSuccess(res, { msg: "Reset matches scoreboard & TV url's." });
    } catch (error) {
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  }

}

// Function to extract main domain from subdomain
function getMainDomain(subdomain) {
  const parts = subdomain.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return subdomain;
}

let isSocketCall = (req) => {
  return req.hasOwnProperty("isSocketCall") ? req.isSocketCall : 0;
}

let errorResponse = (errorStack) => {
  return { msg: errorStack.map(data => data.message).toString() }
}