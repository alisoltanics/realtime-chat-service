FROM node:20-alpine AS dev
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM node:20-alpine AS build
WORKDIR /app

# Inlined into the bundle at build time by Vite.
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_SOCKET_URL=http://localhost:4000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SOCKET_URL=${VITE_SOCKET_URL}

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=4s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
