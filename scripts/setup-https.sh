#!/usr/bin/env bash
# Довірений HTTPS для https://localhost:8443 без попереджень браузера (macOS / Linux / WSL).
# Використовує mkcert: створює локальний центр сертифікації, додає його в систему й браузери
# та випускає сертифікат для localhost у ./certs.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert не встановлено."
  if command -v brew >/dev/null 2>&1; then
    echo "Встановлюю через Homebrew…"
    brew install mkcert nss
  else
    echo "Встановіть його: https://github.com/FiloSottile/mkcert#installation"
    echo "  macOS:   brew install mkcert nss"
    echo "  Windows: choco install mkcert   (або scoop install mkcert)"
    echo "  Linux:   sudo apt install mkcert libnss3-tools"
    exit 1
  fi
fi

mkcert -install
mkdir -p certs
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1

echo
echo "✅ Готово. Перезапустіть web-контейнер:  docker compose up -d --force-recreate web"
echo "   і відкрийте https://localhost:8443"
