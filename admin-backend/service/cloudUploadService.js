const axios = require('axios')
  , FormData = require('form-data')
  , fs = require('fs')
  , cloudProvider = require('../../utils/imageStreamConf')
  , { cloudflare } = cloudProvider
  , { SUCCESS, NOT_FOUND, SERVER_ERROR } = require('../../utils/constants')
  , { removeStaticContent } = require('../../utils')
  , { resultResponse } = require('../../utils/globalFunction');

async function uploadToCloud(request) {
  request.action = cloudflare.upload_image;
  return await cloudServiceActions(request);
}

async function removeImageFromCloud(request) {
  request.action = cloudflare.remove_image;
  return await cloudServiceActions(request);
}

async function cloudServiceActions(request) {
  if (isEnabled()) {
    switch (cloudProvider.provider) {
      case cloudProvider.CLOUDFLARE:
        return await cloudflareServices(request);
      default:
        return resultResponse(SERVER_ERROR, "The cloud upload provider does not match!");
    }
  } else
    return resultResponse(NOT_FOUND, "The cloud upload provider has not been enabled yet!");
}

async function cloudflareServices(request) {
  switch (request.action) {
    case cloudflare.upload_image:
      return await uploadToCloudflare(request);
    case cloudflare.remove_image:
      return await removeFromCloudflare(request);
    default:
      return resultResponse(SERVER_ERROR, "Service action does not match!");
  }
}

async function uploadToCloudflare(request) {
  let data = new FormData();
  data.append('file', fs.createReadStream(request.file.path));
  data.append('id', request.file.filename);
  let config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: getCloudflareBaseUrl(),
    headers: {
      'Authorization': 'Bearer ' + cloudflare.token,
      ...data.getHeaders()
    },
    data: data
  };

  try {
    let response = (await axios.request(config)).data;
    if (response.success) {
      response = {
        access_url: response.result.variants[0],
        filename: response.result.filename,
        identifier: response.result.id,
      };
      removeStaticContent(request.file.path);
      return resultResponse(SUCCESS, response);
    }
    return resultResponse(SERVER_ERROR, "Something went wrong, While uploading image!");
  } catch (error) {
    return errorResponseCloudflare(error);
  }
}

async function removeFromCloudflare(request) {
  if (!request.hasOwnProperty('content_meta'))
    return resultResponse(SERVER_ERROR, "The `content_meta` property was not found!");
  let { identifier } = request.content_meta,
    config = {
      method: 'delete',
      url: `${getCloudflareBaseUrl()}/${identifier}`,
      headers: {
        'Authorization': 'Bearer ' + cloudflare.token
      }
    };

  try {
    let response = (await axios.request(config)).data;
    if (response.success)
      return resultResponse(SUCCESS, "Image deleted successfully...");
    return resultResponse(SERVER_ERROR, "Something went wrong, While deleting the image!");
  } catch (error) {
    return errorResponseCloudflare(error);
  }
}

let errorResponseCloudflare = (error) => {
  if (error.response) {
    let data = error.response.data;
    return resultResponse(SERVER_ERROR, data.constructor.name === "Object" ? data.errors.map(data => data.message).toString() : data);
  }
  return resultResponse(SERVER_ERROR, error.message);
}

let isEnabled = () => cloudProvider.enabled;

let getCloudflareBaseUrl = () => cloudflare.url.replace('account_id', cloudflare.account_id)

module.exports = {
  isEnabled, uploadToCloud, removeImageFromCloud
}