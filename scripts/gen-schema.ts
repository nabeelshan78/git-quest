/**
 * Generates content/level.schema.json from the zod schema in src/shared/level.ts.
 * Run: npm run schema   (a test fails if the committed file is out of date)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLevelJsonSchema } from './levelJsonSchema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'content', 'level.schema.json');
writeFileSync(out, `${JSON.stringify(buildLevelJsonSchema(), null, 2)}\n`);
console.log(`wrote ${out}`);
