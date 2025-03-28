const Joi = require('joi')
  , { ResError } = require('../../lib/expressResponder')

module.exports = {
  validateHorseRacingBet: (req, res, next) => {
    return Joi.array().items({
      market_id: Joi.string().required(),
      selection_id: Joi.number().required(),
      selection_name: Joi.string().optional(),
      odds: Joi.number().min(1).required(),
      stack: Joi.number().integer().min(1).required(),
      is_back: Joi.string().valid(0, 1).required(),
      is_hr_bet: Joi.boolean().default(true).optional(),
    }).min(2).unique((a, b) => a.selection_id == b.selection_id).validateAsync(req.body, { abortEarly: false })
      .then(body => { req.body = body; next(); }).catch(error => {
        return ResError(res, error);
      });
  }
}