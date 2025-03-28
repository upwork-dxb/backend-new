const OAuth2Server = require("oauth2-server")
	, CONSTANT = require('../../../utils/constants')
	, { ResError } = require('../../../lib/expressResponder')
	, { API_INITIAL_ROUTE_V1 } = require('../../../config')
	, { INITIAL_ROUTE_PATH } = require("../../../utils/supernowaConfig")
	, { QTECH_ROUTE_PATH } = require("../../../utils/qTechConfig")
	, { STATUS_401 } = require('../../../utils/httpStatusCode')
	, { UNIVERSAL_CASINO_ROUTE_PATH } = require("../../../utils/casinos/universalCasinoConfig");

const Request = OAuth2Server.Request,
	Response = OAuth2Server.Response;

const oauth = new OAuth2Server({
	model: require('../../../oauthmodel'),
	accessTokenLifetime: CONSTANT.OAUTH_TOKEN_VAILIDITY,
	allowBearerTokensInQueryString: true
});

/**
 * This middeleware checks if requesting user is vailid or not
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 * @returns 
 */

module.exports = function (req, res, next) {

	var request = new Request(req);
	var response = new Response(res);

	let ip_data = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] ||
		(
			req.connection.remoteAddress ||
			req.client.remoteAddress ||
			req.socket.remoteAddress ||
			(req.connection.socket ? req.connection.socket.remoteAddress : null)
		).slice(7);

	req.ip_data = ip_data || "127.0.0.1";

	let ignored_routes = [
		API_INITIAL_ROUTE_V1 + '/user/register',
		API_INITIAL_ROUTE_V1 + '/user/userLogin',
		API_INITIAL_ROUTE_V1 + '/user/verifyOTP',
		API_INITIAL_ROUTE_V1 + '/user/telegramResendOTP',
		API_INITIAL_ROUTE_V1 + '/user/getUpdateFromTelegram',
		API_INITIAL_ROUTE_V1 + '/user/createTelegramConnectionId',
		API_INITIAL_ROUTE_V1 + '/telegram/createTelegramConnectionId',
		API_INITIAL_ROUTE_V1 + '/user/demoUserLogin',
		API_INITIAL_ROUTE_V1 + '/user/autoDemoUserLogin',
		API_INITIAL_ROUTE_V1 + '/oauth2/token',
		API_INITIAL_ROUTE_V1 + '/sport/sports',
		API_INITIAL_ROUTE_V1 + '/series/series',
		API_INITIAL_ROUTE_V1 + '/match/matches',
		API_INITIAL_ROUTE_V1 + '/match/homeMatchesOpen',
		API_INITIAL_ROUTE_V1 + '/match/matchesList',
		API_INITIAL_ROUTE_V1 + '/match/matchDetailsOpen',
		API_INITIAL_ROUTE_V1 + '/match/matchesListForFancy',
		API_INITIAL_ROUTE_V1 + '/fancy/fancies',
		API_INITIAL_ROUTE_V1 + '/content/footer-items',
		API_INITIAL_ROUTE_V1 + '/content/get',
		API_INITIAL_ROUTE_V1 + '/content/getLogo',
		API_INITIAL_ROUTE_V1 + '/content/contentGet',
		API_INITIAL_ROUTE_V1 + '/content/getbackgroundImage',
		API_INITIAL_ROUTE_V1 + '/content/download-mobile-app',
		API_INITIAL_ROUTE_V1 + '/content/sliders',
		API_INITIAL_ROUTE_V1 + '/settings',
		API_INITIAL_ROUTE_V1 + '/world-casino/balance',
		API_INITIAL_ROUTE_V1 + '/world-casino/debit',
		API_INITIAL_ROUTE_V1 + '/world-casino/credit',
		API_INITIAL_ROUTE_V1 + '/qtech/gameList',
		API_INITIAL_ROUTE_V1 + '/qtech/providers',
		INITIAL_ROUTE_PATH + '/balance',
		INITIAL_ROUTE_PATH + '/debit',
		INITIAL_ROUTE_PATH + '/credit',
		QTECH_ROUTE_PATH + '/transactions/',
		QTECH_ROUTE_PATH + '/transactions/rollback',
		QTECH_ROUTE_PATH + '/bonus/rewards',
		// Universal Casino
		UNIVERSAL_CASINO_ROUTE_PATH + '/auth',
		UNIVERSAL_CASINO_ROUTE_PATH + '/getBalance',
		UNIVERSAL_CASINO_ROUTE_PATH + '/placeBet',
		UNIVERSAL_CASINO_ROUTE_PATH + '/settlements',
		API_INITIAL_ROUTE_V1 + '/whatsapp/send-code',
		API_INITIAL_ROUTE_V1 + '/whatsapp/re-send',
		API_INITIAL_ROUTE_V1 + '/whatsapp/verify',
		API_INITIAL_ROUTE_V1 + '/whatsapp/getCountryCode',
		API_INITIAL_ROUTE_V1 + '/whatsapp/resetPassword',
		API_INITIAL_ROUTE_V1 + '/whatsapp/verifyResetPasswordOtp',
		API_INITIAL_ROUTE_V1 + '/whatsapp/resendResetPasswordOtp',
		API_INITIAL_ROUTE_V1 + '/whatsapp/setPassword',
		'/api/poker/auth/',
		'/api/poker/exposure',
		'/api/poker/results',
		'/api/poker/refund',
		API_INITIAL_ROUTE_V1 + '/market/allRacingMarketsOpen',
		API_INITIAL_ROUTE_V1 + '/match/getCountryCodeListOpen',
		API_INITIAL_ROUTE_V1 + '/market/getMarketsByCountryCodeOpen',
		API_INITIAL_ROUTE_V1 + '/user/checkUserNameOpen',
	];

	if (req.path.includes(QTECH_ROUTE_PATH) && req.path.includes("/accounts/") && (req.path.includes("/session") || req.path.includes("/balance")))
		ignored_routes.push(req.path);

	if (ignored_routes.includes(req.path))
		next();
	else {
		return oauth.authenticate(request, response)
			.then(function (token) {
				res.locals.oauth = { token: token };
				req.User = token.user;

				// User Type Id != 1 Can not Access Users APIs
				if (!req.User?.user_type_id || req.User?.user_type_id != 1) {
					return ResError(res, { msg: "Unauthenticated Request !!", logout: true })
				}

				if (req.User?.last_login_ip_address) {
					req.ip_data = ["null"].includes(req.User.last_login_ip_address) ? req.ip_data : req.User.last_login_ip_address;
				}
				next();
			}).catch(error => { return ResError(res, { msg: error.message, logout: true, statusCode: STATUS_401 }); });
	}
}