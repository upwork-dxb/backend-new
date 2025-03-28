const { ObjectId } = require("bson")
  , bcrypt = require('bcrypt')
  , _ = require('lodash')
  , OAuth2Server = require("oauth2-server")
  , User = require('../../models/user')
  , UserLoginLogs = require('../../models/userLoginLogs')
  , WebsiteSetting = require('../../models/websiteSetting')
  , Partnerships = require('../../models/partnerships')
  , AccountStatement = require('../../models/accountStatement')
  , OAuthToken = require('../../models/oAuthToken')
  , CreditReferenceLog = require('../../models/creditReferenceLog')
  , PasswordHistory = require('../../models/passwordHistory')
  , redisClient = require("../../connections/redisConnections")
  , userQuery = require('./userQuery')
  , oauthtokenService = require('./oauthtokenService')
  , telegramService = require('../service/telegramService')
  , CONSTANT = require('../../utils/constants')
  , globalFunction = require('../../utils/globalFunction')
  , { checkDomain, userLoginLogs, getIpDetails } = require("../../utils")
  , utils = require("../../utils")
  , UserEvent = require('../../lib/node-event').event
  , {
    SUCCESS, NOT_FOUND, SERVER_ERROR, VALIDATION_ERROR, DATA_NULL, VALIDATION_FAILED,
    USER_TYPE_SUPER_ADMIN, USER_TYPE_USER, USER_TYPE_DEALER, IS_VALIDATE_DOMAIN_LOGIN,
    LABEL_DIAMOND
  } = require('../../utils/constants');
const moment = require("moment");
const {
  getUsersListDiamond,
  getUsersListDiamondDocument,
  getUsersListDiamondBankDocument,
} = require('./userService/diamondUsers');
const { getUsersListCRef } = require('./userService/usersListCRef');
const { getAgentBalance: getAgentBalanceV1 } = require('./userService/getAgentBalance');
const { getUserBalance: getUserBalanceV1 } = require('./userService/userFinanceData');
const { getCreditDataDiamond, } = require('./userService/getCreditDataDiamond');
let resultResponse = globalFunction.resultResponse;
// const {
//   IS_DEFAULT_AUTH_TELEGRAM_ENABLE,
// } = require("../../config/constant/user");
const { getIPAddressUID } = require("../../utils/getter-setter");
const {
  LABEL_UKRAINE
} = require('../../utils/constants');
const { calculateChildrenCreditReference } = require("./accountStatementService");
const CONSTANTS = require("../../utils/constants");
const saltRounds = 10;

// For OAuth2----------------
const Request = OAuth2Server.Request,
  Response = OAuth2Server.Response;
const oauth = new OAuth2Server({
  model: require('../../oauthmodel'),
  accessTokenLifetime: CONSTANT.OAUTH_TOKEN_VAILIDITY,
  allowBearerTokensInQueryString: true
});

async function updateCreditReference(req, new_credit_reference) {
  let cRefLog;

  try {
    const { _id, parent_id, user_name, name, user_type_id, credit_reference, is_auto_credit_reference } = req.user;

    if (is_auto_credit_reference) {
      return resultResponse(VALIDATION_ERROR, { msg: "Auto Credit Reference Enabled for the User!" });
    }

    if ((req.User._id).toString() == (_id).toString())
      return resultResponse(VALIDATION_ERROR, { msg: "You are not allowed to change credit references value!" });

    let old_credit_reference = credit_reference;
    if (new_credit_reference == old_credit_reference)
      return resultResponse(VALIDATION_ERROR, { msg: "Old and new credit references are the same!" });

    let from = `${req.User.name}(${req.User.user_name})`;
    if (parent_id.toString() == req.User._id.toString())
      from = " Upline";

    cRefLog = await CreditReferenceLog.create({
      from, user_id: req.user._id, user_name, name, user_type_id, old_credit_reference, new_credit_reference
    });

    await User.updateOne({ _id: req.user._id }, { credit_reference: new_credit_reference })

    const change = old_credit_reference - new_credit_reference;

    const parentUser = await User.findOne({ _id: parent_id }, ["_id",
      "children_credit_reference", "parent_id", "parent_user_name", "domain", "domain_name", "user_type_id"]).exec();

    if (!parentUser.children_credit_reference) {
      // Calculate if not Already Exists
      let children_credit_reference = 0;

      const c_r_sum_result = await calculateChildrenCreditReference(parent_id);

      if (c_r_sum_result.statusCode != SUCCESS) {
        return resultResponse(SERVER_ERROR, c_r_sum_result.data);
      }
      children_credit_reference = utils.fixFloatingPoint(c_r_sum_result.data);
      parentUser.children_credit_reference = children_credit_reference;

    } else {
      parentUser.children_credit_reference = utils.fixFloatingPoint(parentUser.children_credit_reference + change);
    }
    await parentUser.save();

    return resultResponse(SUCCESS, { msg: `Credit reference updated successfully...` })
  } catch (error) {
    if (cRefLog) {
      cRefLog.deleteOne({ _id: cRefLog._id }).then().catch(console.error);
    }
    return resultResponse(SERVER_ERROR, { msg: error.message });

  }
}
async function getUserByUserId(userCondition, projection = { _id: 1 }) {
  try {
    let userConditionFilter = {}, userConditionProjection = {};
    if (Object.keys(userCondition).length)
      userConditionFilter = userCondition;
    if (Object.keys(projection).length)
      userConditionProjection = projection;
    let userdetails = await User.findOne(userConditionFilter, userConditionProjection).lean();
    if (userdetails)
      return resultResponse(SUCCESS, JSON.parse(JSON.stringify(userdetails)));
    else
      return resultResponse(NOT_FOUND, DATA_NULL);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

function getUsersDetails(FilterQuery = {}, Projection = {}, populates = [], findOne = false) {
  let userDetails;
  if (findOne)
    userDetails = User.findOne(FilterQuery);
  else
    userDetails = User.find(FilterQuery);
  userDetails.select(Array.isArray(Projection) ? Projection : Projection);
  if (populates.length)
    populates.map(populate => {
      userDetails.populate(populate);
    });
  return userDetails
    .lean()
    .then(user => {
      if (user != null)
        if (Object.keys(user).length || user.length)
          return resultResponse(SUCCESS, user);
      return resultResponse(NOT_FOUND, "User or it's Details not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
};

function getUserDetails(FilterQuery = {}, Projection = {}, populates = []) {
  return getUsersDetails(FilterQuery, Projection, populates, true).then();
}

async function detailsForAddAgentClient(params) {
  const { user_id, user_type_id, isSuperAdmin, is_sub_superadmin } = params;
  let FilterQuery = "name user_name user_type_id sports_permission parent_level_ids userSettingSportsWise partnerships match_stack point ";
  FilterQuery += "exposure_limit credit_reference belongs_to_credit_reference belongs_to rate mobile partnership refer_code balance balance_reference self_lock_user parent_lock_user self_lock_betting parent_lock_betting self_lock_fancy_bet self_close_account parent_close_account is_multi_login_allow parent_lock_fancy_bet";
  if (user_type_id != USER_TYPE_SUPER_ADMIN)
    FilterQuery += "domain domain_name";
  let userModel = User.findById(user_id)
    .select(FilterQuery)
    .populate('userSettingSportsWise', '-_id match_commission session_commission')
  // When super admin data shown, We show all active domains.
  if (user_type_id != USER_TYPE_SUPER_ADMIN)
    userModel.populate('domain', 'host_name site_title domain_name');
  userModel.lean();
  return userModel
    .then(userDetails => {
      if (!userDetails)
        return resultResponse(NOT_FOUND, "User not found");
      return Partnerships.findById(userDetails.partnerships)
        .select(`
          -parent_id -_id
          -sports_share._id
          -createdAt -updatedAt
        `)
        .then(partnerships => {
          let sports_share = partnerships.sports_share;
          userDetails = JSON.parse(JSON.stringify(userDetails));
          Object.assign(userDetails, {
            sports_share,
            match_commission: userDetails.userSettingSportsWise.match_commission,
            session_commission: userDetails.userSettingSportsWise.session_commission
          });
          delete userDetails.userSettingSportsWise;
          delete userDetails.partnerships;
          let showSecretDetails =
            userDetails.user_type_id == USER_TYPE_SUPER_ADMIN ? true :
              (isSuperAdmin && is_sub_superadmin) ? true : false;
          if (showSecretDetails)
            return WebsiteSetting.find({})
              .select("host_name site_title domain_name")
              .lean()
              .then(domains => {
                userDetails["domain"] = domains;
                let tags = getWebsiteTags();
                if (tags.statusCode == SUCCESS)
                  userDetails["labels"] = tags.data;
                return resultResponse(SUCCESS, userDetails);
              });
          return resultResponse(SUCCESS, userDetails);
        }).catch(error => resultResponse(SERVER_ERROR, error.message))
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getWebsiteTags() {
  try {
    let labels = [];
    Object.keys(CONSTANT).map(keys => {
      if (keys.includes("LABEL_")) labels.push(CONSTANT[keys]);
    });
    return resultResponse(SUCCESS, labels);
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message)
  }
}
function getUsersListCRefOld(params) {
  return User.aggregate(userQuery.getUsersListCRef(params))
    .then(users => {
      if (users.length)
        return resultResponse(SUCCESS, users[0]);
      else
        return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getUsersListDiamondOld(request) {
  let { User: Self, user, body } = request
    , isSearch = body.user_id, agents = user.parent_level_ids, breadcrumbs = agents;
  body.user_id = ObjectId(isSearch ? isSearch : (Self.user_id || Self._id));
  if (Self.user_type_id != USER_TYPE_SUPER_ADMIN) {
    if (isSearch) {
      if (isSearch != (Self._id).toString()) {
        const agentIndex = agents.findIndex(x => x.user_name == Self.user_name);
        breadcrumbs = agents.slice(agentIndex);
        breadcrumbs.push({
          user_id: user._id,
          user_name: user.user_name,
          name: user.user_name,
          user_type_id: user.user_type_id
        });
      } else breadcrumbs = [{
        user_id: Self._id,
        user_name: Self.user_name,
        name: Self.user_name,
        user_type_id: Self.user_type_id
      }];
    } else
      breadcrumbs = [{
        user_id: Self._id,
        user_name: Self.user_name,
        name: Self.user_name,
        user_type_id: Self.user_type_id
      }];
  }
  return User.aggregate(userQuery.getUsersListDiamond(request))
    .then(users => {
      if (users.length) {
        return resultResponse(SUCCESS, {
          data: users[0],
          parent_id: isSearch ? user.parent_id : Self.parent_id,
          parent_name: isSearch ? user.parent_user_name : Self.parent_user_name,
          breadcrumbs
        });
      } else
        return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getBalanceReferenceSum(user_id) {
  return User.aggregate(userQuery.getBalanceReferenceSum(user_id))
    .then(getBalanceReferenceSum => {
      if (getBalanceReferenceSum.length)
        return resultResponse(SUCCESS, getBalanceReferenceSum[0].balance_reference);
      else
        return resultResponse(SUCCESS, 0);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function updateUserPartnership(request) {

  if (request.body.user_id == request.User._id) {
    return resultResponse(NOT_FOUND, "Can't modify Self Partnership...");
  }

  // Getting parent partnership details
  return getUserDetails({ _id: ObjectId(request.user.parent_id) }, ["-_id", "partnership"])
    .then(parentData => {

      if (parentData.statusCode == SUCCESS) {

        parentData = parentData.data;

        const { partnership, user_id } = request.body;

        if (parentData.partnership >= partnership) {
          return resultResponse(VALIDATION_ERROR, "Please Enter Valid Partnership!");
        }

        return User.updateOne({ "_id": user_id }, { "$set": { partnership } })
          .then(() => resultResponse(SUCCESS, "Partnership updated successfully..."))
          .catch(error => resultResponse(SERVER_ERROR, error.message));

      } else {
        return resultResponse(NOT_FOUND, parentData.data);
      }
    }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

function updateChipSummary(request) {
  const { isChipSummary } = request.body;
  return User.updateOne({ "_id": request.User.user_id }, { "$set": { isChipSummary } })
    .then(() => resultResponse(SUCCESS, "Chip Summary Successfully Updated."))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function markDealerAsB2c(request) {
  const { user_id, is_b2c_dealer } = request.body;
  if (user_id == request.User._id) {
    return resultResponse(VALIDATION_FAILED, "Can Update youself..")
  }
  const userDetails = await User.findOne({ _id: ObjectId(user_id), is_dealer: true, user_type_id: USER_TYPE_DEALER }, { _id: 1 }).lean();
  if (!userDetails)
    return resultResponse(VALIDATION_FAILED, "The user ID you provided does not belong to a dealer.")
  return User.updateOne({ "_id": ObjectId(user_id) }, { "$set": { is_b2c_dealer } })
    .then(() => resultResponse(SUCCESS, "Dealer mark as b2c Successfully Updated."))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function allowSocialMediaDealer(request) {
  const { user_id, allow_social_media_dealer } = request.body;

  if (user_id == request.User._id) {
    return resultResponse(VALIDATION_FAILED, "Can Update youself..")
  }

  const userDetails = await User.findOneAndUpdate(
    { _id: ObjectId(user_id), is_dealer: true, user_type_id: USER_TYPE_DEALER },
    { $set: { allow_social_media_dealer } },
    {
      "fields": { "_id": 1 }
    }
  );
  if (!userDetails) {
    return resultResponse(
      VALIDATION_FAILED,
      "The user ID you provided does not belong to a dealer."
    );
  }

  return resultResponse(SUCCESS, "Allow social media successfully updated.");
}

function getBalanceCRef(params) {
  return User
    .aggregate()
    .match({
      _id: ObjectId(params._id)
    })
    .project({
      _id: 0,
      balance: 1,
      user_name: { $concat: ["$name", " (", "$user_name", ")"] },
      label: {
        "$switch": {
          "branches": [
            { "case": { "$eq": [9, "$user_type_id"] }, "then": "SUPER ADMIN" },
            { "case": { "$eq": [8, "$user_type_id"] }, "then": "WHITE LABEL" },
            { "case": { "$eq": [7, "$user_type_id"] }, "then": "SUB ADMIN" },
            { "case": { "$eq": [6, "$user_type_id"] }, "then": "HYPER" },
            { "case": { "$eq": [5, "$user_type_id"] }, "then": "SENIOR SUPER" },
            { "case": { "$eq": [4, "$user_type_id"] }, "then": "SUPER" },
            { "case": { "$eq": [3, "$user_type_id"] }, "then": "MASTER" },
            { "case": { "$eq": [2, "$user_type_id"] }, "then": "AGENT" },
            { "case": { "$eq": [1, "$user_type_id"] }, "then": "USER" },
            { "case": { "$eq": [0, "$user_type_id"] }, "then": "MAIN" }
          ]
        }
      }
    })
    .then(user => resultResponse(SUCCESS, user))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getWalletUser(params) {
  let filter;

  if (params.status == '1') {
    filter = {
      'parent_id': params.parent_id,
      'parent_level_ids.user_id': { $in: [params.parent_id, params.login_user_id] }
    };
  } else if (params.status == '2') {
    filter = {
      user_type_id: 14,
      'parent_level_ids.user_id': { $in: [params.parent_id, params.login_user_id] }
    };
  } else {
    filter = {
      'parent_id': params.parent_id,
      'parent_level_ids.user_id': { $in: [params.parent_id, params.login_user_id] }
    };
  }
  return User.find(filter)
    .select([
      "_id", "user_name", "name", "total_deposit", "total_withdraw",
      "balance", "domain", "domain_name"
    ])
    .then(users => {
      if (users.length)
        return resultResponse(SUCCESS, users);
      else
        return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function getMatchStacks(request) {
  let { user_id } = request.body;
  if (user_id) return resultResponse(SUCCESS, {
    msg: `${request.user.name}(${request.user.user_name}) stacks.`,
    match_stack: request.user.match_stack
  });
  else return getUsersDetails({ _id: (request.User.user_id || request.User._id) }, { match_stack: 1 }, [], true)
    .then(result => resultResponse(result.statusCode, result.statusCode == SUCCESS ? {
      msg: `${request.User.name}(${request.User.user_name}) stacks.`,
      match_stack: result.data.match_stack,
      data: { match_stack: result.data.match_stack }
    } : result.data));
}

async function setMatchStack(request) {
  let { user_id, user_id: isUserIdPassed, match_stack } = request.body;
  user_id = ObjectId(user_id ? (user_id) : (request.User.user_id || request.User._id));
  let user_type_id = isUserIdPassed ? request.user.user_type_id : request.User.user_type_id
    , updateUser;
  if (user_type_id == USER_TYPE_SUPER_ADMIN)
    updateUser = User.updateMany({}, { "$set": { match_stack } });
  else if (user_type_id == USER_TYPE_USER)
    updateUser = User.updateOne({ "_id": user_id }, { "$set": { match_stack } });
  else
    updateUser = User.updateMany(
      { "$or": [{ "_id": user_id }, { "parent_level_ids.user_id": { "$in": [user_id] } }] },
      { "$set": { match_stack } }
    );
  return updateUser
    .then(() => resultResponse(SUCCESS, "Match stacks updated successfully..."))
    .catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function closeAccount(request) {
  const { _id: user_id, parent_id, parent_level_ids } = request.user;
  if ((request.User._id).toString() == (user_id).toString())
    return resultResponse(VALIDATION_ERROR, "Self-closing account operations are not allowed!");
  const getParentStatus = await User.findOne({ _id: parent_id }).select("-_id self_close_account parent_close_account").lean();
  if (Math.max(getParentStatus.self_close_account, getParentStatus.parent_close_account) == 1)
    return resultResponse(VALIDATION_ERROR, "Parent account already closed!");
  const { self_close_account, parent_close_account, user_type_id } = request.user
    , { action } = request.body;
  if (Math.max(self_close_account, parent_close_account) == action)
    return resultResponse(VALIDATION_ERROR, (`${(user_type_id == USER_TYPE_USER) ? "User" : "Agent"} account already ${action ? "closed" : "open"}!`).trim());
  let query = {};
  if (user_type_id == USER_TYPE_USER)
    query._id = user_id;
  else
    query = { '$or': [{ '_id': user_id }, { 'parent_level_ids.user_id': user_id }] };
  return User.updateMany(
    query,
    [
      {
        '$set': {
          self_close_account: { "$cond": [{ "$eq": ["$_id", user_id] }, action, 0] },
          parent_close_account: { "$cond": [{ "$eq": ["$_id", user_id] }, 0, action] }
        },
      }
    ]
  ).then(async result => {

    if (result.modifiedCount) {

      if (action) {
        oauthtokenService.expireTokens({ user_id: user_id.toString() }).then();
      }

      if (user_type_id == USER_TYPE_USER) {

        const upperAgents = parent_level_ids.map(data => data.user_name);

        User.updateMany(
          { user_name: { '$in': upperAgents } },
          { '$inc': { total_downline_users_count: action == 1 ? -1 : 1 } }
        ).then().catch(console.error);


      } else {

        let agentsCounts = await User.countDocuments({
          user_type_id: { $ne: USER_TYPE_USER }, "parent_level_ids.user_id": ObjectId(user_id)
        });

        // Increse self count for agent case.
        agentsCounts += 1;

        let usersCounts = await User.countDocuments({
          user_type_id: USER_TYPE_USER, "parent_level_ids.user_id": ObjectId(user_id)
        });

        User.updateMany(query, { "$unset": { is_total_count_calculated: 1 } }).then().catch(console.error);

        const upperAgents = parent_level_ids.map(data => data.user_name);

        // Updating the upper line count.
        User.updateMany(
          { user_name: { '$in': upperAgents } },
          {
            '$inc': {
              total_downline_users_count: action ? -usersCounts : usersCounts,
              total_downline_agents_count: action ? -agentsCounts : agentsCounts
            }
          }
        ).then().catch(console.error);

      }

      return resultResponse(SUCCESS, `Account ${action ? "closed" : "open"} successfully...`);

    }

    return resultResponse(NOT_FOUND, "No action taken!");

  }).catch(error => resultResponse(SERVER_ERROR, error.message));

}

async function lockAccount(request) {
  const { _id: user_id, parent_id } = request.user;
  if ((request.User._id).toString() == (user_id).toString())
    return resultResponse(VALIDATION_ERROR, "Self-locking account operations are not allowed!");
  const getParentStatus = await User.findOne({ _id: parent_id }).select("-_id self_lock_user parent_lock_user").lean();
  if (Math.max(getParentStatus.self_lock_user, getParentStatus.parent_lock_user) == 1)
    return resultResponse(VALIDATION_ERROR, "Parent account already locked!");
  const { self_lock_user, parent_lock_user, user_type_id } = request.user
    , { action } = request.body;
  if (Math.max(self_lock_user, parent_lock_user) == action)
    return resultResponse(VALIDATION_ERROR, (`${(user_type_id == USER_TYPE_USER) ? "User" : "Agent"} account already ${action ? "locked" : "un-locked"}!`).trim());
  let query = {};
  if (user_type_id == USER_TYPE_USER)
    query._id = user_id;
  else
    query = { '$or': [{ '_id': user_id }, { 'parent_level_ids.user_id': user_id }] };
  return User.updateMany(
    query,
    [
      {
        '$set': {
          self_lock_user: { "$cond": [{ "$eq": ["$_id", user_id] }, action, 0] },
          parent_lock_user: { "$cond": [{ "$eq": ["$_id", user_id] }, 0, action] }
        },
      }
    ]
  ).then(result => {
    if (result.modifiedCount) {
      if (action)
        oauthtokenService.expireTokens({ user_id: user_id.toString() }).then();
      return resultResponse(SUCCESS, `Account ${action ? "locked" : "un-locked"} successfully...`);
    }
    return resultResponse(NOT_FOUND, "No action taken!");
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getDiamondUsersTotalCr(request) {
  let { User: Self, user, body } = request;
  let isSearch = body.user_id;
  body.user_id = ObjectId(isSearch ? isSearch : (Self.user_id || Self._id));
  return User.aggregate(userQuery.getDiamondUsersTotalCr(request))
    .then(users => {
      if (users.length) {
        return resultResponse(SUCCESS, {
          data: users[0]
        });
      } else {
        return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
      }
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function createAccountStatement({
  newUser, parentData, desc,
  remark, opening_balance,
  parentUserBalance, session,
  statement_type, parentUserBonus,
}) {

  const child = {
    parent_id: newUser.parent_id,
    parent_user_name: newUser.parent_user_name,
    user_id: newUser._id,
    user_type_id: newUser.user_type_id,
    user_name: newUser.user_name,
    name: newUser.name,
    domain_name: newUser.domain_name,
    agents: newUser.parent_level_ids,
    point: newUser.point,
    description: desc,
    remark: remark,
    statement_type,
    amount: opening_balance,
    available_balance: newUser.balance,
    bonus: statement_type != 7 ? 0 : newUser.bonus || 0,
  };

  const parent = {
    parent_id: parentData.parent_id,
    parent_user_name: parentData.parent_user_name,
    user_id: parentData._id,
    user_type_id: parentData.user_type_id,
    user_name: parentData.user_name,
    name: parentData.name,
    domain_name: parentData.domain_name,
    agents: parentData.parent_level_ids,
    point: parentData.point,
    description: desc,
    remark: remark,
    statement_type,
    amount: -opening_balance,
    available_balance: parentUserBalance,
    bonus: statement_type != 7 ? 0 : parentUserBonus || 0,
  };

  await AccountStatement.insertMany([parent, child], { session });

}

function getClientPL(req) {
  return User.aggregate(userQuery.getClientPL(req))
    .then(users => {
      if (users.length)
        return resultResponse(SUCCESS, users[0]);
      else
        return resultResponse(NOT_FOUND, "No client pl yet!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function adminLogin(req, res) {
  try {
    const { user_name, password, user_id, otp } = req.joiData;

    const { isVerifyAdminOTP } = req.body;
    let user;

    // If Not Verifying Otp
    // if (!isVerifyAdminOTP) {
    if (0) {
      // Fetch User From Redis
      const key = CONSTANT.USER_DATA_KEY + (user_name || '').toLowerCase() + CONSTANT.UNIQUE_IDENTIFIER_KEY;
      const cachedUser = await redisClient.get(key);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      }
    }

    if (!user) {
      // If Verifying OTP or User Not Exists
      const filter = !isVerifyAdminOTP ? { user_name } : { _id: user_id };
      user = await User.findOne(filter).select(userQuery.getFieldForRedisUser()).lean();

      if (!user) {
        return resultResponse(NOT_FOUND, { msg: "Invalid credentials! Please try again." });
      }

      user.user_id = user._id;
      user.id = user._id;

      // Save User in Redis If Not Verifying OTP and User Exists
      if (!isVerifyAdminOTP && user) {
        // redisClient.set(CONSTANT.USER_DATA_KEY + user.user_name.toLowerCase() + CONSTANT.UNIQUE_IDENTIFIER_KEY, JSON.stringify(user));
      }
    }
    if (user.belongs_to == LABEL_DIAMOND) {
      if (user.is_transaction_password_locked)
        return resultResponse(NOT_FOUND, { msg: "UserName not available" });
    }
    if (isVerifyAdminOTP) {

      if (
        (user.is_telegram_enable &&
          user.otp_purpose != CONSTANTS.OTP_PURPOSE.TELEGRAM) ||
        (user.is_auth_app_enabled &&
          user.otp_purpose != CONSTANTS.OTP_PURPOSE.AUTH_APP_LOGIN_AND_DISABLE)
      ) {
        return resultResponse(NOT_FOUND, { msg: "Mismatch OTP Purpose." });
      }

      const isOtpValid = bcrypt.compareSync(otp, user?.otp ?? "");
      if (!isOtpValid)
        return resultResponse(NOT_FOUND, { msg: "Invalid OTP! Please try again." });
    }
    if (user.user_type_id == USER_TYPE_USER)
      return resultResponse(VALIDATION_ERROR, { msg: "Please login into user panel!" });

    if (isVerifyAdminOTP && user.expire_time < Date.now())
      return resultResponse(VALIDATION_ERROR, { msg: "OTP has been expired!" });

    req.domain_name = user.domain_name;
    let ip_data = req.query?.ip ? req.query.ip : req.ip_data;
    var todayDate = new Date();
    todayDate.setDate(todayDate.getDate() + 3);

    let loginUserLog = {
      ...(JSON.parse(JSON.stringify(user))),
      browser_info: req.headers["user-agent"],
      ip_address: ip_data,
      domain: user.domain,
      domain_name: req.get('origin') || "localhost",
      login_status: "login_failed",
      expireAt: todayDate,
      mobile: user.mobile ? true : false,
    };
    // Validate white label.
    req.loginUserLog = loginUserLog;

    // Check Domain if User is not Super Admin
    let isNotSuperAdmin = user.user_type_id != USER_TYPE_SUPER_ADMIN;
    if (isNotSuperAdmin) {
      if (IS_VALIDATE_DOMAIN_LOGIN != 'false') {
        let isValidDomainLogin = await checkDomain(req);
        if (isValidDomainLogin)
          return resultResponse(VALIDATION_ERROR, { msg: isValidDomainLogin });
      }
    }

    // if (!isVerifyAdminOTP) {
    var passwordCheck = bcrypt.compareSync(password, user.password);
    // If password is not vailid.
    if (!passwordCheck) {
      // Store log for un-successful password attempted.
      let loginMsg = "Password did not match!";
      if (user.belongs_to == LABEL_DIAMOND) {
        loginMsg = "Password Incorrect";
      }
      loginUserLog.message = loginMsg;
      userLoginLogs(loginUserLog).then(res => {
        return UserLoginLogs.create(res).then().catch(console.error);
      }).catch(console.error);
      return resultResponse(VALIDATION_ERROR, { msg: loginUserLog.message });
    }
    // }

    if (isNotSuperAdmin) {
      if (user.self_lock_user == 1 || user.parent_lock_user == 1)
        return resultResponse(VALIDATION_ERROR, { msg: "Your account is locked!" });
      else if (user.self_close_account == 1 || user.parent_close_account == 1)
        return resultResponse(VALIDATION_ERROR, { msg: "Your account is closed, Contact your Upline!" });
    }

    if (user.is_multi_login_allow != 1 && isNotSuperAdmin && !user.is_demo)
      OAuthToken.deleteMany({ 'user.user_id': user._id.toString() }).then();

    if (
      !isVerifyAdminOTP &&
      !user.is_telegram_enable &&
      !user.is_auth_app_enabled &&
      !user.is_secure_auth_enabled && // Primary Remove Above Two in Future
      user.is_enable_telegram_default
    ) {
      let data = {
        user_id: user._id,
        is_telegram_enable: user.is_telegram_enable,
        is_auth_app_enabled: user.is_auth_app_enabled,
        is_secure_auth_enabled: user.is_secure_auth_enabled,
      };
      return resultResponse(SUCCESS, {
        msg: "Please enable secure auth verification",
        data,
      });
    }

    /** sent otp when telegram otp is enable */
    if (!isVerifyAdminOTP && user.is_telegram_enable) {
      if (!user.telegram_chat_id)
        return resultResponse(VALIDATION_ERROR, { msg: "On this account telegram not associated!" });
      let otp = utils.generateRandomNumber(6);
      let data = {
        user_id: user._id,
        is_telegram_enable: user.is_telegram_enable,
        is_auth_app_enabled: user.is_auth_app_enabled,
        is_secure_auth_enabled: user.is_secure_auth_enabled,
      };
      await telegramService.telegramOtpUpdate({ user_id: user._id, otp, telegram_chat_id: user.telegram_chat_id });
      return resultResponse(SUCCESS, { msg: "Successfully sent OTP on your telegram bot.", data });
    }

    if (!isVerifyAdminOTP && user.is_auth_app_enabled) {
      let data = {
        user_id: user._id,
        is_telegram_enable: user.is_telegram_enable,
        is_auth_app_enabled: user.is_auth_app_enabled,
        is_secure_auth_enabled: user.is_secure_auth_enabled,
      }
      return resultResponse(SUCCESS, {
        msg: "Use OTP from Auth App for login.",
        data,
      });
    }

    User.updateOne(
      { user_name: user.user_name },
      {
        is_online: 1,
        last_login_ip_address: ip_data,
        $unset: { otp: "" } // Unsets the 'otp' field
      }
    ).then();

    // Required for OAuth2.
    req.body.username = user.user_name;
    req.body.password = password; //user.raw_password;

    var request = new Request(req);
    var response = new Response(res);

    // Save OAuth2 token if user credentials are vailid.
    const token = await oauth.token(request, response);
    var msg;
    msg = user.belongs_to == CONSTANT.LABEL_DIAMOND ? "success" : "Agent successfully logged in.";
    var account_type = 1;
    if (user.belongs_to == CONSTANT.LABEL_B2C_MANAGER) {
      msg = "Wallet acc successfully logged in.";
      account_type = 2;
    }

    let userLoginResponse = {
      data: {
        _id: user._id,
        user_id: user._id,
        parent_id: user.parent_id,
        user_type_id: user.user_type_id,
        name: user.name,
        user_name: user.user_name,
        // password: user.raw_password,
        is_change_password: user.is_change_password,
        exposure_limit: user.exposure_limit,
        point: user.point,
        is_telegram_enable: user.is_telegram_enable,
        isChipSummary: user.isChipSummary,
        belongs_to_b2c: user.belongs_to_b2c,
        is_b2c_dealer: user.is_b2c_dealer,
        rule_accept: user.rule_accept,
        allow_social_media_dealer: user.allow_social_media_dealer,
        // Include transaction_password only if is_change_password is 1
        ...(user.is_change_password === 1 && { transaction_password: user.transaction_password }),
      },
      token: {
        accessToken: token.accessToken,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      },
      msg
    };

    let lotusConfig = require("../../utils/lotusConfig").getLotusOperator();
    userLoginResponse['operatorId'] = (user.is_demo) ? lotusConfig.operatorIdDemo : ((userLoginResponse.data['point'] == 100) ? lotusConfig.operatorIdHKD : lotusConfig.operatorId);

    loginUserLog.is_online = 1;
    loginUserLog.login_status = "login_success";
    loginUserLog.message = "Login Success";
    loginUserLog.accessToken = userLoginResponse.token.accessToken;
    userLoginLogs(loginUserLog).then(async res => {
      redisClient.set(
        getIPAddressUID(userLoginResponse.token.accessToken),
        JSON.stringify(res.geolocation),
        "EX",
        moment(token.accessTokenExpiresAt).diff(
          moment().startOf("minutes"),
          "seconds",
        )
      );
      return UserLoginLogs.create(res).then().catch(console.error);
    }).catch(console.error);

    // Increment login count using $inc and last login time and ip address
    if (user.user_type_id != USER_TYPE_SUPER_ADMIN) {
      const params = {
        user_id: user._id,
        ip_address: ip_data,
        parents_user_name_arr: user.parent_level_ids.map(data => data.user_name),
      }
      await User.bulkWrite(userQuery.setAdminLoginData(params));
    }

    const room = `${user.auth_app_id}-${user.user_name}`;
    req.IO.to(room).emit("login-success", { success: true });
    req.IO.in(room).socketsLeave(room);
    return resultResponse(SUCCESS, userLoginResponse);

  } catch (error) {
    return resultResponse(SERVER_ERROR, error);
  }
}

async function updateUserInRedis(data) {
  var subset = _.pick(data, [
    "password",
    "is_change_password",
    "exposure_limit",
    "is_demo",
    "self_lock_user",
    "title",
    "parent_lock_user",
    "self_close_account",
    "parent_close_account",
    // "raw_password",
    "transaction_password",
    "telegram_chat_id",
    "is_telegram_enable",
    "match_commission",
    "is_multi_login_allow",
    "expire_time",
    "otp",
    "is_b2c_dealer",
    "check_event_limit",
    "partnership",
    "point",
    "last_login_ip_address",
    "self_lock_betting",
    "parent_lock_betting",
    "self_lock_fancy_bet",
    "parent_lock_fancy_bet",
    "userSettingSportsWise",
    "partnerships",
    "sports_permission",
  ]
  );
  if (!_.isEmpty(subset)) {
    let user = await getUserDetails(
      { _id: ObjectId(data._id) },
      ["-_id", "user_name"]
    );
    if (user.statusCode == SUCCESS) {
      user = user.data;
      let key = CONSTANT.USER_DATA_KEY + user.user_name.toLowerCase() + CONSTANT.UNIQUE_IDENTIFIER_KEY;
      let result = await redisClient.get(key);
      if (result) {
        result = JSON.parse(result);
        result = { ...result, ...subset };
        await redisClient.set(key, JSON.stringify(result));
      }
    }
  }
}

if (process.env.NODE_APP_INSTANCE == "0" || process.env.NODE_APP_INSTANCE == undefined) {
  UserEvent.on(CONSTANT.USER_CHANGE_EVENT, async (change) => {
    try {
      const { operationType, documentKey, updateDescription } = change;
      if (operationType != undefined)
        if (operationType == "update")
          if (updateDescription != undefined) {
            const { updatedFields } = updateDescription;
            if (updatedFields) {
              const data = { ...documentKey, ...updatedFields };
              await updateUserInRedis(data)
            }
          }
    } catch (error) {
      console.log("Event Watch -> 'User Event' Error: ", error);
    }
  });
}

async function updateForChangePasswordAfterLogin(req) {
  try {
    if (!req.params.id)
      return resultResponse(VALIDATION_ERROR, { msg: "User id is required." })

    const { old_password, confirm_password } = req.body;
    let { new_password } = req.body;

    const user = await User.findOne({ _id: req.params.id });

    if (!user) {
      return resultResponse(VALIDATION_ERROR, { msg: "User is not found." })
    }

    if (confirm_password != new_password) {
      return resultResponse(VALIDATION_ERROR, { msg: "Password and confirm password do not match" })
    }
    if (!bcrypt.compareSync(old_password, user.password)) {
      return resultResponse(VALIDATION_ERROR, { msg: "Old password is incorrect" })
    }

    // if (old_password != user.raw_password) {
    //   return resultResponse(VALIDATION_ERROR, { msg: "Old password is incorrect" })
    // }
    // var raw_password = new_password;

    // encrypting user password 
    let salt = bcrypt.genSaltSync(saltRounds);
    let hash = bcrypt.hashSync(new_password, salt);
    new_password = hash;
    await User.updateOne({ _id: req.params.id },
      {
        $set: {
          password: new_password,
          // raw_password: raw_password,
          is_change_password: 1
        }
      });

    return resultResponse(SUCCESS, { msg: "You have successfully changed your password.", status: true });
  }
  catch (err) {
    return resultResponse(VALIDATION_ERROR, err)
  }
}

async function selfChangePassword(data) {
  try {
    const {
      body,
      user,
      is_self,
      device_info,
      changed_by_user_id,
      changed_by_user,
      changed_by_user_name,
      last_login_ip_address,
      path,
    } = data;
    const { old_password, new_password } = body;
    // Basic Password Validations 
    // Old Password only exist for Self Password Change
    if (old_password) {
      if (!bcrypt.compareSync(old_password, user.password)) {
        return resultResponse(VALIDATION_ERROR, { msg: "Old password is incorrect" })
      }

      // if (old_password != user.raw_password) {
      //   return resultResponse(VALIDATION_ERROR, { msg: "Old password is incorrect" })
      // }
    }

    // encrypting user password 
    let salt = bcrypt.genSaltSync(saltRounds);
    let hash = bcrypt.hashSync(new_password, salt);
    const hashedPassword = hash;

    const updateObj = {
      $set: {
        password: hashedPassword,
        // raw_password: new_password, 
        is_change_password: 1
      }
    };

    if (path == "/changeChildPassword") {
      updateObj.is_change_password = 0;
    }

    await User.updateOne({ _id: user._id }, updateObj);
    let comment;
    if (is_self) {
      comment = "Password Changed By Self.";
    } else {
      comment = `User Password Changed By ${changed_by_user_name}.`;
    }

    let mobile = user.mobile ? true : false;
    let ip_address = last_login_ip_address ? last_login_ip_address : user.last_login_ip_address;
    let geolocation = await getIpDetails(ip_address);
    await PasswordHistory.create({
      user_id: user._id,
      user_name: user.user_name,
      comment,
      changed_by_user_id: changed_by_user_id ? changed_by_user_id : user._id,
      changed_by_user_name: changed_by_user_name ? changed_by_user_name : user.user_name,
      changed_by_user: changed_by_user ? changed_by_user : user.name,
      geolocation,
      mobile,
      ip_address,
      device_info
    }).then().catch(console.error);

    // Delete the OAuth Token
    if (path == "/changeChildPassword") {
      await OAuthToken.deleteMany({ 'user.user_id': user._id.toString() });
    }

    return resultResponse(SUCCESS, { msg: "Password change successfully" });
  } catch (error) {
    return resultResponse(VALIDATION_ERROR, error);
  }
}

async function updateUserBetLockStatus(req) {
  try {
    const { user_id } = req.joiData;
    const userDetails = req?.user;

    if (!userDetails) {
      return resultResponse(VALIDATION_ERROR, { msg: "No User Found." })
    }

    let state = userDetails.self_lock_betting == 0 ? 1 : 0;

    if (userDetails.parent_lock_betting == 1 || userDetails.parent_lock_fancy_bet == 1)
      return resultResponse(VALIDATION_ERROR, { msg: "Parent betting already locked." })

    await Promise.all([
      User.updateOne(
        { _id: user_id },
        { $set: { self_lock_betting: state, self_lock_fancy_bet: state } },
      ),
      User.updateMany(
        { 'parent_level_ids.user_id': user_id },
        { $set: { parent_lock_betting: state, parent_lock_fancy_bet: state } }
      )
    ]);

    const msg = state == 1
      ? "User betting locked successfully."
      : "User betting unlocked successfully.";

    return resultResponse(SUCCESS, {
      data: { self_lock_betting: state, self_lock_fancy_bet: state },
      msg
    });

  } catch (error) {
    return resultResponse(SERVER_ERROR, { msg: error.message });
  }
}

async function getUserNameMobileNoAndName(req) {
  try {
    const { page, limit, domain_id, user_name, mobile } = req.joiData;
    let skip = (page - 1) * limit;
    let search = {};

    if (domain_id) {
      search.domain = ObjectId(domain_id);
    }

    if (user_name) {
      search.user_name = user_name;
    }

    if (mobile?.length) {
      search.mobile = { $in: mobile };
    }

    if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {
      search["parent_id"] = ObjectId(req.User._id);
    }

    const filter = {
      user_type_id: 1,
      ...search,
      $and: [
        { mobile: { $ne: 0 } },
        { mobile: { $ne: null } },
        {
          $expr: {
            $and: [
              { $gte: [{ $toDouble: "$mobile" }, 1] }, // Check if mobile is a number
              { $lte: [{ $strLenCP: { $toString: "$mobile" } }, 12] }, // Check if length is less than or equal to 12
              { $gte: [{ $strLenCP: { $toString: "$mobile" } }, 10] }, // Check if length is greater than or equal to 10
            ]
          }
        }
      ]
    }

    // Execute queries concurrently: user list with pagination and total count for metadata
    const [result, total] = await Promise.all([
      User.find(filter)
        .select(["_id", 'user_name', 'mobile', 'name', 'country_code', 'domain_name'])
        .skip(skip).limit(limit).allowDiskUse(true).lean(), // Fetch paginated results
      User.count(filter), // Get total count for pagination metadata
    ]);

    // Check if there are no results.
    if (!result.length) {
      return resultResponse(NOT_FOUND, "Users list is empty, No users found!");
    }

    // Construct successful response with user data and pagination metadata
    return resultResponse(SUCCESS, {
      data: {
        metadata: {
          total, // Total users matching the filter
          limit, // Items per page
          page, // Current page number
          pages: Math.ceil(total / limit), // Calculate total pages based on total and limit
        },
        data: result, // Paginated user list
      }
    });
  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }
}

async function acceptRules(request) {
  const { rule_accept } = request.joiData;
  const updateResult = await User.updateOne(
    { _id: ObjectId(request.User._id) },
    { $set: { rule_accept } }
  );

  if (updateResult.matchedCount === 0) {
    return resultResponse(
      VALIDATION_FAILED,
      "The user ID you provided does not exist."
    );
  }

  return resultResponse(SUCCESS, "Rule accepted.");
}

async function editProfile(request) {
  const { name, is_change_password, favorite_master, user_id } = request.joiData;
  const updateResult = await User.updateOne(
    { _id: ObjectId(user_id) },
    { $set: { name, is_change_password, favorite_master } }
  );

  if (updateResult.matchedCount === 0) {
    return resultResponse(
      VALIDATION_FAILED,
      "The user ID you provided does not exist."
    );
  }

  return resultResponse(SUCCESS, "Profile updated.");
}

async function unlockAttemptedTRXN(req) {
  const { user_id } = req.joiData;
  await User.updateOne(
    { _id: ObjectId(user_id) },
    {
      $set: {
        is_transaction_password_locked: false,
        transaction_password_attempts: 0,
      },
    },
  );

  return resultResponse(
    SUCCESS,
    "Transaction code attempt reset and user unblocked.",
  );
}

async function markDealerAsDefault(request) {
  const { user_id } = request.body;
  if (user_id == request.User._id) {
    return resultResponse(VALIDATION_FAILED, "You cannot update yourself.");
  }

  const userDetails = await User.findOne(
    { _id: ObjectId(user_id), is_dealer: true, user_type_id: USER_TYPE_DEALER },
    { _id: 1, domain: 1, self_lock_user: 1, parent_close_account: 1, self_close_account: 1, parent_lock_user: 1 }
  ).lean().exec();

  if (!userDetails) {
    return resultResponse(VALIDATION_FAILED, "The user ID you provided does not belong to a dealer.");
  }
  else if (userDetails.self_lock_user == 1 || userDetails.parent_lock_user == 1)
    return ResError(res, { msg: "Dealer account is locked!" });
  else if (userDetails.self_close_account == 1 || userDetails.parent_close_account == 1)
    return ResError(res, { msg: "Dealer account is closed, please reopen it!" });

  markDealerDeafult(userDetails)
  return resultResponse(SUCCESS, 'Dealer marked as default successfully.')
}

async function markDealerDeafult(userDetails) {
  try {
    // Reset the existing default dealer before setting a new one
    await User.updateMany(
      { is_default_dealer: true, is_dealer: true, user_type_id: USER_TYPE_DEALER, domain: ObjectId(userDetails.domain) },
      { $set: { is_default_dealer: false } }).exec();
    // Set the new dealer as default
    await User.updateOne(
      { _id: ObjectId(userDetails._id) },
      { $set: { is_default_dealer: true } }
    ).exec()
  } catch (error) {
    console.error(error)
  }
}

module.exports = {
  getUserByUserId, getUsersDetails, getUserDetails, detailsForAddAgentClient, getBalanceReferenceSum, getUsersListCRef,
  getBalanceCRef, getWebsiteTags, getWalletUser, getUsersListDiamond, getMatchStacks, setMatchStack, closeAccount, lockAccount,
  getDiamondUsersTotalCr, updateUserPartnership, updateChipSummary, createAccountStatement, getClientPL, markDealerAsB2c,
  adminLogin, updateUserInRedis, updateForChangePasswordAfterLogin, selfChangePassword,
  allowSocialMediaDealer,
  updateCreditReference,
  updateUserBetLockStatus,
  getUserNameMobileNoAndName,
  getUserBalanceV1,
  getAgentBalanceV1,
  acceptRules,
  editProfile,
  getUsersListDiamondDocument,
  unlockAttemptedTRXN,
  getUsersListDiamondBankDocument,
  getCreditDataDiamond,
  markDealerAsDefault
}