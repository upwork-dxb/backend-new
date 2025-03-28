const { ObjectId } = require("bson")
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , mongoose = require('mongoose')
  , User = require('../../models/user')
  , publisher = require("../../connections/redisConnections")
  , CONSTANTS = require('../../utils/constants')
  , validationConstant = require('../../utils/validationConstant')
  , marketsService = require('../service/marketsService')
  , userService = require('../service/userService')
  , betService = require('../service/betService')
  , marketAnalysis = require('../service/marketAnalysis')
  , betController = require('../../admin-backend/controllers/betController')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , { getIpDetails } = require('../../utils');
const { STATUS_500, STATUS_200, STATUS_422 } = require("../../utils/httpStatusCode");

const { getBetUID } = require("../../utils/getter-setter");
const { concurrencyCheck,
  deleteConcurrencyById, } = require("../../admin-backend/service/concurrencyControl");

module.exports = class BetController {

  static async saveBet(req, res) {
    let ccId;
    try {

      const { market_id } = req.body;

      const validationObject = {
        market_id: Joi.string().required(),
        selection_id: Joi.number().required(),
        odds: Joi.number().greater(validationConstant.market_min_odds_rate).precision(2).required(),
        stack: Joi.number().integer().min(1).required(),
        is_back: Joi.string().valid(0, 1).required(),
        type: Joi.optional().default(null),
        roundId: Joi.optional().default(null),
        is_hr_bet: Joi.boolean().optional().default(false),
      };

      if (req.body?.is_hr_bet) {
        validationObject["selection_name"] = Joi.string().optional();
        validationObject["stack_sum"] = Joi.number().integer().min(1).required();
        validationObject["betMeta"] = Joi.array().required();
        validationObject["createdAt"] = Joi.optional();
        validationObject["hr_bet_id"] = JoiObjectId.objectId().optional();
      }

      try {
        // Lotus casino bet place.
        if (market_id.includes(CONSTANTS.LIVE_GAME_SPORT_ID.toString())) {
          validationObject["type"] = Joi.string().required();
          validationObject["roundId"] = Joi.string().required();
        }
        // Diamond casino bet place.
        if (market_id.includes(CONSTANTS.DIAMOND_CASINO_SPORT_ID))
          validationObject["type"] = Joi.string().required();
      } catch (error) {
        console.error(market_id);
        return ResError(res, { msg: "Casino market id not valid!", statusCode: STATUS_500 });
      }

      return Joi.object(validationObject).validateAsync(req.body, { abortEarly: false })
        .then(async betData => {
          try {

            const user_id = ObjectId(req.User.user_id || req.User._id)
              , user_name = req.User.user_name, domain_name = req.User.domain_name, parents = req.User.parent_level_ids;

            if (req.User.user_type_id != 1 || !user_id)
              return ResError(res, { msg: "Not a valid user!" });

            // Check Concurrency 

            const betPlaceKey = getBetUID(user_id);
            // Create a new Entry for result CC;
            // If Server Error that means Entry already Exists;
            const ccResponse = await concurrencyCheck(betPlaceKey, 1);
            if (ccResponse.statusCode == CONSTANTS.SERVER_ERROR) {
              return ResError(res, { msg: 'Only one bet at a time is allowed!', statusCode: STATUS_422 });
            }
            ccId = ccResponse?.data?.cc?._id;

            try {
              let marketValidationStatus = await betService.validateMarketBeforeBetPlace(Object.assign(betData, { user_id, user_name, domain_name, parents, ip_address: req.ip_data, hr_unmatch_bet: req.hr_unmatch_bet }));

              if (marketValidationStatus.statusCode != CONSTANTS.SUCCESS) {
                if (marketValidationStatus.statusCode == CONSTANTS.VALIDATION_ERROR)
                  publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);

                // Delete Concurrency Control Entry
                deleteConcurrencyById(ccId)
                if (req?.is_hr_bet) return { status: false, msg: marketValidationStatus.data };
                return ResError(res, { msg: marketValidationStatus.data, statusCode: STATUS_200 });
              }

              marketValidationStatus = marketValidationStatus.data;

              try {
                let userValidationStatus = await betService.validateUserBeforeBetPlace(marketValidationStatus);

                if (userValidationStatus.statusCode != CONSTANTS.SUCCESS) {
                  if (userValidationStatus.statusCode == CONSTANTS.VALIDATION_ERROR)
                    publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);

                  // Delete Concurrency Control Entry
                  deleteConcurrencyById(ccId);
                  if (req?.is_hr_bet) return { status: false, msg: userValidationStatus.data };
                  return ResError(res, { msg: userValidationStatus.data, statusCode: STATUS_422 });
                }

                userValidationStatus = userValidationStatus.data;

                let market_bet_delay = userValidationStatus.user.market_bet_delay != undefined ? userValidationStatus.user.market_bet_delay : validationConstant.market_bet_delay;

                if (marketValidationStatus.market.market_type == CONSTANTS.BOOKMAKER_TYPE)
                  market_bet_delay = 0;
                if (betData.is_hr_bet)
                  market_bet_delay = 0;

                if (!req?.is_hr_bet)
                  await User.updateOne({ _id: user_id }, { self_lock_betting: 2, self_lock_fancy_bet: 2, last_bet_place_time: new Date() }).then().catch(console.error);

                setTimeout(async function () {

                  try {
                    let validateBetAndRedisOddsWhileBetPlacingStatus = await betService.validateBetAndRedisOddsWhileBetPlacing(userValidationStatus);

                    if (validateBetAndRedisOddsWhileBetPlacingStatus.statusCode != CONSTANTS.SUCCESS) {
                      if (validateBetAndRedisOddsWhileBetPlacingStatus.statusCode == CONSTANTS.VALIDATION_ERROR)
                        publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);
                      User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                      // Delete Concurrency Control Entry
                      deleteConcurrencyById(ccId);
                      if (req?.is_hr_bet) return { status: false, msg: validateBetAndRedisOddsWhileBetPlacingStatus.data };
                      return ResError(res, { msg: validateBetAndRedisOddsWhileBetPlacingStatus.data, statusCode: STATUS_422 });
                    }

                    if (req?.is_hr_bet) {
                      // Delete Concurrency Control Entry
                      deleteConcurrencyById(ccId);
                      return { status: true };
                    }
                    const mobile = req.User.mobile ? true : false;
                    const browser = req.headers['user-agent'], device_info = browser || "Localhost", ip_address = req.ip_data,
                      geolocation = await getIpDetails(ip_address)
                      , betData = { ...validateBetAndRedisOddsWhileBetPlacingStatus.data, device_info, ip_address, geolocation, mobile };
                    let liabilityForBlance = parseFloat(betData.liability_per_bet);

                    try {
                      let betPlacedResponse = await betService.saveBetV1(betData, liabilityForBlance);

                      User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);
                      publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);


                      // Delete Concurrency Control Entry
                      deleteConcurrencyById(ccId);
                      if (betPlacedResponse.statusCode != CONSTANTS.SUCCESS)
                        return ResError(res, { msg: betPlacedResponse.data });
                      return ResSuccess(res, betPlacedResponse.data);

                    } catch (error) {
                      User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                      // Delete Concurrency Control Entry
                      deleteConcurrencyById(ccId);
                      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
                    }

                  } catch (error) {
                    User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                    // Delete Concurrency Control Entry
                    deleteConcurrencyById(ccId);
                    return ResError(res, { msg: error.message, statusCode: STATUS_500 });
                  }

                }, (market_bet_delay) * 1000);

              } catch (error) {
                User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                // Delete Concurrency Control Entry
                deleteConcurrencyById(ccId);
                return ResError(res, { msg: error.message, statusCode: STATUS_500 });
              }

            } catch (error) {

              // Delete Concurrency Control Entry
              deleteConcurrencyById(ccId);
              return ResError(res, { msg: error.message, statusCode: STATUS_500 });
            }
          } catch (error) {

            // Delete Concurrency Control Entry
            deleteConcurrencyById(ccId);
            return ResError(res, { msg: `Error occured while placing bet! ${error.message}`, statusCode: STATUS_500 });
          }
        }).catch(error => {

          // Delete Concurrency Control Entry
          deleteConcurrencyById(ccId);
          if (req?.is_hr_bet)
            return { status: false, msg: error.details.map(data => data.message).toString(), statusCode: STATUS_422 };
          return ResError(res, { msg: error.details.map(data => data.message).toString(), statusCode: STATUS_422 });
        });

    } catch (error) {

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId);
      if (req?.is_hr_bet)
        return { status: false, msg: error.message, statusCode: STATUS_500 };
      return ResError(res, { msg: "Error occured while placing bet!", statusCode: STATUS_500 });
    }

  }

  static async saveHrBet(req, res) {
    try {
      let responseMsg = [], { body } = req, betMeta = JSON.parse(JSON.stringify(body)), prevalidateMessage = "";
      // Calculating the stacks sums.
      const stack_sum = body.reduce((accumulator, currentObject) => (accumulator + currentObject.stack), 0)
        , hr_bet_id = new mongoose.Types.ObjectId(), createdAt = new Date();
      req.is_hr_bet = true;
      let multipleBetPreValidation = await betService.multipleBetPreValidation(req);
      if (multipleBetPreValidation.statusCode != CONSTANTS.SUCCESS)
        return ResError(res, { msg: multipleBetPreValidation.data });
      // Pre bet validation.
      for await (const betData of body) {
        req.body = betData;
        req.body["stack_sum"] = stack_sum;
        req.body["betMeta"] = betMeta;
        req.body["hr_bet_id"] = hr_bet_id;
        req.body["createdAt"] = createdAt;
        let preValidation = await BetController.saveBet(req, res);
        if (preValidation) {
          if (!preValidation?.status) {
            prevalidateMessage = preValidation.msg;
            responseMsg.push(`${req.body["selection_name"]}`);
          }
        }
      }
      if (responseMsg.length)
        return ResError(res, { msg: `[${responseMsg.toString()}] ${prevalidateMessage}` });
      req.is_hr_bet = undefined; req.hr_unmatch_bet = true;
      responseMsg = [];
      let responseCode = [];
      for await (const betData of body) {
        req.body = betData;
        let betPlacedResponse = await betService.saveHrBet(req);
        responseCode.push(betPlacedResponse.statusCode);
        responseMsg.push(betPlacedResponse.data.msg);
      }
      if (responseCode.includes(CONSTANTS.VALIDATION_ERROR))
        return ResError(res, { msg: [...new Set(responseMsg)].toString(), statusCode: STATUS_422 });
      return ResSuccess(res, [...new Set(responseMsg)].toString());
    } catch (error) {
      return ResError(res, { msg: "Error occured while placing bet!", statusCode: STATUS_500 });
    }
  }

  static getTeamPosition(req, res) {
    return Joi.object({
      match_id: Joi.optional(),
      market_id: Joi.optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ match_id, market_id }) => {
        const user_id = ObjectId(req.User.user_id || req.User._id);
        return marketsService.getTeamPosition(user_id, match_id, market_id).then(teamData => {
          if (teamData.statusCode != CONSTANTS.SUCCESS)
            return ResError(res, { msg: teamData.data, statusCode: STATUS_200 });
          if (teamData.data.length) {
            teamData = teamData.data;
            teamData = teamData.reduce((acc, obj) => {
              acc[obj.market_id] = [...acc[obj.market_id] || [], obj]; return acc;
            }, {});
            return ResSuccess(res, { data: teamData });
          }
          return ResError(res, { msg: "No data found!", data: {}, statusCode: STATUS_200 });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      })
  }

  static myBets(req, res) {
    return Joi.object({
      match_id: Joi.string().optional(),
      search: Joi.object({
        sport_id: Joi.string().optional(),
        sport_name: Joi.string().optional(),
        series_id: Joi.string().optional(),
        series_name: Joi.string().optional(),
        match_id: Joi.string().optional(),
        match_name: Joi.string().optional(),
        market_id: Joi.alternatives().try(Joi.array(), Joi.string()),
        market_name: Joi.string().optional(),
        fancy_id: Joi.alternatives().try(Joi.array(), Joi.string()),
        fancy_name: Joi.string().optional(),
        selection_id: Joi.number().optional(),
        selection_name: Joi.string().optional(),
        winner_name: Joi.string().optional(),
        type: Joi.number().optional(),
        odds: Joi.number().optional(),
        run: Joi.number().optional(),
        size: Joi.number().optional(),
        stack: Joi.number().optional(),
        is_back: Joi.number().valid(0, 1).optional(),
        p_l: Joi.number().optional(),
        liability: Joi.number().optional(),
        delete_status: Joi.array(),
        bet_result_id: Joi.optional(),
        createdAt: Joi.string().optional(),
        is_matched: Joi.number().optional(),
        _id: JoiObjectId.objectId().optional()
      }).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().min(10).max(150).default(10).optional(),
      page: Joi.number().min(1).max(100).default(1).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        if (data['search']['delete_status'])
          data['search']['delete_status'] = { '$in': data['search']['delete_status'] };
        const user_id = ObjectId(req.User.user_id || req.User._id);
        data.user_id = user_id;
        Object.assign(data, req["BetType"]);
        return betService.myBets(data).then(bets => {
          if (bets.statusCode != CONSTANTS.SUCCESS)
            return ResError(res, { msg: bets.data, statusCode: STATUS_200 });
          return ResSuccess(res, { data: bets.data });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static bets(req, res) {
    return Joi.object({
      match_id: Joi.string().required(),
      search: Joi.object({
        market_id: Joi.alternatives().try(Joi.array(), Joi.string()),
        fancy_id: Joi.alternatives().try(Joi.array(), Joi.string()),
        type: Joi.number().optional(),
        delete_status: Joi.array(),
      }).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        if (!req["BetType"]) {
          req["BetType"] = {};
          Object.assign(req.body, {
            search: {
              bet_result_id: null,
              ...req.body.search
            }
          });
        }
        req["BetType"]["IsBets"] = true;
        if (!req["BetType"]["IsPlBets"])
          req["body"]["search"]["bet_result_id"] = null;
        return BetController.myBets(req, res);
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static plBets(req, res) {
    req["BetType"] = {};
    req["BetType"]["IsPlBets"] = true;
    if (!req['body']['search'])
      req['body']['search'] = {};
    req['body']['search']['delete_status'] = [0, 2];
    return BetController.bets(req, res);
  }

  static openBets(req, res) {
    if (!req['body']['search'])
      req['body']['search'] = {};
    req['body']['search']['delete_status'] = [0, 2];
    req["body"]["search"]["bet_result_id"] = null;
    // if (!req["body"]["search"].hasOwnProperty("is_matched"))
    //   req["body"]["search"]["is_matched"] = 1;
    return BetController.myBets(req, res);
  }

  static diamondOpenBets(req, res) {
    if (!req['body']['search'])
      req['body']['search'] = {};
    if (req?.body?.search?.delete_status != undefined) {
      req['body']['search']['delete_status'] = req?.body?.search?.delete_status;
    } else {
      req['body']['search']['delete_status'] = [0, 2];
    }
    req["body"]["search"]["bet_result_id"] = null;
    return BetController.myBets(req, res);
  }

  static unmatchedBets(req, res) {
    if (!req['body']['search'])
      req['body']['search'] = {};
    req["body"]["search"]["is_matched"] = 0;
    return BetController.openBets(req, res);
  }

  static settledBets(req, res) {
    req["BetType"] = {};
    req["BetType"]["IsSettledBets"] = true;
    if (!req['body']['search'])
      req['body']['search'] = {};
    req['body']['search']['delete_status'] = [0, 2];
    return BetController.myBets(req, res);
  }

  static voidBets(req, res) {
    if (!req['body']['search'])
      req['body']['search'] = {};
    req['body']['search']['delete_status'] = [2];
    return BetController.myBets(req, res);
  }

  static diamondSettledBets(req, res) {
    Object.assign(req.body, {
      search: {
        bet_result_id: {
          '$ne': null
        },
        ...req.body.search,
      }
    });
    return BetController.myBets(req, res);
  }

  static userSettledBetList(req, res) {
    let type = "unsettle";
    if (req.body.hasOwnProperty("type"))
      type = req.body.type;
    delete req.body.type;
    if (!["unsettle", "settled", "void"].includes(type))
      return ResError(res, { msg: "Type must be unsettle, settled, void", statusCode: STATUS_422 });
    if (type == "unsettle")
      return BetController.openBets(req, res);
    else if (type == "settled")
      return BetController.settledBets(req, res);
    else if (type == "void")
      return BetController.voidBets(req, res);
  }

  static saveFancyBet(req, res) {

    let ccId;
    try {

      const validationObject = {
        fancy_id: Joi.string().required(),
        size: Joi.number().greater(0),
        run: Joi.number().required(),
        stack: Joi.number().integer().min(1).required(),
        is_back: Joi.string().valid(0, 1).required(),
      };

      return Joi.object(validationObject).validateAsync(req.body, { abortEarly: false })
        .then(async ({ fancy_id, size, run, stack, is_back }) => {
          try {

            const user_id = ObjectId(req.User.user_id || req.User._id);
            const user_name = req.User.user_name;
            const domain_name = req.User.domain_name;
            const parents = req.User.parent_level_ids;

            if (req.User.user_type_id != 1 || !user_id)
              return ResError(res, { msg: "Not a valid user!", statusCode: STATUS_422 });

            // Check Concurrency 
            const betPlaceKey = getBetUID(user_id);
            // Create a new Entry for result CC;
            // If Server Error that means Entry already Exists;
            const ccResponse = await concurrencyCheck(betPlaceKey, 1);
            if (ccResponse.statusCode == CONSTANTS.SERVER_ERROR) {
              return ResError(res, { msg: 'Only one bet at a time is allowed!', statusCode: STATUS_422 });
            }
            ccId = ccResponse?.data?.cc?._id;

            try {

              let fancyValidationStatus = await betService.validateFancyBeforeBetPlace({ user_id, user_name, domain_name, parents, fancy_id, size, run, stack, is_back, ip_address: req.ip_data });

              if (fancyValidationStatus.statusCode != CONSTANTS.SUCCESS) {
                if (fancyValidationStatus.statusCode == CONSTANTS.VALIDATION_ERROR) {
                  publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);
                }

                // Delete Concurrency Control Entry
                deleteConcurrencyById(ccId)
                return ResError(res, { msg: fancyValidationStatus.data, statusCode: STATUS_422 });
              }

              fancyValidationStatus = fancyValidationStatus.data;

              try {

                let validateUserBeforeBetFancyPlaceStatus = await betService.validateUserBeforeBetFancyPlace(fancyValidationStatus);

                if (validateUserBeforeBetFancyPlaceStatus.statusCode != CONSTANTS.SUCCESS) {
                  if (validateUserBeforeBetFancyPlaceStatus.statusCode == CONSTANTS.VALIDATION_ERROR) {
                    publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);
                  }

                  // Delete Concurrency Control Entry
                  deleteConcurrencyById(ccId)
                  return ResError(res, { msg: validateUserBeforeBetFancyPlaceStatus.data, statusCode: STATUS_422 });
                }

                validateUserBeforeBetFancyPlaceStatus = validateUserBeforeBetFancyPlaceStatus.data;

                await User.updateOne({ _id: user_id }, { self_lock_betting: 2, self_lock_fancy_bet: 2, last_bet_place_time: new Date() }).then().catch(console.error);

                let session_bet_delay = validateUserBeforeBetFancyPlaceStatus.user.session_bet_delay != undefined ? validateUserBeforeBetFancyPlaceStatus.user.session_bet_delay : validationConstant.session_bet_delay;

                setTimeout(async function () {

                  try {

                    let validateFancyBetLiabilityBeforeBetPlaceStatus = await betService.validateFancyBetLiabilityBeforeBetPlace(fancyValidationStatus);

                    if (validateFancyBetLiabilityBeforeBetPlaceStatus.statusCode != CONSTANTS.SUCCESS) {
                      if (validateFancyBetLiabilityBeforeBetPlaceStatus.statusCode == CONSTANTS.VALIDATION_ERROR) {
                        publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);
                      }
                      User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                      // Delete Concurrency Control Entry
                      deleteConcurrencyById(ccId)
                      return ResError(res, { msg: validateFancyBetLiabilityBeforeBetPlaceStatus.data, statusCode: STATUS_422 });
                    }

                    validateFancyBetLiabilityBeforeBetPlaceStatus = validateFancyBetLiabilityBeforeBetPlaceStatus.data;

                    try {

                      let checkFancyStatusByRedisStatus = await betService.checkFancyStatusByRedis(validateFancyBetLiabilityBeforeBetPlaceStatus, domain_name);

                      if (checkFancyStatusByRedisStatus.statusCode != CONSTANTS.SUCCESS) {
                        if (checkFancyStatusByRedisStatus.statusCode == CONSTANTS.VALIDATION_ERROR) {
                          publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);
                        }
                        User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                        // Delete Concurrency Control Entry
                        deleteConcurrencyById(ccId)
                        return ResError(res, { msg: checkFancyStatusByRedisStatus.data, statusCode: STATUS_422 });
                      }
                      const browser = req.headers['user-agent'];
                      const device_info = browser || "Localhost"
                      const ip_address = req.ip_data;
                      const geolocation = await getIpDetails(ip_address)
                      const mobile = req.User.mobile ? true : false
                      const betData = { ...checkFancyStatusByRedisStatus.data, device_info, ip_address, geolocation, mobile };
                      let liabilityForBlance = betData.liability_per_bet;

                      try {

                        let betPlacedResponse = await betService.saveFancyBetV1(betData, parseInt(liabilityForBlance));

                        User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);
                        publisher.del(user_name + CONSTANTS.BET_PLACE_TIME + CONSTANTS.UNIQUE_IDENTIFIER_KEY);

                        // Delete Concurrency Control Entry
                        deleteConcurrencyById(ccId)
                        if (betPlacedResponse.statusCode != CONSTANTS.SUCCESS)
                          return ResError(res, { msg: betPlacedResponse.data, statusCode: STATUS_200 });
                        return ResSuccess(res, betPlacedResponse.data);

                      } catch (error) {
                        console.error(error);
                        User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                        // Delete Concurrency Control Entry
                        deleteConcurrencyById(ccId)
                        return ResError(res, { msg: error.message, statusCode: STATUS_500 });
                      };

                    } catch (error) {
                      console.error(error);
                      User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                      // Delete Concurrency Control Entry
                      deleteConcurrencyById(ccId)
                      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
                    }

                  } catch (error) {
                    console.error(error);
                    User.updateOne({ _id: user_id }, { self_lock_betting: 0, self_lock_fancy_bet: 0, last_bet_place_time: new Date() }).then().catch(console.error);

                    // Delete Concurrency Control Entry
                    deleteConcurrencyById(ccId)
                    return ResError(res, { msg: error.message, statusCode: STATUS_500 });
                  }

                }, (session_bet_delay) * 1000);

              } catch (error) {
                console.error(error);

                // Delete Concurrency Control Entry
                deleteConcurrencyById(ccId)
                return ResError(res, { msg: error.message, statusCode: STATUS_500 });
              }

            } catch (error) {
              console.error(error);

              // Delete Concurrency Control Entry
              deleteConcurrencyById(ccId)
              return ResError(res, { msg: error.message, statusCode: STATUS_500 });
            }

          } catch (error) {
            console.error(error);

            // Delete Concurrency Control Entry
            deleteConcurrencyById(ccId)
            return ResError(res, { msg: `Error occured while placing bet! ${error.message}`, statusCode: STATUS_500 });
          }

        }).catch(error => {
          console.error(error);

          // Delete Concurrency Control Entry
          deleteConcurrencyById(ccId)
          return ResError(res, { msg: error.details.map(data => data.message).toString(), statusCode: STATUS_500 });
        });

    } catch (error) {
      console.error(error);

      // Delete Concurrency Control Entry
      deleteConcurrencyById(ccId)
      return ResError(res, { msg: "Error occured while placing bet!", statusCode: STATUS_500 });
    }

  }

  static getFancyLiability(req, res) {
    return Joi.object({
      match_id: Joi.string().optional(),
      fancy_id: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ match_id, fancy_id }) => {
        const user_id = ObjectId(req.User.user_id || req.User._id);
        let sessionFields = "sessions_liability";
        if (fancy_id)
          sessionFields = `${sessionFields}.${fancy_id}`;
        return userService.getUserDetails({ _id: user_id }, ["-_id", sessionFields]).then(liability => {
          if (liability.statusCode == CONSTANTS.NOT_FOUND)
            return ResSuccess(res, { data: {} });
          liability = liability.data.sessions_liability;
          let market_liability = {}, condition = (key) => match_id ? key.includes(match_id) : 1;
          Object.keys(liability).map(key => {
            if (liability[key].hasOwnProperty("liability"))
              if (condition(key)) market_liability[key] = liability[key].liability;
          });
          return ResSuccess(res, { data: market_liability });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getExposures(req, res) {
    const user_id = ObjectId(req.User.user_id || req.User._id);
    const user_name = `${req.User.name}(${req.User.user_name})`;
    return betService.getExposures(user_id).then(exposures => {
      if (exposures.statusCode != CONSTANTS.SUCCESS)
        return ResError(res, { msg: exposures.data, statusCode: STATUS_200 })
      if (exposures.data.length)
        return ResSuccess(res, { data: exposures.data, user_name });
      return ResError(res, { msg: "No data found!", data: {}, statusCode: STATUS_200 });
    }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static getExposuresV2(req, res) {
    return betController.getExposuresV2(req, res);
  }

  static marketAnalysis(req, res) {
    return marketAnalysis
      .getMarketAnalysis(req)
      .then((result) =>
        result.statusCode == CONSTANTS.SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }

}