const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * back lay model schema
 */
const bk_ly = {
  size: { type: String, default: '--' },
  price: { type: String, default: '--' },
  _id: false
};
const back_lay = new Schema(bk_ly, { strict: false });

/**
 * Market selection model schema
 */
const marketSelection = {
  market_id: { type: String, required: true },
  selectionId: { type: Number, required: true },
  selection_id: { type: Number, required: true },
  name: { type: String, required: true, default: "" },
  selection_name: { type: String, required: true, default: "" },
  sort_priority: { type: Number, required: true, default: 1 },
  sort_name: { type: String, default: null },
  status: { type: String, default: "SUSPENDED" },
  stack: { type: Number, default: 0 },
  stacks_sum: { type: Number, default: 0 },
  user_pl: { type: Number, default: 0 },
  user_commission_pl: { type: Number, default: 0 },
  max_liability: { type: Number, default: 0 },
  metadata: Object,
  ex: {
    availableToBack: [back_lay],
    availableToLay: [back_lay]
  },
  win_value: { type: Number, required: true, default: 0 },
  loss_value: { type: Number, required: true, default: 0 },
  win_loss: { type: Number, required: true, default: 0 },
  //Unmatched Bets Fields
  unmatched_win_value: { type: Number, default: 0 },
  unmatched_loss_value: { type: Number, default: 0 },
  _id: false
};

module.exports = (onlySchemaObject = false) => {
  if (onlySchemaObject) {
    if (onlySchemaObject == "full")
      return marketSelection;
    let templateValues = [0, '', 0, null, 'SUSPENDED', { availableToBack: [], availableToLay: [] }, 0];
    delete marketSelection["_id"];
    delete marketSelection["market_id"];
    delete marketSelection["selection_id"];
    delete marketSelection["selection_name"];
    delete marketSelection["stack"];
    delete marketSelection["stacks_sum"];
    delete marketSelection["win_value"];
    delete marketSelection["loss_value"];
    delete marketSelection["unmatched_win_value"];
    delete marketSelection["unmatched_loss_value"];
    delete marketSelection["win_loss"];
    delete marketSelection["user_pl"];
    delete marketSelection["user_commission_pl"];
    delete marketSelection["max_liability"];
    delete marketSelection["metadata"];
    Object.keys(marketSelection).map((keys, index) => {
      marketSelection[keys] = templateValues[index];
    });
    return marketSelection;
  }
  return new Schema(marketSelection, { strict: false });
}