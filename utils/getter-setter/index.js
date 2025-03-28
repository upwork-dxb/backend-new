const CONSTANTS = require('../constants');
const KEY = require('./constant');

module.exports = {
  getOAuthTokenUID: (pattern) => {
    const key = `${KEY.OAUTH_TOKEN}${pattern}${CONSTANTS.UNIQUE_IDENTIFIER_KEY}`;
    return key;
  },
  getUserCacheUID: (pattern) => {
    const key = `${CONSTANTS.USER_DATA_KEY}${pattern.toLowerCase()}${CONSTANTS.UNIQUE_IDENTIFIER_KEY}`;
    return key;
  },
  getIPAddressUID: (pattern) => {
    const key = `${KEY.IP_ADDRESS_KEY}${pattern}${CONSTANTS.UNIQUE_IDENTIFIER_KEY}`;
    return key;
  },
  getFmIPAddressUID: (pattern) => {
    const key = `${KEY.FM_IP_ADDRESS}${pattern}`;
    return key;
  },
  // Concurrency Control
  getOddsResultUID: (pattern) => {
    const key = `${KEY.ODDS_RESULT}${pattern}`;
    return key;
  },
  getOddsAbandonedUID: (pattern) => {
    const key = `${KEY.ODDS_ABANDONED}${pattern}`;
    return key;
  },
  getOddsRollbackUID: (pattern) => {
    const key = `${KEY.ODDS_ROLLBACK}${pattern}`;
    return key;
  },
  getSessionResultUID: (pattern) => {
    const key = `${KEY.SESSION_RESULT}${pattern}`;
    return key;
  },
  getSessionAbandonedUID: (pattern) => {
    const key = `${KEY.SESSION_ABANDONED}${pattern}`;
    return key;
  },
  getSessionRollbackUID: (pattern) => {
    const key = `${KEY.SESSION_ROLLBACK}${pattern}`;
    return key;
  },
  getBetUID: (user_id) => {
    const key = `${KEY.BET_PLACE}_${user_id}`;
    return key;
  },
  getAuraUID: (name, ...keys) => {
    let key = `${name}`;
    for (const keyItem of keys) {
      key = `${key}_${keyItem}`;
    }
    return key;
  },
}