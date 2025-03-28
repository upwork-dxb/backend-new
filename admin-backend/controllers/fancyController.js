const { STATUS_500, STATUS_200, STATUS_422 } = require('../../utils/httpStatusCode');
const { isFetchDataFromForFancyDB } = require('../../utils/index');

const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , _ = require('lodash')
  , { ObjectId } = require("bson")
  , Responder = require('../../lib/expressResponder')
  , CONSTANTS = require('../../utils/constants')
  , Fancy = require('../../models/fancy')
  , fancyService = require('../service/fancyService')
  , userService = require('../service/userService')
  , exchangeService = require('../service/exchangeService')
  , utils = require('../../utils')
  , { SocSuccess } = require('../../lib/socketResponder')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require('../../utils/constants')
  , { ResSuccess, ResError } = require('../../lib/expressResponder')
  , { getSportIdSeriesIdByMatch } = utils;

module.exports = class FancyController {

  // To create new fancy
  static createFancy(req, res) {
    return Joi.object({
      sport_id: Joi.string().required(),
      sport_name: Joi.string().required(),
      series_id: Joi.string().required(),
      series_name: Joi.string().required(),
      match_id: Joi.string().required(),
      match_name: Joi.string().required(),
      name: Joi.string().required(),
      fancy_name: Joi.string().required(),
      session_value_yes: Joi.string().optional(),
      session_value_no: Joi.string().optional(),
      session_size_no: Joi.string().optional(),
      session_size_yes: Joi.string().optional(),
      selection_id: Joi.string().required(),
      centralId: Joi.string().allow(null).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(body => {
        let { match_id, selection_id } = body;
        let fancy_id = match_id + '_' + selection_id;
        body["fancy_id"] = fancy_id;
        return fancyService.checkFancyExist(fancy_id).then(checkFancyAlreadyExist => {
          if (checkFancyAlreadyExist.statusCode == SUCCESS)
            return ResError(res, { msg: "Fancy already exist!" });
          else {
            return getSportIdSeriesIdByMatch(match_id).then(getSportIdSeriesIdByMatchStatus => {
              if (!getSportIdSeriesIdByMatchStatus.SUCCESS)
                return ResError(res, { msg: `Some required ids not found` });
              delete getSportIdSeriesIdByMatchStatus.SUCCESS;
              Object.assign(body, getSportIdSeriesIdByMatchStatus);
              return fancyService.createFancy(body).then(createFancy => {
                if (createFancy.statusCode === SUCCESS) {
                  const { fancy_id, name, fancy_name, selection_id, is_active, is_lock } = createFancy.data;
                  req.IO.emit(match_id + "_fancy_added", SocSuccess({
                    data: { fancy_id, name, fancy_name, selection_id, is_active, is_lock },
                    hasData: true,
                    msg: "New fancy added..."
                  }));
                  return ResSuccess(res, "Fancy created Successfully!");
                } else
                  return ResError(res, { msg: "Error to create fancy!" });
              }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
            }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
          }
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  //To update fancy
  static async updateFancyById(req, res) {
    try {
      const updateFancySchema = Joi.object({
        fancy_id: Joi.string().required(),
        active: Joi.string().valid(0, 1, 2),
        max_session_bet_liability: Joi.string(),
        max_session_liability: Joi.string(),
        name: Joi.string(),
      });
      try {
        await updateFancySchema.validateAsync(req.body, {
          abortEarly: true
        });
      } catch (error) {
        return Responder.error(res, { msg: error.details[0].message, statusCode: STATUS_422 })
      }

      let updateFancy = await fancyService.updatefancyData(req.body, req.body.fancy_id);
      if (updateFancy.statusCode === CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: "Fancy update successfully" })
      else if (updateFancy.statusCode === CONSTANTS.NOT_FOUND)
        return Responder.success(res, { msg: "Fancy not found" })
      else
        return Responder.error(res, { msg: "Error occured" })
    } catch (error) {
      return Responder.error(res, { error, statusCode: STATUS_500 })
    }
  }

  static async updateFancy(req, res) {
    return Joi.object({
      fancy_id: Joi.string().required(),
      category: Joi.number().optional(),
      chronology: Joi.number().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        return fancyService.editFancyData(req)
          .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { msg: result.data }) : ResError(res, { msg: result.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static async updateFancyOrder(req, res) {
    return fancyService
      .updateFancyOrder(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data }),
      )
      .catch((error) => ResError(res, error));
  }

  //To get fancy
  static async getFancy(req, res) {
    try {
      let { match_id, name, user_id } = req.body;
      const getFancySchema = Joi.object({
        user_id: Joi.string(),
        match_id: Joi.string(),
        page: Joi.number().required(),
        limit: Joi.number().optional(),
        name: Joi.optional()
      });
      try {
        await getFancySchema.validateAsync(req.body, {
          abortEarly: true
        });
      } catch (error) {
        return ResError(res, error);
      }
      var limit = req.body.limit || 10;
      var page = (req.body.page != undefined) ? (req.body.page - 1) * limit : 0;
      const loggedInUserId = (req.User.user_id || req.User._id)
        , Projection = { user_name: 1, user_type_id: 1 };
      if (!user_id)
        user_id = loggedInUserId;
      // we need parent ids for else block.
      if (user_id || getUserTypeIsNotAdmin)
        Projection["parent_level_ids"] = 1;
      let loggedInUserDetails = await userService.getUserByUserId({ _id: user_id }, Projection);
      if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` })
      loggedInUserDetails = loggedInUserDetails.data;
      let parentIds = loggedInUserDetails.parent_level_ids;
      parentIds = parentIds.map(data => data.user_id != null ? ObjectId(data.user_id) : null).filter(data => data);
      let fancyFromDb = await fancyService.getFancy({ match_id: match_id, name: name, page: page, limit: limit, parentIds: parentIds, user_id: ObjectId(user_id), user_type_id: loggedInUserDetails.user_type_id });
      if (fancyFromDb.statusCode === CONSTANTS.SUCCESS)
        return Responder.success(res, { data: fancyFromDb.data.fencyData, total: fancyFromDb.data.total, msg: "Fancy list" })
      else if (fancyFromDb.statusCode === CONSTANTS.NOT_FOUND)
        return Responder.success(res, { msg: "Fancy not found" })
      else
        return Responder.error(res, { msg: "Error occured" })
    }
    catch (error) {
      return Responder.error(res, { msg: error.message, statusCode: STATUS_500 })
    }
  }

  static getFancies(req, res) {
    const isFetchFromDB = isFetchDataFromForFancyDB();

    const service = isFetchFromDB
      ? fancyService.getFancies(req)
      : fancyService.getFanciesV2(req);

    return service
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, { ...result.data })
          : ResError(res, { msg: result.data })
      )
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static getFanciesV2(req, res) {
    return fancyService
      .getFanciesV2(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, { ...result.data })
          : ResError(res, { msg: result.data })
      )
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static async getFancyCombine(req, res) {
    req.body.combine = true;
    return FancyController.getFancies(req, res);
  }

  static async getFancyCombineV2(req, res) {
    req.body.combine = true;
    return FancyController.getFanciesV2(req, res);
  }

  static getFanciesOpen(req, res) {

    const isFetchFromDB = isFetchDataFromForFancyDB();

    const service = isFetchFromDB
      ? fancyService.getFanciesOpen(req)
      : fancyService.getFanciesV2(req);

    return service
      .then(data => ResSuccess(res, { data: data.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static getFanciesOpenV2(req, res) {
    return fancyService.getFanciesV2(req)
      .then(data => ResSuccess(res, { data: data.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  // To get fancy data from redis.
  static getFancyLiveData(req, res) {
    const { match_id, category } = req.joiData;

    const isFetchFromDB = isFetchDataFromForFancyDB();

    const service = isFetchFromDB
      ? exchangeService.getFancyLiveData(match_id)
      : fancyService.getFancyLiveDataV2({ match_id, category });

    return service
      .then((redisFancy) => {
        if (redisFancy.statusCode == CONSTANTS.SUCCESS)
          return ResSuccess(res, { data: redisFancy.data });
        return Responder.error(res, { msg: redisFancy.data });
      })
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  // To get fancy data from redis.
  static getFancyLiveDataV2(req, res) {
    const { match_id, category } = req.joiData;
    return fancyService
      .getFancyLiveDataV2({ match_id, category })
      .then((redisFancy) => {
        if (redisFancy.statusCode == CONSTANTS.SUCCESS)
          return ResSuccess(res, { data: redisFancy.data });
        return Responder.error(res, { msg: redisFancy.data });
      })
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  // To get fancy data from redis.
  static getFanciesLiveData(req, res) {
    return Joi.object({
      fancyIds: Joi.array().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        return exchangeService.getFanciesLiveData(req).then(redisFancy => {
          if (redisFancy.statusCode == CONSTANTS.SUCCESS)
            return ResSuccess(res, { data: redisFancy.data });
          return Responder.error(res, { msg: redisFancy.data, statusCode: STATUS_200 });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // To update fancy status
  static async updateFancyStatus(req, res) {
    return Joi.object({
      user_id: Joi.string().optional(),
      fancy_id: Joi.string().required(),
      is_active: Joi.number().valid(0, 1).required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ fancy_id, is_active }) => {
        return fancyService.updateFancyStatus(fancy_id, is_active).then(updateFancyStatusFromDB => {
          if (updateFancyStatusFromDB.statusCode == CONSTANTS.SUCCESS) {
            req.IO.emit(updateFancyStatusFromDB.data.match_id + "_fancy_added", SocSuccess({
              hasData: false,
              msg: "Fancy updated..."
            }));
            return ResSuccess(res, { msg: is_active == 1 ? "Fancy activated successfully..." : "Fancy deactivated successfully..." });
          } else if (updateFancyStatusFromDB.statusCode == CONSTANTS.NOT_FOUND)
            return ResError(res, { msg: 'Fancy not found! please create it first...' });
          else if (updateFancyStatusFromDB.statusCode == CONSTANTS.ALREADY_EXISTS)
            return ResError(res, { msg: `Fancy already ${is_active == 1 ? 'activated' : 'de-activated'}...` });
          else
            return ResError(res, { msg: 'Error while updating fancy status! ' + updateFancyStatusFromDB.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  //To get fancy third party api fancy and db fancy
  static async getOnlineApiFancy(req, res) {
    return Joi.object({
      user_id: Joi.optional(),
      match_id: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async ({ match_id }) => {
        let getAllFancyFromAPI = [];
        getAllFancyFromAPI = await fancyService.getOnlineFancyList(match_id);
        if (getAllFancyFromAPI.statusCode == SERVER_ERROR)
          return ResError(res, { msg: getAllFancyFromAPI.data });
        getAllFancyFromAPI = getAllFancyFromAPI.data;
        let fancyFromDb = await fancyService.getAllFancyByMatchId(match_id, { _id: 0, match_id: 1, fancy_id: 1, selection_id: 1 });
        if (fancyFromDb.statusCode == CONSTANTS.SUCCESS) {
          fancyFromDb = fancyFromDb.data;
          let finalFancyList = _.unionBy(fancyFromDb, getAllFancyFromAPI, 'selection_id');
          return ResSuccess(res, { msg: `${finalFancyList.length} fancy found...`, data: finalFancyList })
        }
        else if (getAllFancyFromAPI.length > 0)
          return ResSuccess(res, { msg: `${getAllFancyFromAPI.length} fancy found...`, data: getAllFancyFromAPI })
        else
          return ResError(res, { msg: "No fancy found" });
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getRunTimeFancyPosition(req, res) {
    return Joi.object({
      fancy_id: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ fancy_id }) => {
        const user_id = ObjectId(req.User.user_id || req.User._id);
        const user_type_id = req.User.user_type_id;
        return fancyService.getRunTimeFancyPosition(user_id, fancy_id, user_type_id).then(getRunTimeFancyPosition => {
          if (getRunTimeFancyPosition.statusCode != SUCCESS)
            return ResError(res, { msg: getRunTimeFancyPosition.data })
          return ResSuccess(res, { data: getRunTimeFancyPosition.data });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getRunTimeFancyPositionV1(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      fancy_id: Joi.string().required(),
      needSinglePosition: Joi.boolean().default(true).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(body => {
        let { user_id } = body;
        if (!user_id)
          user_id = ObjectId(req.User.user_id || req.User._id);
        else
          user_id = ObjectId(user_id);
        body.user_id = user_id;
        body.user_type_id = !user_id ? req.User.user_type_id : req.user.user_type_id;
        return fancyService.getFancyLiabilityBySharing(body).then(response => {
          if (response.statusCode == SUCCESS)
            return ResSuccess(res, { data: response.data });
          else
            return ResError(res, { msg: response.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getMatchesForResult(req, res) {
    return fancyService.getMatchesForFancyResult().then(getMatchesForFancyResult => {
      if (getMatchesForFancyResult.statusCode != SUCCESS)
        return ResError(res, { msg: getMatchesForFancyResult.data })
      return ResSuccess(res, { data: getMatchesForFancyResult.data });
    }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static fancyStake(req, res) {
    return Joi.object({
      search: Joi.object({
        series_id: Joi.string().optional(),
        series_name: Joi.string().optional(),
        match_id: Joi.string().optional(),
        match_name: Joi.string().optional(),
        event_id: Joi.string().optional(),
        event_name: Joi.string().optional(),
      }).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().min(50).max(500).default(50).optional(),
      page: Joi.number().min(1).max(100).default(1).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        data.user_id = (req.User.user_id || req.User._id);
        return fancyService.fancyStake(data).then(fancyStake => {
          if (fancyStake.statusCode != SUCCESS)
            return ResError(res, { msg: fancyStake.data });
          return ResSuccess(res, { data: fancyStake.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static fancyStakes(req, res, params) {
    let { user_id } = params;
    user_id = ObjectId(user_id ? user_id : (req.User.user_id || req.User._id));
    params.user_id = user_id;
    return fancyService.fancyStakeUsersWise(params).then(fancyStakeUsersWise => {
      if (fancyStakeUsersWise.statusCode != SUCCESS)
        return ResError(res, { parent_id: req.user.parent_id, msg: fancyStakeUsersWise.data });
      return ResSuccess(res, { parent_id: req.user.parent_id, data: fancyStakeUsersWise.data });
    }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static fancyStakeUsersWise(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      event_id: Joi.string().optional(),
      event_name: Joi.string().optional(),
    }).or('event_id', 'event_name').validateAsync(req.body, { abortEarly: false })
      .then(params => {
        return FancyController.fancyStakes(req, res, params);
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static fancyTotalStakeUsersWise(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        params.type = 2;
        return FancyController.fancyStakes(req, res, params);
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static results(req, res) {
    return Joi.object({
      search: Joi.object({
        _id: JoiObjectId.objectId().optional(),
        series_id: Joi.string().optional(),
        series_name: Joi.string().optional(),
        match_id: Joi.string().optional(),
        match_name: Joi.string().optional(),
        fancy_id: Joi.string().optional(),
        fancy_name: Joi.string().optional(),
        session_value_yes: Joi.string().optional(),
        session_value_no: Joi.string().optional(),
        session_size_no: Joi.string().optional(),
        session_size_yes: Joi.string().optional(),
        is_active: Joi.number().valid(0, 1, 2, 3).optional(),
        result: Joi.number().optional(),
        is_result_declared: Joi.number().valid(0, 1).optional(),
        createdAt: Joi.string().optional()
      }).optional(),
      limit: Joi.number().min(50).default(50).optional(),
      page: Joi.number().min(1).max(100).default(1).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(params => {
        if (params)
          if (params.hasOwnProperty("search"))
            if (params.search.hasOwnProperty("_id"))
              params["search"]["_id"] = ObjectId(params["search"]["_id"]);
        return fancyService.results(params).then(result => {
          if (result.statusCode == NOT_FOUND || !result.data.length)
            return ResError(res, { status: true, msg: result.data, data: [] });
          else if (result.statusCode == SERVER_ERROR)
            return ResError(res, { msg: result.data });
          return ResSuccess(res, { data: result.data[0] });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getResult(req, res) {
    return Joi.object({
      match_id: Joi.string().required(),
      fancy_id: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        return fancyService.getResult(data).then(result => {
          if (result.statusCode == NOT_FOUND)
            return ResError(res, { msg: result.data });
          return ResSuccess(res, { data: result.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getFanciesCategory(req, res) {
    return fancyService.getFanciesCategory(req).then((result) =>
      result.statusCode == SUCCESS
        ? ResSuccess(res, result.data)
        : ResError(res, result.data )
    )
      .catch((error) => ResError(res, error));
  }

}