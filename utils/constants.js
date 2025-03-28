const { TELEGRAM_TOKEN } = require('../environmentConfig');
const LABEL_CHIP_SUMMARY = "CHIP_SUMMARY", LABEL_UKRAINE = "UKRAINE", LABEL_SKY = "SKY", LABEL_DIAMOND = "DIAMOND"
	, LABEL_LOTUS = "LOTUS", LABEL_RADHE = "RADHE", LABEL_B2C_MANAGER = "B2C_MANAGER";

const SOCCER = "1"
const TENNIS = "2";
const CRICKET = "4";
const HR = "7";
const GHR = "4339";
const LIVE_GAME_SPORT_ID = -100;
const UNIVERSE_CASINO_SPORT_ID = "-99";
const DIAMOND_CASINO_SPORT_ID = "-101";
const QTECH_CASINO_SPORT_ID = "QT";
const WCO_CASINO_SPORT_ID = "WCO";
const SUPERNOWA_GAME_SPORT_ID = "-102";

const
	TV_XCENTRAL_1 = "https:///api/get_scoreurl_by_centralid",
	SCOREBOARD_XCENTRAL_1 = "https:///api/get_scoreurl_by_centralid",
	SCOREBOARD_FRNK_1 = "https://rnapi.paisaexch.com/api/get-score/",
	SCOREBOARD_FRNK_2 = "https://scoredata.365cric.com/#/score3/", // Cricket only
	SCOREBOARD_FRNK_3 = "https://anim.365cric.com/#/score1/", // Soccer Tennis only
	TV_FRNK_1 = "http://139.59.73.95:5004/api/getTvUrlByEventid",
	TV_FRNK_2 = "https://sqmr.xyz/nit.php?eventId=",
	TV_FRNK_3 = "http://marketsarket.in:3002/tvurl/",
	TV_FRNK_4 = "https://sqmr.xyz/n.php?eventId=",
	TV_FRNK_5 = "https://nrjlivetv.lagaikhaipro.com/n.php?eventId=",
	TV_FRNK_6 = "https://moneyyug.in/tv.html?id=",
	TV_FRNK_7 = "https://supertv.lotusbook9mm.com/cricket?eventId=",
	TV_FRNK_8 = "https://e765432.xyz/static/48efac116d4775729d8ee0cda4a0361df3d3c89b/getdata.php?chid=",
	TV_FRNK_9 = "https://supertv.lotusbook9mm.com/tv2?event_id=",
	TV_DEFAULT = { url: TV_FRNK_8, non_premium_url: TV_FRNK_9, type: "TV_FRNK_8" },
	SCOREBOARD_DEFAULT = { url: SCOREBOARD_FRNK_1, type: "SCOREBOARD_FRNK_1" };

module.exports = {
	NOT_FOUND: 1404,
	SERVER_ERROR: 1500,
	VALIDATION_ERROR: 201,
	ACCESS_DENIED: 1403,
	NOT_VERIFIED: 1405,
	VALIDATION_FAILED: 401,
	BET_HOLD_VALIDATION: 402,
	ALREADY_EXISTS: 1406,
	SUCCESS: 1200,
	DATA_NULL: null,

	SPORTS_IDS: ["4", "2", "1", "7", "4339", "-100", "-101", QTECH_CASINO_SPORT_ID],

	LIVE_SPORTS: [SOCCER, TENNIS, CRICKET],

	RACING_SPORTS: [HR, GHR],

	MANUAL_CASINOS_IDS: [LIVE_GAME_SPORT_ID.toString(), DIAMOND_CASINO_SPORT_ID, UNIVERSE_CASINO_SPORT_ID],

	QT: QTECH_CASINO_SPORT_ID,
	WCO: WCO_CASINO_SPORT_ID,
	SOCCER,
	TENNIS,
	CRICKET,
	// Horse Racing
	HR,
	// Greyhound Racing
	GHR,

	USER_TYPE_SUPER_ADMIN: 0,
	USER_TYPE_USER: 1,
	USER_TYPE_DEALER: 2,
	USER_TYPE_WHITE_LABLE: 8,
	USERS: "USERS",
	AGENTS: "AGENTS",

	CREDIT_ONE: 1,
	ACCOUNT_STATEMENT_TYPE_CHIPINOUT: 1,
	ACCOUNT_STATEMENT_TYPE_BONUS: 7,
	DEBIT_TWO: 2,

	OAUTH_CLIENT_ID_1: 'application',
	OAUTH_CLIENT_SECRET_1: 'secret',
	OAUTH_CLIENT_ID_2: 'confidentialApplication',
	OAUTH_CLIENT_SECRET_2: 'topSecret',
	OAUTH_TOKEN_VAILIDITY: 6 * 60 * 60,

	DEFAULT_GEOLOCATION: "IPGEOLOCATION",
	IPGEOLOCATION: "IPGEOLOCATION",
	IPGEOLOCATION_URL: "https://api.ipgeolocation.io/ipgeo",
	IPGEOLOCATION_API_KEY: "b81b66deed52442fa3dc96c0316f0879",

	LIVE_GAME_SPORT_ID,
	UNIVERSE_CASINO_SPORT_ID,
	DIAMOND_CASINO_SPORT_ID,
	SUPERNOWA_GAME_SPORT_ID,
	QTECH_CASINO_SPORT_ID,

	GET_LAST_RATE: "https:///api/get_last_rate",
	GET_MARKET_STATUS: "https:///api/get_status_multiple_market",
	GET_ODDS_API_INPLAY: "http://172.105.37.170/api/v1/getMarketOdds?token=jJwyGg3Pl8NffNH5hLFjZQ03AtZc4WolgvAHUm4Y&market_id=",
	GET_ODDS_API_DELAY: "https://api.casinobacklay.com/matchapi.php?Action=multiMarket&MarketID=",
	GET_MANUAL_ODDS_API_INPLAY: "http://20.193.134.199:790/api/markets",
	GET_FANCY_ODDS_API_INPLAY: "http://bm.casinobacklay.com/getbm2?eventId=",
	GET_MANUAL_FANCY_ODDS_API_INPLAY: "http://20.193.134.199:791/api/event",

	TV_EVENTS_FETCH_API: "https://e765432.xyz/static/48efac116d4775729d8ee0cda4a0361df3d3c89b/geteventlist.php",
	TV_EVENTS_FETCH_API_FOR_HRGHR: "https://e765432.xyz/static/48efac116d4775729d8ee0cda4a0361df3d3c89b/horseschedule.php",

	ACTIVE: "ACTIVE", OPEN: "OPEN", SUSPENDED: "SUSPENDED", CLOSED: "CLOSED",
	MATCH_ODDS: "Match Odds", BOOKMAKER: "Bookmaker", TWTT: "To Win The Toss", WINNER_ODDS: "Winner", TIED_MATCH: "Tied Match",
	COMPLETED_MATCH: "Completed Match", OVER_UNDER: "Over/Under", OTHER: "OTHER", FANCY: "Fancy",
	REMOVED: "REMOVED", WINNER: "WINNER", LOSER: "LOSER", INPLAY: "Inplay", DELAY: "Dealy",

	LABEL_CHIP_SUMMARY, LABEL_UKRAINE, LABEL_SKY, LABEL_DIAMOND, LABEL_LOTUS, LABEL_RADHE, LABEL_B2C_MANAGER,

	MATCH_ODDS_TYPE: "MATCH_ODDS", BOOKMAKER_TYPE: "BOOKMAKER", MANUAL_BOOKMAKER_TYPE: "MANUAL_BOOKMAKER", COMPLETED_MATCH_TYPE: "COMPLETED_MATCH",
	TO_WIN_THE_TOSS_TYPE: "TO_WIN_THE_TOSS", TIED_MATCH_TYPE: "TIED_MATCH", OVERUNDER_TYPE: "OVER/UNDER", MANUAL_FANCY_TYPE: "MANUAL_FANCY",

	TITLE_SUPERADMIN: "Super Admin", TITLE_WL: "White Label", TITLE_AGENT: "Agent", TITLE_USE: "User", TITLE_OPERATOR: "Operator",

	TV_DEFAULT, SCOREBOARD_DEFAULT,
	SCOREBOARD_FRNK_1_URL: SCOREBOARD_FRNK_1, SCOREBOARD_FRNK_2_URL: SCOREBOARD_FRNK_2, SCOREBOARD_FRNK_3_URL: SCOREBOARD_FRNK_3,
	SCOREBOARD_FRNK_1: "SCOREBOARD_FRNK_1", SCOREBOARD_FRNK_2: "SCOREBOARD_FRNK_2", SCOREBOARD_FRNK_3: "SCOREBOARD_FRNK_3",
	SCOREBOARD_XCENTRAL_1: "SCOREBOARD_XCENTRAL_1",
	TV_XCENTRAL_1: "TV_XCENTRAL_1", TV_FRNK_1: "TV_FRNK_1", TV_FRNK_2: "TV_FRNK_2", TV_FRNK_3: "TV_FRNK_3", TV_FRNK_4: "TV_FRNK_4",
	TV_FRNK_5: "TV_FRNK_5", TV_FRNK_6: "TV_FRNK_6", TV_FRNK_7: "TV_FRNK_7",

	FRNK: "frnk",
	XCENTRAL: "xcentral",
	API_PROVIDER: "frnk", //xcentral

	FANCY_CATEGORY: { 0: "Fancy", 1: "Session Market", 2: "Over by Over Session Market", 3: "Ball by Ball Session Market", 6: "oddeven" },
	FANCY_CATEGORY_DIAMOND: { 0: "NORMAL", 1: "Session Market", 2: "Over by Over", 3: "Ball by Ball", 6: "oddeven" },
	FANCY_LIVE_LIMITES_FOR: [LABEL_DIAMOND],
	IOREDIS: "ioredis",
	NODE_REDIS: "node-redis",

	EVENT_OAUTH_TOKEN_DELETE: "EVENT_OAUTH_TOKEN_DELETE",

	TELEGRAM_SENT_MESSAGE_URL: `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
	TELEGRAM_SET_WEBHOOK_URL: `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=`,

	LOTUS_GET_RESULT: "https://fawk.app/api/exchange/odds/market/resultJson",

	CENTRAL_SECRETKEY: "",
	BRLN_X_APP: "89NgfKlygf",
	FRNK_SECRETKEY: "63e4a8f44b6c6f38713c4d6e",

	BET_PLACE_TIME: "-bet-place-time",

	API_SETTINGS: "API_SETTINGS-",
	DOMAIN: "DOMAIN-",
	UN_MATCHED_BETS: "UN_MATCHED_BETS",
	LOGO: "LOGO-",
	HOME_MATCHES_OPEN_KEY: "HOME_MATCHES_OPEN" + "-" + process.env.UNIQUE_IDENTIFIER_KEY,
	BET_COUNT: "BET_COUNT:",
	USER_DATA_KEY: "USER_DATA-",
	MARKET_KEY: "MARKET:",
	FANCY_KEY: "FANCY:",
	MANUAL: ":MANUAL",
	AUTO: ":AUTO",
	RESET_PASSWORD: "RESET_PASSWORD-",

	CONTENT_TYPE: ["Slider", "Logo", "Back Ground", "Privacy Policy", "Kyc", "Terms and Conditions", "Rules and Regulations", "Responsible Gambling"],

	UNIQUE_IDENTIFIER_KEY: "-" + process.env.UNIQUE_IDENTIFIER_KEY,

	FANCY: "fancy",
	FANCY1: "fancy1",
	LAY: "lay",
	BACK: "back",
	LAY1: "lay1",
	BACK1: "back1",
	ODDS: "odds",
	SIZE: "size",
	OVERBYOVER: "over by over",
	OVERBYOVERVALUE: "2",
	BALLBYBALL: "ball by ball",
	BALLBYBALLVALUE: "3",
	NORMAL: "normal",
	NORMALVALUE: "1",

	TO_BE_PLACED: "To Be Placed",
	TO_BE_PLACED_TYPE: "TO_BE_PLACED",

	DEFAULT_COUNTRY_CODE: "+91",

	IS_VALIDATE_DOMAIN_LOGIN: process.env.IS_VALIDOMAIN_LOGIN,

	// Event
	USER_CHANGE_EVENT: 'USER_CHANGE_EVENT',
	MARKET_CHANGE_EVENT: 'MARKET_CHANGE_EVENT',
	FANCY_CHANGE_EVENT: 'FANCY_CHANGE_EVENT',

	// BONUS
	FIRST_DEPOSIT: 'first_deposit',
	EVERY_DEPOSIT: 'every_deposit',

	// EXPIRY
	EXPIRY_FOR_REDIS_MARKETS: process.env.EXPIRY_FOR_REDIS_MARKETS || 6,
	EXPIRY_FOR_REDIS_FANCIES: process.env.EXPIRY_FOR_REDIS_FANCIES || 6,

	GET_IP_ADDRESS_DETAILS: 'get-ip-address-details?ip_address=',

	OTP_PURPOSE: {
		TELEGRAM: "TELEGRAM",
		AUTH_APP_ADD_ACCOUNT: "AUTH_APP_ADD_ACCOUNT",
		AUTH_APP_LOGIN_AND_DISABLE: "AUTH_APP_LOGIN_AND_DISABLE",
	},

	DOCUMENT_API_DEFAULT_LIMIT: 10000,
};