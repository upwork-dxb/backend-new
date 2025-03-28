const axios = require('axios')
  , _ = require('lodash')
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , Responder = require('../../lib/expressResponder')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , CONSTANTS = require('../../utils/constants')
  , { SUCCESS, NOT_FOUND, UNIVERSE_CASINO_SPORT_ID, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, SPORTS_IDS, LABEL_DIAMOND } = require('../../utils/constants')
  , { STATUS_400, STATUS_401, STATUS_403, STATUS_422, STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')
  , Sports = require('../../models/sports')
  , Match = require('../../models/match')
  , Market = require('../../models/market')
  , Partnerships = require('../../models/partnerships')
  , UserSettingSportWise = require('../../models/userSettingWiseSport')
  , commonService = require('../service/commonService')
  , apiUrlSettingsService = require('../service/apiUrlSettingsService')
  , sportService = require('../service/sportService')
  , utils = require('../../utils')
  , { blockEvent } = utils
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_VALIDATION_FAILED, LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig');

let sportskeyforpopulate = 'name sport_id';

module.exports = {
  // To create new sport
  createNewSport: async function (req, res) {
    const sportSchema = Joi.object({
      sport_id: Joi.string().required(),
      name: Joi.string().required(),
      is_live_sport: Joi.string().valid("0", "1").optional()
    });

    try {
      await sportSchema.validateAsync(req.body, {
        abortEarly: false
      });
    } catch (error) {
      return Responder.error(res, { msg: error.details.map(data => data.message).toString(), statusCode: STATUS_422 })
    }
    let checkSportAlreadyExist = await sportService.getSportBySportId(req.body.sport_id);
    if (checkSportAlreadyExist.statusCode === CONSTANTS.SUCCESS)
      return Responder.success(res, { msg: "Sport already exist." })
    return Sports.create(req.body)
      .then(sport => Responder.success(res, { data: [], msg: "New sport created successfully.", status: true }))
      .catch(error => Responder.error(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  // To create new sport
  import: async function (req, res) {
    return SportsController.createNewSport(req, res);
  },
  // To get all sports list for super admin & agents with block data
  getSports: async function (req, res) {
    let validateField = {
      user_id: JoiObjectId.objectId().optional(),
      dashboard: Joi.boolean().optional(),
      pass_type: Joi.string().valid('TRXN_PASSWORD').optional(),
      password: Joi.string().optional(),
      include_count: Joi.boolean().default(false).optional(),
    }
    return Joi.object(validateField).validateAsync(req.body, { abortEarly: false })
      .then(async body => {
        let { user_id, dashboard, include_count } = body, user_type_id, NAME, PARENT_LEVEL_IDS = [];
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
          // if super admin logged in.
          let getAllSportsFromAPI = [];
          try {
            getAllSportsFromAPI = await axios.get(await apiUrlSettingsService.getSportsUrl(), { timeout: 3000 });
            getAllSportsFromAPI = getAllSportsFromAPI.data;
            if (!Array.isArray(getAllSportsFromAPI))
              getAllSportsFromAPI = [];
            if (getAllSportsFromAPI.length) {
              let onlySelectedSports = SPORTS_IDS;
              let apiUrlSettings = await commonService.getApiUrlSettings();
              if (apiUrlSettings.statusCode == SUCCESS) {
                apiUrlSettings = apiUrlSettings.data;
                if (apiUrlSettings.selected_sports_ids)
                  onlySelectedSports = apiUrlSettings.selected_sports_ids;
              }
              getAllSportsFromAPI = getAllSportsFromAPI.filter(data => onlySelectedSports.includes(data.eventType.id));
            }
          } catch (error) { getAllSportsFromAPI = []; }
          // parse api data according to db columns.
          getAllSportsFromAPI = getAllSportsFromAPI.map((element) => {
            return {
              sport_id: element.eventType.id,
              name: element.eventType.name,
              is_manual: 0,
              is_active: 0,
              is_visible: 0,
              is_created: 0
            };
          });
          // get all sports form db order by sports and active
          let getAllSportsFromDB = await sportService.getAllSports({},
            { _id: 0, sport_id: 1, name: 1, is_manual: 1, is_active: 1, is_visible: 1, is_created: 1, providerCode: 1 },
            { is_active: -1, order_by: 0 }
          );
          if (getAllSportsFromDB.statusCode == SUCCESS) {
            getAllSportsFromDB = getAllSportsFromDB.data;
            let finalSportsList = _.unionBy(getAllSportsFromDB, getAllSportsFromAPI, 'sport_id');
            return ResSuccess(res, {
              dataIs: NAME, data: finalSportsList, loggedIn: {
                user_id: req.User.user_id, user_name: req.User.user_name
              },
              msg: `${finalSportsList.length} sports found...`,
            });
          }
          if (!getAllSportsFromAPI.length || [NOT_FOUND, SERVER_ERROR].includes(getAllSportsFromDB.statusCode))
            return ResError(res, { dataIs: NAME, msg: `No Sports available yet!, ${getAllSportsFromDB.data}`, statusCode: STATUS_200 });
        } else {
          const { sports_permission } = (req.user || req.User);
          sports_permission.push({
            sport_id: UNIVERSE_CASINO_SPORT_ID
          });
          PARENT_LEVEL_IDS = PARENT_LEVEL_IDS.map(data => data.user_id.toString());
          let filter = {
            "sport_id": {
              "$in": sports_permission.map(data => data.sport_id)
            }
          };
          if (dashboard)
            filter["sport_id"] = { "$in": sports_permission.map(data => data.sport_id).filter(data => ["4", "2", "1"].includes(data)) };
          if (req.path == "/all/sports") {
            delete filter["sport_id"];
            filter["is_virtual_sport"] = true;
          }
          if (req.path == "/blockEvents")
            delete filter["sport_id"];
          return Sports.find({
            "is_active": 1, "is_visible": true, ...filter
          }).select("-_id name sport_id parent_blocked self_blocked is_live_sport providerCode").sort("order_by").lean()
            .then(async events => {
              if (events.length) {
                if (include_count) {
                  const sportWiseCount = {};

                  const parentAndLoggedInUser = [...PARENT_LEVEL_IDS, user_id.toString()];
                  const [matchCount, marketCount] = await Promise.all([
                    Match.aggregate(sportService.getMatchCountQuery(parentAndLoggedInUser)),
                    Market.aggregate(sportService.getMarketCountQuery(parentAndLoggedInUser))
                  ]);

                  matchCount.map(({ _id, count }) => sportWiseCount[_id] = count);
                  marketCount.map(({ _id, count }) => sportWiseCount[_id] = count);

                  events.map(item => {
                    item['match_count'] = sportWiseCount[item.sport_id] || 0;
                  });

                }
                let finalEventList = events;
                blockEvent({ finalEventList, user_id, is_self_view, PARENT_LEVEL_IDS });
                finalEventList = finalEventList.map(data => ({
                  name: data.name, sport_id: data.sport_id, is_active: data.is_active, providerCode: data.providerCode, is_live_sport: data.is_live_sport,
                  ...(include_count ? { match_count: data.match_count } : {})
                })).filter(data => data);
                return ResSuccess(res, {
                  dataIs: { user_id, name: NAME }, loggedIn: { user_id: req.User.user_id, name: `${req.User.name}(${req.User.user_name})` },
                  data: finalEventList, msg: `${finalEventList.length} sports found...`,
                });
              } else
                return ResError(res, { msg: "No sports available yet!", statusCode: STATUS_200 });
            });
        }
      }).catch(error => {
        return ResError(res, error);
      });
  },
  sports: function (req, res) {
    return Joi.object({
      sport_id: Joi.string().optional(),
      live_games: Joi.boolean().optional(),
      dashboard: Joi.boolean().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async body => {
        let filter = { "is_active": 1, "is_visible": true, is_virtual_sport: false }
          , { sport_id, live_games, dashboard } = body;
        if (sport_id)
          filter["sport_id"] = sport_id;
        if (live_games)
          filter["is_live_sport"] = 1;
        if (dashboard)
          filter["sport_id"] = { "$in": ["4", "2", "1"] };
        if (req.path == "/providers")
          filter["is_virtual_sport"] = true;
        return Sports
          .find(filter)
          .select("-_id sport_id name is_live_sport providerCode")
          .sort("order_by")
          .lean()
          .then(data => ResSuccess(res, { data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  // To get all sports list
  getAllSportsList: function (req, res) {
    Sports.find()
      .then((sportsList) => {
        return Responder.success(res, { data: sportsList, msg: "sports list." })
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  },
  // To get particular user sports partnerships details
  getUserSportsPartnerShipsDetails: function (req, res) {
    Partnerships.find({ user_id: req.params.id }).populate(
      'sports_share.sport_id', sportskeyforpopulate
    ).then((PartnershipsDetails) => {
      return Responder.success(res, { data: PartnershipsDetails, msg: "User sports partnershipsDetails details." })
    }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  },
  // To get user sports wise setting details
  getUserSportsWiseSettingDetails: async function (req, res) {
    let {
      userid
    } = req.body;
    const profilechema = Joi.object({
      userid: Joi.string().required()
    });
    try {
      const value = await profilechema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }
    UserSettingSportWise.findOne({ user_id: userid }, { user_id: 1, match_commission: 1, session_commission: 1, sports_settings: 1 })
      .lean()
      .then((settingDetails) => {
        let list = -1;
        var next = function () {
          list++;
          if (list < settingDetails.sports_settings.length) {
            settingDetails.sports_settings[list].name = null;
            Sports.findOne({ sport_id: settingDetails.sports_settings[list].sport_id })
              .then((sport) => {
                settingDetails.sports_settings[list].name = sport.name;
                next();
              }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
          }
          else {
            if (settingDetails) {
              return Responder.success(res, { data: settingDetails, msg: "User sports wise settings details found successfully." })
            }
            else {
              return Responder.success(res, { msg: "User sports wise settings details not found." })
            }
          }
        }
        next();
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  },
  // To update user sport wise settings 
  updateSportWiseSettingDetails: async function (req, res) {
    const sportSettingSchema = Joi.object({
      user_id: Joi.string().required(),
      sports_settings: Joi.array().items({
        sportId: Joi.string().required(),
        sport_id: Joi.number().required(), name: Joi.string().optional(), match_commission: Joi.number().allow('', null, 0),
        session_commission: Joi.number().allow(0), market_fresh_delay: Joi.number().allow(0),
        market_min_stack: Joi.number().allow(0), market_max_stack: Joi.number().allow(0),
        market_max_profit: Joi.number().allow(0),
        session_fresh_delay: Joi.number().allow(0),
        session_min_stack: Joi.number().allow(0), session_max_stack: Joi.number().allow(0)
      })
    });
    try {
      const value = await sportSettingSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    if (!req.body.sports_settings) {
      return Responder.success(res, { msg: "Sports settings required" })
    }

    if (req.body.sports_settings.length == 0) {
      return Responder.success(res, { msg: "Sports settings required" })
    }
    let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
    let userDetails = await commonService.getUserByUserId(req.body.user_id, getUserFieldsName);
    if (userDetails.statusCode === CONSTANTS.SUCCESS) {
      let parentSportSettingsDetails = await commonService.getUserSportWiseSettingByUserId(userDetails.data.parent_id);
      if (parentSportSettingsDetails.statusCode === CONSTANTS.SUCCESS) {
        var sportSettings = req.body.sports_settings;
        let list = -1;
        var next = async function () {
          list++;
          if (list < sportSettings.length) {
            let validateSportSettings = await sportService.validateUserAndParentSportsSettings(sportSettings[list], parentSportSettingsDetails.data.sports_settings[list]);
            if (validateSportSettings.statusCode === CONSTANTS.VALIDATION_FAILED) {
              return Responder.success(res, { msg: validateSportSettings.data.message })
            }
            else {
              next();
            }
          }
          else {
            UserSettingSportWise.findOneAndUpdate({ user_id: req.body.user_id }, { $set: { sports_settings: req.body.sports_settings } }, { new: true })
              .then((sportSettingDetails) => {
                return Responder.success(res, { data: sportSettingDetails, msg: "User sports wise setting details updated." })
              }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
          }
        }
        next();
      }
      else
        return Responder.success(res, { msg: "Parent sport setting details not found" })
    }
    else {
      return Responder.success(res, { msg: "User not found" })
    }
  },
  // To update sport status
  updateSportsStatus: async function (req, res) {
    let { sport_id, is_active, userid, user_typeId } = req.body;
    let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
    let loggedInUserDetails = await commonService.getUserByUserId(req.User._id, getUserFieldsName);

    if (loggedInUserDetails.statusCode === CONSTANTS.SUCCESS) {

      let user_type_id = loggedInUserDetails.data.user_type_id;

      if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN && user_typeId == CONSTANTS.USER_TYPE_SUPER_ADMIN) {

        let updatedSportStatus = await sportService.updateSportsStatus(sport_id, is_active);
        if (updatedSportStatus.statusCode === CONSTANTS.SUCCESS) {
          let msg = updatedSportStatus.data.is_active == 1 ? "Sports activated successfully..." : "Sports deactivated successfully...";
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { data: updatedSportStatus.data, msg: msg })
        }
        else {
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: "Sport not found" })
          return Responder.success(res, { msg: "Sport not found" })
        }
      }

      else {

        let user_id = userid;
        let reqData = { user_id, sport_id };

        let allParentIds = [];
        let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
        let userDetails = await commonService.getUserByUserId(user_id, getUserFieldsName);

        let parentIdsObject = userDetails.data.parent_level_ids;
        await parentIdsObject.forEach(element => {
          allParentIds.push(element.user_id);
        });
        let checkParentsSport = await sportService.checkParentIdsDeactiveSport(sport_id, allParentIds);
        if (checkParentsSport.statusCode === CONSTANTS.SUCCESS) {
          let msg = "Can not update parent sport deactivated !"
          // Update activity log status.
          updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
          return Responder.success(res, { msg: msg })
        }
        let deactiveSportData = await sportService.getDeactiveSport(reqData);
        if (deactiveSportData.statusCode === CONSTANTS.SUCCESS) {
          let deleteDeactiveSport = await sportService.deleteDeactiveSport(reqData);
          if (deleteDeactiveSport.statusCode === CONSTANTS.SUCCESS) {
            let msg = "Child(s) sport activated...."
            // Update activity log status.
            updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
            return Responder.success(res, { msg: msg })
          }
          else {
            let msg = "Error Occurred !"
            // Update activity log status.
            updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
            return Responder.success(res, { msg: "Error Occurred !" })
          }
        }
        else if (deactiveSportData.statusCode === CONSTANTS.NOT_FOUND) {
          let createDeactiveSport = await sportService.createDeactiveSport(reqData);

          if (createDeactiveSport.statusCode === CONSTANTS.SUCCESS) {
            let msg = "Child(s) sport deactivated..."
            // Update activity log status.
            updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
            return Responder.success(res, { msg: msg })
          }
          else {
            let msg = "Error Occurred !"
            // Update activity log status.
            updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
            return Responder.success(res, { msg: msg })
          }
        }
        else {
          return Responder.success(res, { msg: "Error Occurred !" })
        }
      }
    }
    else
      return Responder.success(res, { msg: "Logged in user not found" });
  },
  // To get online sports list
  getAllActiveSports: async function (req, res) {
    let { userid } = req.body;
    const profilechema = Joi.object({
      userid: Joi.string().required(),
    });
    try {
      await profilechema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    let apiUrlSettings = await commonService.getApiUrlSettings();
    let loggedInUserId = req.User._id;
    let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
    let userDetails = await commonService.getUserByUserId(userid, getUserFieldsName);
    let user_type_id = userDetails.data.user_type_id;
    let loggedInUserDetails = await commonService.getUserByUserId(loggedInUserId, getUserFieldsName);
    let logged_in_user_type_id = loggedInUserDetails.data.user_type_id;

    if (logged_in_user_type_id == 0) {

      let onlineSportsRes = [];
      try {
        onlineSportsRes = await axios.get(apiUrlSettings.data.online_sports_url, { timeout: 3000 });
        onlineSportsRes = onlineSportsRes.data;
        if (!Array.isArray(onlineSportsRes))
          onlineSportsRes = [];
      } catch (error) { onlineSportsRes = []; }

      let onlineSportsList = onlineSportsRes;

      var mapsdata = onlineSportsList.map((element) => {
        return {
          sport_id: element.eventType.id,
          name: element.eventType.name,
          is_manual: 0,
          is_active: 0,
          is_visible: 0,
          is_created: 0,
          is_show_last_result: 0,
          is_show_tv: 0,
          is_live_sport: 0,
          is_super_admin_commission: 0,
          order_by: 0,
          min_odds_limit: 0,
          max_odss_limit: 0
        };
      });

      let allSports = await sportService.getAllSports();
      allSports = allSports.data;

      var sportIds = new Set(allSports.map(item => item.sport_id));
      let apiSportsAndDBSportsList = [...allSports, ...mapsdata.filter(item => !sportIds.has(item.sport_id))];

      let userAndAllParentIds = [];

      userAndAllParentIds.push(userid);
      let userAndParentAllDeactiveSports = await sportService.getUserAndParentAllDeactiveSport(userAndAllParentIds);
      if (userAndParentAllDeactiveSports.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveSports = userAndParentAllDeactiveSports.data;
        let apiSportsAndDBSportsListForParent = apiSportsAndDBSportsList.map((item) => {
          let findStatus = userAndParentAllDeactiveSports.find(deactiveSport => item.sport_id === deactiveSport.sport_id);
          if (findStatus)
            item.is_active = 0;

          return item;
        });

        return Responder.success(res, { data: apiSportsAndDBSportsListForParent, msg: "Sports list." })
      }
      else
        return Responder.success(res, { data: apiSportsAndDBSportsList, msg: "Sports list." })
    } else {
      let userAndAllParentIds = [];
      let parentIdsObject = userDetails.data.parent_level_ids;
      await parentIdsObject.forEach(element => {
        userAndAllParentIds.push(element.user_id);
      });

      userAndAllParentIds.push(userid);
      let userAndParentAllDeactiveSports = await sportService.getUserAndParentAllDeactiveSport(userAndAllParentIds);
      let allDeactiveSportId = [];
      if (userAndParentAllDeactiveSports.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveSports = userAndParentAllDeactiveSports.data;
        await userAndParentAllDeactiveSports.forEach(element => {
          allDeactiveSportId.push(element.sport_id);
        });
      }
      let checkLoggedInUserIsParentOfUser = await commonService.getLoggedInUserIsParentOfUser(userid, loggedInUserId);
      if (checkLoggedInUserIsParentOfUser.statusCode === CONSTANTS.SUCCESS) {
        let allSports = await sportService.getAllSports();
        allSports = allSports.data;
        if (userAndParentAllDeactiveSports.length > 0) {
          let userAllSportsList = allSports.map((item) => {
            let findStatus = userAndParentAllDeactiveSports.find(deactiveSport => item.sport_id === deactiveSport.sport_id);
            if (findStatus)
              item.is_active = 0;
            return item;
          });
          return Responder.success(res, { data: userAllSportsList, msg: " Sports list." })
        }
        else
          return Responder.success(res, { data: allSports, msg: "Sports list." })
      }
      else {
        let allActiveSportsOfUser = await sportService.getAllSportsNotInDeactiveSports(allDeactiveSportId);
        if (allActiveSportsOfUser.statusCode === CONSTANTS.SUCCESS)
          return Responder.success(res, { data: allActiveSportsOfUser.data, msg: "Sports list." })
        else
          return Responder.success(res, { data: [], msg: "No active Sports found." })
      }
    }
  },
  userLockV1: async function (req, res) {
    return sportService
      .userLockV1(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, { data: result.data })
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  },
  getLiveCasinoSports: async function (req, res) {
    return sportService
      .getLiveCasinoSports(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, { data: result.data })
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }
}