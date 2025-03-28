const express = require('./admin-express')
  , mongoose = require('../connections/mongoose')
  , eventWatch = require('./eventWatch')
  , { ADMIN_PORT_1 } = require('../config');
require('../utils/logger');
require('../admin-backend/service/disconnect/init');

const start = () => {
  const appStartMessage = () => {
    if (process.env.NODE_ENV == "production") {
      global.log.info(`Server Name : admin`);
      global.log.info(`Environment : ${process.env.NODE_ENV}`);
      global.log.info(`App Port : ${ADMIN_PORT_1}`);
      global.log.info(`Process Id : ${process.pid}`);
      global.log.info(`REDIS : ${process.env.REDIS_CONNECTION}`);
    } else {
      global.log.debug(`Server Name : admin`);
      global.log.debug(`Environment : ${process.env.NODE_ENV}`);
      global.log.debug(`App Port : ${ADMIN_PORT_1}`);
      global.log.debug(`Process Id : ${process.pid}`);
      global.log.debug(`REDIS : ${process.env.REDIS_CONNECTION}`);
    }
  };

  const options = mongoose.getOptions();
  //Connect to Db
  mongoose.connect(options)().then(() => {
    global.log.info("admin server is ready...");
    if (process.env.NODE_APP_INSTANCE == "0" && process.env.START_SERVICE == "true") {
      console.info("The event watch is actively monitoring the system for any changes or incidents....");
      eventWatch.sportEventInit();
      eventWatch.seriesEventInit();
      eventWatch.matchEventInit();
      eventWatch.marketEventInit();
      eventWatch.fancyEventInit();
      eventWatch.oAuthTokenEventInit();
      eventWatch.apiUrlSettingEventInit();
      eventWatch.methodTypeEventInit();
      eventWatch.bankingMethodEventInit();
      eventWatch.betCountEventInit();
      eventWatch.userEventInit();
      eventWatch.betCountEventInit();
      // eventWatch.qtechRetryResult();
    }
    const httpServer = express.init();
    httpServer.listen(ADMIN_PORT_1, appStartMessage);
  });
};

exports.start = start;