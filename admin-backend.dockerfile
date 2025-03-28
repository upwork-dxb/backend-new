FROM node:16 as runner

COPY . .
RUN npm i
EXPOSE 4000
CMD ["npm", "run", "admin"]
# CMD exec /bin/bash -c "trap : TERM INT; sleep infinity & wait"
# CMD exec /bin/sh -c "trap : TERM INT; sleep 9999999999d & wait"
