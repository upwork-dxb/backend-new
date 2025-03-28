const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * API url settings model schema
 */
const ApiUrlSettingSchema = new Schema({
  events_base_url: { type: String, default: "foremost.purple25.com/api/liveApi" },
  plug: { type: String, default: "/" },
  is_https: { type: Boolean, default: true },
  http: { type: String, default: "http://" },
  https: { type: String, default: "https://" },
  sports_url: { type: String, default: "sports" },
  series_url: { type: String, default: "series?sport_id=" },
  matches_url: { type: String, default: "matches?series_id=" },
  match_markets_url: { type: String, default: "matches?mType&match_id=" },
  markets_url: { type: String, default: "matches?mType&match_id=" },
  market_selections_url: { type: String, default: "markets?market_id=" },
  market_result_url: { type: String, default: "result?api_type=frnk&market_ids=" },
  fancy_url: { type: String, default: "fancies?from=db&match_id=" },
  fancy_odds_url: { type: String, default: "fancies?from=api&match_id=" },
  selected_sports_ids: { type: Array, default: ["4", "2", "1", "-100", "-101", "-102"] },
  live_fancy_data_from: { type: String, default: "A" }, // A = API, R = Redis
  odds_cron: { type: Boolean, default: false },
  fancy_cron: { type: Boolean, default: false },
  fancy_from_api: { type: Boolean, default: false },
  check_fancy_status: { type: String, default: "A" }, // A = API, R = Redis, DB = Data Base
  check_odds_status: { type: String, default: "A" }, // A = API, R = Redis, DB = Data Base
  odds_from_redis: { type: Boolean, default: true },
  apply_frontend_event_limit_validation: { type: Boolean, default: true },
  is_socket: {
    type: Number,
    enum: [0, 1], default: 0
  },
}, {
  versionKey: false,
  timestamps: true,
  strict: false,
  id: false,
  collection: 'api_url_settings'
});

ApiUrlSettingSchema.set('toJSON', { virtuals: true });

ApiUrlSettingSchema.virtual('getBaseUrl').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}`;
});

ApiUrlSettingSchema.virtual('getSportsApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.sports_url}`;
});

ApiUrlSettingSchema.virtual('getSeriesApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.series_url}`;
});

ApiUrlSettingSchema.virtual('getMatchesApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.matches_url}`;
});

ApiUrlSettingSchema.virtual('getMatchMarketsApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.match_markets_url}`;
});

ApiUrlSettingSchema.virtual('getMarketsApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.markets_url}`;
});

ApiUrlSettingSchema.virtual('getMarketSelectionsApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.market_selections_url}`;
});

ApiUrlSettingSchema.virtual('getMarketResultApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.market_result_url}`;
});

ApiUrlSettingSchema.virtual('getFancyOddsApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}${this.plug}${this.fancy_odds_url}`;
});

ApiUrlSettingSchema.virtual('getFancyApi').get(function () {
  return `${this.is_https ? this.https : this.http}${this.events_base_url}/${this.fancy_url}`;
});

module.exports = mongoose.model('ApiUrlSetting', ApiUrlSettingSchema);