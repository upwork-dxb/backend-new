const Joi = require('joi'),
  { ResError } = require('../../lib/expressResponder')

module.exports = {
  userByBankValidator: (req, res, next) => {
    return Joi.object({
      account_no: Joi.number().optional(),
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
  userByIPvalidator: (req, res, next) => {
    return Joi.object({
      from_date: Joi.string().required(),
      to_date: Joi.string().required(),
      ip_address: Joi.string().optional(),
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
}