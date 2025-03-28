const express = require('express')
	, bodyParser = require('body-parser')
	, compression = require('compression')
	, { createServer } = require("http")
	, cors = require('cors')
	, initRoutes = require('../users-backend/routes')
	, AuthMiddleware = require('../users-backend/routes/middlewares/auth')
	, { ResError } = require('./expressResponder')
	, { getStaticContent, corsOptions } = require('../utils')
	, { API_INITIAL_ROUTE_V1 } = require('../config')
	, bull = require("../bull");

// Initialize express app
const app = express();

const httpServer = createServer(app);

const io = require("./admin-SocketIO").init(httpServer);

app.use(cors());

app.use(compression());

app.use(API_INITIAL_ROUTE_V1 + '/', express.static(getStaticContent("/")));

function initMiddleware() {
	// OAuth Middleware
	app.use(AuthMiddleware);
	// Request body parsing middleware should be above methodOverride
	app.use(bodyParser.urlencoded({ extended: true, }));
	app.use(bodyParser.json({ limit: '50mb' }));
	app.use((req, res, next) => { req.headers.origin = req.headers.origin || req.headers.host; next(); });
	app.use((req, res, next) => { req.IO = io; next(); });
}

function initErrorRoutes() {
	app.use((error, req, res, next) => {
		// If the error object doesn't exists
		if (!error)
			next();
		// Return error
		if (process.env.NODE_ENV == "production")
			return ResError(res, { msg: "422 Unprocessable Entity!" });
		return ResError(res, error);
	});
}

exports.init = () => {
	// Initialize Express middleware
	initMiddleware();
	// Initialize modules server routes
	initRoutes(app, io);
	// Initialize error routes
	initErrorRoutes();
	return httpServer;
}