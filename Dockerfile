FROM node:20-alpine

# 👇 ExifTool precisa do Perl no Linux
RUN apk add --no-cache perl

WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
