#!/bin/sh
# HTTPS для nginx: якщо довіреного сертифіката (mkcert, див. scripts/setup-https.sh) у /etc/nginx/certs
# немає — кладемо запасний самопідписаний, створений під час збирання образу.
set -e
CERT_DIR="${SSL_CERT_DIR:-/etc/nginx/certs}"
DEFAULT_DIR="${SSL_DEFAULT_DIR:-/etc/nginx/default-certs}"
if [ -s "$CERT_DIR/localhost.pem" ] && [ -s "$CERT_DIR/localhost-key.pem" ]; then
  echo "ssl: використовую сертифікат $CERT_DIR/localhost.pem"
  exit 0
fi
echo "ssl: довіреного сертифіката немає — використовую самопідписаний (для «замочка» без попереджень: scripts/setup-https.sh)"
mkdir -p "$CERT_DIR"
cp "$DEFAULT_DIR/localhost.pem" "$DEFAULT_DIR/localhost-key.pem" "$CERT_DIR/"
