const Responder = require("../../lib/expressResponder");
const OAuth2Server = require("oauth2-server");

const Request = OAuth2Server.Request,
	Response = OAuth2Server.Response;

const oauth = new OAuth2Server({
	model: require('../../oauthmodel'),
	accessTokenLifetime: 60 * 60,
	allowBearerTokensInQueryString: true
});

class OAuthController {

	/**
	 * Generates token according to grant_type
	 * @param {*} req 
	 * @param {*} res 
	 * @returns 
	 */
	static obtainToken(req, res) {

		var request = new Request(req);
		var response = new Response(res);

		oauth.token(request, response)
			.then(function (token) {
				return Responder.success(res, { msg: "Token", token: token })
			}).catch(function (err) {
				res.json(err);
			});
	}

	/**
	 * Check incoming request for valid token
	 * @param {*} req 
	 * @param {*} res 
	 * @param {*} next 
	 * @returns 
	 */
	static authenticateRequest(req, res, next) {

		var request = new Request(req);
		var response = new Response(res);

		return oauth.authenticate(request, response)
			.then(function (token) {
				res.locals.oauth = { token: token };
				next();
			}).catch(function (err) {
				res.json(err);
			});
	}
}

module.exports = OAuthController