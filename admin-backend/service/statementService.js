const mongoose = require('mongoose')
  , { ObjectId } = require("bson")
  , getCurrentLine = require('get-current-line')
  , User = require('../../models/user')
  , AccountStatement = require('../../models/accountStatement')
  , commonService = require('./commonService')
  , globalFunction = require('../../utils/globalFunction')
  , logger = require('../../utils/loggers')
  , { sendMessageAlertToTelegram } = require('./messages/telegramAlertService')
  , { generateReferCode, toFix, exponentialToFixed } = require('../../utils')
  , {
    SUCCESS, SERVER_ERROR, DEBIT_TWO, DATA_NULL, CREDIT_ONE, USER_TYPE_SUPER_ADMIN, ACCOUNT_STATEMENT_TYPE_CHIPINOUT, NOT_FOUND,
    ACCOUNT_STATEMENT_TYPE_BONUS
  } = require('../../utils/constants');

let resultResponse = globalFunction.resultResponse;

let adminSelfCrDr = async (data) => {
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
    let desc = data.crdr === DEBIT_TWO ? 'Admin Self Debit' : 'Admin Self Credit';
    if (data.description != '')
      desc = desc + ' || ' + data.description;
    data.description = desc;
    if (data.belongs_to_credit_reference)
      data.description = "Upline ↠ Self";

    let accountdetails = { ...data };
    const session = await mongoose.startSession();
    const transactionOptions = {
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' }
    };
    await session.withTransaction(async (session) => {
      try {

        const LOG_REF_CODE = generateReferCode();

        const preUserDetails = await User.findOne({ _id: data.user_id }, { user_name: 1, balance: 1 }).session(session).lean();

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: adminSelfCrDr
          EVENT_DETAILS: self ${data.crdr === DEBIT_TWO ? "debit" : "credit"}
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - cal_amount: ${data.amount}
        `);

        if (data.crdr === DEBIT_TWO) {
          accountdetails.amount = -data.amount;
          accountdetails.available_balance = (parseFloat(data.userCurrentBalance) - parseFloat(data.amount));
          await User.updateOne({ _id: data.user_id }, { $inc: { balance: -data.amount, balance_reference: -data.amount } }).session(session).lean();
          let createAccountStatement = await AccountStatement.create([accountdetails], { session });
          await session.commitTransaction();
          responseJson.code = SUCCESS;
          responseJson.data = createAccountStatement;
        } else {
          accountdetails.amount = data.amount;
          accountdetails.available_balance = (parseFloat(data.userCurrentBalance) + parseFloat(data.amount));
          await User.updateOne({ _id: data.user_id }, { $inc: { balance: data.amount, balance_reference: data.amount } }).session(session).lean();
          let createAccountStatement = await AccountStatement.create([accountdetails], { session });
          await session.commitTransaction();
          responseJson.code = SUCCESS;
          responseJson.data = createAccountStatement;
        }

        const postUserDetails = await User.findOne({ _id: data.user_id }, { user_name: 1, balance: 1 }).session(session).lean();

        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: adminSelfCrDr
          EVENT_DETAILS: self ${data.crdr === DEBIT_TWO ? "debit" : "credit"}
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance}
        `);

      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in createAccountStatementAndUpdateBalance" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, DATA_NULL);
  }
};

let updateUserRecordsOnUpdateBalanceParentAndUserQuery = ({
  parentId, parentAmount, childId, childAmount,
  isBonus, inc_total_deposit_count,
}) => {
  let bonusQuery = [];
  if (isBonus) {
    bonusQuery = [
      {
        "updateOne": {
          "filter": { _id: parentId },
          "update": {
            "$inc": { "bonus": parentAmount }
          }
        }
      },
      {
        "updateOne": {
          "filter": { _id: childId },
          "update": {
            "$inc": { "bonus": childAmount },
          }
        }
      }
    ]
  }

  if (inc_total_deposit_count) {
    bonusQuery.push(...[
      {
        "updateOne": {
          "filter": { _id: childId },
          "update": {
            "$inc": { "total_deposit_count": 1 },
          }
        }
      }
    ])
  }
  return [
    {
      "updateOne": {
        "filter": { _id: parentId },
        "update": {
          "$inc": { "balance": parentAmount }
        }
      }
    },
    {
      "updateOne": {
        "filter": { _id: childId },
        "update": {
          "$inc": { "balance": childAmount, "balance_reference": childAmount },
        }
      }
    },
    ...bonusQuery
  ];
};

let agentsAndUsersCrDr = async (data, userDetail) => {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
      , desc = '', descParent = '';
    if (data.crdr === CREDIT_ONE) {
      if (!data.is_bonus) {
        desc = 'Chips credited from parent';
        descParent = 'Chips credited to ' + userDetail.name + '(' + userDetail.user_name + ')';
      } else {
        desc = 'Bonus credited from parent';
        descParent = 'Bonus credited to ' + userDetail.name + '(' + userDetail.user_name + ')';
      }

      if (data.description != '') {
        desc = desc + ' || ' + data.description;
        descParent = descParent + ' || ' + data.description;
      }

      if (data.belongs_to_credit_reference) {

        if (!data.is_bonus) {
          desc = `Upline ${data.parentName}(${data.parentUserName}) ↠ ${data.name}(${data.user_name})`;
        } else {
          desc = `Upline Bonus ${data.parentName}(${data.parentUserName}) ↠ ${data.name}(${data.user_name})`;
        }

        if (data.parentUserTypeId != USER_TYPE_SUPER_ADMIN) {
          descParent = desc;
        }

        if (data.parentIsChipSummary) {
          data.remark = `${data.remark} ( Chip Summary = ${data.actual_amount} )`;
        }

      }

      if (data.belongs_to) {
        desc = data.description;
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
        amount: -data.amount,
        available_balance: (parseFloat(data.parentCurrentBalance) - parseFloat(data.amount)),
        bonus: !data.is_bonus ? 0 : ((parseFloat(data.parentCurrentBonus) || 0) - parseFloat(data.amount)),
      };
      if (data.belongs_to_credit_reference && data.parentUserTypeId != USER_TYPE_SUPER_ADMIN)
        parent.amount = data.amount;
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
        available_balance: (parseFloat(data.userCurrentBalance) + parseFloat(data.amount)),
        bonus: !data.is_bonus ? 0 : ((parseFloat(data.userCurrentBonus) || 0) + parseFloat(data.amount)),
      };
      await session.withTransaction(async session => {
        try {

          const LOG_REF_CODE = generateReferCode();

          const preUserDetails = await User.find({ $or: [{ _id: data.parent_id }, { _id: data.user_id }] },
            { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();

          logger.BalExp(`
            --PRE LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: agentsAndUsersCrDr
            EVENT_DETAILS: credit
            LOG_REF_CODE: ${LOG_REF_CODE}
            DETAILS: parent[${preUserDetails[0]?.user_name}(${preUserDetails[0]?._id})] old_balance: ${preUserDetails[0]?.balance} - old_liability: ${preUserDetails[0]?.liability} - cal_amount: ${-data.amount} - bonus: ${-data.bonus}
            DETAILS: child[${preUserDetails[1]?.user_name}(${preUserDetails[1]?._id})] old_balance: ${preUserDetails[1]?.balance} - old_liability: ${preUserDetails[1]?.liability} - cal_amount: ${data.amount} - bonus: ${-data.bonus}
          `);

          await User.bulkWrite(updateUserRecordsOnUpdateBalanceParentAndUserQuery({
            parentId: data.parent_id,
            parentAmount: -data.amount,
            childId: data.user_id,
            childAmount: data.amount,
            isBonus: data.is_bonus,
            inc_total_deposit_count: userDetail.belongs_to_b2c && !data.is_bonus,
          }), { session });

          const postUserDetails = await User.find({ $or: [{ _id: data.parent_id }, { _id: data.user_id }] },
            { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();

          logger.BalExp(`
            --POST LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: agentsAndUsersCrDr
            EVENT_DETAILS: credit
            LOG_REF_CODE: ${LOG_REF_CODE}
            DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability} - bonus: ${-data.bonus}
            DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability} - bonus: ${-data.bonus}
          `);

          if ((exponentialToFixed(postUserDetails[1]?.liability) > 0) ? true : (exponentialToFixed(postUserDetails[1]?.balance) < 0) ? true : false) {
            sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id}) : balance ${postUserDetails[1]?.balance}, liability ${postUserDetails[1]?.liability}` });
          }

          await AccountStatement.insertMany([parent, child], { session });
          await session.commitTransaction();
          responseJson.code = SUCCESS;
          responseJson.data = "Balance Updated Successfully...";
        } catch (error) {
          await session.abortTransaction();
          responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
        }
      }, transactionOptions);
    } else if (data.crdr === DEBIT_TWO) {
      desc = 'Chips debited from parent';
      descParent = 'Chips debited ' + userDetail.name + '(' + userDetail.user_name + ')';
      if (data.description != '') {
        desc = desc + ' || ' + data.description;
        descParent = descParent + ' || ' + data.description;
      }

      if (data.belongs_to_credit_reference) {
        desc = `Upline ${data.parentName}(${data.parentUserName}) ↞ ${data.name}(${data.user_name})`;

        if (data.parentUserTypeId != USER_TYPE_SUPER_ADMIN) {
          descParent = desc;
        }

        if (data.parentIsChipSummary) {
          data.remark = `${data.remark} ( Chip Summary = ${data.actual_amount} )`;
        }

      }

      if (data.belongs_to) {
        desc = `Chips debited from parent || Transaction By wallet(op)`;
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

      await session.withTransaction(async session => {
        try {

          const LOG_REF_CODE = generateReferCode();

          const preUserDetails = await User.find({ $or: [{ _id: data.parent_id }, { _id: data.user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

          logger.BalExp(`
            --PRE LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: agentsAndUsersCrDr
            EVENT_DETAILS: debit
            LOG_REF_CODE: ${LOG_REF_CODE}
            DETAILS: parent[${preUserDetails[0]?.user_name}(${preUserDetails[0]?._id})] old_balance: ${preUserDetails[0]?.balance} - old_liability: ${preUserDetails[0]?.liability} - cal_amount: ${data.amount}
            DETAILS: child[${preUserDetails[1]?.user_name}(${preUserDetails[1]?._id})] old_balance: ${preUserDetails[1]?.balance} - old_liability: ${preUserDetails[1]?.liability} - cal_amount: ${-data.amount}
          `);

          await User.bulkWrite(updateUserRecordsOnUpdateBalanceParentAndUserQuery({
            parentId: data.parent_id,
            parentAmount: data.amount,
            childId: data.user_id,
            childAmount: -data.amount,
          }), { session });

          const postUserDetails = await User.find({ $or: [{ _id: data.parent_id }, { _id: data.user_id }] }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

          logger.BalExp(`
            --POST LOG--
            FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
            FUNCTION: agentsAndUsersCrDr
            EVENT_DETAILS: debit
            LOG_REF_CODE: ${LOG_REF_CODE}
            DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability}
            DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability}
          `);

          if ((exponentialToFixed(postUserDetails[1]?.liability) > 0) ? true : (exponentialToFixed(postUserDetails[1]?.balance) < 0) ? true : false) {
            sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id}) : balance ${postUserDetails[1]?.balance}, liability ${postUserDetails[1]?.liability}` });
          }

          await AccountStatement.insertMany([parent, child], { session });
          await session.commitTransaction();
          responseJson.code = SUCCESS;
          responseJson.data = "Balance Updated Successfully...";
        } catch (error) {
          await session.abortTransaction();
          responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
        }
      }, transactionOptions);
    }
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

let chipInOut = async (request) => {
  let { body: data } = request;
  let { user_id, parent_id, remark, amount, crdr, is_bonus } = data;
  parent_id = ObjectId(user_id ? request.user.parent_id :
    (request.User.user_type_id == USER_TYPE_SUPER_ADMIN ? (request.User.user_id || request.User._id) : request.User.parent_id)
  );
  user_id = ObjectId(user_id ? user_id : (request.User.user_id || request.User._id));
  amount = parseFloat(amount);
  let actual_amount = amount;
  let description = `Transaction By ${request.User.name}(${request.User.user_name})`
    , userDetails = data.user_id ? request.user : request.User;

  let parentUserDetails = (

    await commonService.getUserByUserId(parent_id, {
      parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1, balance: 1,
      parent_level_ids: 1, domain_name: 1, point: 1, isChipSummary: 1, bonus: 1
    })

  ).data;

  if (parentUserDetails?.isChipSummary) {
    amount = toFix(amount * 100 / userDetails.partnership);
  }

  if (amount > userDetails.balance && crdr === DEBIT_TWO)
    return resultResponse(SERVER_ERROR, "Insufficient Balance!");

  if (userDetails.user_type_id == USER_TYPE_SUPER_ADMIN) {
    return adminSelfCrDr({
      user_id, parent_id, description, remark, crdr, amount,
      parent_user_name: userDetails.parent_user_name, user_name: userDetails.user_name, name: userDetails.name,
      user_type_id: userDetails.user_type_id, point: userDetails.point, domain_name: userDetails.domain_name,
      parent_level_ids: userDetails.parent_level_ids, userCurrentBalance: userDetails.balance,
      belongs_to_credit_reference: userDetails.belongs_to_credit_reference,
      statement_type: ACCOUNT_STATEMENT_TYPE_CHIPINOUT,
    }).then(adminSelfCrDr => adminSelfCrDr.statusCode === SUCCESS ?
      resultResponse(adminSelfCrDr.statusCode, "Balance Updated Successfully...") :
      resultResponse(adminSelfCrDr.statusCode, adminSelfCrDr.data)
    ).catch(error => resultResponse(SERVER_ERROR, error.message));

  } else {
    if (amount > parentUserDetails.balance && crdr == CREDIT_ONE) {

      return resultResponse(SERVER_ERROR, "Insufficient Balance!");
    } else {
      return agentsAndUsersCrDr({
        description, remark, crdr, amount, actual_amount, is_bonus,
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
        parentCurrentBonus: parentUserDetails.bonus,
        parentIsChipSummary: parentUserDetails?.isChipSummary,
        // Childs fields
        parent_user_name: userDetails.parent_user_name,
        user_id,
        user_type_id: userDetails.user_type_id,
        user_name: userDetails.user_name,
        name: userDetails.name,
        point: userDetails.point,
        domain_name: userDetails.domain_name,
        parent_level_ids: userDetails.parent_level_ids,
        userCurrentBalance: userDetails.balance + -(userDetails.liability),
        userCurrentBonus: userDetails.bonus,
        belongs_to_credit_reference: userDetails.belongs_to_credit_reference,
        statement_type: !is_bonus ? ACCOUNT_STATEMENT_TYPE_CHIPINOUT : ACCOUNT_STATEMENT_TYPE_BONUS,
      }, userDetails)
        .then(agentsAndUsersCrDr => agentsAndUsersCrDr.statusCode == SUCCESS ?
          resultResponse(agentsAndUsersCrDr.statusCode, "Balance Updated Successfully...") :
          resultResponse(agentsAndUsersCrDr.statusCode, agentsAndUsersCrDr.data)
        ).catch(error => resultResponse(SERVER_ERROR, error.message));
    }
  }
}

module.exports = { chipInOut, adminSelfCrDr, agentsAndUsersCrDr }