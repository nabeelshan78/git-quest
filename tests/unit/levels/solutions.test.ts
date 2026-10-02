/**
 * Test that level reference solutions actually complete their levels.
 * This runs headlessly through the engine — no browser needed.
 */
import { describe, it, expect } from 'vitest';
import { createSession } from '../../../src/levels';
import { playSolution } from '../../../src/levels/playSolution';
import * as fs from 'fs';
import * as path from 'path';

const player = { id: 'test-id', name: 'Test Player', email: 'test@example.com', handle: 'test-player', classCode: '', createdAt: '2024-01-01T00:00:00Z' };

function loadLevel(id: string) {
  const [ch] = id.split('.');
  const chDir = `ch${ch.padStart(2, '0')}`;
  const filePath = path.resolve(__dirname, `../../../content/levels/${chDir}/${id}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getLevelIds(): string[] {
  const levelsDir = path.resolve(__dirname, '../../../content/levels');
  const ids: string[] = [];
  for (const dir of fs.readdirSync(levelsDir).sort()) {
    const chDir = path.join(levelsDir, dir);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const file of fs.readdirSync(chDir).sort()) {
      if (file.endsWith('.json') && !file.includes('schema')) {
        ids.push(file.replace('.json', ''));
      }
    }
  }
  return ids;
}

describe('level solutions', () => {
  const ids = getLevelIds();

  for (const id of ids) {
    it(`level ${id} solution completes the level`, () => {
      const level = loadLevel(id);
      if (!level.solution || level.solution.length === 0) return;

      const session = createSession({ level, player, mode: 'story' });
      const result = playSolution(session, level.solution);
      expect(result.success, result.error ?? `Level ${id} not complete`).toBe(true);
    });
  }
});
