const initBaseRoutes = require('./baseRoutes')
  , initOAuthRoutes = require('./oAuthRoutes')
  , initUserRoutes = require('./userRoutes')
  , initUserSettingSportswiseRoutes = require('./userSettingSportsWiseRoutes')
  , initWebsiteSettingRoutes = require('./websiteSettingRoutes')
  , initSportsRoutes = require('./sportsRoutes')
  , initMatchRoutes = require('./matchRoutes')
  , initMarketRoutes = require('./marketRoutes')
  , initAccountStatementRoutes = require('./accountStatementRoutes')
  , initGlobalSettingRoutes = require('./globalSettingRoutes')
  , initSeriesRoutes = require('./seriesRoutes')
  , initFancyRoutes = require('./fancyRoutes')
  , initBetRoutes = require('./betRoutes')
  , initWalletRoutes = require('./walletRoutes')
  , initReportRoutes = require('./reportRoutes')
  , initAnalyticsRoutes = require('./analyticsRoutes')
  , initNewsRoutes = require('./newsRoutes')
  , initContentRoutes = require('./contentRoutes')
  , initEventsRoutes = require('./eventRoutes')
  , initDiamondRoutes = require('./diamondRoutes')
  , initLotusRoutes = require('./lotusRoutes')
  , initSupernowaRoutes = require('./supernowaRoutes')
  , initQTechRoutes = require('./qtechRoutes')
  , initUniversalCasinoRoutes = require('./casinos/universalCasino')
  , initEventImportRoutes = require('./eventImportRoutes')
  , initQtechGamesRoutes = require('./qtechGamesRoutes')
  , initTelegramRoutes = require('./telegramRoutes')
  , initFloxyPayRoutes = require('./paymentgayways/floxypayRoutes')
  , initBonusRoutes = require('./bonusRoutes')
  , initBetLockRoutes = require('./betLockRoutes')
  , initAuthAppRoutes = require('./authAppRoutes')
  , initBatchRoutes = require('./batchRoutes')
  , { API_INITIAL_ROUTE_V1 } = require('../../config');

module.exports = (app, socketIO) => {
  app.use(`${API_INITIAL_ROUTE_V1}`, initBaseRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/oauth2`, initOAuthRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/user`, initUserRoutes(socketIO));
  app.use(`${API_INITIAL_ROUTE_V1}/telegram`, initTelegramRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/userSettings`, initUserSettingSportswiseRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/website`, initWebsiteSettingRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/sports`, initSportsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/sport`, initSportsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/series`, initSeriesRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/match`, initMatchRoutes(socketIO));
  app.use(`${API_INITIAL_ROUTE_V1}/market`, initMarketRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/account`, initAccountStatementRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/wallet`, initWalletRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/globalsetting`, initGlobalSettingRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/fancy`, initFancyRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/bet`, initBetRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/report`, initReportRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/analytics`, initAnalyticsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/news`, initNewsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/content`, initContentRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/event`, initEventsRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/lotus`, initLotusRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/diamond`, initDiamondRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/supernowa`, initSupernowaRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/world-casino`, initSupernowaRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/qtech`, initQTechRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/import`, initEventImportRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/settings`, initContentRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/qtechGames`, initQtechGamesRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/floxyPay`, initFloxyPayRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/universal-casino`, initUniversalCasinoRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/bonus`, initBonusRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/lock`, initBetLockRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/authApp`, initAuthAppRoutes());
  app.use(`${API_INITIAL_ROUTE_V1}/batch`, initBatchRoutes());
};