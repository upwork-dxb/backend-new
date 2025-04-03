const path = require('path');
const fs = require('fs').promises;
const mongooseCon = require('./connections/mongoose');
const AccountStatement = require('./models/accountStatement');
const User = require('./models/user');
const UserSettingWiseSport = require('./models/userSettingWiseSport');
const Partnerships = require('./models/partnerships');

require('dotenv').config({ path: '.env' });

const domain_name = '';
const user_type_id = 1;
const DELETED_USERS_FILE = path.resolve(__dirname, `${domain_name}-deleted-users.json`);

(async function main() {
  try {
    await mongooseCon.connect({ maxPoolSize: 1000 })();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setUTCHours(23, 59, 59, 999);

    const accStmtUsers = await AccountStatement.aggregate([
      { $match: { user_type_id, domain_name } },
      { $group: { _id: '$user_id' } }
    ], {
      maxTimeMS: 60000,
      allowDiskUse: true
    });

    const excludedUserIds = accStmtUsers.map(u => u._id);
    const notInUserIds = { $nin: excludedUserIds };

    const userFilter = {
      domain_name,
      user_type_id,
      createdAt: { $lte: sevenDaysAgo }
    };

    const deletableUsers = await User.find(userFilter)
      .select('parent_user_name user_name createdAt')
      .sort({ createdAt: -1 })
      .lean();

    await fs.writeFile(DELETED_USERS_FILE, JSON.stringify(deletableUsers, null, 2), 'utf8');

    console.log(`Users created before ${sevenDaysAgo.toISOString()} will be deleted`);
    await deleteRecords('Users', User, userFilter, notInUserIds);
    await deleteRecords('UserSettingWiseSport', UserSettingWiseSport, userFilter, notInUserIds);
    await deleteRecords('Partnerships', Partnerships, userFilter, notInUserIds);

    console.log('✅ Deletion process completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during deletion process:', err);
    process.exit(1);
  }
})();

async function deleteRecords(label, Model, filter, notInUserIds) {
  const countBefore = await Model.countDocuments({ ...filter, user_id: notInUserIds });
  console.log(`\n📌 ${label} - Records to delete: ${countBefore}`);

  console.time(`${label} Deletion`);
  await Model.deleteMany({ ...filter, user_id: notInUserIds });
  console.timeEnd(`${label} Deletion`);

  const countAfter = await Model.countDocuments({ domain_name: filter.domain_name, user_type_id: filter.user_type_id });
  console.log(`✅ ${label} - Remaining records: ${countAfter}`);
}
