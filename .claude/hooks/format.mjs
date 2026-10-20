// PostToolUse hook: formats the file Claude has just edited with the project's own Prettier.
// A hook must never get in the way of the work, so every failure ends in a silent exit 0.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

try {
  const { tool_input: input } = JSON.parse(readFileSync(0, 'utf8'));
  const file = path.resolve(root, input.file_path);
  const relative = path.relative(root, file);

  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    const prettier = path.join(root, 'node_modules', '.bin', 'prettier');
    // --ignore-unknown skips file types Prettier has no parser for.
    spawnSync(prettier, ['--write', '--ignore-unknown', file], { cwd: root, stdio: 'ignore' });
  }
} catch {
  // Not JSON, no file path, Prettier missing: nothing to do.
}
