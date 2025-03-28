let qtech = require('../admin-backend/service/qtechService');

(async function () {
  console.info((await qtech.checkAccessTokenStatus()).data);
})();