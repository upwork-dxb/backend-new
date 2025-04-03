exports.createMarketRunners = (market_id, runners = []) => {
  const defaultBkLy = Array.from({ length: 3 }, () => ({
    size: "--",
    price: "--"
  }));

  return runners.map(({ selectionId, runnerName, sortPriority, sortName = null, metadata = null }) => ({
    market_id,
    selectionId,
    selection_id: selectionId,
    name: runnerName,
    selection_name: runnerName,
    sort_priority: sortPriority,
    sort_name: sortName,
    metadata,
    ex: {
      availableToBack: defaultBkLy,
      availableToLay: defaultBkLy
    }
  }));
};
