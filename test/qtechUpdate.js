const mongoose = require('mongoose')
  , mongooseCon = require('../connections/mongoose')
  , qtechGames = require("../defaultInstall/qtech-sports.json")
  , User = require('../models/user')
  , Partnerships = require('../models/partnerships')
  , Sports = require('../models/sports')
  , { QTECH_CASINO_SPORT_ID } = require('../utils/constants')
  , QT = require('../utils/qtechConstant')
require('dotenv').config({ path: ".env" });

(function () {
  console.time("upgraded in");
  mongooseCon.connect({ maxPoolSize: 1 })().then(async () => {
    try {
      await Sports.updateMany({}, { '$set': { is_virtual_sport: false } });
      console.info("Old sports games modified...");
      // Saving the qtech casino games providers.
      await Sports.insertMany(qtechGames);
      console.info("qtech casino games added...");
      let qtech = {
        "sport": new mongoose.Types.ObjectId(),
        "sport_id": QTECH_CASINO_SPORT_ID,
        "name": QT.QTECH,
        "is_allow": true
      };
      // Update all users permissions for the qtech casino.
      await User.updateMany(
        {},
        { $push: { sports_permission: qtech } },
      );
      console.info("qtech casino games permission added into all users...");
      // Getting lotus partnerships data.
      let lotusPartnerships = await Partnerships.find({
        "sports_share.sport_id": "-100"
      }).select('-_id user_id sports_share.$').lean();
      lotusPartnerships = lotusPartnerships.map(item => ({
        'updateOne': {
          'filter': { user_id: item.user_id },
          'update': {
            "$push": {
              sports_share: {
                "$each": [{
                  ...qtech,
                  percentage: item.sports_share[0].percentage.map(
                    ({
                      parent_share, parent_id, parent_partnership_share, user_share, user_id, user_type_id, share, user_name
                    }) => ({
                      parent_share, parent_id, parent_partnership_share, user_share, user_id, user_type_id, share, user_name
                    })
                  )
                }]
              }
            }
          }
        }
      }));
      // Saving the qtech casino partnerships data.
      await Partnerships.bulkWrite(lotusPartnerships);
      console.info("qtech partnerships added");
    } catch (error) {
      console.error(error);
    } finally {
      mongooseCon.disconnect();
      console.timeLog("upgraded in");
    }
  });
})();
// https://github.com/beatific-exchange/beatific-backend/commit/2fc9a72108e38af8f27e6e4873366dcec4585bbf
// https://github.com/beatific-exchange/beatific-backend/commit/7ebec673b4381dac4a05763c193d74c4354ebe3a