const BetResults = require('../../models/betResults')
  , CONSTANTS = require('../../utils/constants')
  , betService = require('../../admin-backend/service/betService')
  , marketsService = require('../../admin-backend/service/marketService');

const client = require('../../connections/redis')

async function resultDiamond(params = {}) {
  try {
    let getDimond = await client.keys('ODDS_-101.*');
    if (getDimond.length) {
      let markets = await client.mget(getDimond);
      markets.map(async market => {
        market = JSON.parse(market);
        const { marketId, result } = market;
        if (result != false) {
          /* Get Market Details */
          let market = await marketsService.getMarketDetails({ marketId }, ["-_id", "runners.name", "runners.selectionId", "marketId", "centralId"]);
          if (market.statusCode != CONSTANTS.SUCCESS)
            return;
          const runnersData = market.data[0].runners;
          let winnerSelectionIdLive = result.result;
          let toalTeams = runnersData.length;
          let winnerSelectionId = undefined;
          let winnerName = undefined;
          for (let i = 0; i < toalTeams; i++) {
            if (winnerSelectionIdLive == runnersData[i].selectionId) {
              winnerSelectionId = runnersData[i].selectionId;
              winnerName = runnersData[i].name;
              break;
            }
          }

          if (winnerSelectionId === undefined) { // LOSER
            winnerSelectionId = runnersData[toalTeams - 1].selectionId; // Get Last Runner selection ID
            winnerName = "LOSER";
          }

          if (winnerName.length > 0) {
            declareResult(marketId, `${marketId}.${result.mid.split(".")[1]}`, winnerSelectionId, winnerName)
          }
        }
      });
    }
  } catch (error) { console.error(error) }
};

function declareResult(market_id, full_market_id, winnerSelectionId, winner) {
  let original_market_id = market_id;
  return marketsService.getMarketDetail(
    { market_id }, [
    "sport_id", "sport_name", "series_id", "series_name", "match_id",
    "match_name", "market_name", "-_id"
  ]).then(market => {
    if (market.statusCode == CONSTANTS.SUCCESS) {
      data = market.data;
      data.original_market_id = original_market_id;
      data.market_id = full_market_id;
      data.selection_id = winnerSelectionId;
      data.selection_name = winner;
      let { sport_id, series_id, match_id, market_id } = market.data;
      return BetResults.findOne(
        { sport_id, series_id, match_id, market_id: full_market_id }
      ).then(betResultAlreadyDeclared => {
        if (betResultAlreadyDeclared != null)
          return { status: false, data: "Result already declared!", resultAlreadyDeclared: 1 };
        let betResult = new BetResults(Object.assign(data, { winner_name: data.selection_name }));
        return betService.oddsResultV2(Object.assign(data, { bet_result_id: betResult._id })).then(async oddsResult => {
          if (oddsResult.statusCode != CONSTANTS.SUCCESS) {
            Market.updateOne({ sport_id, series_id, match_id, market_id }, { result_status: oddsResult.data }).then().catch(console.error);
            return { status: false, data: oddsResult.data + (process.env.DEBUG == "true" ? " oddsResult have some issue!" : "") };
          }
          await betResult.save();
          return { status: true, data: oddsResult.data + (process.env.DEBUG == "true" ? " oddsResult save successfully..." : "") };
        }).catch(error => { return { status: false, data: error.message + (process.env.DEBUG == "true" ? " oddsResult throw exception!" : "") } });
      }).catch(error => { return { status: false, data: `Error while getting result: ${error.message}` + (process.env.DEBUG == "true" ? " oddsResult throw exception!" : "") } });
    }
    return { status: false, data: market.data + (process.env.DEBUG == "true" ? " market have some issue!" : "") };
  }).catch(error => { return { status: false, data: error.message + (process.env.DEBUG == "true" ? " market throw exception!" : "") } });
}

module.exports = { declareResult, resultDiamond }