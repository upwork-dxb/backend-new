const { ObjectId } = require("bson")
  , WebsiteSetting = require('../../models/websiteSetting')
  , publisher = require("../../connections/redisConnections")
  , { resultResponse } = require('../../utils/globalFunction')
  , {
    SUCCESS, NOT_FOUND, SERVER_ERROR, VALIDATION_ERROR,
    DOMAIN, UNIQUE_IDENTIFIER_KEY, USER_TYPE_SUPER_ADMIN,
    EVERY_DEPOSIT, FIRST_DEPOSIT,
  } = require('../../utils/constants');
const BonusLogs = require("../../models/bonusLogs");

async function saveWebsiteDateToCache(KEY, website) {
  await publisher.set(KEY, JSON.stringify(website));
}

const getKEY = (WebsiteSetting) => DOMAIN + WebsiteSetting.domain_name + UNIQUE_IDENTIFIER_KEY;

async function getWebsiteSettingsFromCache(params) {

  try {

    const { domain_name } = params;

    const KEY = getKEY({ domain_name });

    let website = await publisher.get(KEY);

    if (website) {
      website = JSON.parse(website);
    } else {

      website = await WebsiteSetting.findOne({ domain_name }).select("-createdAt").lean();

      if (!website) {
        return resultResponse(NOT_FOUND, "Website settings not found!");
      }

      await publisher.set(KEY, JSON.stringify(website));

      return website;

    }

    return resultResponse(SUCCESS, website);

  } catch (error) {
    return resultResponse(SERVER_ERROR, error.message);
  }

}

function verifyDomainIsExists(req, res, next) {

  const { domain_id, domain_name } = req.body;

  hasDomainAccess(req);

  let filter = {};

  if (domain_id) {
    filter["_id"] = ObjectId(domain_id);
  }

  if (domain_name) {
    filter["domain_name"] = domain_name;
  }

  if (!Object.keys(filter).length)
    next(new Error("Filter value is required!"));

  return WebsiteSetting.findOne(filter)
    .then(website => {

      if (!website) {
        next(new Error("Domain not found, please check or try again!"));
      }

      req.WebsiteSetting = website;

      next();

    });

}

function hasDomainAccess(req) {

  if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {

    const { domain_id } = req.body;

    if (domain_id) {
      if (req.User.domain.toString() != domain_id.toString()) {
        throw new Error("Invalid domain id access!");
      }
    }
  }

}

function assignField(req, res, next) {
  if (req.User.user_type_id != USER_TYPE_SUPER_ADMIN) {
    req.body.domain_id = req.User.domain;
  }
  next();
}

async function updateUnmatchedBetsSetting(req) {

  const { WebsiteSetting } = req;

  WebsiteSetting.unmatch_bet_allowed = !WebsiteSetting.unmatch_bet_allowed;

  await WebsiteSetting.save();

  await saveWebsiteDateToCache(getKEY(WebsiteSetting), WebsiteSetting);

  return resultResponse(SUCCESS, {
    msg: `Unmatched bets on the domain ${WebsiteSetting.domain_name} have been successfully ${WebsiteSetting.unmatch_bet_allowed ? "enabled" : "disabled"}.`,
    unmatch_bet_allowed: WebsiteSetting.unmatch_bet_allowed
  });

}

function getDefaultBonusData() {
  return [
    {
      name: "First Deposit",
      bonus_type: FIRST_DEPOSIT,
      display_text: "0%",
      percentage: 0,
      is_active: false,
    },
    {
      name: "Every Deposit",
      bonus_type: EVERY_DEPOSIT,
      display_text: "0%",
      percentage: 0,
      is_active: false,
    },
  ];
}

async function updateBonusAllowed(req) {

  const { WebsiteSetting } = req;

  WebsiteSetting.bonus_allowed = !WebsiteSetting.bonus_allowed;

  // Set Default Bonus Data if bonus is allowed and bonus_data is not set already.
  if (WebsiteSetting.bonus_allowed && !WebsiteSetting.bonus_data?.length) {
    WebsiteSetting.bonus_data = getDefaultBonusData();
  }

  await WebsiteSetting.save();

  await saveWebsiteDateToCache(getKEY(WebsiteSetting), WebsiteSetting);

  return resultResponse(SUCCESS, {
    msg: `Deposit Bonus on the domain ${WebsiteSetting.domain_name} have been successfully ${WebsiteSetting.bonus_allowed ? "enabled" : "disabled"}.`,
    bonus_allowed: WebsiteSetting.bonus_allowed
  });

}

async function updateBonusData(req) {

  const { WebsiteSetting } = req;
  const { bonus_data } = req.joiData;

  // Get User Data
  const { _id: user_id, user_name, user_type_id } = req.User;

  // Check if Bonus is Enabled
  if (!WebsiteSetting.bonus_allowed) {
    return resultResponse(VALIDATION_ERROR, "First Enable the Bonus!");
  }

  const bonus_logs = [];
  let is_bonus_data_modified = false;

  // Field To Check for Change
  const fields_to_check_for_change = ['display_text', 'percentage', 'is_active',];

  // Iterate through bonus data
  for (const bonus_item of bonus_data) {
    if (!bonus_item.display_text) bonus_item.display_text = `${bonus_item.percentage}%`
    const { name, bonus_type } = bonus_item;


    // Check if Bonus Item already exists
    const bonus_item_db_index = WebsiteSetting.bonus_data.findIndex(i => (i.name == name && i.bonus_type == bonus_type));

    // Set is_item_exists depending on index value
    const is_item_exists = Boolean(bonus_item_db_index != -1);

    // If Bonus Item already exists
    if (is_item_exists) {
      // If any field value is changed, then update it and create a bonus log

      const bonus_item_db = WebsiteSetting.bonus_data[bonus_item_db_index];
      let is_updated = false;

      for (const field of fields_to_check_for_change) {
        // If field value is changed, then update it and create a bonus log
        if (bonus_item_db[field] !== bonus_item[field]) {
          // Create Bonus Log
          const bonus_log = {
            domain_id: WebsiteSetting._id,
            domain_name: WebsiteSetting.domain_name,
            user_id,
            user_type_id,
            user_name,
            name,
            bonus_type,
            new_value: bonus_item[field],
            old_value: bonus_item_db[field],
            updated_field: field,
          };

          // Push Bonus Log to save to database
          bonus_logs.push(bonus_log);

          bonus_item_db[field] = bonus_item[field];
          is_updated = true;
        }
      }

      if (is_updated) {
        WebsiteSetting.bonus_data[bonus_item_db_index] = bonus_item_db;
        is_bonus_data_modified = true;
      }

    } else {

      for (const field of fields_to_check_for_change) {

        // Create Bonus Log
        const bonus_log = {
          domain_id: WebsiteSetting._id,
          domain_name: WebsiteSetting.domain_name,
          user_id,
          user_type_id,
          user_name,
          name,
          bonus_type,
          new_value: bonus_item[field],
          old_value: "NA",
          updated_field: field,
        };

        // Push Bonus Log to save to database
        bonus_logs.push(bonus_log);

      }

      // Add Bonus Item to bonus_data array
      WebsiteSetting.bonus_data.push(bonus_item);
      is_bonus_data_modified = true;

    }

  }

  if (is_bonus_data_modified) {
    await WebsiteSetting.save();
    await saveWebsiteDateToCache(getKEY(WebsiteSetting), WebsiteSetting);
  }

  if (bonus_logs.length) {
    // Save Bonus Logs to Database
    await BonusLogs.insertMany(bonus_logs);
  }

  return resultResponse(SUCCESS, {
    msg: `Bonus Data saved successfully`,
    WebsiteSetting,
  });

}

async function updateDiamondRateLimitSetting(req) {
  const { WebsiteSetting } = req;

  WebsiteSetting.diamond_rate_limit_enabled =
    !WebsiteSetting.diamond_rate_limit_enabled;

  await WebsiteSetting.save();
  await saveWebsiteDateToCache(getKEY(WebsiteSetting), WebsiteSetting);

  return resultResponse(SUCCESS, {
    msg: `Diamond rate limit on the domain ${
      WebsiteSetting.domain_name
    } have been successfully ${
      WebsiteSetting.diamond_rate_limit_enabled ? "enabled" : "disabled"
    }.`,
    diamond_rate_limit_enabled: WebsiteSetting.diamond_rate_limit_enabled,
  });
}

module.exports = {
  getWebsiteSettingsFromCache,
  verifyDomainIsExists,
  updateUnmatchedBetsSetting,
  updateBonusAllowed,
  updateBonusData,
  assignField,
  updateDiamondRateLimitSetting
}