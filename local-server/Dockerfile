FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY *.mjs schema.sql ./
EXPOSE 4577
CMD ["node","server.mjs"]
