const cron = require('node-cron')
  , getCurrentLine = require('get-current-line')
  , moment = require('moment')
  , { SocSuccess } = require('../lib/socketResponder')
  , matchService = require('../admin-backend/service/matchService')
  , marketService = require('../admin-backend/service/marketService')
  , fancyService = require('../admin-backend/service/fancyService')
  , betService = require('../admin-backend/service/betService')
  , diamondService = require('../admin-backend/service/diamondService')
  , qtechService = require('../admin-backend/service/qtechService')
  , lotusService = require('../admin-backend/service/lotusService')
  , universalCasinoService = require('../admin-backend/service/casinos/universalCasino')
  , logger = require('./loggers')
  , { API_PROVIDER,
  } = require("../utils/constants")
  , { getTimeTaken } = require("./");
const {
  SESSION_RESULT_TYPE,
  SESSION_ROLLBACK_TYPE,
  MARKET_RESULT_TYPE,
  MARKET_ROLLBACK_TYPE } = require('../config/constant/result');

const { FANCY_DUMP_CRON_STATUS,
  MARKET_DUMP_CRON_STATUS } = require('../config/constant/rateConfig');

// , { bot } = require("./telegram_bot")
// , telegramService = require('../admin-backend/service/telegramService')
let marketResultRunning = false, fancyResultRunning = false, qtechResultRunning = false, universeCasinoResultRunning = false
  , lotusResultRunning = false, isUnMatchedConversionRunning = false
  , marketDumpRunning = false
  , fancyDumpRunning = false
  , manulFancyOddsDumpRunning = false
  , manulMarketOddsDumpRunning = false
  , marketAndFancyResultRequestsRunning = false
  , marketAndFancyRollbackRequestsRunning = false
  , qTechAutoClearLiabilityRunning = false
  , marketResultParams = { search: { is_rollback: 0, is_processing: 0 }, pendingMarkets: 1, page: 1, limit: 50 }
  , fancyResultParams = { search: { is_result_declared: 0, is_active: 0, is_rollback: 0, is_processing: 0 }, limit: 25, page: 1 };

module.exports = {
  importFancy: (io) => {
    console.info("Auto import fancy service started...");
    async function importFancy() {
      try {
        let autoImportFancyResult = await fancyService.autoImportFancy();
        if (autoImportFancyResult) {
          if (autoImportFancyResult.length <= 10) {
            if (autoImportFancyResult.length) {
              autoImportFancyResult.map(data => {
                const { match_id, fancy_id, name, fancy_name, selection_id, is_active, is_lock } = data;
                io.emit(match_id + "_fancy_added", SocSuccess({
                  data: { fancy_id, name, fancy_name, selection_id, is_active, is_lock },
                  hasData: true,
                  msg: "New fancy added..."
                }));
              });
            }
          } else
            io.emit(autoImportFancyResult[0].match_id + "_fancy_added", SocSuccess({
              hasData: false,
              msg: "New fancies added..."
            }));
        }
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 10 sec.
    cron.schedule('*/10 * * * * *', () => importFancy());
  },
  inactiveAutoImportFancy: (io) => {
    console.info("Auto inactive fancy service started...");
    async function inactiveAutoImportFancy() {
      try {
        let inactiveAutoImportFancy = await fancyService.inactiveAutoImportFancy(API_PROVIDER);
        if (inactiveAutoImportFancy)
          if (inactiveAutoImportFancy.length)
            inactiveAutoImportFancy.map(match_id => {
              io.emit(match_id + "_fancy_added", SocSuccess({
                hasData: false,
                msg: "Fancy updated..."
              }));
            });
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 20 sec.
    cron.schedule('*/20 * * * * *', async () => inactiveAutoImportFancy());
  },
  inactiveAutoMarkets: async (io) => {
    console.info("Auto inactive markets service started...");
    async function inactiveAutoMarkets() {
      try {
        let inactiveAutoMarkets = await marketService.inactiveAutoMarkets("frnk");
        if (inactiveAutoMarkets)
          if (inactiveAutoMarkets.length) {
            inactiveAutoMarkets.map(match_id => {
              io.emit(match_id + "_new_market_added", SocSuccess({
                hasData: false,
                msg: "Market updated..."
              }));
            });
            io.emit("new_market_added", SocSuccess({
              hasData: false,
              msg: "Match list updating..."
            }));
          }
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 10 sec.
    cron.schedule('*/10 * * * * *', async () => inactiveAutoMarkets());
  },
  resultMarkets: (io) => {
    console.info("Market auto result service started...");
    async function resultMarkets() {
      if (marketResultRunning)
        return;
      marketResultRunning = true;
      try {
        let marketResults = await betService.resultMarkets(marketResultParams);
        if (marketResults)
          if (marketResults.length) {
            marketResults.map(data => {
              const { match_id, sport_name, series_name, match_name } = data;
              io.emit(match_id + "_new_market_added", SocSuccess({
                msg: `Market result ${sport_name} -> ${series_name} -> ${match_name}`,
                hasData: false,
              }));
            });
          }
      } catch (error) {
        console.error(error);
      }
      marketResultRunning = false;
    }
    // Run every 60 sec.
    cron.schedule('*/60 * * * * *', () => resultMarkets());
  },
  resultFancy: (io) => {
    console.info("Fancy auto result service started...");
    async function resultFancy() {
      if (fancyResultRunning)
        return;
      fancyResultRunning = true;
      try {
        let fancyResults = await betService.resultFancy(fancyResultParams);
        if (fancyResults)
          if (fancyResults.length) {
            fancyResults.map(data => {
              const { match_id, message } = data;
              // telegramService.sendMessage(bot, message);
              io.emit(match_id + "_fancy_added", SocSuccess({
                hasData: false,
                msg: message
              }));
            });
          }
      } catch (error) {
        console.error(error);
      }
      fancyResultRunning = false;
    }
    // Run every 60 sec.
    cron.schedule('*/60 * * * * *', () => resultFancy());
  },
  oddsService: () => {
    console.info("Market odds service started...");
    async function marketOddsServiceForCoreSports() {
      try {
        await marketService.marketOddsServiceForCoreSports();
      } catch (error) {
        console.error(error);
      }
    }
    console.info("Racing odds service started...");
    async function racingSportsOddsWrite() {
      try {
        await marketService.racingSportsOddsWrite();
      } catch (error) {
        console.error(error);
      }
    }
    console.info("Fancy odds service started...");
    async function fancyOddsWrite() {
      try {
        await fancyService.fancyOddsService();
      } catch (error) {
        console.error(error);
      }
    }
    async function homeMatchesWrite() {
      try {
        await matchService.homeMatchesWrite();
      } catch (error) {
        console.error(error);
      }
    }

    // Run every 1 min.
    cron.schedule('* * * * *', async () => {
      marketOddsServiceForCoreSports();
      fancyOddsWrite();
    });

    // Run every 10 sec.
    cron.schedule('*/10 * * * * * *', async () => {
      homeMatchesWrite();
    }, { runOnInit: true });

    // Run every 10 min.
    cron.schedule('*/10 * * * *', async () => {
      racingSportsOddsWrite();
    });
  },
  changeMarketInpayStatus: () => {
    console.info("market inplay update status service started...");
    async function changeMarketInpayStatus() {
      try {
        await marketService.changeMarketInpayStatusForceFully();
        await marketService.getUpcommingHRandGrMarkets();
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 12 sec.
    cron.schedule('*/12 * * * * *', () => changeMarketInpayStatus());
  },
  TVandScoreBoard: () => {
    console.info("TV and scoreboard update service started...");
    async function TVandScoreBoard() {
      try {
        // await matchService.updateTVandScoreBoardURL(API_PROVIDER);
        await matchService.updateTVandScoreBoardURLV1(API_PROVIDER);
        await matchService.updateTVForHrAndGHrURL(API_PROVIDER);
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 10 min.
    cron.schedule('*/10 * * * *', () => TVandScoreBoard());
  },
  resetDemoUsersData: () => {
    console.info("Demo users reset service started...");
    async function resetDemoUsersData() {
      try {
        await betService.resetDemoUsersData();
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 12:00 AM.
    cron.schedule('0 0 0 * * *', () => resetDemoUsersData(), { timezone: "Asia/Kolkata" });
  },
  resultDiamond: () => {
    console.info("Diamond casino result service started...");
    async function resultDiamond() {
      try {
        await diamondService.resultDiamond();
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 15 seconds.
    cron.schedule('*/15 * * * * * *', () => resultDiamond());
  },
  pendingResultDeclareQT: () => {
    console.info("QTech pending result declare service started...");
    async function pendingResultDeclareQT() {
      if (qtechResultRunning)
        return;
      qtechResultRunning = true;
      try {
        await qtechService.pendingResultDeclareQT({ body: { multiple: true } });
      } catch (error) {
        console.error(error);
      }
      qtechResultRunning = false;
    }
    // Run every 1 min.
    cron.schedule('* * * * *', () => pendingResultDeclareQT(), { timezone: "Asia/Kolkata" });
  },
  pendingResultDeclareLotus: () => {
    console.info("Lotus pending result declare service started...");
    async function pendingResultDeclareLotus() {
      if (lotusResultRunning)
        return;
      lotusResultRunning = true;
      try {
        await lotusService.clearPendingRoundsWithRetryLimitOver({ body: { multiple: true } });
      } catch (error) {
        console.error(error);
      }
      lotusResultRunning = false;
    }
    // Run every 10 min.
    cron.schedule('*/10 * * * *', () => pendingResultDeclareLotus());
  },
  clearExposureforClosedRoundsLotus: () => {
    console.info("Lotus exposure clear for pending rounds service started...");
    async function clearExposureforClosedRoundsLotus() {
      try {
        await lotusService.clearExposureforClosedRoundsLotus();
        await lotusService.declareResultForClosedRoundsLotus();
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 1 hrs.
    cron.schedule('0 */1 * * *', () => clearExposureforClosedRoundsLotus());
  },
  pendingResultDeclareUniverseCasino: () => {
    console.info("Universe Casino pending result declare service started...");
    async function pendingResultDeclareUniverseCasino() {
      if (universeCasinoResultRunning)
        return;
      universeCasinoResultRunning = true;
      try {
        await universalCasinoService.retryResultDeclare();
      } catch (error) {
        console.error(error);
      }
      universeCasinoResultRunning = false;
    }
    // Run every 12 min.
    cron.schedule('*/12 * * * *', () => pendingResultDeclareUniverseCasino());
  },
  clearExposureforClosedRoundsUniverseCasino: () => {
    console.info("Universe Casino service for clearing pending rounds has been started...");
    async function clearExposureforClosedRoundsUniverseCasino() {
      try {
        await universalCasinoService.clearExposureforClosedRoundsUniverseCasino();
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 1 hrs.
    cron.schedule('0 */1 * * *', () => clearExposureforClosedRoundsUniverseCasino());
  },
  resettleBalance: () => {
    console.info("QTech balance resettlement started...");
    async function resettleBalance() {
      try {
        await qtechService.resettleBalance({});
      } catch (error) {
        console.error(error);
      }
    }
    // Run every 12:00 AM.
    cron.schedule('*/10 * * * *', () => resettleBalance(), { timezone: "Asia/Kolkata" });
  },
  convertUnmatchedBets: (io) => {
    /*This Cron Convert the Un Matched Bet to Matched
      Bets if the Odds Matched */

    // Add the Unmatched bets whose odds matched to the 
    // redis db to initiate the conversion process
    console.info("Convert Unmatched Bets started...");
    async function convert_unmatched_bets() {
      try {
        await betService.startConvertUnMatchedBets();
      } catch (error) {
        console.error(error);
      }
    }

    // Pick Unmatched Bets from the Redis DB and perform the 
    // conversion operation on them one by one !!
    console.info("Unmatched Bets Conversion started...");
    async function process_bets_conversion() {

      if (isUnMatchedConversionRunning)
        return;

      isUnMatchedConversionRunning = true;

      try {

        var startTime = moment();

        const count = await betService.startUnMatchedBetConversion(io);

        if (count) {

          logger.info(`Converted: ${count} Bets`);

          logger.info(`Conversion Time: ${getTimeTaken({ startTime })}`);

        }
      } catch (error) {

        logger.error(`
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
        `);

      }

      isUnMatchedConversionRunning = false;
    }

    // Run every Second
    // cron.schedule('*/1 * * * * *', () => convert_unmatched_bets(), { timezone: "Asia/Kolkata" });

    // Alternate for Running Interval Less than 1 Second !!
    setInterval(() => convert_unmatched_bets(), 500);
    setInterval(() => process_bets_conversion(), 1000);
  },
  dumpingService: () => {
    /*This Cron Dumps the active Markets data to Redis*/

    async function market_dump_initiator() {

      if (marketDumpRunning)
        return;

      marketDumpRunning = true;

      try {
        // const startTime = moment();

        await marketService.marketsDumpRedis();

        // logger.info(`Market Dump: ${getTimeTaken({ startTime })}`);
      } catch (error) {

        logger.error(`
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
        `);
      }

      marketDumpRunning = false;
    }

    async function fancy_dump_initiator() {

      if (fancyDumpRunning)
        return;

      fancyDumpRunning = true;

      try {
        // const startTime = moment();

        await fancyService.fancyDumpRedis();

        // logger.info(`Fancy Dump: ${getTimeTaken({ startTime })}`);
      } catch (error) {
        logger.error(`
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
        `);

      }

      fancyDumpRunning = false;
    }


    if (MARKET_DUMP_CRON_STATUS == 'true') {
      console.info("Market Dumping started...");
      market_dump_initiator();
      setInterval(() => market_dump_initiator(), 1000 * 5);
    }

    if (FANCY_DUMP_CRON_STATUS == 'true') {
      console.info("Fancy Dumping started...");
      fancy_dump_initiator();
      setInterval(() => fancy_dump_initiator(), 1000 * 5);
    }
  },
  manualFancyAndMarketOddsDumpService: () => {
    /*This Cron Dumps the active Markets data to Redis*/

    async function manual_market_odds_dump_service() {

      if (manulMarketOddsDumpRunning)
        return;

      manulMarketOddsDumpRunning = true;

      try {
        // const startTime = moment();

        await marketService.manualMarketOddsDumpRedis();

        // logger.info(`Manual Market Odds Dump: ${getTimeTaken({ startTime })}`);
      } catch (error) {

        logger.error(`
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
        `);
      }

      manulMarketOddsDumpRunning = false;
    }

    async function manual_fancy_odds_dump_service() {

      if (manulFancyOddsDumpRunning)
        return;

      manulFancyOddsDumpRunning = true;

      try {
        // const startTime = moment();

        await fancyService.manualFancyOddsDumpRedis();

        // logger.info(`Manual Fancy Odds Dump: ${getTimeTaken({ startTime })}`);
      } catch (error) {
        logger.error(`
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}
        `);
      }

      manulFancyOddsDumpRunning = false;
    }

    // Run every 5 Second
    if (MARKET_DUMP_CRON_STATUS == 'true') {
      console.info("Manual Market Odds Dumping started...");
      setInterval(() => manual_market_odds_dump_service(), 500 * 1);
    }

    if (FANCY_DUMP_CRON_STATUS == 'true') {
      console.info("Manual Fancy Odds Dumping started...");
      setInterval(() => manual_fancy_odds_dump_service(), 500 * 1);
    }
  },
  marketAndFancyResultRequests: () => {
    /*This Cron Dumps the active Markets data to Redis*/

    async function marketAndFancyResultRequestsInner() {

      if (marketAndFancyResultRequestsRunning)
        return;

      marketAndFancyResultRequestsRunning = true;

      try {
        const startTime = moment();

        await betService.processMarketAndFancyResultRequests();
        const msg = `Market & Fancy Result Requests: ${getTimeTaken({ startTime })}`;
        logger.SessionResultRollBack(msg);
      } catch (error) {

        logger.SessionResultRollBack(`ERROR In marketAndFancyResultRequestsInner
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error)}
          ERROR_STACK: ${JSON.stringify(error.stack)}
        `);
      }

      marketAndFancyResultRequestsRunning = false;
    }

    // Run every 15 Second
    if (SESSION_RESULT_TYPE == 'CRON' || MARKET_RESULT_TYPE == 'CRON') {
      console.info("Market & Fancy Result Requests started...");
      setInterval(() => marketAndFancyResultRequestsInner(), 1000 * 15);
    }
  },
  marketAndFancyRollbackRequests: () => {
    /*This Cron Dumps the active Markets data to Redis*/

    async function marketAndFancyRollbackRequestsInner() {

      if (marketAndFancyRollbackRequestsRunning)
        return;

      marketAndFancyRollbackRequestsRunning = true;

      try {
        const startTime = moment();

        await betService.processMarketAndFancyRollbackRequests();
        const msg = `Market & Fancy Rollback Requests: ${getTimeTaken({ startTime })}`;

        logger.SessionResultRollBack(msg);
        // console.log(msg)
      } catch (error) {

        logger.SessionResultRollBack(`ERROR In marketAndFancyRollbackRequestsInner
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error)}
          ERROR_STACK: ${JSON.stringify(error.stack)}
        `);
      }

      marketAndFancyRollbackRequestsRunning = false;
    }

    // Run every 30 Second
    if (SESSION_ROLLBACK_TYPE == 'CRON' || MARKET_ROLLBACK_TYPE == 'CRON') {
      console.info("Market & Fancy Rollback Requests started...");
      setInterval(() => marketAndFancyRollbackRequestsInner(), 1000 * 30);
    }
  },
  qTechAutoClearLiability: () => {
    /*This Cron Dumps the active Markets data to Redis*/

    async function qTechAutoClearLiabilityInner() {

      if (qTechAutoClearLiabilityRunning)
        return;

      qTechAutoClearLiabilityRunning = true;

      try {
        const startTime = moment();

        await qtechService.autoClearLiability();
        const msg = `Q-Tech Auto Clear Liability: ${getTimeTaken({ startTime })}`;

        // logger.info(msg);
        // console.log(msg)
      } catch (error) {

        logger.info(`ERROR In qTechAutoClearLiabilityInner
          FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
          FUNCTION: ${getCurrentLine.default().method}
          ERROR: ${JSON.stringify(error)}
          ERROR_STACK: ${JSON.stringify(error.stack)}
        `);
      }

      qTechAutoClearLiabilityRunning = false;
    }

    // Run every 5 Mins
    console.info("Qtech Auto Clear Liability started...");
    setInterval(() => qTechAutoClearLiabilityInner(), 1000 * 60 * 5);

  },
}