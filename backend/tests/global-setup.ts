import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Перед запуском тестів застосовуємо міграції до ОКРЕМОЇ тестової БД (DATABASE_URL з .env.test
 * або TEST_DATABASE_URL). Дані очищуються в кожному тестовому файлі через TRUNCATE (tests/helpers.ts).
 */
export default function setup() {
  const env = dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), quiet: true }).parsed ?? {};
  const databaseUrl = process.env.TEST_DATABASE_URL ?? env.DATABASE_URL;
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    cwd: path.resolve(__dirname, '..'),
  });
}
