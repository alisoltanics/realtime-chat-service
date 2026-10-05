FROM node:20-alpine AS runtime
ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src
COPY tests ./tests

RUN addgroup -S realtime && adduser -S realtime -G realtime \
    && chown -R realtime:realtime /app
USER realtime

EXPOSE 4000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]


# Test image for the two-user smoke script. It needs socket.io-client, which is a
# devDependency, so it gets its own stage and never lands in the runtime image.
FROM node:20-alpine AS smoke
ENV NODE_ENV=development

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --include=dev || npm install

COPY src ./src
COPY scripts ./scripts

CMD ["npm", "run", "smoke"]
