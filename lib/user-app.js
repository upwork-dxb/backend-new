const express = require('./user-express')
  , mongoose = require('../connections/mongoose')
  , { USER_PORT_1 } = require('../config');
require('../utils/logger');
require('../admin-backend/service/disconnect/init');

const start = () => {
  const appStartMessage = () => {
    if (process.env.NODE_ENV == "production") {
      global.log.info(`Server Name : user`);
      global.log.info(`Environment : ${process.env.NODE_ENV}`);
      global.log.info(`App Port : ${USER_PORT_1}`);
      global.log.info(`Process Id : ${process.pid}`);
      global.log.info(`REDIS : ${process.env.REDIS_CONNECTION}`);
    } else {
      global.log.debug(`Server Name : user`);
      global.log.debug(`Environment : ${process.env.NODE_ENV}`);
      global.log.debug(`App Port : ${USER_PORT_1}`);
      global.log.debug(`Process Id : ${process.pid}`);
      global.log.debug(`REDIS : ${process.env.REDIS_CONNECTION}`);
    }
  };
  const options = mongoose.getOptions();
  //Connect to Db
  mongoose.connect(options)().then(() => {
    global.log.info("user server is ready...");
    const httpServer = express.init();
    httpServer.listen(USER_PORT_1, appStartMessage);
  });
};

exports.start = start;