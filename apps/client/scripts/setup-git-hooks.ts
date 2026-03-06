import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const gitDir = resolve('.git');
const hooksDir = resolve('.githooks');

if (!existsSync(gitDir) || !existsSync(hooksDir)) {
  process.exit(0);
}

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  process.exit(0);
}
