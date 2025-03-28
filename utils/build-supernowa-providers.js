const writeFile = require('util').promisify(require('fs').writeFileSync)
  , path = require("path")
  , supernowa_providers_file = path.normalize(path.resolve(__dirname, "./supernowa-games.json"))
  , env = path.normalize(path.resolve(__dirname, "../.env"))
  , mongoose = require('../connections/mongoose')
  , Sports = require('../models/sports')
  , supernowaService = require("../users-backend/service/supernowaService");
require('dotenv').config({ path: env });

(function () {
  mongoose.connect({ maxPoolSize: 1 })().then(async () => {
    let GAMES = await supernowaService.getGamesList();
    if (GAMES.length) {
      try {
        Sports.find({ providerCode: { "$ne": null } }).select("-_id name sport_id providerCode").lean().then(sports => {
          if (sports.length) {
            for (let game of GAMES) {
              let sport = sports.find(data => data.providerCode == game.providerCode);
              if (sport) {
                game.sport_id = sport.sport_id;
                game.sport_name = sport.name;
              }
            }
          }
          GAMES = GAMES.reduce((prev, current) => {
            const { providerCode, code } = current;
            if (current.hasOwnProperty("sport_id")) {
              if (prev[providerCode]) {
                if (!prev[providerCode][code])
                  prev[providerCode][code] = current;
              } else
                prev[providerCode] = {};
              if (!prev[providerCode][code])
                prev[providerCode][code] = current;
            }
            return prev;
          }, {});
          console.info(supernowa_providers_file);
          writeFile(supernowa_providers_file, JSON.stringify(GAMES, null, 2), 'utf8');
          console.warn("games generated...");
          mongoose.disconnect();
        }).catch(console.error);
      } catch (error) { console.error(error); }
    }
  });
})();