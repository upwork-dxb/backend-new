const multer = require("multer")
const path = require('path');
const moment = require('moment')
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const UPLOAD_PATH = path.normalize(path.resolve(__dirname, "../../uploads"));
const Content = require("../../models/content");
const publisher = require("../../connections/redisConnections")
const { SUCCESS, NOT_FOUND, SERVER_ERROR, LOGO, UNIQUE_IDENTIFIER_KEY } = require('../../utils/constants');
const { removeStaticContent, getTimeTaken, generateReferCode } = require('../../utils');
const { resultResponse } = require('../../utils/globalFunction');
const logger = require("../../utils/loggers");

function storage(storagePath) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const url = UPLOAD_PATH + "/" + storagePath;
      cb(null, url);
    },
    filename(req, file, cb) {
      cb(null, storagePath + "-" + uuidv4() + path.extname(file.originalname));
    }
  });
  return multer({ storage });
}

function getContent(category, columns) {
  let select = "-_id " + columns;
  return Content.find({ category }).select(select).lean()
    .then(content => {
      if (content.length)
        return resultResponse(SUCCESS, content);
      else
        return resultResponse(NOT_FOUND, "No content found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

function getDownloadContent(data) {
  return Content.findOne(data).select("-_id title description").lean()
    .then(content => {
      if (content) {
        let filepath = UPLOAD_PATH + "/" + content.description;
        if (!fs.existsSync(filepath))
          return resultResponse(NOT_FOUND, "File not found!");
        return resultResponse(SUCCESS, {
          filename: content.title.replace(/ /g, "_") + path.extname(content.description),
          filepath
        });
      } else
        return resultResponse(NOT_FOUND, "File not found!");
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function findStaticContent(slug) {
  if (slug) {
    return Content.findOne({ slug }).select("-_id description content_meta").lean().then(data => {
      data.path = UPLOAD_PATH + "/" + data.description;
      return resultResponse(SUCCESS, data);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }
  return resultResponse(NOT_FOUND, "File not found!");
}

async function findManyStaticContent({ category, slug }) {
  if (category) {
    return Content.find({ category, slug: { $in: [slug, `bg_${slug}`, `blockBg_${slug}`] } })
      .select("-_id slug description")
      .then(data => {
        for (const contentId in data)
          data[contentId].description = UPLOAD_PATH + "/" + data[contentId].description;
        return resultResponse(SUCCESS, data);
      }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }
  return resultResponse(NOT_FOUND, "File not found!");
}

function deleteContent(slug) {
  return Content.findOneAndRemove({ slug }).select("-_id description category").then(data => {
    if (!data)
      return resultResponse(NOT_FOUND, "Content not found!");
    if (["slider", "white_label_logos", "white_label_apps", "white_label_background",].includes(data.category))
      removeStaticContent(UPLOAD_PATH + "/" + data.description);
    return resultResponse(SUCCESS, `Content deleted successfully...`);
  }).catch(error => resultResponse(SERVER_ERROR, error.message));
}

async function findContent(filter) {
  if (filter) {
    return Content.findOne(filter).select("-_id content content_meta content_mobile").lean().then(data => {
      data.path = UPLOAD_PATH + "/" + data.content;
      data.UPLOAD_PATH = UPLOAD_PATH + "/";
      return resultResponse(SUCCESS, data);
    }).catch(error => resultResponse(SERVER_ERROR, error.message));
  }
  return resultResponse(NOT_FOUND, "Content not found!");
}

async function getLogo(req, res) {
  // Capture start time for performance measurement
  const startTime = moment();

  // Generate a unique reference code for logging (optional)
  const LOG_REF_CODE = generateReferCode();

  // Log the start of the function
  // logger.info(`${LOG_REF_CODE} getLogo called`, { slug: req.joiData.slug });

  try {

    // Extract the slug from the request data
    const { slug } = req.joiData;

    const key = getLogoKey(setDomainName(slug));

    // Log key generation
    // logger.info(`${LOG_REF_CODE} Generated key for caching`, { key });

    // Retrieve the cached logo from the publisher
    const cachedResult = await publisher.get(key);

    // If cached result exists, log and return it
    if (cachedResult) {
      // logger.info(`${LOG_REF_CODE} Cache hit`, { key });

      // Calculate and log execution time using reference code
      // logger.info(`${LOG_REF_CODE} getLogo Cache hit Execution Time: ${getTimeTaken({ startTime })}`);
      return resultResponse(SUCCESS, { data: JSON.parse(cachedResult) });
    }

    // Log cache miss
    // logger.info(`${LOG_REF_CODE} Cache miss`, { key });

    // Fetch the content from the database
    const content = await Content.findOne({ slug }).select("-_id description self_host").lean();

    // If content not found, log and return a not found response
    if (!content) {
      logger.warn(`${LOG_REF_CODE} Content not found`, { slug });
      return resultResponse(NOT_FOUND, "No logo found!");
    }

    // Log successful DB fetch
    // logger.info(`${LOG_REF_CODE} Content fetched from DB`, { slug });

    // Cache the content for future use
    await publisher.set(key, JSON.stringify(content));

    // Log content caching
    // logger.info(`${LOG_REF_CODE} Content cached`, { key });

    // Calculate and log execution time using reference code
    // logger.info(`${LOG_REF_CODE} getLogo DB hit Execution Time: ${getTimeTaken({ startTime })}`);

    // Return the content as a success response
    return resultResponse(SUCCESS, { data: content });
  } catch (error) {
    // Log the error
    logger.error(`${LOG_REF_CODE} Error in getLogo`, { message: error.message, stack: error.stack });

    // Handle errors and return an error response
    return resultResponse(SERVER_ERROR, error.message);
  }
}

let getLogoKey = (domainName) => LOGO + domainName + UNIQUE_IDENTIFIER_KEY;

let setDomainName = (slug) => {
  // Create a unique key for caching based on the slug
  return domainName = slug.replace(".", "-").toUpperCase();
}

async function removeLogoFromCache(req, res, next) {

  const key = getLogoKey(setDomainName(req.body.slug));
  await publisher.del(key);

  next();
}

module.exports = {
  slider: storage("sliders"), logo: storage("logos"), popUp: storage("popups"), qtechGame: storage("qtech_game"), application: storage("apps"), bgImage: storage("bg_images"),
  banklogo: storage("bank_logo"), wallet: storage("wallets"), paymentQR: storage("payment_qr"),
  getContent, getDownloadContent, findStaticContent, deleteContent, findManyStaticContent, findContent,
  removeLogoFromCache, getLogo
}