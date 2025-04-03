const fs = require("fs");
const path = require("path");

const CONFIG_FILE = "../lotusConfig.json";
const CONFIG_FILE_PATH = path.resolve(__dirname, CONFIG_FILE);

const getDefaultOperator = {
  operatorId: '',
  operatorIdHKD: '',
  operatorIdDemo: '',
  enable: 'no'
};

function checkLotusFile() {
  try {
    return fs.existsSync(CONFIG_FILE_PATH) && require(CONFIG_FILE_PATH);
  } catch (err) {
    return false;
  }
}

function loadConfigFromFile() {
  try {
    return require(CONFIG_FILE_PATH);
  } catch (err) {
    return getDefaultOperator;
  }
}

function getLotusOperator() {
  if (!checkLotusFile()) return getDefaultOperator;

  let operatorId, operatorIdHKD, operatorIdDemo, enable;

  if (process.env.LOTUS_ENABLE === "yes") {
    operatorId = parseInt(process.env.LOTUS_OPERATORID);
    operatorIdHKD = parseInt(process.env.LOTUS_OPERATORID_HKD);
    operatorIdDemo = parseInt(process.env.LOTUS_OPERATORID_DEMO);
    enable = "yes";
  } else {
    const lotusConfig = loadConfigFromFile();
    operatorId = lotusConfig.operatorId;
    operatorIdHKD = lotusConfig.operatorIdHKD;
    operatorIdDemo = lotusConfig.operatorIdDemo;
    enable = lotusConfig.enable;
  }

  const isValid = enable === "yes" && operatorId !== undefined && operatorId !== null;
  return isValid
    ? { operatorId, operatorIdHKD, operatorIdDemo, enable }
    : getDefaultOperator;
}

module.exports = {
  getLotusOperator
};
