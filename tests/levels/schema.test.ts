import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { buildLevelJsonSchema } from '../../scripts/levelJsonSchema';
import { ChaptersFileSchema, LevelSchema } from '../../src/shared/level';

const root = join(__dirname, '..', '..');
const schemaPath = join(root, 'content', 'level.schema.json');
const chapters = ChaptersFileSchema.parse(JSON.parse(readFileSync(join(root, 'content', 'chapters.json'), 'utf8')));

function levelFiles(dir = join(root, 'content', 'levels')): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...levelFiles(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

describe('level schema', () => {
  it('content/level.schema.json is up to date (run npm run schema)', () => {
    expect(JSON.parse(readFileSync(schemaPath, 'utf8'))).toEqual(JSON.parse(JSON.stringify(buildLevelJsonSchema())));
  });

  it('chapters.json lists 12 chapters and 91 unique levels', () => {
    expect(chapters.chapters.map((c) => c.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const ids = chapters.chapters.flatMap((c) => c.levels.map((l) => l.id));
    expect(ids.length).toBe(91);
    expect(new Set(ids).size).toBe(91);
    for (const c of chapters.chapters) {
      c.levels.forEach((l, i) => expect(l.id).toBe(`${c.number}.${i + 1}`));
      expect(c.levels[c.levels.length - 1].boss).toBe(true);
    }
  });

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
  const listed = new Map(chapters.chapters.flatMap((c) => c.levels.map((l) => [l.id, { ...l, chapter: c.number }] as const)));

  for (const file of levelFiles()) {
    const rel = file.slice(root.length + 1).replace(/\\/g, '/');
    it(`${rel} validates`, () => {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const ok = validate(data);
      expect(ok ? [] : validate.errors).toEqual([]);
      const level = LevelSchema.parse(data);
      const entry = listed.get(level.id);
      expect(entry, `level ${level.id} must be listed in content/chapters.json`).toBeDefined();
      expect(level.title).toBe(entry!.title);
      expect(level.chapter).toBe(entry!.chapter);
      expect(`${level.chapter}.${level.number}`).toBe(level.id);
      expect(!!level.boss).toBe(!!entry!.boss);
      expect(rel).toBe(`content/levels/ch${String(level.chapter).padStart(2, '0')}/${level.id}.json`);
    });
  }
});
