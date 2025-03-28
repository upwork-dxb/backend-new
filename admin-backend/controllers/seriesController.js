const { STATUS_500, STATUS_422 } = require('../../utils/httpStatusCode');

const _ = require('lodash')
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ObjectId } = require("bson")
  , axios = require('axios')
  , Responder = require('../../lib/expressResponder')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , commonService = require('../service/commonService')
  , userService = require('../service/userService')
  , sportService = require('../service/sportService')
  , seriesService = require('../service/seriesService')
  , apiUrlSettingsService = require('../service/apiUrlSettingsService')
  , CONSTANTS = require('../../utils/constants')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, LABEL_DIAMOND } = require('../../utils/constants')
  , utils = require('../../utils')
  , { getSportName, blockEvent } = utils
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_VALIDATION_FAILED, LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig');

module.exports = class SeriesController {

  static async createSeries(req, res) {

    const createSeriesSchema = Joi.object({
      sport_id: Joi.string().required(),
      series_id: Joi.string().required(),
      name: Joi.string().required(),
      is_manual: Joi.string().valid(0, 1).required()
    });
    try {
      await createSeriesSchema.validateAsync(req.body, {
        abortEarly: false
      });
    } catch (error) {
      return Responder.error(res, { msg: error.details.map(data => data.message).toString() });
    }

    let checkSeriesAlreadyExist = await seriesService.isSeriesDataExists(req.body.series_id);
    if (checkSeriesAlreadyExist.statusCode === CONSTANTS.SUCCESS)
      return Responder.error(res, { msg: "Series already exist." });
    req.body.sport_name = await getSportName(req.body.sport_id);
    req.body.series_name = req.body.name;
    let datafromService = await seriesService.createSeries(req.body);
    if (datafromService.statusCode === CONSTANTS.SUCCESS)
      return Responder.success(res, { msg: "Series Added Successfully" });
    else
      return Responder.error(res, { msg: datafromService.data });
  }

  static async createSeriesV1(req, res) {
    return seriesService.createSeriesV1(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { msg: result.data }) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static async updateSeriesStatus(req, res) {
    let { series_id, is_active, userid } = req.body;
    let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
    let loggedInUserDetails = await commonService.getUserByUserId(req.User._id, getUserFieldsName);
    let user_type_id = loggedInUserDetails.data.user_type_id;
    let userDetails = await commonService.getUserByUserId(userid, getUserFieldsName);
    let user_typeId = userDetails.data.user_type_id;
    if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN && user_typeId == CONSTANTS.USER_TYPE_SUPER_ADMIN) {
      let updateSeries = await seriesService.updateSeriesStatus(series_id, is_active);
      if (updateSeries.statusCode === CONSTANTS.SUCCESS) {
        let msg = is_active == 1 ? "Series activated successfully..." : "Series deactivated successfully..."
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return Responder.success(res, { msg: msg })
      }
      else if (updateSeries.statusCode === CONSTANTS.NOT_FOUND) {
        let msg = "Series not found! please create it first..."
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return Responder.success(res, { msg: msg })
      }
      else {
        let msg = "Error while updating series status!"
        // Update activity log status.
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
        return Responder.success(res, { msg: msg })
      }

    }
    else {
      let user_id = userid;
      let reqData = { user_id, series_id };
      let getUserDeeactiveSeries = await seriesService.getDeactiveSeries(reqData);
      let allParentIds = [];

      let parentIdsObject = userDetails.data.parent_level_ids;
      await parentIdsObject.forEach(element => {
        allParentIds.push(element.user_id);
      });
      let checkParentsSeries = await seriesService.checkParentIdsDeactiveSeries(series_id, allParentIds);
      if (checkParentsSeries.statusCode === CONSTANTS.SUCCESS) {
        let msg = "Can not update parent series deactivated !"
        // Update activity log status.
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: msg })
        return Responder.success(res, { msg: msg })
      }
      if (getUserDeeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
        let deleteDeactiveSeries = await seriesService.deleteDeactiveSeries(reqData);
        if (deleteDeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
          let msg = 'Child(s) series activated...'
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { msg: msg })
        }
        else {
          let msg = "Error Occurred !"
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { msg: msg })
        }
      }
      else if (getUserDeeactiveSeries.statusCode === CONSTANTS.NOT_FOUND) {
        let createDeactiveSeries = await seriesService.createDeactiveSeries(reqData);
        if (createDeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
          let msg = 'Child(s) series deactivated...'
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { msg: msg })
        }
        else {
          let msg = "Error Occurred !"
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
          return Responder.success(res, { msg: "Error Occurred !" })
        }
      }
      else
        return Responder.success(res, { msg: "Error Occurred !" })

    }

  }

  static async updateSeriesStatusV1(req, res) {
    let { series_id, is_active, userid } = req.body;
    const profilechema = Joi.object({
      userid: Joi.string().optional(),
      series_id: Joi.required(),
      is_active: Joi.string().valid(0, 1).required(),
      user_typeId: Joi.optional()
    });
    try {
      await profilechema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    if (!userid)
      userid = req.User.user_id || req.User._id;

    let loggedInUserDetails = await commonService.getUserByUserId(userid, { user_type_id: 1, parent_id: 1, parent_level_ids: 1 });
    loggedInUserDetails = loggedInUserDetails.data;
    let user_type_id = loggedInUserDetails.user_type_id;
    // let userDetails = await commonService.getUserByUserId(userid, getUserFieldsName);
    // let user_typeId = userDetails.data.user_type_id;
    if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN && user_typeId == CONSTANTS.USER_TYPE_SUPER_ADMIN) {
      let updateSeries = await seriesService.updateSeriesStatus(series_id, is_active);
      if (updateSeries.statusCode === CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: is_active == 1 ? "Series activated successfully..." : "Series deactivated successfully..." })
      else if (updateSeries.statusCode === CONSTANTS.NOT_FOUND)
        return Responder.success(res, { msg: "Series not found! please create it first..." })
      else
        return Responder.success(res, { msg: "Error while updating series status!" })

    }
    else {
      let user_id = userid;
      let reqData = { user_id, series_id };
      let getUserDeeactiveSeries = await seriesService.getDeactiveSeries(reqData);

      let parentIds = loggedInUserDetails.parent_level_ids;
      parentIds = parentIds.map(data => data.user_id != null ? ObjectId(data.user_id) : null).filter(data => data);
      let checkParentsSeries = await seriesService.checkParentIdsDeactiveSeries(series_id, parentIds);
      if (checkParentsSeries.statusCode === CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: "Can not update parent series deactivated !" })

      let blocker_user_id = user_id;
      let userDeactiveSeries = { blocker_user_id, series_id };
      if (getUserDeeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
        let deleteDeactiveSeries = await seriesService.deleteDeactiveSeriesV1(reqData, userDeactiveSeries);
        if (deleteDeactiveSeries.statusCode === CONSTANTS.SUCCESS)
          return Responder.success(res, { msg: 'Child(s) series activated...' })
        else
          return Responder.success(res, { msg: "Error Occurred !" })
      }
      else if (getUserDeeactiveSeries.statusCode === CONSTANTS.NOT_FOUND) {
        let createDeactiveSeries = await seriesService.createDeactiveSeriesV1(reqData, userDeactiveSeries);
        if (createDeactiveSeries.statusCode === CONSTANTS.SUCCESS)
          return Responder.success(res, { msg: 'Child(s) series deactivated...' })
        else
          return Responder.success(res, { msg: "Error Occurred !" })
      }
      else
        return Responder.success(res, { msg: "Error Occurred !" })

    }

  }

  static async getOnlineSeries(req, res) {
    let { sport_id, userid } = req.body;
    const profilechema = Joi.object({
      userid: Joi.string().required(),
      sport_id: Joi.string().required()
    });
    try {
      await profilechema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    let isActive = await sportService.isSportIsActive(sport_id);
    if (isActive.statusCode === CONSTANTS.SUCCESS) {
      if (isActive.data == 0)
        return Responder.success(res, { msg: 'Sport not active yet!' })
    } else if (isActive.statusCode == CONSTANTS.SERVER_ERROR) {
      return Responder.success(res, { msg: 'Error to get sport.' })
    }
    let getUserFieldsName = { user_type_id: 1, parent_id: 1, parent_level_ids: 1 }
    let userDetails = await commonService.getUserByUserId(userid, getUserFieldsName);
    let user_type_id = userDetails.data.user_type_id;

    let apiUrlSettings = await commonService.getApiUrlSettings();
    let loggedInUserId = req.User._id;
    let logged_in_user_type_id = req.User.user_type_id;
    let onlineSeriesRes = [];
    try {
      onlineSeriesRes = await axios.get(apiUrlSettings.data.online_url + sport_id, { timeout: 3000 });
      onlineSeriesRes = onlineSeriesRes.data;

      if (!Array.isArray(onlineSeriesRes))
        onlineSeriesRes = [];
    } catch (error) { onlineSeriesRes = []; }

    let onlineSeriesList = onlineSeriesRes;

    var mapsdata = onlineSeriesList.map((element) => {
      return {
        sport_id: sport_id,
        series_id: element.competition.id,
        name: element.competition.name,
        is_manual: 0,
        is_active: 0,
        is_visible: 0,
        is_created: 0
      };
    });

    let allSeriesList = await seriesService.getAllSeries(sport_id);
    allSeriesList = allSeriesList.data;
    var seriesIds = new Set(allSeriesList.map(item => item.series_id));
    let apiSeriesAndDBSeriesList = [...allSeriesList, ...mapsdata.filter(item => !seriesIds.has(item.series_id))];

    let checkLoggedInUserIsParentOfUser = await commonService.getLoggedInUserIsParentOfUser(userid, loggedInUserId);
    let userAndAllParentIds = [];
    let parentIdsObject = userDetails.data.parent_level_ids;
    await parentIdsObject.forEach(element => {
      userAndAllParentIds.push(element.user_id);
    });

    if (logged_in_user_type_id == 0) {
      userAndAllParentIds.push(userid);
      let userAndParentAllDeactiveSeries = await seriesService.getUserAndParentAllDeactiveSeries(userAndAllParentIds)
      if (userAndParentAllDeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveSeries = userAndParentAllDeactiveSeries.data;
        let apiSeriesAndDBSeriesListForParent = apiSeriesAndDBSeriesList.map((item) => {
          let findStatus = userAndParentAllDeactiveSeries.find(deactiveSeries => item.series_id === deactiveSeries.series_id);
          if (findStatus)
            item.is_active = 0;
          else
            item.is_active = 1;

          return item;
        });

        return Responder.success(res, { data: apiSeriesAndDBSeriesListForParent, msg: "Series list." })
      }
      else
        return Responder.success(res, { data: apiSeriesAndDBSeriesList, msg: "Series list." })
    }

    else if (checkLoggedInUserIsParentOfUser.statusCode === CONSTANTS.SUCCESS) {
      userAndAllParentIds.push(userid);
      let userAndParentAllDeactiveSeries = await seriesService.getUserAndParentAllDeactiveSeries(userAndAllParentIds)
      if (userAndParentAllDeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveSeries = userAndParentAllDeactiveSeries.data;
        let apiSeriesAndDBSeriesListForParent = allSeriesList.map((item) => {
          let findStatus = userAndParentAllDeactiveSeries.find(deactiveSeries => item.series_id === deactiveSeries.series_id);
          if (findStatus)
            item.is_active = 0;
          else
            item.is_active = 1;

          return item;
        });

        return Responder.success(res, { data: apiSeriesAndDBSeriesListForParent, msg: "Series list." })
      }
      else
        return Responder.success(res, { data: allSeriesList, msg: "Series list." })
    } else if (user_type_id != 0) {
      userAndAllParentIds.push(userid);
      let userAndParentAllDeactiveSeries = await seriesService.getUserAndParentAllDeactiveSeries(userAndAllParentIds)
      if (userAndParentAllDeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveSeries = userAndParentAllDeactiveSeries.data;
        if (userAndParentAllDeactiveSeries.length > 0) {
          let userAllSeriesList = allSeriesList.filter((item) => {
            return userAndParentAllDeactiveSeries.find((item2) => {
              if (item.series_id == item2.series_id)
                item.is_active = 0;
              else
                item.is_active = 1;
              return item.series_id == item2.series_id;
            }) == undefined;
          });
          return Responder.success(res, { data: userAllSeriesList, msg: " Series list." })
        }
        else
          return Responder.success(res, { data: allSeriesList, msg: "Series list." })
      }
    }
    else
      return Responder.success(res, { msg: "No Series found." })

  }

  static async getJoinSeriessList(req, res) {

    const profilechema = Joi.object({
      user_id: Joi.string().optional()
    });

    try {
      await profilechema.validateAsync(req.body, {
        abortEarly: false
      });

      let { user_id } = req.body;
      if (!user_id)
        user_id = req.User.user_id || req.User._id;

      let getUserTypeIsNotAdmin = (req.User.user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN) ? false : true
        , Projection = { user_type_id: 1 };
      if (getUserTypeIsNotAdmin)
        Projection["parent_level_ids"] = 1;

      let loggedInUserDetails = await userService.getUserByUserId({ _id: user_id }, Projection);
      if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` })
      loggedInUserDetails = loggedInUserDetails.data;

      let parentIds = loggedInUserDetails.parent_level_ids.map(data => data.user_id).filter(data => data);
      let Object = parentIds.map(d => ObjectId(d));
      var list = await seriesService.getJoinData(Object, ObjectId(user_id));

      return Responder.success(res, { data: list, msg: "sports list." })
    } catch (error) {
      return Responder.error(res, error)
    }
  }

  // To get all series list for super admin & agents with block data.
  static async getSeries(req, res) {
    let validateField = {
      user_id: JoiObjectId.objectId().optional(),
      sport_id: Joi.string().required(),
      active_only: Joi.boolean().default(false).optional(),
      include_count: Joi.boolean().default(false).optional(),
    }
    return Joi.object(validateField).validateAsync(req.body, { abortEarly: false })
      .then(async body => {
        let { user_id, sport_id, active_only, include_count } = body, user_type_id, NAME, PARENT_LEVEL_IDS = [];
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
        if (!active_only && user_type_id == USER_TYPE_SUPER_ADMIN) {
          // if super admin logged in.
          let getAllSeriesFromAPI = [], matchCounts = {};
          try {
            getAllSeriesFromAPI = await axios.get(await apiUrlSettingsService.getSeriesUrl() + sport_id, { timeout: 3000 });
            getAllSeriesFromAPI = getAllSeriesFromAPI.data;
            if (!Array.isArray(getAllSeriesFromAPI))
              getAllSeriesFromAPI = [];
          } catch (error) { getAllSeriesFromAPI = []; }
          // parse api data according to db columns.
          if (getAllSeriesFromAPI.length) {
            getAllSeriesFromAPI = getAllSeriesFromAPI.map((element) => {
              let match_count = element.competition.matchCount || 0;
              matchCounts[element.competition.id] = match_count;
              return {
                sport_id,
                series_id: element.competition.id,
                name: element.competition.name,
                match_count,
                is_manual: 0,
                is_active: 0,
                is_visible: 0,
                is_created: 0
              };
            });
          }
          // get all series form db order by series and active
          let getAllSeriesFromDB = await seriesService.getAllSeries({ sport_id },
            { _id: 0, sport_id: 1, series_id: 1, name: 1, is_manual: 1, is_active: 1, is_visible: 1, is_created: 1, create_at: 1, match_count: 1 },
            { name: 1 }
          );
          if (!getAllSeriesFromAPI.length && getAllSeriesFromDB.statusCode == SUCCESS)
            if (!getAllSeriesFromDB.data.length)
              return Responder.error(res, { dataIs: NAME, msg: "nothing yet in API and DB!" });
          if (sport_id == CONSTANTS.LIVE_GAME_SPORT_ID)
            getAllSeriesFromAPI = [];
          if (getAllSeriesFromAPI.length) { //If api have some series
            let finalApiDbSeriesList = [], finalApiSeriesList = [];
            getAllSeriesFromDB = JSON.parse(JSON.stringify(getAllSeriesFromDB.data));
            getAllSeriesFromAPI.map(apiData => {
              let getMergedSeries = getAllSeriesFromDB.find(dbData => dbData.series_id == apiData.series_id);
              if (getMergedSeries != undefined)
                finalApiDbSeriesList.push({
                  ...apiData, ...getMergedSeries, match_count: `${apiData.match_count} API`
                });
              else
                finalApiSeriesList.push({ ...apiData });
            });
            return ResSuccess(res, {
              dataIs: NAME, data: [...finalApiDbSeriesList, ...finalApiSeriesList], loggedIn: {
                user_id: req.User.user_id, user_name: req.User.user_name
              },
              msg: `${finalApiSeriesList.length} API, ${finalApiDbSeriesList.length} DB : series found.`
            });
          } else {
            // if DB have some series
            if (getAllSeriesFromDB.statusCode == SUCCESS)
              return ResSuccess(res, { dataIs: NAME, msg: `${getAllSeriesFromDB.data.length} series found in DB`, data: getAllSeriesFromDB.data });
            else if ([NOT_FOUND, SERVER_ERROR].includes(getAllSeriesFromDB.statusCode))
              return ResError(res, { dataIs: NAME, msg: NOT_FOUND == getAllSeriesFromDB.statusCode ? "No series available yet!" : `Error while getting series from db : ${getAllSeriesFromDB.data}` });
          }
          return ResError(res, { dataIs: NAME, msg: "Nothing happened at this moment!" });
        } else {
          const { sports_permission } = (req.user || req.User);
          PARENT_LEVEL_IDS = PARENT_LEVEL_IDS.map(data => data.user_id.toString());
          return seriesService.getSeries({ sports_permission, sport_id, is_loggedin: true, include_count })
            .then(async events => {
              if (events.statusCode == SUCCESS) {
                let finalEventList = events.data;
                blockEvent({ finalEventList, user_id, is_self_view, PARENT_LEVEL_IDS });
                finalEventList = finalEventList.map(
                  ({ sport_id, name, series_id, is_active, count }) =>
                    ({ sport_id, name, series_id, is_active, ...(include_count ? { match_count: count } : {}) }))
                  .filter(data => data);
                return ResSuccess(res, {
                  dataIs: { user_id, name: NAME }, loggedIn: { user_id: req.User.user_id, name: `${req.User.name}(${req.User.user_name})` },
                  data: finalEventList, msg: `${finalEventList.length} series found...`,
                });
              } else
                return ResError(res, { msg: "No series available yet!" });
            });
        }
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // To get all series list for super admin & agents with block data.
  static async getSeriesV1(req, res) {
    try {
      const getSeriesSchema = Joi.object({
        user_id: JoiObjectId.objectId().optional(),
        sport_id: Joi.string().required()
      });
      try {
        await getSeriesSchema.validateAsync(req.body, {
          abortEarly: false
        });
      } catch (error) {
        return Responder.error(res, { msg: error.details.map(data => data.message).toString(), statusCode: STATUS_422 })
      }
      let { user_id, sport_id } = req.body;
      const loggedInUserId = (req.User.user_id || req.User._id)
        , Projection = { user_name: 1, user_type_id: 1, deactive_series: 1 };
      if (!user_id)
        user_id = loggedInUserId;
      // we need parent ids for else block.
      if (user_id || getUserTypeIsNotAdmin)
        Projection["parent_level_ids"] = 1;
      let loggedInUserDetails = await userService.getUserByUserId({ _id: user_id }, Projection);
      if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` })
      loggedInUserDetails = loggedInUserDetails.data;
      let user_type_id = loggedInUserDetails.user_type_id;
      if (user_type_id == CONSTANTS.USER_TYPE_SUPER_ADMIN) {
        // if super admin logged in.
        let getAllSeriesFromAPI = [];
        try {
          let apiUrlSettings = await commonService.getApiUrlSettings();
          if (apiUrlSettings.statusCode == CONSTANTS.SUCCESS) {
            apiUrlSettings = apiUrlSettings.data;
            getAllSeriesFromAPI = await axios.get(apiUrlSettings.online_url + sport_id, { timeout: 3000 });
            getAllSeriesFromAPI = getAllSeriesFromAPI.data;
            if (!Array.isArray(getAllSeriesFromAPI))
              getAllSeriesFromAPI = [];
          }
        } catch (error) { getAllSeriesFromAPI = []; }
        // parse api data according to db columns.
        if (getAllSeriesFromAPI.length)
          getAllSeriesFromAPI = getAllSeriesFromAPI.map((element) => {
            return {
              sport_id: sport_id,
              series_id: element.competition.id,
              name: element.competition.name,
              is_manual: 0,
              is_active: 0,
              is_created: 0
            };
          });
        // get all series form db order by series and active
        let getAllSeriesFromDB = await seriesService.getAllSeries({ sport_id },
          { _id: 0, sport_id: 1, series_id: 1, name: 1, is_manual: 1, is_active: 1, is_created: 1 },
          { name: 1 }
        );
        if (getAllSeriesFromDB.statusCode == CONSTANTS.SUCCESS) {
          getAllSeriesFromDB = getAllSeriesFromDB.data;
          let finalSeriesList = _.unionBy(getAllSeriesFromDB, getAllSeriesFromAPI, 'series_id');
          return Responder.success(res, { dataIs: loggedInUserDetails.user_name, msg: `${finalSeriesList.length} series found...`, data: finalSeriesList })
        }
        if (!getAllSeriesFromAPI.length || [CONSTANTS.NOT_FOUND, CONSTANTS.SERVER_ERROR].includes(getAllSeriesFromDB.statusCode)) {
          return Responder.error(res, { dataIs: loggedInUserDetails.user_name, msg: `No series available yet!, ${getAllSeriesFromDB.data}` });
        }
      } else {
        let allDeactiveSeriesIds = loggedInUserDetails.deactive_series || [];
        let parentDeactiveSeriesIds = allDeactiveSeriesIds.map(data => data.blocker_user_id != user_id ? data.series_id : null).filter(data => data);
        let userSelfDeactiveSeriesIds = allDeactiveSeriesIds.map(data => data.blocker_user_id == user_id ? data.series_id : null).filter(data => data);
        let agentActiveSeries = await seriesService.getAgentSeriesV1(parentDeactiveSeriesIds, userSelfDeactiveSeriesIds, sport_id);
        if (agentActiveSeries.statusCode == CONSTANTS.SUCCESS)
          return Responder.success(res, { dataIs: loggedInUserDetails.user_name, msg: `${agentActiveSeries.data.length} series found...`, data: agentActiveSeries.data });
        else if (agentActiveSeries.statusCode == CONSTANTS.NOT_FOUND)
          return Responder.error(res, { dataIs: loggedInUserDetails.user_name, msg: `No series available yet!` });
        else
          return Responder.error(res, { dataIs: loggedInUserDetails.user_name, msg: `Something went wrong! : ${agentActiveSeries.data}` });
      }
    }
    catch (error) {
      return Responder.error(res, { msg: `Something went wrong! : ${error.message}`, statusCode: STATUS_500 });
    }
  }

  static series(req, res) {
    return Joi.object({
      sport_id: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(body => {
        let filter = { sport_id: body.sport_id, "is_active": 1, "is_visible": true };
        return seriesService.getSeries(filter)
          .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { data: result.data }) : ResError(res, { msg: "No series found." }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

}