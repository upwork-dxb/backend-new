const mongooseCon = require('../../connections/mongoose')
const universalCasino = require('../../admin-backend/service/casinos/universalCasino');

(async function () {

  mongooseCon.connect({ maxPoolSize: 1 })().then(async () => {
    console.info((await universalCasino.importSport()).data);
  });

})();