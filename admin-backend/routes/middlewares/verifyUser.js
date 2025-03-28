const bcrypt = require('bcrypt')
  , User = require('../../../models/user')
  , OAuthToken = require('../../../models/oAuthToken')
  , userService = require('../../service/userService')
  , { SUCCESS, USER_TYPE_SUPER_ADMIN, LABEL_DIAMOND } = require('../../../utils/constants')
  , { error } = require('../../../lib/expressResponder')
  , { allowedPaths, superAdminAllowedPaths } = require('./paths')
  , { STATUS_422 } = require('../../../utils/httpStatusCode')
  , { API_INITIAL_ROUTE_V1 } = require('../../../config')
  , { TRANSACTION_PASSWORD_MAX_ATTEMPTS } = require('../../../config/constant/user');

module.exports = async function (req, res, next) {
  var { user_id } = req.query;
  var { user_id } = req.body;
  if (req.body.hasOwnProperty('search'))
    if (req.body.search.hasOwnProperty('user_id'))
      var { user_id } = req.body.search;
  if (user_id) {
    let checkParentChildren = true;
    let filter = { _id: user_id }, Projection = ["_id", "user_type_id", "parent_level_ids", "user_name"], Populate = [];
    const masterPasswordIsOptional =
      req.path.includes('updateUserStatusBettingLockUnlock') ||
      req.path.includes('updateUserStatusFancyBetLock') ||
      req.path.includes('lockAccount') ||
      req.path.includes('updateCreditReference') ||
      req.path.includes('updateUserStatusFancyBetUnlock');
    if (allowedPaths.some(e => `${API_INITIAL_ROUTE_V1}${e}` == (req.path))) {
      if (req.path.includes('getSportsWise'))
        Projection = Projection.concat(["check_event_limit"]);
      if (
        req.path.includes('getSports') || req.path.includes('getSeries') || req.path.includes('userlock') ||
        req.path.includes('getMatches') || req.path.includes('getOnlineMatch') ||
        req.path.includes('getOnlineMarket') || req.path.includes('getMarkets') ||
        req.path.includes('userlockV1') ||
        req.path.includes('markDealerAsDeafult')
      )
        Projection = Projection.concat(["name", "user_name", "sports_permission"]);
      if (
        req.path.includes('deleteBets') || req.path.includes('deleteBet') || req.path.includes('chipInOut') || req.path.includes("getRawPasswordOfUser") ||
        req.path.includes('updatePartnershipList') || req.path.includes('updateUserPartnership') || req.path.includes('resetTVandScoreBoardURL') ||
        req.path.includes('cancelUnmatchedBet') || req.path.includes('deleteBankMethod') || req.path.includes('deleteBankDetail') ||
        req.path.includes('changeChildPassword') || req.path.includes('chipInChipOutDiamond') ||
        req.path.includes('makeSettlementDiamond') ||
        req.path.includes('makeSettlementDiamondMulti') ||
        req.path.includes('enableTelegramByParent') ||
        req.path.includes('updateUserStatusBettingLockUnlock') ||
        req.path.includes('updateUserStatusFancyBetLock') ||
        req.path.includes('lockAccount') ||
        req.path.includes('updateCreditReference') ||
        req.path.includes('updateUserStatusFancyBetUnlock') ||
        req.path.includes('betLock') ||
        req.path.includes('userlock') ||
        req.path.includes('userlockV1') ||
        req.path.includes('makeSettlementV2') ||
        req.path.includes('adminRemoveAuthApp') ||
        req.path.includes('markDealerAsDeafult')
      ) {
        if (req?.body?.pass_type == 'TRXN_PASSWORD') {
          const password = req.body.password || req.body.master_password || "";
          const trxn_pass = req.User.transaction_password || "";

          const raw_compare = password == trxn_pass;
          // const bcrypt_compare = bcrypt.compareSync( password, trxn_pass);
          // if (!raw_compare && !bcrypt_compare) {}

          if (!raw_compare) {
            if (req.User.belongs_to == LABEL_DIAMOND) {
              const oldAttempts = req.User.transaction_password_attempts || 0; // Default to 0 if not set
              const newAttempts = oldAttempts + 1; // Increment attempts
              const remainingAttempts = TRANSACTION_PASSWORD_MAX_ATTEMPTS - newAttempts;
              if (newAttempts > TRANSACTION_PASSWORD_MAX_ATTEMPTS) {
                await User.updateOne(
                  { _id: req.User._id },
                  {
                    $set: {
                      is_transaction_password_locked: true,
                    },
                    $inc: { transaction_password_attempts: 1 }
                  }
                );
                OAuthToken.deleteMany(
                  { 'user.user_id': req.User._id }
                ).exec()
                return error(res, { msg: `Transaction code not valid.You have 0attempt left` });
              } else {
                await User.updateOne(
                  { _id: req.User._id },
                  { $inc: { transaction_password_attempts: 1 } }
                );
                await OAuthToken.updateMany(
                  { 'user.user_id': req.User._id },
                  { $inc: { 'user.transaction_password_attempts': 1 } }
                );
                return error(res, { msg: `Transaction code not valid.You have ${remainingAttempts}attempt left.` });
              }
            }
            return error(res, { msg: "Transaction Password did not match.", statusCode: STATUS_422 });
          } else {
            if (req.User.belongs_to == LABEL_DIAMOND) {
              const oldAttempts = req.User.transaction_password_attempts || 0; // Default to 0 if not set
              if (oldAttempts) {
                await User.updateOne(
                  { _id: req.User._id },
                  { $set: { transaction_password_attempts: 0 } }
                );
                await OAuthToken.updateMany(
                  { 'user.user_id': req.User._id },
                  { $set: { 'user.transaction_password_attempts': 0 } }
                );
              }
            }
          }
        } else {
          const password = req.body.password || req.body.master_password || "";
          const userPassword = req.User.password || "";

          // Make Password Checking Optional for Some Routes
          if (password || !masterPasswordIsOptional) {
            const passwordCheck = bcrypt.compareSync(password, userPassword);
            if (!passwordCheck) {
              return error(res, { msg: "Password did not match.", statusCode: STATUS_422 });
            }
          }
        }
        if (req.path.includes('deleteBet') || req.path.includes('chipInOut') || req.path.includes('cancelUnmatchedBet'))
          Projection = Projection.concat(["markets_liability", "sessions_liability"]);
        // if (req.path.includes("getRawPasswordOfUser"))
        //   Projection = Projection.concat(["raw_password"]);
        if (req.path.includes('chipInOut'))
          Projection = Projection.concat(["bonus", "total_deposit_count", "belongs_to_b2c"]);
        if (req.path.includes('chipInChipOutDiamond'))
          Projection = Projection.concat([
            "bonus", "total_deposit_count", "belongs_to_b2c", "belongs_to",
            "credit_reference", "belongs_to_credit_reference", "parent_id",
            "parent_user_name", "name", "user_name", "balance", "domain_name",
            "user_type_id", "parent_level_ids", "point", "children_credit_reference",
            "profit_loss", "liability"
          ]);
        if (req.path.includes('makeSettlementDiamond'))
          Projection = Projection.concat([
            "bonus", "total_deposit_count", "belongs_to_b2c", "belongs_to",
            "credit_reference", "belongs_to_credit_reference", "parent_id",
            "parent_user_name", "name", "user_name", "balance", "domain_name",
            "user_type_id", "parent_level_ids", "point", "children_credit_reference",
            "balance_reference", "profit_loss", "liability"
          ]);
      }
      if (
        req.path.includes('makeSettlement') ||
        req.path.includes('makeSettlementV2') ||
        req.path.includes('updateUserPartnership')
      )
        Projection = Projection.concat(["parent_id", "belongs_to"]);

      if (req.path.includes('settlementCollectionHistory')
        || req.path.includes('settlementCollectionHistoryV2')) {
        Projection = Projection.concat(["parent_id", "settlement_pl_comm"]);
      }

      if (req.path.includes('getUsersList') || req.path.includes('getUsersListDiamond'))
        Projection = Projection.concat(["parent_id", "parent_user_name", "user_name", "name"]);
      if (req.path.includes('getExposures') || req.path.includes('block') || req.path.includes('userSettings/update'))
        Projection = Projection.concat(["name", "user_name"]);
      if (req.path.includes('chipInOut'))
        Projection = Projection.concat([
          "parent_id", "parent_user_name", "name", "user_name", "balance", "domain_name",
          "point", "belongs_to_credit_reference", "liability", "partnership"
        ]);
      if (
        req.path.includes('getMarketAgentUserPositions') ||
        req.path.includes('sportsWiseUsersPL') ||
        req.path.includes('downlineP_L') ||
        req.path.includes('fancyStakeUsersWise') ||
        req.path.includes('fancyTotalStakeUsersWise')
      )
        Projection = Projection.concat(["parent_id", "user_name"]);
      if (req.path.includes('getCommission'))
        Projection = Projection.concat(["match_commission", "session_commission"]);
      if (req.path.includes('updateCreditReference'))
        Projection = Projection.concat(["parent_id", "user_name", "name", "user_type_id", "credit_reference", "is_auto_credit_reference"]);
      if (req.path.includes('update-commission'))
        Projection = Projection.concat(["parent_id", "parent_user_name", "match_commission", "session_commission"]);
      if (req.path.includes('getAgentBalance'))
        Projection = Projection.concat(["credit_reference", "balance"]);
      if (req.path.includes('getUserMatchStack'))
        Projection = Projection.concat(["match_stack", "name", "user_name"]);
      if (req.path.includes('closeAccount'))
        Projection = Projection.concat(["parent_id", "self_close_account", "parent_close_account"]);
      if (req.path.includes('lockAccount'))
        Projection = Projection.concat(["parent_id", "self_lock_user", "parent_lock_user"]);
      if (req.path.includes('updateUserBetLockStatus'))
        Projection = Projection.concat(['_id', 'parent_lock_betting', 'parent_lock_fancy_bet', 'self_lock_betting', 'self_lock_fancy_bet']);
      if (req.path.includes('getCreditDataDiamond')) {
        Projection = Projection.concat(["parent_id", "credit_reference"]);
      }
      let user = await userService.getUserDetails(filter, Projection, Populate);
      if (user.statusCode != SUCCESS)
        return error(res, { msg: user.data });
      user = user.data;
      req.user = user;
      if (checkParentChildren)
        if (
          !user.parent_level_ids.some(parent => parent.user_id == (req.User.user_id || req.User._id)) &&
          req.User.user_type_id != USER_TYPE_SUPER_ADMIN &&
          req.User.user_id.toString() != user_id.toString()
        )
          return error(res, { msg: "You are not allowed to access the resource!" });
    }
  } else
    req.user = req.User;
  // here we block some paths for non super admin users.
  if (superAdminAllowedPaths.some(e => `${API_INITIAL_ROUTE_V1}${e}` == (req.path)))
    if ((req.User.have_admin_rights == false && req.User.user_type_id != USER_TYPE_SUPER_ADMIN))
      return error(res, { msg: "You are not permitted to do this action!" });
  next();
}