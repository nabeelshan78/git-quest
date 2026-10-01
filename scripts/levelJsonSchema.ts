import { z } from 'zod';
import { LevelSchema } from '../src/shared/level';

export function buildLevelJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(LevelSchema, { target: 'draft-2020-12', io: 'input', reused: 'ref' }) as Record<string, unknown>;
  return {
    ...schema,
    $id: 'https://git-quest.local/level.schema.json',
    title: 'Git Quest level',
    description: 'One level of Git Quest. Generated from src/shared/level.ts by `npm run schema`; do not edit by hand.',
  };
}
