const Joi = require('joi');
const JoiObjectId = require('joi-oid');
const moment = require('moment');
const { ResError } = require('../../lib/expressResponder');
const { DOCUMENT_API_DEFAULT_LIMIT } = require('../../utils/constants');

module.exports = {

	validator: (req, res, next) => {

		req.validationWith = req.validationWith ? req.validationWith : req.body;

		return Joi.object(req.validationFields).validateAsync(req.validationWith, { abortEarly: false })
			.then(joiData => { req.joiData = joiData; next() })
			.catch(error => ResError(res, { msg: error.details.map(data => data.message).toString() }));
	},

	eventsProfitLoss: (req, res, next) => {
		req.validationFields = {
			user_id: JoiObjectId.objectId().optional(),
			is_user: Joi.boolean().optional().default(false),
			search: Joi.object({
				user_id: JoiObjectId.objectId().optional(),
				sport_id: Joi.string().optional(),
				sport_name: Joi.string().optional(),
				series_id: Joi.string().optional(),
				series_name: Joi.string().optional(),
				match_id: Joi.string().optional(),
				match_name: Joi.string().optional(),
				match_date: Joi.string().optional(),
				event_id: Joi.string().optional(),
				event_name: Joi.string().optional(),
				type: Joi.number().valid(1, 2).optional(),
			}).optional(),
			from_date: Joi.string().optional(),
			to_date: Joi.string().optional(),
			limit: Joi.number().min(50).max(500).default(50).optional(),
			page: Joi.number().min(1).max(100).default(1).optional(),
		};
		return module.exports.validator(req, res, next);
	},

	getReportStatements: (req, res, next) => {
		return Joi.object({
			user_id: Joi.string().optional(),
			from_date: Joi.string().required(),
			to_date: Joi.string().required(),
			search: Joi.array().optional(),
			limit: Joi.number().optional(),
			page: Joi.number().optional(),
		}).validateAsync(req.body, { abortEarly: false }).then(() => {
			next();
		}).catch(error => {
			if (error.hasOwnProperty("details"))
				return ResError(res, { msg: error.details.map(data => data.message).toString() });
			return ResError(res, error);
		});
	},

	getSportsLivePlDashboard: (req, res, next) => {
		return Joi.object({
			user_id: JoiObjectId.objectId().optional(),
			from_date: Joi.string().optional(),
			to_date: Joi.string().optional(),
		}).validateAsync(req.body, { abortEarly: false })
			.then(() => next())
			.catch(error => ResError(res, { msg: error.details.map(data => data.message).toString() }));
	},
	settlementReportV2: (req, res, next) => {
		req.validationFields = {
			user_id: JoiObjectId.objectId().optional(),
			user_type_id: Joi.number().optional(),
			search: Joi.optional()
		};
		return module.exports.validator(req, res, next);
	},
	settlementCollectionHistory: (req, res, next) => {
		req.validationFields = {
			user_id: JoiObjectId.objectId().required(),
			opening_balance: Joi.number().default(0).optional()
		};
		return module.exports.validator(req, res, next);
	},
	userAuthListValidationObject: {
		search: Joi.string().optional(),
		limit: Joi.number().min(10).max(500).default(50).optional(),
		page: Joi.number().min(1).max(100).default(1).optional(),
	},
	userAuthList: (req, res, next) => {
		req.validationFields = module.exports.userAuthListValidationObject;
		return module.exports.validator(req, res, next);
	},
	userAuthListDocument: (req, res, next) => {
		req.validationFields = {
			...module.exports.partywinLossReportValidationObject,
			document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
			limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
		};
		return module.exports.validator(req, res, next);
	},
	ptsReport: (req, res, next) => {
		req.validationFields = {
			user_id: JoiObjectId.objectId().required(),
		};
		return module.exports.validator(req, res, next);
	},
	turnoverValidationObject: {
		user_id: JoiObjectId.objectId().optional(),
		type: Joi.string().valid("fancy", "market", "casino").optional(),
		search: Joi.object({
			sport_id: Joi.string().optional(),
			market_type: Joi.string().optional(),
			category: Joi.number().optional(),
		}).optional(),
		from_date: Joi.string().required(),
		to_date: Joi.string().required(),
	},
	turnover: (req, res, next) => {
		req.validationFields = module.exports.turnoverValidationObject;
		const { from_date, to_date } = req.body;
		// Parse dates using moment
		const from = moment(from_date, "DD-MM-YYYY", true); // Strict parsing
		const to = moment(to_date, "DD-MM-YYYY", true); // Strict parsing

		// Validate both dates
		if (!from.isValid() || !to.isValid()) {
			return ResError(res, { msg: "Invalid date format" });
		}

		// Calculate difference in days
		const diffDays = to.diff(from, 'days');

		if (diffDays > 7) {
			return ResError(res, { msg: "Dates are not within 7 days" });
		}

		const startOfDayUTC = from.startOf('day');
		const endOfDayUTC = to.endOf('day');

		req.body.from_date = startOfDayUTC.format();
		req.body.to_date = endOfDayUTC.format();

		return module.exports.validator(req, res, next);
	},
	turnoverDocument: (req, res, next) => {
		req.validationFields = {
			...module.exports.turnoverValidationObject,
			document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
		};
		const { from_date, to_date } = req.body;
		// Parse dates using moment
		const from = moment(from_date, "DD-MM-YYYY", true); // Strict parsing
		const to = moment(to_date, "DD-MM-YYYY", true); // Strict parsing

		// Validate both dates
		if (!from.isValid() || !to.isValid()) {
			return ResError(res, { msg: "Invalid date format" });
		}

		// Calculate difference in days
		const diffDays = to.diff(from, 'days');

		if (diffDays > 7) {
			return ResError(res, { msg: "Dates are not within 7 days" });
		}

		const startOfDayUTC = from.startOf('day');
		const endOfDayUTC = to.endOf('day');

		req.body.from_date = startOfDayUTC.format();
		req.body.to_date = endOfDayUTC.format();

		return module.exports.validator(req, res, next);
	},
	partywinLossReportValidationObject: {
		filter_type: Joi.number().min(1).max(1).optional(),
		user_name: Joi.string().optional(),
		page: Joi.number().min(1).default(1).optional(),
		limit: Joi.number().min(1).default(200).optional(),
	},
	partywinLossReport: (req, res, next) => {
		req.validationFields = module.exports.partywinLossReportValidationObject;
		return module.exports.validator(req, res, next);
	},

	partywinLossReportDocument: (req, res, next) => {
		req.validationFields = {
			...module.exports.partywinLossReportValidationObject,
			document_type: Joi.string().valid("PDF", "EXCEL", "CSV").required(),
			limit: Joi.number().default(DOCUMENT_API_DEFAULT_LIMIT).optional(),
		};
		return module.exports.validator(req, res, next);
	}

}