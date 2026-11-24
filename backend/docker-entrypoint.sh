#!/bin/sh
set -e
echo "⏳ Застосування міграцій БД…"
npx prisma migrate deploy
if [ "${SEED_ON_START:-true}" = "true" ]; then
  USERS=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(c=>{console.log(c);return p.\$disconnect()}).catch(()=>{console.log(0)})")
  if [ "$USERS" = "0" ]; then
    echo "🌱 База порожня — заповнюю демо-даними…"
    npx tsx prisma/seed.ts
  else
    # база вже була (наприклад, до появи доставки) — доповнюємо довідники доставки, нічого не видаляючи
    npx tsx prisma/seed-delivery.ts
  fi
fi
exec node dist/server.js
