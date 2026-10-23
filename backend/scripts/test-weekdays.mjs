// Проганяє весь набір тестів 7 разів — як ніби «сьогодні» кожен день тижня.
// Графік роботи ресторану й доставки різний для буднів і вихідних, тож так ловимо
// тести й правила, які випадково залежать від дня запуску.
import { spawnSync } from 'node:child_process';

const days = ['сьогодні', '+1 день', '+2 дні', '+3 дні', '+4 дні', '+5 днів', '+6 днів'];
let failed = 0;
for (let shift = 0; shift < 7; shift++) {
  const run = spawnSync('npx', ['vitest', 'run', '--reporter=dot'], {
    env: { ...process.env, TEST_DAY_SHIFT: String(shift) },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const out = `${run.stdout}\n${run.stderr}`;
  const summary = out.split('\n').find((l) => /^\s+Tests\s/.test(l))?.trim() ?? 'немає підсумку';
  console.log(`${days[shift].padEnd(9)} ${run.status === 0 ? '✓' : '✗'} ${summary}`);
  if (run.status !== 0) {
    failed++;
    console.log(out.split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 20).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
