const Joi = require('joi')
  , psl = require('psl')
  , Content = require("../../models/content")
  , ThemeSetting = require("../../models/themeSetting")
  , WebsiteSetting = require("../../models/websiteSetting")
  , User = require("../../models/user")
  , contentService = require('../service/contentService')
  , cloudUploadService = require('../service/cloudUploadService')
  , { SocSuccess } = require('../../lib/socketResponder')
  , { SUCCESS, USER_TYPE_SUPER_ADMIN, SERVER_ERROR, NOT_FOUND, USER_TYPE_WHITE_LABLE } = require('../../utils/constants')
  , { STATUS_400, STATUS_401, STATUS_403, STATUS_404, STATUS_422, STATUS_500, STATUS_200 } = require('../../utils/httpStatusCode')
  , { ResSuccess, ResError } = require('../../lib/expressResponder')
  , { getDomainName, removeStaticContent } = require('../../utils');

const Constants = require('../../utils/constants');

module.exports = {
  createValidate: function (req, res, next) {
    if (Object.keys(req.query).length)
      req.body = req.query;
    return Joi.object({
      title: Joi.string().min(3).message("Title min length is 3")
        .max(80).message("Title max length is 80")
        .pattern(new RegExp(/^[A-Za-z0-9-_. ]+$/)).message("Title should be in valid format. [A-Z a-z 0-9 -_. are allowed]")
        .trim().required(),
      slug: Joi.string().min(3).message("slug min length is 3")
        .max(80).message("slug max length is 80")
        .pattern(new RegExp(/^[A-Za-z0-9-_.]+$/)).message("slug should be in valid format. [A-Z a-z 0-9-_. are allowed]")
        .lowercase().trim().required(),
      description: Joi.string().allow("").optional().trim(),
      category: Joi.optional(),
      self_host: Joi.boolean().default(true),
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, error);
      });
  },
  validateFile: function (req, res, next) {
    if (["/upload/logoAndBackground"].includes(req.path))
      if (!req.files.logo && !req.file.background)
        throw new Error("Image file not found!");
    if (["/upload/slider", "/upload/logo"].includes(req.path))
      if (!req.file)
        throw new Error("Image file not found!");
    if (req.path == "/upload/mobile-app") {
      if (!req.file)
        throw new Error("Application file not found!");
      if (!req.file.filename.match(/\.(apk|ipa)$/i))
        throw new Error("Upload valid app file!");
    }
    next();
  },
  socialHandler: function (req, res, next) {
    req.body.category = 'white_label_social_handler'
    next();
  },
  validateContentFile: function (req, res, next) {
    if (req.body.content_type == "Slider" || req.body.content_type == "Logo" || req.body.content_type == "Popup") {
      if (!req.file) {
        throw new Error("Image file not found!");
      }
      else if (req.body.content_type == "Popup") {
        req.body.content = "popups/" + req.file.filename;
      }
      else {
        req.body.content = "sliders/" + req.file.filename;
      }
    }
    next();
  },
  uploadContentValidate: function (req, res, next) {
    return Joi.object({
      title: Joi.string().min(3).message("Title min length is 3")
        .max(80).message("Title max length is 80")
        .pattern(new RegExp(/^[A-Za-z0-9-_. ]+$/)).message("Title should be in valid format. [A-Z a-z 0-9 -_. are allowed]")
        .trim().required(),
      content: Joi.string().allow("").optional().trim(),
      website: Joi.string().allow("").optional().trim(),
      content_type: Joi.string().required().trim()
    }).validateAsync(req.body, { abortEarly: false })
      .then(() => {
        next();
      }).catch(error => {
        return ResError(res, error);
      });
  },
  create: async function (req, res, next) {
    const data = req.body;
    let content;
    let allowedPath = ["/upload/slider", "/upload/logo", "/upload/backgroundImage", "/upload/mobile-app"].includes(req.path);

    if (allowedPath && (req.User.user_type_id == USER_TYPE_SUPER_ADMIN || req.User.user_type_id == USER_TYPE_WHITE_LABLE)) {

      if (req.User.user_type_id == USER_TYPE_WHITE_LABLE) {
        const userDomain = req.User.domain_name;

        if (!data?.slug.includes(userDomain)) {
          return ResError(res, { msg: "Slug value is not Valid !" });
        }
      }

      content = await contentService.findStaticContent(data.slug);
      return Content.findOneAndUpdate(
        { slug: data.slug },
        data,
        { upsert: true, new: true, runValidators: true },
      ).lean()
        .select("_id")
        .then(() => {
          if (allowedPath) {
            try {
              if (content.statusCode == SUCCESS) {
                /**
               * Here, we are removing the uploaded content in case any cloud upload services are enabled.
               * Reason: By default, the multer package saves the uploaded content into the system's local storage and does not remove it automatically. 
               * Therefore, it needs to be removed manually.
               */
                removeStaticContent(content.data.path);
                if (cloudUploadService.isEnabled())
                  cloudUploadService.removeImageFromCloud(content.data).then().catch(next(error));
              }
            } catch (error) { }
          }
          let resMsg = `${data.title} content updated successfully...`
          req.IO.emit(`${(data.category).toUpperCase()}`, SocSuccess({ msg: resMsg, data: data }));
          return ResSuccess(res, { msg: resMsg });
        }).catch(error => next(error));
    } else {
      return ResError(res, { msg: "You are not permitted to do this action!" });
    }
  },
  createLogoAndBackground: async function (req, res) {
    try {
      const data = req.query;
      data.category = "white_label_logos";
      const files = req.files;
      let allContents;
      let allowedPath = ["/upload/logoAndBackground"].includes(req.path);
      if (allowedPath)
        allContents = await contentService.findManyStaticContent(data);
      let deletable = [];
      try {
        if (files.logo.length) {
          await Content.findOneAndUpdate(
            { slug: data.slug },
            {
              category: "white_label_logos",
              description: "logos/" + files.logo[0].filename,
              title: data.title
            },
            { upsert: true, new: true, runValidators: true },
          ).lean()
            .select("_id");
          deletable.push(data.slug);
        }
        if (files.background.length) {
          await Content.findOneAndUpdate(
            { slug: `bg_${data.slug}` },
            {
              category: "white_label_logos",
              description: "logos/" + files.background[0].filename,
              title: data.title
            },
            { upsert: true, new: true, runValidators: true },
          ).lean()
            .select("_id")
          deletable.push(`bg_${data.slug}`);
        }
        if (files.blockBackground.length) {
          await Content.findOneAndUpdate(
            { slug: `blockBg_${data.slug}` },
            {
              category: "white_label_logos",
              description: "logos/" + files.blockBackground[0].filename,
              title: data.title
            },
            { upsert: true, new: true, runValidators: true },
          ).lean()
            .select("_id")
          deletable.push(`blockBg_${data.slug}`);
        }
        if (allContents.statusCode == SUCCESS)
          for (const content of allContents.data)
            if (deletable.includes(content.slug))
              removeStaticContent(content.description);
        return ResSuccess(res, { msg: `${data.title} content updated successfully...` });
      } catch (error) { return ResError(res, { error, statusCode: STATUS_500 }) }
    }
    catch (error) {
      return ResError(res, error);
    }
  },
  footer: function (req, res) {
    req.body.filter = "footer";
    req.body.columns = "title slug";
    return contents(req, res);
  },
  sliders: function (req, res) {
    if (req.path == "/sliders-manage" && req.User.user_type_id != USER_TYPE_SUPER_ADMIN && req.User.user_type_id != USER_TYPE_WHITE_LABLE)
      return ResError(res, { msg: "You are not permitted to do this action!" });
    req.body.filter = "slider";
    if (req.User)
      if (req.User.user_type_id == USER_TYPE_SUPER_ADMIN)
        req.body.filter = /slider/;
    req.body.columns = "description title slug category self_host";
    return contents(req, res);
  },
  getbackgroundImage: function (req, res, next) {
    req.body.filter = "bg_images";
    req.body.columns = "-_id description title";
    return contents(req, res);
  },
  slider: function (req, res, next) {
    req.body.description = "sliders/" + req.file.filename;
    if (req.body.category == "1")
      req.body.category = "slider-wl";
    else
      req.body.category = "slider";
    next();
  },
  bgImage: function (req, res, next) {
    req.body = req.query;
    req.body.description = "bg_images/" + req.file.filename;
    if (req.body.category)
      req.body.category = "bg_images-" + req.body.category;
    else
      req.body.category = "bg_images";
    next();
  },
  logo: function (req, res, next) {
    req.body = req.query;
    req.body.description = "logos/" + req.file.filename;
    req.body.category = "white_label_logos";
    next();
  },
  mobileApp: function (req, res, next) {
    req.body = req.query;
    req.body.description = "apps/" + req.file.filename;
    req.body.category = "white_label_apps";
    next();
  },
  cloudService: async function (req, res, next) {
    try {
      let uploadStatus = await cloudUploadService.uploadToCloud(req);
      if (uploadStatus.statusCode == SERVER_ERROR)
        throw new Error(uploadStatus.data);
      if (uploadStatus.statusCode == SUCCESS) {
        uploadStatus = uploadStatus.data;
        req.body.self_host = false;
        req.body.content = uploadStatus.access_url;
        req.body.description = uploadStatus.access_url;
        req.body.content_meta = { filename: uploadStatus.filename, identifier: uploadStatus.identifier };
      }
      else if (uploadStatus.statusCode == NOT_FOUND)
        req.body.self_host = true;
    } catch (error) { next(error); }
    next();
  },
  errorHandler: function (error, req, res, next) {
    if (error) {
      if (req.file)
        removeStaticContent(req.file.path);
      return ResError(res, { error, statusCode: STATUS_500 });
    }
  },
  download: async function (req, res, next) {
    return contentService.getDownloadContent(req.body)
      .then(content => {
        if (content.statusCode != SUCCESS)
          return ResError(res, { msg: content.data });
        res.download(content.data.filepath, content.data.filename);
      }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  get: function (req, res, next) {
    if (req.path == "/download-mobile-app")
      req.body = req.query;
    return Joi.object({
      key: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ key }) => {
        req.body.slug = Buffer.from(key, 'base64').toString('ascii');
        delete req.body.key;
        next();
      }).catch(error => {
        return ResError(res, { msg: error.message, statusCode: STATUS_500 });
      });
  },
  // To check host_name already exist or not
  getThemeSettings: async function (req, res) {
    const { slug } = req.body;
    const websiteSetting = await WebsiteSetting.findOne({ domain_name: slug });
    if (websiteSetting && websiteSetting != null && websiteSetting != '{}') {
      return ThemeSetting.findOne({ domain: websiteSetting._id })
        .then(websiteData => {
          if (websiteData && websiteData != null && websiteData != '{}')
            return ResSuccess(res, { data: websiteData, msg: "Theme settings get successfully..." });
          else
            return ResError(res, { msg: "Theme settings not available!", statusCode: STATUS_200 });
        }).catch((error) => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
    }
  },
  getContent: function (req, res) {
    return Joi.object({
      slug: Joi.string().required(),
      category: Joi.optional(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(async data => {
        let Filter = { slug: data.slug };
        if (data.hasOwnProperty('category'))
          Filter['category'] = data.category
        if (req?.User) {
          const userData = await User.findOne({ _id: req.User.parent_id, allow_social_media_dealer: true }).select("allow_social_media_dealer").lean();
          if (userData && userData?.allow_social_media_dealer) {
            Filter.slug = `${req.User.domain_name}-${req.User.parent_user_name}-social`;
          }
        }
        return Content.findOne(Filter).select("-_id description self_host").lean()
          .then(data => data ? ResSuccess(res, { data }) : ResError(res, { msg: "No logo found!", statusCode: STATUS_200 })).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  getLogo: function (req, res) {
    return contentService.getLogo(req, res)
      .then(result => (result.statusCode == SUCCESS) ? ResSuccess(res, result.data) : ResError(res, { msg: result.data }))
      .catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
  },
  getLogoAndBackground: function (req, res) {
    return Joi.object({
      slug: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(data => {
        let Filter = { category: "white_label_logos" };
        Filter.slug = { $in: [data.slug, `bg_${data.slug}`, `blockBg_${data.slug}`] }
        return Content.find(Filter).select("-_id slug description").lean()
          .then(data => {
            let resData = {};
            for (const content of data) {
              if (content.slug.includes("bg_"))
                resData.background = content.description;
              else if (content.slug.includes("blockBg_"))
                resData.blockBackground = content.description;
              else
                resData.logo = content.description;
            }
            ResSuccess(res, { data: resData })
          }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  delete: function (req, res) {
    return Joi.object({
      slug: Joi.string().required(),
    }).validateAsync(req.body, { abortEarly: false })
      .then(({ slug }) => {
        return contentService.deleteContent(slug).then(content => {
          if (content.statusCode != SUCCESS)
            return ResError(res, { msg: content.data });
          return ResSuccess(res, { msg: content.data });
        }).catch(error => ResError(res, { error, statusCode: STATUS_500 }));
      }).catch(error => {
        return ResError(res, error);
      });
  },
  getContentType: function (req, res) {
    try {
      return ResSuccess(res, { data: Constants.CONTENT_TYPE });
    }
    catch (error) { return ResError(res, { error, statusCode: STATUS_500 }); }
  },
  uploadContent: async function (req, res) {
    const data = req.body;
    let filter = { content_type: data.content_type, title: data.title };
    if (data.website) {
      filter.website = data.website;
    }
    if ((req.User.user_type_id == USER_TYPE_SUPER_ADMIN || req.User.user_type_id == USER_TYPE_WHITE_LABLE)) {

      if (req.User.user_type_id == USER_TYPE_WHITE_LABLE) {
        const userDomain = req.User.domain_name;

        if (!data?.slug.includes(userDomain)) {
          return ResError(res, { msg: "Slug value is not Valid !" });
        }
      }

      let content = await contentService.findContent(filter);
      return Content.findOneAndUpdate(filter, data, { upsert: true, new: true, runValidators: true }).lean()
        .select("_id")
        .then(() => {
          try {
            if (content.statusCode == SUCCESS) {
              /**
               * Here, we are removing the uploaded content in case any cloud upload services are enabled.
               * Reason: By default, the multer package saves the uploaded content into the system's local storage and does not remove it automatically. 
               * Therefore, it needs to be removed manually.
               */
              removeStaticContent(content.data.path);
              if (cloudUploadService.isEnabled())
                cloudUploadService.removeImageFromCloud(content.data).then().catch(error => ResError(res, { error }));
            }
          } catch (error) { }
          let resMsg = `${data.title} content updated successfully...`
          return ResSuccess(res, { msg: resMsg });
        }).catch(error => { console.log(error) });
    } else {
      return ResError(res, { msg: "You are not permitted to do this action!" });
    }
  },
  contentGet: async function (req, res) {
    if (!req.query.content_type) {
      return ResError(res, { msg: "Content type is required.", statusCode: STATUS_422 });
    }
    const contentType = req.query.content_type;
    let filter = { content_type: contentType }
    let host = req.query.host;//req.get('host');
    try {
      switch (contentType) {
        case 'Slider':
          if (req?.User?.user_type_id != USER_TYPE_SUPER_ADMIN) {
            filter.website = host;
          }
          const sliders = await Content.find(filter).lean();
          if (sliders.length) {
            return ResSuccess(res, { data: sliders });
          }
          else {
            filter.website = '';
            const sliders = await Content.find(filter).lean();
            return ResSuccess(res, { data: sliders });
          }
          break;
        case 'Logo':
          filter.website = host;
          const logo = await Content.findOne(filter).lean();
          if (logo) {
            return ResSuccess(res, { data: logo });
          }
          else {
            return ResError(res, { msg: "Logo not found." });
          }
          break;
        case 'Popup':
          filter.website = host;
          filter.is_active = true;
          const popup = await Content.findOne(filter).lean();
          if (popup) {
            return ResSuccess(res, { data: popup });
          }
          else {
            filter.slug = 'default-popup';
            delete filter.website;
            const popup = await Content.findOne(filter).lean();
            if (popup)
              return ResSuccess(res, { data: popup });
            return ResError(res, { msg: "No image found." });
          }
          break;
        case 'Privacy Policy':
          const privacyPolicy = await Content.findOne(filter).lean();
          if (privacyPolicy) {
            return ResSuccess(res, { data: privacyPolicy });
          }
          else {
            return ResError(res, { msg: "No content found." });
          }
          break;
        case 'Kyc':
          const kyc = await Content.findOne(filter).lean();
          if (kyc) {
            return ResSuccess(res, { data: kyc });
          }
          else {
            return ResError(res, { msg: "No content found." });
          }
          break;
        case 'Terms and Conditions':
          const termsAndConditions = await Content.findOne(filter).lean();
          if (termsAndConditions) {
            return ResSuccess(res, { data: termsAndConditions });
          }
          else {
            return ResError(res, { msg: "No content found." });
          }
          break;
        case 'Rules and Regulations':
          const rulesAndRegulations = await Content.findOne(filter).lean();
          if (rulesAndRegulations) {
            return ResSuccess(res, { data: rulesAndRegulations });
          }
          else {
            return ResError(res, { msg: "No content found." });
          }
          break;
        case 'Responsible Gambling':
          const responsibleGambling = await Content.findOne(filter).lean();
          if (responsibleGambling) {
            return ResSuccess(res, { data: responsibleGambling });
          }
          else {
            return ResError(res, { msg: "No content found." });
          }
          break;
        default:
          return ResError(res, { msg: "No content found." });
          break;
      }
    } catch (error) {
      error => ResError(res, { msg: error.message, statusCode: STATUS_500 })
    }
  },
  createSocialHandler: async function (req, res, next) {
    const data = req.body;
    let filter = { slug: data.slug }
    if (req.User.user_type_id == Constants.USER_TYPE_DEALER) {
      let slug = `${req.User.domain_name}-${req.User.user_name}-social`;
      filter.slug = slug;
      data.slug = slug;
    }
    // Fetch existing content from the database
    let existingContent = await Content.findOne(filter).lean();
    // Merge incoming data with existing data
    if (existingContent && existingContent.description) {
      let existingDescription = JSON.parse(existingContent.description);
      let newDescription = JSON.parse(data.description);
      // Merge new description with existing description
      let updatedDescription = { ...existingDescription, ...newDescription };
      // Update the description in the data object
      data.description = JSON.stringify(updatedDescription);
    }
    // Perform the update or insert operation
    return Content.findOneAndUpdate(
      filter,
      data,
      { upsert: true, new: true, runValidators: true },
    ).lean()
      .select("_id")
      .then(() => {
        let resMsg = `${data.title} content updated successfully...`;
        return ResSuccess(res, { msg: resMsg });
      }).catch(error => next(error));
  },
  uploadPopupContent: async function (req, res) {
    const data = req.body;
    let filter = { content_type: data.content_type };
    if (data.website) {
      filter.website = data.website;
      data.slug = `${data.website}-popup`;
    } else {
      let defaultSlug = "default-popup";
      data.slug = defaultSlug;
      filter.slug = defaultSlug;
    }

    if (data?.content_for == 'mobile') {
      data.content_mobile = data.content;
      delete data.content;
    }

    if ((req.User.user_type_id == USER_TYPE_SUPER_ADMIN || req.User.user_type_id == USER_TYPE_WHITE_LABLE)) {
      if (req.User.user_type_id == USER_TYPE_WHITE_LABLE) {
        const userDomain = req.User.domain_name;

        if (data.website && !data?.slug.includes(userDomain)) {
          return ResError(res, { msg: "Slug value is not Valid !" });
        }
      }
      let content = await contentService.findContent(filter);
      return Content.findOneAndUpdate(filter, data, { upsert: true, new: true, runValidators: true }).lean()
        .select("_id")
        .then(() => {
          try {

            if (content.statusCode == SUCCESS) {

              /**
               * Here, we are removing the uploaded content in case any cloud upload services are enabled.
               * Reason: By default, the multer package saves the uploaded content into the system's local storage and does not remove it automatically. 
               * Therefore, it needs to be removed manually.
               */
              const removeOldContentPath =
                (data?.content_for == 'mobile')
                  ? content.data.UPLOAD_PATH + content.data.content_mobile
                  : content.data.path;

              removeStaticContent(removeOldContentPath);

              if (cloudUploadService.isEnabled()) {
                cloudUploadService.removeImageFromCloud(content.data).then().catch(error => ResError(res, { error }));
              }

            }

          } catch (error) { }
          let resMsg = `${data.content_type} content updated successfully...`
          return ResSuccess(res, { msg: resMsg });
        }).catch(error => { console.log(1, error) });
    } else {
      return ResError(res, { msg: "You are not permitted to do this action!" });
    }
  }
}

function contents(req, res) {
  return contentService.getContent(req.body.filter, req.body.columns)
    .then(async content => {
      if (content.statusCode != SUCCESS)
        return ResError(res, { msg: content.data, statusCode: 200 });
      if (req.body.filter == "slider") {
        try {
          let host = "-" + req.get('host');
          if (req?.User?.user_type_id)
            host = psl.parse(req.get('host')).domain;
          let sliders = await Content
            .find({ slug: new RegExp(host + "-wl$") })
            .select(req.body.columns);
          if (sliders.length)
            return ResSuccess(res, { data: sliders });
          else
            return ResSuccess(res, { data: [] });
        } catch (error) {
          return ResError(res, { msg: error.message, statusCode: STATUS_500 });
        }
      }
      if (req.body.filter == "bg_images") {
        try {
          let backgroundImage = await Content
            .find({ category: req.body.filter + "-" + getDomainName(req.get('host')) })
            .select(req.body.columns);
          if (backgroundImage.length)
            return ResSuccess(res, { data: backgroundImage[0] });
        } catch (error) {
          return ResError(res, { msg: error.message, statusCode: STATUS_500 });
        }
        return ResSuccess(res, { data: content.data[0] });
      }
      return ResSuccess(res, { data: content.data });
    }).catch(error => ResError(res, { msg: error.message, statusCode: STATUS_500 }));
}