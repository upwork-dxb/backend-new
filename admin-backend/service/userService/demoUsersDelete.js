const User = require("../../../models/user");
const UserSettingWiseSport = require("../../../models/userSettingWiseSport");
const Partnerships = require("../../../models/partnerships");
const UserLoginLogs = require("../../../models/userLoginLogs");
const BetsOdds = require("../../../models/betsOdds");
const OddsProfitLoss = require("../../../models/oddsProfitLoss");
const BetsFancy = require("../../../models/betsFancy");
const FancyScorePosition = require("../../../models/fancyScorePosition");
const UserProfitLoss = require("../../../models/userProfitLoss");
const AccountStatement = require("../../../models/accountStatement");

module.exports.removeDemoUserData = async (data) => {
  const user = data?.fullDocumentBeforeChange?.user;
  if (user.is_auto_demo) {
    const filter = { user_name: user.user_name };
    let collections = [
      User.deleteOne(filter),
      UserSettingWiseSport.deleteOne(filter),
      Partnerships.deleteOne(filter),
      UserLoginLogs.deleteOne(filter),
      BetsOdds.deleteMany(filter),
      OddsProfitLoss.deleteMany(filter),
      BetsFancy.deleteMany(filter),
      FancyScorePosition.deleteMany(filter),
      UserProfitLoss.deleteMany(filter),
      AccountStatement.deleteMany(filter),
    ];
    await Promise.all(collections);
  }
};
