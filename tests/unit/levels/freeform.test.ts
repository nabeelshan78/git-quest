/**
 * Goals must judge the final state, never the words a player chose. These
 * play levels with deliberately "wrong" commit messages: they must still pass.
 */
import { describe, it, expect } from 'vitest';
import { createSession } from '../../../src/levels';
import * as fs from 'fs';
import * as path from 'path';

const player = { id: 'x', name: 'Test Player', email: 't@e.com', handle: 'test-player', classCode: '', createdAt: '2024-01-01T00:00:00Z' };

function load(id: string) {
  const ch = id.split('.')[0];
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../content/levels/ch0${ch}/${id}.json`), 'utf8'));
}

function play(id: string, lines: string[]) {
  const session = createSession({ level: load(id), player, mode: 'story' });
  session.markStoryRead();
  for (const line of lines) {
    session.run(line);
    const s = session.getSnapshot();
    if (s.pendingPredict) { session.answerPredict(s.pendingPredict.card.answer); session.continuePredict(); }
    const e = session.getSnapshot();
    if (e.editor) session.submitEditor(e.editor.initialContent);
  }
  return session.getSnapshot();
}

describe('goals accept the player’s own commit messages', () => {
  it('2.2 completes with a freely worded message', () => {
    // The exact sequence a player reported as stuck.
    const snap = play('2.2', ['git add .', 'git commit -m "commit all three"']);
    expect(snap.goals.every((g) => g.done), snap.goals.map((g) => `${g.done ? 'ok' : 'FAIL'} ${g.text}`).join('; ')).toBe(true);
    expect(snap.phase).toBe('complete');
  });

  it('2.4 completes with a freely worded message', () => {
    const snap = play('2.4', ['git restore --staged poster.txt', 'git commit -m "whatever i like"']);
    expect(snap.phase).toBe('complete');
  });

  it('2.6 completes with a freely worded message', () => {
    const snap = play('2.6', ['echo "thumbs.db" > .gitignore', 'git add .gitignore', 'git commit -m "zzz"']);
    expect(snap.phase).toBe('complete');
  });

  it('4.3 completes with a freely worded message', () => {
    const snap = play('4.3', ['echo "map" > map.html', 'git add map.html', 'git commit -m "qqq"']);
    expect(snap.phase).toBe('complete');
  });

  it('6.1 completes with a freely worded message', () => {
    const session = createSession({ level: load('6.1'), player, mode: 'story' });
    session.markStoryRead();
    session.answerQuestion('q1', 1);
    for (const l of ['echo "the festival site" > README.md', 'git add README.md', 'git commit -m "nnn"']) session.run(l);
    expect(session.getSnapshot().phase).toBe('complete');
  });

  it('7.1 completes with a freely worded message', () => {
    const session = createSession({ level: load('7.1'), player, mode: 'story' });
    session.markStoryRead();
    session.hubAction({ type: 'commentIssue', repo: 'lantern-labs/festival-site', number: 1, body: 'on it' });
    for (const l of [
      'git switch -c food-stalls',
      'echo "samosa stall" > food.html',
      'git add food.html',
      'git commit -m "zzz"',
      'git push -u origin food-stalls',
    ]) session.run(l);
    expect(session.getSnapshot().phase).toBe('complete');
  });
  it('2.7 ticks each goal as its own step is done, not only after the commit', () => {
    const session = createSession({ level: load('2.7'), player, mode: 'story' });
    session.markStoryRead();
    session.answerQuestion('q1', 1);

    session.run('mkdir archive');
    const afterMkdir = session.getSnapshot().goals;
    expect(afterMkdir[0].done, 'archive folder goal').toBe(true);

    session.run('git rm old.txt');
    const afterRm = session.getSnapshot().goals;
    expect(afterRm[1].done, 'deleting old.txt should tick before committing').toBe(true);

    session.run('git mv main.html index.html');
    const afterMv = session.getSnapshot().goals;
    expect(afterMv[2].done, 'renaming should tick before committing').toBe(true);
    expect(afterMv[3].done, 'the commit goal should still be open').toBe(false);

    session.run('git commit -m "anything at all"');
    const final = session.getSnapshot();
    expect(final.goals.every((g) => g.done), final.goals.map((g) => `${g.done ? 'ok' : 'FAIL'} ${g.text}`).join('; ')).toBe(true);
    expect(final.phase).toBe('complete');
  });
});
