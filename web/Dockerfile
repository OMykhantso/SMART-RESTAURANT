# ─── Smart Restaurant Web ───
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
# Офіційний образ nginx підставляє змінні оточення в шаблони з /etc/nginx/templates при старті
ENV HTTPS_PORT=8443
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/10-ssl-cert.sh /docker-entrypoint.d/10-ssl-cert.sh
RUN chmod +x /docker-entrypoint.d/10-ssl-cert.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
