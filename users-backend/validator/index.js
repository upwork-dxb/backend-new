const Joi = require('joi');
const { ResError } = require('../../lib/expressResponder');

module.exports = {
  validator: (req, res, next) => {
    req.validationWith = req.validationWith ? req.validationWith : req.body;
    return Joi.object(req.validationFields).validateAsync(req.validationWith, { abortEarly: false })
      .then(joiData => { req.joiData = joiData; next() }).catch(error => {
        return ResError(res, { msg: error.details.map(data => data.message).toString() });
      });
  },
}