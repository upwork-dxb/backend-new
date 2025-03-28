const {
  validator,
  fmImportOrigin,
  getTvUrlScoreboardUrl,
  resetTVandScoreBoardURL,
} = require("./");
const Joi = require("joi"),
  JoiObjectId = require("joi-oid"),
  { ResError } = require("../../lib/expressResponder");

module.exports = {
  validator,
  homeMatchesJoiSchema: () => {
    return Joi.object({
      sport_id: Joi.string().trim().optional(),
      series_id: Joi.string().trim().optional(),
      match_id: Joi.string().trim().optional(),
      inplay: Joi.boolean().optional(),
      my_favorites: Joi.boolean().optional(),
      only_runners: Joi.number().valid(0, 1).optional(),
      market_ids: Joi.array().optional(),
      market_analysis: Joi.boolean().optional(),
      market_analysis_fields: Joi.boolean().optional(),
      today: Joi.boolean().optional(),
      tomorrow: Joi.boolean().optional(),
      combine: Joi.boolean().optional(),
      only_sports: Joi.boolean().optional(),
    });
  },
  matchDetailsJoiSchema: () => {
    return Joi.object({
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().trim().required(),
      market_id: Joi.string().trim().optional(),
      // need to change
      // marketIds: Joi.array().min(1).max(8).optional(),
      marketIds: Joi.array().optional(),
      only_runners: Joi.number().valid(0, 1).optional(),
      book_button: Joi.boolean().optional(),
      combine: Joi.boolean().optional(),
      group: Joi.boolean().optional(),
      combine_fancy: Joi.boolean().optional(),
      category_wise_fancy: Joi.boolean().optional(),
      category: Joi.string().optional(),
    });
  },
  homeMatchesOpen: (req, res, next) => {
    req.validationFields = {
      sport_id: Joi.string().optional(),
      series_id: Joi.string().optional(),
      inplay: Joi.boolean().optional(),
      today: Joi.boolean().optional(),
      tomorrow: Joi.boolean().optional(),
      only_sports: Joi.boolean().optional(),
    };
    if (req.method == "GET") {
      req.validationWith = req.query;
    }
    return module.exports.validator(req, res, next);
  },
  matchDetailsOpen: (req, res, next) => {
    req.validationFields = {
      match_id: Joi.string().required(),
      market_id: Joi.string().optional(),
      marketIds: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional()
    };
    if (req.method == "GET") {
      req.validationWith = req.query;
    }
    return module.exports.validator(req, res, next);
  },
  updateMatchStatus: (req, res, next) => {
    req.validationFields = {
      user_id: JoiObjectId.objectId().optional(),
      match_id: Joi.string().required(),
      is_active: Joi.number().valid(0, 1).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  fmImportOrigin,
  getTvUrlScoreboardUrl,
  resetTVandScoreBoardURL,
};
