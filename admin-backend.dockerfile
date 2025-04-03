# ---------- Base image ----------
FROM node:16-alpine AS base

# ---------- Create app directory ----------
WORKDIR /app

# ---------- Install dependencies ----------
COPY package*.json ./
RUN npm install --production

# ---------- Copy source files ----------
COPY . .

# ---------- Expose port ----------
EXPOSE 4000

# ---------- Set environment variables (optional) ----------
ENV NODE_ENV=production \
    APP_TYPE=ADMIN

# ---------- Start the admin server ----------
CMD ["npm", "run", "admin"]
