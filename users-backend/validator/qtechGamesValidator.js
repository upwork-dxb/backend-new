const Joi = require('joi')
  , { ResError } = require('../../lib/expressResponder')

module.exports = {
  setQtechGameFavoriteUnFavorite: (req, res, next) => {
    return Joi.object({ id: Joi.string().required(), is_favorite: Joi.boolean().optional() })
      .validateAsync(req.body, { abortEarly: false })
      .then(() => next())
      .catch(error => {
        return ResError(res, error);
      });
  }
}