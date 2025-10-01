FROM node:20-alpine

# ExifTool precisa de Perl no Linux
RUN apk add --no-cache perl

WORKDIR /app
COPY package.json ./
# ⬇️ troquei "npm ci" por "npm install"
RUN npm install --omit=dev
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
