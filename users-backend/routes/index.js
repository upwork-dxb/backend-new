const initBaseRoutes = require('./baseRoutes')
  , initUserRoutes = require('./userRoutes')
  , initSportsRoutes = require('./sportsRoutes')
  , initSeriesRoutes = require('./seriesRoutes')
  , initMatchRoutes = require('./matchRoutes')
  , initMarketRoutes = require('./marketRoutes')
  , initFancyRoutes = require('./fancyRoutes')
  , initGlobalSettingRoutes = require('./globalSettingRoutes')
  , initBetRoutes = require('./betRoutes')
  , initReportRoutes = require('./reportRoutes')
  , initAnalyticsRoutes = require('./analyticsRoutes')
  , initEventRoutes = require('./eventRoutes')
  , initNewsRoutes = require('./newsRoutes')
  , initContentRoutes = require('./contentRoutes')
  , initAccountStatementRoutes = require('./accountStatementRoutes')
  , initWalletRoutes = require('./walletRoutes')
  , initQTechRoutes = require('./qtechRoutes')
  , lotusRoutes = require('./lotusRoutes')
  , supernowaRoutes = require('./supernowaRoutes')
  , qtechRoutes = require('./qtechsRoutes')
  , universalCasinoRoutes = require('./casinos/universalCasino')
  , initQtechGamesRoutes = require('./qtechGamesRoutes')
  , initTelegramRoutes = require('./telegramRoutes')
  , initFloxypayRoutes = require('./paymentgayways/floxypayRoutes')
  , initwhatsappRoutes = require('./whatsappRoute')
  , initAuthAppRoutes = require('./authAppRoutes')
  , { API_INITIAL_ROUTE_V1 } = require('../../config')
  , { INITIAL_ROUTE_PATH } = require("../../utils/supernowaConfig")
  , { QTECH_ROUTE_PATH } = require("../../utils/qTechConfig")
  , { UNIVERSAL_CASINO_ROUTE_PATH } = require("../../utils/casinos/universalCasinoConfig");

module.exports = (app, socketIO) => {
  app.use(`${API_INITIAL_ROUTE_V1}`, initBaseRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/user`, initUserRoutes(socketIO));
  app.use(`${API_INITIAL_ROUTE_V1}/sports`, initSportsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/telegram`, initTelegramRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/whatsapp`, initwhatsappRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/sport`, initSportsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/series`, initSeriesRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/match`, initMatchRoutes(socketIO));
  app.use(`${API_INITIAL_ROUTE_V1}/market`, initMarketRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/fancy`, initFancyRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/globalsetting`, initGlobalSettingRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/bet`, initBetRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/account`, initAccountStatementRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/analytics`, initAnalyticsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/wallet`, initWalletRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/report`, initReportRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/event`, initEventRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/news`, initNewsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/content`, initContentRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/settings`, initContentRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/lotus`, lotusRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/qtechGames`, initQtechGamesRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/floxypay`, initFloxypayRoutes());
  app.use(`/api/poker`, lotusRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/world-casino`, supernowaRoutes());
  app.use(INITIAL_ROUTE_PATH, supernowaRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/qtech`, initQTechRoutes());
  app.use(QTECH_ROUTE_PATH, qtechRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/universal-casino`, universalCasinoRoutes());
  app.use(UNIVERSAL_CASINO_ROUTE_PATH, universalCasinoRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/authApp`, initAuthAppRoutes());
};