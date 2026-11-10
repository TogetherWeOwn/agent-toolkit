import test from 'node:test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Teardown probe: ignores SIGTERM, keeps the event loop alive and leaves a
// persistent descendant. Only used with a short covering-runner timeout; the
// wrapper must SIGTERM, then SIGKILL, the owned process group.
test('hangs ignoring SIGTERM with a persistent descendant', async () => {
  process.on('SIGTERM', () => {});
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  if (process.env.COVERING_PROBE_PID_FILE) writeFileSync(process.env.COVERING_PROBE_PID_FILE, String(child.pid));
  await new Promise(() => {});
});
