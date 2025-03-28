const crypto = require('crypto');
const getCurrentLine = require('get-current-line');
const { SECRET_KEY, SECRET_IV } = require('./envirnomentConfig');
const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'utf8';
const OUTPUTENCODING = 'base64';
const logger = require('../../../utils/loggers');

module.exports = {
  encryptQuery: (data) => {
    try {
      if (!data || Object.keys(data).length === 0) {
        logger.FloxyPay('Data object is blank.');
        return ({ status: false, msg: 'Data object is blank.' });
      }
      const dataString = JSON.stringify(data);
      const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), Buffer.from(SECRET_IV, ENCODING));
      let encryptedData = cipher.update(dataString, ENCODING, OUTPUTENCODING);
      encryptedData += cipher.final(OUTPUTENCODING);
      return encryptedData;
    } catch (error) {
      logger.FloxyPay(`
         ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: encryptQuery
        EVENT_DETAILS: Due to system error, encrypt post data process failed.
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
    }
  },
  decryptData: (encryptedData) => {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        logger.FloxyPay('The "encryptedData" argument must be of type string.');
        return ({ status: false, msg: 'The "encryptedData" argument must be of type string.' });
      }
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY), Buffer.from(SECRET_IV, ENCODING));
      let decryptedData = decipher.update(encryptedData, OUTPUTENCODING, ENCODING);
      decryptedData += decipher.final(ENCODING);
      return decryptedData;
    } catch (error) {
      logger.FloxyPay(`
         ## ERROR LOG ##
        FILE: ${getCurrentLine.default().file}:${getCurrentLine.default().line}
        FUNCTION: decryptData
        EVENT_DETAILS: Due to system error, decryptData post data process failed.
        ERROR_DETAILS: ${JSON.stringify(error, ["message", "arguments", "type", "name"])}`
      );
    }
  },
  generateOrderId: (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const prefix = "ord"
    let code = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code += characters.charAt(randomIndex);
    }
    // Add timestamp for ensure uniqueness
    const timestamp = Date.now();
    const timestampPart = String(timestamp).slice(-4);
    code += timestampPart;
    return prefix + code;
  },
  getDomainName: (hostName) => {
    if (!hostName) {
      return "";
    } else {
      const lastDotIndex = hostName.lastIndexOf(".");
      const secondLastDotIndex = hostName.lastIndexOf(".", lastDotIndex - 1);
      return hostName.substring(secondLastDotIndex + 1);
    }
  }
}