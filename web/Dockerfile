# ─── Smart Restaurant Web ───
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Запасний самопідписаний сертифікат для https://localhost (образ bookworm уже містить openssl,
# тож збирання не залежить від зовнішніх репозиторіїв пакетів).
FROM node:22-bookworm AS cert
RUN mkdir -p /certs && openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout /certs/localhost-key.pem -out /certs/localhost.pem \
      -subj "/CN=localhost/O=Smart Restaurant (dev)" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"

FROM nginx:1.27-alpine
# Офіційний образ nginx підставляє змінні оточення в шаблони з /etc/nginx/templates при старті
ENV HTTPS_PORT=8443
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/10-ssl-cert.sh /docker-entrypoint.d/10-ssl-cert.sh
RUN chmod +x /docker-entrypoint.d/10-ssl-cert.sh
COPY --from=cert /certs /etc/nginx/default-certs
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
