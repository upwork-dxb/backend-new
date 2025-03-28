const { STATUS_422 } = require('../../utils/httpStatusCode');
const Joi = require("joi")
  , axios = require('axios')
  , seriesService = require("../service/seriesService")
  , sportService = require("../service/sportService")
  , Responder = require('../../lib/expressResponder')
  , CONSTANTS = require('../../utils/constants')
  , commonService = require('../service/commonService')
  , adminSeriesController = require('../../admin-backend/controllers/seriesController');

module.exports = class SeriesController {
  //getOnlineSeries
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
    //todo
    let userDetails = await commonService.getUserByUserId(userid, getUserFieldsName);

    let user_type_id = userDetails.data.user_type_id;

    let apiUrlSettings = await commonService.getApiUrlSettings();
    let loggedInUserId = req.User._id;

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
        is_active: 1
      };
    });

    let allSeriesList = await seriesService.getAllSeries();
    allSeriesList = allSeriesList.data;

    let apiSeriesAndDBSeriesList = mapsdata.map((item) => {
      let findStatus = allSeriesList.find(series => item.series_id === series.series_id);
      if (findStatus && findStatus.is_active == 1)
        item.is_active = 1;
      else
        item.is_active = 0;
      if (findStatus == undefined)
        item.is_created = 0;
      else
        item.is_created = 1;
      return item;
    });

    let notMatchedSeries = allSeriesList.filter(dbSeries => !apiSeriesAndDBSeriesList.some(apiDbCommonSeries => apiDbCommonSeries.series_id === dbSeries.series_id));

    await notMatchedSeries.forEach(element => {
      apiSeriesAndDBSeriesList.push(element);

    });

    apiSeriesAndDBSeriesList = apiSeriesAndDBSeriesList.map((item) => {
      let findCreatedStatusForNotMatchedSeries = notMatchedSeries.find(notMatchedSeriesInApi => item.series_id === notMatchedSeriesInApi.series_id);
      if (findCreatedStatusForNotMatchedSeries != undefined)
        item.is_created = 1;
      return item;
    });

    //todo
    let checkLoggedInUserIsParentOfUser = await commonService.getLoggedInUserIsParentOfUser(userid, loggedInUserId);
    let userAndAllParentIds = [];
    let parentIdsObject = userDetails.data.parent_level_ids;
    await parentIdsObject.forEach(element => {
      userAndAllParentIds.push(element.user_id);
    });

    if (checkLoggedInUserIsParentOfUser.statusCode === CONSTANTS.SUCCESS) {
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

    if (user_type_id != 0) {
      userAndAllParentIds.push(userid);
      let userAndParentAllDeactiveSeries = await seriesService.getUserAndParentAllDeactiveSeries(userAndAllParentIds)
      if (userAndParentAllDeactiveSeries.statusCode === CONSTANTS.SUCCESS) {
        userAndParentAllDeactiveSeries = userAndParentAllDeactiveSeries.data;
        if (userAndParentAllDeactiveSeries.length > 0) {
          let userAllSeriesList = apiSportsAndDBSportsList.filter((item) => {
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
          return Responder.success(res, { data: apiSeriesAndDBSeriesList, msg: "Series list." })
      }
    }
    else
      return Responder.success(res, { data: apiSeriesAndDBSeriesList, msg: "Series list." })
  }

  // To get all sports list for super admin & agents with block data
  static async getSeries(req, res) {
    return adminSeriesController.getSeries(req, res);
  }
}