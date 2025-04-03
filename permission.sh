#!/bin/bash

# List of files to apply chmod
files=(
  ".env"
  "ecosystem.config.js"
  "nodemon.json"
  "connections/redisCronConfig.json"
  "admin-backend/service/betService.js"
  "admin-backend/controllers/userController.js"
  "utils/validationConstant.js"
  "utils/constants.js"
  "lib/admin-webSocket.js"
  "utils/lotusConfig.json"
  "utils/qTechConfig.js"
)

# Recommended permission (can be adjusted)
PERMISSION=664

echo "Updating file permissions..."

for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then
    sudo chmod $PERMISSION "$file"
    echo "✅ $file - permissions set to $PERMISSION"
  else
    echo "⚠️  $file - file not found"
  fi
done

echo "✅ Permissions update complete."
