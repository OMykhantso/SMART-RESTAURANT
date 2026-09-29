#!/bin/sh
# HTTPS для nginx: якщо довіреного сертифіката (mkcert, див. scripts/setup-https.sh) немає —
# створюємо тимчасовий самопідписаний, щоб сайт одразу працював через https://.
set -e
CERT_DIR="${SSL_CERT_DIR:-/etc/nginx/certs}"
CRT="$CERT_DIR/localhost.pem"
KEY="$CERT_DIR/localhost-key.pem"
mkdir -p "$CERT_DIR"
if [ -s "$CRT" ] && [ -s "$KEY" ]; then
  echo "ssl: використовую сертифікат $CRT"
  exit 0
fi
echo "ssl: сертифікат не знайдено — створюю самопідписаний для localhost (для «замочка» без попереджень: scripts/setup-https.sh)"
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout "$KEY" -out "$CRT" \
  -subj "/CN=localhost/O=Smart Restaurant (dev)" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" >/dev/null 2>&1
chmod 644 "$CRT"
chmod 600 "$KEY"
