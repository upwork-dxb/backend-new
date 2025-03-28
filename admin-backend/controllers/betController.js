const { ObjectId } = require("bson")
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , { SocSuccess } = require('../../lib/socketResponder')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_USER, USER_TYPE_SUPER_ADMIN } = require('../../utils/constants')
  , BetResults = require("../../models/betResults")
  , Match = require("../../models/match")
  , Market = require("../../models/market")
  , Fancy = require("../../models/fancy")
  , User = require("../../models/user")
  , BetOdds = require("../../models/betsOdds")
  , betService = require('../service/betService')
  , MarketAnalysis = require('../../models/marketAnalysis')
  , { updateLogStatus } = require('../service/userActivityLog')
  , { LOG_SUCCESS } = require('../../config/constant/userActivityLogConfig')
  , moment = require('moment');
const PdfDocService = require('../service/document/pdf/index');
const { STATUS_200, STATUS_500, STATUS_422 } = require("../../utils/httpStatusCode");
const CsvDocService = require("../service/document/csv");
const utils = require("../../utils");

module.exports = class BetController {

  static getTeamPosition(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().optional(),
      match_ids: Joi.optional(),
      market_ids: Joi.optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ user_id, match_id, match_ids, market_ids }) => {
        if (!user_id)
          user_id = ObjectId(req.User.user_id || req.User._id);
        else
          user_id = ObjectId(user_id);
        if (match_id)
          match_ids = match_id;
        return betService.getTeamPosition(user_id, match_ids, market_ids).then(teamData => {
          if (teamData.statusCode == NOT_FOUND)
            return ResError(res, { status: true, msg: teamData.data, data: {} });
          else if (teamData.statusCode == SERVER_ERROR)
            return ResError(res, { msg: teamData.data });
          return ResSuccess(res, { data: teamData.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getMarketsMaxLiability(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().optional(),
      match_ids: Joi.optional(),
      market_ids: Joi.required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(body => {
        let { user_id } = body;
        if (!user_id)
          user_id = ObjectId(req.User.user_id || req.User._id);
        else
          user_id = ObjectId(user_id);
        body.user_id = user_id;
        return betService.getMarketMaxLiablity(body).then(teamData => {
          if (teamData.statusCode == NOT_FOUND)
            return ResError(res, { status: true, msg: teamData.data, data: {} });
          else if (teamData.statusCode == SERVER_ERROR)
            return ResError(res, { msg: teamData.data });
          return ResSuccess(res, { data: teamData.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getFancyLiability(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().optional(),
      match_ids: Joi.optional(),
      fancy_ids: Joi.optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ user_id, match_id, match_ids, fancy_ids }) => {
        if (!user_id)
          user_id = ObjectId(req.User.user_id || req.User._id);
        else
          user_id = ObjectId(user_id);
        if (match_id)
          match_ids = match_id;
        return betService.getFancyLiability(user_id, match_ids, fancy_ids).then(fancyLiabilityData => {
          if (fancyLiabilityData.statusCode == NOT_FOUND)
            return ResSuccess(res, { data: {} });
          else if (fancyLiabilityData.statusCode == SERVER_ERROR)
            return ResError(res, { msg: fancyLiabilityData.data });
          return ResSuccess(res, { data: fancyLiabilityData.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getFancyLiabilityBySharing(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().optional(),
      match_ids: Joi.optional(),
      fancy_ids: Joi.optional(),
      needExposure: Joi.optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(body => {
        let { user_id } = body;
        if (!user_id)
          user_id = ObjectId(req.User.user_id || req.User._id);
        else
          user_id = ObjectId(user_id);
        body.user_id = user_id;
        return betService.getFancyLiabilityBySharing(body).then(response => {
          if (response.statusCode == SUCCESS)
            return ResSuccess(res, { data: response.data });
          else
            return ResError(res, { msg: response.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static bets(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().optional(),
      market_id: Joi.optional(),
      fancy_id: Joi.optional(),
      search: Joi.object({
        _id: JoiObjectId.objectId().optional(),
        user_id: JoiObjectId.objectId().optional(),
        user_name: Joi.string().min(3).max(20).optional(),
        domain_name: Joi.string().optional(),
        sport_id: Joi.string().optional(),
        series_id: Joi.string().optional(),
        match_id: Joi.string().optional(),
        market_id: Joi.string().optional(),
        fancy_id: Joi.string().optional(),
        market_name: Joi.string().optional(),
        fancy_name: Joi.string().optional(),
        selection_id: Joi.number().optional(),
        selection_name: Joi.string().optional(),
        sort_name: Joi.string().optional(),
        winner_name: Joi.string().optional(),
        type: Joi.number().optional(),
        is_fancy: Joi.number().optional(),
        odds: Joi.number().optional(),
        run: Joi.number().optional(),
        size: Joi.number().optional(),
        stack: Joi.number().optional(),
        is_back: Joi.number().valid(0, 1).optional(),
        p_l: Joi.number().optional(),
        liability: Joi.number().optional(),
        bet_result_id: Joi.optional(),
        device_type: Joi.string().optional(),
        ip_address: Joi.string().optional(),
        device_info: Joi.string().optional(),
        is_fraud_bet: Joi.number().valid(0, 1, 2).optional(),
        delete_status: Joi.optional(),
        deleted_reason: Joi.string().optional(),
        deleted_by: Joi.string().optional(),
        deleted_from_ip: Joi.string().optional(),
        createdAt: Joi.string().optional(),
        updatedAt: Joi.string().optional(),
        is_matched: Joi.number().valid(0, 1).optional(),
        category: Joi.number().valid(0, 1, 2, 3).optional(),
        category_name: Joi.string().optional(),
        market_type: Joi.string().optional(),
        amount_from: Joi.number().optional(),
        amount_to: Joi.number().optional(),
      }).optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().min(25).default(25).optional(),
      page: Joi.number().min(1).max(4000).default(1).optional(),
      round_id: Joi.optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        let { user_id, search } = data;
        if (!user_id)
          user_id = ObjectId(req.User.user_id || req.User._id);
        else
          user_id = ObjectId(user_id);
        if (search) {
          if (search._id)
            search["_id"] = ObjectId(search._id);
          if (search.user_id) {
            search["user_id"] = ObjectId(search.user_id);
            search["user_type_id"] = req.user.user_type_id;
          }
        }
        data.user_id = user_id;
        data.user_type_id = req.User.user_type_id;
        data.path = req.path;
        data.search = search;
        return betService.bets(data).then(bets => {
          if (bets.statusCode != SUCCESS)
            return ResError(res, { msg: bets.data });
          return ResSuccess(res, { data: bets.data[0] });
        }).catch(error => ResError(res, error));
      }).catch(error => {
        if (error.hasOwnProperty("details"))
          return ResError(res, { msg: error.details.map(data => data.message).toString() });
        return ResError(res, error);
      });
  }

  static openBets(req, res) {
    Object.assign(req.body, {
      search: {
        delete_status: {
          '$in': [0, 2]
        },
        bet_result_id: null,
        ...req.body.search
      }
    });
    return BetController.bets(req, res);
  }

  static async openBetsDocument(req, res) {
    try {
      let data = req.joiData;
      Object.assign(data, {
        search: {
          delete_status: {
            '$in': [0, 2]
          },
          bet_result_id: null,
          ...req.body.search
        }
      });
      let { user_id, search } = data;
      if (!user_id)
        user_id = ObjectId(req.User.user_id || req.User._id);
      else
        user_id = ObjectId(user_id);
      if (search) {
        if (search._id)
          search["_id"] = ObjectId(search._id);
        if (search.user_id) {
          search["user_id"] = ObjectId(search.user_id);
          search["user_type_id"] = req.user.user_type_id;
        }
      }
      data.user_id = user_id;
      data.user_type_id = req.User.user_type_id;
      data.path = '/openBets';
      data.search = search;

      const { document_type } = req.body;
      const betsRes = await betService.bets(data);
      if (!betsRes?.data[0]?.data) {
        return betsRes;
      }
      const list =
        Array.isArray(betsRes?.data[0]?.data) &&
          betsRes?.data[0]?.data.length
          ? betsRes?.data[0]?.data
          : [];
      const phead = [
        { title: "Event Type" },
        { title: "Event Name" },
        { title: "User Name" },
        { title: "M Name" },
        { title: "Nation" },
        { title: "User Rate" },
        { title: "Amount" },
        { title: "Place Date" },
        { title: "IP" },
        { title: "Browser" },
      ];
      const ptextProperties = { title: "Current Bets", x: 155, y: 9 };
      let columnCount = phead.length;
      const cellWidth = "auto",
        pbodyStyles = Object.fromEntries(
          phead.map((col, index) => [
            index,
            { cellWidth: col.width !== undefined ? col.width : cellWidth },
          ]),
        );
      let pbody = list
        .map((item, index) => [
          item.sport_name,
          item.match_name,
          item.user_name,
          item.market_name,
          item.selection_name,
          item.odds,
          item.stack,
          moment(item.createdAt).format('DD/MM/YYYY HH:mm:ss'), // Formatted date
          item.ip_address,
          item.device_info,
        ]);
      if (document_type == "PDF") {
        const pdfRes = await PdfDocService.createPaginatedPdf(res, {
          orientation: "l",
          ptextProperties,
          phead,
          pbody,
          pbodyStyles,
          fileName: "current_bet",
        });

        return pdfRes;
      }
      if (document_type == "CSV") {
        let data = await CsvDocService.formatExcelData(phead, pbody);
        const csvbRes = await CsvDocService.createPaginatedCsv(res, {
          data,
          fileName: "Current bet",
          columnCount: columnCount,
        });
        return csvbRes;
      }
    } catch (error) {
      return ResError(res, error);
    }

  }

  static unMatchedBets(req, res) {
    Object.assign(req.body, {
      search: {
        delete_status: {
          '$in': [0, 2]
        },
        bet_result_id: null,
        is_matched: 0,
        ...req.body.search
      }
    });
    return BetController.bets(req, res);
  }

  static settledBets(req, res) {
    Object.assign(req.body, {
      search: {
        delete_status: {
          '$in': [0, 2]
        },
        bet_result_id: {
          '$ne': null
        },
        ...req.body.search
      }
    });
    return BetController.bets(req, res);
  }

  static fraudBets(req, res) {
    return BetController.bets(req, res);
  }


  static deleteBetAction(req, res, method) {
    return method(req, res)
      .then(result => {
        if (result.statusCode == SUCCESS) {
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data })
          return ResSuccess(res, { msg: result.data });
        }
        else {
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data })
          return ResError(res, { msg: result.data });
        }
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static deleteBet(req, res) {
    return BetController.deleteBetAction(req, res, betService.deleteBet);
  }

  static deleteBets(req, res) {
    return BetController.deleteBetAction(req, res, betService.deleteBets);
  }

  static async cancelBet(req, res, { params }) {
    try {
      params.deleted_from_ip = req.ip_data;
      params.deleted_by = req.User.user_name;
      params.is_fancy = 0;
      params.deleted_reason = `Cancelled by ${req.User.user_name}`;

      const betOdd = await BetOdds.findOne({ _id: params.bet_id, is_matched: 0, user_id: req.user._id, delete_status: 0 },
        { _id: 1, market_id: 1 }).lean();

      if (!betOdd)
        return ResError(res, { msg: "Bet Not Found OR Only Cancel UnMatched Bets" });

      let markets_liability;
      if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {
        const user_markets_liability = await User.findOne({ _id: req.user._id }, { markets_liability: 1 }).lean();
        markets_liability = user_markets_liability.markets_liability;
      } else {
        markets_liability = req.user.markets_liability;
      }

      Object.assign(params, req.user, { markets_liability });

      const betDelete = await betService.deleteBet(params);

      if (betDelete.statusCode == SUCCESS) {
        Market.updateOne(
          { market_id: betOdd.market_id, "unmatch_bets.bet_id": params.bet_id },
          { $set: { "unmatch_bets.$.delete_status": 1 } }
        ).then().catch(console.error);
        return ResSuccess(res, { msg: 'Bet Cancelled Successfully...' });
      } else {
        return ResError(res, { msg: betDelete.data });
      }

    } catch (error) {
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

  static cancelUnmatchedBet(req, res) {
    let joiObject = {
      bet_id: JoiObjectId.objectId().required(),
    };
    if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {
      req.user = req.User;
    } else {
      joiObject = {
        ...joiObject,
        user_id: JoiObjectId.objectId().required(),
        password: Joi.string().min(6).max(12).required(),
      }
    }
    return Joi.object(joiObject)
      .validateAsync(req.body, { abortEarly: false })
      .then(async (params) => {

        return await BetController.cancelBet(req, res, { params });

      }).catch(error => {
        return ResError(res, error);
      });
  }

  static cancelUnmatchedBetAll(req, res) {
    return Joi.object({
      market_id: JoiObjectId.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async (params) => {
        if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN)
          req.user = req.User;

        const betOdds = await BetOdds.find({ market_id: params.market_id, is_matched: 0, user_id: req.user.user_id, delete_status: 0 },
          { _id: 1, market_id: 1 }).lean();
        const responseArr = [];
        for (const bet of betOdds) {
          const response = await BetController.cancelBet(req, res, {
            params: { ...params, bet_id: bet._id },
          });
          responseArr.push(response.data);
        }
        if (!responseArr.length) {
          return ResSuccess(res, { msg: "Already canceled or no unmatched bets are available for cancellation." });
        }
        return ResSuccess(res, { msg: [...new Set(responseArr)].toString() });
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // sp_set_result_odds
  static oddsResult(req, res) {
    return Joi.object({
      sport_id: Joi.string().required(),
      sport_name: Joi.string().required(),
      series_id: Joi.string().required(),
      series_name: Joi.string().required(),
      match_id: Joi.string().required(),
      match_name: Joi.string().required(),
      match_date: Joi.string().required(),
      market_id: Joi.string().required(),
      market_name: Joi.string().required(),
      selection_id: Joi.number().required(),
      selection_name: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        let { sport_id, sport_name, series_id, series_name, match_id, match_name, market_id, market_name, selection_id, selection_name } = data;
        return BetResults.findOne(
          { sport_id, series_id, match_id, market_id }
        ).then(betResultAlreadyDeclared => {
          if (betResultAlreadyDeclared != null)
            return ResError(res, { msg: "Result already declared!", statusCode: STATUS_422 });
          let betResult = new BetResults(Object.assign(data, { winner_name: data.selection_name }));
          return new Promise(async function (resolve, reject) {
            let resultParams = Object.assign(data, { bet_result_id: betResult._id })
              , oddsResult;
            if (req.path == "/oddsResultV2")
              oddsResult = betService.oddsResultV2(resultParams);
            else
              oddsResult = betService.oddsResultV1(resultParams);
            await oddsResult.then(oddsResult => {
              if (oddsResult.statusCode != SUCCESS) {
                Market.updateOne({ sport_id, series_id, match_id, market_id }, { result_status: oddsResult.data }).then().catch(console.error);
                return reject(oddsResult.data);
              }
              Market.updateOne(
                { sport_id, series_id, match_id, market_id },
                {
                  result_status: oddsResult.data, is_active: 0, is_result_declared: 1,
                  bet_result_id: betResult._id, result_selection_id: selection_id,
                  result_selection_name: selection_name,
                  result_settled_at: new Date(), result_settled_ip: req.ip_data
                }
              ).then(async () => {
                if (market_name == "Match Odds") {
                  Match.updateOne({ match_id }, { is_active: 0, is_result_declared: 1 }).then().catch(console.error);
                  MarketAnalysis.deleteMany({ match_id }).then().catch(console.error);
                }
                req.IO.emit(match_id + "_new_market_added", SocSuccess({
                  msg: `Market result ${sport_name} -> ${series_name} -> ${match_name}`,
                  hasData: false,
                }));
                await betResult.save();
              }).catch(console.error);
              return ResSuccess(res, { msg: "Result declared successfully..." });
            }).catch(error => reject(`Result not declared: ${error.message}, Try again later...`));
          }).catch(function (error) {
            Market.updateOne({ sport_id, series_id, match_id, market_id }, { result_status: error }).then().catch(console.error);
            return ResError(res, { error, statusCode: STATUS_500 });
          });
        }).catch(error => ResError(res, { msg: `Error while getting result: ${error.message}`, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static oddsResultV1(req, res) {
    Object.assign(req.body, req.joiData);
    return betService.oddsResultPreProcess(req, {})
      .then(result => {
        if (result.statusCode != SUCCESS)
          return ResError(res, { msg: result.data });
        result = result.data;
        if (result.data) {
          const { match_id, sport_name, series_name, match_name } = result.data;
          req.IO.emit(match_id + "_new_market_added", SocSuccess({
            msg: `Market result ${sport_name} -> ${series_name} -> ${match_name}`,
            hasData: false,
          }));
        }
        return ResSuccess(res, { msg: result.msg });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // sp_rollback_result_odds
  static oddsRollback(req, res) {
    return Joi.object({
      // bet_result_id: JoiObjectId.objectId().required(),
      market_id: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ market_id }) => {
        return betService.processOddsRollback({ market_id })
          .then(processOddsRollback => {
            if (processOddsRollback.statusCode != SUCCESS) {
              return ResError(res, { msg: processOddsRollback.data, statusCode: STATUS_500 });
            }
            const { match_id, msg } = processOddsRollback.data;
            req.IO.emit(match_id + "_new_market_added", SocSuccess({
              msg: "Market rollback...",
              hasData: false,
            }));
            return ResSuccess(res, { msg });
          }).catch(error => ResError(res, { msg: `Error while rollback the market result: ${error.message}`, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // sp_abandoned_market
  static oddsAbandoned(req, res) {
    let { market_id, rollback } = req.joiData;
    let where = { market_id, is_result_declared: 0 };
    if (rollback) {
      where["is_result_declared"] = 1;
      where["is_abandoned"] = 1;
    }
    return Market.findOne(
      where, { sport_id: 1, series_id: 1, match_id: 1, market_name: 1 }
    ).then(market => {
      // Check result is not declared or not rollbacked.
      if (market != null) {
        market = JSON.parse(JSON.stringify(market));
        return betService.oddsAbandoned(Object.assign(market, { market_id, rollback })
        ).then(async oddsAbandoned => {
          if (oddsAbandoned.statusCode == SUCCESS) {
            req.IO.emit(market.match_id + "_new_market_added", SocSuccess({
              msg: "Market abandoned...",
              hasData: false,
            }));
            if (!rollback) {
              if (market.market_name == "Match Odds") {
                MarketAnalysis.deleteMany({ match_id: market.match_id }).then().catch(console.error);
                await Match.updateOne(
                  { match_id: market.match_id },
                  { $set: { enable_fancy: 0 } }
                );
                await Fancy.updateMany(
                  { match_id: market.match_id, is_active: 1 },
                  { $set: { is_active: 0 } }
                );
              }
            } else {
              await Match.updateOne(
                { match_id: market.match_id },
                { $set: { enable_fancy: 1 } }
              );
            }

            // Update activity log status.
            updateLogStatus(req, { status: LOG_SUCCESS, msg: oddsAbandoned.data })
            return ResSuccess(res, { msg: oddsAbandoned.data });
          }
          return ResError(res, { msg: oddsAbandoned.data });
        }).catch(error => ResError(res, { msg: `Error while abandon the market result: ${error.message}`, statusCode: STATUS_500 }));
      } else {
        let msg = rollback ? "Market already rollbacked!" : "Market result already abandoned!";
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return ResError(res, { msg: msg });
      }
    }).catch(error => ResError(res, { msg: `Error while getting result: ${error.message}`, statusCode: STATUS_500 }));
  }

  // sp_set_result_fancy
  static sessionResult(req, res) {

    req.joiData.ip_data = req.ip_data;

    return betService.processFancyResult(req.joiData)
      .then(result => {

        if (result.statusCode != SUCCESS) {
          return ResError(res, { msg: result.data });
        }

        const { match_id, sport_name, series_name, match_name, fancy_name } = result.data;

        req.IO.emit(match_id + "_fancy_added", SocSuccess({
          hasData: false,
          msg: `Fancy result ${sport_name} -> ${series_name} -> ${match_name} -> ${fancy_name}`,
        }));

        return ResSuccess(res, { msg: result.data.msg });

      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // sp_rollback_result_fancy
  static sessionRollback(req, res) {

    return betService.processFancyRollback(req.joiData)
      .then(result => {

        if (result.statusCode != SUCCESS) {
          return ResError(res, { msg: result.data });
        }

        const { match_id, sport_name, series_name, match_name, fancy_name } = result.data;

        req.IO.emit(match_id + "_fancy_added", SocSuccess({
          hasData: false,
          msg: `Fancy rollback ${sport_name} -> ${series_name} -> ${match_name} -> ${fancy_name}`,
        }));

        return ResSuccess(res, { msg: result.data.msg });

      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // sp_abandoned_fancy
  static sessionAbandoned(req, res) {
    let { fancy_id, rollback } = req.joiData;
    let where = { fancy_id, is_result_declared: 0 };
    if (rollback) {
      where["is_result_declared"] = 1;
      where["is_active"] = 3; // Abandoned
    } else
      where['is_active'] = { '$in': [0, 1] };
    return Fancy.findOne(
      where, { sport_id: 1, series_id: 1, match_id: 1 }
    ).then(fancy => {
      // Check result is not declared or not rollbacked.
      if (fancy != null) {
        fancy = JSON.parse(JSON.stringify(fancy));
        return betService.sessionAbandoned(Object.assign(fancy, { fancy_id, rollback })
        ).then(sessionAbandoned => {
          if (sessionAbandoned.statusCode == SUCCESS) {
            Fancy.findOne({ fancy_id }).lean().select("-_id match_id")
              .then(fancy => req.IO.emit(fancy.match_id + "_fancy_added", SocSuccess({
                hasData: false,
                msg: "Fancy abandoned..."
              }))).catch(console.error);
            // Update activity log status.
            updateLogStatus(req, { status: LOG_SUCCESS, msg: sessionAbandoned.data })
            return ResSuccess(res, { msg: sessionAbandoned.data });
          }
          // Update activity log status.
          updateLogStatus(req, { status: LOG_SUCCESS, msg: sessionAbandoned.data })
          return ResError(res, { msg: sessionAbandoned.data });
        }).catch(error =>
          ResError(res, { msg: `Error while abandon the fancy result: ${error.message}`, statusCode: STATUS_500 })
        );
      } else {
        let msg = rollback ? "Fancy already rollbacked!" : "Fancy result already abandoned!";
        // Update activity log status.
        updateLogStatus(req, { status: LOG_SUCCESS, msg: msg })
        return ResError(res, { msg: msg });
      }
    }).catch(error => ResError(res, { msg: `Error while getting result: ${error.message}`, statusCode: STATUS_500 }));
  }

  static getExposures(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ user_id }) => {
        let user_type_id, user_name;
        if (!user_id) {
          user_id = ObjectId(req.User.user_id || req.User._id);
          user_type_id = req.User.user_type_id;
          user_name = `${req.User.name}(${req.User.user_name})`;
        } else {
          user_id = ObjectId(user_id);
          user_type_id = req.user.user_type_id;
          user_name = `${req.user.name}(${req.user.user_name})`;
        }
        let service;
        if (["/getExposuresV1", "/getExposureV1"].includes(req.path))
          service = betService.getExposuresV1(user_id, user_type_id);
        else
          service = betService.getExposures(user_id, user_type_id);
        return service.then(exposures => {
          if (exposures.statusCode != SUCCESS) {
            if (req.isOnlyExposure)
              return ResSuccess(res, { data: { liabilitySum: 0 } });
            return ResError(res, { msg: exposures.data });
          }
          if (exposures.data.length) {
            if (req.isOnlyExposure)
              return ResSuccess(res, { data: (exposures.data).pop() });
            return ResSuccess(res, { data: exposures.data, user_name });
          }
          return ResError(res, { msg: "No data found!", data: {} });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getExposuresV2(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      isOnlyExposure: Joi.boolean().default(false).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let userTypeId, user_name;
        let { user_id, isOnlyExposure } = data;
        if (!user_id) {
          userTypeId = req.User.user_type_id;
          user_id = ObjectId(req.User.user_id || req.User._id);
          user_name = `${req.User.name}(${req.User.user_name})`;
        } else {
          userTypeId = USER_TYPE_USER;
          user_id = ObjectId(user_id);
          user_name = `${req.User.name}(${req.User.user_name})`;
        }
        return betService.getExposuresV2({ user_id, userTypeId, isOnlyExposure }).then(betData => {
          if (betData.statusCode == NOT_FOUND)
            return ResError(res, { status: true, msg: betData.data, data: {}, statusCode: STATUS_200 });
          else if (betData.statusCode == SERVER_ERROR)
            return ResError(res, { msg: betData.data, statusCode: STATUS_200 });
          if (req.body.isOnlyExposure)
            return ResSuccess(res, { data: betData.data[0] });
          let liabilitySumObj = { liabilitySum: betData.data[0].liabilitySum };
          let newDataArray = betData.data[0].data;
          newDataArray.push(liabilitySumObj)
          return ResSuccess(res, { data: newDataArray, user_name });
        }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getExposure(req, res) {
    req.isOnlyExposure = true;
    return BetController.getExposures(req, res);
  }

  static getExposureV2(req, res) {
    req.body.isOnlyExposure = true;
    return BetController.getExposuresV2(req, res);
  }

  static getExposuresEventWise(req, res) {
    return betService.getExposuresEventWise(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, result.data))
      .catch(error => ResError(res, error));
  }

  static getMasterBetList(req, res) {
    let type = "unsettle"
      , delete_status = [0, 2];
    if (req.body.hasOwnProperty("type"))
      type = req.body.type;
    delete req.body.type;
    if (!["unsettle", "settled", "void"].includes(type))
      return ResError(res, { msg: "Type must be unsettle, settled, void", statusCode: STATUS_422 });
    if (type == "unsettle")
      Object.assign(req.body, {
        search: {
          ...req.body.search,
          bet_result_id: null
        }
      });
    else if (type == "settled")
      Object.assign(req.body, {
        search: {
          ...req.body.search,
          bet_result_id: {
            '$ne': null
          }
        }
      });
    else if (type == "void")
      delete_status = [2];
    Object.assign(req.body, {
      search: {
        delete_status: {
          '$in': delete_status
        },
        ...req.body.search
      }
    });
    return BetController.bets(req, res);
  }

  static resetDemoUsersData(req, res) {
    return betService.resetDemoUsersData(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, { ...result.data }) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static casinoExposures(req, res) {
    return betService.casinoExposures(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data, statusCode: STATUS_200 }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static qtechExposures(req, res) {
    return betService.qtechExposures(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, error));
  }

  static eventAnalysis(req, res) {
    return betService
      .eventAnalysis(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data }),
      )
      .catch((error) => ResError(res, error));
  }

  static diamondSettledBets(req, res) {
    Object.assign(req.body, {
      search: {
        bet_result_id: {
          '$ne': null
        },
        ...req.body.search
      }
    });
    return BetController.bets(req, res);
  }

  static async diamondSettledBetsDocument(req, res) {
    let data = req.body;
    let { user_id, search } = data;
    if (!user_id)
      user_id = ObjectId(req.User.user_id || req.User._id);
    else
      user_id = ObjectId(user_id);
    if (search) {
      if (search._id)
        search["_id"] = ObjectId(search._id);
      if (search.user_id) {
        search["user_id"] = ObjectId(search.user_id);
        search["user_type_id"] = req.user.user_type_id;
      }
    }
    data.user_id = user_id;
    data.user_type_id = req.User.user_type_id;
    data.path = req.path;
    data.search = search;
    const { document_type } = data;

    Object.assign(data, {
      search: {
        bet_result_id: {
          '$ne': null
        },
        ...req.body.search
      }
    });
    const betsRes = await betService.bets(data);
    if (!betsRes?.data[0]?.data) {
      return betsRes;
    }
    const list =
      Array.isArray(betsRes?.data[0]?.data) &&
        betsRes?.data[0]?.data.length
        ? betsRes?.data[0]?.data
        : [];
    const phead = [
      { title: "UserName" },
      { title: "nation" },
      { title: "userrate" },
      { title: "bettype" },
      { title: "amount" },
      { title: "winloss" },
      { title: "IsMatched" },
      { title: "IpAddress" },
      { title: "bhav" },
      { title: "GameType" },
    ];
    let pbody = list
      .map((item, index) => [
        item.user_name,
        item.market_name,
        item.odds,
        item.is_back ? 'back' : "lay",
        item.stack,
        item.chips,
        'TRUE',
        item.ip_address,
        item.is_fancy ? item.size : 0,
        item.game_type
      ]);
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: utils.generateUUID(),
        columnCount: phead.length,
      });
      return csvbRes;
    }
  }

  static betResultDetails(req, res) {
    return betService
      .betResultDetails(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }

  static getBetsEventTypesList(req, res) {
    return betService
      .getBetsEventTypesList(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }

  static getResultProgress(req, res) {
    return betService
      .getResultProgress(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }

  static resetStruckResult(req, res) {
    return betService
      .resetStruckResult(req)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }
}