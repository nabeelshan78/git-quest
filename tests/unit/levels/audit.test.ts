import { describe, it, expect } from 'vitest';
import { createSession } from '../../../src/levels';
import * as fs from 'fs';
import * as path from 'path';

const player = { id: 'x', name: 'Test Player', email: 't@e.com', handle: 'test-player', classCode: '', createdAt: '2024-01-01T00:00:00Z' };
const levelsDir = path.resolve(__dirname, '../../../content/levels');

function ids(): string[] {
  const out: string[] = [];
  for (const d of fs.readdirSync(levelsDir).sort()) {
    const p = path.join(levelsDir, d);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.json')) out.push(f.replace('.json', ''));
  }
  return out;
}
function load(id: string) {
  const ch = id.split('.')[0];
  return JSON.parse(fs.readFileSync(path.join(levelsDir, `ch0${ch}`, `${id}.json`), 'utf8'));
}

/**
 * Goals a player can trust:
 *  (A) a goal must not secretly require a commit its text never mentions;
 *  (B) a goal must never tick and then un-tick while the level is played.
 * Both were real bugs reported from play, so they are asserted here.
 */
const ALLOWED_HIDDEN = new Set([
  // Restoring a modified file makes the tree clean. No commit involved.
  '2.5 :: "Restore style.css"',
  // Checks the history that arrived with the clone, not a commit the player wrote.
  '6.4 :: "The clone has the project history"',
  // Stashing makes the tree clean. No commit involved.
  '8.1 :: "Stash your changes"',
]);

describe('goal quality', () => {
  it('no goal hides a commit requirement, and none ticks then un-ticks', () => {
  const regressions: string[] = [];
  const hiddenCommit: string[] = [];

  for (const id of ids()) {
    const level = load(id);

    // (A) text/checks mismatch: goal demands a commit but never says so.
    for (const item of level.goal.items) {
      const txt: string = item.text.toLowerCase();
      const saysCommit = /commit|save|finish|sync|push|merge|tidy|clean|undo|recover|bring|get |land/.test(txt);
      const needsCommit = item.checks.some((c: Record<string, unknown>) =>
        c.type === 'fileInCommit' || c.type === 'commitExists' || c.type === 'commit' ||
        c.type === 'clean' || c.type === 'commitCount');
      if (needsCommit && !saysCommit) hiddenCommit.push(`${id} :: "${item.text}" :: ${item.checks.map((c: {type:string}) => c.type).join(',')}`);
    }

    // (B) non-monotonic: a goal ticks, then un-ticks while playing the solution.
    if (!level.solution?.length) continue;
    const session = createSession({ level, player, mode: 'story' });
    session.markStoryRead();
    const everDone = new Set<number>();
    const record = () => {
      const g = session.getSnapshot().goals;
      g.forEach((goal, i) => {
        if (goal.done) everDone.add(i);
        else if (everDone.has(i)) {
          const key = `${id} :: goal ${i} "${goal.text}"`;
          if (!regressions.includes(key)) regressions.push(key);
        }
      });
    };
    record();
    for (const step of level.solution) {
      try {
        if ('run' in step) session.run(step.run);
        else if ('edit' in step) session.saveFile(step.edit.path, step.edit.content);
        else if ('answer' in step) session.answerQuestion(step.answer.question, step.answer.choice);
        else if ('hub' in step) session.hubAction(step.hub);
        else if ('editor' in step) {
          const s = session.getSnapshot();
          session.submitEditor(step.editor.action === 'save' ? (step.editor.content ?? s.editor?.initialContent ?? '') : null);
        } else if ('switchMachine' in step) session.switchMachine(step.switchMachine);
      } catch { /* keep auditing */ }
      const s = session.getSnapshot();
      if (s.pendingPredict) { session.answerPredict(s.pendingPredict.card.answer); session.continuePredict(); }
      const e = session.getSnapshot();
      if (e.editor) session.submitEditor(e.editor.initialContent);
      record();
    }
  }

  const unexpectedHidden = hiddenCommit.filter((x) => !ALLOWED_HIDDEN.has(x.split(' :: ').slice(0, 2).join(' :: ')));

  const out = [
    '=== (A) goal text does not mention committing, but checks require it ===',
    ...hiddenCommit.map((x) => '  ' + x),
    `  total: ${hiddenCommit.length}`,
    '',
    '=== (B) goals that tick then un-tick while playing the solution ===',
    ...regressions.map((x) => '  ' + x),
    `  total: ${regressions.length}`,
  ].join('\n');
  const reportDir = path.resolve(__dirname, '../../../test-results');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'goal-audit.txt'), out);

    expect(regressions, `goals that tick then un-tick:\n${regressions.join('\n')}`).toEqual([]);
    expect(
      unexpectedHidden,
      `goals requiring a commit their text never mentions:\n${unexpectedHidden.join('\n')}`,
    ).toEqual([]);
  });
});
