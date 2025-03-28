const express = require('express')
	, bodyParser = require('body-parser')
	, compression = require('compression')
	, { createServer } = require("http")
	, cors = require('cors')
	, { ResError } = require('./expressResponder')
	, initRoutes = require('../admin-backend/routes')
	, AuthMiddleware = require('../admin-backend/routes/middlewares/auth')
	, verifyUserMiddleware = require('../admin-backend/routes/middlewares/verifyUser')
	, cronService = require('../utils/cronService')
	, { getStaticContent, loadDomains, corsOptions } = require('../utils')
	, { API_INITIAL_ROUTE_V1 } = require('../config')
	, bull = require("../bull");

// Initialize express app
const app = express();

const httpServer = createServer(app);

const io = require("./admin-SocketIO").init(httpServer);
if (process.env.NODE_APP_INSTANCE == "0" && process.env.START_SERVICE == "true")
	require("./admin-webSocket").init({ server: httpServer, io });

if (process.env.NODE_APP_INSTANCE == "0" && process.env.START_SERVICE == "true") {
	cronService.inactiveAutoMarkets(io); // Active
	cronService.oddsService(); // Active
	cronService.changeMarketInpayStatus(); // Active
	cronService.importFancy(io); // Active
	cronService.inactiveAutoImportFancy(io); // Active
	cronService.TVandScoreBoard(); // Active
	// cronService.pendingResultDeclareQT(); // Active
	cronService.resultMarkets(io); // Active
	cronService.pendingResultDeclareLotus(); // Active
	cronService.clearExposureforClosedRoundsLotus(); // Active
	cronService.pendingResultDeclareUniverseCasino(); // Active
	cronService.clearExposureforClosedRoundsUniverseCasino(); // Active
	cronService.convertUnmatchedBets(io); // Active
	cronService.resultFancy(io); // Active
	cronService.dumpingService(); // Active
	cronService.manualFancyAndMarketOddsDumpService(); // Active
	cronService.marketAndFancyResultRequests(); // Active
	cronService.marketAndFancyRollbackRequests(); // Active
	cronService.qTechAutoClearLiability(); // Active
	// cronService.resetDemoUsersData(); // Active
	// cronService.resultDiamond();
	// cronService.resettleBalance(); // Active
	// require('../utils/telegram_bot').bot;
}

loadDomains();
app.use(cors());

app.use(compression());

app.use(API_INITIAL_ROUTE_V1 + '/', express.static(getStaticContent("/")));

function initMiddleware() {
	app.use(AuthMiddleware);
	// Request body parsing middleware should be above methodOverride
	app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
	app.use(bodyParser.json({ limit: '50mb' }));
	app.use((req, res, next) => { req.headers.origin = req.headers.origin || req.headers.host; next(); });
	app.use(verifyUserMiddleware, (req, res, next) => { req.IO = io; next(); });
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