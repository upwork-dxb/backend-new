const getCurrentLine = require('get-current-line');
const { ObjectId } = require("bson");
const mongoose = require('mongoose');
const User = require('../../../models/user');
const AccountStatement = require('../../../models/accountStatement');
const AccountWalletStatement = require('../../../models/accountwalletSatement');
const commonService = require('../../service/commonService');
const walletService = require('../../service/walletService');
const telegramService = require('../../service/telegramService');
const { depositRequestMsg } = require("../../../utils/systemMessages");
const b2cConstants = require("../../../utils/b2cConstants");
const logger = require('../../../utils/loggers');
const { sendMessageAlertToTelegram } = require('../../service/messages/telegramAlertService')
const { generateReferCode, exponentialToFixed } = require('../../../utils');
const globalFunction = require('../../../utils/globalFunction');
const {
  DEBIT_TWO, CREDIT_ONE,
  SUCCESS, NOT_FOUND, SERVER_ERROR, DATA_NULL, VALIDATION_ERROR,
  LABEL_B2C_MANAGER, ACCOUNT_STATEMENT_TYPE_CHIPINOUT, USER_TYPE_SUPER_ADMIN
} = require('../../../utils/constants');

let resultResponse = globalFunction.resultResponse;

// We are using the exiting working code  with some minor changes.
module.exports = {
  walletchipIn: async function (data, LOG_REF_CODE) {
    const startTime = Date.now();
    try {
      let { user_id, parent_id, amount, crdr, payment_method_id, user_name, reference_no } = data;
      let userDetails = (await commonService.getUserByUserId(user_id, {
        parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
        balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, mobile: 1, country_code: 1
      })).data;
      let statement_type = 'DEPOSIT_REQUEST';

      amount = parseFloat(amount);
      let description = `Transaction By ${user_name}`;
      let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
        parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
        balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
      })).data;
      return walletService.walletagentsAndUsersBonusCr({
        description, crdr, amount, payment_method_id, reference_no, LOG_REF_CODE,
        // Parents fields
        parentOfParentId: parentUserDetails.parent_id,
        parent_id,
        parentUserTypeId: parentUserDetails.user_type_id,
        parentUserName: parentUserDetails.user_name,
        parentName: parentUserDetails.name,
        parentOfParentUserName: parentUserDetails.parent_user_name,
        parentPoint: parentUserDetails.point,
        parentDomainId: parentUserDetails.domain,
        parentDomainName: parentUserDetails.domain_name,
        parentLevelIds: parentUserDetails.parent_level_ids,
        // Childs fields
        parent_user_name: userDetails.parent_user_name,
        user_id,
        user_type_id: userDetails.user_type_id,
        user_name: userDetails.user_name,
        name: userDetails.name,
        mobile: userDetails.mobile,
        country_code: userDetails.country_code || '',
        domain_name: userDetails.domain_name,
        parent_level_ids: userDetails.parent_level_ids,
      }, userDetails)
        .then(async (agentsAndUsersCrDr) => {
          if (agentsAndUsersCrDr.statusCode == SUCCESS) {
            let { walletagents, ...restData } = agentsAndUsersCrDr.data;
            for (let index = 0; index < walletagents.length; index++) {
              const element = walletagents[index];
              let userBotDetails = (await telegramService.getInfoByUserId(element)).data;
              if (userBotDetails) {
                if (userBotDetails.user_type_id === 14) {
                  let params = {
                    _id: restData._id,
                    name: restData.name,
                    user_name: restData.user_name,
                    amount: restData.amount,
                    domain_name: restData.domain_name,
                    accept_deposit_key: b2cConstants.TELEGRAM_BOT.ACCEPT_DEPOSIT_KEY,
                    reject_deposit_key: b2cConstants.TELEGRAM_BOT.REJECT_DEPOSIT_KEY
                  };
                  let deposit_request_msg = depositRequestMsg(params);
                  await bot.sendMessage(userBotDetails.chat_id, `${b2cConstants.TELEGRAM_BOT.ACCEPT_DEPOSIT_KEY} ${restData._id} ...`);
                  await bot.sendMessage(userBotDetails.chat_id, `${b2cConstants.TELEGRAM_BOT.REJECT_DEPOSIT_KEY} ${restData._id} ...`);
                }
              }
            }
            await depositAccepetedRequest(data, userDetails, LOG_REF_CODE);
            logger.FloxyPay(`
              ## INFO LOG ##
              LOG_REF_CODE: ${LOG_REF_CODE}
              FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
              FUNCTION: walletchipIn
              EVENT_DETAILS: Deposit request processed.
              TIME TAKEN: ${Date.now() - startTime} ms
              INFO :Your balance deposit request has been successfully processed.`
            );
          } else {
            logger.FloxyPay(`
              ## ERROR LOG ##
              LOG_REF_CODE: ${LOG_REF_CODE}
              FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
              FUNCTION: walletchipIn
              EVENT_DETAILS: Deposit request processing failed.
              TIME TAKEN: ${Date.now() - startTime} ms
              RES : ${agentsAndUsersCrDr.data}`
            );
          }
        }).catch(error => {
          logger.FloxyPay(`
            ## ERROR LOG ##
            LOG_REF_CODE: ${LOG_REF_CODE}
            FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
            FUNCTION: walletchipIn
            EVENT_DETAILS: Due to system error deposit request processing failed.
            TIME TAKEN: ${Date.now() - startTime} ms
            ERROR_DETAILS : Wallet chip in error : ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
          );
        });
    } catch (error) {
      logger.FloxyPay(`
        ## ERROR LOG ##
        LOG_REF_CODE: ${LOG_REF_CODE}
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: walletchipIn
        EVENT_DETAILS: Due to system error deposit request processing failed.
        TIME TAKEN: ${Date.now() - startTime} ms
        ERROR_DETAILS : Wallet chip in error : ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
    }
  },
  // We are using the exiting working code  with some minor changes.
  walletchipOut: async function (data) {
    try {
      let { user_id, parent_id, amount, crdr, user_name } = data;
      let statement_type = 'WITHDRAW_REQUEST';
      let userDetails = (await commonService.getUserByUserId(user_id, {
        parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
        balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1, mobile: 1, country_code: 1
      })).data;
      let checkexistRequest = (await walletService.checkrequest({
        user_id, statement_type
      }));
      let valueExistMethod = (await walletService.valueExistMethod({
        user_id
      }));
      if (valueExistMethod.data.length == 0) {
        return ({ msg: "Please add atleast one payment method!", status: false });
      }
      if (checkexistRequest.data) {
        return ({ msg: "Your previous request is under process!", status: false });
      }
      amount = parseFloat(amount);
      let description = `Transaction By ${user_name}(${user_name})`;
      if (amount > userDetails.balance && crdr === DEBIT_TWO) {
        return ({ msg: "Insufficient Balance!", status: false });
      }
      let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
        parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
        balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
      })).data;
      return walletagentsAndUsersDr({
        description, crdr, amount,
        // Parents fields
        parentOfParentId: parentUserDetails.parent_id,
        parent_id,
        parentUserTypeId: parentUserDetails.user_type_id,
        parentUserName: parentUserDetails.user_name,
        parentName: parentUserDetails.name,
        parentOfParentUserName: parentUserDetails.parent_user_name,
        parentPoint: parentUserDetails.point,
        parentDomainName: parentUserDetails.domain_name,
        parentDomainId: parentUserDetails.domain,
        parentLevelIds: parentUserDetails.parent_level_ids,
        // Childs fields
        parent_user_name: userDetails.parent_user_name,
        user_id,
        user_type_id: userDetails.user_type_id,
        user_name: userDetails.user_name,
        name: userDetails.name,
        mobile: userDetails.mobile,
        country_code: userDetails.country_code || '',
        domain_name: userDetails.domain_name,
        parent_level_ids: userDetails.parent_level_ids,
        payment_deatails: data.payment_deatails
      })
        .then(async (agentsAndUsersCrDr) => {
          if (agentsAndUsersCrDr.statusCode == SUCCESS) {
            let resMsg = "Balance Withdraw Request Successfully.";
            data.statement_id = agentsAndUsersCrDr.data._id;
            const withdrawacceptedRes = await withdrawacceptedRequest(data);
            if (withdrawacceptedRes.statusCode == SUCCESS) {
              return ({ msg: withdrawacceptedRes.data, status: true });
            }
            return ({ msg: resMsg, status: true });
          } else {
            return ({ msg: agentsAndUsersCrDr.data, status: true });
          }
        })
        .catch(error => {
          return ({ msg: error.message, status: false });
        });
    } catch (error) {
      return ({ msg: error.message, status: false });
    }
  }
}
// We are using the exiting working code  with some minor changes.
let depositAccepetedRequest = async (data, userDetail, LOG_REF_CODE) => {
  const startTime = Date.now();
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
      , desc = '', statement_type = '', images = '';
    statement_type = 'DEPOSIT_REQUEST';
    desc = 'Balance DEPOSIT Request by floxypay:' + userDetail.user_name;
    var statement_preview = await AccountWalletStatement.findOne({ 'reference_no': data.reference_no });
    var userData = await User.findOne({ '_id': ObjectId(statement_preview.user_id) });
    await session.withTransaction(async session => {
      try {
        data.user_id = statement_preview.user_id;
        data.parent_id = statement_preview.parent_id;
        data.amount = statement_preview.amount;
        data.crdr = CREDIT_ONE;
        data.remark = 'Floxy wallet';
        data.description = 'Chips credited  from floxypay.';
        chipwalletInOut(data, userData, LOG_REF_CODE);
        await AccountWalletStatement.updateOne({
          _id: statement_preview._id,
        }, { "$set": { "reference_no": data.reference_no, 'status': 'ACCEPTED' } }, { session });
        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = "Deposit request has been successfully processed and accepted.";
      } catch (error) {
        logger.FloxyPay(`
          ## ERROR LOG ##
          LOG_REF_CODE: ${LOG_REF_CODE}
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: depositAccepetedRequest
          EVENT_DETAILS: Due to a system error, the deposit request was not accepted.
          TIME TAKEN: ${Date.now() - startTime} ms
          ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
        );
        await session.abortTransaction();
        responseJson.data = "Error in depositAccepetedRequest" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    logger.FloxyPay(`
      ## INFO LOG ##
      LOG_REF_CODE: ${LOG_REF_CODE}
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: depositAccepetedRequest
      EVENT_DETAILS: Deposit accepted.
      TIME TAKEN: ${Date.now() - startTime} ms
      RES: ${JSON.stringify(responseJson.data)}`
    );
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    logger.FloxyPay(`
      ## ERROR LOG ##
      LOG_REF_CODE: ${LOG_REF_CODE}
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: depositAccepetedRequest
      EVENT_DETAILS: Due to a system error, the deposit request was failed.
      TIME TAKEN: ${Date.now() - startTime} ms
      ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
    );
    //return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};
// We are using the exiting working code  with some minor changes.
async function chipwalletInOut(data, userDetails, LOG_REF_CODE) {
  const startTime = Date.now();
  let { user_id, parent_id, remark, amount, crdr, description } = data;
  let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
    parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
    balance: 1, parent_level_ids: 1, domain_name: 1, point: 1
  })).data;
  return agentsAndUsersCrDr({
    description, remark, crdr, amount,
    // Parents fields
    parentOfParentId: parentUserDetails.parent_id,
    parent_id,
    parentUserTypeId: parentUserDetails.user_type_id,
    parentUserName: parentUserDetails.user_name,
    parentName: parentUserDetails.name,
    parentOfParentUserName: parentUserDetails.parent_user_name,
    parentPoint: parentUserDetails.point,
    parentDomainName: parentUserDetails.domain_name,
    parentLevelIds: parentUserDetails.parent_level_ids,
    parentBelongsToCreditReference: parentUserDetails.belongs_to_credit_reference,
    parentCurrentBalance: parentUserDetails.balance,
    // Childs fields
    parent_user_name: userDetails.parent_user_name,
    user_id,
    belongs_to: LABEL_B2C_MANAGER,
    user_type_id: userDetails.user_type_id,
    user_name: userDetails.user_name,
    name: userDetails.name,
    point: userDetails.point,
    domain_name: userDetails.domain_name,
    parent_level_ids: userDetails.parent_level_ids,
    userCurrentBalance: userDetails.balance + -(userDetails.liability),
    belongs_to_credit_reference: userDetails.belongs_to_credit_reference,
    statement_type: ACCOUNT_STATEMENT_TYPE_CHIPINOUT
  }, userDetails, LOG_REF_CODE)
    .then(agentsAndUsersCrDr => agentsAndUsersCrDr.statusCode == SUCCESS ? 1 : 0)
    .catch(error => {
      logger.FloxyPay(`
        ## ERROR LOG ##
        LOG_REF_CODE: ${LOG_REF_CODE}
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: chipwalletInOut
        EVENT_DETAILS: Due to system error, chip wallet in out process failed.
        TIME TAKEN: ${Date.now() - startTime} ms
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
    });
};
// We are using the exiting working code  with some minor changes.
async function agentsAndUsersCrDr(data, userDetail, REF_CODE) {
  const startTime = Date.now();
  const session = await mongoose.startSession();
  let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
  try {
    const desc = 'Chips credited from parent (Floxypay)';
    const descParent = `Chips credited to ${userDetail.name} (${userDetail.user_name})`;

    let parent = {
      parent_id: data.parentOfParentId,
      parent_user_name: data.parentOfParentUserName,
      user_id: data.parent_id,
      user_type_id: data.parentUserTypeId,
      user_name: data.parentUserName,
      name: data.parentName,
      domain_name: data.parentDomainName,
      agents: data.parentLevelIds,
      point: data.parentPoint,
      description: descParent,
      remark: data.remark,
      statement_type: data.statement_type,
      amount: -data.amount,
      available_balance: parseFloat(data.parentCurrentBalance) - parseFloat(data.amount),
    };

    let child = {
      parent_id: data.parent_id,
      parent_user_name: data.parent_user_name,
      user_id: data.user_id,
      user_type_id: data.user_type_id,
      user_name: data.user_name,
      name: data.name,
      domain_name: data.domain_name,
      agents: data.parent_level_ids,
      point: data.point,
      description: desc,
      remark: data.remark,
      statement_type: data.statement_type,
      amount: data.amount,
      available_balance: parseFloat(data.userCurrentBalance) + parseFloat(data.amount),
    };

    await session.withTransaction(async () => {

      const LOG_REF_CODE = generateReferCode();

      const preUserDetails = await User.find({ $or: [{ _id: parent.user_id }, { _id: child.user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

      logger.BalExp(`
        --PRE LOG--
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: agentsAndUsersCrDr
        EVENT_DETAILS: credit auto
        LOG_REF_CODE: ${LOG_REF_CODE}
        DETAILS: parent[${preUserDetails[0]?.user_name}(${preUserDetails[0]?._id})] old_balance: ${preUserDetails[0]?.balance} - old_liability: ${preUserDetails[0]?.liability} - cal_amount: ${parent.amount}
        DETAILS: child[${preUserDetails[1]?.user_name}(${preUserDetails[1]?._id})] old_balance: ${preUserDetails[1]?.balance} - old_liability: ${preUserDetails[1]?.liability} - cal_amount: ${child.amount}
      `);

      await User.bulkWrite([
        {
          updateOne: {
            filter: { _id: parent.user_id },
            update: { $inc: { balance: parent.amount } }
          }
        },
        {
          updateOne: {
            filter: { _id: child.user_id },
            update: { $inc: { balance: child.amount } }
          }
        }
      ], { session });

      const postUserDetails = await User.find({ $or: [{ _id: parent.user_id }, { _id: child.user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

      logger.BalExp(`
        --POST LOG--
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: agentsAndUsersCrDr
        EVENT_DETAILS: credit auto
        LOG_REF_CODE: ${LOG_REF_CODE}
        DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability}
        DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability}
      `);

      if ((exponentialToFixed(postUserDetails[1]?.liability) > 0) ? true : (exponentialToFixed(postUserDetails[1]?.balance) < 0) ? true : false) {
        sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id}) : balance ${postUserDetails[1]?.balance}, liability ${postUserDetails[1]?.liability}` });
      }

      await AccountStatement.insertMany([parent, child], { session });

      responseJson.code = SUCCESS;
      responseJson.data = "Balance has been updated successfully.";
    });
    logger.FloxyPay(`
      ## INFO LOG ##
      LOG_REF_CODE : ${REF_CODE}
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: agentsAndUsersCrDr
      EVENT_DETAILS: Agents and users Credit/Debit process completed successfully.
      TIME TAKEN: ${Date.now() - startTime} ms
      RES: ${JSON.stringify(responseJson.data)}`
    );
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    logger.FloxyPay(`
      ## ERROR LOG ##
      LOG_REF_CODE : ${REF_CODE}
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: agentsAndUsersCrDr
      EVENT_DETAILS: Due to system error, agents and users Credit/Debit process failed.
      TIME TAKEN: ${Date.now() - startTime} ms
      ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
    );
    // return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
}
// We are using the exiting working code  with some minor changes.
async function walletagentsAndUsersDr(data) {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
      , desc = '', statement_type = '', images = '';
    statement_type = 'WITHDRAW_REQUEST';
    desc = 'Balance Withdraw Request by floxypay: ' + data.user_name;
    var userDatas = await User.distinct('_id', { belongs_to: LABEL_B2C_MANAGER, domain_assign_list: ObjectId(data.parentDomainId) });
    var agentData = await User.findOne({ '_id': ObjectId(data.user_id) });
    let parent = {
      parent_id: data.parent_id,
      agent_id: agentData.parent_id,
      images: images,
      parent_user_name: data.parentUserName,
      user_id: data.user_id,
      user_type_id: data.user_type_id,
      user_name: data.user_name,
      name: data.name,
      mobile: data.mobile,
      country_code: data.country_code,
      domain_name: agentData.domain_name,
      domain: agentData.domain,
      walletagents: userDatas,
      point: data.parentPoint,
      description: desc,
      statement_type: statement_type,
      amount: data.amount,
      parents: data.parent_level_ids,
    };
    await session.withTransaction(async session => {
      try {
        let wallet_statement = await AccountWalletStatement.insertMany([parent], { session });
        let new_wallet_statement = {
          _id: wallet_statement[0]._id,
          parent_user_name: wallet_statement[0].parent_user_name,
          name: wallet_statement[0].name,
          user_name: wallet_statement[0].user_name,
          domain_name: wallet_statement[0].domain_name,
          images: wallet_statement[0].images,
          amount: wallet_statement[0].amount,
          payment_deatails: wallet_statement[0].payment_deatails,
          created_at: wallet_statement[0].created_at,
          generated_at: wallet_statement[0].generated_at,
          walletagents: wallet_statement[0].walletagents
        };
        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = new_wallet_statement;
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in walletagentsAndUsersDr" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};
// We are using the exiting working code  with some minor changes.
async function withdrawacceptedRequest(data) {
  const accDetail = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) }, { user_name: 1, status: 1, name: 1, created_at: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1, user_id: 1, parent_id: 1, remark: 1, crdr: 1, statement_type: 1 })
  if (accDetail) {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
    description = 'Balance Withdraw Request by:floxypay | account from :' + accDetail.user_name;
    if (accDetail.status === "ACCEPTED") {
      responseJson.code = SERVER_ERROR;
      responseJson.data = 'Not allowed, Already accepted!';
      return resultResponse(responseJson.code, responseJson.data);
    }
    // Create Object chipwalletData start
    let userDetail = await User.findOne({ '_id': ObjectId(accDetail.user_id) });
    // Check user balance
    if (accDetail.amount > userDetail.balance) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "User's balance is low.";
      return resultResponse(responseJson.code, responseJson.data);
    }
    let chipwalletData = { description: 'Transaction By floxypay.' };
    let crdr = CREDIT_ONE;
    if (accDetail.statement_type == "WITHDRAW_REQUEST") {
      crdr = DEBIT_TWO;
    }
    chipwalletData.user_id = accDetail.user_id;
    chipwalletData.parent_id = accDetail.parent_id;
    chipwalletData.remark = accDetail.remark;
    chipwalletData.amount = accDetail.amount;
    chipwalletData.crdr = crdr;
    await chipwalletInOutWithdrawal(chipwalletData, userDetail);
    return AccountWalletStatement.updateOne(
      { '_id': ObjectId(data.statement_id) },
      { "$set": { status: 'ACCEPTED' } },
      { upsert: true, setDefaultsOnInsert: true }
    ).then(() => resultResponse(SUCCESS, "Withdrawal process seccessfully done."))
      .catch(error => {
        resultResponse(SERVER_ERROR, error.message)
      })
  } return resultResponse(NOT_FOUND, "Entry not found!");
};
// We are using the exiting working code  with some minor changes.
async function agentsAndUsersCrDrWithdrawal(data, userDetail) {
  const session = await mongoose.startSession();
  let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
  try {
    let desc = 'Chips debited from parent (Floxypay)';
    let descParent = `Chips debited ${userDetail.name} (${userDetail.user_name})`;

    if (data.description != '') {
      desc = desc + ' || ' + data.description;
      descParent = descParent + ' || ' + data.description;
    }
    if (data.belongs_to_credit_reference) {
      desc = `Upline ${data.parentName}(${data.parentUserName}) ↞ ${data.name}(${data.user_name})`;
      if (data.parentUserTypeId != USER_TYPE_SUPER_ADMIN)
        descParent = desc;
    }
    if (data.belongs_to) {
      desc = `Chips debited from parent`;
    }
    let parent = {
      parent_id: data.parentOfParentId,
      parent_user_name: data.parentOfParentUserName,
      user_id: data.parent_id,
      user_type_id: data.parentUserTypeId,
      user_name: data.parentUserName,
      name: data.parentName,
      domain_name: data.parentDomainName,
      agents: data.parentLevelIds,
      point: data.parentPoint,
      description: descParent,
      remark: data.remark,
      statement_type: data.statement_type,
      amount: data.amount,
      available_balance: (parseFloat(data.parentCurrentBalance) + parseFloat(data.amount)),
    };
    if (data.belongs_to_credit_reference && data.parentUserTypeId != USER_TYPE_SUPER_ADMIN)
      parent.amount = -data.amount;

    let child = {
      parent_id: data.parent_id,
      parent_user_name: data.parent_user_name,
      user_id: data.user_id,
      user_type_id: data.user_type_id,
      user_name: data.user_name,
      name: data.name,
      domain_name: data.domain_name,
      agents: data.parent_level_ids,
      point: data.point,
      description: desc,
      remark: data.remark,
      amount: -data.amount,
      statement_type: data.statement_type,
      available_balance: (parseFloat(data.userCurrentBalance) - parseFloat(data.amount)),
    };

    await session.withTransaction(async () => {

      const LOG_REF_CODE = generateReferCode();

      const preUserDetails = await User.find({ $or: [{ _id: parent.user_id }, { _id: child.user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

      logger.BalExp(`
        --PRE LOG--
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: agentsAndUsersCrDrWithdrawal
        EVENT_DETAILS: debit auto
        LOG_REF_CODE: ${LOG_REF_CODE}
        DETAILS: parent[${preUserDetails[0]?.user_name}(${preUserDetails[0]?._id})] old_balance: ${preUserDetails[0]?.balance} - old_liability: ${preUserDetails[0]?.liability} - cal_amount: ${parent.amount}
        DETAILS: child[${preUserDetails[1]?.user_name}(${preUserDetails[1]?._id})] old_balance: ${preUserDetails[1]?.balance} - old_liability: ${preUserDetails[1]?.liability} - cal_amount: ${child.amount}
      `);

      await User.bulkWrite([
        {
          updateOne: {
            filter: { _id: parent.user_id },
            update: { $inc: { balance: parent.amount } }
          }
        },
        {
          updateOne: {
            filter: { _id: child.user_id },
            update: { $inc: { balance: child.amount } }
          }
        }
      ], { session });

      const postUserDetails = await User.find({ $or: [{ _id: parent.user_id }, { _id: child.user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

      logger.BalExp(`
        --POST LOG--
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: agentsAndUsersCrDrWithdrawal
        EVENT_DETAILS: debit auto
        LOG_REF_CODE: ${LOG_REF_CODE}
        DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability}
        DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability}
      `);

      await AccountStatement.insertMany([parent, child], { session });

      responseJson.code = SUCCESS;
      responseJson.data = "Balance Updated Successfully...";
    });

    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    console.log(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "Something went wrong line no. 624"));
    // return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file}:${getCurrentLine.default().line}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
}
// We are using the exiting working code  with some minor changes.
async function chipwalletInOutWithdrawal(data, userDetails) {
  let { user_id, parent_id, remark, amount, crdr, description } = data;
  let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
    parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
    balance: 1, parent_level_ids: 1, domain_name: 1, point: 1
  })).data;
  return agentsAndUsersCrDrWithdrawal({
    description, remark, crdr, amount,
    // Parents fields
    parentOfParentId: parentUserDetails.parent_id,
    parent_id,
    parentUserTypeId: parentUserDetails.user_type_id,
    parentUserName: parentUserDetails.user_name,
    parentName: parentUserDetails.name,
    parentOfParentUserName: parentUserDetails.parent_user_name,
    parentPoint: parentUserDetails.point,
    parentDomainName: parentUserDetails.domain_name,
    parentLevelIds: parentUserDetails.parent_level_ids,
    parentBelongsToCreditReference: parentUserDetails.belongs_to_credit_reference,
    parentCurrentBalance: parentUserDetails.balance,
    // Childs fields
    parent_user_name: userDetails.parent_user_name,
    user_id,
    belongs_to: LABEL_B2C_MANAGER,
    user_type_id: userDetails.user_type_id,
    user_name: userDetails.user_name,
    name: userDetails.name,
    point: userDetails.point,
    domain_name: userDetails.domain_name,
    parent_level_ids: userDetails.parent_level_ids,
    userCurrentBalance: userDetails.balance + -(userDetails.liability),
    belongs_to_credit_reference: userDetails.belongs_to_credit_reference,
    statement_type: ACCOUNT_STATEMENT_TYPE_CHIPINOUT
  }, userDetails)
    .then(agentsAndUsersCrDr => agentsAndUsersCrDr.statusCode == SUCCESS ? 1 : 0)
    .catch(error => error);
}
