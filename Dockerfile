FROM node:20-alpine
# Dependências básicas (exiftool-vendored traz o binário do exiftool)
WORKDIR /app
COPY package.json ./
RUN npm i --omit=dev
COPY server.js ./
EXPOSE 8080
CMD ["node", "server.js"]
