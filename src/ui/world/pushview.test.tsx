// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '../../levels';
import { TID } from '../../shared/testids';
import { WorldView } from '../world/WorldView';
import { HubPanel } from '../hub/index';
import * as fs from 'fs';
import * as path from 'path';

afterEach(() => cleanup());
const player = { id: 'x', name: 'Test Player', email: 't@e.com', handle: 'test-player', classCode: '', createdAt: '2024-01-01T00:00:00Z' };
const REPO = 'lantern-labs/festival-site';

function load(id: string) {
  const ch = id.split('.')[0];
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../content/levels/ch0${ch}/${id}.json`), 'utf8'));
}

describe('a push shows up in both views', () => {
  it('level 6.3: remote box and website both change after git push', () => {
    const session = createSession({ level: load('6.3'), player, mode: 'story' });
    session.markStoryRead();

    // BEFORE the push: website has no README yet.
    const before = session.getSnapshot();
    expect(before.world.hosted[REPO]).toBeDefined();
    const hostedRefsBefore = Object.keys(before.world.hosted[REPO].repo.refs);

    const { unmount } = render(<WorldView session={session} snapshot={before} />);
    const remoteBefore = screen.queryByTestId(TID.remoteGraphDescription)?.textContent ?? '(no remote box)';
    unmount();

    // Push.
    session.run('git push -u origin main');
    const snap = session.getSnapshot();
    const predict = snap.pendingPredict;
    if (predict) { session.answerPredict(predict.card.answer); session.continuePredict(); }
    const after = session.getSnapshot();

    // Engine: the hosted repo now has main.
    expect(Object.keys(after.world.hosted[REPO].repo.refs)).not.toEqual(hostedRefsBefore);
    expect(after.world.hosted[REPO].repo.refs['refs/heads/main']).toBeTruthy();

    // World view: the remote box describes the pushed commit.
    render(<WorldView session={session} snapshot={after} />);
    const remoteAfter = screen.getByTestId(TID.remoteGraphDescription).textContent ?? '';
    expect(remoteAfter).not.toBe(remoteBefore);
    expect(remoteAfter.length).toBeGreaterThan(0);
    cleanup();

    // Website tab: the files are now listed there.
    render(<HubPanel session={session} snapshot={after} />);
    expect(screen.getByTestId(TID.hubFileRow('README.md'))).toBeTruthy();
    expect(screen.getByTestId(TID.hubFileRow('index.html'))).toBeTruthy();

    fs.writeFileSync(path.resolve(__dirname, '../../../pushview.txt'),
      `BEFORE: ${remoteBefore}
AFTER : ${remoteAfter}`);
  });
});
