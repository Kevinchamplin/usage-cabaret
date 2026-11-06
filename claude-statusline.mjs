import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { claudeWindows, readingPath, readingsDir } from './claude-storage.mjs';

async function update() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const { rate_limits: limits } = JSON.parse(input);
  const observedAt = Date.now();
  const readings = Object.keys(claudeWindows).flatMap(key => {
    const window = limits?.[key];
    const used = window?.used_percentage;
    if (!Number.isFinite(used) || used < 0) return [];
    const resetsAt = Number.isFinite(window.resets_at) ? window.resets_at : null;
    return [{ key, used, resetsAt, observedAt }];
  });

  if (readings.length === 0) {
    console.log('Usage Cabaret | Waiting for quota data');
    return;
  }
  await mkdir(readingsDir, { recursive: true, mode: 0o700 });
  await Promise.all(readings.map(async ({ key, ...reading }) => {
    const file = readingPath(key);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(reading), { mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }));
  const label = { five_hour: '5h', seven_day: '7d' };
  console.log(['Usage Cabaret', ...readings.map(({ key, used }) => `${label[key]} ${Math.round(used)}%`)].join(' | '));
}

update().catch(() => {
  console.log('Usage Cabaret | Quota data unavailable');
  process.exitCode = 1;
});
