const fs = require("fs")
  , path = require("path")
  , CONFIG_FILE = "../lotusConfig.json"
  , CONFIG_FILE_PATH = path.normalize(path.resolve(__dirname, CONFIG_FILE))
  , getDefaultOperator = { operatorId: '', operatorIdHKD: '', operatorIdDemo: '', enable: 'no' };

module.exports = {
  getLotusOperator: () => {
    if (checkLotusFile) {
      let operatorId, enable, operatorIdHKD, operatorIdDemo;
      if (process.env.LOTUS_ENABLE) {
        if (process.env.LOTUS_ENABLE == "yes") {
          operatorId = parseInt(process.env.LOTUS_OPERATORID);
          operatorIdHKD = parseInt(process.env.LOTUS_OPERATORID_HKD);
          operatorIdDemo = parseInt(process.env.LOTUS_OPERATORID_DEMO);
          enable = process.env.LOTUS_ENABLE;
        }
      } else {
        let lotusConfig = require("./lotusConfig.json");
        operatorId = lotusConfig.operatorId;
        operatorIdHKD = lotusConfig.operatorIdHKD;
        operatorIdDemo = lotusConfig.operatorIdDemo;
        enable = lotusConfig.enable;
      }
      if (enable != undefined)
        if (enable == "yes")
          if (operatorId != undefined)
            return { operatorId, enable, operatorIdHKD, operatorIdDemo };
          else
            return getDefaultOperator;
        else
          return getDefaultOperator;
      return getDefaultOperator;
    }
    return getDefaultOperator;
  }
}

function checkLotusFile() {
  if (!fs.existsSync(CONFIG_FILE_PATH))
    return false
  else {
    try {
      JSON.parse(JSON.stringify(require(CONFIG_FILE_PATH)));
      return true;
    } catch (error) {
      return false;
    }
  }
}