const AccountStatementService = require('./accountStatementService');

const mongoose = require('mongoose')
  , getCurrentLine = require('get-current-line')
  , { ObjectId } = require("bson")
  , User = require('../../models/user')
  , AccountWalletStatement = require('../../models/accountwalletSatement')
  , BankingMethod = require('../../models/bankingMethod')
  , bankingType = require('../../models/bankingType')
  , AccountStatement = require('../../models/accountStatement')
  , WebsiteSetting = require('../../models/websiteSetting')
  , statementService = require('./statementService')
  , cloudUploadService = require('./cloudUploadService')
  , commonService = require('./commonService')
  , walletServiceQuery = require('./walletServiceQuery')
  , b2cConstants = require("../../utils/b2cConstants")
  , B2CEvent = require('../../lib/node-event').event
  , {
    DEBIT_TWO, CREDIT_ONE,
    SUCCESS, NOT_FOUND, SERVER_ERROR, DATA_NULL, VALIDATION_ERROR,
    LABEL_B2C_MANAGER, ACCOUNT_STATEMENT_TYPE_CHIPINOUT, USER_TYPE_SUPER_ADMIN, USER_TYPE_DEALER,
    ACCOUNT_STATEMENT_TYPE_BONUS
  } = require('../../utils/constants')
  , { removeStaticContent, generateReferCode, exponentialToFixed } = require('../../utils')
  , globalFunction = require('../../utils/globalFunction')
  , logger = require('../../utils/loggers');

let resultResponse = globalFunction.resultResponse;

let walletagentsAndUsersCr = async (data, userDetail) => {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
      , description = '', statement_type = '', images = '', self_host = true, content_meta;
    statement_type = 'DEPOSIT_REQUEST';
    description = 'Balance Deposit Request by: ' + data.user_name;
    if (data.file.filename) {
      images = `wallets/${data.file.filename}`;
      let uploadStatus = await cloudUploadService.uploadToCloud({ file: data.file });
      if (uploadStatus.statusCode == SERVER_ERROR) {
        removeStaticContent(data.file.path);
        throw new Error(uploadStatus.data);
      }
      if (uploadStatus.statusCode == SUCCESS) {
        uploadStatus = uploadStatus.data;
        self_host = false;
        images = uploadStatus.access_url;
        content_meta = { filename: uploadStatus.filename, identifier: uploadStatus.identifier };
      }
    }
    var walletuserData = await User.findOne({ '_id': ObjectId(data.user_id) },
      { domain: 1, domain_name: 1, parent_id: 1, total_deposit_count: 1, belongs_to_b2c: 1, user_type_id: 1 });

    //Fetch Bonus Percentage based on Deposit Count
    let bonusPercentage = 0;
    let bonus_data_obj = null;
    if (walletuserData.belongs_to_b2c) {
      const bonusRes = await AccountStatementService.getDepositCountandBonusData({
        domain_name: walletuserData.domain_name,
        user_id: walletuserData._id,
        total_deposit_count: walletuserData.total_deposit_count,
      });
      bonusPercentage = bonusRes.bonusPercentage;
      bonus_data_obj = bonusRes.bonus_data_obj;
    }

    var walletagents;
    var payment_deatails;
    let dealerData = await findB2CDealer(userDetail.parent_level_ids);
    if (dealerData) {
      walletagents = [dealerData]
      payment_deatails = await bankingType.findOne({ 'method_id': ObjectId(data.payment_method_id), user_id: ObjectId(dealerData), deleted: false, status: true, is_b2c_dealer: true }).select("method_name bank_holder_name bank_name ifsc_code account_no others");
      if (!payment_deatails)
        return resultResponse(responseJson.code, "Please contact upline dealer.");
    } else {
      walletagents = await User.distinct('_id', { 'belongs_to': LABEL_B2C_MANAGER, domain_assign_list: ObjectId(walletuserData.domain) });
      payment_deatails = await bankingType.findOne({
        method_id: ObjectId(data.payment_method_id),
        deleted: false,
        status: true,
        $or: [
          { is_b2c_dealer: { $exists: false } },
          { is_b2c_dealer: false }
        ]
      }).select("method_name bank_holder_name bank_name ifsc_code account_no others");
      if (!payment_deatails)
        return resultResponse(responseJson.code, "Please contact upline operator.");
    }
    let account_info_details = {
      method_name: payment_deatails.method_name === "-" ? undefined : payment_deatails.method_name,
      bank_holder_name: payment_deatails.bank_holder_name === "-" ? undefined : payment_deatails.bank_holder_name,
      bank_name: payment_deatails.bank_name === "-" ? undefined : payment_deatails.bank_name,
      ifsc_code: payment_deatails.ifsc_code === "-" ? undefined : payment_deatails.ifsc_code,
      account_no: payment_deatails.account_no === "-" ? undefined : payment_deatails.account_no,
      others: payment_deatails.others === "-" ? undefined : payment_deatails.others,
    }


    let parent = {
      parent_id: data.parent_id,
      agent_id: walletuserData.parent_id,
      parent_user_name: data.parentUserName,
      user_id: data.user_id,
      user_type_id: data.user_type_id,
      user_name: data.user_name,
      name: data.name,
      mobile: data.mobile,
      country_code: data.country_code,
      domain: walletuserData.domain,
      domain_name: walletuserData.domain_name,
      point: data.parentPoint,
      user_reference_no: data?.user_reference_no,
      amount: data.amount,
      bonus: exponentialToFixed(data.amount * bonusPercentage / 100),
      bonus_data_obj,
      parents: data.parent_level_ids,
      images, walletagents, description, statement_type, self_host, content_meta,
      payment_deatails, account_info_details,
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
        responseJson.code = SUCCESS;
        responseJson.data = new_wallet_statement;
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

let walletagentsAndUsersDr = async (data, userDetail) => {
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
    desc = 'Balance Withdraw Request by: ' + data.user_name;
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
        data.req.body.description = 'Transaction By wallet(op)';
        await chipwalletInOut(data.req.body, agentData, data.res);
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
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

async function chipwalletInOut(data, userDetails, res) {
  let { user_id, parent_id, remark, amount, crdr, description, is_bonus } = data;
  if (amount > userDetails.balance && crdr === DEBIT_TWO)
    return 0;
  if (userDetails.user_type_id == USER_TYPE_SUPER_ADMIN) {
    return statementService.adminSelfCrDr({
      user_id, parent_id, description, remark, crdr, amount,
      parent_user_name: userDetails.parent_user_name, user_name: userDetails.user_name, name: userDetails.name,
      user_type_id: userDetails.user_type_id, point: userDetails.point, domain_name: userDetails.domain_name,
      parent_level_ids: userDetails.parent_level_ids, userCurrentBalance: userDetails.balance,
      statement_type: ACCOUNT_STATEMENT_TYPE_CHIPINOUT,
    }).then(async adminSelfCrDr => adminSelfCrDr.statusCode === SUCCESS ? 1 : 0)
      .catch(error => error);
  } else {
    let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
      parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
      balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, bonus: 1,
    })).data;
    if (amount > parentUserDetails.balance && crdr == CREDIT_ONE)
      return '';
    else {
      return statementService.agentsAndUsersCrDr({
        description, remark, crdr, amount, is_bonus,
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
        userCurrentBonus: userDetails.bonus,
        belongs_to_credit_reference: userDetails.belongs_to_credit_reference,
        statement_type: !is_bonus ? ACCOUNT_STATEMENT_TYPE_CHIPINOUT : ACCOUNT_STATEMENT_TYPE_BONUS,
      }, userDetails)
        .then(agentsAndUsersCrDr => agentsAndUsersCrDr.statusCode == SUCCESS ? 1 : 0)
        .catch(error => error);
    }
  }
  ;
}

let getwalletTransactionRequest = async (data, userDetail) => {
  let skip = (data.page - 1) * data.limit;
  let filter = { statement_type: data.statement_type, walletagents: ObjectId(data.user_id), status: data.status }
  if (data.search) {
    if (data.search.user_name) {
      filter.user_name = data.search.user_name;
    }
    if (data.search.parent_user_name) {
      filter.parent_user_name = data.search.parent_user_name;
    }
    if (data.search.mobile) {
      filter.mobile = data.search.mobile;
    }
    if (data.search.amount) {
      filter.amount = data.search.amount;
    }
  }
  // Handling Sorting Dynamically
  let sortConditions = (data.sort && Object.keys(data.sort).length > 0) ? data.sort : { created_at: -1 };
  // Find total count first
  const totalCount = await AccountWalletStatement.countDocuments(filter);
  return AccountWalletStatement
    .find(filter, {
      name: 1, parent_user_name: 1, domain_name: 1, amount: 1, images: 1, self_host: 1, payment_deatails: 1, generated_at: 1,
      created_at: 1, is_signup_credit: 1, user_name: 1, mobile: 1, user_id: 1, parent_id: 1, country_code: 1, user_reference_no: 1,
      bonus: 1, bonus_data_obj: 1,
    }).skip(skip)
    .limit(data.limit)
    .sort(sortConditions)
    .then(transactionList => {
      if (transactionList.length) {
        const response = {
          totalCount: totalCount,
          transactions: transactionList
        };
        response.metadata = { "total": totalCount, "page": data.page }
        return resultResponse(SUCCESS, response);
      } else {
        return resultResponse(NOT_FOUND, "Transaction list is empty. No transactions found!");
      }
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getwalletAllTransactionRequest = async (data, userDetail) => {
  let query = walletServiceQuery.getwalletAllTransactionRequestQuery(data);
  return AccountWalletStatement.aggregate(query).then(transactionList => {
    if (transactionList.length)
      return resultResponse(SUCCESS, transactionList);
    else
      return resultResponse(NOT_FOUND, "transaction list is empty, No transaction found!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getwalletdepositpreviewRequest = async (data, userDetail) => {
  return AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) }, { payment_deatails: 1, status: 1, name: 1, created_at: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1 })
    .then(previewdespositList => {
      return resultResponse(SUCCESS, previewdespositList);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let depositrejectedRequest = async (data, userDetail) => {
  return AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) }, { status: 1, name: 1, created_at: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1 })
    .then(previewdespositList => {
      if (previewdespositList.status === "ACCEPTED")
        return resultResponse(SERVER_ERROR, "Not allowed, Already accepted!");
      if (previewdespositList.status === "REJECTED")
        return resultResponse(SERVER_ERROR, "Not allowed, Already rejected!");
      return User.findOne({ '_id': ObjectId(data.user_id) }, { name: 1 })
        .then(dbUser => {
          if (previewdespositList) {
            return AccountWalletStatement.updateOne(
              {
                '_id': ObjectId(data.statement_id)
              },
              {
                "$set": { verify_by: dbUser.name, status: 'REJECTED', remark: data.remark }
              },
              { upsert: true, setDefaultsOnInsert: true }
            )
              .then(dbUpdate => {
                return resultResponse(SUCCESS, previewdespositList);
              }).catch(error => resultResponse(SERVER_ERROR, error.message));

          }
        }).catch(error => resultResponse(SERVER_ERROR, error.message));
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let withdrawacceptedRequest = async (data, userDetail) => {
  const accDetail = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) }, { user_name: 1, status: 1, name: 1, created_at: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1 })
  if (accDetail) {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
    statement_type = 'DEPOSIT_REQUEST';
    description = 'Balance Withdraw Request by:wallet | account from :' + accDetail.user_name;
    if (accDetail.status === "ACCEPTED") {
      responseJson.code = SERVER_ERROR;
      responseJson.data = 'Not allowed, Already accepted!';
      return resultResponse(responseJson.code, responseJson.data);
    }
    var walletuserData = await User.findOne({ '_id': ObjectId(data.user_id) });
    if (accDetail.amount > walletuserData.balance) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = 'Operator Blance Low';
      return resultResponse(responseJson.code, responseJson.data);
    }
    let images = '', self_host = false, content_meta;
    if (data.file) {
      images = data.file.filename;
      let uploadStatus = await cloudUploadService.uploadToCloud({ file: data.file });
      if (uploadStatus.statusCode == SERVER_ERROR) {
        removeStaticContent(data.file.path);
        throw new Error(uploadStatus.data);
      }
      if (uploadStatus.statusCode == SUCCESS) {
        uploadStatus = uploadStatus.data;
        self_host = false;
        images = uploadStatus.access_url;
        content_meta = { filename: uploadStatus.filename, identifier: uploadStatus.identifier };
      }
    }
    let parent = {
      parent_id: walletuserData.parent_id,
      parent_user_name: walletuserData.parent_user_name,
      user_id: walletuserData._id,
      user_type_id: walletuserData.user_type_id,
      user_name: walletuserData.user_name,
      name: walletuserData.name,
      domain_name: walletuserData.domain_name,
      agents: data.parent_level_ids,
      point: data.point,
      remark: data.remark,
      statement_type: data.statement_type,
      description, images, self_host, content_meta,
      amount: -1 * accDetail.amount,
      credit_debit: -1 * accDetail.amount,
      available_balance: (parseFloat(walletuserData.balance) - parseFloat(accDetail.amount)),
    };
    await AccountStatement.insertMany([parent]);
    let amount = parseInt(accDetail.amount);

    const LOG_REF_CODE = generateReferCode();

    const preUserDetails = await User.findOne({ _id: ObjectId(data.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();

    logger.BalExp(`
      --PRE LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequest
      EVENT_DETAILS: Withdraw Accepted B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - old_liability: ${preUserDetails?.liability} - cal_amount: ${-1 * amount}
    `);

    await User.updateOne(
      { '_id': ObjectId(data.user_id) },
      { "$inc": { balance: -1 * amount, "total_withdraw": amount } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const postUserDetails = await User.findOne({ _id: ObjectId(data.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();

    logger.BalExp(`
      --POST LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequest
      EVENT_DETAILS: Withdraw Accepted B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance} - new_liability: ${postUserDetails?.liability}
    `);

    if ((exponentialToFixed(postUserDetails?.liability) > 0) ? true : (exponentialToFixed(postUserDetails?.balance) < 0) ? true : false) {
      sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails?.user_name}(${postUserDetails?._id}) : balance ${postUserDetails?.balance}, liability ${postUserDetails?.liability}` });
    }

    return AccountWalletStatement.updateOne(
      { '_id': ObjectId(data.statement_id) },
      { "$set": { verify_by: walletuserData.name, status: 'ACCEPTED' } },
      { upsert: true, setDefaultsOnInsert: true }
    ).then(() => resultResponse(SUCCESS, walletuserData)).catch(error => resultResponse(SERVER_ERROR, error.message))
  } return resultResponse(NOT_FOUND, "Entry not found!");
};

let withdrawrejectedRequest = async (data, userDetail) => {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
    const accountstatement = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) });
    const walletData = await User.findOne({ '_id': ObjectId(data.user_id) });
    const userData = await User.findOne({ '_id': ObjectId(accountstatement.user_id) })
    let remark = '';
    if (data.remark) {
      remark = data.remark;
    }
    else {
      remark = 'wallet';
    }
    await session.withTransaction(async session => {
      try {
        data.req.body.parent_id = accountstatement.parent_id;
        data.req.body.user_id = accountstatement.user_id;
        data.req.body.amount = accountstatement.amount;
        data.req.body.crdr = 1;
        data.req.body.remark = remark;
        data.req.body.description = 'Chips credited from parent || Transaction By ' + walletData.user_name + '(op)';
        await chipwalletInOut(data.req.body, userData, data.res);
        await AccountWalletStatement.updateOne({
          _id: accountstatement._id,
        }, { "$set": { verify_by: walletData.name, status: 'REJECTED' } }, { session });
        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = "Deposit Request  Successfully...";
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParent" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

let depositAccepetedRequest = async (data, userDetail) => {
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
    desc = 'Balance DEPOSIT Request by wallet: account from : ' + userDetail.user_name;
    var walletuserData = await User.findOne({ '_id': ObjectId(userDetail._id) });
    var statement_preview = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id), status: "PENDING" });
    if (!statement_preview) {
      responseJson.code = SERVER_ERROR;
      return resultResponse(SERVER_ERROR, "Not allowed, Already accepted!");
    }
    var reference_exist = await AccountWalletStatement.findOne({ 'reference_no': data.reference_no, amount: statement_preview.amount }).select("_id");
    var userData = await User.findOne({ '_id': ObjectId(statement_preview.user_id) });
    var parentData = await User.findOne({ '_id': ObjectId(userData.parent_id) });

    // Set bonus variable;
    const bonus_amount = (statement_preview?.bonus || 0);

    if ((statement_preview.amount + bonus_amount) > parentData.balance) {
      responseJson.code = SERVER_ERROR;
      return resultResponse(SERVER_ERROR, "Parent Balance Low!");
    }
    if (reference_exist) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "Reference No already exist";
      return resultResponse(responseJson.code, responseJson.data);
    }
    if (!statement_preview) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "Data No Exist";
      return resultResponse(responseJson.code, responseJson.data);
    }
    let parent = {
      parent_id: walletuserData.parent_id,
      parent_user_name: walletuserData.parent_user_name,
      user_id: walletuserData._id,
      user_type_id: walletuserData.user_type_id,
      user_name: walletuserData.user_name,
      name: walletuserData.name,
      domain_name: walletuserData.domain_name,
      agents: data.parent_level_ids,
      point: data.point,
      description: desc,
      remark: data.remark,
      statement_type: data.statement_type,
      credit_debit: statement_preview.amount,
      amount: statement_preview.amount,
      available_balance: (parseFloat(walletuserData.balance) + parseFloat(statement_preview.amount)),
    };
    await session.withTransaction(async session => {
      try {
        await AccountStatement.insertMany([parent], { session });
        data.req.body.user_id = statement_preview.user_id;
        data.req.body.parent_id = statement_preview.parent_id;
        data.req.body.crdr = 1;
        data.req.body.amount = statement_preview.amount;
        data.req.body.remark = 'wallet';
        data.req.body.description = 'Chips credited  from parent || Transaction By ' + walletuserData.user_name + '(op)';
        await chipwalletInOut(data.req.body, userData, data.res);

        // Bonus
        if (bonus_amount) {
          data.req.body.user_id = statement_preview.user_id;
          data.req.body.parent_id = statement_preview.parent_id;
          data.req.body.crdr = 1;
          data.req.body.amount = bonus_amount;
          data.req.body.remark = 'Bonus';
          data.req.body.description = 'Bonus credited  from parent || Transaction By ' + walletuserData.user_name + '(op)';
          data.req.body.is_bonus = true;

          const userData = await User.findOne({ '_id': ObjectId(statement_preview.user_id) });
          await chipwalletInOut(data.req.body, userData, data.res);
        }

        const LOG_REF_CODE = generateReferCode();

        const preUserDetails = await User.findOne({ _id: walletuserData._id }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: depositAccepetedRequest
          EVENT_DETAILS: B2C
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - old_liability: ${preUserDetails?.liability} - cal_amount: ${statement_preview.amount}
        `);

        await User.updateOne({
          _id: walletuserData._id,
        }, { "$inc": { "balance": statement_preview.amount, "total_deposit": statement_preview.amount } }, { session });

        const postUserDetails = await User.findOne({ _id: walletuserData._id }, { user_name: 1, balance: 1, liability: 1 }).session(session).lean();

        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: depositAccepetedRequest
          EVENT_DETAILS: B2C
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance} - new_liability: ${postUserDetails?.liability}
        `);

        if ((exponentialToFixed(postUserDetails?.liability) > 0) ? true : (exponentialToFixed(postUserDetails?.balance) < 0) ? true : false) {
          sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails?.user_name}(${postUserDetails?._id}) : balance ${postUserDetails?.balance}, liability ${postUserDetails?.liability}` });
        }

        await AccountWalletStatement.updateOne({
          _id: data.statement_id,
        }, { "$set": { "reference_no": data.reference_no, 'status': 'ACCEPTED' } }, { session });
        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = "Deposit Request  Successfully...";
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParent" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};



let createBankingMethod = async (data, userDetail) => {
  let userDetails = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain_assign_list: 1, parent_id: 1, user_name: 1, parent_user_name: 1 });
  let existBankingMethod = await BankingMethod.findOne({ user_id: ObjectId(data.user_id), type: data.type, category: data.category });
  if (existBankingMethod) {
    return resultResponse(VALIDATION_ERROR, "Banking method already exist!");
  }
  let image = `${(data.category).toUpperCase()}.png`;
  let method = {
    parent_id: userDetails.parent_id,
    parent_name: userDetails.parent_user_name,
    user_id: userDetails._id,
    domain_method_assign_list: userDetails.domain_assign_list,
    user_name: userDetails.user_name,
    type: data.type,
    category: data.category,
    name: data.name,
    image,
  };
  return await BankingMethod.insertMany([method])
    .then(dbUpdate => {
      return resultResponse(SUCCESS, dbUpdate);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let editBankingMethod = async (data, userDetail) => {
  return await BankingMethod.updateOne(
    {
      '_id': ObjectId(data.id)
    },
    {
      "$set": { name: data.name }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => {
    return resultResponse(SUCCESS, dbUpdate);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let createBankType = async (data) => {
  let userDetails = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain_assign_list: 1, parent_id: 1, user_name: 1, parent_user_name: 1, user_type_id: 1, is_dealer: 1, domain: 1, domain_name: 1 });
  let BankingMethods = await BankingMethod.findOne({ '_id': ObjectId(data.method_id) }, { name: 1 });
  let existBankingType = await bankingType.findOne({ $and: [{ user_id: ObjectId(data.user_id), bank_name: data.bank_name, ifsc_code: data.ifsc_code, account_no: data.account_no }, { user_id: ObjectId(data.user_id), others: data.others }] });
  if (existBankingType)
    return resultResponse(VALIDATION_ERROR, "Manage banking type already exist!");
  let payment_qr = await uploadPaymentQR(data);
  if (payment_qr.statusCode != SUCCESS)
    return resultResponse(SERVER_ERROR, payment_qr.data);
  payment_qr = payment_qr.data;
  let method = {
    parent_id: userDetails.parent_id, parent_name: userDetails.parent_user_name, user_id: ObjectId(userDetails._id), user_name: userDetails.user_name, domain_type_assign_list: userDetails.domain_assign_list,
    method_id: ObjectId(data.method_id), bank_name: data.bank_name, bank_holder_name: data.bank_holder_name, ifsc_code: data.ifsc_code, account_no: data.account_no, others: data.others,
    method_name: BankingMethods.name,
    ...payment_qr, type: "1", status: false,
  };
  return await bankingType.create(method)
    .then(async (dbUpdate) => {
      // After creation, update additional fields
      if (userDetails.user_type_id == USER_TYPE_DEALER && userDetails.is_dealer) {
        let updatedBankType = await bankingType.findByIdAndUpdate(
          dbUpdate._id,
          {
            domain_type_name: userDetails.domain_name,
            domain_type_id: userDetails.domain,
            operator_assign_list_name: userDetails.user_name,
            operator_assign_list_id: userDetails._id,
            domain_type_assign_list: [userDetails.domain],
            is_b2c_dealer: userDetails.is_dealer,
            status: true
          }
        );
        // Check if dealer entry already exists in the b2c_dealers array
        let bankingMethod = await BankingMethod.findOne({ '_id': ObjectId(data.method_id) }, { b2c_dealers: 1 });
        if (bankingMethod) {
          let existingDealer = bankingMethod.b2c_dealers.find(dealer => String(dealer.user_id) === String(userDetails._id));
          if (existingDealer) {
            // If the dealer already exists, increment the banktypeCount dynamically
            await BankingMethod.updateOne(
              { '_id': ObjectId(data.method_id), 'b2c_dealers.user_id': userDetails._id },
              { $inc: { 'b2c_dealers.$.banktypeCount': 1 } } // Increment the count by 1
            );
          } else {
            // If the dealer doesn't exist, add them to the b2c_dealers array with banktypeCount set to 1
            await BankingMethod.updateOne(
              { '_id': ObjectId(data.method_id) },
              {
                $push: {
                  b2c_dealers: {
                    user_id: userDetails._id,
                    user_name: userDetails.user_name,
                    domain_id: userDetails.domain,
                    domain_name: userDetails.domain_name,
                    banktypeCount: 1 // Start the count at 1 for the new dealer
                  }
                }
              }
            );
          }
        }
      }
      return resultResponse(SUCCESS, 'Banking details added successfully.');
    })
    .catch(error => resultResponse(SERVER_ERROR, error.message));
};

async function uploadPaymentQR(data) {
  try {
    let payment_qr, self_host, content_meta;
    if (data?.file) {
      payment_qr = `payment_qr/${data.file.filename}`;
      self_host = true;
      let uploadStatus = await cloudUploadService.uploadToCloud({ file: data.file });
      if (uploadStatus.statusCode == SERVER_ERROR) {
        removeStaticContent(data.file.path);
        throw new Error(uploadStatus.data);
      }
      if (uploadStatus.statusCode == SUCCESS) {
        uploadStatus = uploadStatus.data;
        self_host = false;
        payment_qr = uploadStatus.access_url;
        content_meta = { filename: uploadStatus.filename, identifier: uploadStatus.identifier };
      }
    }
    return resultResponse(SUCCESS, { payment_qr, self_host, content_meta });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let createPaymentMethod = async (data, userDetail) => {
  let userDetails = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain_name: 1, parent_id: 1, user_name: 1, parent_user_name: 1 });
  let BankingMethods = await BankingMethod.findOne({ '_id': ObjectId(data.method_id) }, { name: 1 });
  let method = {
    parent_id: userDetails.parent_id,
    "parent_name": userDetails.parent_user_name,
    "method_id": ObjectId(data.method_id),
    domain_type_assign_list: userDetails.domain_name,
    user_name: userDetails.user_name,
    user_id: ObjectId(userDetails._id),
    "bank_name": data.bank_name,
    "method_name": BankingMethods.name,
    "bank_holder_name": data.bank_holder_name,
    "ifsc_code": data.ifsc_code,
    "type": "2",
    "account_no": data.account_no,
    "others": data.others,
    "mobile_no": data.mobile_no,
    "status": true
  };
  return await bankingType.insertMany([method])
    .then(dbUpdate => {
      return resultResponse(SUCCESS, dbUpdate);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getBankMethods = async (data) => {
  try {
    let userData = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain_assign_list: 1, parent_id: 1, domain: 1, user_type_id: 1 })
      , filter;
    if (userData.user_type_id == 4)
      if (data.status == '1')
        filter = { user_id: ObjectId(data.user_id) };
      else
        filter = { user_id: ObjectId(data.user_id), status: true, type: data.type };
    else
      if (data.status == '1')
        filter = { user_id: ObjectId(userData.parent_id), domain_method_assign_list: { $in: userData.domain_assign_list } };
      else
        filter = { status: true, type: data.type, user_id: ObjectId(userData.parent_id), domain_method_assign_list: { $in: userData.domain_assign_list } };
    if (userData.user_type_id == 2)
      filter = { status: true, type: data.type, domain_method_assign_list: { $in: userData.domain } };
    if (userData.user_type_id != '4')
      filter = { $and: [filter, { $or: [{ deleted: { $exists: false } }, { deleted: false }] }] };
    return BankingMethod.find(filter).then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
  } catch (error) { resultResponse(SERVER_ERROR, error.message) }
};

let getBankdetails = async (data, userDetail) => {
  let userData = await User.findOne({ '_id': ObjectId(data.user_id) }, { user_id: 1, parent_id: 1, user_name: 1, domain: 1, user_type_id: 1 });
  let filter;
  if (userData.user_type_id == 4) {
    filter = {
      $or: [{ user_id: ObjectId(data.user_id) },
      { parent_id: ObjectId(data.user_id) }]
    }
  }
  else if (userData.user_type_id == 15) {
    filter = { user_id: ObjectId(userData.user_id) }
  }
  else if (userData.user_type_id == 14) {
    filter = { operator_assign_list_name: userData.user_name }
  }
  else if (userData.user_type_id == 2) {
    filter = { user_id: ObjectId(userData._id) }
  }
  else {
    filter = { domain_type_assign_list: ObjectId(userData.domain) }
  }
  if (data.is_delete)
    filter = { $and: [filter, { deleted: true }] };

  if (userDetail.user_type_id != '4' && !data.is_delete)
    filter = { $and: [filter, { $or: [{ deleted: { $exists: false } }, { deleted: false }] }] };

  return await bankingType.find(filter).sort({ created_at: -1 })
    .then(getData => {
      return resultResponse(SUCCESS, getData);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getwalletBankDetail = async (data, userDetail) => {
  let filter = { deleted: false, "type": "2", user_id: ObjectId(data.user_id), method_id: ObjectId(data.method_id) }
  return await bankingType.find(filter)
    .then(getData => {
      return resultResponse(SUCCESS, getData);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getParentPayementDetails = async (data, userDetail) => {
  let filter = { method_id: ObjectId(data.method_id), operator_assign_list_name: { $ne: null }, domain_type_id: ObjectId(data.domain_id), type: "1", deleted: false, status: true }
    , fields = { bank_holder_name: 1, method_name: 1, bank_name: 1, ifsc_code: 1, others: 1, account_no: 1, method_id: 1, user_id: 1, payment_qr: 1, self_host: 1 }
  let dealerData = await findB2CDealer(userDetail.parent_level_ids);
  if (dealerData) {
    // If dealerData exists, add filters for B2C dealers
    filter.operator_assign_list_id = ObjectId(dealerData); // Include the dealer ID in the filter
    filter.is_b2c_dealer = true; // Only fetch records where is_b2c_dealer is true
  } else {
    // If dealerData does not exist, include records with is_b2c_dealer not set or false
    filter = {
      ...filter, // Retain the existing filters
      $or: [
        { is_b2c_dealer: { $exists: false } },
        { is_b2c_dealer: false }
      ]
    };
  }
  return bankingType.find(filter, fields).then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getPayementMethod = async (data, userDetail) => {
  let filter;
  if (data.type === "WITHDRAW") {
    filter = { domain_method_assign_list: ObjectId(data.domain_id), status: true, type: data.type }
  }
  else {
    filter = { domain_method_assign_list: ObjectId(data.domain_id), status: true, type: data.type, methodTypeCount: { $gt: 0 } }
    let dealerData = await findB2CDealer(userDetail.parent_level_ids);
    if (dealerData) {
      delete filter.methodTypeCount;
      filter = {
        ...filter,
        b2c_dealers: {
          $elemMatch: {
            user_id: ObjectId(dealerData), // Check if the dealer ID exists
            banktypeCount: { $gt: 0 } // Ensure banktypeCount is greater than 0
          }
        }
      };
    }
  }
  filter = { $and: [filter, { $or: [{ deleted: { $exists: false } }, { deleted: false }] }] };
  return await BankingMethod.find(filter, { _id: 1, category: 1, user_id: 1, name: 1, image: 1, user_name: 1 })
    .then(async getData => resultResponse(getData.length ? SUCCESS : NOT_FOUND, getData.length ? getData : "No banking method is available at the moment. Please contact your upline for further assistance."))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
};

let findB2CDealer = async (usersArray) => {
  // Find the user with user_type_id 2
  const userWithType2 = usersArray.find(user => user.user_type_id === USER_TYPE_DEALER);
  if (!userWithType2) {
    return null; // No user with user_type_id 2 found
  }
  // Fetch the user details from the User collection to check is_b2c_dealer
  const user = await User.findOne({ _id: ObjectId(userWithType2.user_id), is_b2c_dealer: true }, { is_b2c_dealer: 1 });
  // Check if the user is marked as a B2C dealer
  if (user && user.is_b2c_dealer) {
    return user._id; // Return the user_id if is_b2c_dealer is true
  }
  return null; // Return null if user is not a B2C dealer
};

let updatePaymentMethod = async (data, userDetail) => {
  return BankingMethod.updateOne(
    {
      '_id': ObjectId(data.method_id)
    },
    {
      "$set": { status: data.status }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

const updatePayment = async (data, userDetail) => {
  try {
    const dbUpdate = await bankingType.findOneAndUpdate(
      { '_id': ObjectId(data.id) },
      { "$set": { status: data.status } }
    ).select("method_id");
    // If user is a B2C dealer, update the dealer's banktypeCount
    if (userDetail.user_type_id === USER_TYPE_DEALER) {
      const incrementValue = data.status ? 1 : -1;
      const banktypeUpdateResult = await BankingMethod.updateOne(
        {
          '_id': ObjectId(dbUpdate.method_id),
          "b2c_dealers.user_id": ObjectId(data.user_id)
        },
        [
          {
            $set: {
              "b2c_dealers": {
                $map: {
                  input: "$b2c_dealers",
                  as: "dealer",
                  in: {
                    $mergeObjects: [
                      "$$dealer",
                      {
                        banktypeCount: {
                          $cond: {
                            if: { $eq: ["$$dealer.user_id", ObjectId(data.user_id)] },
                            then: { $max: [{ $add: ["$$dealer.banktypeCount", incrementValue] }, 0] },
                            else: "$$dealer.banktypeCount"
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      );
    }
    return resultResponse(SUCCESS, data.status ? 'Bank details activated.' : 'Bank details deactivated.'); // Returns the updated document in `dbUpdate`
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

let updateacceptProgress = async (data, userDetail) => {
  return AccountWalletStatement.updateOne(
    {
      '_id': ObjectId(data.id)
    },
    {
      "$set": { status: 'PROGRESS', pendingstatus: 1 }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let assigndomainMethod = async (data, userDetail) => {
  return bankingType.updateOne(
    {
      '_id': ObjectId(data.id)
    },
    {
      "$set": { domain_type_name: data.domain_name, domain_type_id: ObjectId(data.domain_id) }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let assignoperatorMethod = async (data, userDetail) => {
  return bankingType.updateOne(
    {
      '_id': ObjectId(data.id)
    },
    {
      "$set": { operator_assign_list_name: data.operator_name, operator_assign_list_id: ObjectId(data.operator_id) }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getprogesswithdrawList = async (data, userDetail) => {
  let { page, limit, search } = data;
  let skip = (page - 1) * limit;
  let filter = { 'status': 'PROGRESS', pendingstatus: data.status, walletagents: ObjectId(data.user_id) }
  if (search) {
    if (search.constructor.name === "Object") {
      Object.assign(filter, search);
    }
  }
  // Handling Sorting Dynamically
  let sortConditions = (data.sort && Object.keys(data.sort).length > 0) ? data.sort : { created_at: -1 };
  const totalCount = await AccountWalletStatement.countDocuments(filter);
  return await AccountWalletStatement
    .find(filter, { status: 1, payment_deatails: 1, user_id: 1, user_name: 1, name: 1, created_at: 1, payment_deatails: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1, mobile: 1 })
    .skip(skip)
    .limit(data.limit)
    .sort(sortConditions)
    .then(getData => {
      const response = {
        totalCount: totalCount,
        transactions: getData
      };
      return resultResponse(SUCCESS, response);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let traderwithdrawlist = async (data, userDetail) => {
  let filter;
  if (data.status == 'ALL')
    filter = { trader_assign_withdraw_request: ObjectId(data.user_id), status: { $in: ["ACCEPTED", "REJECTED"] } }
  else
    filter = { trader_assign_withdraw_request: ObjectId(data.user_id), status: data.status }
  // Handling Sorting Dynamically
  let sortConditions = (data.sort && Object.keys(data.sort).length > 0) ? data.sort : { created_at: -1 };
  return await AccountWalletStatement
    .find(filter, { status: 1, payment_deatails: 1, user_id: 1, user_name: 1, name: 1, created_at: 1, payment_deatails: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1 })
    .sort(sortConditions)
    .limit(data.limit)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getuserpayment = async (data, userDetail) => {
  let filter = { 'status': true, user_id: ObjectId(data.id) }
  return await bankingType.find(filter)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let withdrawprocces = async (data, userDetail) => {
  let userData = await User.findOne({ '_id': ObjectId(data.user_id) }, { user_name: 1, user_type_id: 1 });
  let bankingTypeData = await bankingType.findOne({ '_id': ObjectId(data.method_id) });
  let accountInfoData = {
    bank_holder_name: bankingTypeData.bank_holder_name === null ? undefined : bankingTypeData.bank_holder_name,
    account_no: bankingTypeData.account_no === null ? undefined : bankingTypeData.account_no,
    ifsc_code: bankingTypeData.ifsc_code === null ? undefined : bankingTypeData.ifsc_code,
    bank_name: bankingTypeData.bank_name === null ? undefined : bankingTypeData.bank_name,
    others: bankingTypeData.others === null ? undefined : bankingTypeData.others,
    method_name: bankingTypeData.method_name === null ? undefined : bankingTypeData.method_name,
  }
  let update = { payment_deatails: bankingTypeData, trader_assign_withdraw_request_name: userData.user_name, pendingstatus: 2, trader_assign_withdraw_request: ObjectId(data.operator_id), account_info_details: accountInfoData };
  if (data.is_b2c_dealer) {
    update.status = "PROGRESS";
  }
  return AccountWalletStatement.updateOne(
    {
      '_id': ObjectId(data.statement_id)
    },
    {
      "$set": update
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => {
    if (!data.is_b2c_dealer) {
      return resultResponse(SUCCESS, dbUpdate)
    }
  }
  ).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getwalletsummary = async (data, userDetail) => {
  let skip = (data.page - 1) * data.limit;
  let filter = {};
  let filterCount = {};
  if (data.type) {
    filter = { user_id: ObjectId(data.user_id), statement_type: data.type }
    filterCount = { user_id: ObjectId(data.user_id), statement_type: data.type }
  }
  else {
    filter = { user_id: ObjectId(data.user_id) }
    filterCount = { user_id: ObjectId(data.user_id) }
  }
  if (data.from_date && data.from_date) {
    let from_date = new Date(data.from_date);
    let to_date = new Date(data.to_date);
    filter.created_at = {
      '$gte': from_date,
      '$lte': to_date
    }
  }
  let totalexposure = await AccountWalletStatement.aggregate([{ $match: { user_id: ObjectId(data.user_id), statement_type: "WITHDRAW_REQUEST", status: { $nin: ['PENDING', 'PROGRESS'] } } }, {
    $group: {
      _id: null,
      total: {
        $sum: "$amount"
      }
    }
  }])
  let totalCount = await AccountWalletStatement.count(filterCount);
  return await AccountWalletStatement.find(filter, { amount: 1, generated_at: 1, payment_deatails: 1, statement_type: 1, status: 1, parent_user_name: 1, user_name: 1, images: 1, description: 1, remark: 1 }).sort({ created_at: -1 }).skip(skip).limit(data.limit)
    .then(getData => {
      let dataall = { total: totalCount, totalexposure: totalexposure, getData: getData }
      return resultResponse(SUCCESS, dataall);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let setcreditlimit = async (data, userDetail) => {
  return User.updateOne(
    {
      '_id': ObjectId(data.user_id)
    },
    {
      "$set": { credit_reference: data.creditlimit }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let removePaymentDetails = async (data, userDetail) => {
  return bankingType.updateOne(
    {
      '_id': ObjectId(data._id)
    },
    {
      "$set": { deleted: true }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getuserpayementList = async (data, userDetail) => {
  let filter = { user_id: ObjectId(data.user_id) }
  if (data.payment_method_status) {
    filter.status = true;
  }
  return await bankingType.find(filter)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let checkrequest = async (data, userDetail) => {
  let filter = { user_id: ObjectId(data.user_id), 'statement_type': data.statement_type, status: { $nin: ['REJECTED', 'ACCEPTED'] } }
  return await AccountWalletStatement.findOne(filter, { user_name: 1 })
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let domainselfassign = async (data, userDetail) => {
  let webData = await WebsiteSetting.distinct('host_name', { '_id': { $in: data.domain_id } })
  let domainList = [];
  for (var i = 0; i < data.domain_id.length; i++) {
    domainList.push(ObjectId(data.domain_id[i]));
  }
  await BankingMethod.updateMany(
    {
      'user_id': ObjectId(data.user_id)
    },
    {
      "$set": { domain_method_assign_list: domainList }
    }
  ).exec(function (raw) {
  });
  return User.updateOne(
    {
      '_id': ObjectId(data.user_id)
    },
    {
      "$set": { domain_assign_list: domainList, domain_assign_list_name: webData }
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getdomainassignList = async (data, userDetail) => {
  let filter = { _id: ObjectId(data.user_id) }
  return await User.findOne(filter, { domain_assign_list: 1, domain_assign_list_name: 1 })
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getdomainList = async (data, userDetail) => {
  let userData = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain_assign_list: 1 })
  let filter = { _id: { $in: userData.domain_assign_list } }
  return await WebsiteSetting.find(filter)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let valueExistMethod = async (data, userDetail) => {
  let filter = { deleted: false, user_id: ObjectId(data.user_id) }
  return await bankingType.find(filter)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getBankType = async (data, userDetail) => {
  let filter = { _id: ObjectId(data._id) }
  return await bankingType.findOne(filter)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getParentDomainList = async (data, userDetail) => {
  let userData = await User.findOne({ '_id': ObjectId(data.parent_id) }, { domain_assign_list: 1 })
  let filter = { '_id': { $in: userData.domain_assign_list } }
  return await WebsiteSetting.find(filter)
    .then(getData => resultResponse(SUCCESS, getData)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let editBankType = async (data) => {
  let payment_qr = await uploadPaymentQR(data);
  if (payment_qr.statusCode != SUCCESS)
    return resultResponse(SERVER_ERROR, payment_qr.data);
  payment_qr = payment_qr.data;
  let update = { "$set": { bank_name: data.bank_name, bank_holder_name: data.bank_holder_name, bank_name: data.bank_name, ifsc_code: data.ifsc_code, account_no: data.account_no, others: data.others, ...payment_qr } };
  return bankingType.updateOne({ '_id': ObjectId(data._id) }, update).then(dbUpdate => resultResponse(SUCCESS, dbUpdate)).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getBankingMethodsTypes = () => b2cConstants.BANKING_METHODS;

let walletagentsAndUsersBonusCr = async (data, userDetail) => {
  const startTime = Date.now();
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
      , description = '', statement_type = '', images = '', self_host = true, content_meta;
    statement_type = 'DEPOSIT_REQUEST';
    description = 'Balance Deposit Request by: ' + data.user_name;
    var walletuserData = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain: 1, domain_name: 1, parent_id: 1 });
    var payment_deatails = await bankingType.findOne({ 'method_id': ObjectId(data.payment_method_id) }).select("method_name bank_holder_name bank_name ifsc_code account_no others");
    let account_info_details = {
      method_name: payment_deatails.method_name === "-" ? undefined : payment_deatails.method_name,
      bank_holder_name: payment_deatails.bank_holder_name === "-" ? undefined : payment_deatails.bank_holder_name,
      bank_name: payment_deatails.bank_name === "-" ? undefined : payment_deatails.bank_name,
      ifsc_code: payment_deatails.ifsc_code === "-" ? undefined : payment_deatails.ifsc_code,
      account_no: payment_deatails.account_no === "-" ? undefined : payment_deatails.account_no,
      others: payment_deatails.others === "-" ? undefined : payment_deatails.others,
    }
    var walletagents = await User.distinct('_id', { 'belongs_to': LABEL_B2C_MANAGER, domain_assign_list: ObjectId(walletuserData.domain) });
    let parent = {
      parent_id: data.parent_id,
      agent_id: walletuserData.parent_id,
      parent_user_name: data.parentUserName,
      user_id: data.user_id,
      user_type_id: data.user_type_id,
      user_name: data.user_name,
      name: data.name,
      mobile: data.mobile,
      country_code: data.country_code,
      domain: walletuserData.domain,
      domain_name: walletuserData.domain_name,
      point: data.parentPoint,
      amount: data.amount,
      parents: data.parent_level_ids,
      is_signup_credit: data.is_signup_credit ? data.is_signup_credit : 0,
      reference_no: data.reference_no ? data.reference_no : "",
      walletagents, description, statement_type, self_host, content_meta,
      payment_deatails, account_info_details
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
          is_signup_credit: wallet_statement[0].is_signup_credit,
          amount: wallet_statement[0].amount,
          payment_deatails: wallet_statement[0].payment_deatails,
          created_at: wallet_statement[0].created_at,
          generated_at: wallet_statement[0].generated_at,
          walletagents: wallet_statement[0].walletagents
        };
        responseJson.code = SUCCESS;
        responseJson.data = new_wallet_statement;
      } catch (error) {
        if (data?.LOG_REF_CODE) {
          logger.FloxyPay(`
            ## ERROR LOG ##
            LOG_REF_CODE: ${data.LOG_REF_CODE}
            FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
            FUNCTION: walletagentsAndUsersBonusCr
            EVENT_DETAILS: Due to system error credit transactions for wallet agents and users were process failed.
            Time Taken: ${Date.now() - startTime} ms
            ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
          `);
        }
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    if (data?.LOG_REF_CODE) {
      logger.FloxyPay(`
      ## INFO LOG ##
      LOG_REF_CODE: ${data.LOG_REF_CODE}
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: walletagentsAndUsersBonusCr
      EVENT_DETAILS: Credit transactions for wallet agents and users were processed successfully. 
      Time Taken: ${Date.now() - startTime} ms
      INFO: ${JSON.stringify(responseJson.data)}
    `);
    }
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    if (data?.LOG_REF_CODE) {
      logger.FloxyPay(`
      ## ERROR LOG ##
      LOG_REF_CODE: ${data.LOG_REF_CODE}
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: walletagentsAndUsersBonusCr
      EVENT_DETAILS: Due to system error credit transactions for wallet agents and users were process failed. 
      Time Taken: ${Date.now() - startTime} ms
      ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
    `);
    }
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};
let walletagentsAndUsersDrV2 = async (data, userDetail) => {
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
    desc = 'Balance Withdraw Request by: ' + data.user_name;
    if (data.payment_method_id) {
      await bankingType.updateMany({ 'user_id': ObjectId(data.user_id) }, { "$set": { status: false } });
      await bankingType.updateOne({ '_id': ObjectId(data.payment_method_id) }, { "$set": { status: true } });
    }
    var userDatas;
    let dealerData = await findB2CDealer(userDetail.parent_level_ids);
    if (dealerData) {
      userDatas = [dealerData]
    } else {
      userDatas = await User.distinct('_id', { belongs_to: LABEL_B2C_MANAGER, domain_assign_list: ObjectId(data.parentDomainId) });
    }
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
        data.req.body.description = 'Transaction By wallet(op)';
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

        // Withdrawal process in case of dealer
        let dealerData = await findB2CDealer(userDetail.parent_level_ids);
        if (dealerData) {
          withdrawprocces({ "user_id": dealerData, "operator_id": dealerData, "method_id": data.payment_method_id, "statement_id": wallet_statement[0]._id, is_b2c_dealer: true }, userDetail)
        }

        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = new_wallet_statement;
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

async function chipwalletInOutV2(data, userDetails) {
  let { user_id, parent_id, remark, amount, crdr, description } = data;
  if (amount > userDetails.balance && crdr === DEBIT_TWO)
    return 0;
  if (userDetails.user_type_id == USER_TYPE_SUPER_ADMIN) {
    return statementService.adminSelfCrDr({
      user_id, parent_id, description, remark, crdr, amount,
      parent_user_name: userDetails.parent_user_name, user_name: userDetails.user_name, name: userDetails.name,
      user_type_id: userDetails.user_type_id, point: userDetails.point, domain_name: userDetails.domain_name,
      parent_level_ids: userDetails.parent_level_ids, userCurrentBalance: userDetails.balance,
      statement_type: ACCOUNT_STATEMENT_TYPE_CHIPINOUT,
    }).then(async adminSelfCrDr => adminSelfCrDr.statusCode === SUCCESS ? 1 : 0)
      .catch(error => error);
  } else {
    let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
      parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
      balance: 1, parent_level_ids: 1, domain_name: 1, point: 1
    })).data;
    if (amount > parentUserDetails.balance && crdr == CREDIT_ONE)
      return '';
    else {
      return statementService.agentsAndUsersCrDr({
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
  };
}

let withdrawacceptedRequestV2 = async (data) => {
  const accDetail = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) }, { user_name: 1, status: 1, name: 1, created_at: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1, user_id: 1, parent_id: 1, remark: 1, crdr: 1, statement_type: 1 })
  if (accDetail) {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
    description = 'Balance Withdraw Request by:wallet | account from :' + accDetail.user_name;
    if (accDetail.status === "ACCEPTED") {
      responseJson.code = SERVER_ERROR;
      responseJson.data = 'Not allowed, Already accepted!';
      return resultResponse(responseJson.code, responseJson.data);
    }
    var walletuserData = await User.findOne({ '_id': ObjectId(data.user_id) });
    if (accDetail.amount > walletuserData.balance) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = 'Operator Blance Low';
      return resultResponse(responseJson.code, responseJson.data);
    }
    let images = '', self_host = false, content_meta;
    if (data.file) {
      images = data.file.filename;
      let uploadStatus = await cloudUploadService.uploadToCloud({ file: data.file });
      if (uploadStatus.statusCode == SERVER_ERROR) {
        removeStaticContent(data.file.path);
        throw new Error(uploadStatus.data);
      }
      if (uploadStatus.statusCode == SUCCESS) {
        uploadStatus = uploadStatus.data;
        self_host = false;
        images = uploadStatus.access_url;
        content_meta = { filename: uploadStatus.filename, identifier: uploadStatus.identifier };
      }
    }
    // Create Object chipwalletData start
    let userDetail = await User.findOne({ '_id': ObjectId(accDetail.user_id) });
    // Check user balance
    if (accDetail.amount > userDetail.balance) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "User's balance is low.";
      return resultResponse(responseJson.code, responseJson.data);
    }
    let chipwalletData = { description: 'Transaction By wallet(op)' };
    let crdr = 1;
    if (accDetail.statement_type == "WITHDRAW_REQUEST") {
      crdr = 2;
    }
    chipwalletData.user_id = accDetail.user_id;
    chipwalletData.parent_id = accDetail.parent_id;
    chipwalletData.remark = accDetail.remark;
    chipwalletData.amount = accDetail.amount;
    chipwalletData.crdr = crdr;
    await chipwalletInOutV2(chipwalletData, userDetail);
    //  Object chipwalletData end
    let parent = {
      parent_id: walletuserData.parent_id,
      parent_user_name: walletuserData.parent_user_name,
      user_id: walletuserData._id,
      user_type_id: walletuserData.user_type_id,
      user_name: walletuserData.user_name,
      name: walletuserData.name,
      domain_name: walletuserData.domain_name,
      agents: data.parent_level_ids,
      point: data.point,
      remark: data.remark,
      statement_type: data.statement_type,
      description, images, self_host, content_meta,
      amount: -1 * accDetail.amount,
      credit_debit: -1 * accDetail.amount,
      available_balance: (parseFloat(walletuserData.balance) - parseFloat(accDetail.amount)),
    };
    await AccountStatement.insertMany([parent]);
    let amount = parseInt(accDetail.amount);

    const LOG_REF_CODE = generateReferCode();

    const preUserDetails = await User.findOne({ _id: ObjectId(data.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();

    logger.BalExp(`
      --PRE LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequestV2
      EVENT_DETAILS: B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - old_liability: ${preUserDetails?.liability} - cal_amount: ${-1 * amount}
    `);

    await User.updateOne(
      { '_id': ObjectId(data.user_id) },
      { "$inc": { balance: -1 * amount, "total_withdraw": amount } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const postUserDetails = await User.findOne({ _id: ObjectId(data.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();

    logger.BalExp(`
      --POST LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequestV2
      EVENT_DETAILS: B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance} - new_liability: ${postUserDetails?.liability}
    `);

    if ((exponentialToFixed(postUserDetails?.liability) > 0) ? true : (exponentialToFixed(postUserDetails?.balance) < 0) ? true : false) {
      sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postUserDetails?.user_name}(${postUserDetails?._id}) : balance ${postUserDetails?.balance}, liability ${postUserDetails?.liability}` });
    }

    return AccountWalletStatement.updateOne(
      { '_id': ObjectId(data.statement_id) },
      { "$set": { verify_by: walletuserData.name, status: 'ACCEPTED' } },
      { upsert: true, setDefaultsOnInsert: true }
    ).then(() => resultResponse(SUCCESS, walletuserData)).catch(error => resultResponse(SERVER_ERROR, error.message));

  } return resultResponse(NOT_FOUND, "Entry not found!");
};
let withdrawrejectedRequestV2 = async (data, userDetail) => {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
    const accountstatement = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) });
    const walletData = await User.findOne({ '_id': ObjectId(data.user_id) });
    let remark = '';
    if (data.remark) {
      remark = data.remark;
    }
    else {
      remark = 'wallet';
    }
    await session.withTransaction(async session => {
      try {
        await AccountWalletStatement.updateOne({
          _id: accountstatement._id,
        }, { "$set": { verify_by: walletData.name, status: 'REJECTED', remark: remark } }, { session });
        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = "Withdraw Request Rejected.";
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in update transaction status" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};
let getwalletTransactionRequestForParent = async (data) => {
  let skip = (data.page - 1) * data.limit;
  let filter = { statement_type: data.statement_type, parent_id: ObjectId(data.user_id), status: data.status }
  if (data.search) {
    if (data.search.user_name) {
      filter.user_name = data.search.user_name;
    }
    if (data.search.parent_user_name) {
      filter.parent_user_name = data.search.parent_user_name;
    }
    if (data.search.mobile) {
      filter.mobile = data.search.mobile;
    }
    if (data.search.amount) {
      filter.amount = data.search.amount;
    }
  }
  // Find total count first
  const totalCount = await AccountWalletStatement.countDocuments(filter);
  return AccountWalletStatement
    .find(filter, { amount: 1, created_at: 1, user_name: 1, mobile: 1, country_code: 1 })
    .skip(skip)
    .limit(data.limit)
    .then(transactionList => {
      if (transactionList.length) {
        const response = {
          totalCount: totalCount,
          transactions: transactionList
        };
        response.metadata = { "total": totalCount, "page": data.page }
        return resultResponse(SUCCESS, response);
      } else {
        return resultResponse(NOT_FOUND, "Transaction list is empty. No transactions found!");
      }
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};
const updateFloxypayBankDetailsStatus = async (data) => {
  try {
    // Deactivate all records with the same payment_method_id
    await bankingType.updateMany(
      {
        user_id: ObjectId(data.user_id),
        method_id: ObjectId(data.payment_method_id),
      },
      { $set: { status: false } }
    );
    // Activate the record with the provided id
    const dbUpdate = await bankingType.updateOne(
      {
        _id: ObjectId(data.id),
        user_id: ObjectId(data.user_id),
        method_id: ObjectId(data.payment_method_id),
      },
      { $set: { status: data.status } }
    );

    return resultResponse(SUCCESS, dbUpdate);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};
const walletDailyBonusCr = async (data, userDetail) => {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };
  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
      , description = '', statement_type = '', self_host = true, content_meta;
    statement_type = 'DEPOSIT_REQUEST';
    description = 'Balance Deposit Request by: ' + data.user_name;
    var walletuserData = await User.findOne({ '_id': ObjectId(data.user_id) }, { domain: 1, domain_name: 1, parent_id: 1 });
    var walletagents = await User.distinct('_id', { 'belongs_to': LABEL_B2C_MANAGER, domain_assign_list: ObjectId(walletuserData.domain) });
    let parent = {
      parent_id: data.parent_id,
      agent_id: walletuserData.parent_id,
      parent_user_name: data.parentUserName,
      user_id: data.user_id,
      user_type_id: data.user_type_id,
      user_name: data.user_name,
      name: data.name,
      mobile: data.mobile,
      country_code: data.country_code,
      domain: walletuserData.domain,
      domain_name: walletuserData.domain_name,
      point: data.parentPoint,
      amount: data.amount,
      parents: data.parent_level_ids,
      is_daily_bonus_amount: data.is_daily_bonus_amount ? data.is_daily_bonus_amount : 0,
      walletagents, description, statement_type, self_host, content_meta
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
          is_daily_bonus_amount: wallet_statement[0].is_daily_bonus_amount,
          amount: wallet_statement[0].amount,
          created_at: wallet_statement[0].created_at,
          generated_at: wallet_statement[0].generated_at,
          walletagents: wallet_statement[0].walletagents
        };
        responseJson.code = SUCCESS;
        responseJson.data = new_wallet_statement;
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParentAndUserQuery" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

// We are using the exiting working code  with some minor changes.
const accepetedDailyBonusRequest = async (statement_id, userDetail) => {
  const session = await mongoose.startSession();
  const transactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  };

  try {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
    var statement_data = await AccountWalletStatement.findOne({ '_id': statement_id });
    await session.withTransaction(async session => {
      try {
        const userData = await User.findOne({ '_id': ObjectId(statement_data.user_id) });
        let data = {
          user_id: statement_data.user_id,
          parent_id: statement_data.parent_id,
          amount: statement_data.amount,
          crdr: CREDIT_ONE,
          remark: 'Daily Bonus',
          description: 'Chips credited by daily bonus.'
        };

        chipwalletInOutDailyBonus(data, userData);

        await AccountWalletStatement.updateOne(
          { _id: statement_data._id },
          { "$set": { 'status': 'ACCEPTED' } },
          { session }
        );

        await session.commitTransaction();

        responseJson.code = SUCCESS;
        responseJson.data = "Deposit Request Successfully...";
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error in updateUserRecordsOnUpdateBalanceParent" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    console.log("Line no. 1426 response :", SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};
// We are using the exiting working code  with some minor changes.
async function chipwalletInOutDailyBonus(data, userDetails) {
  let { user_id, parent_id, remark, amount, crdr, description } = data;
  const superAdminDetails = await User.findOne({ user_type_id: USER_TYPE_SUPER_ADMIN }, {
    parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
    balance: 1, parent_level_ids: 1, domain_name: 1, point: 1
  });
  return superAdminAndUsersCrDr({
    description, remark, crdr, amount,
    // Parents fields
    parentOfParentId: superAdminDetails.parent_id,
    parent_id,
    parentUserId: superAdminDetails.user_id,
    parentUserTypeId: superAdminDetails.user_type_id,
    parentUserName: superAdminDetails.user_name,
    parentName: superAdminDetails.name,
    parentOfParentUserName: superAdminDetails.parent_user_name,
    parentPoint: superAdminDetails.point,
    parentDomainName: superAdminDetails.domain_name,
    parentLevelIds: superAdminDetails.parent_level_ids,
    parentBelongsToCreditReference: superAdminDetails.belongs_to_credit_reference,
    parentCurrentBalance: superAdminDetails.balance,
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
    userCurrentBalance: userDetails.balance,
    belongs_to_credit_reference: userDetails.belongs_to_credit_reference,
    statement_type: ACCOUNT_STATEMENT_TYPE_CHIPINOUT
  }, userDetails)
    .then(agentsAndUsersCrDr => agentsAndUsersCrDr.statusCode == SUCCESS ? 1 : 0)
    .catch(error => error);
};
// We are using the exiting working code  with some minor changes.
async function superAdminAndUsersCrDr(data, userDetail) {
  const session = await mongoose.startSession();
  let responseJson = { code: SERVER_ERROR, data: DATA_NULL };
  try {
    const desc = 'Chips credited from parent (Daily bonus)';
    const descParent = `Chips credited to ${userDetail.name} (${userDetail.user_name})`;

    let parent = {
      parent_id: data.parentOfParentId,
      parent_user_name: data.parentOfParentUserName,
      user_id: data.parentUserId,
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
        FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
        FUNCTION: superAdminAndUsersCrDr
        EVENT_DETAILS: credit
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
        FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
        FUNCTION: superAdminAndUsersCrDr
        EVENT_DETAILS: credit
        LOG_REF_CODE: ${LOG_REF_CODE}
        DETAILS: parent[${postUserDetails[0]?.user_name}(${postUserDetails[0]?._id})] new_balance: ${postUserDetails[0]?.balance} - new_liability: ${postUserDetails[0]?.liability}
        DETAILS: child[${postUserDetails[1]?.user_name}(${postUserDetails[1]?._id})] new_balance: ${postUserDetails[1]?.balance} - new_liability: ${postUserDetails[1]?.liability}
      `);

      await AccountStatement.insertMany([parent, child], { session });

      responseJson.code = SUCCESS;
      responseJson.data = "Balance Updated Successfully.";
    });

    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    console.log(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong line no. 246"));
  } finally {
    session.endSession();
  }
}
const canRequestDailyBonus = async (data) => {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  var existingEntry = await AccountWalletStatement.findOne({
    user_id: data.user_id,
    is_daily_bonus_amount: data.is_daily_bonus_amount,
    statement_type: data.statement_type,
    created_at: { $gte: twentyFourHoursAgo }
  });
  if (existingEntry) {
    // Create a new date object based on the existingEntry's created_at
    const currentBonusClaimDate = new Date(existingEntry.created_at);
    // Add 24 hours to the currentBonusClaimDate
    currentBonusClaimDate.setHours(currentBonusClaimDate.getHours() + 24);
    // Format the nextBonusClaimDate in ISO 8601 format
    const formattedDate = currentBonusClaimDate.toISOString();
    existingEntry.nextBonusClaimDate = formattedDate;
    return resultResponse(SUCCESS, existingEntry);
  }
}

async function validateReferenceNo(params) {
  try {

    let reference_exist = await AccountWalletStatement.findOne(params).select("_id");

    // If reference and amount will matched.
    if (reference_exist) {
      return resultResponse(SUCCESS, "The transaction is being rejected; the UTR or reference number is already exists!");
    }

    return resultResponse(NOT_FOUND, "OK, proceed the transaction...");
  } catch (error) {

    const currentMethodName = getCurrentLine.default().method.split(".")[1];

    logger.error(`
      FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
      FUNCTION: ${currentMethodName}
      ERROR: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
    `);

    return resultResponse(SERVER_ERROR, "Something went wrong, please contact upline!");
  }
}

const deleteBankMethod = async (data) => {
  try {
    let todayDate = new Date();
    const expireAt = todayDate.setDate(todayDate.getDate() + b2cConstants.EXPIRY_FOR_BANK_DETAILS);
    const updateQuery = data.is_restore
      ? { "$set": { deleted: false }, "$unset": { expireAt: "" } }
      : { "$set": { deleted: true, expireAt: expireAt } };

    const dbUpdate = await BankingMethod.updateOne(
      { '_id': ObjectId(data.method_id) },
      updateQuery
    );

    if (dbUpdate.modifiedCount > 0) {
      const message = data.is_restore ? "Bank method restored successfully." : `Bank method marked for deletion and will expire in ${b2cConstants.EXPIRY_FOR_BANK_DETAILS} days.`;
      return resultResponse(SUCCESS, message);
    } else {
      return resultResponse(SERVER_ERROR, "No document found or already updated.");
    }
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

let deleteBankDetail = async (data, user_detail) => {
  try {
    let todayDate = new Date();
    const expireAt = todayDate.setDate(todayDate.getDate() + b2cConstants.EXPIRY_FOR_BANK_DETAILS);
    const filter = { '_id': ObjectId(data.bank_detail_id) };
    const bankingDetails = await bankingType.findOne({ '_id': ObjectId(data.bank_detail_id) }, { method_id: 1 })
    if (!bankingDetails)
      return resultResponse(SERVER_ERROR, "Bank details not found.");

    if (data.is_delete_permanently) {
      // for permanent delete
      await bankingType.deleteOne(filter)
    } else {
      // for soft delete or restore
      const updateQuery = data.is_restore
        ? { "$set": { deleted: false }, "$unset": { expireAt: "" } }
        : { "$set": { deleted: true, expireAt: expireAt } };

      await bankingType.updateOne(filter, updateQuery);
      if (user_detail.user_type_id != USER_TYPE_DEALER) {
        if (data.is_restore) {
          updateQuery.is_updated_by_child = true;
          await BankingMethod.updateOne({ '_id': ObjectId(bankingDetails.method_id) }, updateQuery);
        }
      }
    }
    // Find and update b2c dealer based on user_id
    if (user_detail.user_type_id == USER_TYPE_DEALER) {
      // Determine the increment value (1 for restore, -1 for non-restore)
      let incrementValue = data.is_restore ? 1 : -1;
      // Perform the update using $inc and $arrayFilters
      const banktypeUpdateResult = await BankingMethod.updateOne(
        {
          '_id': ObjectId(bankingDetails.method_id),
          "b2c_dealers.user_id": ObjectId(data.user_id)
        },
        [
          {
            $set: {
              "b2c_dealers": {
                $map: {
                  input: "$b2c_dealers",
                  as: "dealer",
                  in: {
                    $mergeObjects: [
                      "$$dealer",
                      {
                        banktypeCount: {
                          $cond: {
                            if: { $eq: ["$$dealer.user_id", ObjectId(data.user_id)] },
                            then: { $max: [{ $add: ["$$dealer.banktypeCount", incrementValue] }, 0] },
                            else: "$$dealer.banktypeCount"
                          }
                        }
                      }
                    ]
                  }
                }
              }
            }
          }
        ]
      );
    }

    const message = data.is_restore
      ? "Bank detail restored successfully."
      : data.is_delete_permanently
        ? "Bank detail permanently deleted."
        : `Bank detail marked for deletion and will expire in ${b2cConstants.EXPIRY_FOR_BANK_DETAILS} days.`;

    return resultResponse(SUCCESS, message);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
};

let traderwithdrawlistV2 = async (data) => {
  let { page, limit, search } = data;
  let skip = (page - 1) * limit;
  let filter = { 'status': data.status, trader_assign_withdraw_request: ObjectId(data.user_id) };
  if (data.status == 'ALL') {
    filter = { trader_assign_withdraw_request: ObjectId(data.user_id), status: { $in: ["ACCEPTED", "REJECTED"] } }
  }
  if (search) {
    if (search.constructor.name === "Object") {
      Object.assign(filter, search);
    }
  }
  if (data.lowestAmount && data.highestAmount) {
    filter.amount = { '$gte': data.lowestAmount, '$lte': data.highestAmount };
  } else if (!data.lowestAmount && data.highestAmount) {
    filter.amount = { '$lte': data.highestAmount };
  } else if (data.lowestAmount && !data.highestAmount) {
    filter.amount = { '$gte': data.lowestAmount };
  }
  // Handling Sorting Dynamically
  let sortConditions = (data.sort && Object.keys(data.sort).length > 0) ? data.sort : { created_at: -1 };
  // Find total count first
  const totalCount = await AccountWalletStatement.countDocuments(filter);
  return AccountWalletStatement
    .find(filter, { name: 1, parent_user_name: 1, domain_name: 1, amount: 1, payment_deatails: 1, generated_at: 1, created_at: 1, user_name: 1, mobile: 1, user_id: 1, parent_id: 1, status: 1, updatedAt: 1, remark: 1 })
    .skip(skip)
    .limit(limit)
    .sort(sortConditions)
    .then(transactionList => {
      if (transactionList.length) {
        const response = {
          total: totalCount,
          limit: limit,
          page: page,
          data: transactionList
        };
        return resultResponse(SUCCESS, response);
      } else {
        return resultResponse(NOT_FOUND, "Transaction list is empty. No transactions found!");
      }
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let depositAccepetedRequestByDealer = async (data, userDetail) => {
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
    if (userDetail.user_type_id != USER_TYPE_DEALER && userDetail.is_dealer != true)
      return resultResponse(SERVER_ERROR, "Not allowed!");
    var walletuserData = await User.findOne({ '_id': ObjectId(userDetail._id) });
    var statement_preview = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id), status: "PENDING" });
    if (!statement_preview) {
      responseJson.code = SERVER_ERROR;
      return resultResponse(SERVER_ERROR, "Not allowed, Already accepted!");
    }
    var reference_exist = await AccountWalletStatement.findOne({ 'reference_no': data.reference_no, amount: statement_preview.amount }).select("_id");
    // deposit request user id
    var userData = await User.findOne({ '_id': ObjectId(statement_preview.user_id) });
    desc = 'Balance deposit Request by : ' + (userData.user_name);
    // deposit request user parent_id 
    var parentData = await User.findOne({ '_id': ObjectId(userData.parent_id) });

    // Set bonus variable;
    const bonus_amount = (statement_preview?.bonus || 0);

    if ((statement_preview.amount + bonus_amount) > parentData.balance) {
      responseJson.code = SERVER_ERROR;
      return resultResponse(
        SERVER_ERROR,
        `Insufficient balance! Your current balance is (${statement_preview.amount})${bonus_amount ? `, including a bonus of (${bonus_amount})` : ''}.`
      );
    }
    if (reference_exist) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "Reference No already exist";
      return resultResponse(responseJson.code, responseJson.data);
    }
    if (!statement_preview) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "Data No Exist";
      return resultResponse(responseJson.code, responseJson.data);
    }
    let accountStatementArr = []
    let parent = {
      parent_id: walletuserData.parent_id,
      parent_user_name: walletuserData.parent_user_name,
      user_id: walletuserData._id,
      user_type_id: walletuserData.user_type_id,
      user_name: walletuserData.user_name,
      name: walletuserData.name,
      domain_name: walletuserData.domain_name,
      agents: walletuserData.parent_level_ids,
      point: walletuserData.point,
      description: desc,
      remark: 'Wallet',
      statement_type: data.crdr,
      credit_debit: -1 * statement_preview.amount,
      amount: -1 * statement_preview.amount,
      available_balance: (parseFloat(walletuserData.balance) - parseFloat(statement_preview.amount)),
    };
    let child = {
      parent_id: userData.parent_id,
      parent_user_name: userData.parent_user_name,
      user_id: userData._id,
      user_type_id: userData.user_type_id,
      user_name: userData.user_name,
      name: userData.name,
      domain_name: userData.domain_name,
      agents: userData.parent_level_ids,
      point: userData.point,
      description: `Chips credited  from parent || Transaction By ${walletuserData.user_name} (deal op)`,
      remark: 'Wallet',
      statement_type: data.crdr,
      credit_debit: statement_preview.amount,
      amount: statement_preview.amount,
      available_balance: (parseFloat(userData.balance) + parseFloat(statement_preview.amount)),
    }
    accountStatementArr.push(...[parent, child])
    // Bonus Amount
    let parentBonus;
    let childBonus;
    if (bonus_amount) {
      parentBonus = {
        parent_id: walletuserData.parent_id,
        parent_user_name: walletuserData.parent_user_name,
        user_id: walletuserData._id,
        user_type_id: walletuserData.user_type_id,
        user_name: walletuserData.user_name,
        name: walletuserData.name,
        domain_name: walletuserData.domain_name,
        agents: walletuserData.parent_level_ids,
        point: walletuserData.point,
        description: `Bonus credited to ${userData.name} (${userData.user_name}) [${statement_preview?.bonus_data_obj.name}]`,
        remark: 'Bonus',
        statement_type: ACCOUNT_STATEMENT_TYPE_BONUS,
        credit_debit: -1 * bonus_amount,
        amount: -1 * bonus_amount,
        available_balance: (parseFloat(parent.available_balance) - parseFloat(bonus_amount)),
        bonus: ((parseFloat(walletuserData.bonus) || 0) - parseFloat(bonus_amount)),
      };
      childBonus = {
        parent_id: userData.parent_id,
        parent_user_name: userData.parent_user_name,
        user_id: userData._id,
        user_type_id: userData.user_type_id,
        user_name: userData.user_name,
        name: userData.name,
        domain_name: userData.domain_name,
        agents: userData.parent_level_ids,
        point: userData.point,
        description: `Bonus credited from parent. [${statement_preview?.bonus_data_obj.name}]`,
        remark: 'Bonus',
        statement_type: ACCOUNT_STATEMENT_TYPE_BONUS,
        credit_debit: bonus_amount,
        amount: bonus_amount,
        available_balance: (parseFloat(child.available_balance) + parseFloat(bonus_amount)),
        bonus: ((parseFloat(userData.bonus) || 0) + parseFloat(bonus_amount)),
      }
      accountStatementArr.push(...[parentBonus, childBonus])
    }


    await session.withTransaction(async session => {
      try {
        await AccountStatement.insertMany(accountStatementArr, { session });

        const LOG_REF_CODE = generateReferCode();

        const preUserDetails = await User.findOne({ _id: walletuserData._id }, { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();
        const preReqUserDetails = await User.findOne({ _id: userData._id }, { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: depositAccepetedRequestByDealer
          EVENT_DETAILS: B2C
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - old_liability: ${preUserDetails?.liability} - cal_amount: ${statement_preview.amount} - bonus: ${-preUserDetails.bonus}
        `);

        logger.BalExp(`
          --PRE LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: depositAccepetedRequestByDealer
          EVENT_DETAILS: B2C
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${preReqUserDetails?.user_name}(${preReqUserDetails?._id})] old_balance: ${preReqUserDetails?.balance} - old_liability: ${preReqUserDetails?.liability} - cal_amount: ${statement_preview.amount} - bonus: ${-preReqUserDetails.bonus}
        `);

        let bonusQuery = [];
        if (bonus_amount) {
          bonusQuery = [
            {
              "updateOne": {
                "filter": { _id: walletuserData._id },
                "update": {
                  "$inc": { "bonus": - bonus_amount }
                }
              }
            },
            {
              "updateOne": {
                "filter": { _id: child.user_id },
                "update": {
                  "$inc": { "bonus": bonus_amount },
                }
              }
            },
          ]
        }

        if (userData.belongs_to_b2c) {
          bonusQuery.push({
            "updateOne": {
              "filter": { _id: child.user_id },
              "update": {
                "$inc": { "total_deposit_count": 1 },
              }
            }
          })
        }

        await User.bulkWrite([
          {
            updateOne: {
              filter: { _id: walletuserData._id },
              update: { $inc: { balance: parent.amount - bonus_amount, total_deposit: statement_preview.amount } }
            }
          },
          {
            updateOne: {
              filter: { _id: child.user_id },
              update: { $inc: { balance: child.amount + bonus_amount } }
            }
          },
          ...bonusQuery

        ], { session });

        const postUserDetails = await User.findOne({ _id: walletuserData._id }, { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();
        const postReqUserDetails = await User.findOne({ _id: userData._id }, { user_name: 1, balance: 1, liability: 1, bonus: 1 }).session(session).lean();

        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: depositAccepetedRequestByDealer
          EVENT_DETAILS: B2C
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance} - new_liability: ${postUserDetails?.liability} - bonus: ${-postUserDetails.bonus}
        `);
        logger.BalExp(`
          --POST LOG--
          FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
          FUNCTION: depositAccepetedRequestByDealer
          EVENT_DETAILS: B2C
          LOG_REF_CODE: ${LOG_REF_CODE}
          DETAILS: [${postReqUserDetails?.user_name}(${postReqUserDetails?._id})] new_balance: ${postReqUserDetails?.balance} - new_liability: ${postReqUserDetails?.liability} - bonus: ${-postReqUserDetails.bonus}
        `);

        if ((exponentialToFixed(postReqUserDetails?.liability) > 0) ? true : (exponentialToFixed(postReqUserDetails?.balance) < 0) ? true : false) {
          sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postReqUserDetails?.user_name}(${postReqUserDetails?._id}) : balance ${postReqUserDetails?.balance}, liability ${postReqUserDetails?.liability}` });
        }

        await AccountWalletStatement.updateOne({
          _id: data.statement_id,
        }, { "$set": { reference_no: data.reference_no, status: 'ACCEPTED', verify_by: userDetail.name, remark: data?.remark || '' } }, { session });
        await session.commitTransaction();
        responseJson.code = SUCCESS;
        responseJson.data = "Deposit Request Accepted Successfully...";
      } catch (error) {
        await session.abortTransaction();
        responseJson.data = "Error" + (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "");
      }
    }, transactionOptions);
    return resultResponse(responseJson.code, responseJson.data);
  } catch (error) {
    return resultResponse(SERVER_ERROR, (process.env.DEBUG == "true" ? ` ${error.message} ${getCurrentLine.default().file.split(/[\\/]/).pop()}: ${getCurrentLine.default().line}` : "Something went wrong!"));
  } finally {
    session.endSession();
  }
};

let withDrawalAcceptedByDeler = async (data, userDetail) => {
  const accDetail = await AccountWalletStatement.findOne({ '_id': ObjectId(data.statement_id) }, { user_name: 1, status: 1, name: 1, created_at: 1, generated_at: 1, domain_name: 1, parent_user_name: 1, amount: 1, images: 1, user_id: 1, parent_id: 1, remark: 1, crdr: 1, statement_type: 1 })
  if (accDetail) {
    let responseJson = { code: SERVER_ERROR, data: DATA_NULL }
    description = 'Withdraw has been successfully processed for : ' + (accDetail.user_name);
    if (accDetail.status === "ACCEPTED") {
      responseJson.code = SERVER_ERROR;
      responseJson.data = 'Not allowed, Already accepted!';
      return resultResponse(responseJson.code, responseJson.data);
    }
    var walletuserData = await User.findOne({ '_id': ObjectId(accDetail.parent_id) });
    var userData = await User.findOne({ '_id': ObjectId(accDetail.user_id) });
    // if (accDetail.amount > walletuserData.balance) {
    //   responseJson.code = SERVER_ERROR;
    //   responseJson.data = 'Dealer Blance Low';
    //   return resultResponse(responseJson.code, responseJson.data);
    // }
    let images = '', self_host = false, content_meta;
    if (data.file) {
      images = data.file.filename;
      let uploadStatus = await cloudUploadService.uploadToCloud({ file: data.file });
      if (uploadStatus.statusCode == SERVER_ERROR) {
        removeStaticContent(data.file.path);
        throw new Error(uploadStatus.data);
      }
      if (uploadStatus.statusCode == SUCCESS) {
        uploadStatus = uploadStatus.data;
        self_host = false;
        images = uploadStatus.access_url;
        content_meta = { filename: uploadStatus.filename, identifier: uploadStatus.identifier };
      }
    }
    // Create Object chipwalletData start
    let userDetail = await User.findOne({ '_id': ObjectId(accDetail.user_id) });
    // Check user balance
    if (accDetail.amount > userDetail.balance) {
      responseJson.code = SERVER_ERROR;
      responseJson.data = "User's balance is low.";
      return resultResponse(responseJson.code, responseJson.data);
    }
    let crdr = 1;
    let parent = {
      parent_id: walletuserData.parent_id,
      parent_user_name: walletuserData.parent_user_name,
      user_id: walletuserData._id,
      user_type_id: walletuserData.user_type_id,
      user_name: walletuserData.user_name,
      name: walletuserData.name,
      domain_name: walletuserData.domain_name,
      agents: data.parent_level_ids,
      point: data.point,
      remark: data.remark,
      statement_type: crdr,
      description, images, self_host, content_meta,
      amount: accDetail.amount,
      credit_debit: accDetail.amount,
      available_balance: (parseFloat(walletuserData.balance) + parseFloat(accDetail.amount)),
    };

    let child = {
      parent_id: userData.parent_id,
      parent_user_name: userData.parent_user_name,
      user_id: userData._id,
      user_type_id: userData.user_type_id,
      user_name: userData.user_name,
      name: userData.name,
      domain_name: userData.domain_name,
      agents: userData.parent_level_ids,
      point: userData.point,
      remark: data.remark,
      statement_type: crdr,
      description: `Withdraw has been successfully processed by : (${walletuserData.user_name})`,
      images, self_host, content_meta,
      amount: -1 * accDetail.amount,
      credit_debit: -1 * accDetail.amount,
      available_balance: (parseFloat(userData.balance) - parseFloat(accDetail.amount)),
    };

    await AccountStatement.insertMany([parent, child]);
    let amount = parseInt(accDetail.amount);

    const LOG_REF_CODE = generateReferCode();

    const preUserDetails = await User.findOne({ _id: ObjectId(data.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();
    const preReqUserDetails = await User.findOne({ _id: ObjectId(child.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();

    logger.BalExp(`
      --PRE LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequestByDealer
      EVENT_DETAILS: B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${preUserDetails?.user_name}(${preUserDetails?._id})] old_balance: ${preUserDetails?.balance} - old_liability: ${preUserDetails?.liability} - cal_amount: ${-1 * amount}
    `);

    logger.BalExp(`
      --PRE LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequestByDealer
      EVENT_DETAILS: B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${preReqUserDetails?.user_name}(${preReqUserDetails?._id})] old_balance: ${preReqUserDetails?.balance} - old_liability: ${preReqUserDetails?.liability} - cal_amount: ${-1 * amount}
    `);

    await User.bulkWrite([
      {
        updateOne: {
          filter: { _id: walletuserData._id },
          update: { $inc: { balance: amount, "total_withdraw": amount } }
        }
      },
      {
        updateOne: {
          filter: { _id: child.user_id },
          update: { $inc: { balance: -amount } }
        }
      }
    ]);

    const postUserDetails = await User.findOne({ _id: ObjectId(data.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();
    const postReqUserDetails = await User.findOne({ _id: ObjectId(child.user_id) }, { user_name: 1, balance: 1, liability: 1 }).lean();

    logger.BalExp(`
      --POST LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequestByDealer
      EVENT_DETAILS: B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${postUserDetails?.user_name}(${postUserDetails?._id})] new_balance: ${postUserDetails?.balance} - new_liability: ${postUserDetails?.liability}
    `);

    logger.BalExp(`
      --POST LOG--
      FILE: ${getCurrentLine.default().file.split(/[\\/]/).pop()}
      FUNCTION: withdrawacceptedRequestByDealer
      EVENT_DETAILS: B2C
      LOG_REF_CODE: ${LOG_REF_CODE}
      DETAILS: [${postReqUserDetails?.user_name}(${postReqUserDetails?._id})] new_balance: ${postReqUserDetails?.balance} - new_liability: ${postReqUserDetails?.liability}
    `);

    if ((exponentialToFixed(postReqUserDetails?.liability) > 0) ? true : (exponentialToFixed(postReqUserDetails?.balance) < 0) ? true : false) {
      sendMessageAlertToTelegram({ message: `\nLOG_REF_CODE: ${LOG_REF_CODE}\nUSER: ${postReqUserDetails?.user_name}(${postReqUserDetails?._id}) : balance ${postReqUserDetails?.balance}, liability ${postReqUserDetails?.liability}` });
    }

    return AccountWalletStatement.updateOne(
      { '_id': ObjectId(data.statement_id) },
      { "$set": { verify_by: walletuserData.name, status: 'ACCEPTED', remark: data?.remark || '' } },
      { upsert: true, setDefaultsOnInsert: true }
    ).then(() => resultResponse(SUCCESS, "Withdrawal request Accepted.")).catch(error => resultResponse(SERVER_ERROR, error.message));

  } return resultResponse(NOT_FOUND, "Entry not found!");
};

let getAllTransactionsList = async (data, userDetail) => {
  let query = walletServiceQuery.getAllTransactionsListRequestQuery(data);
  return AccountWalletStatement.aggregate(query).then(transactionList => {
    if (transactionList.length) {
      // Adjust the return to structure the response as desired
      const response = transactionList[0]; // Get the first result 
      return resultResponse(SUCCESS, response);
    } else {
      return resultResponse(NOT_FOUND, "Transaction list is empty, no transactions found!");
    }
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

let getBonusDetails = async (data) => {
  try {
    // Fetch user data based on user_id or _id
    const userData = await User.findOne(
      { _id: ObjectId(data.User.user_id || data.User._id) },
      {
        domain: 1,
        domain_name: 1,
        parent_id: 1,
        total_deposit_count: 1,
        belongs_to_b2c: 1,
        user_type_id: 1,
      }
    )
      .lean()
      .exec();

    // Check if userData is found
    if (!userData) {
      return resultResponse(NOT_FOUND, "User  not found");
    }

    // Initialize bonusRes
    let bonusRes = null;
    // Fetch Bonus Percentage based on Deposit Count
    bonusRes = await AccountStatementService.getDepositCountandBonusData({
      domain_name: userData.domain_name,
      user_id: userData._id,
      total_deposit_count: userData.total_deposit_count,
    });

    // Check if bonus data is available
    if (bonusRes && bonusRes.bonus_data_obj) {
      const { bonus_data_obj } = bonusRes; // Destructure to get bonus_data_obj

      // Create the response with only the required fields
      const response = {
        bonus_type: bonus_data_obj.bonus_type,
        display_text: bonus_data_obj.display_text,
        percentage: bonus_data_obj.percentage,
        name: bonus_data_obj.name,
      };

      // Return the structured response
      return resultResponse(SUCCESS, response);
    } else {
      // Return a message if no bonus data is found
      return resultResponse(NOT_FOUND, "No bonus data available");
    }
  } catch (error) {
    // Handle the error appropriately
    return resultResponse(SERVER_ERROR, error.message); // Ensure to return the error response
  }
};

if (process.env.NODE_APP_INSTANCE == "0" || process.env.NODE_APP_INSTANCE == undefined) {
  B2CEvent.on(b2cConstants.METHOD_TYPE_COUNT, async (data) => {
    try {
      const { documentKey, updateDescription } = data;
      if (documentKey && updateDescription) {
        const { operator_assign_list_name, domain_type_name, status, is_b2c_dealer, deleted } = updateDescription.updatedFields;
        if ((operator_assign_list_name != undefined || domain_type_name != undefined || status != undefined || deleted != undefined) && is_b2c_dealer == undefined) {
          bankingType.findOne(documentKey, { _id: 0, method_id: 1 }).lean().then(bankingTypeMethodId => {
            bankingType.count({
              deleted: false, method_id: bankingTypeMethodId.method_id, operator_assign_list_name: { "$nin": [null, "null"] }, domain_type_name: { "$nin": [null, "null"] }, status: true,
              '$or': [
                { is_b2c_dealer: { '$exists': false } }, // Matches when is_b2c_dealer is undefined or doesn't exist
                { is_b2c_dealer: false } // Matches when is_b2c_dealer is explicitly false
              ],
            }).then(bankingType => {
              BankingMethod.updateOne({ _id: bankingTypeMethodId.method_id }, { methodTypeCount: bankingType }).then().catch(console.error)
            }).catch(console.error)
          }).catch(console.error);
        }
      }
    } catch (error) {
      console.log("Event Watch -> 'Method Type Event' Error: ", error);
    }
  });

  B2CEvent.on(b2cConstants.BANK_TYPE_UPDATE, async (data) => {
    try {
      const { documentKey, updatedFields } = data;

      if (documentKey && updatedFields) {

        const { deleted } = updatedFields;

        if (deleted == undefined) {
          return;
        }

        // Only process if the 'deleted' field was updated
        const query = { method_id: documentKey._id };
        const update = deleted === true
          ? { $set: updatedFields }  // If 'deleted' is true, update with provided fields
          : { "$set": { deleted: false }, "$unset": { expireAt: "" } };  // If restoring, unset 'expireAt' and set 'deleted' to false

        if (updatedFields.is_updated_by_child != true) {
          bankingType.updateMany(query, update).then().catch(console.error);
        }
      }
    } catch (error) {
      console.log("Event Watch -> 'Banking Method Event 2' Error: ", error);
    }
  });

}

module.exports = {
  getParentDomainList, editBankType, getBankType, getdomainList, valueExistMethod, getdomainassignList,
  domainselfassign, checkrequest, getuserpayementList, removePaymentDetails, setcreditlimit, getwalletsummary,
  traderwithdrawlist, withdrawprocces, getuserpayment, assigndomainMethod, assignoperatorMethod,
  getprogesswithdrawList, updateacceptProgress, updatePayment, updatePaymentMethod, getParentPayementDetails,
  getwalletBankDetail, createPaymentMethod, getPayementMethod, createBankType, getBankdetails, getBankMethods,
  createBankingMethod, editBankingMethod, withdrawrejectedRequest, withdrawacceptedRequest, depositAccepetedRequest,
  depositrejectedRequest, walletagentsAndUsersCr, walletagentsAndUsersDr, getwalletdepositpreviewRequest,
  getwalletTransactionRequest, getwalletAllTransactionRequest, getBankingMethodsTypes, walletagentsAndUsersBonusCr,
  walletagentsAndUsersDrV2, withdrawacceptedRequestV2, withdrawrejectedRequestV2, getwalletTransactionRequestForParent, updateFloxypayBankDetailsStatus,
  traderwithdrawlistV2, walletDailyBonusCr, accepetedDailyBonusRequest, canRequestDailyBonus, validateReferenceNo, deleteBankMethod, deleteBankDetail,
  depositAccepetedRequestByDealer, withDrawalAcceptedByDeler, getAllTransactionsList, getBonusDetails
}