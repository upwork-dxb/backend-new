const { FANCY_DUMP_CRON_STATUS,
  MARKET_DUMP_CRON_STATUS,
  ENABLE_ODDS_WRITING_IN_REDIS_SERVICE,
  ENABLE_AUTO_MARKET_RATES_SUSPEND } = require("../../config/constant/rateConfig");

const marketService = require("./marketService")
  , matchService = require("./matchService")
  , fancyService = require("./fancyService")
  , exchangeService = require("./exchangeService")
  , publisher = require("../../connections/redisConnections")
  , MARKET_ODDS_PREFIX = "ODDS_"
  , { SUCCESS, INPLAY, DELAY, BOOKMAKER_TYPE, MANUAL_BOOKMAKER_TYPE,
  } = require('../../utils/constants')
  , { getChunkSize, generateReferCode } = require('../../utils')
  , { SocSuccess } = require('../../lib/socketResponder')

async function restAPIconnect(io) {

  let isShowLogs = false;

  sendHeartbeatInplay();
  sendHeartbeatInplayBookmaker();
  sendHeartbeatDelay();

  async function init_inplay() {

    let CricketCode = generateReferCode();

    if (isShowLogs) {
      console.time(CricketCode + " Cricket getMarkets");
    }
    await getMarkets({ cron_inplay: true, sport_id: "4", market_type: { '$ne': BOOKMAKER_TYPE } }, INPLAY, 3, CricketCode);
    if (isShowLogs) {
      console.timeLog(CricketCode + " Cricket getMarkets");
    }

    let SocTenCode = generateReferCode();

    if (isShowLogs) {
      console.time(SocTenCode + " SocTen getMarkets");
    }
    await getMarkets({ cron_inplay: true, sport_id: { "$in": ["2", "1"] } }, INPLAY, 3, SocTenCode);
    if (isShowLogs) {
      console.timeLog(SocTenCode + " SocTen getMarkets");
    }

    let HrGHrCode = generateReferCode();

    if (isShowLogs) {
      console.time(HrGHrCode + " HrGHr getMarkets");
    }
    await getMarkets({ cron_inplay: true, sport_id: { "$in": ["7", "4339"] } }, INPLAY, 3, HrGHrCode);
    if (isShowLogs) {
      console.timeLog(HrGHrCode + " HrGHr getMarkets");
    }

    var today = new Date();
    today.setDate(today.getDate() - 5);
    await getMarkets({ cron_inplay: true, sport_id: "4", market_type: BOOKMAKER_TYPE, match_date: { "$gte": today }, market_id: { '$regex': /\d*\.\d*/ } }, BOOKMAKER_TYPE, 3);

  }

  async function init_delay() {

    await getMarkets({ cron_inplay: false, sport_id: "4", market_type: { '$ne': BOOKMAKER_TYPE } }, DELAY, 15);

    await getMarkets({ cron_inplay: false, sport_id: "2" }, DELAY, 15);

    await getMarkets({ cron_inplay: false, sport_id: "1" }, DELAY, 15);

    await getMarkets({ cron_inplay: false, sport_id: "7", market_id: { $regex: ".+(?<!_m)$" } }, DELAY, 15);

    await getMarkets({ cron_inplay: false, sport_id: "4339", market_id: { $regex: ".+(?<!_m)$" } }, DELAY, 15);

    var today = new Date();
    today.setDate(today.getDate() - 5);
    await getMarkets({ cron_inplay: false, sport_id: "4", market_type: BOOKMAKER_TYPE, match_date: { "$gte": today }, market_id: { '$regex': /\d*\.\d*/ } }, BOOKMAKER_TYPE, 15);

  }

  async function init_inplay_bookmaker() {
    await getMarkets({ cron_inplay: true, sport_id: "4", market_type: BOOKMAKER_TYPE, market_id: { '$regex': /^[^.]*$/ } }, MANUAL_BOOKMAKER_TYPE, 3);
  }

  async function init_inplay_fancy() {
    await getFancy({ cron_inplay: true }, INPLAY, 3);
    // await getFancy({ cron_inplay: true }, MANUAL_FANCY_TYPE, 3);
  }

  async function init_delay_fancy() {
    await getFancy({ cron_inplay: false }, DELAY, 15);
    // await getFancy({ cron_inplay: false }, MANUAL_FANCY_TYPE, 15);
  }

  async function getMarkets(data, API_TYPE, EXPIRE, UUID = undefined) {
    if (API_TYPE == INPLAY && isShowLogs) {
      console.time(UUID + " getting --DATABASE-- market");
    }
    let markets = await getAllActiveMarkets(data);
    if (API_TYPE == INPLAY && isShowLogs) {
      console.timeLog(UUID + " getting --DATABASE-- market");
    }
    if (markets.statusCode == SUCCESS) {
      markets = markets.data;
      let MarketsIds = markets.map(data => data.market_id),
        chunkSize = getChunkSize(API_TYPE);
      if (API_TYPE == INPLAY && isShowLogs) {
        console.time(UUID + " getting **API** response");
      }
      let markets_data = await marketService.getOddsRates({ markets_ids: MarketsIds, sport_id: data.sport_id, API_TYPE, chunkSize });
      if (API_TYPE == INPLAY && isShowLogs) {
        console.timeLog(UUID + " getting **API** response");
      }
      if (markets_data.statusCode == SUCCESS) {
        markets_data = markets_data.data;

        let marketWiseRedisData;
        let remainingMarkets;
        if (MARKET_DUMP_CRON_STATUS == 'true') {
          marketWiseRedisData = await marketService.getMarketFronRedis(markets)
          const oddsMarketIds = markets_data.map(i => i.marketId);
          remainingMarkets = markets.filter(i => !oddsMarketIds.includes(i.market_id));
        }

        for (const market of markets_data) {
          processEmit({ content: market, is_fancy: false });
          if (ENABLE_ODDS_WRITING_IN_REDIS_SERVICE == 'true') {
            publisher.set(MARKET_ODDS_PREFIX + market.marketId, JSON.stringify(market), 'EX', EXPIRE).then();
          }
          if (MARKET_DUMP_CRON_STATUS == 'true') {
            marketService.updateMarketsInRedis(marketWiseRedisData, market);
          }
        }
        if (MARKET_DUMP_CRON_STATUS == 'true' &&
          ENABLE_AUTO_MARKET_RATES_SUSPEND == 'true') {
          marketService.suspendMarketsInRedis(remainingMarkets, marketWiseRedisData);
        }
      }
    }
  }

  async function getFancy(data, API_TYPE, EXPIRE) {
    let matches = await getAllActiveMatchesForFancies(data);
    if (matches.statusCode == SUCCESS) {
      matches = matches.data;
      for (const match of matches) {
        let fancy_data = await fancyService.getOddsRates({ id: match.match_id, API_TYPE });
        if (fancy_data?.statusCode == SUCCESS) {
          fancy_data = fancy_data.data;

          const fancyIds = [];
          let fancyDataRedisObj;
          if (FANCY_DUMP_CRON_STATUS == 'true') {
            const fancyIdList = fancy_data.map(i => {
              fancyIds.push(i.fancy_id);
              return { match_id: match.match_id, market_id: i.fancy_id }
            });
            fancyDataRedisObj = await marketService.getMarketFronRedis(fancyIdList, true);
          }

          fancy_data.map(fancy => {
            fancy.fancy_id = match.match_id + "_" + fancy.SelectionId;
            processEmit({ content: fancy, is_fancy: true });
            if (ENABLE_ODDS_WRITING_IN_REDIS_SERVICE == 'true') {
              publisher.set(fancy.fancy_id.toString(), JSON.stringify(fancy), 'EX', EXPIRE).then();
            }

            if (FANCY_DUMP_CRON_STATUS == 'true') {
              fancyService.updateFanciesInRedis(fancyDataRedisObj, fancy)
            }
          });

          if (FANCY_DUMP_CRON_STATUS == 'true') {
            fancyService.deleteFanciesInRedis(fancyIds, match.match_id)
          }
        }
      }
    }
  }

  async function init_delay_emit() {
    let marketEmit = await exchangeService.getMarketDelayData();
    if (marketEmit.statusCode == SUCCESS) {
      marketEmit = marketEmit.data;
      marketEmit.map(data => {
        if (data) {
          let emitMarketId = data.marketId;
          io.to(emitMarketId).emit(emitMarketId, SocSuccess({ data, is_fancy: false }));
        }
      });
    }
  }

  function processEmit(data) {
    data.is_fancy ? changeDetectionFancy(data) : changeDetectionMarket(data);
  }

  function changeDetectionMarket(data) {
    const MARKET_ID = data.content.marketId;
    publisher.get(MARKET_ODDS_PREFIX + MARKET_ID).then(result => {
      if (result) {
        try {
          let previous = JSON.parse(result), current = data.content;
          if (previous.hasOwnProperty("runners") && current.hasOwnProperty("runners"))
            if (JSON.stringify(previous.runners) != JSON.stringify(current.runners))
              preProcessEmit(data);
        } catch (error) { console.error(error) }
      }
    }).catch(console.error);
  }

  function changeDetectionFancy(data) {
    const FANCY_ID = data.content.fancy_id;
    publisher.get(FANCY_ID).then(result => {
      if (result) {
        try {
          let previous = result, current = JSON.stringify(data.content);
          if (previous.toString() != current.toString())
            preProcessEmit(data);
        } catch (error) { console.error(error) }
      }
    }).catch(console.error);
  }

  function preProcessEmit(data) {
    const { is_fancy, content } = data
      , eventId = is_fancy ? content.fancy_id : content.marketId
      , eventContent = { data: content, is_fancy };
    emit({ eventId, eventContent });
  }

  function emit(data) {
    const { eventId, eventContent } = data;
    io.to(eventId).emit(eventId, SocSuccess(eventContent));
  }

  function sendHeartbeatInplay() {
    try {
      console._times.clear();
      init_inplay();
      // init_delay_emit();
    } catch (error) {
      console.error(error);
    }
    setTimeout(function () { sendHeartbeatInplay(); }, 800);
  }

  function sendHeartbeatInplayBookmaker() {
    try {
      // Comment out as per request https://trello.com/c/9DCZOApW/89-berlin-cms-panel-code-comment
      // init_inplay_bookmaker();
      init_inplay_fancy();
    } catch (error) {
      console.error(error);
    }
    setTimeout(function () { sendHeartbeatInplayBookmaker(); }, 400);
  }

  function sendHeartbeatDelay() {
    try {
      init_delay();
      init_delay_fancy();
    } catch (error) {
      console.error(error);
    }
    setTimeout(function () { sendHeartbeatDelay(); }, 10000);
  }

  function getAllActiveMarkets(data = {}) {
    let filter = {
      is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0, ...data,
    };
    return marketService.getMarketDetails(filter, ["-_id", "market_name", "market_type", "market_id", "match_id"]).then(data => data);
  }

  function getAllActiveMatchesForFancies(data = {}) {
    var today = new Date();
    today.setDate(today.getDate() - 5);
    return matchService.getMatchesDetails({
      is_active: 1, is_visible: true, is_result_declared: 0, sport_id: "4", enable_fancy: 1, is_abandoned: 0,
      ...data, match_date: { "$gte": today }
    }, ["-_id", "match_id", "market_id", "market_name", "market_type"]).then(data => data);
  }
}

exports.restAPIconnect = restAPIconnect;