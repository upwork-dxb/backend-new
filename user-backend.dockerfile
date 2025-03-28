FROM node:16 as runner

COPY . .
RUN npm i
EXPOSE 4050
CMD ["npm", "run", "user"]
