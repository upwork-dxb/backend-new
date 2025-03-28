const cron = require('node-cron')
  , axios = require('axios')
  , Match = require('../models/match')
  , Market = require('../models/market')
  , Fancy = require('../models/fancy')
  , marketSelection = require('../models/marketSelection')
  , mongoose = require('../connections/mongoose')
  , client = require('../connections/redis')
  , log = require('../utils/logger')
  , apiUrlSettingsService = require('../admin-backend/service/apiUrlSettingsService')
  , ODDS_ = "ODDS_";

(async function () {
  mongoose.connect({ maxPoolSize: 5 })().then(() => {
    log.info("Redis connection established...");
    log.warn("Cron status 'OK'");
    let template = marketSelection(true);
    log.info("Market writing started...");
    apiUrlSettingsService.cronStatus().then(cronStatus => {
      if (cronStatus)
        cron.schedule('*/1 * * * * *', async () => {
          try {
            let getActiveMarkets = await Market.find(
              { is_active: 1 },
              {
                _id: 0,
                market_id: 1,
                runners: 1,
              }
            ).lean();
            let getActiveMarketIds = getActiveMarkets.map(row => `${ODDS_}${row.market_id}`);
            getActiveMarkets = getActiveMarkets.reduce((acc, obj) => {
              const { market_id, runners } = obj;
              acc[market_id] = runners;
              return acc;
            }, {});
            if (getActiveMarketIds.length) {
              let odds = await client.mget(getActiveMarketIds);
              odds = odds.map(row => (row = JSON.parse(row), row))//.filter(data => data);
              odds.map((data, index) => {
                if (data != null) {
                  if (typeof data == 'string')
                    data = JSON.parse(data);
                  let { marketId, status, inplay, runners } = data;
                  runners = runners.map(runner => {
                    return {
                      selectionId: runner.selectionId,
                      status: runner.status,
                      ex: runner.ex
                    }
                  });
                  var original = [...getActiveMarkets[marketId], ...runners],
                    updateRunners = Array.from(
                      original
                        .reduce(
                          (m, o) => m.set(o.selectionId, Object.assign({}, m.get(o.selectionId) || template, o)),
                          new Map
                        )
                        .values()
                    );
                  runners = updateRunners;
                  const query = { market_id: marketId };
                  const update = { $set: { status, inplay, runners } };
                  Market.updateOne(query, update).then().catch(console.error);
                  Match.updateOne(query, update).then().catch(console.error);
                } else if (data == null) {
                  const market_id = getActiveMarketIds[index].replace(ODDS_, "");
                  let runners = {};
                  getActiveMarkets[market_id].map((runner, index) => {
                    runner.ex.availableToBack.map(bk_ly => {
                      bk_ly.size = "--";
                      bk_ly.price = "--";
                      return bk_ly;
                    });
                    runner.ex.availableToLay.map(bk_ly => {
                      bk_ly.size = "--";
                      bk_ly.price = "--";
                      return bk_ly;
                    });
                    runners[`runners.${index}.ex`] = runner.ex;
                  });
                  const query = { market_id };
                  const update = { $set: { status: "SUSPENDED", inplay: false, ...runners } };
                  Market.updateOne(query, update).then().catch(console.error);
                  Match.updateOne(query, update).then().catch(console.error);
                }
              });
            }
          } catch (error) {
            console.error(error);
          }
        }); // 15 sec.
    });

    apiUrlSettingsService.cronStatus("fancy_cron").then(cronStatus => {
      if (cronStatus)
        cron.schedule('*/1 * * * * *', async () => {
          try {
            // fancy cron
            Match.find({ enable_fancy: 1, is_active: 1, is_result_declared: 0 }, { _id: 0, match_id: 1 }).then(match => {
              match.map(async ({ match_id }) => {
                // data from API.
                apiUrlSettingsService.isfancyFromApi().then(fromApi => {
                  if (fromApi) {
                    apiUrlSettingsService.getFancyUrl().then(async fancy_url => {
                      let response;
                      try {
                        response = await axios.get(fancy_url + match_id, { timeout: 3000 });
                        if (response.data.length)
                          response = response.data;
                      } catch (error) { }
                      if (response) {
                        let rest_fancy_id = [];
                        if (response.length) {
                          response = response.map(item => {
                            let fancy_id = `${match_id}_${item.SelectionId}`;
                            rest_fancy_id.push(fancy_id);
                            return {
                              'updateOne': {
                                'filter': { fancy_id: fancy_id, result: null, is_active: 1 },
                                'update': {
                                  '$set': {
                                    session_value_yes: item.BackPrice1,
                                    session_size_yes: item.BackSize1,
                                    session_value_no: item.LayPrice1,
                                    session_size_no: item.LaySize1,
                                    display_message: item.GameStatus,
                                  }
                                }
                              }
                            }
                          });
                          Fancy.bulkWrite(response).then().catch(console.error);
                        }
                        Fancy.find(
                          { match_id, result: null, is_active: 1, fancy_id: { '$nin': rest_fancy_id } },
                          { _id: 0, fancy_id: 1 }
                        ).then(fancies => {
                          if (fancies.length) {
                            fancies = fancies.map(item => ({
                              'updateOne': {
                                'filter': { fancy_id: item.fancy_id },
                                'update': {
                                  '$set': {
                                    display_message: "SUSPENDED",
                                  }
                                }
                              }
                            }));
                            Fancy.bulkWrite(fancies).then().catch(console.error);
                          }
                        }).catch(console.error);
                      }
                    })
                  } else {
                    Fancy.find(
                      { match_id, result: null, is_active: 1 },
                      { _id: 0, fancy_id: 1 }
                    ).then(fancies => {
                      fancies = fancies.map(item => item.fancy_id);
                      if (fancies.length) {
                        client.mget(fancies).then(fancy => {
                          fancy = fancy.filter(data => data).map(row => (row = JSON.parse(row), row));
                          fancy.map(item => {
                            if (item) {
                              let fancy_id = `${match_id}_${item.SelectionId}`;
                              Fancy.updateOne(
                                { fancy_id },
                                {
                                  '$set': {
                                    session_value_yes: item.BackPrice1,
                                    session_size_yes: item.BackSize1,
                                    session_value_no: item.LayPrice1,
                                    session_size_no: item.LaySize1,
                                    display_message: item.GameStatus,
                                  }
                                }).then().catch(console.error);
                            }
                          });
                          let filteredFancyWithNoData = fancies.filter(value => !fancy.map(item => item.fancy_id).includes(value));
                          if (filteredFancyWithNoData.length) {
                            filteredFancyWithNoData = filteredFancyWithNoData.map(item => ({
                              'updateOne': {
                                'filter': { fancy_id: item },
                                'update': {
                                  '$set': {
                                    display_message: "SUSPENDED",
                                  }
                                }
                              }
                            }));
                            Fancy.bulkWrite(filteredFancyWithNoData).then().catch(console.error);
                          }
                        }).catch(console.error);
                      }
                    }).catch(console.error);
                  }
                }).catch(console.error);
              });
            });
          } catch (error) {
            log.error(error);
          }
        }); // 15 sec.
    });
  });
})();