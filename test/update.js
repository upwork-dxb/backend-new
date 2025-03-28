const mongooseCon = require('../connections/mongoose')
  , { ObjectId } = require("bson")
  , supernowaGames = require("../defaultInstall/supernowa-sports.json")
  , User = require('../models/user')
  // , UserSettingWiseSport = require('../models/userSettingWiseSport')
  , Partnerships = require('../models/partnerships')
  , Sports = require('../models/sports')
require('dotenv').config({ path: ".env" });

(function () {
  console.time("upgraded in");
  mongooseCon.connect({ maxPoolSize: 1 })().then(async () => {
    try {
      // Get lotus casino sport settings.
      let sports = await Sports.findOne(
        { sport_id: "-100" },
        {
          _id: 0, market_min_stack: 1, market_max_stack: 1, market_min_odds_rate: 1,
          market_max_odds_rate: 1, market_max_profit: 1, market_advance_bet_stake: 1,
        }
      ).lean();
      // Set lotus sport same settings to the world casino.
      let supernowa_game = supernowaGames.map(({
        name, sport_id, is_manual, is_live_sport, providerCode, order_by
      }) => ({
        name, sport_id, is_manual, is_live_sport, providerCode, order_by, ...sports
      }));
      // Saving the world casino sports.
      let sports_permission = await Sports.insertMany(supernowa_game);
      console.info("world casino games added");
      sports_permission = sports_permission.map(({ _id, sport_id, name }) => ({ sport: _id, sport_id, name, is_allow: true }));
      // Update all users permissions for the world casino.
      await User.updateMany(
        {},
        { $push: { sports_permission } },
      );
      console.info("world casino games permission added");
      // let userSettings = await UserSettingWiseSport.findOne({ user_name: "super-ad", "sports_settings.sport_id": "-100" })
      //   .select(`
      //       -_id sports_settings.sport_id.$ sports_settings.market_min_stack sports_settings.market_max_stack
      //       sports_settings.market_min_odds_rate sports_settings.market_max_odds_rate sports_settings.market_bet_delay
      //       sports_settings.market_max_profit sports_settings.market_advance_bet_stake
      //     `).lean();
      // let sports_settings = sports_permission.map(data => ({ ...userSettings.sports_settings[0], ...data, })).filter(data => data.sport_id == '-102');
      // await UserSettingWiseSport.updateMany(
      //   {},
      //   { $push: { sports_settings } },
      // );
      // console.info("sports settings added");
      let verifySupernowa = sports_permission.find(data => data.sport_id == '-102');
      if (!verifySupernowa)
        throw new Error("Supernowa data not found!");
      let worldCasino = JSON.parse(JSON.stringify(verifySupernowa));
      worldCasino.sport = ObjectId(verifySupernowa.sport);
      worldCasino.sport_id = "WCO";
      worldCasino.name = "The World Casino";
      // Getting lotus partnerships data.
      let superAdmin = await User.findOne({ user_name: process.env.SUPER_ADMIN }).select("_id").lean();
      let superAdminAgents = await User.find({ parent_id: superAdmin._id }).select("_id").lean();
      superAdminAgents = superAdminAgents.map(x => x._id.toString());
      if (!superAdmin)
        throw new Error("Super Admin data not found!");
      superAdmin = superAdmin._id.toString();
      let AdminAgents = [superAdmin, ...superAdminAgents];
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
                  ...verifySupernowa,
                  percentage: item.sports_share[0].percentage.map(
                    ({
                      parent_id, user_id, user_type_id, user_name
                    }) => ({
                      parent_id, user_id, user_type_id, user_name,
                      parent_share: superAdmin == user_id.toString() ? 100 : 0,
                      parent_partnership_share: AdminAgents.includes(user_id.toString()) ? 100 : 0,
                      user_share: superAdmin == user_id.toString() ? 100 : 0,
                      share: superAdmin == user_id.toString() ? 100 : 0
                    })
                  )
                },
                {
                  ...worldCasino,
                  percentage: item.sports_share[0].percentage.map(
                    ({
                      parent_id, user_id, user_type_id, user_name
                    }) => ({
                      parent_id, user_id, user_type_id, user_name,
                      parent_share: superAdmin == user_id.toString() ? 100 : 0,
                      parent_partnership_share: AdminAgents.includes(user_id.toString()) ? 100 : 0,
                      user_share: superAdmin == user_id.toString() ? 100 : 0,
                      share: superAdmin == user_id.toString() ? 100 : 0
                    })
                  )
                }]
              }
            }
          }
        }
      }));
      // Saving the world casino partnerships data.
      await Partnerships.bulkWrite(lotusPartnerships);
      console.info("supernowa partnerships added");
    } catch (error) {
      console.error(error);
    } finally {
      mongooseCon.disconnect();
      console.timeLog("upgraded in");
    }
  });
})();