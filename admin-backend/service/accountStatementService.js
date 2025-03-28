const getCurrentLine = require('get-current-line')
  , { ObjectId } = require("bson")
  , mongoose = require('mongoose')
  , AccountStatement = require('../../models/accountStatement')
  , AccountWalletStatement = require('../../models/accountwalletSatement')
  , User = require('../../models/user')
  , Settlements = require('../../models/settlements')
  , UserProfitLoss = require('../../models/userProfitLoss')
  , settlementQuery = require('./settlementQuery')
  , accountStatementQuery = require('./accountStatementQuery')
  , oAuthToken = require('../../models/oAuthToken')
  , BetsOdds = require("../../models/betsOdds")
  , logger = require('../../utils/loggers')
  , { generateReferCode, VALIDATION_ERROR, exponentialToFixed, fixFloatingPoint } = require('../../utils')
  , { resultResponse } = require('../../utils/globalFunction')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_USER, USER_TYPE_SUPER_ADMIN, FIRST_DEPOSIT, EVERY_DEPOSIT, LABEL_DIAMOND, CREDIT_ONE, DEBIT_TWO, DATA_NULL, } = require("../../utils/constants");

const moment = require("moment");
const WebsiteService = require('./websiteService');
const creditReferenceLog = require('../../models/creditReferenceLog');
const { sendMessageAlertToTelegram } = require('./messages/telegramAlertService');
const PdfDocService = require('./document/pdf/index');
const XlsxDocService = require("./document/xlsx/index");
const CsvDocService = require("./document/csv");

async function getAccountStatement(data) {

  const { user_id, sport_id, statement_type, sub_statement_type, from_date, to_date, search, sort } = data;

  let statement_type_condition = [];

  switch (statement_type) {
    case 1:
      statement_type_condition = [1];
      break;
    case 2:
      statement_type_condition = [2, 4];
      break;
    case 3:
      statement_type_condition = [3, 5];
      break;
    case 4:
      statement_type_condition = [6];
      break;
    // Diamond Concept
    // Balance Report
    case 5:
      statement_type_condition = [1, 6];
      break;
    // Game Report
    case 6:
      statement_type_condition = [2, 3, 4, 5];
      break;
    // Bonus
    case 7:
      statement_type_condition = [7];
      break;
    default:
      break;
  }

  let filter = { user_id };

  if (from_date && to_date) {
    filter["generated_at"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
  }

  if (statement_type) {
    filter['statement_type'] = { '$in': statement_type_condition };
  }

  if (sub_statement_type) {

    let sub_statement_type_condition;

    switch (sub_statement_type) {
      case 1:
        sub_statement_type_condition = ["CW-to", "CD-to"];
        break;
      case 2:
        sub_statement_type_condition = ["CD-from", "CW-from"];
        break;
      case 3:
        sub_statement_type_condition = ["SW-to", "SD-to"];
        break;
      case 4:
        sub_statement_type_condition = ["SD-from", "SW-from"];
        break;
    }

    filter['sub_statement_type'] = { '$in': sub_statement_type_condition };

  }

  if (sport_id) {
    filter['sport_id'] = sport_id;
  }

  if (search) {
    if (search.constructor.name === "Object") {
      Object.assign(filter, search);
    }
  }

  let matchConditions = { "$match": filter };

  let query = accountStatementQuery.getStatements(matchConditions, sort);

  let { page, limit } = data;

  let Model = AccountStatement
    .aggregate(query);

  if (limit) {
    limit = parseInt(limit || 50, 10);

    page = parseInt(page || 0, 10);

    let skip = (page - 1) * limit;

    Model
      .skip(skip)
      .limit(limit);
  }

  return Model
    .then(getStatements => {

      if (getStatements.length) {

        return AccountStatement
          .find(filter)
          .countDocuments()
          .then(total => {

            return resultResponse(SUCCESS, [
              {
                metadata: [{
                  total,
                  limit,
                  page
                }],
                data: getStatements,
              }
            ]);

          }).catch(error => resultResponse(SERVER_ERROR, error.message));

      } else
        return resultResponse(NOT_FOUND, "Account statement not generated yet!");

    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function getAccountStatementDocument(
  req, res, data
) {

  try {
    const { document_type } = data;
    const statementRes = await getAccountStatement(data);
    if (statementRes.statusCode != SUCCESS) {
      return statementRes;
    }

    const list = statementRes?.data?.length ? statementRes?.data[0]?.data : [];
    const phead = [
      { "title": "Date" },
      { "title": "Sr No" },
      { "title": "Credit" },
      { "title": "Debit" },
      { "title": "Amount" },
      { "title": "Remark" },
      { "title": "Fromto" }
    ];
    const ptextProperties = { title: "Account Statements", x: 103, y: 9 };
    let columnCount = phead.length;
    const cellWidth = "auto",
      pbodyStyles = Object.fromEntries(
        phead.map((col, index) => [
          index,
          { cellWidth: col.width !== undefined ? col.width : cellWidth }
        ])
      );
    const pbody = list.map((item, index) => [
      moment(item.date).format('DD/MM/YYYY HH:mm:ss'), // Formatted date
      index + 1, // Sequential count starting from 1
      item.credit_debit > 0 ? item.credit_debit : 0, // Show credit
      item.credit_debit < 0 ? Math.abs(item.credit_debit) : 0, // Show debit
      item.balance, // Current balance
      [2, 3, 4, 5].includes(item.statement_type) ? item.description : item.remark, // Conditional description
      [2, 3, 4, 5].includes(item.statement_type) ? item.remark : item.description, // Conditional remark
    ]);
    if (document_type == "PDF") {
      const pdfRes = await PdfDocService.createPaginatedPdf(res, {
        orientation: "l",
        ptextProperties,
        phead,
        pbody,
        pbodyStyles,
        fileName: "account_statements"
      });

      return pdfRes;
    }
    if (document_type == "EXCEL") {
      let data = await CsvDocService.formatExcelData(phead, pbody);
      const xlsxRes = await XlsxDocService.createPaginatedlsx(res, {
        data,
        fileName: "Account Statements",
        columnCount: columnCount,
      });
      return xlsxRes;
    }

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function makeSettlement(data, user, loginUser) {
  try {
    let { type, comment, path } = data;
    if (type == 1 && comment == '')
      comment = 'Cash Debit';
    else if (type == 2 && comment == '')
      comment = 'Cash Credit';
    // data.type = type;
    // data.comment = comment;
    Object.assign(data, JSON.parse(JSON.stringify(user)));
    let { user_id, parent_id, amount, user_type_id, parent_level_ids } = data
      , parents = parent_level_ids.map(data => ObjectId(data.user_id));
    data.parents = parents;
    user_id = ObjectId(user_id);
    parent_id = ObjectId(parent_id);

    const isV2 = path.includes('makeSettlementV2')
      || path.includes("makeSettlementDiamond")
      || path.includes("makeSettlementDiamondMulti");

    const query = isV2
      ? accountStatementQuery.makeSettlementV2(data)
      : accountStatementQuery.makeSettlement(data);

    const resFromDB = await User.aggregate(query);

    if (resFromDB.length) {
      let userProfitLossSettlementAmount = 0;
      if (!isV2 && user_type_id == USER_TYPE_USER) {
        const settlementAmountQuery = accountStatementQuery.userProfitLossSettlementAmountQuery(
          user_id, parents, user_type_id == USER_TYPE_USER);

        let resUPLFromDB = await UserProfitLoss.aggregate(settlementAmountQuery);
        if (resUPLFromDB.length)
          userProfitLossSettlementAmount = resUPLFromDB[0].settlement_amount;
      }
      let settlement_amount = resFromDB[0].settlement_amount + userProfitLossSettlementAmount;
      if (settlement_amount != 0) {
        if (amount > 0 && amount <= Math.abs(settlement_amount)) {
          //when settlement_amount > 0 then debit and when amount < 0 then credit
          if (settlement_amount > 0 && type == 1)
            return resultResponse(NOT_FOUND, 'Please debit the amount for settlement!');
          else if (settlement_amount < 0 && type == 2)
            return resultResponse(NOT_FOUND, 'Please credit amount for settlement!');
          if (type == 2)
            amount = -amount;
          let login_id = ObjectId(loginUser.user_id || loginUser._id);
          if (type == 1 && resFromDB[0].user_balance <= 0)
            return resultResponse(NOT_FOUND, (login_id == parent_id ? "You" : resFromDB[0].user) + ' have insufficient balance!');
          if (type == 1 && amount > resFromDB[0].user_balance)
            return resultResponse(NOT_FOUND, (login_id == parent_id ? "You" : resFromDB[0].user) + ' balance is lower then the settlement amount! available balance is ' + resFromDB[0].user_balance);
          if (type == 2 && resFromDB[0].parent_balance <= 0)
            return resultResponse(NOT_FOUND, (login_id == parent_id ? "You" : resFromDB[0].parent) + ' have insufficient balance!');
          if (type == 2 && -amount > resFromDB[0].parent_balance)
            return resultResponse(NOT_FOUND, (login_id == parent_id ? "You" : resFromDB[0].parent) + ' balance is lower then settlement amount! available balance is ' + resFromDB[0].parent_balance);
          else {
            const session = await mongoose.startSession();
            try {
              await session.withTransaction(async (session) => {

                const LOG_REF_CODE = generateReferCode();

                const preUserDetails = await User.find({ $or: [{ _id: parent_id }, { _id: user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

                logger.BalExp(`
                  --PRE LOG--
                  FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
                  FUNCTION: makeSettlement
                  EVENT_DETAILS: ${(type == 1) ? "withdraw" : "deposited"}
                  LOG_REF_CODE: ${LOG_REF_CODE}
                  DETAILS: parent[${preUserDetails[0]?.user_name}(${preUserDetails[0]?._id})] old_balance: ${preUserDetails[0]?.balance} - old_liability: ${preUserDetails[0]?.liability} - cal_amount: ${amount}
                  DETAILS: child[${preUserDetails[1]?.user_name}(${preUserDetails[1]?._id})] old_balance: ${preUserDetails[1]?.balance} - old_liability: ${preUserDetails[1]?.liability} - cal_amount: ${amount}
                `);

                let withdraw_deposited = "", transaction;
                let login_user_name = `${loginUser.name}(${loginUser.user_name})`;
                let settlement_collections_id = await Settlements.create([{ user_id, parent_id, action_by: loginUser._id, amount, type, comment }], { session });
                settlement_collections_id = settlement_collections_id[0]._id;
                if (user_type_id == USER_TYPE_USER) {
                  if (type == 1)  // parent credit child debit
                    withdraw_deposited = (`Cash withdraw from [${resFromDB[0].user}] by [${resFromDB[0].parent}].`);
                  else  // parent debit child credit
                    withdraw_deposited = (`Cash deposited to [${resFromDB[0].user}] from [${resFromDB[0].parent}].`);
                  transaction = await User.bulkWrite(
                    settlementQuery.settlementUsersCrDr(parent_id, user_id, amount), { session }
                  );
                  for (const userId of [...parents, user_id]) {
                    let transactionText = "", userText = "";
                    if (login_id != userId)
                      userText = ` Transaction by [${login_user_name}].`;
                    transactionText = withdraw_deposited + "" + userText + "\n" + `${comment != '' ? ` Comment: ${comment}` : ''}`;
                    let accountRemainingDetails = await User.aggregate(
                      settlementQuery.settlementUsersAgentsAccStat(
                        userId, settlement_collections_id, transactionText, (userId == parent_id ? amount : userId == user_id ? -amount : amount)
                      ),
                      { session }
                    );
                    await AccountStatement.create(
                      [accountRemainingDetails[0]],
                      { session }
                    );
                  }
                } else {
                  if (type == 1)  // parent credit child whose as a parent debit
                    withdraw_deposited = (`Cash withdraw from [${resFromDB[0].user}] by [${resFromDB[0].parent}].`);
                  else  // parent debit child whose as a parent credit
                    withdraw_deposited = (`Cash deposited to [${resFromDB[0].user}] from [${resFromDB[0].parent}].`);
                  transaction = await User.bulkWrite(
                    settlementQuery.settlementAgentsCrDr(parent_id, user_id, amount), { session }
                  );
                  for (const userId of [...parents, user_id]) {
                    let transactionText = "", userText = "";
                    if (login_id != userId)
                      userText = ` Transaction by [${login_user_name}].`;
                    transactionText = withdraw_deposited + "" + userText + "" + `${comment != '' ? `\n Comment: ${comment}` : ''}`;
                    let accountRemainingDetails = await User.aggregate(
                      settlementQuery.settlementUsersAgentsAccStat(
                        userId, settlement_collections_id, transactionText, (userId == parent_id ? amount : userId == user_id ? -amount : amount)
                      ),
                      { session }
                    );
                    await AccountStatement.create(
                      [accountRemainingDetails[0]],
                      { session }
                    );
                  }
                }

                const postUserDetails = await User.find({ $or: [{ _id: parent_id }, { _id: user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

                logger.BalExp(`
                  --POST LOG--
                  FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
                  FUNCTION: makeSettlement
                  EVENT_DETAILS: ${(type == 1) ? "withdraw" : "deposited"}
                  LOG_REF_CODE: ${LOG_REF_CODE}
                  DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability}
                  DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability}
                `);

              });
              return resultResponse(SUCCESS, 'Settlement done...');
            } catch (error) {
              return resultResponse(SERVER_ERROR, `Error while doing satteling` + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : ""));
            } finally {
              session.endSession();
            }
          }
        } else {
          return resultResponse(NOT_FOUND, 'Maximum amount ' + Math.abs(settlement_amount) + ' allowed!');
        }
      } else {
        return resultResponse(NOT_FOUND, 'Already Settled!');
      }
    } else {
      return resultResponse(NOT_FOUND, "Agent(s) or User(s) not found...");
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function makeSettlementDiamond(req) {

  /**
   * CR, BR, 
   * Deposit
   *  amount >= my_balance && 0 > User_BR - USER_CR 
   */
  try {
    const childUser = req?.user;
    const selfUser = req?.User;
    const body = req.joiData;

    // Check If Child User Exists
    if (!childUser) {
      return resultResponse(VALIDATION_ERROR, "No User Found With this User Id");
    }

    // Check If Child User & Self User are Same
    if (childUser._id == selfUser._id) {
      return resultResponse(VALIDATION_ERROR, "You can't Debit/Credit self Balance !!");
    }

    // Return if body user_id user has parent Id not equal to login users id.
    if (childUser.parent_id != selfUser._id) {
      return resultResponse(VALIDATION_ERROR, "You can only Debit/Credit from Direct Downline Accounts");
    }

    // Check If Child User Belongs to DIAMOND
    if (childUser.belongs_to != LABEL_DIAMOND) {
      return resultResponse(VALIDATION_ERROR, "User does not Belongs to DIAMOND");
    }

    // Fetch Parent User's Data
    const parentUser = await User.findOne({ _id: childUser.parent_id }, [
      "_id", "user_name", "name", "user_type_id", "parent_id", "profit_loss",
      "parent_user_name", "domain_name", "parent_level_ids",
      "point", "balance", "credit_reference", "children_credit_reference",
      "balance_reference"
    ]).lean().exec();

    const isDeposit = body.type == 2;
    const clientPL = childUser.balance_reference - childUser.credit_reference;

    if (body.amount > Math.abs(clientPL)) {
      return resultResponse(VALIDATION_ERROR, "Amount Greater than PL !!");
    }

    if (isDeposit) {
      // Deposit
      if (clientPL > 0) {
        return resultResponse(VALIDATION_ERROR, "Can't Deposit, Try Withdrawing !!");
      }
      if (body.amount > parentUser.balance) {
        return resultResponse(VALIDATION_ERROR, parentUser.user_name + " does not have enough balance");
      }

    } else {
      if (clientPL < 0) {
        return resultResponse(VALIDATION_ERROR, "Can't Withdraw, Try Depositing !!");
      }
      if (body.amount > childUser.balance) {
        return resultResponse(VALIDATION_ERROR, childUser.user_name + " does not have enough balance");
      }
    }

    // Validations Done Time for actual steps to perform.
    const transaction_result = await parentChildUpdateTransactional({
      childUser, parentUser, body, isDeposit, isPLSettlement: true,
      statement_type: 6,
    });

    if (transaction_result.statusCode != SUCCESS) {
      return resultResponse(SERVER_ERROR, transaction_result.data);
    }

    return resultResponse(SUCCESS,
      transaction_result.data,
    );

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}
async function makeSettlementDiamondMulti(req) {
  try {
    if (req.user.user_type_id == USER_TYPE_SUPER_ADMIN) {
      return resultResponse(SERVER_ERROR, { msg: "You are not allowed!" });
    }

    const dataArr = req.joiData.data;
    const userIds = dataArr.map(i => ObjectId(i.user_id));
    const users = await User.find({
      _id: { $in: userIds },
      "parent_level_ids.user_id": req.User._id
    }, [
      "bonus",
      "total_deposit_count",
      "belongs_to_b2c",
      "belongs_to",
      "credit_reference",
      "belongs_to_credit_reference",
      "parent_id",
      "parent_user_name",
      "name",
      "user_name",
      "balance",
      "domain_name",
      "user_type_id",
      "parent_level_ids",
      "point",
      "children_credit_reference",
      "profit_loss",
      "liability",
      "balance_reference",
    ])
      .lean();

    const usersObj = {};

    users.map(i => {
      usersObj[i._id] = i;
    });

    const resArr = [];
    for (const item of dataArr) {
      const response = {
        user_id: item.user_id,
        status: false,
      }
      try {
        const userData = usersObj[item.user_id];
        if (!userData) {
          resArr.push({ ...response, msg: "User Not Found" });
          return;
        }
        const data = { ...item };
        req.joiData = data;
        req.user = userData;
        const profitLoss = await makeSettlementDiamond(req);
        if (profitLoss.statusCode == SUCCESS) {
          response.status = true
        }
        resArr.push({ ...response, msg: profitLoss.data });
      } catch (error) {
        resArr.push({ ...response, msg: error.message });
      }
    }

    return resultResponse(SUCCESS, resArr)
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function getAccountReports(params) {
  let array = params.search;
  const obj = array.reduce((acc, val) => {
    return { ...acc, [val]: val };
  }, {});
  const data = {};

  try {
    let promises = [];
    if (obj.query) promises.push(BetsOdds.aggregate(accountStatementQuery.betsQuery(params)).then(result => data.bets_data = result));
    if (obj.plQuery) promises.push(UserProfitLoss.aggregate(accountStatementQuery.plQuery(params)).then(result => data.pl_data = result));
    if (obj.dwQuery) promises.push(AccountWalletStatement.aggregate(accountStatementQuery.dwQuery(params)).then(result => data.total_dw_pl = result));
    if (obj.statementQuery) promises.push(AccountWalletStatement.aggregate(accountStatementQuery.statementQuery(params)).then(result => data.transactional_data = result));
    if (obj.transactionQuery) promises.push(AccountWalletStatement.aggregate(accountStatementQuery.transactionQuery(params)).then(result => data.transactionalReport = result));
    if (obj.topGamesQuery) promises.push(BetsOdds.aggregate(accountStatementQuery.topGames(params)).then(result => data.topGamesPlayed = result));
    if (obj.topCasinoQuery) promises.push(UserProfitLoss.aggregate(accountStatementQuery.topCasinoGames(params)).then(result => data.topCasinoGamesPlayed = result));
    if (obj.winnersQuery) promises.push(UserProfitLoss.aggregate(accountStatementQuery.topWinners(params)).then(result => data.topWinnersList = result));
    if (obj.losersQuery) promises.push(UserProfitLoss.aggregate(accountStatementQuery.topLosers(params)).then(result => data.topLosersList = result));
    if (obj.trafficAnalysisQuery) promises.push(BetsOdds.aggregate(accountStatementQuery.loginBetsQuery(params)).then(result => data.trafficAnalysisData = result));
    if (obj.activeClientsQuery) promises.push(oAuthToken.aggregate(accountStatementQuery.clientsQuery(params)).then(result => data.activeClients = result));
    if (obj.betsCountPlQuery) promises.push(BetsOdds.aggregate(accountStatementQuery.BetsCountWithPLQuery(params)).then(result => data.BetsCountWithPL = result));
    if (obj.openBetsQuery) promises.push(BetsOdds.aggregate(accountStatementQuery.openBetsQuery(params)).then(result => data.sportsWiseOpenBets = result));
    if (obj.userDataQuery) promises.push(User.aggregate(accountStatementQuery.usersDataQuery(params)).then(result => data.usersData = result));

    if (obj.totalDownline) {

      let userData = await User.findOne({ _id: ObjectId(params.user_id) }).select("-_id is_total_count_calculated").lean();

      if (!userData?.is_total_count_calculated) {

        let agentsCounts = await User.countDocuments({
          self_close_account: 0, parent_close_account: 0, user_type_id: { $ne: USER_TYPE_USER }, "parent_level_ids.user_id": ObjectId(params.user_id)
        });
        let usersCounts = await User.countDocuments({
          self_close_account: 0, parent_close_account: 0, user_type_id: USER_TYPE_USER, "parent_level_ids.user_id": ObjectId(params.user_id)
        });

        await User.updateOne({ _id: ObjectId(params.user_id) }, { total_downline_users_count: usersCounts, total_downline_agents_count: agentsCounts, is_total_count_calculated: true });

      }

      promises.push(User.findOne({ _id: ObjectId(params.user_id) }).select("-_id total_downline_users_count total_downline_agents_count").lean().then(result => data.downlineCounts = result));

    }

    if (obj.totalDownlineOnline) {

      promises.push(User.findOne({ _id: ObjectId(params.user_id) }).select("-_id total_users_online_count total_agents_online_count").lean().then(result => data.totalDownlineOnline = result));

    }

    if (obj.totalProfitLoss) {

      promises.push(UserProfitLoss.aggregate(accountStatementQuery.totalProfitLossQuery(params)).then(result => data.totalProfitLoss = result[0]));

    }

    if (array.length === 0) {
      let query = accountStatementQuery.betsQuery(params);
      let plQuery = accountStatementQuery.plQuery(params);
      let dwquery = accountStatementQuery.dwQuery(params);
      let statementQuery = accountStatementQuery.statementQuery(params);
      let transactionalQuery = accountStatementQuery.transactionQuery(params);
      let winnersQuery = accountStatementQuery.topWinners(params);
      let losersQuery = accountStatementQuery.topLosers(params);
      let trafficAnalysisQuery = accountStatementQuery.loginBetsQuery(params);
      let topGamesQuery = accountStatementQuery.topGames(params);
      let topCasinoQuery = accountStatementQuery.topCasinoGames(params)
      let activeClientsQuery = accountStatementQuery.clientsQuery(params);
      let betsCountPlQuery = accountStatementQuery.BetsCountWithPLQuery(params);
      let openBetsQuery = accountStatementQuery.openBetsQuery(params);
      let userDataQuery = accountStatementQuery.usersDataQuery(params);
      try {
        let [
          betsResult, pl_result, dwResult, statementResult, transactionalResult, winnersResult, losersResult, trafficResult,
          gamesResult, casinoResult, activeClientResult, betsPlResult, openBetsResult, userResult
        ] = await Promise.all([
          BetsOdds.aggregate(query), UserProfitLoss.aggregate(plQuery), AccountWalletStatement.aggregate(dwquery),
          AccountWalletStatement.aggregate(statementQuery), AccountWalletStatement.aggregate(transactionalQuery),
          UserProfitLoss.aggregate(winnersQuery), UserProfitLoss.aggregate(losersQuery), BetsOdds.aggregate(trafficAnalysisQuery),
          BetsOdds.aggregate(topGamesQuery), UserProfitLoss.aggregate(topCasinoQuery), oAuthToken.aggregate(activeClientsQuery),
          BetsOdds.aggregate(betsCountPlQuery), BetsOdds.aggregate(openBetsQuery), User.aggregate(userDataQuery)
        ]);
        if (betsResult || transactionalResult) {
          return resultResponse(SUCCESS, {
            bets_data: betsResult, pl_data: pl_result, total_dw_pl: dwResult, transactional_data: statementResult,
            transactionalReport: transactionalResult, topWinnersList: winnersResult, topLosersList: losersResult,
            trafficAnalysisData: trafficResult, topGamesPlayed: gamesResult, topCasinoGamesPlayed: casinoResult,
            activeClient: activeClientResult, BetsCountWithPL: betsPlResult, sportsWiseOpenBets: openBetsResult,
            usersData: userResult
          }
          );
        }
      } catch (error) {
        return resultResponse(SERVER_ERROR, error.message);
      }
    }
    let results = await Promise.all(promises);
    if (results.length > 0) {
      return resultResponse(SUCCESS, {
        ...data
      });
    } else {
      return resultResponse(NOT_FOUND, "Account report not generated yet!");
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function downloadStatements(data) {
  let query = accountStatementQuery.downloadStatements(data);
  // console.log(JSON.stringify(query),"---")
  return AccountStatement.aggregate(query).then(getStatements => {
    if (getStatements.length) {
      return resultResponse(SUCCESS, getStatements);
    } else
      return resultResponse(NOT_FOUND, "Account statement not generated yet!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getDepositRequestCount(data) {
  try {
    const { user_id, total_deposit_count } = data;

    if (!total_deposit_count) {

      const matchQuery = {
        user_id,
        statement_type: 1,
        amount: { $gt: 0 }
      }
      const groupQuery = {
        _id: "$user_id",
        count: { $count: {} }
      }

      const res = await AccountStatement.aggregate([
        { $match: matchQuery },
        { $group: groupQuery },
      ]);

      if (!res.length) {
        return resultResponse(SUCCESS, { count: 0 })
      }

      await User.updateOne({ _id: user_id }, { total_deposit_count: res[0].count });

      return resultResponse(SUCCESS, { count: res[0].count })

    } else {
      return resultResponse(SUCCESS, { count: total_deposit_count })
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message)
  };

}

function getBonusPercentageByType(type, bonus_data_arr) {
  const bonus_data = bonus_data_arr.find(i => i.bonus_type == type);
  if (!bonus_data || !bonus_data.is_active) {
    return { bonusPercentage: 0, bonus_data_obj: null };
  }

  return {
    bonusPercentage: bonus_data.percentage,
    bonus_data_obj: bonus_data
  };

}

async function getDepositCountandBonusData({
  domain_name, user_id, total_deposit_count,
}) {
  try {
    // Fetch Domain Data from Cache by Domain_name 
    // Fetch No of Deposits for the particular User
    const [domainData, depositCountData] = await Promise.all([
      WebsiteService.getWebsiteSettingsFromCache({ domain_name }),
      getDepositRequestCount({ user_id, total_deposit_count })
    ]);

    if (domainData.statusCode == SUCCESS
      && depositCountData.statusCode == SUCCESS) {

      const { bonus_data, bonus_allowed } = domainData.data;
      const deposit_count = depositCountData?.data?.count;

      if (!bonus_allowed
        || !bonus_data?.length
        || deposit_count == undefined
        || deposit_count == null) {
        return { bonusPercentage: 0, bonus_data_obj: null }
      }

      let type = '';

      if (deposit_count == 0) {
        type = FIRST_DEPOSIT;
      } else if (deposit_count > 0) {
        type = EVERY_DEPOSIT;
      }

      return getBonusPercentageByType(type, bonus_data);

    } else {
      return { bonusPercentage: 0, bonus_data_obj: null };
    }

  } catch (error) {
    return { bonusPercentage: 0, bonus_data_obj: null };
  }
}

async function chipInOutDiamond(req) {
  /**
   * 1. Check if Parent User is not Sub Admin return with Error Message -> "User Super Admin Panel for This Operation.."
   * 2. Case Deposit (Parent -> Child)
   *    1. Calculate Parent Children_Credit_Reference if this field is not already present
   *          Children_Credit_Reference = Credit_Reference - (Sum of all Child User's Credit Reference)
   *    2. The Deposit Amount should not be more than Parent's Children_Credit_Reference & Balance Fields
   *    3. Updates Needed To be Done !!
   *        1. Parent -> Add Amount to Children_Credit_Reference & Subtract Amount from Balance & (Balance_Reference ??)
   *        2. Child -> Add Amount to Credit_Reference & Balance & (Balance_Reference ??) 
   *    4. Create Entry in Account Statemtne for Parent & Child
   *    5. Create Entry in CreditReferenceLog for Child
   * 3. Case WithDraw (Parent <- Child) 
   *    1. The Withdraw Amount Should not be more the Child's Credit Reference & Balance
   *    2. Update needed to Be Done !!
   *        1. Child -> Subtract Amount from Credit_Reference & Balance & (Balance_Reference ??)
   *        2. Parent -> Add Amount to Balance & (Balance_Reference ??) & Subtract from Children_Credit_reference
   *    3. Create Entry in Account Statemtne for Parent & Child
   *    4. Create Entry in CreditReferenceLog for Child
   *    
   */
  try {
    const childUser = req?.user;
    const selfUser = req?.User;
    const body = req.joiData;

    let isBonusApplicable = false;
    let bonusAmount = 0;

    // Check If Child User Exists
    if (!childUser) {
      return resultResponse(VALIDATION_ERROR, { msg: "No User Found With this User Id" });
    }

    // Check If Child User & Self User are Same
    if (childUser._id == selfUser._id) {
      return resultResponse(VALIDATION_ERROR, { msg: "You can't Debit/Credit self Balance !!" });
    }

    // Return if body user_id user has parent Id not equal to login users id.
    if (childUser.parent_id != selfUser._id) {
      return resultResponse(VALIDATION_ERROR, { msg: "You can only Debit/Credit from Direct Downline Accounts" });
    }

    // Check If Child User Belongs to DIAMOND
    if (childUser.belongs_to != LABEL_DIAMOND) {
      return resultResponse(VALIDATION_ERROR, { msg: "User does not Belongs to DIAMOND" });
    }

    // Fetch Parent User's Data
    const parentUser = await User.findOne({ _id: childUser.parent_id }, [
      "_id", "user_name", "name", "user_type_id", "parent_id", "profit_loss",
      "parent_user_name", "domain_name", "parent_level_ids",
      "point", "balance", "credit_reference", "children_credit_reference"
    ]).lean().exec();


    // Check If Parent Is Super Admin
    if (parentUser.user_type_id == USER_TYPE_SUPER_ADMIN) {
      return resultResponse(VALIDATION_ERROR, { msg: "User Super Admin Panel for This Operation.." });
    }

    // Check if Bonus is Applicable to the User
    // if (childUser.user_type_id == USER_TYPE_USER && body.crdr == CREDIT_ONE && childUser.belongs_to_b2c) {
    //   isBonusApplicable = true;
    // }

    const isDeposit = body.crdr == CREDIT_ONE;
    // DEPOSIT Request from Parent -> Child
    if (isDeposit) {
      // Validations for Depost Request

      // Check if parentUser children_credit_reference Exists or not
      if (!parentUser.children_credit_reference) {
        // Calculate if not Already Exists
        let children_credit_reference = 0;

        const c_r_sum_result = await calculateChildrenCreditReference(childUser.parent_id);

        if (c_r_sum_result.statusCode != SUCCESS) {
          return resultResponse(SERVER_ERROR, c_r_sum_result.data);
        }
        children_credit_reference = fixFloatingPoint(c_r_sum_result.data);
        await User.updateOne({ _id: parentUser._id }, { $set: { children_credit_reference } }, {
          ...(req.session ? { session: req.session } : {})
        }).exec();
        parentUser.children_credit_reference = children_credit_reference;
      }

      const remaining_credit_reference = parentUser.credit_reference - parentUser.children_credit_reference;
      if (body.amount > remaining_credit_reference || body.amount > parentUser.balance) {
        return resultResponse(VALIDATION_ERROR, {
          msg: parentUser.user_name + " does not have enough balance"
        });
      }

    }
    // WITHDRAW Request from Child -> Parent
    else {
      // Validations for Withdraw Request

      if (body.amount > childUser.credit_reference || body.amount > childUser.balance) {
        return resultResponse(VALIDATION_ERROR, {
          msg: childUser.user_name + " does not have enough balance"
        });
      }
    }

    // Validations Done Time for actual steps to perform.
    const transaction_result = await parentChildUpdateTransactional({
      childUser, parentUser, body, isDeposit,
      isPLSettlement: false,
      statement_type: 1,
    }, req.session);

    if (transaction_result.statusCode != SUCCESS) {
      return resultResponse(SERVER_ERROR, transaction_result.data);
    }

    return resultResponse(SUCCESS,
      transaction_result.data,
    );
  } catch (error) {
    // console.log("Error in chipInOutDiamond: ", error);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function parentChildUpdateTransactional(data, outterSession = undefined) {
  const session = outterSession || await mongoose.startSession({
    defaultTransactionOptions: {
      readPreference: "primary",
      readConcern: { level: "majority" },
      writeConcern: { w: "majority" },
    },
  });
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
    const { childUser, parentUser, body, isDeposit,
      statement_type,
      isPLSettlement, } = data;


    const CreditReferenceLogObj = {
      from: "Upline: " + parentUser.user_name,
      user_id: childUser._id,
      user_name: childUser.user_name,
      name: childUser.name,
      user_type_id: childUser.user_type_id,
      old_credit_reference: childUser.credit_reference,
      new_credit_reference: fixFloatingPoint(childUser.credit_reference + (isDeposit ? body.amount : -body.amount)),
    }

    // Create Account Statement For Child & Parent
    const a_s_result = await getParentChildAccountStatement({
      childUser, parentUser,
      isDeposit,
      remark: body.remark || body.comment,
      amount: body.amount,
      statement_type,
      isPLSettlement,
    })

    if (a_s_result.statusCode != SUCCESS) {
      return resultResponse(SERVER_ERROR, a_s_result.data);
    }

    // Get User Bulk Write Query 
    const user_bulk_result = await getParentChildUpdateQuery({
      child_id: childUser._id,
      parent_id: parentUser._id,
      isDeposit,
      amount: body.amount,
      statement_type,
      isPLSettlement,
    });


    if (user_bulk_result.statusCode != SUCCESS) {
      return resultResponse(SERVER_ERROR, user_bulk_result.data);
    }

    const { parent, child } = a_s_result.data;
    const user_bulk_write_query = user_bulk_result.data;

    // Transaction Started 
    try {
      if (!outterSession) {
        session.startTransaction();
      }
      const LOG_REF_CODE = generateReferCode();

      const preUserDetails = await User.find({ $or: [{ _id: parentUser._id }, { _id: childUser._id }] },
        { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();

      logger.BalExp(`
            --PRE LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: parentChildUpdateTransactional
            LOG_REF_CODE: ${LOG_REF_CODE}
            DETAILS: parent[${preUserDetails[0]?.user_name}(${preUserDetails[0]?._id})] old_balance: ${preUserDetails[0]?.balance} - old_liability: ${preUserDetails[0]?.liability} - cal_amount: ${isDeposit ? -body.amount : body.amount}
            DETAILS: child[${preUserDetails[1]?.user_name}(${preUserDetails[1]?._id})] old_balance: ${preUserDetails[1]?.balance} - old_liability: ${preUserDetails[1]?.liability} - cal_amount: ${isDeposit ? body.amount : -body.amount}
          `);

      await User.bulkWrite(user_bulk_write_query, { session });

      const postUserDetails = await User.find({ $or: [{ _id: parentUser._id }, { _id: childUser._id }] },
        { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();

      logger.BalExp(`
            --POST LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: parentChildUpdateTransactional
            LOG_REF_CODE: ${LOG_REF_CODE}
            DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability}
            DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability}
          `);

      if ((exponentialToFixed(postUserDetails[1]?.liability) > 0) ? true : (exponentialToFixed(postUserDetails[1]?.balance) < 0) ? true : false) {
        sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id}) : balance ${postUserDetails[1]?.balance}, liability ${postUserDetails[1]?.liability}` });
      }

      await AccountStatement.insertMany([parent, child], { session });
      if (!isPLSettlement) {
        await creditReferenceLog.create([CreditReferenceLogObj], { session });
      }

      if (!outterSession) {
        await session.commitTransaction();
        session.endSession();
      }

      let msg_type = isDeposit ? "Deposited" : "Withdrawed"
      responseJson.code = SUCCESS;
      // responseJson.data = `Chips ${msg_type} Successfully`;
      responseJson.data = `Sucessfull Balance Transfer`;
    } catch (error) {
      // console.log("Error in parentChildUpdateTransactional INNER: ", error);
      if (!outterSession) {
        await session.abortTransaction();
        session.endSession();
      }
      responseJson.data = error.message;
    }

    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    // console.log("Error in parentChildUpdateTransactional: ", error);
    return resultResponse(SERVER_ERROR, error.message);
  } finally {
    if (!outterSession) {
      session.endSession();
    }
  }
}

async function getParentChildUpdateQuery(data) {
  try {
    const { child_id, parent_id, isDeposit, amount,
      isPLSettlement, } = data;
    let childUpdate = {}, parentUpdate = {};

    if (isDeposit) {
      parentUpdate = [{
        $set: {
          balance: {
            $round: [{ $subtract: ["$balance", amount] }, 2]
          },
          ...(isPLSettlement ? {
            downline_settlement: {
              $round: [{
                $subtract: [{
                  $ifNull: [
                    "$downline_settlement",
                    0
                  ]
                }, amount]
              }, 2]
            }
          } : {
            children_credit_reference: {
              $round: [{ $add: ["$children_credit_reference", amount] }, 2]
            }
          })
        },
      }];
      childUpdate = [{
        $set: {
          balance: {
            $round: [{ $add: ["$balance", amount] }, 2]
          },
          balance_reference: {
            $round: [{ $add: ["$balance_reference", amount] }, 2]
          },
          ...(isPLSettlement ? {
            upline_settlement: {
              $round: [{
                $add: [{
                  $ifNull: [
                    "$upline_settlement",
                    0
                  ]
                }, amount]
              }, 2]
            }
          } : {
            credit_reference: {
              $round: [{ $add: ["$credit_reference", amount] }, 2]
            }
          })
        }
      }];
    } else {
      parentUpdate = [{
        $set: {
          balance: {
            $round: [{ $add: ["$balance", amount] }, 2]
          },
          ...(isPLSettlement ? {
            downline_settlement: {
              $round: [{
                $add: [{
                  $ifNull: [
                    "$downline_settlement",
                    0
                  ]
                }, amount]
              }, 2]
            }
          } : {
            children_credit_reference: {
              $round: [{ $subtract: ["$children_credit_reference", amount] }, 2]
            }
          })
        },
      }];
      childUpdate = [{
        $set: {
          balance: {
            $round: [{ $subtract: ["$balance", amount] }, 2]
          },
          balance_reference: {
            $round: [{ $subtract: ["$balance_reference", amount] }, 2]
          },
          ...(isPLSettlement ? {
            upline_settlement: {
              $round: [{
                $subtract: [{
                  $ifNull: [
                    "$upline_settlement",
                    0
                  ]
                }, amount]
              }, 2]
            }
          } : {
            credit_reference: {
              $round: [{ $subtract: ["$credit_reference", amount] }, 2]
            }
          })
        },
      }];
    }

    const parentQuery = {
      updateMany: {
        filter: { _id: parent_id },
        update: parentUpdate
      }
    };
    const childQuery = {
      updateMany: {
        filter: { _id: child_id },
        update: childUpdate
      }
    };
    const query = [
      parentQuery,
      childQuery,
    ];

    return resultResponse(SUCCESS, query);
  } catch (error) {
    // console.log("Error in getParentChildUpdateQuery: ", error);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getParentChildAccountStatement(data) {
  try {
    const {
      childUser, parentUser, isDeposit,
      remark, amount, statement_type,
      isPLSettlement,
    } = data;

    let parent = {
      parent_id: parentUser.parent_id,
      parent_user_name: parentUser.parent_user_name,
      user_id: parentUser._id,
      user_type_id: parentUser.user_type_id,
      user_name: parentUser.user_name,
      name: parentUser.name,
      domain_name: parentUser.domain_name,
      agents: parentUser.parent_level_ids,
      point: parentUser.point,
      statement_type, // 1
      remark,
      bonus: 0,
    };

    let child = {
      parent_id: childUser.parent_id,
      parent_user_name: childUser.parent_user_name,
      user_id: childUser._id,
      user_type_id: childUser.user_type_id,
      user_name: childUser.user_name,
      name: childUser.name,
      domain_name: childUser.domain_name,
      agents: childUser.parent_level_ids,
      point: childUser.point,
      remark,
      statement_type,
      bonus: 0,
    };

    if (isDeposit) {

      var sub_statement_type = isPLSettlement ? "SD" : "CD"; // SD = Settlement Deposit, CD Credit Deposit

      parent = {
        ...parent,
        amount: -amount,
        description: `${childUser.parent_user_name}/${childUser.user_name}`,
        available_balance: fixFloatingPoint(parseFloat(parentUser.balance) - parseFloat(amount) + parseFloat(parentUser.profit_loss)),
        sub_statement_type: `${sub_statement_type}-from`,
      };

      child = {
        ...child,
        amount: amount,
        description: `${childUser.parent_user_name}/${childUser.user_name}`,
        available_balance: fixFloatingPoint(
          parseFloat(childUser.balance) + parseFloat(amount) +
          (childUser.user_type_id == USER_TYPE_USER ? -(childUser.liability) : parseFloat(childUser.profit_loss))
        ),
        sub_statement_type: `${sub_statement_type}-to`,
      }
    } else {

      var sub_statement_type = isPLSettlement ? "SW" : "CW"; // SW = Settlement Withdrawal, CW = Credit Withdrawal

      parent = {
        ...parent,
        amount: amount,
        description: `${childUser.user_name}/${childUser.parent_user_name}`,
        available_balance: fixFloatingPoint(parseFloat(parentUser.balance) + parseFloat(amount) + parseFloat(parentUser.profit_loss)),
        sub_statement_type: `${sub_statement_type}-from`,
      };

      child = {
        ...child,
        amount: -amount,
        description: `${childUser.user_name}/${childUser.parent_user_name}`,
        available_balance: fixFloatingPoint(
          parseFloat(childUser.balance) - parseFloat(amount) +
          (childUser.user_type_id == USER_TYPE_USER ? -(childUser.liability) : parseFloat(childUser.profit_loss))),
        sub_statement_type: `${sub_statement_type}-to`,
      }
    }
    return resultResponse(SUCCESS, { parent, child });
  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function calculateChildrenCreditReference(parent_id) {
  try {
    let children_credit_reference = 0;

    const users = await User.aggregate([
      { $match: { parent_id } },
      {
        $group: {
          _id: null,
          credit_reference_sum: { $sum: "$credit_reference" }
        }
      }
    ]);

    if (!users.length) {
      children_credit_reference = 0;
    } else {
      children_credit_reference = users[0].credit_reference_sum;
    }

    return resultResponse(SUCCESS, children_credit_reference);
  } catch (error) {
    // console.log("Error in calculateChildrenCreditReference: ", error);
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

module.exports = {
  getAccountStatement,
  makeSettlement,
  getAccountReports,
  downloadStatements,
  getDepositRequestCount,
  getDepositCountandBonusData,
  getBonusPercentageByType,
  chipInOutDiamond,
  makeSettlementDiamondMulti,
  makeSettlementDiamond,
  calculateChildrenCreditReference,
  getAccountStatementDocument,
};