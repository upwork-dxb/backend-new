const OAuth2Server = require("oauth2-server")
	, CONSTANTS = require('../../../utils/constants')
	, { ResError } = require('../../../lib/expressResponder')
	, redisClient = require("../../../connections/redisConnections")
	, { getIPAddressUID } = require("../../../utils/getter-setter");

const Request = OAuth2Server.Request,
	Response = OAuth2Server.Response;

const oauth = new OAuth2Server({
	model: require('../../../oauthmodel'),
	accessTokenLifetime: CONSTANTS.OAUTH_TOKEN_VAILIDITY,
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

	const ignored_routes = [
		'/api/v1/user/adminLogin',
		'/api/v1/user/verifyOTP',
		'/api/v1/user/telegramResendOTP',
		'/api/v1/telegram/getUpdateFromTelegram',
		'/api/v1/telegram/createTelegramConnectionId',
		'/api/v1/oauth2/token',
		'/api/v1/sport/sports',
		'/api/v1/series/series',
		'/api/v1/match/matches',
		'/api/v1/match/homeMatchesOpen',
		'/api/v1/match/matchesList',
		'/api/v1/match/matchDetailsOpen',
		'/api/v1/match/matchDetailsOpenV2',
		'/api/v1/match/matchesListForFancy',
		'/api/v1/fancy/fancies',
		'/api/v1/fancy/fanciesV2',
		'/api/v1/content/footer-items',
		'/api/v1/content/get',
		'/api/v1/content/getLogo',
		'/api/v1/content/getLogoAndBackground',
		'/api/v1/content/getbackgroundImage',
		'/api/v1/content/download-mobile-app',
		'/api/v1/content/sliders',
		'/api/v1/content/getContentType',
		'/api/v1/settings',
		'/api/v1/import/GetToken',
		'/api/v1/import/IsValidToken',
		'/api/v1/import/SaveImportMarketData',
		'/api/v1/import/formostEventImport',
		'/api/v1/series/fm/import',
		'/api/v1/match/fm/import',
		'/api/v1/market/fm/import',
		'/api/v1/fancy/fm/results',
		'/api/v1/bet/fm/sessionResult',
		'/api/v1/bet/fm/sessionRollback',
		'/api/v1/bet/fm/sessionAbandoned',
		'/api/v1/world-casino/download',
		'/api/v1/qtech/gameList',
		'/api/v1/qtech/providers',
		'/api/v1/floxyPay/deposit-webhook',
		'/api/v1/floxyPay/withdraw-webhook',
		'/api/v1/floxyPay/payment-status',
		'/api/v1/authApp/open/addAccount',
		'/api/v1/authApp/open/verifyOTP',
		'/api/v1/authApp/open/getAppId',
		'/api/v1/authApp/open/getOTP',
		'/api/v1/authApp/open/removeAccount',
		'/' // This is for socket testing only, 
	];

	if (ignored_routes.includes(req.path))
		next();
	else {
		return oauth.authenticate(request, response)
			.then(function (token) {
				res.locals = { user_id: token.user.user_id };
				req.User = token.user;

				// User Type Id -> 1 Can not Access Admin APIs
				if (req.User?.user_type_id == 1) {
					return ResError(res, { msg: "Unauthenticated Request !!", logout: true })
				}

				redisClient.get(getIPAddressUID(token.accessToken)).then((redisIpAddressData) => {
					if (redisIpAddressData) {
						redisIpAddressData = JSON.parse(redisIpAddressData)
						req.ip_data = redisIpAddressData.ip;
					} else {
						if (req.User?.last_login_ip_address) {
							req.ip_data = ["null"].includes(req.User.last_login_ip_address) ? req.ip_data : req.User.last_login_ip_address;
						}
					}
				})
				next();
			}).catch(error => { return ResError(res, { msg: error.message, logout: true }); });
	}
}