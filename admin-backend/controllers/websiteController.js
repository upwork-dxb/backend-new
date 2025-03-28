const _ = require('lodash')
  , bcrypt = require('bcrypt')
  , Joi = require('joi')
  , JoiObjectId = require('joi-oid')
  , { ObjectId } = require("bson")
  , Responder = require('../../lib/expressResponder')
  , WebsiteSetting = require('../../models/websiteSetting')
  , ThemeSetting = require('../../models/themeSetting')
  , TvAndScoreboardUrlSetting = require('../../models/tvAndScoreboardUrlSetting')
  , userService = require('../service/userService')
  , CONSTANTS = require('../../utils/constants')
  , User = require('../../models/user')
  , matchService = require('../../admin-backend/service/matchService')
  , websiteService = require('../service/websiteService')
  , { SUCCESS, USER_TYPE_SUPER_ADMIN } = require("../../utils/constants")
  , { ResSuccess, ResError } = require('../../lib/expressResponder')
  , BankingMethod = require('../../models/bankingMethod')
  , BankingType = require('../../models/bankingType')
  , Partnerships = require('../../models/partnerships')
  , UserSettingWiseSport = require('../../models/userSettingWiseSport');
const publisher = require("../../connections/redisConnections");
const { STATUS_500, STATUS_422 } = require('../../utils/httpStatusCode');
const batchSize = 1000; // Define your batch size here
module.exports = class WebsiteSettingController {

  // To create new website setting
  static createNewWebsite(req, res) {
    req.body.host_name = req.body.host_name.toLowerCase();
    req.body.site_title = req.body.site_title.toLowerCase();
    let websiteDetails = req.body;
    WebsiteSetting.findOne({ $or: [{ host_name: req.body.host_name }, { site_title: req.body.site_title }] })
      .then((websiteData) => {
        if (websiteData && websiteData != null && websiteData != '{}')
          return Responder.success(res, { msg: "Web site name or site title data already exists. " })
        WebsiteSetting.create(websiteDetails)
          .then((website) => {
            return Responder.success(res, { data: website, msg: "New website setting created successfully.", status: true })
          }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }
  // To create new website setting
  static async createThemeSetting(req, res) {
    const themeSettingSchema = Joi.object({
      domain: JoiObjectId.objectId(),
      login: Joi.object().required(),
      header: Joi.object().required(),
      subHeader: Joi.object().required(),
    });
    try {
      await themeSettingSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }
    try {
      let themeDetails = req.body;
      ThemeSetting.findOne({ domain: ObjectId(themeDetails.domain) })
        .then((themeData) => {
          if (themeData && themeData != null && themeData != '{}') {
            ThemeSetting.updateOne({ domain: ObjectId(themeDetails.domain) }, {
              login: themeDetails.login,
              header: themeDetails.header,
              subHeader: themeDetails.subHeader,
            }).then((themeData) => {
              return Responder.success(res, { data: themeData, msg: "Theme setting updated successfully.", status: true })
            }).catch((err) => Responder.error(res, err))
          } else {
            return ThemeSetting.create(themeDetails)
              .then((themeData) => {
                return Responder.success(res, { data: themeData, msg: "New theme setting created successfully.", status: true })
              }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
          }
        }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
    } catch (error) {
      return Responder.error(res, { msg: 'Error in api!', statusCode: STATUS_500 })
    }
  }

  // To get all website list
  static getWebsiteList(req, res) {
    WebsiteSetting.find()
      .then((websiteList) => {
        return Responder.success(res, { data: websiteList, msg: "website list." })
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  // To update any website record
  static updateWebsite(req, res) {
    req.body.host_name = req.body.host_name.toLowerCase();
    req.body.site_title = req.body.site_title.toLowerCase();
    User.findOne({ _id: req.body.userId })
      .then((user) => {
        if (user) {
          var passwordCheck = bcrypt.compareSync(req.body.password, user.password); // true
          if (!passwordCheck)
            return Responder.error(res, { msg: "Password did not match." })
          WebsiteSetting.findOneAndUpdate({ _id: req.params.id }, { $set: req.body })
            .then((updatedRecord) => {
              return Responder.success(res, { data: updatedRecord, msg: "Website record updated successfully." })
            }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
        }
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  // To update Casino Conversion Rate
  static async updateCasinoConversionRate(req, res) {
    const checkBody = Joi.object({
      domain_id: Joi.string().required(),
      casino_conversion_rate: Joi.number().required().min(1)
    });
    try {
      const body = req.body;
      const { domain_id, casino_conversion_rate } = body;

      const value = await checkBody.validateAsync(body, {
        abortEarly: true
      });

      const website = await WebsiteSetting.findOne({ _id: domain_id });
      if (!website) {
        return Responder.error(res, { statusCode: 400, message: 'No Domain found with this Domain Id !!' });
      }

      if (website.casino_conversion_rate != casino_conversion_rate) {
        website.casino_conversion_rate = casino_conversion_rate;
        await website.save();
      }
      const KEY = CONSTANTS.DOMAIN + website.domain_name + CONSTANTS.UNIQUE_IDENTIFIER_KEY;
      await publisher.set(KEY, JSON.stringify(website));

      return Responder.success(res, { msg: 'Website Update Successfully !!' });
    } catch (error) {
      return Responder.success(res, { error })
    }

  }

  // To remove website record = require(db
  static deleteWebsiteDomain(req, res) {
    const { user_type_id } = req.User || req.user; // Destructure logging user details
    if (user_type_id != USER_TYPE_SUPER_ADMIN)
      return Responder.error(res, { msg: "You are not permitted to do this action!" })
    User.findOne({ _id: req.body.userId })
      .then((user) => {
        if (user) {
          var passwordCheck = bcrypt.compareSync(req.body.password, user.password); // true
          if (!passwordCheck)
            return Responder.error(res, { msg: "Password did not match." })
          WebsiteSetting.deleteOne({ _id: req.params.id })
            .then((site) => {
              return Responder.success(res, { data: site, msg: "Website domain record deleted successfully." })
            }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
        }
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  // To check host_name already exist or not
  static async checkWebsiteName(req, res) {
    const checkHostNameSchema = Joi.object({
      host_name: Joi.string().required()
    });
    try {
      const value = await checkHostNameSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    WebsiteSetting.findOne({ host_name: req.body.host_name.toLowerCase() })
      .then((websiteData) => {
        if (websiteData && websiteData != null && websiteData != '{}') {
          return Responder.success(res, { msg: "Web site name is already exists. " })
        }
        else {
          return Responder.success(res, { msg: "Web site name is available. ", })
        }
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  // To check host_name already exist or not
  static async getThemeSettings(req, res) {
    const checkDomainSchema = Joi.object({
      domain: JoiObjectId.objectId().required()
    });
    try {
      const value = await checkDomainSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.error(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    return ThemeSetting.findOne({ domain: ObjectId(req.body.domain) })
      .then((websiteData) => {
        if (websiteData && websiteData != null && websiteData != '{}')
          return Responder.success(res, { data: websiteData, msg: "Theme settings found successfully. " });
        else
          return Responder.error(res, { msg: "Theme settings not available. " });
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  // To check site_title already exist or not
  static async checkSiteTitleData(req, res) {
    const checkSiteTitleSchema = Joi.object({
      site_title: Joi.string().required()
    });
    try {
      const value = await checkSiteTitleSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }

    WebsiteSetting.findOne({ site_title: req.body.site_title.toLowerCase() })
      .then((websiteData) => {
        if (websiteData && websiteData != null && websiteData != '{}')
          return Responder.success(res, { msg: "Site title data is already exists. " })
        else
          return Responder.success(res, { msg: "Site title data is available. ", })
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  // To search domain
  static async searchDomains(req, res) {
    const domainSchema = Joi.object({
      search: Joi.optional(),
      page: Joi.number().required(),
      limit: Joi.number().required()
    });
    try {
      await domainSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }
    try {
      const loggedInUserId = (req.User.user_id || req.User._id);
      let loggedInUserDetails = await userService.getUserByUserId({ _id: loggedInUserId }, { user_type_id: 1 });
      if (loggedInUserDetails.statusCode != CONSTANTS.SUCCESS)
        return Responder.success(res, { msg: `User not Found${loggedInUserDetails.statusCode == CONSTANTS.SERVER_ERROR ? ', ' + loggedInUserDetails.data : ''}` })
      loggedInUserDetails = loggedInUserDetails.data;
      if (loggedInUserDetails.user_type_id != CONSTANTS.USER_TYPE_SUPER_ADMIN)
        return Responder.success(res, { msg: 'Only super admin can search domains!' })

      var limit = req.body.limit;
      var page = (req.body.page != undefined) ? (req.body.page - 1) * limit : 0;
      var search = req.body.search;
      var queryArray = [];
      var mainQuery = {};
      var query = {};
      query.$or = [
        { 'host_name': { $regex: search, $options: 'i' } },
        { 'site_title': { $regex: search, $options: 'i' } }
      ]
      queryArray.push(query);
      mainQuery.$and = queryArray;
      WebsiteSetting.find(mainQuery).skip(page).limit(limit).lean()
        .then((searchUsersList) => {
          return Responder.success(res, { data: searchUsersList, msg: "Search domain list." })
        }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
    } catch (error) {
      return Responder.error(res, { msg: 'Error in api!', statusCode: STATUS_500 })
    }
  }

  // To update website tv url setting
  static async updateWebsiteTvUrlSetting(req, res) {
    const themeSettingSchema = Joi.object({
      is_tv_url_premium: Joi.number().valid(0, 1).required(),
      password: Joi.string().required(),
      domain_id: Joi.string().pattern(new RegExp(/^[0-9a-fA-F]{24}$/)).message("Domain must be a valid ObjectId").trim().required()
    });
    try {
      await themeSettingSchema.validateAsync(req.body, {
        abortEarly: true
      });
    } catch (error) {
      return Responder.success(res, { msg: error.details[0].message, statusCode: STATUS_422 })
    }
    User.findOne({ _id: req.User._id })
      .then((user) => {
        if (user) {
          var passwordCheck = bcrypt.compareSync(req.body.password, user.password); // true
          if (!passwordCheck)
            return Responder.success(res, { msg: "Password did not match." })
          WebsiteSetting.findOneAndUpdate({ _id: req.body.domain_id }, { $set: { is_tv_url_premium: req.body.is_tv_url_premium } })
            .then(async (updatedRecord) => {
              const isTvUrlPremium = req.body.is_tv_url_premium;
              delete req.body;
              req.body = {};
              req.body["user_id"] = req.User.user_id;
              req.body["user_type_id"] = req.User.user_type_id;
              req.body["parent_level_ids"] = req.User.parent_level_ids;
              req.body["sports_permission"] = req.User.sports_permission;
              let matchList = await matchService.homeMatches(req.body);
              if (matchList.statusCode === SUCCESS)
                // Iterate through matchList to update domains in Match collection
                for (const match of matchList.data) {
                  const matchId = match.match_id;
                  const domainToAddOrRemove = updatedRecord.domain_name; // Specify the domain here

                  await updateDomainsForTvAndScoreboardUrl(matchId, isTvUrlPremium, domainToAddOrRemove);
                }
              return Responder.success(res, { msg: "Website tv setting url updated successfully." })
            }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
        }
      }).catch((error) => Responder.error(res, { error, statusCode: STATUS_500 }))
  }

  static async updateDomainNewToOld(req, res) {
    try {
      console.info(`Received request to update domain from ${req.body.old_domain} to ${req.body.new_domain}`);

      const oldDomainData = await WebsiteSetting.findOne(
        { domain_name: req.body.old_domain },
        { host_name: 1, domain_name: 1, _id: 1 }
      );
      if (!oldDomainData) {
        console.error(`Old domain ${req.body.old_domain} not found`);
        return Responder.error(res, { msg: "Old domain not found" });
      }
      console.info(`Found old domain data: ${JSON.stringify(oldDomainData)}`);

      const newDomainData = await WebsiteSetting.findOne(
        { domain_name: req.body.new_domain },
        { host_name: 1, domain_name: 1, _id: 1 }
      );
      if (!newDomainData) {
        console.error(`New domain ${req.body.new_domain} not found`);
        return Responder.error(res, { msg: "New domain not found" });
      }
      console.info(`Found new domain data: ${JSON.stringify(newDomainData)}`);

      const collectionsToUpdate = [
        {
          model: BankingMethod,
          query: { domain_method_assign_list: oldDomainData._id },
          update: { $addToSet: { domain_method_assign_list: newDomainData._id } }
        },
        {
          model: BankingMethod,
          query: { domain_method_assign_list: oldDomainData._id },
          update: { $pull: { domain_method_assign_list: oldDomainData._id } }
        },
        {
          model: BankingType,
          query: { domain_type_assign_list: { $elemMatch: { $eq: oldDomainData.domain_name } } },
          update: { $addToSet: { domain_type_assign_list: newDomainData.domain_name } }
        },
        {
          model: BankingType,
          query: { domain_type_assign_list: { $elemMatch: { $eq: oldDomainData.domain_name } } },
          update: { $pull: { domain_type_assign_list: oldDomainData.domain_name } }
        },
        {
          model: Partnerships,
          query: { domain_name: oldDomainData.domain_name },
          update: { domain_name: newDomainData.domain_name }
        },
        {
          model: UserSettingWiseSport,
          query: { domain_name: oldDomainData.domain_name },
          update: { domain_name: newDomainData.domain_name }
        },
        {
          model: User,
          query: {
            domain_name: oldDomainData.domain_name,
            user_type_id: { $nin: [14, 15] }
          },
          update: {
            $set: {
              domain_name: newDomainData.domain_name,
              domain: newDomainData._id
            }
          }
        },
        {
          model: User,
          query: { domain_name: oldDomainData.domain_name, user_type_id: { $in: [14, 15] } },
          update: {
            $addToSet: {
              domain_assign_list: newDomainData._id,
              domain_assign_list_name: newDomainData.host_name
            }
          }
        },
        {
          model: User,
          query: { domain_name: oldDomainData.domain_name, user_type_id: { $in: [14, 15] } },
          update: {
            $set: {
              domain_name: newDomainData.domain_name,
              domain: newDomainData._id
            },
            $pull: {
              domain_assign_list: oldDomainData._id,
              domain_assign_list_name: oldDomainData.host_name
            }
          }
        }
      ];

      for (const { model, query, update } of collectionsToUpdate) {
        console.info(`1. Updating documents in ${model.collection.name} collection... ${JSON.stringify(query)}`);
        const cursor = model.find(query).batchSize(batchSize).cursor();
        const bulkOperations = [];
        let doc;
        for (doc = await cursor.next(); doc != null; doc = await cursor.next()) {
          console.info(`2. doc to update in ${model.collection.name} ${JSON.stringify(update)}`);
          bulkOperations.push({
            updateOne: {
              filter: { _id: doc._id },
              update: update
            }
          });

          if (bulkOperations.length === batchSize) {
            console.info(`3. Executing bulk update for ${bulkOperations.length} documents in ${model.collection.name} collection`);
            await model.bulkWrite(bulkOperations);
            bulkOperations.length = 0; // Reset the bulk operations array
          }
        }

        // Execute remaining bulk operations
        if (bulkOperations.length > 0) {
          console.info(`4. Executing bulk update for ${bulkOperations.length} documents in ${model.collection.name} collection`);
          await model.bulkWrite(bulkOperations);
        }
      }
      console.info(`Domain update from ${req.body.old_domain} to ${req.body.new_domain} completed successfully`);
      return Responder.success(res, { msg: "Domain updated successfully." });
    } catch (error) {
      console.error(`Error updating domain from ${req.body.old_domain} to ${req.body.new_domain}: ${error}`);
      return Responder.error(res, { error, statusCode: STATUS_500 });
    }
  }

  static async getDomainWiseCounts(req, res) {
    try {
      console.info(`Received request to get domain data count ${req.body.domain_name}`);
      // Get the list of all domains
      const domain = await WebsiteSetting.findOne({ domain_name: req.body.domain_name }, { domain_name: 1, _id: 1 });

      if (!domain) {
        console.error(`Domain ${req.body.domain_name} not found`);
        return Responder.error(res, { msg: "Domain not found" });
      }

      let domainCounts = [];

      const bankingMethodDataCount = await BankingMethod.countDocuments({ domain_method_assign_list: domain._id });
      domainCounts.push({ collection: 'BankingMethod', count: bankingMethodDataCount });
      const bankingTypeDataCount = await BankingType.countDocuments({ domain_type_assign_list: domain.domain_name });
      domainCounts.push({ collection: 'BankingType', count: bankingTypeDataCount });
      const partnershipsDataCount = await Partnerships.countDocuments({ domain_name: domain.domain_name });
      domainCounts.push({ collection: 'Partnerships', count: partnershipsDataCount });
      const userSettingWiseSportDataCount = await UserSettingWiseSport.countDocuments({ domain_name: domain.domain_name });
      domainCounts.push({ collection: 'UserSettingWiseSport', count: userSettingWiseSportDataCount });
      const userDataCount = await User.countDocuments({ domain_name: domain.domain_name });
      domainCounts.push({ collection: 'User', count: userDataCount });

      console.info(`Domain-wise document counts: ${JSON.stringify(domainCounts)}`);
      return Responder.success(res, { data: domainCounts });
    } catch (error) {
      console.error(`Error getting domain-wise counts: ${error}`);
      return Responder.error(res, { error, statusCode: STATUS_500 });
    }
  }

  static async getCasinoConversionRate(req, res) {
    try {
      const domain_name = req?.User?.domain_name;

      const KEY = CONSTANTS.DOMAIN + domain_name + CONSTANTS.UNIQUE_IDENTIFIER_KEY;

      const result = await publisher.get(KEY);
      if (result) {
        return Responder.success(res, { data: JSON.parse(result), msg: "Conversion Rate info !!" });
      } else {
        const website = await WebsiteSetting.findOne({ domain_name }).lean();
        if (!website) {
          return Responder.error(res, { msg: "Domain not found !!." });
        }

        await publisher.set(KEY, JSON.stringify(website));
        return Responder.success(res, { data: website, msg: "Conversion Rate info !" });
      }

    } catch (error) {
      return Responder.error(res, { msg: error.message, statusCode: STATUS_500 })
    }
  }

  static verifyDomainIsExists(req, res, next) {
    return websiteService.verifyDomainIsExists(req, res, next)
  }

  static assignField(req, res, next) {
    return websiteService.assignField(req, res, next)
  }

  static allowUnmatchedBet(req, res) {
    return websiteService.updateUnmatchedBetsSetting(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static updateBonusAllowed(req, res) {
    return websiteService.updateBonusAllowed(req, res)
      .then(result => (result.statusCode == SUCCESS)
        ? ResSuccess(res, result.data)
        : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static updateBonusData(req, res) {
    return websiteService.updateBonusData(req, res)
      .then(result => (result.statusCode == SUCCESS)
        ? ResSuccess(res, result.data)
        : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { error, statusCode: STATUS_500 }));
  }

  static allowDiamondRateLimit(req, res) {
    return websiteService
      .updateDiamondRateLimitSetting(req, res)
      .then((result) =>
        result.statusCode == SUCCESS
          ? ResSuccess(res, result.data)
          : ResError(res, { msg: result.data })
      )
      .catch((error) => ResError(res, error));
  }

}

async function updateDomainsForTvAndScoreboardUrl(matchId, isTvUrlPremium, domainToAddOrRemove) {
  try {
    const TvAndScoreboardUrlSettingData = await TvAndScoreboardUrlSetting.findOne({ match_id: matchId });
    if (TvAndScoreboardUrlSettingData) {
      let domains = TvAndScoreboardUrlSettingData.domains || [];
      if (isTvUrlPremium == 1) {
        if (!domains.includes(domainToAddOrRemove)) {
          domains.push(domainToAddOrRemove);
        }
      } else {
        domains = domains.filter(domain => domain !== domainToAddOrRemove);
      }
      TvAndScoreboardUrlSettingData.domains = domains;
      await TvAndScoreboardUrlSettingData.save();
    }
  } catch (error) {
    throw error;
  }
}