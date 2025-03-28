const { ObjectId } = require("bson");
const resultResponse = require('../../utils/globalFunction').resultResponse;
const BonusLogs = require('../../models/bonusLogs');
const {
  SUCCESS, NOT_FOUND, SERVER_ERROR,USER_TYPE_SUPER_ADMIN
} = require("../../utils/constants");

function getLogs(req) {

  let { domain_id, user_id, domain_name, from_date, to_date, limit, page } = req.joiData;

  let filter = {};

  if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {
    filter["domain_name"] = req.User.domain_name;
  }

  if (from_date && to_date) {
    filter["createdAt"] = { '$gte': new Date(from_date), '$lte': new Date(to_date) };
  }

  if (domain_id) {
    filter["domain_id"] = ObjectId(domain_id);
  }

  if (domain_name) {
    filter["domain_name"] = domain_name;
  }

  if (user_id) {
    filter["user_id"] = ObjectId(user_id);
  }

  let skip = (page - 1) * limit;

  return BonusLogs
    .find(filter)
    .limit(limit)
    .skip(skip)
    .sort({ createdAt: -1 })
    .then(data => {

      if (!data.length) {
        return resultResponse(NOT_FOUND, `No logs data not found!`);
      }

      return BonusLogs.countDocuments(filter).then(total => {
        return resultResponse(SUCCESS, { data: { metadata: { total, totalPages: Math.ceil(total / limit), currentPage: page }, data } });
      });

    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

module.exports = {
  getLogs
}