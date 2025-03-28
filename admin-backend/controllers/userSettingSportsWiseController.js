const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ObjectId } = require("bson")
  , getCurrentLine = require('get-current-line')
  , Responder = require('../../lib/expressResponder')
  , { ResSuccess, ResError } = require('../../lib/expressResponder')
  , CONSTANTS = require('../../utils/constants')
  , { USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, SUCCESS } = require('../../utils/constants')
  , VALIDATION = require('../../utils/validationConstant')
  , userService = require('../service/userService')
  , User = require('../../models/user')
  , UserSettingSportWise = require('../../models/userSettingWiseSport')
  , userSettingSportWiseService = require('../service/userSettingSportsWiseService')
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_VALIDATION_FAILED, LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig')
const { STATUS_500, STATUS_422 } = require('../../utils/httpStatusCode');

module.exports = {
  // To get user settings sports wise
  getSportsWise: async function (req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      _id: JoiObjectId.objectId().optional(),
      sport_id: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ user_id, _id, sport_id }) => {
        try {
          let id = {};
          if (_id)
            id["_id"] = ObjectId(_id);
          if (!_id)
            if (!user_id)
              id["user_id"] = ObjectId(req.User.user_id || req.User._id);
            else
              id["user_id"] = ObjectId(user_id);
          let filter = ["-_id", "user_name", "sports_settings"];
          let matchUserSettingSportsPopulate = {};
          let selectUserSettingSportsPopulate = {
            select: "-_id sports_settings"
          };
          if (sport_id) {
            id["sports_settings.sport_id"] = sport_id;
            filter[filter.length - 1] = "sports_settings.$";
            matchUserSettingSportsPopulate = {
              match: { "sports_settings.sport_id": sport_id }
            }
            selectUserSettingSportsPopulate = {
              select: "-_id sports_settings.$"
            };
          }
          let parentPopulate = [];
          if (req["user"]["check_event_limit"] && req.user.user_type_id != USER_TYPE_SUPER_ADMIN)
            parentPopulate.push({ path: 'parent_userSettingSportsWise', ...matchUserSettingSportsPopulate, ...selectUserSettingSportsPopulate });
          userSettingSportWiseService.getUserSportSettings(
            id, filter, parentPopulate
          ).then(settings => {
            if (settings.statusCode === CONSTANTS.SUCCESS) {
              const sports_settings = settings.data.sports_settings;
              let parent_sports_settings = [VALIDATION];
              if (settings.data.parent_userSettingSportsWise != null)
                parent_sports_settings = settings.data.parent_userSettingSportsWise.sports_settings;
              return Responder.success(res, {
                data: { sports_settings, parent_sports_settings },
                check_event_limit: req.user.user_type_id == USER_TYPE_SUPER_ADMIN ? true : req["user"]["check_event_limit"],
                msg: settings.data.user_name + " settings"
              });
            } else if (settings.statusCode === CONSTANTS.NOT_FOUND)
              return Responder.error(res, { msg: settings.data });
            else
              return Responder.error(res, { msg: settings.data });
          }).catch(error => {
            return Responder.error(res, { msg: error.message });
          })
        } catch (error) {
          return Responder.error(res, { msg: error.message, statusCode: STATUS_500 });
        }
      }).catch(error => Responder.error(res, { msg: error.details.map(data => data.message).toString(), statusCode: STATUS_422 }))
  },
  // To update user sport wise settings
  update: async function (req, res) {
    const outerValidator = {
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").optional(),
      sports_settings: Joi.array().min(1).required(),
      sport_id: Joi.string().required(),
    }
    return Joi.object(outerValidator).validateAsync(req.body, { abortEarly: false })
      .then(({ user_id, sport_id, sports_settings_id, sports_settings }) => {
        sports_settings_id = {
          "sports_settings.sport_id": sport_id
        };
        let isSuperAdminType;
        if (!user_id) {
          user_id = ObjectId(req.User.user_id || req.User._id);
          isSuperAdminType = req.User.user_type_id;
        } else {
          user_id = ObjectId(user_id);
          isSuperAdminType = req.user.user_type_id;
        }
        let Projection = { _id: 1, user_name: 1, user_type_id: 1 };
        if (isSuperAdminType != USER_TYPE_SUPER_ADMIN) {
          Projection["userSettingSportsWise"] = 1;
          Projection["parent_id"] = 1;
          Projection["parent_user_name"] = 1;
          Projection["check_event_limit"] = 1;
        }
        return userService.getUserDetails({ _id: user_id }, Projection)
          .then(userDetails => {
            if (userDetails.statusCode == CONSTANTS.SUCCESS) {
              const { _id, user_type_id, userSettingSportsWise, parent_id, check_event_limit, parent_user_name } = userDetails.data;
              if (
                _id.toString() == (req.User.user_id || req.User._id).toString() &&
                req.User.user_type_id != USER_TYPE_SUPER_ADMIN &&
                check_event_limit == false
              )
                return ResError(res, { msg: "Please contact your upline to change the event limit..." });
              const userSportSettingReq = sports_settings[0];
              let userSportSettingProjection = ["name"];
              // Market settings filter
              if (userSportSettingReq.market_max_stack || userSportSettingReq.market_advance_bet_stake)
                userSportSettingProjection.push("market_min_stack");
              if (userSportSettingReq.market_max_odds_rate)
                userSportSettingProjection.push("market_min_odds_rate");
              if (userSportSettingReq.market_bookmaker_max_odds_rate)
                userSportSettingProjection.push("market_bookmaker_min_odds_rate");
              if (userSportSettingReq.market_advance_bet_stake)
                userSportSettingProjection.push("market_max_stack");
              // Session settings filter
              if (userSportSettingReq.session_max_stack)
                userSportSettingProjection.push("session_min_stack");
              if (userSportSettingReq.session_max_odds_rate)
                userSportSettingProjection.push("session_min_odds_rate");
              if (CONSTANTS.USER_TYPE_SUPER_ADMIN != user_type_id) {
                userSportSettingProjection = Object.keys(UserSettingSportWise.schema.paths["sports_settings"].schema.paths);
                user_id = parent_id;
              }
              return userSettingSportWiseService.getUserSelectiveSportSettings(user_id, sports_settings_id, userSportSettingProjection)
                .then(userSportSettingDB => {
                  if (userSportSettingDB.statusCode == CONSTANTS.SUCCESS) {
                    userSportSettingDB = userSportSettingDB.data;
                    const { name } = userSportSettingDB;
                    if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN) {
                      // Market settings condition
                      let market_min_stack = userSportSettingReq["market_min_stack"] ? userSportSettingReq.market_min_stack : userSportSettingDB.market_min_stack;
                      let market_min_odds_rate = userSportSettingReq["market_min_odds_rate"] ? userSportSettingReq.market_min_odds_rate : userSportSettingDB.market_min_odds_rate;
                      market_min_odds_rate = market_min_odds_rate ? market_min_odds_rate : VALIDATION.market_min_odds_rate; market_min_odds_rate += VALIDATION.market_min_odds_rate;

                      let market_bookmaker_min_odds_rate = userSportSettingReq["market_bookmaker_min_odds_rate"] ? userSportSettingReq.market_bookmaker_min_odds_rate : userSportSettingDB.market_bookmaker_min_odds_rate;

                      market_bookmaker_min_odds_rate = market_bookmaker_min_odds_rate ? market_bookmaker_min_odds_rate : VALIDATION.market_bookmaker_min_odds_rate;

                      market_bookmaker_min_odds_rate += VALIDATION.market_bookmaker_min_odds_rate;

                      const market_max_stack = userSportSettingReq["market_max_stack"] ? userSportSettingReq.market_max_stack : userSportSettingDB.market_max_stack;
                      market_min_stack = market_min_stack ? market_min_stack : VALIDATION.market_min_stack; market_min_stack += VALIDATION.market_min_stack;
                      const market_advance_bet_min_stake = VALIDATION.market_advance_bet_stake_min_limit;
                      const market_advance_bet_max_stake = VALIDATION.market_advance_bet_stake_max_limit;
                      // Session settings condition
                      let session_min_stack = userSportSettingReq["session_min_stack"] ? userSportSettingReq.session_min_stack : userSportSettingDB.session_min_stack;
                      session_min_stack = session_min_stack ? session_min_stack : VALIDATION.session_min_stack; session_min_stack += VALIDATION.session_min_stack;
                      return Joi.object({
                        ...outerValidator,
                        sports_settings: Joi.array().items({
                          // Market settings for sports

                          /* market_min_stack , market_max_stack */
                          market_min_stack: Joi.number()
                            .min(VALIDATION.market_min_stack)
                            .max(VALIDATION.market_max_stack).optional()
                            .label(`Enter valid(${VALIDATION.market_min_stack} - ${VALIDATION.market_max_stack}) minimum odds stack for ${name}`),
                          market_max_stack: Joi.number()
                            .min(market_min_stack)
                            .max(VALIDATION.market_max_stack_max_limit).optional()
                            .label(`Enter valid(${market_min_stack} - ${VALIDATION.market_max_stack_max_limit}) [recommended : min ${market_min_stack} max ${VALIDATION.market_max_stack}] maximum odds stack for ${name}`),

                          /* market_min_odds_rate , market_max_odds_rate */
                          market_min_odds_rate: Joi.number()
                            .min(VALIDATION.market_min_odds_rate)
                            .max(VALIDATION.market_max_odds_rate).optional()
                            .label(`Enter valid(${VALIDATION.market_min_odds_rate} - ${VALIDATION.market_max_odds_rate}) minimum odds rate for ${name}`),
                          market_max_odds_rate: Joi.number()
                            .min(market_min_odds_rate)
                            .max(VALIDATION.market_max_odds_rate).optional()
                            .label(`Enter valid(${market_min_odds_rate} - ${VALIDATION.market_max_odds_rate}) maximum odds rate for ${name}`),

                          /* market_bookmaker_min_odds_rate , market_bookmaker_max_odds_rate */
                          market_bookmaker_min_odds_rate: Joi.number()
                            .greater(VALIDATION.market_bookmaker_min_odds_rate)
                            .max(VALIDATION.market_bookmaker_max_odds_rate).precision(2).optional()
                            .label(`Enter valid(${VALIDATION.market_bookmaker_min_odds_rate} - ${VALIDATION.market_bookmaker_max_odds_rate}) minimum bookmaker odds rate for ${name}`),
                          market_bookmaker_max_odds_rate: Joi.number()
                            .min(market_bookmaker_min_odds_rate)
                            .max(VALIDATION.market_bookmaker_max_odds_rate).optional()
                            .label(`Enter valid(${market_bookmaker_min_odds_rate} - ${VALIDATION.market_bookmaker_max_odds_rate}) maximum bookmaker odds rate for ${name}`),

                          /* market_bet_delay */
                          market_bet_delay: Joi.number()
                            .min(VALIDATION.market_min_bet_delay)
                            .max(VALIDATION.market_max_bet_delay).optional()
                            .label(`Enter valid(${VALIDATION.market_min_bet_delay} - ${VALIDATION.market_max_bet_delay}) market bet delay for ${name}`),

                          /* market_max_profit */
                          market_max_profit: Joi.number()
                            .min(0)
                            .max(VALIDATION.market_max_profit * VALIDATION.market_profit_range).optional()
                            .label(`Enter valid([0 Unlimited] - ${VALIDATION.market_max_profit * VALIDATION.market_profit_range}) maximum market profit for ${name}`),

                          /* market_advance_bet_stake */
                          market_advance_bet_stake: Joi.number()
                            .min(market_advance_bet_min_stake)
                            .max(market_advance_bet_max_stake).optional()
                            .label(`Enter valid([${market_advance_bet_min_stake} Unlimited] - ${market_advance_bet_max_stake}) [recommended : min ${market_min_stack} max ${VALIDATION.market_advance_bet_stake}] advance market bet stake for ${name}`),

                          // Session settings for sports
                          /* session_min_stack , session_max_stack */
                          session_min_stack: Joi.number()
                            .min(VALIDATION.session_min_stack)
                            .max(VALIDATION.session_max_stack).optional()
                            .label(`Enter valid(${VALIDATION.session_min_stack} - ${VALIDATION.session_max_stack}) minimum session stack for ${name}`),
                          session_max_stack: Joi.number()
                            .min(session_min_stack)
                            .max(VALIDATION.session_max_stack_max_limit).optional()
                            .label(`Enter valid(${session_min_stack} - ${VALIDATION.session_max_stack_max_limit}) [recommended : min ${session_min_stack} max ${VALIDATION.session_max_stack}] maximum session stack for ${name}`),

                          /* session_bet_delay */
                          session_bet_delay: Joi.number()
                            .min(VALIDATION.session_min_bet_delay)
                            .max(VALIDATION.session_max_bet_delay).optional()
                            .label(`Enter valid(${VALIDATION.session_min_bet_delay} - ${VALIDATION.session_max_bet_delay}) session delay for ${name}`),

                          /* session_max_profit */
                          session_max_profit: Joi.number()
                            .min(0)
                            .max(VALIDATION.session_max_profit * VALIDATION.session_profit_range).optional()
                            .label(`Enter valid([0 Unlimited] - ${VALIDATION.session_max_profit * VALIDATION.session_profit_range}) maximum session profit for ${name}`),

                        }).required(),
                      }).validateAsync(req.body, { abortEarly: false })
                        .then(({ sports_settings }) => {
                          if (sports_settings.length) {
                            sports_settings = sports_settings[0];
                            return userSettingSportWiseService.getSportSettingsIndexQuery(sports_settings_id)
                              .then(index => {
                                if (index.statusCode != CONSTANTS.SUCCESS)
                                  throw new Error(index.data);
                                index = index.data;
                                return UserSettingSportWise.updateMany(
                                  {},
                                  {
                                    "$set": Object
                                      .keys(sports_settings)
                                      .reduce((Object, key) => ({ ...Object, [`sports_settings.${index}.${key}`]: sports_settings[key] }), {})
                                  },
                                  { new: true }
                                ).then(() => {
                                  updateLogStatus(req, { status: LOG_SUCCESS, msg: `${name} settings updated...` });
                                  Responder.success(res, { msg: `${name} settings updated...` })
                                }
                                ).catch(error => Responder.error(res, { msg: error }));
                              }).catch(error => Responder.error(res, { msg: `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` }));
                          }
                          return Responder.error(res, { msg: "Something went wrong while updating user settings!" });
                        }).catch(error => {
                          if (error.hasOwnProperty("details")) {
                            let joiErrorFormat = {};
                            error.details.map(errors => {
                              const { context } = errors;
                              joiErrorFormat[context.key] = [{
                                "short_error": `Range ${context.label.substring(
                                  context.label.indexOf("(") + 0,
                                  context.label.lastIndexOf(")") + 1
                                )}`
                              }, {
                                "long_error": context.label
                              }]
                            });
                            return Responder.error(res, { msg: "Validation failed", data: joiErrorFormat, is_validation_error: true });
                          }
                          return Responder.error(res, error);
                        });
                    } else {
                      let parentUserSportSettingDB = userSportSettingDB;
                      const parent_msg = `It does't meet '${parent_user_name}' parent limit`;
                      return Joi.object({
                        ...outerValidator,
                        sports_settings: Joi.array().items({
                          /* market_min_stack , market_max_stack */
                          market_min_stack: Joi.number()
                            .min(parentUserSportSettingDB.market_min_stack)
                            .max(parentUserSportSettingDB.market_max_stack).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.market_min_stack} - ${parentUserSportSettingDB.market_max_stack}) minimum odds stack for ${name}, ${parent_msg}`),
                          market_max_stack: Joi.number()
                            .min(!check_event_limit ? VALIDATION.market_max_stack_min_limit : parentUserSportSettingDB.market_min_stack + VALIDATION.market_min_stack)
                            .max(!check_event_limit ? VALIDATION.market_max_stack_max_limit : parentUserSportSettingDB.market_max_stack).optional()
                            .label(`Enter valid(${!check_event_limit ? (VALIDATION.market_max_stack_min_limit + " Unlimited") : (parentUserSportSettingDB.market_min_stack + VALIDATION.market_min_stack)} - ${!check_event_limit ? VALIDATION.market_max_stack_max_limit : parentUserSportSettingDB.market_max_stack}) maximum odds stack for ${name}, ${parent_msg}`),

                          /* market_min_odds_rate , market_max_odds_rate */
                          market_min_odds_rate: Joi.number()
                            .min(parentUserSportSettingDB.market_min_odds_rate)
                            .max(parentUserSportSettingDB.market_max_odds_rate).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.market_min_odds_rate} - ${parentUserSportSettingDB.market_max_odds_rate}) minimum odds rate for ${name}, ${parent_msg}`),
                          market_max_odds_rate: Joi.number()
                            .min(parentUserSportSettingDB.market_min_odds_rate + VALIDATION.market_min_odds_rate)
                            .max(parentUserSportSettingDB.market_max_odds_rate).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.market_min_odds_rate + VALIDATION.market_min_odds_rate} - ${parentUserSportSettingDB.market_max_odds_rate}) maximum odds rate for ${name}, ${parent_msg}`),

                          /* market_bookmaker_min_odds_rate , market_bookmaker_max_odds_rate */
                          market_bookmaker_min_odds_rate: Joi.number()
                            .greater(parentUserSportSettingDB.market_bookmaker_min_odds_rate)
                            .max(parentUserSportSettingDB.market_bookmaker_max_odds_rate).precision(2).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.market_bookmaker_min_odds_rate} - ${parentUserSportSettingDB.market_bookmaker_max_odds_rate}) minimum bookmaker odds rate for ${name}, ${parent_msg}`),
                          market_bookmaker_max_odds_rate: Joi.number()
                            .min(parentUserSportSettingDB.market_bookmaker_min_odds_rate + VALIDATION.market_bookmaker_min_odds_rate)
                            .max(parentUserSportSettingDB.market_bookmaker_max_odds_rate).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.market_bookmaker_min_odds_rate + VALIDATION.market_bookmaker_min_odds_rate} - ${parentUserSportSettingDB.market_bookmaker_max_odds_rate}) maximum bookmaker odds rate for ${name}, ${parent_msg}`),

                          /* market_bet_delay */
                          market_bet_delay: Joi.number()
                            .min(parentUserSportSettingDB.market_bet_delay)
                            .max(VALIDATION.market_max_bet_delay).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.market_bet_delay} - ${VALIDATION.market_max_bet_delay}) market bet delay for ${name}, ${parent_msg}`),

                          /* market_max_profit */
                          market_max_profit: Joi.number()
                            .min(0)
                            .max(!check_event_limit ? VALIDATION.market_max_profit * VALIDATION.market_profit_range : parentUserSportSettingDB.market_max_profit).optional()
                            .label(`Enter valid([0 Unlimited] - ${!check_event_limit ? VALIDATION.market_max_profit * VALIDATION.market_profit_range : parentUserSportSettingDB.market_max_profit}) maximum market profit for ${name}, ${parent_msg}`),

                          /* market_advance_bet_stake */
                          market_advance_bet_stake: Joi.number()
                            .min(0)
                            .max(parentUserSportSettingDB.market_advance_bet_stake).optional()
                            .label(`Enter valid([0 not allow] - ${parentUserSportSettingDB.market_advance_bet_stake}) advance market bet stake for ${name}, ${parent_msg}`),

                          // Session settings for sports
                          /* session_min_stack , session_max_stack */
                          session_min_stack: Joi.number()
                            .min(parentUserSportSettingDB.session_min_stack)
                            .max(parentUserSportSettingDB.session_max_stack).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.session_min_stack} - ${parentUserSportSettingDB.session_max_stack}) minimum session stack for ${name}, ${parent_msg}`),
                          session_max_stack: Joi.number()
                            .min(!check_event_limit ? VALIDATION.session_max_stack_min_limit : parentUserSportSettingDB.session_min_stack + VALIDATION.session_min_stack)
                            .max(!check_event_limit ? VALIDATION.session_max_stack_max_limit : parentUserSportSettingDB.session_max_stack).optional()
                            .label(`Enter valid(${!check_event_limit ? VALIDATION.session_max_stack_min_limit + " Unlimited" : (parentUserSportSettingDB.session_min_stack + VALIDATION.session_min_stack)} - ${!check_event_limit ? VALIDATION.session_max_stack_max_limit : parentUserSportSettingDB.session_max_stack}) maximum session stack for ${name}, ${parent_msg}`),

                          /* session_bet_delay */
                          session_bet_delay: Joi.number()
                            .min(parentUserSportSettingDB.session_bet_delay)
                            .max(VALIDATION.session_max_bet_delay).optional()
                            .label(`Enter valid(${parentUserSportSettingDB.session_bet_delay} - ${VALIDATION.session_max_bet_delay}) session delay for ${name}, ${parent_msg}`),

                          /* session_max_profit */
                          session_max_profit: Joi.number()
                            .min(0)
                            .max(!check_event_limit ? VALIDATION.session_max_profit * VALIDATION.session_profit_range : parentUserSportSettingDB.session_max_profit).optional()
                            .label(`Enter valid([0 Unlimited] - ${!check_event_limit ? VALIDATION.session_max_profit * VALIDATION.session_profit_range : parentUserSportSettingDB.session_max_profit}) maximum session profit for ${name}, ${parent_msg}`),

                        }).required(),
                      }).validateAsync(req.body, { abortEarly: false })
                        .then(({ sports_settings }) => {
                          if (sports_settings.length) {
                            sports_settings = sports_settings[0];
                            return userSettingSportWiseService.getSportSettingsIndexQuery(sports_settings_id)
                              .then(index => {
                                if (index.statusCode != CONSTANTS.SUCCESS)
                                  throw new Error(index.data);
                                if (index.data == -1)
                                  throw new Error("Settings not updated! Sport index not found...");
                                index = index.data;
                                return UserSettingSportWise.updateMany(
                                  {
                                    "$or": [
                                      {
                                        "_id": userSettingSportsWise
                                      },
                                      {
                                        "_ids": { "$in": [userSettingSportsWise] }
                                      }
                                    ]
                                  },
                                  {
                                    "$set": Object
                                      .keys(sports_settings)
                                      .reduce((Object, key) => ({ ...Object, [`sports_settings.${index}.${key}`]: sports_settings[key] }), {})
                                  }
                                ).then(() => {
                                  let msg = (req.User.user_type_id == USER_TYPE_SUPER_ADMIN) ? `${req.user.name}(${req.user.user_name}) Agent(s) ${name} settings updated...` : `${name} settings updated...`;
                                  updateLogStatus(req, { status: LOG_SUCCESS, msg: msg });
                                  Responder.success(res, { msg: msg })
                                }
                                ).catch(error => Responder.error(res, { msg: `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` }));
                              }).catch(error => Responder.error(res, { msg: error.message + (process.env.DEBUG == "true" ? `${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` : '') }));
                          }
                          return Responder.error(res, { msg: "Something went wrong while updating user settings!" });
                        }).catch(error => {
                          if (error.hasOwnProperty("details")) {
                            let joiErrorFormat = {};
                            error.details.map(errors => {
                              const { context } = errors;
                              joiErrorFormat[context.key] = [{
                                "short_error": `Range ${context.label.substring(
                                  context.label.indexOf("(") + 0,
                                  context.label.lastIndexOf(")") + 1
                                )}`
                              }, {
                                "long_error": context.label
                              }]
                            });
                            return Responder.error(res, { msg: "Validation failed", data: joiErrorFormat, is_validation_error: true });
                          }
                          return Responder.error(res, error);
                        });
                    }
                  } else if (userSportSettingDB.statusCode == CONSTANTS.NOT_FOUND)
                    return Responder.error(res, { msg: `${userSportSettingDB.data} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` });
                  else
                    return Responder.error(res, { msg: `${userSportSettingDB.data} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` });
                }).catch(error => Responder.error(res, { msg: error }));
            } else
              return Responder.error(res, { msg: `${userDetails.data} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` });
          }).catch(error => Responder.error(res, { msg: `${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}:${getCurrentLine.default().line}` }))
      }).catch(error => Responder.error(res, { msg: error.details.map(data => data.message).toString() }))
  },
  // To update the users and agents commissions.
  updateCommission: function (req, res) {
    let { user_id, user_type_id, match_commission, session_commission } = req.joiData;
    if (!user_id) {
      user_id = ObjectId(req.User.user_id || req.User._id);
      user_type_id = req.User.user_type_id;
    } else {
      user_id = ObjectId(user_id);
      user_type_id = req.user.user_type_id;
    }
    if (user_type_id == USER_TYPE_SUPER_ADMIN) {
      let userCommissionSet = {}, parentCommissionSet = {};
      if (match_commission != undefined) {
        userCommissionSet["match_commission"] = match_commission;
        parentCommissionSet["parent_commission.$[].match_commission"] = match_commission;
      }
      if (session_commission != undefined) {
        userCommissionSet["session_commission"] = session_commission;
        parentCommissionSet["parent_commission.$[].session_commission"] = session_commission;
      }
      return Promise.all([
        User.updateMany({}, { '$set': userCommissionSet }),
        UserSettingSportWise.updateMany({},
          { '$set': Object.assign(userCommissionSet, parentCommissionSet) }
        )
      ]).then(() => {
        let msg = "Commissions updated successfully all of your agent(s)."
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg });
        return ResSuccess(res, msg);
      }).catch(error => {
        return ResError(res, { error, statusCode: STATUS_500 });
      });
    }
    let query = { "_id": user_id }, Projection = ["parent_user_name"]
      , userCommissionSet = {};
    if (user_type_id != USER_TYPE_SUPER_ADMIN)
      query["_id"] = req.user.parent_id;
    if (match_commission != undefined) {
      Projection.push("match_commission");
      userCommissionSet["match_commission"] = match_commission;
    }
    if (session_commission != undefined) {
      Projection.push("session_commission");
      userCommissionSet["session_commission"] = session_commission;
    }
    return userService.getUserDetails(query, Projection).then(parent => {
      if (parent.statusCode != SUCCESS)
        return ResError(res, { msg: parent.data });
      parent = parent.data;
      if (parent.match_commission && user_type_id != USER_TYPE_SUPER_ADMIN)
        if (parent.match_commission > match_commission) {
          let msg = `Match commission should be greater than or equal to your parent [${parent.parent_user_name ? parent.parent_user_name : req.user.parent_user_name}] commission(${parent.match_commission})`
          // Update activity log status.
          updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg });
          return ResError(res, { msg: msg });
        }
      if (parent.session_commission && user_type_id != USER_TYPE_SUPER_ADMIN)
        if (parent.session_commission > session_commission) {
          let msg = `Session commission should be greater than or equal to your parent [${parent.parent_user_name ? parent.parent_user_name : req.user.parent_user_name}] commission(${parent.session_commission})`
          // Update activity log status.
          updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg });
          return ResError(res, { msg: msg });
        }
      return Promise.all([
        User.updateMany(
          {
            '$or': [
              { '_id': user_id },
              {
                'parent_level_ids.user_id': user_id
              }
            ]
          },
          { '$set': userCommissionSet }
        ),
        UserSettingSportWise.updateMany(
          { 'parent_commission.user_id': user_id },
          {
            '$set': Object.assign(userCommissionSet, {
              'parent_commission.$.match_commission': match_commission,
              'parent_commission.$.session_commission': session_commission,
            })
          }
        )
      ]).then(() => {
        let msg = `Commissions updated successfully ${user_type_id == USER_TYPE_USER ? 'of your child' : 'all of your downline agent(s).'}`
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg });
        return ResSuccess(res, msg);
      }).catch(error => {
        return ResError(res, { error, statusCode: STATUS_500 });
      });
    });

  }
}