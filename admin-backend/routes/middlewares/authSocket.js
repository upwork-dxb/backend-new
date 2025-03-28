const { AUTH_APP_SOCKET_TOKEN } = require("../../../config/constant/authApp");

const OAuth2Server = require("oauth2-server")
  , { OAUTH_TOKEN_VAILIDITY } = require('../../../utils/constants')
  , Request = OAuth2Server.Request, Response = OAuth2Server.Response
  , oauth = new OAuth2Server({
    model: require('../../../oauthmodel'),
    accessTokenLifetime: OAUTH_TOKEN_VAILIDITY,
    allowBearerTokensInQueryString: true
  });

module.exports = async function (socket, next) {
  try {
    const authapptoken = socket?.handshake?.headers?.authapptoken;
    if (authapptoken == AUTH_APP_SOCKET_TOKEN && AUTH_APP_SOCKET_TOKEN.trim()) {
      return next();
    }
    var request = new Request(Object.assign({}, socket.handshake, { method: "POST" }));
    var response = new Response(socket.handshake);
    let token = await oauth.authenticate(request, response);
    socket.User = token.user;
    next();
  } catch (error) {
    next(new Error(error.message));
  }
}