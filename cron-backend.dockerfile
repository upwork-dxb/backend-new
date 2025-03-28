FROM node:16 as runner

COPY . .
RUN npm i

EXPOSE 4000
CMD ["npm", "run", "cron"]