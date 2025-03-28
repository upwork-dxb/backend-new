const { ENABLE_ODDS_CREATOR_SERVICE } = require("../config/constant/rateConfig");

const WebSocket = require("ws")
  , mongoose = require('mongoose')
  , Market = require("../models/market")
  , Fancy = require("../models/fancy")
  , marketService = require("../admin-backend/service/marketService")
  , fancyService = require("../admin-backend/service/fancyService")
  , socketService = require("../admin-backend/service/socketService")
  , publisher = require("../connections/redisConnections")
  , subscriber = publisher.duplicate()
  , { LIVE_GAME_SPORT_ID, DIAMOND_CASINO_SPORT_ID, NODE_REDIS } = require('../utils/constants')
  , { SocSuccess } = require('./socketResponder')
  , { SUCCESS } = require('../utils/constants')
  , MATCH_ODDS = "match_odds", FANCY = "fancy", BOOKMAKER = "Bookmaker", TWTT = "To Win The Toss"
  , SET = "set", UNSET = "unset"
  , set_unset_markets = "set_unset_markets"
  , utils = require('../utils')
  , { marketOddsFormatter, fancyFormatter } = utils;
let EventMatch = [
  { "$match": { "operationType": { "$in": ["insert", "update"] } } }
];
let bookmakerIds = [];

exports.init = async (resources) => {
  const { io } = resources;

  async function connect() {
    let url = 'wss://:8881?token=' + Math.floor(Math.random() * 100000)
      , wsClient = new WebSocket(url);

    if (process.env.REDIS_CONNECTION == NODE_REDIS) {
      try {
        await subscriber.connect();
      } catch (error) {
        console.error("WebSocket Redis subscriber error: " + error);
      }
    }

    wsClient.onopen = async () => init();

    /**
     * match_date : It shows only the past 3 markets.
     * centralIds : It collects market central ids when the WebSocket client is connected and ready.
     * wsClient.send : it sets one-time central ids when WebSocket is invoked.
     * sendHeartbeat
     */
    async function init() {
      let markets = await getAllActiveMarkets();
      if (markets.statusCode == SUCCESS) {
        markets = markets.data;
        let fancies = await getAllActiveFancies();
        if (fancies.statusCode == SUCCESS) {
          fancies = fancies.data.map(row => (row.market_name = "Fancy", row));
          markets = [...markets, ...fancies];
        }
        let centralIds = markets.map(data => data.centralId).toString();
        bookmakerIds = markets.map(data => IsSpecificMarketName(data.market_name) ? data.centralId : null).filter(data => data);
        wsClient.send(`{"action": "set","markets":"${centralIds}"}`);
      }
      sendHeartbeat();
    }

    const marketEventEmitter = Market.watch(EventMatch);
    marketEventEmitter.on('change', async change => {
      const { updateDescription, operationType, fullDocument } = change;
      let centralId, action, market_name;
      // result [declared, rollback, abandoned], is_visible is_active
      if (updateDescription != undefined) {
        const { updatedFields } = updateDescription;
        if (updatedFields != undefined) {
          const fieldsLength = Object.keys(updatedFields).length;
          if (updatedFields.hasOwnProperty("is_visible") && fieldsLength == 1)
            action = updatedFields.is_visible ? SET : UNSET;
          if (updatedFields.hasOwnProperty("is_active") && fieldsLength == 1)
            action = updatedFields.is_active ? SET : UNSET;
          if (mongoose.Types.ObjectId.isValid(updatedFields.bet_result_id) && fieldsLength == 6)
            action = UNSET;
          if (updatedFields.bet_result_id == null && fieldsLength == 6)
            action = SET;
          let market = await Market.findById(change.documentKey._id).select("-_id centralId market_name");
          centralId = market.centralId;
          market_name = market.market_name;
        }
      }
      // If new market added
      if (operationType != undefined)
        if (operationType == "insert")
          if (fullDocument != undefined) {
            action = SET; centralId = fullDocument.centralId; market_name = fullDocument.market_name;
          }
      if (centralId && action && market_name)
        addRemoveCentralIdForBookmakerAndEmmitAllEvents(market_name, centralId, action);
    });

    const fancyEventEmitter = Fancy.watch(EventMatch);
    fancyEventEmitter.on('change', async change => {
      const { updateDescription, operationType, fullDocument } = change;
      let centralId, action, fancy_name;
      // result [declared, rollback, abandoned], is_visible is_active
      if (updateDescription != undefined) {
        const { updatedFields } = updateDescription;
        if (updatedFields != undefined) {
          const fieldsLength = Object.keys(updatedFields).length;
          if (updatedFields.hasOwnProperty("is_visible") && fieldsLength == 2)
            action = updatedFields.is_visible ? SET : UNSET;
          if (updatedFields.hasOwnProperty("is_active") && fieldsLength == 2)
            action = updatedFields.is_active == 1 ? SET : UNSET;
          if (mongoose.Types.ObjectId.isValid(updatedFields.bet_result_id) && [6, 7].includes(fieldsLength))
            action = UNSET;
          if (updatedFields.bet_result_id == null && [6, 7].includes(fieldsLength))
            action = SET;
          let fancy = await Fancy.findById(change.documentKey._id).select("-_id centralId fancy_name");
          centralId = fancy.centralId;
          fancy_name = fancy.fancy_name;
        }
      }
      // If new fancy added
      if (operationType != undefined)
        if (operationType == "insert")
          if (fullDocument != undefined) {
            action = SET; centralId = fullDocument.centralId; fancy_name = fullDocument.fancy_name;
          }
      if (centralId && action && fancy_name)
        addRemoveCentralIdForBookmakerAndEmmitAllEvents(fancy_name, centralId, action);
    });

    try {
      subscriber.subscribe(set_unset_markets, (centralIds, channelName) => {
        if (channelName == set_unset_markets) {
          try {
            centralIds = JSON.parse(centralIds);
            centralIds.map(({ market_name, centralId, action }) => addRemoveCentralIdForBookmakerAndEmmitAllEvents(market_name, centralId, action));
          } catch (error) { }
        }
      });
    } catch (error) {
      console.error("WebSocket subscriber error: " + error);
    }

    wsClient.onmessage = (eventLists) => {
      try {
        let listOfEvent = JSON.parse(eventLists.data);
        if (listOfEvent.hasOwnProperty("data")) {
          if (listOfEvent.data.length) {
            let eventType = listOfEvent.messageType;
            if (eventType == MATCH_ODDS)
              marketOddsEmitter(listOfEvent.data[0]);
            if (eventType == FANCY) {
              if (bookmakerIds.length)
                if (listOfEvent.data[0].hasOwnProperty("mi"))
                  if (bookmakerIds.includes(listOfEvent.data[0].mi.toString())) {
                    listOfEvent.data[0].isBookmaker = true;
                    marketOddsEmitter(listOfEvent.data[0]);
                  }
              if (listOfEvent.data[0].hasOwnProperty("mi"))
                if (!bookmakerIds.includes(listOfEvent.data[0].mi.toString()))
                  fancyEmitter(listOfEvent.data[0]);
            }
          }
        }
      } catch (error) { console.error(error); }
    }

    function marketOddsEmitter(market) {
      let marketOdds = marketOddsFormatter(market);
      if (marketOdds.status) {
        marketOdds = marketOdds.data;
        let emitMarketId = marketOdds.marketId.toString();
        io.to(emitMarketId).emit(emitMarketId, SocSuccess({ data: marketOdds, is_fancy: false }));
        publisher.set("ODDS_" + emitMarketId, JSON.stringify(marketOdds), 'EX', 3).then();
      }
    }

    function fancyEmitter(fancy) {
      let fancyOdds = fancyFormatter(fancy);
      if (fancyOdds.status) {
        fancyOdds = fancyOdds.data;
        let emitFancy = fancyOdds.fancy_id.toString();
        io.to(emitFancy).emit(emitFancy, SocSuccess({ data: fancyOdds, is_fancy: true }));
        publisher.set(emitFancy, JSON.stringify(fancyOdds), 'EX', 3).then();
      }
    }

    function getAllActiveMarkets() {
      var today = new Date();
      today.setDate(today.getDate() - 3);
      return marketService.getMarketDetails({
        is_active: 1, is_visible: true, is_abandoned: 0, is_result_declared: 0,
        centralId: { "$ne": null }, sport_id: { $nin: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID] },
        match_date: { "$gte": today }
      }, ["-_id", "centralId", "market_name"]).then(data => data);
    }

    function getAllActiveFancies() {
      // var today = new Date();
      // today.setDate(today.getDate() - 1);
      return fancyService.getFancyDetails({
        is_active: 1, is_visible: true, is_result_declared: 0,
        centralId: { "$ne": null }, //match_date: { "$gte": today }
      }, ["-_id", "centralId"]).then(data => data);
    }

    function addRemoveCentralIdForBookmakerAndEmmitAllEvents(market_name, centralId, action) {
      if (action == UNSET) {
        if (IsSpecificMarketName(market_name)) {
          var index = bookmakerIds.indexOf(centralId);
          if (index >= 0)
            bookmakerIds.splice(index, 1);
        }
      }
      if (action == SET)
        if (IsSpecificMarketName(market_name))
          if (centralId)
            bookmakerIds.push(centralId);
      bookmakerIds = [...new Set(bookmakerIds)];
      wsClient.send(`{"action": "${action}","markets":"${centralId}"}`);
    }

    function IsSpecificMarketName(market_name) {
      return [BOOKMAKER, TWTT].includes(market_name);
    }

    function sendHeartbeat() {
      try {
        var vDatasend = '{"action":"heartbeat","data":[]}';
        wsClient.send(vDatasend);
      } catch (error) {
        console.error(error);
      }
      setTimeout(function () { sendHeartbeat(); }, 10000);
    }

    wsClient.onclose = function (event) {
      if (event.wasClean)
        console.error(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
      else
        console.error('[close] Connection died');
      setTimeout(function () {
        console.info('Socket is closed. Reconnect will be attempted in 1 second.', event.reason);
        connect();
      }, 1000);
    }

    wsClient.onerror = (error) => {
      console.error(`WebSocket error: ${error.message}`);
      wsClient.close();
    }

  }

  // connect();

  if (ENABLE_ODDS_CREATOR_SERVICE == 'true') {
    socketService.restAPIconnect(io);
  }
}