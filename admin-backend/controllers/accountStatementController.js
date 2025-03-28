const Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ObjectId } = require("bson")
  , xlsx = require('xlsx')
  , { ResError, ResSuccess } = require('../../lib/expressResponder')
  , statementService = require('../service/statementService')
  , accountStatementService = require('../service/accountStatementService')
  , { SUCCESS, NOT_FOUND, SERVER_ERROR, USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, CREDIT_ONE,
    LABEL_DIAMOND
  } = require('../../utils/constants')
  , { STATUS_422, STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')

const User = require('../../models/user')
const { exponentialToFixed } = require('../../utils');
const fs = require('fs');
const path = require('path');
// const pdf = require('html-pdf');
let templatePath = path.join(__dirname, "../../PDF/html/statement.html");
const handlebars = require('handlebars');
const { updateLogStatus } = require('../service/userActivityLog');
const { LOG_SUCCESS, LOG_VALIDATION_FAILED } = require('../../config/constant/userActivityLogConfig');
handlebars.registerHelper('getProperty', function (object, property) {
  return object[property];
});
// Define the formatDate helper function
handlebars.registerHelper('formatDate', function (date) {
  const options = { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', options).format(new Date(date));
});
// Register the eq helper
handlebars.registerHelper('eq', function (a, b, options) {
  if (a === b) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

module.exports = class AccountStatementController {

  // deposit and withdraw agents & users balance and account statements generated.
  static chipInOut(req, res) {
    return Joi.object({
      user_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("user_id must be a valid ObjectId").trim().optional(),
      parent_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("parent_id must be a valid ObjectId").trim().optional(),
      remark: Joi.string().allow('', null).trim(),
      amount: Joi.number().greater(0).required(),
      crdr: Joi.number().valid(1, 2).required(),
      password: Joi.string().min(6).max(12).required(),
      pass_type: Joi.string().optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async () => {

        if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
          && req?.User._id == req.body.user_id) {
          return ResError(res, { msg: "You can't Debit/Credit self Balance !!" });
        }

        const { domain_name, total_deposit_count, belongs_to_b2c, user_type_id, parent_id } = req?.user;
        let bonusPercentage = 0;

        // Return if body user_id user has parent Id not equal to login users id.
        if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN
          && !req.User?.belongs_to_b2c
          && parent_id != req.User._id) {
          return ResError(res, { msg: "You can only Debit/Credit from Direct Downline Accounts" });
        }

        // Auto Set Parent Id to User's Parent Id
        req.body.parent_id = parent_id;

        if (belongs_to_b2c && user_type_id == USER_TYPE_USER && req.body.crdr == CREDIT_ONE) {
          const bonusData = await accountStatementService.getDepositCountandBonusData({
            domain_name, user_id: req.body.user_id, total_deposit_count,
          });
          bonusPercentage = bonusData.bonusPercentage;
        }

        return statementService.chipInOut(req)
          .then(result => {
            if (result.statusCode == SUCCESS) {

              // Check if Bonus has some value
              if (bonusPercentage) {

                // Fetch User Latest Balance and Bonus
                return User.findOne({ _id: req.user._id },
                  { balance: 1, bonus: 1, liability: 1 })
                  .lean()
                  .then(user => {

                    req.user = { ...req.user, ...user };
                    req.body.amount = exponentialToFixed((bonusPercentage / 100) * req.body.amount);
                    req.body.is_bonus = true;
                    req.body.remark = 'Bonus';

                    return statementService.chipInOut(req)
                      .then(result => {
                        return result.statusCode == SUCCESS
                          ? ResSuccess(res, { msg: result.data })
                          : ResError(res, { msg: result.data });
                      })
                      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));

                  }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
              } else {
                return ResSuccess(res, { msg: result.data });
              }

            } else {
              return ResError(res, { msg: result.data });
            }
          })
          .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  }

  static async chipInOutDiamond(req, res) {
    try {
      const result = await accountStatementService.chipInOutDiamond(req);
      if (result.statusCode == SUCCESS) {
        return ResSuccess(res, result.data);
      } else {
        return ResError(res, result.data);
      }
    } catch (error) {
      return ResError(res, { msg: error.message });
    }
  }

  // To get account statement list
  static async statements(req, res) {
    const data = req.joiData;
    data.user_id = ObjectId(data.user_id ? data.user_id : (req.User.user_id || req.User._id));
    return accountStatementService.getAccountStatement(data).then(accountSatement => {
      if (accountSatement.statusCode != SUCCESS)
        return ResError(res, { msg: accountSatement.data });
      return ResSuccess(res, { data: accountSatement.data });
    }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static async statementsDocument(req, res) {
    const data = req.joiData;
    data.user_id = ObjectId(data.user_id ? data.user_id : (req.User.user_id || req.User._id));
    return accountStatementService.getAccountStatementDocument(req, res, data)
      .then(result => {
        if (result.statusCode != SUCCESS) {
          return ResError(res, { msg: result.data });
        } else if (!result?.data?.isDoc) {
          return ResSuccess(res, result.data);
        }
      }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  }

  static userAccountStatement(req, res) {
    req.body.statement_type = 1;
    req.joiData.statement_type = 1;
    return AccountStatementController.statements(req, res);
  }

  static async makeSettlement(req, res) {
    try {
      if (req.user.user_type_id == USER_TYPE_SUPER_ADMIN
        || req.user.user_type_id == req.User.user_type_id) {
        return ResError(res, { msg: "You are not allowed!", statusCode: STATUS_422 });
      }

      const data = { ...req.joiData, path: req.path }
      const profitLoss = await accountStatementService.makeSettlement(data, req.user, req.User)

      if (profitLoss.statusCode != SUCCESS) {
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: profitLoss.data })
        return ResError(res, { msg: profitLoss.data });
      } else {
        updateLogStatus(req, { status: LOG_SUCCESS, msg: profitLoss.data })
        return ResSuccess(res, { msg: profitLoss.data });
      }
    } catch (error) {
      updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: error.message })
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

  static async makeSettlementDiamond(req, res) {
    try {

      if (req.User.belongs_to != LABEL_DIAMOND) {
        return ResError(res, { msg: "This Operation is not allowed to you.", statusCode: STATUS_422 })
      }

      const result = await accountStatementService.makeSettlementDiamond(req)

      if (result.statusCode != SUCCESS) {
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: result.data })
        return ResError(res, { msg: result.data, statusCode: STATUS_422 });
      } else {
        updateLogStatus(req, { status: LOG_SUCCESS, msg: result.data })
        return ResSuccess(res, { msg: result.data });
      }
    } catch (error) {
      updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: error.message })
      return ResError(res, { msg: error.message, statusCode: STATUS_500 });
    }
  }

  static async makeSettlementDiamondMulti(req, res) {
    try {
      const response = await accountStatementService.makeSettlementDiamondMulti(req);

      if (response.statusCode != SUCCESS) {
        updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: response.data })
        return ResError(res, { msg: response.data });
      } else {
        updateLogStatus(req, { status: LOG_SUCCESS, msg: "Success" });
        return ResSuccess(res, { data: response.data, msg: "Success" });
      }

    } catch (error) {
      updateLogStatus(req, { status: LOG_VALIDATION_FAILED, msg: error.message })
      return ResError(res, error);
    }
  }

  // Download statement in excel format
  static downloadStatementExcel(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      sport_id: Joi.string().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      statement_type: Joi.number().optional().default(null)
    }).validateAsync(req.query, { abortEarly: false })
      .then(data => {
        data.user_id = ObjectId(data.user_id ? data.user_id : (req.User.user_id || req.User._id));

        return accountStatementService.downloadStatements(data)
          .then(accountStatement => {
            if (accountStatement.statusCode == NOT_FOUND) {
              return ResSuccess(res, { data: {} });
            } else if (accountStatement.statusCode == SERVER_ERROR) {
              return ResError(res, { msg: accountStatement.data, statusCode: STATUS_500 });
            } else {
              // return ResSuccess(res, { data: accountStatement.data });
              try {
                // Define column mapping
                const columnMapping = {
                  "Date": "date", // Format the date immediately
                  "Transaction Type": "statement_type",
                  "Credit Debit": "credit_debit",
                  "Balance": "balance",
                  "Description": "description",
                  "Remark": "remark"
                };
                const wb = xlsx.utils.book_new();
                const ws = xlsx.utils.json_to_sheet(accountStatement.data.map(statement => {
                  const statementsData = {};
                  Object.entries(columnMapping).forEach(([key, value]) => {
                    if (key === "Transaction Type") {
                      // Handle transaction type (credit/debit)
                      if (statement[value] === 1) {
                        statementsData[key] = "Credit";
                      } else {
                        statementsData[key] = "Debit";
                      }
                    } else {
                      statementsData[key] = statement[value];
                    }
                  });
                  return statementsData;
                }));
                xlsx.utils.book_append_sheet(wb, ws, "Statements");
                const excelBuffer = xlsx.write(wb, { type: 'buffer' });

                res.writeHead(200, {
                  'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'Content-Disposition': 'attachment; filename=Statements.xlsx'
                });
                res.end(excelBuffer);
              } catch (error) {
                ResError(res, { msg: error.message, statusCode: STATUS_500 })
              }

            }
          })
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      })
      .catch(error => {
        return ResError(res, error);
      });
  }

  // Download statement
  static downloadStatementsPdf(req, res) {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      sport_id: Joi.string().optional(),
      from_date: Joi.string().optional(),
      to_date: Joi.string().optional(),
      statement_type: Joi.number().optional().default(null)
    }).validateAsync(req.query, { abortEarly: false })
      .then(data => {
        data.user_id = ObjectId(data.user_id ? data.user_id : (req.User.user_id || req.User._id));

        return accountStatementService.downloadStatements(data)
          .then(accountStatement => {
            if (accountStatement.statusCode == NOT_FOUND) {
              return ResSuccess(res, { data: {} });
            } else if (accountStatement.statusCode == SERVER_ERROR) {
              return ResError(res, { msg: accountStatement.data });
            } else {
              // return ResSuccess(res, { data: accountStatement.data });
              fs.readFile(templatePath, 'utf8', function (err, html) {
                if (err) {
                  console.error('Error reading HTML file:', err);
                  res.status(500).send('Internal Server Error');
                  return;
                }
                const template = handlebars.compile(html);
                const dynamicData = {
                  statements: accountStatement.data
                };
                const compiledHtml = template(dynamicData);

                pdf.create(compiledHtml).toStream(function (err, stream) {
                  if (err) {
                    console.error('Error generating PDF:', err);
                    ResError(res, "Internal Server Error")
                  }
                  res.writeHead(200, {
                    'Content-Type': 'application/force-download',
                    'Content-disposition': 'attachment; filename=statement.pdf'
                  });
                  stream.pipe(res);
                });
              });

            }
          })
          .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      })
      .catch(error => {
        return ResError(res, error);
      });
  }

}