const Joi = require("joi");
const JoiObjectId = require("joi-oid");
const { ResError } = require("../../lib/expressResponder");

module.exports = {
  validator: (req, res, next) => {
    req.validationWith = req.validationWith ? req.validationWith : req.body;
    return Joi.object(req.validationFields)
      .validateAsync(req.validationWith, { abortEarly: false })
      .then((joiData) => {
        req.joiData = joiData;
        next();
      })
      .catch((error) => {
        if (error.hasOwnProperty("details"))
          return ResError(res, {
            msg: error.details.map((data) => data.message).toString(),
          });
        return ResError(res, error);
      });
  },
  getBatchesList: (req, res, next) => {
    req.validationFields = {
      batch_id: Joi.string().optional(),
      job_id: Joi.string().optional(),
      queue_name: Joi.string().optional(),
      status: Joi.string().valid("FAILED", "SUCCESS").optional(),
      limit: Joi.number().min(1).default(50).optional(),
      page: Joi.number().min(1).default(1).optional(),
    };
    return module.exports.validator(req, res, next);
  },
  processBatch: (req, res, next) => {
    req.validationFields = {
      batch_ids: Joi.array().items(Joi.string()).min(1).required(),
    };
    return module.exports.validator(req, res, next);
  },
};
