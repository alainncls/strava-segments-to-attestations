import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Netlify deploys each top-level file of this directory as a public function.
const directory = join(import.meta.dirname, '../src');

it('keeps only files with a handler at the top level of the functions directory', () => {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .sort();

  expect(files).toEqual(['auth.ts', 'oauth-state-cleanup.ts', 'sign.ts']);
  for (const name of files) {
    expect(readFileSync(join(directory, name), 'utf8'), name).toMatch(/^export default /m);
  }
});
