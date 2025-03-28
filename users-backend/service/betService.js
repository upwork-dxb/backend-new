const _ = require('lodash')
  , mongoose = require('mongoose')
  , axios = require('axios')
  , getCurrentLine = require('get-current-line')
  , moment = require('moment')
  , User = require('../../models/user')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , Fancy = require('../../models/fancy')
  , BetsOdds = require('../../models/betsOdds')
  , BetsFancy = require('../../models/betsFancy')
  , FancyScorePosition = require('../../models/fancyScorePosition')
  , OddsProfitLoss = require('../../models/oddsProfitLoss')
  , MarketAnalysis = require('../../models/marketAnalysis')
  , publisher = require("../../connections/redisConnections")
  , userService = require('../../admin-backend/service/userService')
  , websiteService = require("../../admin-backend/service/websiteService")
  , marketsService = require('../service/marketsService')
  , fancyService = require('../service/fancyService')
  , exchangeService = require('../service/exchangeService')
  , betQueryServiceAdmin = require('../../admin-backend/service/betQueryService')
  , betQueryService = require('./betQueryService')
  , apiUrlSettingsService = require('../../admin-backend/service/apiUrlSettingsService')
  , VALIDATION = require('../../utils/validationConstant')
  , logger = require('../../utils/loggers')
  , { sendMessageAlertToTelegram } = require('../../admin-backend/service/messages/telegramAlertService')
  , { generateReferCode, exponentialToFixed, fixFloatingPoint } = require('../../utils')
  , { resultResponse } = require('../../utils/globalFunction')
  , BetCounts = require('../../models/betCount');

const BetLock = require("../../models/betLock");
const {
  SUCCESS,
  NOT_FOUND,
  SERVER_ERROR,
  VALIDATION_ERROR,
  BET_HOLD_VALIDATION,
  LIVE_GAME_SPORT_ID,
  DIAMOND_CASINO_SPORT_ID,
  MATCH_ODDS_TYPE,
  BOOKMAKER_TYPE,
  FANCY_LIVE_LIMITES_FOR,
  LABEL_CHIP_SUMMARY,
  BET_PLACE_TIME,
  HR,
  GHR,
  CRICKET,
  TO_BE_PLACED_TYPE,
  UNIQUE_IDENTIFIER_KEY,
  FANCY_CATEGORY,
  FANCY_CATEGORY_DIAMOND,
  LABEL_DIAMOND
} = require("../../utils/constants");

let validateMarketBeforeBetPlace = async (data) => {

  try {

    if (!data.is_hr_bet) {
      const KEY = data.user_name + BET_PLACE_TIME + UNIQUE_IDENTIFIER_KEY;
      let getLastBetStatus = await publisher.get(KEY);
      if (!getLastBetStatus) {
        await publisher.set(KEY, new Date(), 'EX', 5);
      } else {
        return resultResponse(BET_HOLD_VALIDATION, "Only one bet at a time is allowed!");
      }
    }

    // Bet lock validation.
    let betLockStatus = await validateBetLockStatus(data, { event_id: data.market_id, });
    if (betLockStatus) {
      return resultResponse(betLockStatus.statusCode, betLockStatus.data);
    }

    const session = await mongoose.startSession({
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
    });

    if (data.stack <= 0)
      return resultResponse(VALIDATION_ERROR, `Stack(${data.stack}) can't be zero`);

    if (data.odds == 0)
      return resultResponse(VALIDATION_ERROR, `Odds(${data.odds}) can't be zero`);

    return marketsService.getMarketDetail(
      { market_id: data.market_id, "runners.selectionId": data.selection_id },
      [
        "-_id",
        "sport_id",
        "sport_name",
        "series_id",
        "series_name",
        "match_id",
        "match_name",
        "market_name",
        "market_type",
        "centralId",
        "match_date",
        "name",
        "is_result_declared",
        "is_active",
        "is_visible",
        "runners",
        "inplay",
        "cron_inplay",
        "is_lock",
        "market_start_time",
        "betting_will_start_time",
        "inplay_betting_allowed",
        "min_volume_limit",
        "market_min_stack",
        "market_max_stack",
        "market_min_odds_rate",
        "market_max_odds_rate",
        "market_max_profit",
        "market_advance_bet_stake",
        "unmatch_bet_allowed",
        "market_live_odds_validation",
        "volume_stake_enable",
        "market_back_rate_range",
        "market_lay_rate_range",
        "market_bookmaker_min_odds_rate",
        "market_bookmaker_max_odds_rate",
        "inplay_max_volume_stake_0_10",
        "inplay_max_volume_stake_10_40",
        "inplay_max_volume_stake_40",
        "max_volume_stake_0_10",
        "max_volume_stake_10_40",
        "max_volume_stake_40",
        "is_back_bet_allowed",
        "is_lay_bet_allowed",
        "no_of_winners",
        "no_of_unmatch_bet_allowed",
        "unmatch_bets",
        "live_market_min_stack",
        "live_market_max_stack",
        "market_live_odds_validation",
        "self_blocked",
        "parent_blocked",
      ]
    ).then(market => {
      if (market.statusCode == SUCCESS) {

        market = market.data;
        const { is_hr_bet } = data;

        if (!market)
          return resultResponse(VALIDATION_ERROR, "Not an valid market or invalid team selection");

        if (market.is_result_declared == 1)
          return resultResponse(VALIDATION_ERROR, "Market result declared");

        if (market.is_active == 0 || market.is_visible == false)
          return resultResponse(VALIDATION_ERROR, "Market is closed by agent(s)");

        if (market.is_lock)
          return resultResponse(VALIDATION_ERROR, "Market is locked!");

        let eventLock = validateEventLock(data, market);
        if (eventLock) {
          return resultResponse(eventLock.statusCode, eventLock.data);
        }

        if (market?.betting_will_start_time != 0 && !is_hr_bet) {
          let betting_will_start_time = parseInt(moment.duration(moment(market.market_start_time).subtract(market.betting_will_start_time, 'minutes').diff(moment())).asMinutes());
          if (betting_will_start_time > 0)
            return resultResponse(VALIDATION_ERROR, `Bet will be accepted ${market.betting_will_start_time} minutes before the market starts, Thanks.`);
        }

        if ([HR, GHR].includes(market.sport_id)) {
          if (market?.inplay_betting_allowed == false) {
            if (moment().isAfter(moment(market.market_start_time))) {
              return resultResponse(VALIDATION_ERROR, "Inplay betting is not allowed!");
            }
          }
        }

        if (market.market_type == TO_BE_PLACED_TYPE) {
          data.is_tbp_bet = true;
        }

        data.no_of_winners = market.no_of_winners;

        if (market.is_back_bet_allowed == false && data.is_back == 1) {
          return resultResponse(VALIDATION_ERROR, "Back Bets not Allowed!");
        }

        if ((data.is_tbp_bet || (market.is_lay_bet_allowed == false)) && data.is_back == 0) {
          return resultResponse(VALIDATION_ERROR, "Lay Bets not Allowed!");
        }

        let eventDetails = {
          sport_id: market.sport_id,
          sport_name: market.sport_name,
          series_id: market.series_id,
          series_name: market.series_name,
          match_id: market.match_id,
          match_name: market.match_name,
          market_name: market.market_name,
          match_date: [DIAMOND_CASINO_SPORT_ID].includes(market.sport_id) ? new Date() : market.match_date,
          market_type: market.market_type,
          user_name: data.user_name,
          domain_name: data.domain_name
        };

        return resultResponse(SUCCESS, Object.assign(data, {
          ...eventDetails, eventDetails, market, session
        }));
      } else if (market.statusCode == NOT_FOUND)
        return resultResponse(NOT_FOUND, market.data);
      else
        return resultResponse(VALIDATION_ERROR, "Not an valid market or invalid team selection");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }
  catch (error) {
    return resultResponse(SERVER_ERROR, `Validate market Error ${(process.env.DEBUG == "true" ? `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")}`);
  }
}

let validateUserBeforeBetPlace = (data) => {
  try {
    // let getUserSettingsMarketFields = "";
    // Object.keys(VALIDATION).map(key => {
    //   if (key.includes("market_"))
    //     getUserSettingsMarketFields += `sports_settings.${key}.$ `;
    // });
    return userService.getUserDetails(
      { _id: data.user_id, user_type_id: 1 },
      [
        "userSettingSportsWise",
        "partnerships",
        "self_lock_betting",
        "parent_lock_betting",
        "self_lock_user",
        "parent_lock_user",
        "self_close_account",
        "parent_close_account",
        "match_commission",
        "check_event_limit",
        "markets_liability",
        "last_bet_place_time",
        "is_demo",
        "belongs_to"
      ],
      [
        // here we need to remove extra sports_settings fields in future versions.
        {
          path: "userSettingSportsWise",
          match: { "sports_settings.sport_id": data.sport_id },
          select: "sports_settings.$ parent_commission",
        },
        {
          path: "partnerships",
          match: { "sports_share.sport_id": data.sport_id },
          select: "sports_share.percentage.share.$ sports_share.percentage.user_id",
        },
      ],
    ).then(async user => {
      if (user.statusCode == SUCCESS) {
        user = user.data;

        const { userSettingSportsWise, partnerships } = user;
        let { sports_settings, parent_commission } = userSettingSportsWise;
        let { sports_share } = partnerships;
        Object.assign(user, sports_settings[0], { commission: parent_commission }, { partnerships: sports_share[0].percentage });

        const { market, is_hr_bet } = data;
        let validateStack = await validateMarketStack({ user, data });
        if (validateStack.statusCode != SUCCESS)
          return validateStack;
        let getMarketInplay = await exchangeService.getOddsByMarketId(data.market_id);
        if (!getMarketInplay.data) {
          try {
            let stackSum = await BetsOdds.aggregate(betQueryService.betsStackSumQuery(data.user_id, market.match_id, data.market_id));
            if (stackSum.length) stackSum = stackSum[0].stackSum;
            else stackSum = 0;
            stackSum += data.stack;

            if (user.check_event_limit) {
              if (stackSum > market.market_advance_bet_stake) {
                return resultResponse(VALIDATION_ERROR, `Market advance stack(${market.market_advance_bet_stake}) limit is over.`);
              }
            } else {
              if (user.market_advance_bet_stake == 0 && stackSum > VALIDATION.market_advance_bet_stake_max_limit)
                return resultResponse(VALIDATION_ERROR, `Your advance stack(${VALIDATION.market_advance_bet_stake_max_limit}) limit is over.`);
              else if (user.market_advance_bet_stake != 0 && stackSum > user.market_advance_bet_stake)
                return resultResponse(VALIDATION_ERROR, `Your advance stack(${user.market_advance_bet_stake}) limit is over.`);
            }
          } catch (error) {
            return resultResponse(VALIDATION_ERROR, `Advance stack calculation error ${error.message}`);
          }
        }

        if (!sports_settings.length)
          return resultResponse(VALIDATION_ERROR, `User sport settings not found!`);

        if (!parent_commission.length)
          return resultResponse(VALIDATION_ERROR, `User parent commissions not found!`);

        if (!sports_share.length)
          return resultResponse(VALIDATION_ERROR, `User partnerships not found!`);

        if (Math.max(user.self_lock_betting, user.parent_lock_betting) == 1)
          return resultResponse(VALIDATION_ERROR, `Your betting is locked!`);

        let betPlaceHoldTime = (user.market_bet_delay == 0) ? 1 : user.market_bet_delay;

        if (user.self_lock_betting == 2) {
          if (user.last_bet_place_time !== undefined) {
            let differenceInSeconds = Math.floor((Date.now() - user.last_bet_place_time) / 1000);
            if (differenceInSeconds < betPlaceHoldTime)
              return resultResponse(VALIDATION_ERROR, "Only one bet at a time is allowed!");
          }
        }

        if (Math.max(user.self_lock_user, user.parent_lock_user) == 1)
          return resultResponse(VALIDATION_ERROR, "Your account is locked!");

        if (Math.max(user.self_close_account, user.parent_close_account) == 1)
          return resultResponse(VALIDATION_ERROR, "Your account is closed!");

        return resultResponse(SUCCESS, Object.assign(data, { user }));
      } else if ([NOT_FOUND, SERVER_ERROR].includes(user.statusCode))
        return resultResponse(NOT_FOUND, `Validate user Error ${(process.env.DEBUG == "true" ? `${user.data} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")}`);
      else
        return resultResponse(NOT_FOUND, "Not an valid user");
    }).catch(error => resultResponse(SERVER_ERROR, `Validate user Error ${(process.env.DEBUG == "true" ? `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")}`));
  }
  catch (error) {
    return resultResponse(SERVER_ERROR, `Validate user Error ${(process.env.DEBUG == "true" ? `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")}`);
  }
}

let validateMarketStack = async ({ user, data }) => {
  const { market, is_hr_bet, stack } = data;
  let msg;
  let checkInternalLimit = false;
  let getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({
    domain_name: data.domain_name,
  });
  let diamond_rate_limit_enabled = false;
  if (getWebsiteSettings.statusCode == SUCCESS) {
    diamond_rate_limit_enabled =
      getWebsiteSettings.data.diamond_rate_limit_enabled;
  }
  if (diamond_rate_limit_enabled) {
    if (user.check_event_limit) {
      if (market.market_live_odds_validation) {
        if (
          market.live_market_min_stack == undefined &&
          market.live_market_max_stack == undefined
        ) {
          checkInternalLimit = true;
        } else {
          if (market.live_market_min_stack > stack && !is_hr_bet) {
            if (user.belongs_to == LABEL_DIAMOND) {
              msg = 'Bet Not Confirm Reason Min and Max Bet Range Not Valid.';
            }
            else {
              msg = `Live Market min stack is ${market.live_market_min_stack}`;
            }
            return resultResponse(
              VALIDATION_ERROR,
              msg
            );
          }
          if (market.live_market_max_stack < stack && !is_hr_bet) {
            if (user.belongs_to == LABEL_DIAMOND) {
              msg = 'Check Maximum Bet Limit.';
            }
            else {
              msg = `Live Market max stack is ${market.live_market_min_stack}`;
            }
            return resultResponse(
              VALIDATION_ERROR,
              msg
            );
          }
        }
      } else {
        checkInternalLimit = true;
      }
    }
    else {
      checkInternalLimit = true;
    }
  }
  else {
    checkInternalLimit = true;
  }
  if (checkInternalLimit) {
    if (user.check_event_limit) {

      if (market.market_min_stack > data.stack && !is_hr_bet) {
        if (user.belongs_to == LABEL_DIAMOND) {
          msg = 'Bet Not Confirm Reason Min and Max Bet Range Not Valid.'
        } else {
          msg = `Market min stack is ${market.market_min_stack}`;
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }

      if (market.market_max_stack < data.stack && !is_hr_bet) {
        if (user.belongs_to == LABEL_DIAMOND) {
          msg = 'Check Maximum Bet Limit.'
        } else {
          msg = `Market max stack is ${market.market_max_stack}`;
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }

    } else {

      if (user.market_min_stack && user.market_min_stack > data.stack) {
        if (user.belongs_to == LABEL_DIAMOND) {
          msg = 'Bet Not Confirm Reason Min and Max Bet Range Not Valid.'
        } else {
          msg = `Your min stack is ${user.market_min_stack}`;
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }
      if (user.market_max_stack == 0 && VALIDATION.market_max_stack_max_limit < data.stack) {
        if (user.belongs_to == LABEL_DIAMOND) {
          msg = 'Check Maximum Bet Limit.'
        } else {
          msg = `Your max stack is ${VALIDATION.market_max_stack_max_limit}`;
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }
      else if (user.market_max_stack != 0 && user.market_max_stack < data.stack) {
        if (user.belongs_to == LABEL_DIAMOND) {
          msg = 'Check Maximum Bet Limit.'
        } else {
          msg = `Your max stack is ${user.market_max_stack}`;
        }
        return resultResponse(VALIDATION_ERROR, `Your max stack is ${user.market_max_stack}`);
      }
    }
  }
  return resultResponse(SUCCESS, true);
}

let validateBetAndRedisOddsWhileBetPlacing = (data) => {
  return exchangeService.getOddsRate(data).then(async betFairOdss => {
    let { is_back, odds, stack, is_hr_bet, hr_unmatch_bet, stack_sum, is_tbp_bet } = data;
    let is_matched = 0, p_l, redisOdds, redisStatus, redisSize, liability, p_l_HR, liability_HR, isBookmakerMarket = data.market.market_type == BOOKMAKER_TYPE;
    let msg;
    try {
      if (betFairOdss.statusCode != SUCCESS)
        return resultResponse(VALIDATION_ERROR, betFairOdss.data);
      redisStatus = betFairOdss.data["status"];
      redisOdds = betFairOdss.data["odds"];
      redisSize = betFairOdss.data["size"];

      if (is_back == 1) {

        let market_back_rate_range = data.market?.market_back_rate_range || 0;

        // Here we are skip odds rate range setting for bookmaker market.
        if (isBookmakerMarket) market_back_rate_range = 0;

        if (hr_unmatch_bet || (parseFloat(odds) <= parseFloat(redisOdds) && checkRateRange(redisOdds, odds, market_back_rate_range))) {
          is_matched = 1;
          odds = redisOdds;
        } else {
          is_matched = 0;
        }


        p_l = ((isBookmakerMarket ? bookmakerRateConvert(odds) : odds) * stack) - (stack);
        p_l_HR = ((isBookmakerMarket ? bookmakerRateConvert(odds) : odds) * stack) - (is_hr_bet ? stack_sum : stack);

        liability = stack;
        liability_HR = stack;

      } else {

        let market_lay_rate_range = data.market?.market_lay_rate_range || 0;

        // Here we are skip odds rate range setting for bookmaker market.
        if (isBookmakerMarket) market_lay_rate_range = 0;

        if (hr_unmatch_bet || (parseFloat(odds) >= parseFloat(redisOdds) && checkRateRange(odds, redisOdds, market_lay_rate_range))) {
          is_matched = 1;
          odds = redisOdds;
        } else {
          is_matched = 0;
        }


        liability = ((isBookmakerMarket ? bookmakerRateConvert(odds) : odds) * stack) - (stack);
        liability_HR = ((isBookmakerMarket ? bookmakerRateConvert(odds) : odds) * stack) - (is_hr_bet ? stack_sum : stack);

        p_l = stack;
        p_l_HR = stack;

      }

      // is_matched = 0;
      data.is_back = is_back;
      data.odds = odds;
      data.p_l = p_l;
      data.p_l_HR = p_l_HR;
      data.stack = stack;
      data.is_matched = is_matched;
      data.liability = -liability;
      data.liability_HR = -liability_HR;
      data.redis_status = redisStatus;
      data.size = redisSize;
      data.volume = parseInt(redisSize);

      if (!(['OPEN', 'ACTIVE', 'True', "1"].includes(data.redis_status)))
        return resultResponse(VALIDATION_ERROR, "Bet Not Confirm Reason Game Not Active.");

      if (is_matched == 0) {

        let getWebsiteSettings = await websiteService.getWebsiteSettingsFromCache({ domain_name: data.domain_name })
          , unmatch_bet_allowed = false;

        if (getWebsiteSettings.statusCode == SUCCESS) {
          unmatch_bet_allowed = getWebsiteSettings.data.unmatch_bet_allowed;
        }

        unmatch_bet_allowed = [unmatch_bet_allowed, data.market.unmatch_bet_allowed].every(Boolean);

        // white label check should be applied.
        // Add Website Wise Unmatched Allowed Check Here !!
        if (data.market.sport_id != CRICKET
          || data.market.market_type != MATCH_ODDS_TYPE
          || !unmatch_bet_allowed) {
          if (data.user.belongs_to == LABEL_DIAMOND) {
            msg = 'Bet not confirm Odds change';
          } else {
            msg = "Unmatch bet not allowed.";
          }
          return resultResponse(VALIDATION_ERROR, msg);
        }
        // Get User Un-Matched Bets Count
        const count = data?.market?.unmatch_bets?.filter(i =>
          (i.user_name == data.user_name && i.is_matched == 0 && i.delete_status != 1)).length || 0;
        const allowedCount = (data.market.no_of_unmatch_bet_allowed || 0)

        if (allowedCount != 0 && count >= allowedCount) {
          return resultResponse(VALIDATION_ERROR, `Max UnMatched Bets Count Allowed is ${allowedCount}.`);
        }
      }

      if (data.odds <= 0) {
        if (data.user.belongs_to == LABEL_DIAMOND) {
          msg = 'Bet Not Confirm Reason Game Not Active.';
        } else {
          msg = `${data.odds} odds rate not allowed.`;
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }
      if (data.user.check_event_limit) {

        if (isBookmakerMarket) {

          if (data.market.market_bookmaker_min_odds_rate > data.odds) {
            return resultResponse(VALIDATION_ERROR, `Bookmaker market min odd limit is ${data.market.market_bookmaker_min_odds_rate}`);
          }

          if (data.market.market_bookmaker_max_odds_rate < data.odds) {
            return resultResponse(VALIDATION_ERROR, `Bookmaker market max odd limit is ${data.market.market_bookmaker_max_odds_rate}`);
          }

        } else {

          if (data.market.market_min_odds_rate > data.odds && !is_hr_bet) {
            return resultResponse(VALIDATION_ERROR, `Market min odd limit is ${data.market.market_min_odds_rate}`);
          }

          if (data.market.market_max_odds_rate < data.odds && !is_hr_bet) {
            return resultResponse(VALIDATION_ERROR, `Market max odd limit is ${data.market.market_max_odds_rate}`);
          }

        }

      } else {

        if (isBookmakerMarket) {

          if (data.user.market_bookmaker_min_odds_rate && data.user.market_bookmaker_min_odds_rate > data.odds) {
            return resultResponse(VALIDATION_ERROR, `Your min odd limit is ${data.user.market_bookmaker_min_odds_rate}`);
          }

          if (data.user.market_bookmaker_max_odds_rate && data.user.market_bookmaker_max_odds_rate < data.odds) {
            return resultResponse(VALIDATION_ERROR, `Your max odd limit is ${data.user.market_bookmaker_max_odds_rate}`);
          }

        } else {

          if (data.user.market_min_odds_rate && data.user.market_min_odds_rate > data.odds && !is_hr_bet) {
            return resultResponse(VALIDATION_ERROR, `Your min odd limit is ${data.user.market_min_odds_rate}`);
          }

          if (data.user.market_max_odds_rate && data.user.market_max_odds_rate < data.odds && !is_hr_bet) {
            return resultResponse(VALIDATION_ERROR, `Your max odd limit is ${data.user.market_max_odds_rate}`);
          }

        }

      }

      if (data.stack <= 0)
        return resultResponse(VALIDATION_ERROR, `${data.stack} stack not allowed.`);

      const { sport_id, series_id, match_id, volume_stake_enable } = data.market;

      runners = data?.market?.runners?.length ? data?.market?.runners.map(i => ({
        ...i, unmatched_win_value: 0, unmatched_loss_value: 0
      })) : [];

      if (data.market.market_type.toLowerCase() == MATCH_ODDS_TYPE.toLowerCase())
        if (volume_stake_enable) {
          let ZERO = 0, TEN_K = 10000, FORTY_K = 40000
            , volumeValidation = false;
          if (data.market.inplay) {
            if (ZERO < data.volume && TEN_K > data.volume) {
              if (data.market.inplay_max_volume_stake_0_10 < data.stack && data.market.inplay_max_volume_stake_0_10 != 0)
                volumeValidation = true;
            } else if (TEN_K < data.volume && FORTY_K > data.volume) {
              if (data.market.inplay_max_volume_stake_10_40 < data.stack && data.market.inplay_max_volume_stake_10_40 != 0)
                volumeValidation = true;
            } else if (FORTY_K < data.volume) {
              if (data.market.inplay_max_volume_stake_40 < data.stack && data.market.inplay_max_volume_stake_40 != 0)
                volumeValidation = true;
            }
          } else {
            if (ZERO < data.volume && TEN_K > data.volume) {
              if (data.market.max_volume_stake_0_10 < data.stack && data.market.max_volume_stake_0_10 != 0)
                volumeValidation = true;
            } else if (TEN_K < data.volume && FORTY_K > data.volume) {
              if (data.market.max_volume_stake_10_40 < data.stack && data.market.max_volume_stake_10_40 != 0)
                volumeValidation = true;
            } else if (FORTY_K < data.volume) {
              if (data.market.max_volume_stake_40 < data.stack && data.market.max_volume_stake_40 != 0)
                volumeValidation = true;
            }
          }
          if (volumeValidation)
            return resultResponse(VALIDATION_ERROR, `Stack value exceed!`);
        }

      // if (data.market.min_volume_limit >= data.volume && data.market.min_volume_limit != 0)
      //   return resultResponse(VALIDATION_ERROR, `There is not enough volume in the market!`);

      if (data.roundId != undefined)
        if (data.hasOwnProperty("roundId") && data.roundId != null)
          data.market_id = `${data.market_id}.${data.roundId}`;

      let teamPosition = await marketsService.getTeamPosition(data.user_id, match_id, data.market_id, runners)
        , run_time_sum_win_loss = [], old_sum_win_loss = []
        , oldUserMaxLoss = 0, userMaxProfit = 0, userMaxLoss = 0
        , tbp_run_time_win = [], tbp_run_time_loss = [], tbp_old_loss = [];

      if (teamPosition.statusCode != SUCCESS)
        return resultResponse(VALIDATION_ERROR, "Something went wrong in team position!");

      let distribution =
        _.map(data.user.partnerships, function (partnerships, index) {
          return _.merge(
            partnerships,
            { index },
            _.find(data.user.commission, { user_id: partnerships.user_id })
          )
        });

      teamPosition = teamPosition.data;
      teamPosition = teamPosition.map((runner) => (
        Object.assign(
          runner,
          data.eventDetails,
          { stacks_sum: runner.stacks_sum + data.stack }
        )
      ));
      if ([LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID].includes(data.sport_id))
        data.user.match_commission = 0;
      if (isBookmakerMarket)
        data.user.match_commission = 0;

      if (data.is_back == 1) {

        teamPosition.forEach(function (position) {

          let back_distribution = JSON.parse(JSON.stringify(distribution));
          old_sum_win_loss.push(position.win_value + position.loss_value + position.unmatched_loss_value);
          if (is_tbp_bet)
            tbp_old_loss.push(Math.min(position.win_value, position.loss_value));

          if (position.selection_id == data.selection_id) {
            if (data.is_matched == 0) {
              position.unmatched_win_value = position.unmatched_win_value + data.p_l;
            } else {
              position.win_value = position.win_value + ((is_hr_bet && !is_tbp_bet) ? data.p_l_HR : data.p_l);
              if (is_tbp_bet) {
                position.loss_value = position.loss_value - data.stack
              }
            }
          }
          else {
            if (data.is_matched == 0) {
              position.unmatched_loss_value = position.unmatched_loss_value - data.stack;
            } else if (!is_tbp_bet) {
              position.loss_value = position.loss_value - data.stack;
            }
          }
          if (is_hr_bet)
            if (data.betMeta.find(bets => bets.selection_id == position.selection_id) && !is_tbp_bet)
              position.loss_value = 0;
          let win_loss = is_tbp_bet ? 0 : position.win_value + position.loss_value;
          position.sum_win_loss = win_loss;
          position.win_loss = win_loss;
          position.user_pl = position.win_loss;


          if (position.user_pl > 0)
            position.user_commission_pl = -(position.user_pl * data.user.match_commission / 100);
          else
            position.user_commission_pl = 0;
          if (position.selection_id == data.selection_id)
            position.stack += data.stack;
          run_time_sum_win_loss.push(position.sum_win_loss + position.unmatched_loss_value);
          run_time_sum_win_loss.push(position.sum_win_loss);
          if (is_tbp_bet) {
            tbp_run_time_win.push([position.win_value, position.loss_value]);
            tbp_run_time_loss.push(Math.min(position.win_value, position.loss_value));
          }
          position.user_id = data.user_id;

          position.sport_id = sport_id;

          position.series_id = series_id;

          position.match_id = match_id;

          position.market_id = data.market_id;

          position.is_demo = data.user.is_demo;

          let totalPl = 0;
          let totalComm = 0;
          position.win_loss_distribution = back_distribution.map((agent, index) => {

            agent.match_commission = data.user.match_commission;

            agent.session_commission = 0;

            agent.win_loss = fixFloatingPoint(-(position.sum_win_loss * agent.share / 100));

            agent.p_l = agent.win_loss;

            if (position.user_pl > 0)
              agent.commission = fixFloatingPoint(-(agent.p_l) * agent.match_commission / 100);
            else
              agent.commission = 0;

            agent.index = index;

            // If Index 0 then add before setting the value;
            if (index == 0) {
              totalPl = fixFloatingPoint(totalPl + agent.p_l);
              totalComm = fixFloatingPoint(totalComm + agent.commission);
            }

            agent.added_pl = totalPl;
            agent.added_comm = totalComm;

            // If Index is not 0 then add after setting the value
            if (index != 0) {
              totalPl = fixFloatingPoint(totalPl + agent.p_l);
              totalComm = fixFloatingPoint(totalComm + agent.commission);
            }

            return agent;
          });

          return position;
        });
      } else {
        teamPosition.forEach(function (position) {

          let lay_distribution = JSON.parse(JSON.stringify(distribution));

          old_sum_win_loss.push(position.win_value + position.loss_value + position.unmatched_loss_value);

          if (position.selection_id == data.selection_id) {
            if (data.is_matched == 0) {
              position.unmatched_loss_value = position.unmatched_loss_value + data.liability;
            } else {
              position.win_value = position.win_value + (is_hr_bet ? data.liability_HR : data.liability);
            }
          }
          else {
            if (data.is_matched == 0) {
              position.unmatched_win_value = position.unmatched_win_value + data.p_l;
            } else {
              position.loss_value = position.loss_value + (is_hr_bet ? data.p_l_HR : data.p_l);
            }
          }

          if (is_hr_bet)
            if (data.betMeta.find(bets => bets.selection_id == position.selection_id))
              position.loss_value = 0;

          let win_loss = position.win_value + position.loss_value;
          position.sum_win_loss = win_loss;
          position.win_loss = win_loss;
          position.user_pl = position.win_loss;

          if (position.user_pl > 0)
            position.user_commission_pl = -(position.user_pl * data.user.match_commission / 100);
          else
            position.user_commission_pl = 0;
          if (position.selection_id == data.selection_id)
            position.stack += is_hr_bet ? data.liability_HR : data.liability;
          run_time_sum_win_loss.push(position.sum_win_loss + position.unmatched_loss_value);
          position.user_id = data.user_id;

          position.sport_id = sport_id;

          position.series_id = series_id;

          position.match_id = match_id;

          position.market_id = data.market_id;

          position.is_demo = data.user.is_demo;

          let totalPl = 0;
          let totalComm = 0;
          position.win_loss_distribution = lay_distribution.map((agent, index) => {

            agent.match_commission = data.user.match_commission;

            agent.session_commission = 0;

            agent.win_loss = fixFloatingPoint(-(position.sum_win_loss * agent.share / 100));

            agent.p_l = agent.win_loss;

            if (position.user_pl > 0)
              agent.commission = fixFloatingPoint(-(agent.p_l) * agent.match_commission / 100);
            else
              agent.commission = 0;

            agent.index = index;

            // If Index 0 then add before setting the value;
            if (index == 0) {
              totalPl = fixFloatingPoint(totalPl + agent.p_l);
              totalComm = fixFloatingPoint(totalComm + agent.commission);
            }

            agent.added_pl = totalPl;
            agent.added_comm = totalComm;

            // If Index is not 0 then add after setting the value
            if (index != 0) {
              totalPl = fixFloatingPoint(totalPl + agent.p_l);
              totalComm = fixFloatingPoint(totalComm + agent.commission);
            }

            return agent;
          });

          return position;
        });
      }

      if (is_tbp_bet) {
        let ouml = tbp_old_loss.reduce((acc, i) => acc + i, 0);
        oldUserMaxLoss = ouml >= 0 ? 0 : ouml;
        userMaxProfit = getMaxProfitByCombination(tbp_run_time_win, (data?.no_of_winners || 3)) || 0;
        userMaxLoss = tbp_run_time_loss.reduce((acc, i) => acc + i, 0);
      } else {
        const oldMinMatchedLoss = Math.min(...old_sum_win_loss);
        const runTimeMinMatchedLoss = Math.min(...run_time_sum_win_loss);

        oldUserMaxLoss = oldMinMatchedLoss >= 0 ? 0 : oldMinMatchedLoss;
        userMaxLoss = runTimeMinMatchedLoss;
        userMaxProfit = Math.max(...run_time_sum_win_loss);
      }

      let userBalanceFromDB = await User.findOne({ _id: data.user_id, user_type_id: 1 }, { balance: 1, liability: 1 }, { session: data.session }).lean();

      if (userBalanceFromDB.balance < 0) {
        return resultResponse(VALIDATION_ERROR, `${userBalanceFromDB.balance} balance in your account!`);
      }

      data.user = Object.assign(data.user, userBalanceFromDB);

      data.old_balance = userBalanceFromDB.balance;
      data.old_liability = userBalanceFromDB.liability;

      let userBalance = parseFloat(data.user.balance) + Math.abs(oldUserMaxLoss);
      if (userMaxLoss >= 0)
        data.liability_per_bet = Math.abs(oldUserMaxLoss);
      else
        data.liability_per_bet = Math.abs(oldUserMaxLoss) - Math.abs(userMaxLoss);
      let tempUserBalance = userMaxLoss > 0 ? 0 : userMaxLoss;
      if (Math.abs(tempUserBalance) > userBalance) {
        if (data.user.belongs_to == LABEL_DIAMOND) {
          msg = 'Bet Not Confirm Check Balance.';
        }
        else {
          msg = "Insufficient Balance.";
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }
      if (data.user.check_event_limit) {
        if (userMaxProfit > data.market.market_max_profit && data.market.market_max_profit != 0)
          return resultResponse(VALIDATION_ERROR, `Market max profit(${data.market.market_max_profit}) limit is over`);
      }

      if (data.user.market_max_profit == 0 && userMaxProfit > VALIDATION.market_max_profit_max_limit)
        return resultResponse(VALIDATION_ERROR, `Your max profit(${VALIDATION.market_max_profit_max_limit}) limit is over.`);
      else if (data.user.market_max_profit != 0 && userMaxProfit > data.user.market_max_profit)
        return resultResponse(VALIDATION_ERROR, `Your max profit(${data.user.market_max_profit}) limit is over.`);

      if (!runners)
        return resultResponse(VALIDATION_ERROR, `Team data is missing!`);

      let selection_name = runners.find(runner => runner.selection_id == data.selection_id).name;
      if (!selection_name)
        return resultResponse(VALIDATION_ERROR, "Selection name not found!");

      data.sort_name = data.type;
      data.sport_id = sport_id;
      data.series_id = series_id;
      data.match_id = match_id;
      data.market_name = data.market.name;
      data.selection_name = selection_name;
      data.user_commission = data.user.match_commission;
      data.is_demo = data.user.is_demo;
      await checkFraudBets(BetsOdds, data, { market_id: data.market_id });
      if (!data.user.hasOwnProperty("markets_liability"))
        data.user.markets_liability = {};
      let markets_liability = {};
      markets_liability[data.market_id] = { liability: userMaxLoss };
      if (0 < markets_liability[data.market_id].liability)
        markets_liability[data.market_id] = { liability: 0 };
      data.markets_liability = Object.assign(data.user.markets_liability, markets_liability);
      teamPosition = teamPosition.map(runner => ((runner.max_liability = markets_liability[data.market_id].liability), runner));
      data.stack_inverse = -(data.stack);
      data.distribution = distribution;
      data.runners = teamPosition;
      delete data.type;
      delete data.redis_status;
      delete data.market;
      delete data.user;
      return resultResponse(SUCCESS, data);
    }
    catch (error) {
      return resultResponse(SERVER_ERROR, `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}`);
    }
  }).catch(error => {
    return resultResponse(SERVER_ERROR, `Validate redis Error ${(process.env.DEBUG == "true" ? `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")}`);
  });
}

function getMaxProfitByCombination(tbp_run_time_win, no_of_winners) {
  const arr = Object.keys(tbp_run_time_win)
  let result = [];

  let totalCombinations = Math.pow(2, arr.length);

  for (let i = 0; i < totalCombinations; i++) {
    let combination = [];

    for (let j = 0; j < arr.length; j++) {
      if (i & (1 << j)) {
        combination.push(arr[j]);
      }
    }
    // Only include combinations with length 0, 1, 2, or 3
    if (combination.length <= no_of_winners) {
      result.push(combination);
    }
  }

  const profitsList = result.map(i => {
    let sum = 0;
    for (let j = 0; j < tbp_run_time_win.length; j++) {
      sum += tbp_run_time_win[j][i.includes(j.toString()) ? 0 : 1];
    }
    return sum;
  });

  return Math.max(...profitsList)
}

let saveBetV1 = async (data, liability) => {

  const { session } = data;

  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };

  try {

    const BET_NOT_PLACED = "Bet not placed!";

    const markets_liability = data.markets_liability;

    await session.withTransaction(async () => {
      let unmatched_bets = {};
      try {

        let betRes = await BetsOdds.create([data], { session });
        betRes = betRes[0];
        if (betRes.is_matched == 0)
          unmatched_bets = {
            bet_id: betRes._id,
            user_id: betRes.user_id,
            user_name: betRes.user_name,
            odds: betRes.odds,
            is_back: betRes.is_back,
            selection_id: betRes.selection_id,
            is_matched: betRes.is_matched
          }

      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `BOC_E ${error.message}` : ''));
      }

      try {

        await OddsProfitLoss.deleteMany({ "user_id": data.user_id, "market_id": data.market_id }, { session });

      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `OPLD_E ${error.message}` : ''));
      }

      try {

        await OddsProfitLoss.insertMany(data.runners, { session });

      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `OPLI_E ${error.message}` : ''));
      }

      try {

        const LOG_REF_CODE = generateReferCode();

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: saveBetV1
          EVENT_DETAILS: market_id(${data.market_id})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${data.user_name}(${data.user_id})] old_balance: ${data.old_balance} - old_liability: ${data.old_liability} - cal_liability: ${liability}
        `);

        await User.updateOne(
          { _id: data.user_id },
          [
            {
              '$set': {
                balance: { '$add': ["$balance", liability] },
                liability: { '$add': ["$liability", liability] }
              }
            }
          ],
          { runValidators: true, context: 'query' }
        ).session(session);

        const user = await User.findOne({ _id: data.user_id }).select("-_id balance liability").session(session).lean();

        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: saveBetV1
          EVENT_DETAILS: market_id(${data.market_id})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${data.user_name}(${data.user_id})] new_balance: ${user.balance} - new_liability: ${user.liability} - cal_liability: ${liability}
        `);

        if ((exponentialToFixed(user.liability) > 0) ? true : (exponentialToFixed(user.balance) < 0) ? true : false) {
          sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${data.user_name}(${data.user_id}) : balance ${user.balance}, liability ${user.liability}` });
        }

        await User.updateOne(
          { _id: data.user_id },
          { markets_liability },
          { upsert: true, setDefaultsOnInsert: true }
        ).session(session);

        if (!data?.is_demo) {
          Market.updateOne(
            { market_id: data.market_id },
            {
              '$inc': { bet_count: 1 },
              ...(data.is_matched == 0
                ? { '$push': { unmatch_bets: unmatched_bets } }
                : {})
            },
          ).lean().then().catch(console.error);

          Match.updateOne(
            { match_id: data.match_id },
            { '$inc': { bet_count: 1 } },
          ).lean().then().catch(console.error);

          checkMarketAnalysis(data);

          // Update Bet Count
          data.type = 1; data.event_id = data.market_id;
          addUpdateBetCount(data)
        }
      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `UU_E ${error.message}` : ''));
      }

    }, transactionOptions);

    return resultResponse(SUCCESS, data.is_matched == 1 ? "Bet placed Successfully" : "Un Matched Bet Placed Successfully...");

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    session.endSession();
  }
};

let multipleBetPreValidation = async (request) => {
  let { body } = request, market_id, odds_sum = 0, stack_sum = 0;
  body.map(data => {
    market_id = data.market_id;
    odds_sum += parseFloat(data.odds);
    stack_sum += data.stack;
  });
  let data = { stack: stack_sum, odds: odds_sum };
  return marketsService.getMarketDetail(
    { market_id },
    [
      "market_min_stack", "market_max_stack", "market_min_odds_rate", "market_max_odds_rate",
      "market_start_time", "betting_will_start_time", "market_type"
    ]
  ).then(market => {
    if (market.statusCode == SUCCESS) {
      market = market.data;

      if (market?.betting_will_start_time != 0) {
        let betting_will_start_time = parseInt(moment.duration(moment(market.market_start_time).subtract(market.betting_will_start_time, 'minutes').diff(moment())).asMinutes());
        if (betting_will_start_time > 0)
          return resultResponse(VALIDATION_ERROR, `Bet will be accepted ${market.betting_will_start_time} minutes before the market starts, Thanks.`);
      }

      if (market.market_min_stack > data.stack)
        return resultResponse(VALIDATION_ERROR, `Market min stack is ${market.market_min_stack}`);

      if (market.market_max_stack < data.stack)
        return resultResponse(VALIDATION_ERROR, `Market max stack is ${market.market_max_stack}`);

      if (market.market_min_odds_rate > data.odds)
        return resultResponse(VALIDATION_ERROR, `Market min odd limit is ${market.market_min_odds_rate}`);

      if (market.market_max_odds_rate < data.odds)
        return resultResponse(VALIDATION_ERROR, `Market max odd limit is ${market.market_max_odds_rate}`);

      if (market.market_type == TO_BE_PLACED_TYPE)
        return resultResponse(VALIDATION_ERROR, `COMBINED Bets not Allowed in ${market.market_name} markets`);

      return resultResponse(SUCCESS, "");
    } else if (market.statusCode == NOT_FOUND)
      return resultResponse(NOT_FOUND, market.data);
    else
      return resultResponse(VALIDATION_ERROR, "Not an valid market or invalid team selection");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let saveHrBet = async (request) => {
  const { body } = request;
  var config = {
    method: 'post',
    url: `https://${request.headers.host}/api/v1/bet/saveBet`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': request.headers.authorization
    },
    data: body
  };
  try {
    let betPlaceResponse = await axios(config);
    betPlaceResponse = betPlaceResponse.data;
    return resultResponse(betPlaceResponse.status ? SUCCESS : VALIDATION_ERROR, betPlaceResponse);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let validateFancyBeforeBetPlace = async (data) => {

  try {

    const KEY = data.user_name + BET_PLACE_TIME + UNIQUE_IDENTIFIER_KEY;
    let getLastBetStatus = await publisher.get(KEY);
    if (!getLastBetStatus) {
      await publisher.set(KEY, new Date(), 'EX', 5);
    } else {
      return resultResponse(BET_HOLD_VALIDATION, "Only one bet at a time is allowed!");
    }

    const session = await mongoose.startSession({
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
    });

    if (data.stack <= 0)
      return resultResponse(VALIDATION_ERROR, `Stack(${data.stack}) can't be zero`);

    if (data.size <= 0)
      return resultResponse(VALIDATION_ERROR, `Size(${data.odds}) can't be zero`);

    if (data.run <= 0)
      return resultResponse(VALIDATION_ERROR, `Run(${data.odds}) can't be zero`);

    return fancyService.getFancyDetail(
      { fancy_id: data.fancy_id },
      [
        "-_id",
        "sport_id",
        "sport_name",
        "series_id",
        "series_name",
        "match_id",
        "match_name",
        "match_date",
        "centralId",
        "fancy_name",
        "name",
        "selection_id",
        "category",
        "is_result_declared",
        "is_active",
        "is_lock",
        "session_min_stack",
        "session_max_stack",
        "session_max_profit",
        "session_live_odds_validation",
        "session_live_min_stack",
        "session_live_max_stack",
        "self_blocked",
        "parent_blocked",
      ]
    ).then(async fancy => {
      if (fancy.statusCode == SUCCESS) {
        fancy = fancy.data;
        if (!fancy)
          return resultResponse(VALIDATION_ERROR, "Not an valid fancy!");

        if (fancy.is_result_declared == 1)
          return resultResponse(VALIDATION_ERROR, "Fancy result declared!");

        if (fancy.is_lock)
          return resultResponse(VALIDATION_ERROR, "Fancy is locked!");

        // Bet lock validation.
        let betLockStatus = await validateBetLockStatus(data, { event_id: fancy.match_id, category: fancy.category, });
        if (betLockStatus) {
          return resultResponse(betLockStatus.statusCode, betLockStatus.data);
        }

        let eventLock = validateEventLock(data, fancy);
        if (eventLock) {
          return resultResponse(eventLock.statusCode, eventLock.data);
        }

        if (fancy.is_active != 1) {
          if (fancy.is_active == 0)
            return resultResponse(VALIDATION_ERROR, "Fancy is inactive or closed by agent(s)!");
          if (fancy.is_active == 2)
            return resultResponse(VALIDATION_ERROR, "Fancy is suspended!");
          if (fancy.is_active == 3)
            return resultResponse(VALIDATION_ERROR, "Fancy is Abandoned!");
        }

        let eventDetails = {
          sport_id: fancy.sport_id,
          sport_name: fancy.sport_name,
          series_id: fancy.series_id,
          series_name: fancy.series_name,
          match_id: fancy.match_id,
          match_name: fancy.match_name,
          match_date: fancy.match_date,
          fancy_id: data.fancy_id,
          fancy_name: fancy.fancy_name,
          category: fancy.category,
          category_name: FANCY_CATEGORY_DIAMOND[fancy.category] || "NORMAL",
          selection_id: fancy.selection_id,
          user_name: data.user_name,
          domain_name: data.domain_name
        };

        return resultResponse(SUCCESS, Object.assign(data, {
          ...eventDetails, eventDetails, fancy, session
        }));
      } else if (fancy.statusCode == NOT_FOUND)
        return resultResponse(NOT_FOUND, "Fancy not found!" + (process.env.DEBUG == "true" ? ` ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
      else
        return resultResponse(VALIDATION_ERROR, "Not an valid fancy!");
    }).catch(error => resultResponse(SERVER_ERROR, "Some error in fancy" + (process.env.DEBUG == "true" ? `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
  } catch (error) {
    return resultResponse(SERVER_ERROR, "Error in validateFancy" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
  }
}

let validateUserBeforeBetFancyPlace = (data) => {
  try {
    return userService.getUserDetails(
      { _id: data.user_id, user_type_id: 1 },
      [
        "userSettingSportsWise",
        "partnerships",
        "self_lock_fancy_bet",
        "parent_lock_fancy_bet",
        "self_lock_user",
        "parent_lock_user",
        "belongs_to",
        "self_close_account",
        "parent_close_account",
        "session_commission",
        "check_event_limit",
        "sessions_liability",
        "last_bet_place_time",
        "is_demo",
      ],
      [
        // here we need to remove extra sports_settings fields in future versions.
        {
          path: "userSettingSportsWise",
          match: { "sports_settings.sport_id": data.sport_id },
          select: "sports_settings.$ parent_commission",
        },
        {
          path: "partnerships",
          match: { "sports_share.sport_id": data.sport_id },
          select: "sports_share.percentage.share.$ sports_share.percentage.user_id",
        },
      ],
    ).then(async user => {
      if (user.statusCode == SUCCESS) {
        user = user.data;

        const { userSettingSportsWise, partnerships } = user;
        let { sports_settings, parent_commission } = userSettingSportsWise;
        let { sports_share } = partnerships;
        Object.assign(user, sports_settings[0], { commission: parent_commission }, { partnerships: sports_share[0].percentage });

        const { fancy } = data;

        if (!FANCY_LIVE_LIMITES_FOR.includes((user.belongs_to || LABEL_CHIP_SUMMARY))) {
          let isValidStacks = validateStackLimites({ user, fancy, data });
          if (isValidStacks.statusCode == VALIDATION_ERROR)
            return resultResponse(VALIDATION_ERROR, isValidStacks.data);
        }

        if (!sports_settings.length)
          return resultResponse(VALIDATION_ERROR, `User sport settings not found!`);

        if (!parent_commission.length)
          return resultResponse(VALIDATION_ERROR, `User parent commissions not found!`);

        if (!sports_share.length)
          return resultResponse(VALIDATION_ERROR, `User partnerships not found!`);

        if (Math.max(user.self_lock_fancy_bet, user.parent_lock_fancy_bet) == 1)
          return resultResponse(VALIDATION_ERROR, `Your session betting is locked!`);

        let betPlaceHoldTime = (user.session_bet_delay == 0) ? 1 : user.session_bet_delay;

        if (user.self_lock_fancy_bet == 2) {
          if (user.last_bet_place_time !== undefined) {
            let differenceInSeconds = Math.floor((Date.now() - user.last_bet_place_time) / 1000);
            if (differenceInSeconds < betPlaceHoldTime)
              return resultResponse(VALIDATION_ERROR, "Only one bet at a time is allowed!");
          }
        }

        if (Math.max(user.self_lock_user, user.parent_lock_user) == 1)
          return resultResponse(VALIDATION_ERROR, "Your account is locked!");

        if (Math.max(user.self_close_account, user.parent_close_account) == 1)
          return resultResponse(VALIDATION_ERROR, "Your account is closed!");

        return resultResponse(SUCCESS, Object.assign(data, { user }));
      } else if ([NOT_FOUND, SERVER_ERROR].includes(user.statusCode))
        return resultResponse(NOT_FOUND, user.data + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
      else
        return resultResponse(NOT_FOUND, "Not an valid user" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
    }).catch(error => resultResponse(SERVER_ERROR, "Error in user settings:" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
  }
  catch (error) {
    return resultResponse(SERVER_ERROR, "User validation error" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : ""));
  }
}

let validateFancyBetLiabilityBeforeBetPlace = async (data) => {

  let p_l, liability,
    stack = Number(data.stack),
    size = data.size;
  if (data.is_back == 1) {
    liability = stack;
    p_l = stack * (size / 100);
  } else {
    p_l = stack;
    liability = stack * (size / 100);
  }

  data.profit = p_l;
  data.liability = -liability;
  data.stack = stack;
  data.size = size;

  return fancyService.getFancyPosition(data.user_id, data.fancy_id).then(teamPosition => {
    if (teamPosition.statusCode == SERVER_ERROR)
      return resultResponse(SERVER_ERROR, teamPosition.data);
    teamPosition = teamPosition.data;
    return fancyService.createFancyPosition(data.user_id, data.fancy_id, data).then(async createFancyPosition => {
      if (createFancyPosition.statusCode == SERVER_ERROR)
        return resultResponse(SERVER_ERROR, createFancyPosition.data);
      createFancyPosition = createFancyPosition.data;
      let oldUserMaxLoss = teamPosition.liability;
      let userMaxLoss = parseInt(createFancyPosition.liability);
      let userMaxProfit = createFancyPosition.profit;

      let userBalanceFromDB = await User.findOne({ _id: data.user_id, user_type_id: 1 }, { balance: 1, liability: 1 }, { session: data.session }).lean();

      if (userBalanceFromDB.balance < 0) {
        return resultResponse(VALIDATION_ERROR, `${userBalanceFromDB.balance} balance in your account!`);
      }

      data.user = Object.assign(data.user, userBalanceFromDB);

      data.old_balance = userBalanceFromDB.balance;
      data.old_liability = userBalanceFromDB.liability;

      let userBalance = parseFloat(data.user.balance) + Math.abs(oldUserMaxLoss);

      let tempUserBalance = userMaxLoss > 0 ? 0 : userMaxLoss;
      if (Math.abs(tempUserBalance) > userBalance) {
        let msg;
        if (data.user.belongs_to == LABEL_DIAMOND) {
          msg = "Bet Not Confirm Check Balance."
        }
        else {
          msg = "Insufficient Balance"
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }

      if (data.user.check_event_limit)
        if (userMaxProfit > data.fancy.session_max_profit && data.fancy.session_max_profit != 0)
          return resultResponse(VALIDATION_ERROR, `Session max profit(${data.fancy.session_max_profit}) limit is over`);

      if (data.user.session_max_profit == 0 && userMaxProfit > VALIDATION.session_max_profit_max_limit)
        return resultResponse(VALIDATION_ERROR, `Your max profit(${VALIDATION.session_max_profit_max_limit}) limit is over.`);
      else if (data.user.session_max_profit != 0 && userMaxProfit > data.user.session_max_profit)
        return resultResponse(VALIDATION_ERROR, `Your max profit(${data.user.session_max_profit}) limit is over.`);

      data.selection_name = data.fancy_name;
      await checkFraudBets(BetsFancy, data, { fancy_id: data.fancy_id });
      let distribution =
        _.map(data.user.partnerships, function (partnerships, index) {
          return _.merge(
            partnerships,
            { index },
            _.find(data.user.commission, { user_id: partnerships.user_id })
          )
        });

      if (userMaxLoss >= 0) {
        data.liability_per_bet = oldUserMaxLoss >= 0 ? 0 : Math.abs(oldUserMaxLoss);
        data.final_user_liability = 0;
      } else {
        data.liability_per_bet = (Math.abs(oldUserMaxLoss) - Math.abs(userMaxLoss));
        data.final_user_liability = userMaxLoss;
      }
      createFancyPosition.bets_fancies[createFancyPosition.fancyListDataIndex].liability = data.liability;
      createFancyPosition.bets_fancies[createFancyPosition.fancyListDataIndex].profit = data.profit;
      let fancy_score_position = {
        user_id: data.user_id,
        user_name: data.user_name,
        ...data.eventDetails,
        session_commission: data.user.session_commission,
        is_demo: data.user.is_demo,
        domain_name: data.domain_name,
        stack: createFancyPosition.stack_sum,
        liability: data.final_user_liability,
        profit: userMaxProfit,
        fancy_score_position_json: createFancyPosition.fancy_position,
        bets_fancies: createFancyPosition.bets_fancies,
        distribution
      };
      if (!data.user.hasOwnProperty("sessions_liability"))
        data.user.sessions_liability = {};
      let sessions_liability = {};
      sessions_liability[data.fancy_id] = {
        liability: userMaxLoss
      }
      data.user_commission = data.user.session_commission;
      data.is_demo = data.user.is_demo;
      data.sessions_liability = Object.assign(data.user.sessions_liability, sessions_liability);
      data.distribution = distribution;
      data.stack_inverse = -(data.stack);
      data.fancy_score_position = fancy_score_position;
      data.fancy_score_position_id = teamPosition._id;
      data.liability_per_bet = (data.liability_per_bet).toFixed(2);

      return resultResponse(SUCCESS, data);
    }).catch(error => resultResponse(SERVER_ERROR, "Error in create FancyPosition" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
  }).catch(error => resultResponse(SERVER_ERROR, "Error in Fancy Position" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
}

let checkFancyStatusByRedis = async (data, domain_name = undefined) => {
  let msg;
  return apiUrlSettingsService.checkFancyStatus().then(fromApi => {
    if (fromApi == undefined)
      return resultResponse(VALIDATION_ERROR, "Error code: checkFancyStatus");
    let betFairFancy;
    if (fromApi == "A")
      betFairFancy = exchangeService.getFancyLastRate(data.fancy.centralId);
    else if (fromApi == "DB")
      betFairFancy = fancyService.getFancyByFancyId(data.fancy_id);
    else
      betFairFancy = exchangeService.getFancyByFancyId(data.fancy_id);
    return betFairFancy.then(async betFairFancy => {
      betFairFancy = betFairFancy.data;
      if (betFairFancy == null)
        return resultResponse(VALIDATION_ERROR, "Fancy Closed!");
      if (betFairFancy.length == 0)
        return resultResponse(VALIDATION_ERROR, "Fancy Closed!");
      if (betFairFancy.GameStatus != '') {
        if (data.user.belongs_to == LABEL_DIAMOND) {
          msg = 'Bet Not Confirmed due to game suspense.'
        } else {
          msg = "Fancy Suspended!"
        }
        return resultResponse(VALIDATION_ERROR, msg);
      }
      if (betFairFancy.MarkStatus == '1')
        return resultResponse(VALIDATION_ERROR, "Fancy Rate Changed!");
      const prefixPrice = data.is_back == 1 ? 'BackPrice' : 'LayPrice';
      const prefixSize = data.is_back == 1 ? 'BackSize' : 'LaySize';
      let isBothMatched = false;
      const length = betFairFancy.backLayLength || 1;

      for (let i = 1; i <= length; i++) {
        const price = betFairFancy[`${prefixPrice}${i}`];
        const size = betFairFancy[`${prefixSize}${i}`];
        if (price == data.run && size == data.size) {
          isBothMatched = true;
          break;
        }
      }

      if (!isBothMatched) {
        return resultResponse(VALIDATION_ERROR, "Run Changed!");
      }

      // if (data.is_back == 1) {
      //   if (betFairFancy.BackPrice1 != data.run)
      //     return resultResponse(VALIDATION_ERROR, "Run Changed!");
      //   if (betFairFancy.BackSize1 != data.size)
      //     return resultResponse(VALIDATION_ERROR, "Size Changed!");
      // } else {
      //   if (betFairFancy.LayPrice1 != data.run)
      //     return resultResponse(VALIDATION_ERROR, "Run Changed!");
      //   if (betFairFancy.LaySize1 != data.size)
      //     return resultResponse(VALIDATION_ERROR, "Size Changed!");
      // }
      // if (FANCY_LIVE_LIMITES_FOR.includes((data.user.belongs_to || LABEL_CHIP_SUMMARY))) {
      const liveMin = betFairFancy.hasOwnProperty("Min")
        , liveMax = betFairFancy.hasOwnProperty("Max")
      let { session_live_odds_validation } = data.fancy;
      let getWebsiteSettings =
        await websiteService.getWebsiteSettingsFromCache({ domain_name });
      let diamond_rate_limit_enabled = false;
      if (getWebsiteSettings.statusCode == SUCCESS) {
        diamond_rate_limit_enabled =
          getWebsiteSettings.data.diamond_rate_limit_enabled;
      }
      if (diamond_rate_limit_enabled) {
        if (data.user.check_event_limit) {
          if (session_live_odds_validation) {
            if (liveMin) {
              if (data.user.belongs_to == LABEL_DIAMOND) {
                msg = 'Bet not confirm Min-Max Bet Limit.'
              } else {
                msg = `Live session min stack is ${betFairFancy.Min}`
              }
              if (betFairFancy.Min > data.stack)
                return resultResponse(
                  VALIDATION_ERROR,
                  msg
                );
            }
            if (liveMax) {
              if (betFairFancy.Max < data.stack) {
                if (data.user.belongs_to == LABEL_DIAMOND) {
                  msg = 'Bet not confirm Min-Max Bet Limit.'
                } else {
                  msg = `Live session max stack is ${betFairFancy.Max}`
                }
                return resultResponse(
                  VALIDATION_ERROR,
                  msg
                );
              }
            }
          }
        }
        else {
          session_live_odds_validation = false;
        }
      } else {
        session_live_odds_validation = false;
      }
      if (!liveMin || !liveMax || !session_live_odds_validation) {
        let isValidStacks = validateStackLimites({ user: data.user, fancy: data.fancy, data });
        if (isValidStacks.statusCode == VALIDATION_ERROR)
          return resultResponse(VALIDATION_ERROR, isValidStacks.data);
      }
      // }
      return resultResponse(SUCCESS, data);
    }).catch(error => resultResponse(SERVER_ERROR, "Error in Fancy " + (fromApi ? "DB" : "cache") + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
  }).catch(error => resultResponse(SERVER_ERROR, "Error while checking fancy status from [cache,db]" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : "")));
};

let saveFancyBetV1 = async (data, liability) => {

  const { session } = data;

  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };

  try {

    const BET_NOT_PLACED = "Bet not placed! ";

    const sessions_liability = data.sessions_liability;

    await session.withTransaction(async () => {

      try {
        await BetsFancy.create([data], { session });
      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `BFC_E ${error.message}` : ''));
      }

      try {

        if (data.fancy_score_position_id == 0)
          await FancyScorePosition.create([data.fancy_score_position], { session });
        else
          await FancyScorePosition.updateOne({ _id: data.fancy_score_position_id }, data.fancy_score_position).session(session);

      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `FSP_E ${error.message}` : ''));
      }

      try {

        const LOG_REF_CODE = generateReferCode();

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: saveFancyBetV1
          EVENT_DETAILS: fancy_id(${data.fancy_id})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${data.user_name}(${data.user_id})] old_balance: ${data.old_balance} - old_liability: ${data.old_liability} - cal_liability: ${liability}
        `);

        await User.updateOne(
          { _id: data.user_id },
          [
            {
              '$set': {
                balance: { '$add': ["$balance", liability] },
                liability: { '$add': ["$liability", liability] }
              }
            }
          ],
          { runValidators: true, context: 'query' }
        ).session(session);

        const user = await User.findOne({ _id: data.user_id }).select("-_id balance liability").session(session).lean();

        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: saveFancyBetV1
          EVENT_DETAILS: fancy_id(${data.fancy_id})
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${data.user_name}(${data.user_id})] new_balance: ${user.balance} - new_liability: ${user.liability} - cal_liability: ${liability}
        `);

        if ((exponentialToFixed(user.liability) > 0) ? true : (exponentialToFixed(user.balance) < 0) ? true : false) {
          sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${data.user_name}(${data.user_id}) : balance ${user.balance}, liability ${user.liability}` });
        }

        await User.updateOne(
          { _id: data.user_id },
          { sessions_liability },
          { upsert: true, setDefaultsOnInsert: true }
        ).session(session);

        if (!data?.is_demo) {
          Fancy.updateOne(
            { fancy_id: data.fancy_id },
            { '$inc': { bet_count: 1 } },
          ).lean().then().catch(console.error);

          Match.updateOne(
            { match_id: data.match_id },
            { '$inc': { bet_count: 1 } },
          ).lean().then().catch(console.error);

          // check market Analysis data start 
          checkMarketAnalysis(data);
          // check market Analysis data end 

          // Update Bet Count
          data.type = 2; data.event_id = data.fancy_id;
          addUpdateBetCount(data);
        }
      } catch (error) {
        throw new Error(`${BET_NOT_PLACED} ` + (process.env.DEBUG == "true" ? `UU_E ${error.message}` : ''));
      }

    }, transactionOptions);

    return resultResponse(SUCCESS, `Bet placed Successfully`);

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    session.endSession();
  }

}

let myBets = (params) => {
  let query = betQueryService.myBetsQuery(params);
  return BetsOdds.aggregate(query).then(bets => {
    if (bets.length)
      return resultResponse(SUCCESS, bets);
    else
      return resultResponse(NOT_FOUND, "No bet(s) found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getExposures = (user_id) => {
  return userService.getUserDetails(
    { _id: user_id }, ["-_id", "markets_liability", "sessions_liability"]
  ).then(userDetails => {
    if (userDetails.statusCode == SUCCESS) {
      userDetails = userDetails.data;
      let markets = [""], fancies = [""];
      let marketsIds = {}, marketsLiability = {};
      if (userDetails.hasOwnProperty("markets_liability")) {
        marketsIds = Object.keys(userDetails["markets_liability"]);
        marketsLiability = userDetails["markets_liability"];
        if (marketsIds.length)
          markets = marketsIds;
      }
      let fancyIds = {}, sessionsLiability = {};
      if (userDetails.hasOwnProperty("sessions_liability")) {
        fancyIds = Object.keys(userDetails["sessions_liability"]);
        sessionsLiability = userDetails["sessions_liability"];
        if (fancyIds.length)
          fancies = fancyIds;
      }
      let query = betQueryServiceAdmin.getExposuresQuery(markets, fancies);
      return Market.aggregate(query).then(eventData => {
        let eventIds = { ...marketsLiability, ...sessionsLiability };
        let liabilitySum = 0;
        eventData = eventData.map(data => {
          if (eventIds[data.event_id]) {
            liabilitySum += eventIds[data.event_id].liability;
            return { ...data, liability: eventIds[data.event_id].liability };
          }
        });
        eventData.push({ liabilitySum });
        if (eventData.length)
          return resultResponse(SUCCESS, eventData);
        else
          return resultResponse(NOT_FOUND, "No exposures found!");
      }).catch(error => resultResponse(SERVER_ERROR, error.message));
    } else
      return resultResponse(NOT_FOUND, "No exposures found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

let checkFraudBets = async (Model, data, params) => {
  try {
    let getSameIpBets = await Model.find({
      ...params, ip_address: data.ip_address, delete_status: 0, is_fraud_bet: 0
    }).select("-_id user_name");
    if (getSameIpBets.length) {
      getSameIpBets.push({ user_name: data.user_name });
      let is_fraud_user = !(getSameIpBets.map(data => data.user_name).every((val, i, element) => val == element[0]));
      if (is_fraud_user) {
        let user1 = getSameIpBets[getSameIpBets.length - 2].user_name
          , user2 = getSameIpBets[getSameIpBets.length - 1].user_name;
        data.is_fraud_bet = 1;
        data.is_fraud_bet_comment = `Same IP address used for a bet place. [(${user1},${user2}) ${data.ip_address}]`;
      }
    }
    let getLastBet = await Model.findOne({
      ...params, user_name: data.user_name, delete_status: 0
    }).select("-_id selection_id selection_name is_back createdAt").sort("-createdAt");
    if (getLastBet) {
      const TWO_MIN = 2 * 60 * 1000;
      let lastBetPlaceTime = getLastBet.createdAt
        , currentTime = new Date();
      if ((currentTime - new Date(lastBetPlaceTime)) < TWO_MIN) {
        if (getLastBet.is_back != data.is_back) {
          let previousBetMessage = `${getLastBet.selection_name ? getLastBet.selection_name : data.selection_name}(${getLastBet.selection_id}) ${getLastBet.is_back ? "Back" : "Lay"}`
            , currentBetMessage = `${data.selection_name}(${data.selection_id}) ${data.is_back ? "Back" : "Lay"}`;
          data.is_fraud_bet = 2;
          data.is_fraud_bet_comment = `Trading bets [${previousBetMessage} - ${currentBetMessage}]`;
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}

let validateStackLimites = (params) => {
  let { user, fancy, data } = params;
  let isValid = resultResponse(SUCCESS, "");
  let msg;
  if (user.check_event_limit) {

    if (fancy.session_min_stack > data.stack) {
      if (user.belongs_to == LABEL_DIAMOND) {
        msg = 'Bet not confirm Min-Max Bet Limit.'
      } else {
        msg = `Session min stack is ${fancy.session_min_stack}`;
      }
      isValid = resultResponse(VALIDATION_ERROR, msg);
    }
    if (fancy.session_max_stack < data.stack) {
      if (user.belongs_to == LABEL_DIAMOND) {
        msg = 'Bet not confirm Min-Max Bet Limit.'
      } else {
        msg = `Session max stack is ${fancy.session_max_stack}`;
      }
      isValid = resultResponse(VALIDATION_ERROR, msg);
    }

  } else {

    if (user.session_min_stack && user.session_min_stack > data.stack) {
      if (user.belongs_to == LABEL_DIAMOND) {
        msg = 'Bet not confirm Min-Max Bet Limit.'
      } else {
        msg = `Your min stack is ${user.session_min_stack}`;
      }
      isValid = resultResponse(VALIDATION_ERROR, msg);
    }
    if (user.session_max_stack == 0 && VALIDATION.session_max_stack_max_limit < data.stack) {
      if (user.belongs_to == LABEL_DIAMOND) {
        msg = 'Bet not confirm Min-Max Bet Limit.'
      } else {
        msg = `Your max stack is ${VALIDATION.session_max_stack_max_limit}`;
      }
      isValid = resultResponse(VALIDATION_ERROR, msg);
    }
    else if (user.session_max_stack != 0 && user.session_max_stack < data.stack) {
      if (user.belongs_to == LABEL_DIAMOND) {
        msg = 'Bet not confirm Min-Max Bet Limit.'
      } else {
        msg = `Your max stack is ${user.session_max_stack}`;
      }
      isValid = resultResponse(VALIDATION_ERROR, msg);
    }
  }
  return isValid;
}

let checkMarketAnalysis = (data) => {
  try {
    MarketAnalysis.findOne({
      user_id: data.user_id, match_id: data.match_id
    }).then(market_analysis => {
      if (market_analysis == null)
        MarketAnalysis.create({
          user_id: data.user_id, match_id: data.match_id, parent_ids: data.parents.map(data => data.user_id.toString())
        }).then().catch();
    }).catch(console.error);
  } catch (error) {
    console.error(error);
  }
}

let addUpdateBetCount = async (data) => {
  try {
    await BetCounts.updateOne(
      {
        user_id: data.user_id,
        match_id: data.match_id,
        event_id: data.event_id,
        type: data.type,
      },
      {
        '$set': {
          user_id: data.user_id, user_name: data.user_name,
          event_id: data.event_id,
          match_id: data.match_id, type: data.type,
          last_update_type: 1,
          parent_ids: [...data.parents.map(data => data), { user_id: data.user_id, user_name: data.user_name }],
        }, '$inc': { bet_count: 1 }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error(error);
  }
}

let bookmakerRateConvert = (odds) => ((odds / 100) + 1);

let toFix = (rate) => (Math.round((rate + Number.EPSILON) * 100) / 100);

let checkRateRange = (placedRate, currentRate, market_rate_range) => {
  let current_rate_diff = (parseFloat(placedRate) - parseFloat(currentRate));
  return (market_rate_range !== 0) ? (toFix(current_rate_diff) <= toFix(market_rate_range)) : true;
}

async function validateBetLockStatus(data, filter) {
  let betLock = data.parents.map(data => (data.user_id).toString());
  betLock.push(data.user_id.toString());

  let betLockFilter = { ...filter, bet_lock: { "$in": betLock } };
  let getBetLockStatus = await BetLock.findOne(betLockFilter).select("_id").lean().exec();
  if (getBetLockStatus) {
    return resultResponse(VALIDATION_ERROR, "Game is locked. Please Contact Upper Level.");
  }
}

function validateEventLock(data, event) {

  let blockedUsers = data.parents.map(data => (data.user_id).toString());
  blockedUsers.push(data.user_id.toString());
  const self_blocked = blockedUsers.some(element => event.self_blocked.includes(element));
  const parent_blocked = blockedUsers.some(element => event.parent_blocked.includes(element));

  if ((event.self_blocked.length && self_blocked) || (event.parent_blocked.length && parent_blocked)) {
    return resultResponse(VALIDATION_ERROR, `Game is locked. Please Contact Upper Level3.`);
  }

}

module.exports = {
  validateMarketBeforeBetPlace, validateUserBeforeBetPlace, validateBetAndRedisOddsWhileBetPlacing, saveBetV1, saveHrBet,
  validateFancyBeforeBetPlace, validateUserBeforeBetFancyPlace, validateFancyBetLiabilityBeforeBetPlace, checkFancyStatusByRedis, saveFancyBetV1,
  myBets, getExposures, multipleBetPreValidation
}