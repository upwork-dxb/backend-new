#!/bin/bash

# List of files to apply chmod
files=".env
ecosystem.config.js
nodemon.json
connections/redisCronConfig.json
admin-backend/service/betService.js
admin-backend/controllers/userController.js
utils/validationConstant.js
admin-backend/service/betService.js
utils/constants.js
lib/admin-webSocket.js
utils/lotusConfig.json
utils/qTechConfig.js"

# Apply chmod 777 to each file
for file in $files; do
    sudo chmod 777 "$file"
done

echo "Permissions updated for the specified files."

