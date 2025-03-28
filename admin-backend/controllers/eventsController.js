const { ObjectId } = require("bson")
  , _ = require('lodash')
  , moment = require('moment')
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , { SocSuccess } = require('../../lib/socketResponder')
  , { SUCCESS, USER_TYPE_USER, HR, GHR, MATCH_ODDS_TYPE, CRICKET, MANUAL_CASINOS_IDS } = require('../../utils/constants')
  , VALIDATION = require('../../utils/validationConstant')
  , eventService = require('../service/eventService')
  , websiteService = require('../service/websiteService')
  , Sport = require('../../models/sports')
  , Series = require('../../models/series')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , Fancy = require('../../models/fancy')
  , User = require('../../models/user')
  , websiteSetting = require('../../models/websiteSetting')
  , CountryWiseSettings = require('../../models/countryWiseSettings')
  , TvAndScoreboardUrlSetting = require('../../models/tvAndScoreboardUrlSetting')
  , UserSettingWiseSport = require('../../models/userSettingWiseSport')
  , { STATUS_400, STATUS_401, STATUS_403, STATUS_422, STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_VALIDATION_FAILED, LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig');

module.exports = {
  getEvents: function (req, res) {
    return Joi.object({
      type: Joi.string().valid(
        "openBets", "settledBets", "eventsProfitLoss",
        "matchResult", "matchRollback", "viewBet"
      ).default("openBets").optional(),
      search: Joi.object({
        sport_id: Joi.string().optional(),
        sport_name: Joi.string().optional(),
        series_id: Joi.string().optional(),
        series_name: Joi.string().optional(),
        match_id: Joi.string().optional(),
        match_name: Joi.string().optional(),
        market_id: Joi.string().optional(),
        market_name: Joi.string().optional(),
        fancy_id: Joi.string().optional(),
        fancy_name: Joi.string().optional(),
        type: Joi.number().valid(1, 2).optional(),
      }).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      event_type: Joi.string().default("sports").valid("sports", "series", "matches", "events_m_f").optional(),
      include_casinos: Joi.boolean().default(false).optional(),
      only_casinos: Joi.boolean().optional(),
      isUserPanel: Joi.boolean().optional().default(false)
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        const user_id = ObjectId(req.User.user_id || req.User._id);
        data.user_id = user_id;
        return eventService.getEvents(data).then(events => {
          if (events.statusCode != SUCCESS)
            return ResError(res, { msg: events.data, data: [], statusCode: STATUS_200 });
          if (data.type == "viewBet")
            if (events.data.length)
              return ResSuccess(res, { data: events.data[0].runners });
          if (events.data.length)
            return ResSuccess(res, { data: events.data });
          return ResError(res, { msg: "No data found!", data: [], statusCode: STATUS_200 });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  fancyMatchLists: function (req, res) {
    return eventService.fancyMatchLists().then(events => {
      if (events.statusCode != SUCCESS)
        return ResError(res, { msg: events.data, data: [] });
      if (events.data.length)
        return ResSuccess(res, { total: events.data.length, data: events.data });
      return ResError(res, { msg: "No data found!", data: [] });
    }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  },
  getLimites: function (req, res) {
    return Joi.object({
      sport_id: Joi.string().optional(),
      series_id: Joi.string().optional(),
      match_id: Joi.string().optional(),
      market_id: Joi.string().optional(),
      fancy_id: Joi.string().optional(),
    }).or('sport_id', 'series_id', 'match_id', 'market_id', 'fancy_id').validateAsync(req.body, { abortEarly: false })
      .then(data => {
        const { series_id, match_id, market_id, fancy_id } = data;
        let projection = {
          _id: 1, sport_id: 1, series_id: 1, match_id: 1, fancy_id: 1, market_id: 1, market_live_odds_validation: 1, session_live_odds_validation: 1, volume_stake_enable: 1,
          min_volume_limit: 1, market_min_stack: 1, market_max_stack: 1, market_min_odds_rate: 1, market_max_odds_rate: 1, market_max_profit: 1, market_advance_bet_stake: 1,
          betting_will_start_time: 1, inplay_betting_allowed: 1, market_back_rate_range: 1, market_lay_rate_range: 1, unmatch_bet_allowed: 1, no_of_unmatch_bet_allowed: 1,
          market_bookmaker_min_odds_rate: 1, market_bookmaker_max_odds_rate: 1,
          inplay_max_volume_stake_0_10: 1, inplay_max_volume_stake_10_40: 1, inplay_max_volume_stake_40: 1,
          max_volume_stake_0_10: 1, max_volume_stake_10_40: 1, max_volume_stake_40: 1,
          session_min_stack: 1, session_max_stack: 1, session_max_profit: 1, is_back_bet_allowed: 1, is_lay_bet_allowed: 1,
        }, Model = series_id ? Series : match_id ? Match : market_id ? Market : fancy_id ? Fancy : Sport;
        return getModelData(Model, data, projection)
          .then(data => data ? ResSuccess(res, { data: { validations: VALIDATION, limites: data } }) : ResError(res, { msg: "No data found!" }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  updateLimites: function (req, res) {
    let customValidate = {}, isCategory = req?.body?.category;
    if (isCategory) customValidate = { match_id: Joi.string().required() };
    return Joi.object({
      sport_id: Joi.string().optional(),
      series_id: Joi.string().optional(),
      match_id: Joi.string().optional(),
      market_id: Joi.string().optional(),
      fancy_id: Joi.string().optional(),
      category: Joi.number().optional(),
      country_code: Joi.string().optional(),
      ...customValidate,

      values: Joi.object({
        // Market settings for sports
        /* market_min_stack , market_max_stack */
        market_min_stack: Joi.number()
          .min(VALIDATION.market_max_stack_min_limit)
          .max(VALIDATION.market_max_stack_max_limit)
          .optional()
          .label(
            `Enter valid(${VALIDATION.market_max_stack_min_limit} - ${VALIDATION.market_max_stack_max_limit}) minimum odds stack.`,
          ),
        market_max_stack: Joi.number()
          .min(VALIDATION.market_max_stack_min_limit)
          .max(VALIDATION.market_max_stack_max_limit)
          .optional()
          .label(
            `Enter valid(${VALIDATION.market_max_stack_min_limit} - ${VALIDATION.market_max_stack_max_limit}) [recommended : min ${VALIDATION.market_max_stack_min_limit} max ${VALIDATION.market_max_stack_max_limit}] maximum odds stack.`,
          ),

        /* market_min_odds_rate , market_max_odds_rate */
        market_min_odds_rate: Joi.number()
          .greater(VALIDATION.market_min_odds_rate)
          .max(VALIDATION.market_max_odds_rate).precision(2).optional()
          .label(
            `Enter valid(${VALIDATION.market_min_odds_rate} - ${VALIDATION.market_max_odds_rate}) minimum odds rate.`,
          ),

        market_max_odds_rate: Joi.number()
          .min(VALIDATION.market_min_odds_rate)
          .max(VALIDATION.market_max_odds_rate)
          .optional()
          .label(
            `Enter valid(${VALIDATION.market_min_odds_rate} - ${VALIDATION.market_max_odds_rate}) maximum odds rate.`,
          ),

        /* market_max_profit */
        market_max_profit: Joi.number()
          .min(0)
          .max(VALIDATION.market_max_profit_max_limit)
          .optional()
          .label(
            `Enter valid([0 Unlimited] - ${VALIDATION.market_max_profit_max_limit}) maximum market profit.`,
          ),

        /* market_advance_bet_stake */
        market_advance_bet_stake: Joi.number()
          .min(VALIDATION.market_advance_bet_stake_min_limit)
          .max(VALIDATION.market_advance_bet_stake_max_limit)
          .optional()
          .label(
            `Enter valid([${VALIDATION.market_advance_bet_stake_min_limit} Unlimited] - ${VALIDATION.market_advance_bet_stake_max_limit}) [recommended : min ${VALIDATION.market_advance_bet_stake_min_limit} max ${VALIDATION.market_advance_bet_stake}] advance market bet stake.`,
          ),

        // Session settings for sports
        /* session_min_stack , session_max_stack */
        session_min_stack: Joi.number()
          .min(VALIDATION.session_min_stack)
          .max(VALIDATION.session_max_stack)
          .optional()
          .label(
            `Enter valid(${VALIDATION.session_min_stack} - ${VALIDATION.session_max_stack}) minimum session stack.`,
          ),
        session_max_stack: Joi.number()
          .min(VALIDATION.session_min_stack)
          .max(VALIDATION.session_max_stack_max_limit)
          .optional()
          .label(
            `Enter valid(${VALIDATION.session_min_stack} - ${VALIDATION.session_max_stack_max_limit}) [recommended : min ${VALIDATION.session_min_stack} max ${VALIDATION.session_max_stack}] maximum session stack.`,
          ),

        /* session_max_profit */
        session_max_profit: Joi.number()
          .min(0)
          .max(VALIDATION.session_max_profit_max_limit)
          .optional()
          .label(
            `Enter valid([0 Unlimited] - ${VALIDATION.session_max_profit_max_limit}) maximum session profit.`,
          ),

        is_lock: Joi.boolean().optional(),

        inplay: Joi.boolean().optional(),

        market_live_odds_validation: Joi.boolean().optional(),
        session_live_odds_validation: Joi.boolean().optional(),

        volume_stake_enable: Joi.boolean().optional(),
        min_volume_limit: Joi.number().min(0).optional(),

        betting_will_start_time: Joi.number().min(0).optional(),
        is_back_bet_allowed: Joi.boolean().optional(),
        is_lay_bet_allowed: Joi.boolean().optional(),

        inplay_betting_allowed: Joi.boolean().optional(),

        market_back_rate_range: Joi.number().precision(2).min(0).max(1).optional(),

        market_lay_rate_range: Joi.number().precision(2).min(0).max(1).optional(),

        unmatch_bet_allowed: Joi.boolean().optional(),
        no_of_unmatch_bet_allowed: Joi.number().optional(),

        market_bookmaker_min_odds_rate: Joi.number()
          .greater(VALIDATION.market_bookmaker_min_odds_rate)
          .max(VALIDATION.market_bookmaker_max_odds_rate).precision(2).optional()
          .label(`Enter valid(${VALIDATION.market_bookmaker_min_odds_rate} - ${VALIDATION.market_bookmaker_max_odds_rate}) minimum bookmaker odds rate.`),
        market_bookmaker_max_odds_rate: Joi.number()
          .min(VALIDATION.market_bookmaker_min_odds_rate)
          .max(VALIDATION.market_bookmaker_max_odds_rate).optional()
          .label(`Enter valid(${VALIDATION.market_bookmaker_min_odds_rate} - ${VALIDATION.market_bookmaker_max_odds_rate}) maximum bookmaker odds rate.`),

        inplay_max_volume_stake_0_10: Joi.number().min(0).optional(),
        inplay_max_volume_stake_10_40: Joi.number().min(0).optional(),
        inplay_max_volume_stake_40: Joi.number().min(0).optional(),

        max_volume_stake_0_10: Joi.number().min(0).optional(),
        max_volume_stake_10_40: Joi.number().min(0).optional(),
        max_volume_stake_40: Joi.number().min(0).optional(),

      })
        .or(
          "market_min_stack",
          "market_max_stack",
          "market_min_odds_rate",
          "market_max_odds_rate",
          "market_max_profit",
          "market_advance_bet_stake",
          "session_min_stack",
          "session_max_stack",
          "session_max_profit",
          "is_lock",
          "inplay",
          "volume_stake_enable",
          "min_volume_limit",
          "market_live_odds_validation",
          "session_live_odds_validation",
          "betting_will_start_time",
          "is_back_bet_allowed",
          "is_lay_bet_allowed",
          "inplay_betting_allowed",
          "market_back_rate_range",
          "market_lay_rate_range",

          "unmatch_bet_allowed",
          "no_of_unmatch_bet_allowed",

          "market_bookmaker_min_odds_rate",
          "market_bookmaker_max_odds_rate",

          "inplay_max_volume_stake_0_10",
          "inplay_max_volume_stake_10_40",
          "inplay_max_volume_stake_40",
          "max_volume_stake_0_10",
          "max_volume_stake_10_40",
          "max_volume_stake_40",
        )
        .required(),
    })
      .or(
        "sport_id",
        "series_id",
        "match_id",
        "market_id",
        "fancy_id",
        "country_code",
      )
      .validateAsync(req.body, { abortEarly: false })
      .then(async (data) => {

        const { values } = data;

        delete data.values;

        if (data.hasOwnProperty("market_id")) {

          // here we are updating the un-matched bet settings for sport_id 4 and market_type match odds only.
          if (values?.unmatch_bet_allowed != undefined
            || values?.no_of_unmatch_bet_allowed != undefined) {
            data.market_type = MATCH_ODDS_TYPE;
            data.sport_id = CRICKET;
          }

          return Market.updateMany(data, values)
            .then(() => {

              req.IO.emit(
                "events_limit_updated",
                SocSuccess({
                  msg: "Events limit is updated...",
                }),
              );
              let msg = "Market limit has been updated...";
              updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
              ResSuccess(res, { msg: msg });

            })
            .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));

        }

        if (data.hasOwnProperty("fancy_id")) {

          return Fancy.updateMany(data, values)
            .then(() => {

              req.IO.emit(
                "events_limit_updated",
                SocSuccess({
                  msg: "Events limit is updated...",
                }),
              );
              let msg = "Fancy limit has been updated...";
              updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
              ResSuccess(res, { msg: msg });
            })
            .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));

        }

        if (data.hasOwnProperty("country_code")) {

          let Models = [];

          if (!data?.sport_id) {
            let msg = "sport_id is required for updating this limit!";
            updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
            return ResError(res, { msg: msg });
          }

          if (![HR, GHR].includes(data.sport_id)) {
            let msg = "The provided sport_id is not allowed for this limit!";
            updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
            return ResError(res, { msg: msg });
          }

          data.is_active = 1;
          data.is_visible = true;

          Models.push(Match.updateMany(data, values));
          Models.push(
            Market.updateMany({ ...data, bet_result_id: null }, values),
          );

          return Promise.all(Models)
            .then(() => {

              req.IO.emit(
                "events_limit_updated",
                SocSuccess({
                  msg: "Events limit is updated...",
                }),
              );

              CountryWiseSettings.findOneAndUpdate(
                { sport_id: data.sport_id, country_code: data.country_code },
                values,
                { upsert: true, new: true, setDefaultsOnInsert: true }
              ).then().catch(console.error);
              let msg = "country code wise matches & markets limit has been updated...";
              updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
              ResSuccess(res, {
                msg: msg,
              });

            })
            .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));
        }

        // Unmatch bet only allowed for sport cricket.
        if (values?.unmatch_bet_allowed != undefined
          || values?.no_of_unmatch_bet_allowed != undefined) {
          if (data.sport_id != CRICKET) {
            let msg = "Unmatch bet setting only allowed for sport_id 4 (cricket) only!";
            updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
            return ResError(res, { msg: msg });
          }
        }

        let Models = [];

        let sport_id = data.hasOwnProperty("sport_id")
          ? data.sport_id
          : await getEventSportId(data);

        if (data.hasOwnProperty("sport_id")) {
          Models.push(Sport.updateOne(data, values));
        }

        if (data.hasOwnProperty("sport_id") || data.hasOwnProperty("series_id")) {

          let filter = { ...data };

          // Casinos not included
          if (!MANUAL_CASINOS_IDS.includes(sport_id)) {
            filter["createdAt"] = { "$gte": moment().subtract(1, 'months').toDate() };
          }

          Models.push(Series.updateMany(filter, values));
        }

        // Update data within 5 days of date.
        let pastDate = moment().subtract(5, 'days').toDate();

        if (
          data.hasOwnProperty("sport_id") ||
          data.hasOwnProperty("series_id") ||
          data.hasOwnProperty("match_id")
        ) {

          if (isCategory != undefined) {

            let session_category_limites = {}, { match_id } = data;
            session_category_limites["session_category_limites." + isCategory] = values;
            Models.push(Match.updateOne({ match_id }, { $set: session_category_limites }));

          }

          Models.push(Match.updateMany({ ...data, match_date: { "$gte": pastDate } }, values));
        }

        // data variable will only be modified just before markets settings are updating.
        if (values?.unmatch_bet_allowed != undefined
          || values?.no_of_unmatch_bet_allowed != undefined) {
          data.market_type = MATCH_ODDS_TYPE;
          data.sport_id = CRICKET;
        }

        Models.push(Market.updateMany({ ...data, match_date: { "$gte": pastDate }, bet_result_id: null }, values));

        // Only when sport id is belong to cricket.
        // In future the stock related sport id will be added.
        if ([CRICKET].includes(sport_id)) {
          Models.push(Fancy.updateMany({ ...data, match_date: { "$gte": pastDate }, bet_result_id: null }, values));
        }

        return Promise.all(Models)
          .then((result) => {

            req.IO.emit(
              "events_limit_updated",
              SocSuccess({
                msg: `Events limit is updated...`,
              }),
            );
            let msg = `All events(${result.reduce((acc, val) => acc + val.modifiedCount, 0)}) limit has been updated...`;
            updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
            return ResSuccess(res, {
              msg: msg,
            });

          })
          .catch((error) => ResError(res, { error, statusCode: STATUS_500 }));
      })
      .catch((error) => {
        if (error.hasOwnProperty("details")) {
          let msg = error.details.map((data) => data.message).toString();
          updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
          return ResError(res, {
            msg: msg,
          });
        }
        return ResError(res, error);
      });
  },
  getEventsLimit: function (req, res) {
    return Joi.object({
      sport_id: Joi.string().required(),
      match_id: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ sport_id, match_id }) => {
        return UserSettingWiseSport.findOne(
          { _id: req.User.userSettingSportsWise, "sports_settings.sport_id": sport_id },
          { _id: 0, check_event_limit: 1, 'sports_settings.$': 1 }
        ).then(userSettings => {
          userSettings = JSON.parse(JSON.stringify(userSettings));
          if (userSettings) {
            // if user self limit is enable which mean check_event_limit is false.
            if (userSettings.check_event_limit == false) {
              let sports_settings = userSettings.sports_settings[0], market_session_limites = {};
              market_session_limites["market"] = _.pick(
                sports_settings,
                [
                  'market_min_stack', 'market_max_stack', 'market_min_odds_rate', 'market_max_odds_rate', 'market_bet_delay',
                  'market_max_profit', 'market_advance_bet_stake', 'market_bookmaker_min_odds_rate', 'market_bookmaker_max_odds_rate'
                ]);
              if (sport_id == "4")
                market_session_limites["session"] =
                  _.pick(
                    sports_settings,
                    ['session_min_stack', 'session_max_stack', 'session_bet_delay', 'session_max_profit']
                  );
              return User.findOne({ _id: req.User._id }).select("-_id exposure_limit").lean()
                .then(user => ResSuccess(res, { msg: req.User.user_name + " Users events limites.", data: market_session_limites, check_event_limit: userSettings.check_event_limit, exposure_limit: user.exposure_limit }))
                .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
            }
            // if check_event_limit is true then we provide market & session limits.
            let Models = [
              Market.find({ sport_id, match_id })
                .select(
                  `-_id sport_name sport_id series_name series_id match_name match_id market_name market_id volume_stake_enable min_volume_limit 
                  market_min_stack market_max_stack market_min_odds_rate market_max_odds_rate market_max_profit market_advance_bet_stake 
                  market_live_odds_validation betting_will_start_time inplay_betting_allowed market_back_rate_range market_lay_rate_range 
                  market_bookmaker_min_odds_rate market_bookmaker_max_odds_rate is_back_bet_allowed is_lay_bet_allowed 
                  inplay_max_volume_stake_0_10 inplay_max_volume_stake_10_40 inplay_max_volume_stake_40 
                  max_volume_stake_0_10 max_volume_stake_10_40 max_volume_stake_40 
                  unmatch_bet_allowed no_of_unmatch_bet_allowed market_type live_market_min_stack live_market_max_stack
              `).lean()
            ];
            if (sport_id == "4")
              Models.push(
                Fancy.find(
                  { sport_id, match_id, is_active: { $in: [0, 1] }, is_result_declared: 0 },
                ).select([
                  "-_id",
                  "fancy_id",
                  "session_min_stack",
                  "session_max_stack",
                  "session_max_profit",
                  "session_live_odds_validation",
                  "session_live_max_stack",
                  "session_live_min_stack",
                ]).lean()
              )
            return Promise.all(Models)
              .then(async limitOfMarketFancy => {
                if (limitOfMarketFancy.toString()) {
                  let session = [];
                  if (sport_id == "4")
                    session = limitOfMarketFancy[1];
                  limitOfMarketFancy = await processLimitOfMarketFancy(limitOfMarketFancy, req, websiteService);
                  if (session.length)
                    limitOfMarketFancy["session"] = session.reduce((prev, curr) => {
                      prev[curr.fancy_id] = { ...curr }; return prev;
                    }, {});
                  return User.findOne({ _id: req.User._id }).select("-_id exposure_limit").lean()
                    .then(user => ResSuccess(res, { msg: req.User.user_name + " Events limites.", data: limitOfMarketFancy, check_event_limit: true, exposure_limit: user.exposure_limit }))
                    .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
                } else
                  return ResError(res, { msg: "Events not found!", statusCode: STATUS_200 });
              }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
          } else
            return ResError(res, { msg: "User settings not found!", statusCode: STATUS_200 });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  update: function (req, res) {
    return Joi.object({
      event: Joi.string().valid("sport", "series", "match", "market", "fancy").required(),
      filter: Joi.object().required(),
      update: Joi.object()
        .or("is_visible", "match_tv_url", "has_tv_url", "match_scoreboard_url", "news").required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ event, filter, update }) => {
        if (!Object.keys(filter).length)
          return ResError(res, { msg: "Value is required!" });
        Models = { sport: Sport, series: Series, match: Match, market: Market, fancy: Fancy };
        return Models[event].updateOne(filter, update).then(updateStatus => {
          if (!updateStatus.matchedCount)
            return ResError(res, { msg: `${event} not found!` });
          if (!updateStatus.modifiedCount)
            return ResError(res, { msg: `${event} not updated!` });
          return ResSuccess(res, { data: `${event} updated successfully...` });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  block: async function (req, res) {
    const result = await eventService.block(req);
    if (result.statusCode != SUCCESS) {
      updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: result.data.msg })
      return ResError(res, result.data)
    } else {
      updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data.msg })
      return ResSuccess(res, result.data)
    }
  },
  updateTVandScoreBoardURL: function (req, res) {
    return Joi.object({
      match_id: Joi.string().required(),
      update: Joi.object().or("non_premimum_match_tv_url", "premimum_match_tv_url", "match_scoreboard_url").required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async ({ match_id, update }) => {
        // Check if non_premimum_match_tv_url exists in update object
        if (update.hasOwnProperty("premimum_match_tv_url")) {
          let webData = await websiteSetting.find({ is_tv_url_premium: 1 }, { domain_name: 1, is_tv_url_premium: 1 });
          let domainNameArray = [];
          if (webData.length) {
            const domainNames = webData.map(item => item.domain_name);
            const commaSeparatedString = domainNames.join(',');
            domainNameArray = commaSeparatedString.split(',');
          }
          update.has_tv_url = true;
          update.domains = domainNameArray;
        }
        // Check if match_scoreboard_url exists in update object
        if (update.hasOwnProperty("match_scoreboard_url")) {
          update.has_sc_url = true;
        }
        return TvAndScoreboardUrlSetting.updateOne({ match_id: match_id }, update, { upsert: true, setDefaultsOnInsert: true })
          .then(async updateStatus => {
            try {
              await Match.updateOne({ match_id: match_id }, { $set: { has_tv_url: update.has_tv_url, has_sc_url: update.has_sc_url } });
              console.log("Update successful");
            } catch (error) {
              console.error("Error occurred during update:", error);
            }
            return ResSuccess(res, { data: `Url updated successfully...` });
          })
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      })
      .catch(error => {
        return ResError(res, error);
      });
  },
  // Get tv and score board url by match id.
  getTVandScoreBoardURL: function (req, res) {
    return Joi.object({
      match_id: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async ({ match_id }) => {
        return TvAndScoreboardUrlSetting.findOne({ match_id: match_id }, { match_scoreboard_url: 1, non_premimum_match_tv_url: 1, premimum_match_tv_url: 1, _id: 0 })
          .then(async TvAndScoreboardUrlData => {
            if (TvAndScoreboardUrlData) {
              return ResSuccess(res, { data: TvAndScoreboardUrlData });
            } else {
              return ResError(res, { msg: "No data found." })
            }
          })
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      })
      .catch(error => {
        return ResError(res, error);
      });
  }
}

function getModelData(Model, filter, projection) {
  return Model.findOne(filter, projection).lean().then();
}

async function getEventSportId(data) {
  return (
    await (data.hasOwnProperty("series_id")
      ? Series.findOne({ series_id: data.series_id })
      : Match.findOne({ match_id: data.match_id })).select("sport_id").lean()
  ).sport_id;
}

async function processLimitOfMarketFancy(limitOfMarketFancy, req, websiteService) {
  const result = {};

  for (const curr of limitOfMarketFancy[0]) {
    let { market_id } = curr;

    if (curr.sport_id == "4" && curr.market_type == MATCH_ODDS_TYPE) {

      let getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({ domain_name: req.User.domain_name });

      let unmatch_bet_allowed = false;

      if (getWebsiteSettings.statusCode == SUCCESS) {
        unmatch_bet_allowed = getWebsiteSettings.data.unmatch_bet_allowed;
      }

      unmatch_bet_allowed = [unmatch_bet_allowed, curr.unmatch_bet_allowed].every(Boolean);
      curr.unmatch_bet_allowed = unmatch_bet_allowed;
    }

    result[market_id] = {
      ...curr,
      name: `${curr.sport_name}(${curr.sport_id})-> ${curr.series_name}(${curr.series_id})-> ${curr.match_name}(${curr.match_id})-> ${curr.market_name}(${curr.market_id})`
    };
  }

  return result;
}
