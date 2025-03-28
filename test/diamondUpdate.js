const mongooseCon = require('../connections/mongoose')
  , diamondGames = require("../defaultInstall/diamond-sports.json")
  , User = require('../models/user')
  , UserSettingWiseSport = require('../models/userSettingWiseSport')
  , Partnerships = require('../models/partnerships')
  , Sports = require('../models/sports')
  , Series = require('../models/series')
  , Match = require('../models/match')
  , Market = require('../models/market')
  , diamond_series_collections = require("../defaultInstall/diamond-series.json")
  , diamond_matches_collections = require("../defaultInstall/diamond-matches.json")
  , diamond_markets_collections = require("../defaultInstall/diamond-markets.json")
require('dotenv').config({ path: ".env" });

(function () {
  console.time("upgraded in");
  mongooseCon.connect({ maxPoolSize: 1 })().then(async () => {
    try {
      // Change user name.
      const user_name = "galaxy";
      // Get lotus casino sport settings.
      let sports = await Sports.findOne(
        { sport_id: "-100" },
        {
          _id: 0, market_min_stack: 1, market_max_stack: 1, market_min_odds_rate: 1,
          market_max_odds_rate: 1, market_max_profit: 1, market_advance_bet_stake: 1,
        }
      ).lean();
      // Set lotus sport same settings to the diamond casino.
      let diamond_game = diamondGames.map(({
        name, sport_id, is_manual, is_live_sport, providerCode, order_by
      }) => ({
        name, sport_id, is_manual, is_live_sport, providerCode, order_by, ...sports
      }));
      // Saving the diamond casino sports.
      let sports_permission = await Sports.insertMany(diamond_game);
      console.info("diamond casino games added");
      sports_permission = sports_permission.map(({ _id, sport_id, name }) => ({ sport: _id, sport_id, name, is_allow: true }));
      // Update all users permissions for the diamond casino.
      await User.updateMany(
        {},
        { $push: { sports_permission } },
      );
      console.info("diamond casino games permission added");
      let userSettings = await UserSettingWiseSport.findOne({ user_name, "sports_settings.sport_id": "-100" })
        .select(`
            -_id sports_settings.sport_id.$ sports_settings.market_min_stack sports_settings.market_max_stack
            sports_settings.market_min_odds_rate sports_settings.market_max_odds_rate sports_settings.market_bet_delay
            sports_settings.market_max_profit sports_settings.market_advance_bet_stake
          `).lean();
      let sports_settings = sports_permission.map(data => ({ ...userSettings.sports_settings[0], ...data, })).filter(data => data.sport_id == '-101');
      await UserSettingWiseSport.updateMany(
        {},
        { $push: { sports_settings } },
      );
      console.info("sports settings added");
      let verifyDiamond = sports_permission.find(data => data.sport_id == '-101');
      if (!verifyDiamond)
        throw new Error("Diamond data not found!");
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
                  ...verifyDiamond,
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
      // Saving the diamond casino partnerships data.
      await Partnerships.bulkWrite(lotusPartnerships);
      console.info("diamond partnerships added");
      await Series.create(diamond_series_collections);
      console.info("diamond series added");
      await Match.create(diamond_matches_collections);
      console.info("diamond match added");
      await Market.create(diamond_markets_collections);
      console.info("diamond market added");
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