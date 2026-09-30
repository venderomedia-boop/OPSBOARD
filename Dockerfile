FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV OPSBOARD_DATA_DIR=/data
RUN apk add --no-cache curl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY src ./src
RUN mkdir -p /data /app/dist && chown -R node:node /data /app
USER node
EXPOSE 3000
VOLUME ["/data"]
CMD ["npm","start"]
