const { STATUS_200, STATUS_500, STATUS_422 } = require('../../utils/httpStatusCode');

process.env["NTBA_FIX_350"] = 1;
const Joi = require('joi')
  , { ObjectId } = require("bson")
  , TelegramBot = require('node-telegram-bot-api')
  , commonService = require('../service/commonService')
  , walletService = require('../service/walletService')
  , cloudUploadService = require('../service/cloudUploadService')
  , b2cConstants = require("../../utils/b2cConstants")
  , { depositRequestMsg, withdrawRequestMsg, withdrawRequestMsgForOpr } = require("../../utils/systemMessages")
  , telegramService = require('../../admin-backend/service/telegramService')
  , publisher = require("../../connections/redisConnections")
  , { min_utr_value, max_utr_value } = require('../../utils/validationConstant')
  , { SocSuccess } = require('../../lib/socketResponder')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , { SUCCESS, SERVER_ERROR, DEBIT_TWO, CREDIT_ONE, TELEGRAM_TOKEN, USER_TYPE_SUPER_ADMIN, LABEL_B2C_MANAGER, USER_TYPE_DEALER, UNIQUE_IDENTIFIER_KEY } = require('../../utils/constants')
  , { removeStaticContent } = require('../../utils')
  , token = TELEGRAM_TOKEN && TELEGRAM_TOKEN != "" ? TELEGRAM_TOKEN : ''
  , bot = new TelegramBot(token, { polling: false })
  , User = require('../../models/user');
const { MINIMUM_WITHDRAWAL_AMOUNT } = require("../../config/constant/user.js");

module.exports = class walletController {
  // deposit  wallet & users balance and account statements generated.
  static walletchipIn(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      amount: Joi.number().greater(0).required(),
      crdr: Joi.number().valid(1, 2).required(),
      payment_method_id: Joi.string().required(),
      remark: Joi.string().required(),
      user_reference_no: Joi.string()
        .min(min_utr_value).message(`UTR must be ${min_utr_value} digits long.`)
        .max(max_utr_value).message(`UTR must be ${min_utr_value} digits long.`)
        .trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {

        const duplicateDepositPrevent = `deposit-request-${data.user_id}${UNIQUE_IDENTIFIER_KEY}`;
        const EXPIRE = 10; // 10 sec.
        const getDepositStatus = await publisher.get(duplicateDepositPrevent);

        if (getDepositStatus) {
          removeStaticContent(req.file.path);
          return ResError(res, { msg: "Your previous request is being processing...", statusCode: STATUS_422 });
        }

        await publisher.set(duplicateDepositPrevent, new Date(), 'EX', EXPIRE).then();

        if (!req.file)
          return ResError(res, { msg: "Please upload the payment screenshot!", statusCode: STATUS_422 });
        var file = req.file;
        let { user_id, parent_id, user_reference_no, amount, crdr, payment_method_id } = data;
        let userDetails = (await commonService.getUserByUserId(user_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, mobile: 1, liability: 1, country_code: 1
        })).data;
        let statement_type = 'DEPOSIT_REQUEST';

        let checkexistRequest = (await walletService.checkrequest({ user_id, statement_type }));
        if (checkexistRequest.data) {
          removeStaticContent(req.file.path);
          return ResError(res, { msg: "Your previous request is being processed!", statusCode: STATUS_422 });
        }

        amount = parseFloat(amount);

        if (data.user_reference_no) {

          let validateReferenceNo = await walletService.validateReferenceNo({ reference_no: user_reference_no, amount });

          if ([SUCCESS, SERVER_ERROR].includes(validateReferenceNo.statusCode)) {
            return ResError(res, { msg: validateReferenceNo.data });
          }
        }

        let description = `Transaction By ${req.User.name}(${req.User.user_name})`;
        if (amount > userDetails.balance && crdr === DEBIT_TWO)
          return ResError(res, { msg: "Insufficient Balance!", status: false, statusCode: STATUS_422 });
        let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
        })).data;
        return walletService.walletagentsAndUsersCr({
          description, crdr, amount, file, payment_method_id, user_reference_no,
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
                    let img_path;
                    if (cloudUploadService.isEnabled()) img_path = restData.images;
                    else img_path = file.path;
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
                    await bot.sendPhoto(userBotDetails.chat_id, img_path, { caption: deposit_request_msg });
                    await bot.sendMessage(userBotDetails.chat_id, `${b2cConstants.TELEGRAM_BOT.ACCEPT_DEPOSIT_KEY} ${restData._id} ...`);
                    await bot.sendMessage(userBotDetails.chat_id, `${b2cConstants.TELEGRAM_BOT.REJECT_DEPOSIT_KEY} ${restData._id} ...`);
                  }
                }
              }
              walletagents.map(walletagent => req.IO.emit(`${walletagent}_${b2cConstants.DEPOSIT_REQUEST}`, SocSuccess({ data: [restData] })));
              return ResSuccess(res, "The balance deposit request has been successfully processed...");
            } else
              return ResError(res, { msg: agentsAndUsersCrDr.data });
          }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // withdraw wallet & users balance and account statements generated.
  static walletchipOut(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      amount: Joi.number().greater(0).required(),
      crdr: Joi.number().valid(1, 2).required(),
      remark: Joi.string().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        var file = req.file;
        let { user_id, parent_id, amount, crdr } = data;
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
          return ResError(res, { msg: "please add atleast one payment method!", status: false, statusCode: STATUS_422 });
        }
        if (checkexistRequest.data) {
          return ResError(res, { msg: "Your previous request is under process!", status: false, statusCode: STATUS_422 });
        }
        amount = parseFloat(amount);
        let description = `Transaction By ${req.User.name}(${req.User.user_name})`;
        if (amount > userDetails.balance && crdr === DEBIT_TWO)
          return ResError(res, { msg: "Insufficient Balance!", status: false, statusCode: STATUS_422 });
        let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
        })).data;
        if (amount > parentUserDetails.balance && crdr == CREDIT_ONE)
          return ResError(res, { msg: "Insufficient Balance!", status: false, statusCode: STATUS_422 });
        else {
          return walletService.walletagentsAndUsersDr({
            description, crdr, amount, file, req, res,
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
          }, userDetails)
            .then(async (agentsAndUsersCrDr) => {
              if (agentsAndUsersCrDr.statusCode == SUCCESS) {
                let { walletagents, ...restData } = agentsAndUsersCrDr.data;
                let resMsg = "Balance Withdraw Request Successfully...";
                for (let index = 0; index < walletagents.length; index++) {
                  const element = walletagents[index];
                  let userBotDetails = (await telegramService.getInfoByUserId(element)).data;
                  if (userBotDetails) {
                    let params = {
                      name: restData.name,
                      user_name: restData.user_name,
                      amount: restData.amount,
                      domain_name: restData.domain_name
                    };
                    let withdraw_request_msg = withdrawRequestMsg(params);
                    if (userBotDetails.user_type_id === 15 || userBotDetails.user_type_id === 4) bot.sendMessage(userBotDetails.chat_id, withdraw_request_msg);
                  }
                  req.IO.emit(`${element}_${b2cConstants.WITHDRAW_REQUEST}`, SocSuccess({
                    msg: resMsg,
                    data: [restData]
                  }));
                }
                ResSuccess(res, resMsg)
              } else {
                ResError(res, { msg: agentsAndUsersCrDr.data })
              }
            })
            .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
        }
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // deposit and withdraw wallet & users balance and account statements generated.
  static getwalletTransactionList(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      status: Joi.string().optional(),
      statement_type: Joi.string().optional(),
      limit: Joi.number().min(1).default(1).optional(),
      page: Joi.number().min(1).default(1).optional(),
      search: Joi.object().optional(),
      sort: Joi.object().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, status, statement_type, limit, page, search, sort } = data;
        return walletService.getwalletTransactionRequest({
          user_id, status, statement_type, limit, page, search, sort
        }, data.User)
          .then(gettransactionListCrdr => gettransactionListCrdr.statusCode == SUCCESS ? ResSuccess(res, { gettransactionListCrdr }) : ResError(res, { msg: gettransactionListCrdr.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // deposit and withdraw wallet & users balance and account statements generated.
  static getwalletAllTransaction(req, res) {
    req.joiData.user_id = ObjectId(req.joiData.user_id ? req.joiData.user_id : (req.User.user_id || req.User._id));
    return walletService.getwalletAllTransactionRequest(req, req.User)
      .then(response => {
        if (response.statusCode == SUCCESS) {
          if ((response.data[0].data).length === 0)
            return ResSuccess(res, { metadata: response.data[0].metadata[0], data: response.data[0].data, message: "no match found" })
          else {
            let metadata = response.data[0].metadata[0];
            let allData = response.data[0].data;
            let amountSum = (response.data[0].amountSum).length === 0 ? 0 : response.data[0].amountSum[0].totalAmount;
            let depositAmount = (response.data[0].depositAmount).length === 0 ? 0 : response.data[0].depositAmount[0].totalAmount;
            let withdrawAmount = (response.data[0].withdrawAmount).length === 0 ? 0 : response.data[0].withdrawAmount[0].totalAmount;
            let balance = depositAmount - withdrawAmount;
            return ResSuccess(res, { metadata: metadata, data: allData, amountSum: amountSum, depositAmount: depositAmount, withdrawAmount: withdrawAmount, balance: balance })
          }
        } else return ResError(res, { msg: response.data });
      }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // deposit preview account statements generated.
  static getpreviewDeposit(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { statement_id } = data;
        return walletService.getwalletdepositpreviewRequest({
          statement_id
        }, data.User)
          .then(previewdespositList => previewdespositList.statusCode == SUCCESS ? ResSuccess(res, { previewdespositList }) : ResError(res, { msg: previewdespositList.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // deposit rejected.
  static depositRejected(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      remark: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { statement_id, user_id, remark } = data;
        return walletService.depositrejectedRequest({
          statement_id, user_id, remark
        }, data.User)
          .then(previewdespositList => previewdespositList.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'deposit rejeceted' }) : ResError(res, { msg2: previewdespositList }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // withdraw accepeted.
  static withdrawAccepted(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      remark: Joi.string().optional(),
      image: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let file = req.file;
        let { statement_id, user_id, remark } = data;
        return walletService.withdrawacceptedRequest({ statement_id, user_id, file, remark }, data.User)
          .then(walletuserData => walletuserData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'withdraw accepted' }) : ResError(res, { msg: walletuserData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // withdraw rejected.
  static withdrawRejected(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      remark: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { statement_id, user_id, remark } = data;
        return walletService.withdrawrejectedRequest({
          statement_id, user_id, req, res, remark
        }, data.User)
          .then(walletData => walletData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'withdraw rejected' }) : ResError(res, { msg: walletData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // deposit accepted.
  static depositAccepted(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      crdr: Joi.number().valid(1, 2).required(),
      reference_no: Joi.string()
        .min(min_utr_value).message(`UTR must be ${min_utr_value} digits long.`)
        .max(max_utr_value).message(`UTR must be ${min_utr_value} digits long.`)
        .required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        data.user_id = data.u_user_id;
        let { statement_id, user_id, reference_no, parent_id } = data;

        return walletService.depositAccepetedRequest({
          statement_id, user_id, reference_no, parent_id, req, res,
        }, req.User)
          .then(statementList => statementList.statusCode == SUCCESS ? ResSuccess(res, { 'msg': statementList.data }) : ResError(res, { msg: statementList.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // banking method type.
  static bankingMethod(req, res) {
    let category_enums = Object.keys(b2cConstants.BANKING_METHODS);
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      name: Joi.string().required(),
      category: Joi.string().required().valid(...category_enums),
      type: Joi.string().required().valid(...b2cConstants.BANKING_TYPES),
      image: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { name, user_id, type, category } = data;
        return walletService.createBankingMethod({
          name, user_id, type, category
        }, req.User)
          .then(dbUpdate => dbUpdate.statusCode == SUCCESS ? ResSuccess(res, { 'msg': dbUpdate.data }) : ResError(res, { msg: "The bank method has already been added for this category and type, which you can restore." }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // edit banking method.
  static editBankingMethod(req, res) {
    return Joi.object({
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().required(),
      name: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { id, name } = data;
        return walletService.editBankingMethod({
          id, name
        }, req.User)
          .then(dbUpdate => dbUpdate.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success' }) : ResError(res, { msg: dbUpdate.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get banking method type.
  static getbankingMethod(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      status: Joi.string().optional(),
      type: Joi.string().required(),
      // type: Joi.string().default('ALL').allow('DEPOSIT','WITHDRAW').required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, status, type } = data;
        return walletService.getBankMethods({
          user_id, status, type
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get progess withdraw list.
  static getprogesswithdrawList(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      status: Joi.number().optional(),
      limit: Joi.number().min(1).max(1000).default(50).optional(),
      page: Joi.number().min(1).max(250).default(1).optional(),
      search: Joi.object({
        user_name: Joi.string().optional(),
        parent_user_name: Joi.string().optional(),
        mobile: Joi.string().optional(),
        amount: Joi.string().optional()
      }).optional(),
      sort: Joi.object().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, status, limit, page, search, sort } = data;
        return walletService.getprogesswithdrawList({
          user_id, status, limit, page, search, sort
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get trader withdraw list.
  static traderwithdrawlist(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      status: Joi.string().optional(),
      limit: Joi.number().optional(),
      sort: Joi.object().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, status, limit, sort } = data;
        return walletService.traderwithdrawlist({
          user_id, status, limit, sort
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }



  // update payment method active/inactive.
  static updatePaymentMethod(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().optional(),
      status: Joi.boolean().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, status, method_id } = data;
        return walletService.updatePaymentMethod({
          user_id, status, method_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // update payment details method active/inactive.
  static updatePayment(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().optional(),
      status: Joi.boolean().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, status, id } = data;
        return walletService.updatePayment({
          user_id, status, id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // update progeess status.
  static updateacceptProgress(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, id } = data;
        return walletService.updateacceptProgress({
          user_id, id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get banking details.
  static getBankDetails(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      is_delete: Joi.boolean().default(false).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, is_delete } = data;
        return walletService.getBankdetails({
          user_id, is_delete
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get banking method user panel details.
  static getPayementMethod(req, res) {
    return walletService.getPayementMethod(req.joiData, req?.isRequestFromUpline ? req.user : req.User)
      .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { data: getData.data }) : ResError(res, { msg: getData.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static isRequestFromUpline(req, res, next) {
    req.isRequestFromUpline = true;
    next();
  }

  // get banking  method user panel details.
  static getwalletBankDetail(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, method_id } = data;
        return walletService.getwalletBankDetail({
          user_id, method_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get operator payment details  method user panel details.
  static getParentPayementDetails(req, res) {
    req.joiData.user_id = ObjectId(req.joiData.user_id ? req.joiData.user_id : (req.User.user_id || req.User._id));
    walletService.getParentPayementDetails(req.joiData, req.User).then(getData =>
      (getData.statusCode == SUCCESS)
        ?
        (!getData.data[0])
          ? ResSuccess(res, { 'msg': 'No account information was found for the selected payment method...' })
          : ResSuccess(res, { 'msg': 'success', data: getData.data })
        : ResError(res, { msg: getData.data })
    ).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }))

  }

  // get parent domain list.
  static getParentDomainList(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { parent_id, user_id } = data;
        return walletService.getParentDomainList({
          parent_id, user_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // edit banking type details.
  static editBankType(req, res) {
    return Joi.object({
      _id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("_id must be a valid ObjectId").trim().optional(),
      bank_name: Joi.string(),
      bank_holder_name: Joi.string(),
      ifsc_code: Joi.string(),
      account_no: Joi.string(),
      others: Joi.string(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => walletService.editBankType({ ...data, file: req.file })
        .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
        .catch(error => ResError(res, { error, statusCode: STATUS_500 }))
      ).catch(error => {
        return ResError(res, error);
      });
  }

  // get single banking type details.
  static getBankType(req, res) {
    return Joi.object({
      _id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { _id } = data;
        return walletService.getBankType({
          _id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }


  // get banking type details.
  static createBankType(req, res) {
    walletService.createBankType({ ...req.body, file: req.file })
      .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { msg: getData.data }) : ResError(res, { msg: getData.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // create  banking  details user panel.
  static createPaymentMethod(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().optional(),
      bank_name: Joi.string(),
      ifsc_code: Joi.string(),
      bank_holder_name: Joi.string(),
      account_no: Joi.string(),
      others: Joi.string(),
      mobile_no: Joi.string().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, parent_id, bank_name, ifsc_code, bank_holder_name, account_no, others, method_id, mobile_no } = data;
        return walletService.createPaymentMethod({
          user_id, parent_id, bank_name, bank_holder_name, ifsc_code, account_no, others, method_id, mobile_no
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }


  // update opertaor method
  static assignoperatorMethod(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().optional(),
      operator_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("operator_id must be a valid ObjectId").trim().optional(),
      operator_name: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, operator_name, operator_id, id } = data;
        return walletService.assignoperatorMethod({
          user_id, operator_name, operator_id, id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // update domain method
  static assigndomainMethod(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().optional(),
      domain_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("domain_id must be a valid ObjectId").trim().optional(),
      domain_name: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, domain_name, domain_id, id } = data;
        return walletService.assigndomainMethod({
          user_id, domain_name, domain_id, id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get user payment method
  static getuserpayment(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, id } = data;
        return walletService.getuserpayment({
          user_id, id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // manager procced to withdraw
  static withdrawprocces(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      operator_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("operator_id must be a valid ObjectId").trim().optional(),
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("method_id must be a valid ObjectId").trim().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, statement_id, operator_id, method_id } = data;
        return walletService.withdrawprocces({
          user_id, statement_id, operator_id, method_id
        }, req.User)
          .then(async getData => {
            if (getData.statusCode == SUCCESS) {
              ResSuccess(res, { 'msg': 'success', data: getData.data });
              let userBotDetails = (await telegramService.getInfoByUserId(ObjectId(operator_id))).data;
              if (userBotDetails) {
                let statementData = (await walletService.getwalletdepositpreviewRequest({ statement_id }, data.User)).data;
                let params = {
                  _id: statementData._id,
                  name: statementData.name,
                  user_name: statementData.payment_deatails[0].user_name,
                  amount: statementData.amount,
                  domain_name: statementData.domain_name,
                  accept_withdraw_key: b2cConstants.TELEGRAM_BOT.ACCEPT_WITHDRAW_KEY
                };
                let deposit_request_msg_for_opr = withdrawRequestMsgForOpr(params);
                if (userBotDetails.user_type_id === 14) {
                  await bot.sendMessage(userBotDetails.chat_id, deposit_request_msg_for_opr);
                  await bot.sendMessage(userBotDetails.chat_id, `${b2cConstants.TELEGRAM_BOT.ACCEPT_WITHDRAW_KEY} ${statementData._id} ...`);
                }
              }
            } else
              return ResError(res, { msg: getData.data });
          }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get user wallet summary
  static getwalletsummary(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      type: Joi.string().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      limit: Joi.number().min(50).max(1000).default(50).optional(),
      page: Joi.number().min(1).max(250).default(1).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, type, from_date, to_date, limit, page } = data;
        return walletService.getwalletsummary({
          user_id, type, from_date, to_date, limit, page
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // set credit Limit
  static setcreditlimit(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      password: Joi.string().required(),
      creditlimit: Joi.number().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, creditlimit, password, parent_id } = data;
        return walletService.setcreditlimit({
          user_id, creditlimit, password, parent_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // remve payment deatils
  static removePaymentDetails(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      _id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, _id } = data;
        return walletService.removePaymentDetails({
          user_id, _id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get user payment deatils
  static getuserpayementList(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      payment_method_status: Joi.boolean().default(false).optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, payment_method_status } = data;
        return walletService.getuserpayementList({
          user_id, payment_method_status
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // domain self assign
  static domainselfassign(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      domain_id: Joi.array().min(1).max(15).required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, domain_id } = data;
        return walletService.domainselfassign({
          user_id, domain_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get domain self assign
  static getdomainassignList(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id } = data;
        return walletService.getdomainassignList({
          user_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get domain get list 
  static getdomainList(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id } = data;
        return walletService.getdomainList({
          user_id
        }, req.User)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  // get banking methods types data.
  static getBankingMethodsTypes(req, res) {
    return ResSuccess(res, { data: walletService.getBankingMethodsTypes() });
  }
  //Give Signup Bonus Amount
  static walletBonuschipIn(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      amount: Joi.number().greater(0).required(),
      crdr: Joi.number().valid(1, 2).required(),
      payment_method_id: Joi.string().required(),
      remark: Joi.string().required(),
      is_signup_credit: Joi.number().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, parent_id, amount, crdr, payment_method_id, is_signup_credit } = data;
        let userDetails = (await commonService.getUserByUserId(user_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, mobile: 1, country_code: 1
        })).data;
        let statement_type = 'DEPOSIT_REQUEST';
        let checkexistRequest = (await walletService.checkrequest({ user_id, statement_type }));
        if (checkexistRequest.data) {
          return ResError(res, { msg: "Your previous request is being processed!", statusCode: STATUS_422 });
        }
        amount = parseFloat(amount);
        let description = `Transaction By ${req.User.name}(${req.User.user_name})`;
        if (amount > userDetails.balance && crdr === DEBIT_TWO) {
          return ResError(res, { msg: "Insufficient Balance!", status: false, statusCode: STATUS_422 });
        }
        let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
        })).data;
        return walletService.walletagentsAndUsersBonusCr({
          description, crdr, amount, payment_method_id, is_signup_credit,
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
              walletagents.map(walletagent => req.IO.emit(`${walletagent}_${b2cConstants.DEPOSIT_REQUEST}`, SocSuccess({ data: [restData] })));
              return ResSuccess(res, "The balance deposit request has been successfully processed...");
            } else {
              return ResError(res, { msg: agentsAndUsersCrDr.data });
            }
          }).catch(error => {
            ResError(res, { msg: error.message, statusCode: STATUS_500 })
          });
      }).catch(error => {
        return ResError(res, error);
      });
  }
  // withdraw wallet & users balance and account statements generated v2.
  static walletchipOutV2(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      amount: Joi.number()
        .min(MINIMUM_WITHDRAWAL_AMOUNT)
        .message(`Amount must be at least ${MINIMUM_WITHDRAWAL_AMOUNT}.`)
        .required(),
      crdr: Joi.number().valid(1, 2).required(),
      remark: Joi.string().required(),
      payment_method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("payment_method_id must be a valid ObjectId").trim().optional()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        var file = req.file;
        let { user_id, parent_id, amount, crdr, payment_method_id } = data;
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
          return ResError(res, { msg: "please add atleast one payment method!", status: false, statusCode: STATUS_422 });
        }
        if (checkexistRequest.data) {
          return ResError(res, { msg: "Your previous request is under process!", status: false, statusCode: STATUS_422 });
        }
        amount = parseFloat(amount);
        let description = `Transaction By ${req.User.name}(${req.User.user_name})`;
        if (amount > userDetails.balance && crdr === DEBIT_TWO)
          return ResError(res, { msg: "Insufficient Balance!", status: false, statusCode: STATUS_422 });
        let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
        })).data;
        if (amount > parentUserDetails.balance && crdr == CREDIT_ONE)
          return ResError(res, { msg: "Insufficient Balance!", status: false, statusCode: STATUS_422 });
        else {
          return walletService.walletagentsAndUsersDrV2({
            description, crdr, amount, file, payment_method_id, req, res,
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
          }, userDetails)
            .then(async (agentsAndUsersCrDr) => {
              if (agentsAndUsersCrDr.statusCode == SUCCESS) {
                let { walletagents, ...restData } = agentsAndUsersCrDr.data;
                let resMsg = "Balance Withdraw Request Successfully...";
                for (let index = 0; index < walletagents.length; index++) {
                  const element = walletagents[index];
                  let userBotDetails = (await telegramService.getInfoByUserId(element)).data;
                  if (userBotDetails) {
                    let params = {
                      name: restData.name,
                      user_name: restData.user_name,
                      amount: restData.amount,
                      domain_name: restData.domain_name
                    };
                    let withdraw_request_msg = withdrawRequestMsg(params);
                    if (userBotDetails.user_type_id === 15 || userBotDetails.user_type_id === 4) bot.sendMessage(userBotDetails.chat_id, withdraw_request_msg);
                  }
                  req.IO.emit(`${element}_${b2cConstants.WITHDRAW_REQUEST}`, SocSuccess({
                    msg: resMsg,
                    data: [restData]
                  }));
                }
                ResSuccess(res, resMsg)
              } else {
                ResError(res, { msg: agentsAndUsersCrDr.data })
              }
            })
            .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
        }
      }).catch(error => {
        return ResError(res, error);
      });
  }
  // withdraw accepeted V2.
  static withdrawAcceptedV2(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      remark: Joi.string().optional(),
      image: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let file = req.file;
        let { statement_id, user_id, remark } = data;
        return walletService.withdrawacceptedRequestV2({ statement_id, user_id, file, remark })
          .then(walletuserData => walletuserData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'withdraw accepted' }) : ResError(res, { msg: walletuserData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }
  // withdraw rejected V2.
  static withdrawRejectedV2(req, res) {
    return Joi.object({
      statement_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("statement_id must be a valid ObjectId").trim().optional(),
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      remark: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { statement_id, user_id, remark } = data;
        return walletService.withdrawrejectedRequestV2({
          statement_id, user_id, req, res, remark
        }, data.User)
          .then(walletData => walletData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'withdraw rejected' }) : ResError(res, { msg: walletData.data }))
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static getWalletTransactionListForParent(req, res) {
    try {
      Object.assign(req.body, req.joiData);
      let { user_id, status, statement_type, limit, page, search } = req.body;
      walletService.getwalletTransactionRequestForParent({ user_id, status, statement_type, limit, page, search })
        .then(getTransactionListCrdr => {
          if (getTransactionListCrdr.statusCode === SUCCESS) {
            ResSuccess(res, getTransactionListCrdr);
          } else {
            ResError(res, { msg: getTransactionListCrdr.data });
          }
        })
        .catch(error => ResError(res, error));
    } catch (error) {
      ResError(res, { error, statusCode: STATUS_500 });
    }
  }

  static updateFloxypayBankDetailsStatus(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().required(),
      id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("id must be a valid ObjectId").trim().required(),
      status: Joi.boolean().required(),
      payment_method_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        return walletService.updateFloxypayBankDetailsStatus(data)
          .then(getData => getData.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: getData.data }) : ResError(res, { msg: getData.data }))
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static traderwithdrawlistV2(req, res) {
    req.body.user_id = ObjectId(req.joiData.user_id ? req.joiData.user_id : (req.User.user_id || req.User._id));
    return walletService.traderwithdrawlistV2(Object.assign(req.body, req.joiData))
      .then(gettransactionListCrdr => gettransactionListCrdr.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: gettransactionListCrdr.data }) : ResError(res, { msg: gettransactionListCrdr.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }
  //Give Daily Bonus Amount
  static walletDailyBonus(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      crdr: Joi.number().valid(1, 2).required(),
      remark: Joi.string().required(),
      is_daily_bonus_amount: Joi.number().required()
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let { user_id, parent_id, crdr, is_daily_bonus_amount } = data;
        let userDetails = (await commonService.getUserByUserId(user_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, mobile: 1, country_code: 1
        })).data;
        let statement_type = 'DEPOSIT_REQUEST';
        let checkexistRequest = await walletService.canRequestDailyBonus({ user_id, statement_type, is_daily_bonus_amount });
        if (checkexistRequest && checkexistRequest.data) {
          return ResError(res, {
            data: { created_at: checkexistRequest.data.nextBonusClaimDate },
            msg: `You have already claimed the daily bonus within the last 24 hours.You can try ${checkexistRequest.data.nextBonusClaimDate}.`, status: false,
            statusCode: STATUS_422
          });
        }
        let bonusAmountdata = await User.findOne({ user_type_id: USER_TYPE_SUPER_ADMIN }, { daily_bonus_amount: 1 });
        let amount = 0;
        if (bonusAmountdata.daily_bonus_amount) {
          amount = parseFloat(bonusAmountdata.daily_bonus_amount);
        }
        let description = `Transaction By ${req.User.name}(${req.User.user_name})`;
        let parentUserDetails = (await commonService.getUserByUserId(parent_id, {
          parent_id: 1, parent_user_name: 1, user_type_id: 1, user_name: 1, name: 1,
          balance: 1, parent_level_ids: 1, domain_name: 1, point: 1, domain: 1
        })).data;
        return walletService.walletDailyBonusCr({
          description, crdr, amount, is_daily_bonus_amount,
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
              await walletService.accepetedDailyBonusRequest(agentsAndUsersCrDr.data._id, userDetails);
              return ResSuccess(res, "The daily bonus request has been successfully processed.");
            } else {
              return ResError(res, { msg: agentsAndUsersCrDr.data });
            }
          }).catch(error => {
            ResError(res, { msg: error.message, statusCode: STATUS_500 })
          });
      }).catch(error => {
        return ResError(res, error);
      });
  }
  // Delete bank method
  static deleteBankMethod(req, res) {
    if (req.User.user_type_id != '4' && req.User.belongs_to == LABEL_B2C_MANAGER)
      return ResError(res, { msg: "You are not allowed to access the resource!" });
    walletService.deleteBankMethod(req.joiData)
      .then(resData => {
        if (resData.statusCode === SUCCESS) {
          ResSuccess(res, resData.data);
        } else {
          ResError(res, { msg: resData.data });
        }
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }
  // Delete bank detail
  static deleteBankDetail(req, res) {
    if ((req.User.user_type_id != '15' && req.User.belongs_to == LABEL_B2C_MANAGER) || (req.User.user_type_id != '2' && req.User.is_b2c_dealer == true))
      return ResError(res, { msg: "You are not allowed to access the resource!" });
    walletService.deleteBankDetail(req.joiData, req.User)
      .then(resData => {
        if (resData.statusCode === SUCCESS) {
          ResSuccess(res, resData.data);
        } else {
          ResError(res, { msg: resData.data });
        }
      })
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // Get Expiry Days And Msg
  static getExpiryDaysAndMsg(req, res) {
    try {
      let not_allowed = true;
      if (req.User.belongs_to == LABEL_B2C_MANAGER)
        not_allowed = false;
      else if (req.User.is_dealer == true)
        not_allowed = false;

      if (not_allowed)
        return ResError(res, { msg: "You are not allowed to access the resource!" });
      let is_bank_method = req.joiData.is_bank_method;
      let msg;
      if (is_bank_method)
        msg = `The bank details associated with the payment method are also deleted when you remove the payment method. You can restore them within ${b2cConstants.EXPIRY_FOR_BANK_DETAILS} days before they are permanently deleted.`
      else
        msg = `The bank details were deleted. You can restore them within ${b2cConstants.EXPIRY_FOR_BANK_DETAILS} days before they are permanently deleted.`
      let resData = { EXPIRY_FOR_BANK_DETAILS: b2cConstants.EXPIRY_FOR_BANK_DETAILS, msg: msg };
      ResSuccess(res, resData);
    } catch (error) {
      ResError(res, { error, statusCode: STATUS_500 });
    }
  }

  // deposit accepted by deler.
  static depositAcceptedByDeler(req, res) {
    return walletService.depositAccepetedRequestByDealer(req.body, req.User)
      .then(statementList => statementList.statusCode == SUCCESS ? ResSuccess(res, { 'msg': statementList.data }) : ResError(res, { msg: statementList.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  // deposit accepted by deler.
  static withDrawalAcceptedByDeler(req, res) {
    return walletService.withDrawalAcceptedByDeler(req.body, req.User)
      .then(statementList => statementList.statusCode == SUCCESS ? ResSuccess(res, { 'msg': statementList.data }) : ResError(res, { msg: statementList.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static getAllTransactionsList(req, res) {
    req.joiData.user_id = ObjectId(req.User.user_id || req.User._id);
    return walletService.getAllTransactionsList(req.joiData)
      .then(gettransactionList => gettransactionList.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: gettransactionList.data }) : ResError(res, { msg: gettransactionList.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static getBonusDetails(req, res) {
    return walletService.getBonusDetails(req)
      .then(bonusDetails => bonusDetails.statusCode == SUCCESS ? ResSuccess(res, { 'msg': 'success', data: bonusDetails.data }) : ResError(res, { msg: bonusDetails.data }))
      .catch(error => ResError(res, error));
  }
  static getwalletDWTransactionList(req, res) {
    return walletController.getwalletAllTransaction(req, res);
  }

}