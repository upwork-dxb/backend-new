const path = require('path');
const writeFile = require('util').promisify(require('fs').writeFileSync);
const mongooseCon = require('./connections/mongoose');
const AccountStatement = require("./models/accountStatement");
const User = require("./models/user");
const UserSettingWiseSport = require("./models/userSettingWiseSport");
const Partnerships = require("./models/partnerships");
const domain_name = '';
const user_type_id = 1;
const DELETED_USERS_FILE = path.normalize(path.resolve(__dirname, domain_name + "-" + "deleted-users.json"));
require('dotenv').config({ path: ".env" });

(async function main() {
  mongooseCon.connect({ maxPoolSize: 1000 })().then(async () => {
    try {
      let accStmtUsers = await AccountStatement.aggregate(
        [
          {
            $match: {
              user_type_id,
              domain_name,
            }
          },
          { $group: { _id: '$user_id' } }
        ],
        { maxTimeMS: 60000, allowDiskUse: true }
      );

      let users = accStmtUsers.map(user => user._id);
      let beforeDate = new Date(new Date().setDate(new Date().getDate() - 7));
      beforeDate.setUTCHours(23, 59, 59, 999);

      let Ids = { $nin: users };
      let userFilter = { domain_name, user_type_id, createdAt: { "$lte": new Date(beforeDate) } };
      let userFilterCount = { domain_name, user_type_id };

      let deletedUsersData = await User.find(userFilter).select("parent_user_name user_name createdAt").sort({ createdAt: -1 }).lean();

      writeFile(DELETED_USERS_FILE, JSON.stringify(deletedUsersData), 'utf8');

      console.log("Users will be deleted before the date :-", (beforeDate).toString());
      console.log("Users deletion process start");
      console.log(`Total deletable end users that belong ${domain_name} are:`, await User.countDocuments({ ...userFilter, _id: Ids }));
      console.time("users delete");
      await User.deleteMany(userFilter);
      console.timeLog("users delete");
      console.log(`Total ${domain_name} end users are now:`, await User.countDocuments(userFilterCount));
      console.log("Users deletion process completed");

      console.log("---------------------------------------");

      console.log("UserSettingWiseSport deletion process start");
      console.log(`Total deletable end users that belong ${domain_name} are:`, await UserSettingWiseSport.countDocuments({ ...userFilter, user_id: Ids }));
      console.time("UserSettingWiseSport delete");
      await UserSettingWiseSport.deleteMany(userFilter);
      console.timeLog("UserSettingWiseSport delete");
      console.log(`Total ${domain_name} end users are now:`, await UserSettingWiseSport.countDocuments(userFilterCount));
      console.log("UserSettingWiseSport deletion process completed");

      console.log("---------------------------------------");

      console.log("Partnerships deletion process start");
      console.log(`Total deletable end users that belong ${domain_name} are:`, await Partnerships.countDocuments({ ...userFilter, user_id: Ids }));
      console.time("Partnerships delete");
      await Partnerships.deleteMany(userFilter);
      console.timeLog("Partnerships delete");
      console.log(`Total ${domain_name} end users are now:`, await Partnerships.countDocuments(userFilterCount));
      console.log("Partnerships deletion process completed");

      console.log("Process completed...");
      process.kill(process.pid, 'SIGTERM');

    } catch (error) {
      console.error(error);
    }
  });
})();