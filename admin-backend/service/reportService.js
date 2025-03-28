const { ObjectId } = require("bson")
  , _ = require("lodash")
  , moment = require('moment')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, USER_TYPE_USER } = require("../../utils/constants")
  , { resultResponse } = require('../../utils/globalFunction')
  , UserProfitLoss = require("../../models/userProfitLoss")
  , User = require("../../models/user")
  , Sports = require("../../models/sports")
  , Settlements = require("../../models/settlements")
  , reportQuery = require('./reportQuery')
  , userService = require('./userService')
  , userReportQuery = require('../../users-backend/service/reportQuery')
  , accountStatementQuery = require('./accountStatementQuery');
const logger = require("../../utils/loggers");
const { getTimeTaken, generateReferCode, fixFloatingPoint, VALIDATION_ERROR } = require("../../utils");
const { ptsReport } = require('./reportService/diamondProfilePageReport');
const { turnover, turnoverDocument } = require('./reportService/diamondTurnOver');
const { partywinLossReport, partywinLossReportDocument } = require('./reportService/diamondPartyWinLossReport');
const PdfDocService = require('./document/pdf/index');
const CsvDocService = require("./document/csv");

let ownDataInSettlementReport = async (user_id, parents_id, user_type_id) => {
  try {
    let query = reportQuery.own_parent_acc_query(user_id, parents_id, user_type_id);

    let resFromDB = [];
    if (Array.isArray(query)) {
      resFromDB = await UserProfitLoss.aggregate(query, { allowDiskUse: true });
    } else {
      const { own_query, parent_query } = query;
      const [own, parent] = await Promise.all([
        UserProfitLoss.aggregate(own_query, { allowDiskUse: true }),
        UserProfitLoss.aggregate(parent_query, { allowDiskUse: true })
      ]);
      let combined = {
        own_pl: 0.00,
        own_commission: 0.00,
        parent_pl: 0.00,
        parent_ac: 0.00
      };
      if (own.length) {
        combined = { ...combined, ...own[0] }
      }
      if (parent.length) {
        combined = { ...combined, ...parent[0] }
      }
      resFromDB.push(combined)
    }

    if (resFromDB.length)
      if (!Object.keys(resFromDB[0]).length)
        resFromDB[0] = {
          own_pl: 0.00,
          own_commission: 0.00,
          parent_pl: 0.00,
          parent_ac: 0.00
        };
    if (!resFromDB.length)
      return resultResponse(NOT_FOUND, "User profit loss not generated yet!");

    // SA => own_pl
    // AG => parent_ac
    // USR => Not needed.
    let updateSettlementValues = {};
    if (user_type_id == USER_TYPE_SUPER_ADMIN) {
      // For SA settlement_profit_loss update
      updateSettlementValues = {
        settlement_pl: fixFloatingPoint(resFromDB[0].own_pl - resFromDB[0].own_commission),
        settlement_comm: fixFloatingPoint(resFromDB[0].own_commission),
        settlement_pl_comm: fixFloatingPoint(resFromDB[0].own_pl),
        profit_loss: fixFloatingPoint(resFromDB[0].own_pl),
        is_settlement_amount_calculated: true
      };
    } else {
      updateSettlementValues = {
        settlement_pl: fixFloatingPoint(resFromDB[0].parent_ac - resFromDB[0].parent_commission),
        settlement_comm: fixFloatingPoint(resFromDB[0].parent_commission),
        settlement_pl_comm: fixFloatingPoint(resFromDB[0].parent_ac),
        profit_loss: fixFloatingPoint(resFromDB[0].own_pl),
        is_settlement_amount_calculated: true
      };
    }

    await User.updateOne(
      { _id: ObjectId(user_id) },
      [{ '$set': updateSettlementValues }]
    );

    let resFromDB1 = await User.aggregate(reportQuery.own_total_settled_query(user_id), { allowDiskUse: true });

    let globalSettingServiceCommission = 0;
    let parent_ac = parseFloat(resFromDB[0].parent_ac) + parseFloat(resFromDB1[0].own_total_settled_amount);
    let plusData = [];
    let minusData = [];
    let totalPlus = 0;
    let totalMinus = 0;

    if (user_type_id == 1) {
      if (parent_ac >= 0) {
        plusData.push({ description: `Super Admin Account`, amount: parent_ac.toFixed(2) });
        totalPlus = totalPlus + parent_ac;
      } else {
        minusData.push({ description: `Super Admin Account`, amount: Math.abs(parent_ac).toFixed(2) });
        totalMinus = totalMinus + parent_ac;
      }
    } else {
      if (globalSettingServiceCommission) {
        if (resFromDB[0].parent_commission >= 0)
          plusData.push({ description: `${resFromDB1[0].parent_name}(${resFromDB1[0].parent_user_name}) Commission`, amount: resFromDB[0].parent_commission.toFixed(2) });
        else
          minusData.push({ description: `${resFromDB1[0].parent_name}(${resFromDB1[0].parent_user_name}) Commission`, amount: Math.abs(resFromDB[0].parent_commission).toFixed(2) });
      }

      if (parent_ac >= 0) {
        plusData.push({ description: `${resFromDB1[0].parent_name}(${resFromDB1[0].parent_user_name}) Account`, amount: parent_ac.toFixed(2) });
        totalPlus = totalPlus + parent_ac;
      } else {
        minusData.push({ description: `${resFromDB1[0].parent_name}(${resFromDB1[0].parent_user_name}) Account`, amount: Math.abs(parent_ac).toFixed(2) });
        totalMinus = totalMinus + parent_ac;
      }
    }

    if (globalSettingServiceCommission) {
      if (resFromDB[0].own_commission >= 0)
        plusData.push({ description: "Own Commission", amount: resFromDB[0].own_commission.toFixed(2) });
      else
        minusData.push({ description: "Own Commission", amount: Math.abs(resFromDB[0].own_commission).toFixed(2) });
    }

    if (resFromDB[0].own_pl >= 0) {
      plusData.push({ description: "Own", amount: resFromDB[0].own_pl.toFixed(2) });
      totalPlus = totalPlus + resFromDB[0].own_pl;
    } else {
      minusData.push({ description: "Own", amount: Math.abs(resFromDB[0].own_pl).toFixed(2) });
      totalMinus = totalMinus + resFromDB[0].own_pl;
    }

    if (resFromDB1[0].total_cash > 0) {
      minusData.push({ description: "Cash", amount: resFromDB1[0].total_cash.toFixed(2) });
      totalMinus = totalMinus - resFromDB1[0].total_cash;
    }
    else if (resFromDB1[0].total_cash < 0) {
      plusData.push({ description: "Cash", amount: Math.abs(resFromDB1[0].total_cash).toFixed(2) });
      totalPlus = totalPlus + Math.abs(resFromDB1[0].total_cash);
    }

    let data = {
      plusData: plusData,
      minusData: minusData,
      totalPlus: totalPlus,
      totalMinus: totalMinus
    };

    return resultResponse(SUCCESS, data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

let settlementReport = async (user_id, parents_id, user_type_id, search = '') => {
  try {
    let lastAgentsId = [], AgentsDirectUsers = [];

    usersByParentId = await userService.getUsersDetails({ parent_id: user_id }, ["_id", "user_type_id"]);

    if (usersByParentId.statusCode == SUCCESS) {
      usersByParentId = usersByParentId.data;
      usersByParentId.map(data => {
        if (data.user_type_id == USER_TYPE_USER)
          AgentsDirectUsers.push(data._id);
        else
          lastAgentsId.push(data._id);
      });
    } else return resultResponse(NOT_FOUND, usersByParentId.data);
    if ((user_type_id - 1) == USER_TYPE_USER) {

      try {
        const query = reportQuery.settlementReport(user_id, [], [], AgentsDirectUsers, (user_type_id - 1), search);

        const getStatements = await UserProfitLoss.aggregate(query.agent_direct_users_query, { allowDiskUse: true });

        if (!getStatements.length) {
          return resultResponse(NOT_FOUND, "No settlement generated yet for this agent.");
        }

        try {
          let updateChipPL = getStatements.map(
            ({ user_id, settlement_amount, settlement_amount_comm }) => ({
              'updateOne': {
                'filter': { _id: ObjectId(user_id) },
                'update': [{
                  '$set': {
                    settlement_pl: fixFloatingPoint(settlement_amount - settlement_amount_comm),
                    settlement_comm: fixFloatingPoint(settlement_amount_comm),
                    settlement_pl_comm: fixFloatingPoint(settlement_amount),
                  }
                }]
              }
            })
          );
          await User.bulkWrite(updateChipPL, { ordered: false });
        } catch (error) { }

        const userIds = getStatements.map(data => data.user_id);
        const users = await User.aggregate(reportQuery.settlementReportUsers(userIds, user_type_id, search));

        // Combine statements and users, creating a map for efficient merging
        const settlementMap = {};

        // Process settlement statements
        getStatements.forEach(({ user_id, settlement_amount }) => {
          settlementMap[user_id] = settlementMap[user_id] || { settlement_amount: 0 };
          settlementMap[user_id].settlement_amount += settlement_amount;
        });

        // Process user information
        users.forEach(({ user_id, user_name, name, user_type_id }) => {
          settlementMap[user_id] = {
            ...settlementMap[user_id],
            user_id,
            user_name,
            name,
            user_type_id
          };
        });

        // Convert settlementMap to an array
        const result = Object.values(settlementMap);

        return resultResponse(SUCCESS, result);

      } catch (error) {
        return resultResponse(SERVER_ERROR, error.message);
      }

    }

    try {

      const query = reportQuery.settlementReport(user_id, parents_id, lastAgentsId, AgentsDirectUsers, (user_type_id - 1), search)

      const [agent_statements, algent_dirent_users_statements] = await Promise.all([
        query?.agent_direct_users_query ? UserProfitLoss.aggregate(query?.agent_direct_users_query, { allowDiskUse: true }) : [],
        query?.agents_query ? UserProfitLoss.aggregate(query?.agents_query, { allowDiskUse: true }) : []
      ]);

      let AgentsAndUsers = [];
      if (agent_statements.length)
        AgentsAndUsers = AgentsAndUsers.concat(agent_statements);

      if (algent_dirent_users_statements.length)
        AgentsAndUsers = AgentsAndUsers.concat(algent_dirent_users_statements);

      if (AgentsAndUsers.length) {

        try {
          let updateChipPL = AgentsAndUsers.map(
            ({ user_id, settlement_amount, settlement_amount_comm }) => ({
              'updateOne': {
                'filter': { _id: ObjectId(user_id) },
                'update': [{
                  '$set': {
                    settlement_pl: fixFloatingPoint(settlement_amount - settlement_amount_comm),
                    settlement_comm: fixFloatingPoint(settlement_amount_comm),
                    settlement_pl_comm: fixFloatingPoint(settlement_amount),
                  }
                }]
              }
            })
          );
          await User.bulkWrite(updateChipPL, { ordered: false });
        } catch (error) { }

        const user_ids = AgentsAndUsers.map(data => data.user_id);
        const users = await User.aggregate(reportQuery.settlementReportUsers(user_ids, user_type_id, search));

        const result = Object.values([...AgentsAndUsers, ...users].reduce((acc, { user_id, user_name, name, user_type_id, settlement_amount }) => {
          acc[user_id] = { user_id, user_name, name, user_type_id, settlement_amount: (acc[user_id] ? acc[user_id].settlement_amount : 0) + settlement_amount };
          return acc;
        }, {}));

        return resultResponse(SUCCESS, result);
      } else {
        return resultResponse(NOT_FOUND, "No settlement generated yet for this agent.");
      }

    } catch (error) {
      return resultResponse(SERVER_ERROR, error.message);
    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message)
  }
};

async function eventsProfitLoss(req) {
  try {
    // Destructure and assign default values
    let { user_id, search } = req.joiData;
    const params = { ...req.joiData };

    // Handle user_id and search.user_id conversion to ObjectId
    user_id = ObjectId(user_id || req.User.user_id || req.User._id);
    if (search?.user_id) {
      search.user_id = ObjectId(search.user_id);
    }

    // Update params
    params.user_id = user_id;
    params.search = search;

    // Determine the query or function to call based on is_user flag
    if (req?.body?.is_user) {
      const data = await userEventProfitLoss(params);
      return data; // Return the data directly for is_user case
    } else {
      const data = await agentEventProfitLoss(params);
      return data;
    }

  } catch (error) {
    // Handle any errors that occur
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function agentEventProfitLoss({ user_id, search, from_date, to_date, page = 1, limit = 50 }) {
  const startTime = moment();
  const LOG_REF_CODE = generateReferCode();

  // Log input parameters
  logger.info(`${LOG_REF_CODE} agentEventProfitLoss called`, { user_id, search, from_date, to_date, page, limit });

  // Build the filter object
  const filter = { 'agents_pl_distribution.user_id': user_id };

  if (from_date && to_date) {
    filter.createdAt = {
      '$gte': new Date(from_date),
      '$lte': new Date(to_date)
    };
  }

  // Merge search object into the filter if it's a valid object
  if (search && typeof search === "object") {
    Object.assign(filter, search);
  }

  const matchConditions = { "$match": filter };
  const query = reportQuery.eventsProfitLossQueryV1(matchConditions, user_id);
  const countQuery = reportQuery.eventsProfitLossCountQueryV1(matchConditions, user_id);
  const sumQuery = reportQuery.eventsProfitLossSumQueryV1(matchConditions, user_id);

  // Ensure valid values for limit and page
  limit = Math.max(parseInt(limit, 10) || 50, 1);
  page = Math.max(parseInt(page, 10) || 1, 1);

  const skip = (page - 1) * limit;

  try {
    // Log the query objects
    logger.info(`${LOG_REF_CODE} agentEventProfitLoss query`, { query });
    logger.info(`${LOG_REF_CODE} agentEventProfitLoss countQuery`, { countQuery });
    logger.info(`${LOG_REF_CODE} agentEventProfitLoss sumQuery`, { sumQuery });

    // Concurrent query execution
    const [result, [total], sum] = await Promise.all([
      UserProfitLoss.aggregate(query).skip(skip).limit(limit).allowDiskUse(true),
      UserProfitLoss.aggregate(countQuery).allowDiskUse(true),
      UserProfitLoss.aggregate(sumQuery).allowDiskUse(true),
    ]);

    const executionTime = getTimeTaken({ startTime });
    logger.info(`${LOG_REF_CODE} agentEventProfitLoss Query result`, { recordsFound: result.length, total });

    if (result.length) {
      logger.info(`${LOG_REF_CODE} agentEventProfitLoss Execution Time: ${executionTime}`);
      return resultResponse(SUCCESS, [
        {
          metadata: { ...total, limit, page },
          data: result,
          sum
        }
      ]);
    } else {
      logger.info(`${LOG_REF_CODE} agentEventProfitLoss Execution Time: ${executionTime}`);
      return resultResponse(NOT_FOUND, "Events Profit & Loss not generated yet!");
    }

  } catch (error) {
    logger.error(`${LOG_REF_CODE} Error during query execution`, { error: error.message });
    logger.info(`${LOG_REF_CODE} agentEventProfitLoss Execution Time: ${getTimeTaken({ startTime })}`);
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function userEventProfitLoss({ user_id, search, from_date, to_date, page = 1, limit = 50 }) {

  // Capture start time for performance measurement
  const startTime = moment();

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = generateReferCode();

  // Log function call with input parameters
  logger.info(`${LOG_REF_CODE} userEventProfitLoss called`, { user_id, search, from_date, to_date, page, limit });

  // Build the filter object based on provided parameters
  const filter = { user_id };
  if (from_date && to_date) {
    filter.createdAt = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
  }
  if (search && typeof search === "object") {
    Object.assign(filter, search);
  }

  // Create the query object for aggregation with the filter
  const matchConditions = { "$match": filter };
  const query = userReportQuery.eventsProfitLossQuery(matchConditions);

  // Ensure valid values for limit and page with defaults
  limit = parseInt(limit, 10) || 50;
  page = Math.max(parseInt(page, 10) || 1, 1);

  // Calculate skip for pagination
  const skip = (page - 1) * limit;

  try {

    // Log function call with query & filter is passed
    logger.info(`${LOG_REF_CODE} userEventProfitLoss query`, { query });
    logger.info(`${LOG_REF_CODE} userEventProfitLoss filter`, { filter });

    // Concurrently execute aggregation and count queries
    const [result, total] = await Promise.all([
      UserProfitLoss.aggregate(query).skip(skip).limit(limit),
      UserProfitLoss.countDocuments(filter)
    ]);

    // Log query result details with reference code
    logger.info(`${LOG_REF_CODE} userEventProfitLoss Query result`, { recordsFound: result.length, total });

    if (result.length) {
      // Calculate and log execution time using reference code
      logger.info(`${LOG_REF_CODE} userEventProfitLoss Execution Time: ${getTimeTaken({ startTime })}`);
      // Return successful response with metadata and data
      return resultResponse(SUCCESS, [
        {
          metadata: [{ total, limit, page }],
          data: result,
        },
      ]);
    } else {
      // Calculate and log execution time using reference code
      logger.info(`${LOG_REF_CODE} userEventProfitLoss Execution Time: ${getTimeTaken({ startTime })}`);
      // Return "not found" response
      return resultResponse(NOT_FOUND, "Events Profit & Loss not generated yet!");
    }
  } catch (error) {
    // Log error details with reference code
    logger.error(`${LOG_REF_CODE} Error during query execution`, JSON.stringify(error, ["message", "arguments", "type", "name"]));
    // Calculate and log execution time using reference code
    logger.info(`${LOG_REF_CODE} userEventProfitLoss Execution Time: ${getTimeTaken({ startTime })}`);
    // Return error response
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function settlementCollectionHistory(params, { opening_balance, path }) {
  try {
    let { _id, parent_level_ids, user_type_id } = params
      , user_id = _id
      , parents = parent_level_ids.map(data => ObjectId(data.user_id));
    const isV2 = path.includes('settlementCollectionHistoryV2');

    let runtot = opening_balance;
    if (isV2) {
      const { settlement_pl_comm } = params;
      runtot = fixFloatingPoint(settlement_pl_comm);
    } else {

      let query = accountStatementQuery.userProfitLossSettlementAmountQuery(
        user_id, parents, user_type_id == USER_TYPE_USER);
      const userProfitLoss = await UserProfitLoss.aggregate(query);

      if (userProfitLoss.length)
        runtot = userProfitLoss[0].settlement_amount;
    }

    // const settlements = await Settlements.aggregate(reportQuery.settlements(user_id));
    const settlements = await Settlements.find({ user_id }).sort({ createdAt: 1 }).lean();

    if (!settlements.length)
      return resultResponse(NOT_FOUND, "No settlement history generated yet!");

    const settlementResult = settlements.map((settlement, index) => (
      {
        ...settlement, s_num: index + 1,
        updated_balance: fixFloatingPoint(runtot += settlement.amount),
      }
    ));

    return resultResponse(SUCCESS, settlementResult);

  }
  catch (error) {
    return resultResponse(SERVER_ERROR, error.message)
  }
}

function sportsWiseUsersPL(params) {
  const { user_id, user_type_id, user_name, search, international_casinos } = params;
  let query = {};
  if (user_id)
    query['parent_id'] = user_id;
  if (user_name) {
    query = {};
    query['parent_user_name'] = user_name;
  }
  return userService.getUsersDetails(
    query,
    ["_id", "user_type_id", "parent_level_ids"]
  ).then(async usersByParentId => {
    let lastAgentsId = [], AgentsDirectUsers = [];
    if (usersByParentId.statusCode == SUCCESS) {
      usersByParentId = usersByParentId.data;
      usersByParentId.map(data => {
        if (data.user_type_id == USER_TYPE_USER)
          AgentsDirectUsers.push(data._id);
        else
          lastAgentsId.push(data._id);
      });
      let sports = {};
      if (!international_casinos) {
        let sport = await Sports.find({ is_virtual_sport: false }).select("-_id name casinoProvider").sort("order_by").lean();
        sport.map(data => {
          let name = data.casinoProvider ? data.casinoProvider : data.name; sports[name] = name;
        });
        sports["Session"] = "Session";
      }
      let getUsersSportsPLQuery = reportQuery.getUsersSportsPL(user_id, search, AgentsDirectUsers, params);
      if ((user_type_id - 1) == USER_TYPE_USER) {
        return Promise.all([
          UserProfitLoss.aggregate(getUsersSportsPLQuery, { allowDiskUse: true }),
        ]).then((agentsAndUsers) => {
          let data = agentsAndUsers[0];
          data = groupUsersData(data);
          return resultResponse(SUCCESS, { users: data.users, sports: !international_casinos ? sports : data.sports });
        }).catch(error => resultResponse(SERVER_ERROR, error.message));
      }
      let getAgentsSportsPL = reportQuery.getAgentsSportsPL(user_id, search, lastAgentsId, AgentsDirectUsers, params);
      return Promise.all([
        UserProfitLoss.aggregate(getAgentsSportsPL, { allowDiskUse: true }),
        UserProfitLoss.aggregate(getUsersSportsPLQuery, { allowDiskUse: true }),
      ]).then(agentsAndUsers => {
        let agents = [...agentsAndUsers[0][0].p_l, ...agentsAndUsers[0][0].commission];
        agents = agentsAndUsers[0][0].p_l.map(data => {
          return {
            ...data,
            ..._.find(agentsAndUsers[0][0].commission, { user_name: data.user_name, sport_name: data.sport_name })
          }
        })
        let data = [...agents, ...agentsAndUsers[1]];
        data = groupUsersData(data);
        return resultResponse(SUCCESS, { users: data.users, sports: !international_casinos ? sports : data.sports });
      }).catch(error => resultResponse(SERVER_ERROR, error.message));
    } else return resultResponse(NOT_FOUND, "No agents and its users are found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function groupUsersData(data) {
  let sports = {};
  let users = data.reduce((prev, current) => {
    const found = prev.some(prev => prev.user_name === current.user_name);
    if (!found) {
      let tempObject = {
        user_id: current.user_id,
        user_type_id: current.user_type_id,
        user_name: current.user_name,
        total: current.user_pl,
        commission: current.commission,
        share_commission: current.share_commission,
        share: current.share,
      };
      let sport = current.sport_name;
      sports[sport] = sport;
      sport = sport.toLowerCase().replace(/ /g, "_");
      tempObject[sport] = current.user_pl;
      tempObject[sport + "_commission"] = current.commission;
      tempObject[sport + "_share_commission"] = current.share_commission;
      tempObject[sport + "_share"] = current.share;
      prev.push(tempObject);
    }
    if (found) {
      var foundIndex = prev.findIndex(x => x.user_name == current.user_name);
      let tempObject = {}
        , sport = current.sport_name;
      sports[sport] = sport;
      sport = sport.toLowerCase().replace(/ /g, "_");
      tempObject[sport] = current.user_pl;
      tempObject[sport + "_commission"] = current.commission;
      tempObject[sport + "_share_commission"] = current.share_commission;
      tempObject[sport + "_share"] = current.share;
      prev[foundIndex].total = prev[foundIndex].total + current.user_pl;
      prev[foundIndex].commission = prev[foundIndex].commission + current.commission;
      prev[foundIndex].share_commission = prev[foundIndex].share_commission + current.share_commission;
      prev[foundIndex].share_commission = (Math.round(prev[foundIndex].share_commission * 100 + Number.EPSILON) / 100)
      prev[foundIndex] = { ...prev[foundIndex], ...tempObject };
    }
    return prev;
  }, []);
  return { sports, users };
}

function downlineP_L(params) {
  const { user_id, user_type_id, search } = params;
  let query = {};
  if (user_id)
    query['parent_id'] = user_id;
  return userService.getUsersDetails(
    query,
    ["_id", "user_type_id", "parent_level_ids"]
  ).then(usersByParentId => {
    let lastAgentsId = [], AgentsDirectUsers = [];
    if (usersByParentId.statusCode == SUCCESS) {
      usersByParentId = usersByParentId.data;
      usersByParentId.map(data => {
        if (data.user_type_id == USER_TYPE_USER)
          AgentsDirectUsers.push(data._id);
        else
          lastAgentsId.push(data._id);
      });
      let downlinePLUsers = reportQuery.downlinePLUsers(user_id, search, AgentsDirectUsers, params);
      if ((user_type_id - 1) == USER_TYPE_USER) {
        return Promise.all([
          UserProfitLoss.aggregate(downlinePLUsers, { allowDiskUse: true }),
        ]).then(data => resultResponse(SUCCESS, data[0]))
          .catch(error => resultResponse(SERVER_ERROR, error.message));
      }
      let downlinePLAgents = reportQuery.downlinePLAgents(search, lastAgentsId, AgentsDirectUsers, params);
      return Promise.all([
        UserProfitLoss.aggregate(downlinePLAgents, { allowDiskUse: true }),
        UserProfitLoss.aggregate(downlinePLUsers, { allowDiskUse: true }),
      ]).then(data => resultResponse(SUCCESS, [...data[0], ...data[1]]))
        .catch(error => resultResponse(SERVER_ERROR, error.message));
    } else return resultResponse(NOT_FOUND, "No agents and its users are found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function P_L(params) {
  let query = reportQuery.sportsP_L(params);
  if (params.path == "/matchWiseP_L")
    query = reportQuery.matchWiseP_L(params);
  if (params.path == "/usersPLByMarket")
    query = reportQuery.usersPLByMarket(params);
  if (params.path == "/eventsStackAndCommission")
    query = reportQuery.eventsStackAndCommission(params);
  return UserProfitLoss.aggregate(query)
    .then(userProfitLoss => {
      if (userProfitLoss.length)
        return resultResponse(SUCCESS, userProfitLoss);
      else
        return resultResponse(NOT_FOUND, "No profit loss generated yet!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

// To Do: Remove this method when P_L function is stable.
function sportsP_L(params) {
  return UserProfitLoss.aggregate(reportQuery.sportsP_L(params))
    .then(userProfitLoss => {
      if (userProfitLoss.length)
        return resultResponse(SUCCESS, userProfitLoss);
      else
        return resultResponse(NOT_FOUND, "No sports profit loss generated yet!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

// To Do: Remove this method when P_L function is stable.
function matchWiseP_L(params) {
  return UserProfitLoss.aggregate(reportQuery.matchWiseP_L(params))
    .then(userProfitLoss => {
      if (userProfitLoss.length)
        return resultResponse(SUCCESS, userProfitLoss);
      else
        return resultResponse(NOT_FOUND, "No match wise profit loss generated yet!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function sportsPL(req) {

  return UserProfitLoss.aggregate(reportQuery.sportsPL(req)).then(result => {

    if (result.length) {
      return resultResponse(SUCCESS, result);
    } else {
      return resultResponse(NOT_FOUND, "No profit loss generated yet!");
    }

  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function sportsWiseOnlyPL(req) {
  return UserProfitLoss.aggregate(reportQuery.sportsWiseOnlyPL(req)).then(result => {

    if (result.length) {
      return resultResponse(SUCCESS, result);
    } else {
      return resultResponse(NOT_FOUND, "No profit loss generated yet!");
    }

  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function settlementReportV2(req) {
  try {

    /**
     * Fetch These for Top Level Data
     * 1. User Own Amount (profit_loss), 
     * 2. Settled Amount (total_settled_amount), 
     * 3. Parent Amount (settlement_pl_comm);
     * 
     * Fetch User Direct Children Settlement Information
     * 1. Settled Amount (settlement_pl_comm), 
     * 2. User id, User Name, Name, User Type Id,
     */

    let { user_id, user_type_id, search } = req.joiData;

    if (user_id) {
      user_id = ObjectId(user_id);
    } else {
      user_id = req.User._id;
    }

    // Fetch User's Data
    const select_list = [
      'user_name', 'name', 'user_type_id', 'total_settled_amount', 'profit_loss',
      'settlement_pl', 'settlement_comm', 'settlement_pl_comm',
    ];
    const [userSelfData, childrenData] = await Promise.all([
      User.findOne({ _id: user_id },
        [...select_list, "parent_id", "parent_user_name",]
      ).lean(),
      User.find({ parent_id: user_id }, [...select_list]).lean()
    ]);

    if (!userSelfData) {
      return resultResponse(VALIDATION_ERROR, "User not found!");
    }


    const descriptionRes = getSettlementDescription({
      userSelfData, childrenData,
    })

    if (descriptionRes.statusCode != SUCCESS) {
      return resultResponse(SERVER_ERROR, descriptionRes.data)
    }

    const childrenSettlemtRes = getChildrenSettlement({ childrenData, })

    if (childrenSettlemtRes.statusCode != SUCCESS) {
      return resultResponse(SERVER_ERROR, childrenSettlemtRes.data)
    }


    const { plusData, minusData } = descriptionRes.data;

    const { data_paid_to_list, data_receiving_from_list, } = childrenSettlemtRes.data;
    let { total_plus_amount, total_minus_amount, } = childrenSettlemtRes.data;

    plusData.map(i => { total_plus_amount += i.amount; });
    minusData.map(i => { total_minus_amount += i.amount; });

    const responseObj = {
      "user_id": userSelfData._id,
      "user": `${userSelfData.user_name} (${userSelfData.name})`,
      "user_type_id": userSelfData.user_type_id,
      "parent_id": userSelfData.parent_id,
      "parent_user_name": userSelfData.parent_user_name || 'Own',
      "parent_user_type_id": "",
      plusData,
      minusData,
      data_paid_to: {
        list: data_paid_to_list,
        total: data_paid_to_list.length,
      },
      data_receiving_from: {
        list: data_receiving_from_list,
        total: data_receiving_from_list.length,
      },
      totalPlus: fixFloatingPoint(total_plus_amount),
      totalMinus: fixFloatingPoint(total_minus_amount),
    }

    return resultResponse(SUCCESS, responseObj)

  } catch (error) {
    console.log(error)
    return resultResponse(SERVER_ERROR, error)
  }
}
function getChildrenSettlement(data) {
  try {
    const data_paid_to_list = [];
    const data_receiving_from_list = [];
    let total_plus_amount = 0, total_minus_amount = 0;

    const { childrenData } = data;

    for (const childData of childrenData) {
      if ((childData.settlement_pl_comm == undefined || childData.settlement_pl_comm == null)
        && !childData.total_settled_amount) {
        continue;
      }

      const settlement_amount = fixFloatingPoint((childData.settlement_pl_comm || 0) + childData.total_settled_amount);

      const obj = {
        user_id: childData._id,
        user_name: childData.user_name,
        name: childData.name,
        user_type_id: childData.user_type_id,
        settlement_amount: Math.abs(settlement_amount),
      }

      if (settlement_amount <= 0) {
        data_paid_to_list.push(obj);
        total_plus_amount += obj.settlement_amount;
      } else {
        data_receiving_from_list.push(obj);
        total_minus_amount += obj.settlement_amount;
      }
    }

    return resultResponse(SUCCESS, {
      data_paid_to_list,
      data_receiving_from_list,
      total_plus_amount,
      total_minus_amount,
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error);
  }
}
function getSettlementDescription(data) {
  const plusData = [];
  const minusData = [];

  try {
    const { userSelfData, childrenData } = data;

    const children_total_settled_amount = childrenData.reduce((acc, child) => acc + child.total_settled_amount, 0);
    const total_cash = userSelfData.total_settled_amount - children_total_settled_amount;

    const temp_parent_user_name = userSelfData.parent_user_name || 'Super';
    const isSuperAdmin = userSelfData.user_type_id === USER_TYPE_SUPER_ADMIN;

    let parent_amount = userSelfData.settlement_pl_comm + userSelfData.total_settled_amount;
    if (isSuperAdmin) { parent_amount = 0; }

    const parent_amount_obj = {
      "description": `${temp_parent_user_name} (${temp_parent_user_name}) Account`,
      "amount": fixFloatingPoint(Math.abs(parent_amount))
    }
    const own_amount_obj = {
      "description": `Own`,
      "amount": fixFloatingPoint(Math.abs(userSelfData.profit_loss))
    }
    const cash_amount_obj = {
      "description": `Cash`,
      "amount": fixFloatingPoint(Math.abs(total_cash))
    }

    if (parent_amount >= 0) {
      plusData.push(parent_amount_obj)
    } else {
      minusData.push(parent_amount_obj)
    }

    if (userSelfData.profit_loss >= 0) {
      plusData.push(own_amount_obj)
    } else {
      minusData.push(own_amount_obj)
    }

    if (total_cash > 0) {
      minusData.push(cash_amount_obj)
    } else {
      plusData.push(cash_amount_obj)
    }

    return resultResponse(SUCCESS, { minusData, plusData });

  } catch (error) {
    return resultResponse(SERVER_ERROR, error);
  }
}
async function userAuthList(req) {
  try {
    // Destructure request for commonly used properties
    let { search, page, limit } = req.joiData; // Default values for page and limit
    const skip = (page - 1) * limit; // Calculate the number of items to skip

    // Create a search filter
    const filter = { parent_id: ObjectId(req.User._id) };
    if (search) {
      filter["$or"] = [
        { user_name: { $regex: search, $options: "i" } },
        { is_telegram_enable: 0, is_secure_auth_enabled: 0 },
      ];
    }
    const [result, total] = await Promise.all([
      User.aggregate([
        { $match: filter },
        {
          $project: {
            user_name: 1,
            _id: 0, // _id include nahi karna ho to
            desc: {
              $switch: {
                branches: [
                  { case: { $eq: ["$is_telegram_enable", 1] }, then: "telegram enabled" },
                  { case: { $eq: ["$is_secure_auth_enabled", 1] }, then: "two way authentication" }
                ],
                default: "no authentication"
              }
            }
          }
        },
        { $skip: skip || 0 },
        { $limit: limit || 10 } // Default limit set kiya hai
      ]),
      User.countDocuments(filter) // Direct countDocuments use kiya hai
    ]);
    // Check if there are no results.
    if (!result.length) {
      return resultResponse(
        NOT_FOUND,
        "Users list is empty, No users found!"
      );
    }

    // Construct successful response with user data and pagination metadata
    return resultResponse(SUCCESS, {
      metadata: {
        total, // Total users matching the filter
        limit, // Items per page
        page, // Current page number
        pages: Math.ceil(total / limit), // Calculate total pages based on total and limit
      },
      data: result, // Extract usernames from result
    });
  } catch (error) {
    console.log(error)
    // Handle any errors during the request and return a server error response
    return resultResponse(SERVER_ERROR, error.message);
  }
}
async function userAuthListDocument(req, res) {
  try {
    const { document_type } = req.body;
    const userAuthListRes = await userAuthList(req);
    if (userAuthListRes.statusCode != SUCCESS) {
      return userAuthListRes;
    }

    const list =
      Array.isArray(userAuthListRes?.data?.data) &&
        userAuthListRes.data.data.length
        ? userAuthListRes.data.data
        : [];
    const phead = [
      { title: "Username", widh: 62 },
      { title: "Authentication", width: 155 },
    ];
    const ptextProperties = { title: "Casino Result Report", x: 161, y: 9 };
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
        item.user_name,
        item.desc
      ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "l",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "casinoresults",
      });

      return pdfRes;
    }
    if (document_type == "CSV") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const csvbRes = await CsvDocService.createPaginatedCsv(res, {
        data,
        fileName: "casinoresults",
        columnCount: columnCount,
      });
      return csvbRes;
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

module.exports = {
  ownDataInSettlementReport,
  settlementReport,
  eventsProfitLoss,
  settlementCollectionHistory,
  sportsWiseUsersPL,
  downlineP_L,
  sportsP_L,
  matchWiseP_L,
  P_L,
  sportsPL,
  sportsWiseOnlyPL,
  settlementReportV2,
  ptsReport,
  userAuthList,
  turnover,
  partywinLossReport,
  partywinLossReportDocument,
  userAuthListDocument,
  turnoverDocument
};
