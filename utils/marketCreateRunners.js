exports.createMarketRunners = (market_id, runners) => {
  let bk_ly = [];
  for (let index = 1; index <= 3; index++) {
    bk_ly.push({
      "size": "--",
      "price": "--"
    });
  }
  return runners.map(data => {
    return {
      "market_id": market_id,
      "selectionId": data.selectionId,
      "selection_id": data.selectionId,
      "name": data.runnerName,
      "selection_name": data.runnerName,
      "sort_priority": data.sortPriority,
      "sort_name": data.sortName || null,
      "metadata": data.metadata || null,
      "ex": {
        "availableToBack": bk_ly,
        "availableToLay": bk_ly
      }
    }
  });
}