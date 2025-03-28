module.exports = {
  getSportSettingsIndexQuery: function (sports_settings_id) {
    return [
      {
        $match: sports_settings_id
      },
      {
        $project:
        {
          "_id": 0,
          sports_settings_index: { $indexOfArray: [`$${Object.keys(sports_settings_id).toString()}`, Object.values(sports_settings_id).toString()] },
        }
      }
    ]
  },
  getUserSelectiveSportSettingsQuery: function (user_id, sports_settings_id, columns) {
    return [
      {
        "$match": { user_id }
      },
      {
        "$unwind": "$sports_settings"
      },
      {
        "$match": sports_settings_id
      },
      {
        "$addFields": columns.reduce((Object, key) => ({ ...Object, [key]: `$sports_settings.${key}` }), {})
      },
      {
        "$project": {
          "_id": 0,
          ...columns.reduce((Object, key) => ({ ...Object, [key]: 1 }), {})
        }
      }
    ]
  },
}