// Рендер діаграм КТ №1 / пояснювальної записки в PNG (docs/diagrams).
// Запуск із кореня репозиторію: node docs/coursework-src/diagrams/render.mjs
// (Chromium: PW_CHROMIUM_PATH=/шлях/до/chrome, якщо Playwright не встановив свій)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../diagrams');
const names = {
  client: 'use-case-client', staff: 'use-case-staff', kitchen: 'use-case-kitchen', admin: 'use-case-admin',
  courier: 'use-case-courier', arch: 'architecture', er: 'er-diagram', states: 'state-machines',
};
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 2.5, viewport: { width: 1600, height: 1000 } });
for (const [d, file] of Object.entries(names)) {
  await page.goto(`file://${here}/render.html?d=${d}`);
  await page.waitForFunction(() => window.SIZE);
  await page.locator('#c').screenshot({ path: `${out}/${file}.png` });
  console.log('✓', `${file}.png`);
}
await browser.close();
