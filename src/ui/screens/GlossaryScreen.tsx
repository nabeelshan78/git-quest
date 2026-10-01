/**
 * Glossary screen: searchable list of git terms and level recaps.
 */
import { useMemo, useState } from 'react';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { routeHref } from '../router';
import { useProgress } from '../state/progress';

// Glossary terms are unlocked as the player completes levels.
// A real implementation loads from content/glossary/*.json.
// For now, show what the player has unlocked from progress.

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  command?: string;
  related?: string[];
}

// Placeholder glossary data (normally loaded from content files)
const BUILTIN_TERMS: GlossaryTerm[] = [
  { id: 'repository', term: 'Repository', definition: 'A folder tracked by git. It remembers every version of every file.', command: 'git init' },
  { id: 'commit', term: 'Commit', definition: 'A saved snapshot of the staging area. Each commit has a unique id, a message and a parent.', command: 'git commit' },
  { id: 'staging-area', term: 'Staging area', definition: 'A holding area between your working folder and the repository. git add copies files here.', command: 'git add' },
  { id: 'branch', term: 'Branch', definition: 'A movable label that points to a commit. It lets you work on something without changing main.', command: 'git branch' },
  { id: 'merge', term: 'Merge', definition: 'Combine two branches into one by creating a merge commit.', command: 'git merge' },
  { id: 'remote', term: 'Remote', definition: 'A copy of the repository on another computer (like GitHub).', command: 'git remote' },
  { id: 'push', term: 'Push', definition: 'Upload your commits to a remote repository.', command: 'git push' },
  { id: 'pull', term: 'Pull', definition: 'Download commits from a remote and merge them into your branch.', command: 'git pull' },
  { id: 'clone', term: 'Clone', definition: 'Copy an entire repository from a remote to your computer.', command: 'git clone' },
  { id: 'status', term: 'Status', definition: 'See which files are changed, staged or untracked.', command: 'git status' },
  { id: 'log', term: 'Log', definition: 'Show the history of commits.', command: 'git log' },
  { id: 'diff', term: 'Diff', definition: 'Show line-by-line differences between versions of files.', command: 'git diff' },
  { id: 'switch', term: 'Switch', definition: 'Move to a different branch.', command: 'git switch' },
  { id: 'restore', term: 'Restore', definition: 'Undo changes in the working folder or unstage files.', command: 'git restore' },
  { id: 'conflict', term: 'Conflict', definition: 'When two branches changed the same lines. You must edit the file to pick which version to keep.' },
  { id: 'head', term: 'HEAD', definition: 'A pointer to the commit you are currently on. Usually it points to a branch name.' },
  { id: 'fetch', term: 'Fetch', definition: 'Download new commits from a remote without merging them.', command: 'git fetch' },
  { id: 'rebase', term: 'Rebase', definition: 'Replay your commits on top of another branch, making a straight line of history.', command: 'git rebase' },
  { id: 'stash', term: 'Stash', definition: 'Temporarily save uncommitted changes so you can switch branches.', command: 'git stash' },
  { id: 'tag', term: 'Tag', definition: 'A permanent label on a commit, like a version number.', command: 'git tag' },
];

export function GlossaryScreen() {
  const progress = useProgress();
  const [query, setQuery] = useState('');
  const _unlocked = new Set(progress.glossary);

  const terms = useMemo(() => {
    const all = BUILTIN_TERMS;
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q) ||
        (t.command && t.command.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <div className="gq-glossary-page" data-testid={TID.glossaryPage}>
      <h1>{STRINGS.glossary.title}</h1>
      <p className="gq-muted">{STRINGS.glossary.intro}</p>

      <div style={{ margin: '12px 0' }}>
        <label htmlFor="glossary-search" className="gq-sr-only">{STRINGS.glossary.search}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={16} />
          <input
            id="glossary-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={STRINGS.glossary.searchPlaceholder}
            data-testid={TID.glossarySearch}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit' }}
          />
        </div>
      </div>

      {terms.length === 0 ? (
        <p className="gq-muted">{query ? fmt(STRINGS.glossary.noMatch, { query }) : STRINGS.glossary.empty}</p>
      ) : (
        <ul className="gq-glossary-list">
          {terms.map((t) => (
            <li key={t.id} className="gq-glossary-item" data-testid={TID.glossaryTerm(t.id)}>
              <div className="gq-glossary-term">{t.term}</div>
              <div className="gq-glossary-def">{t.definition}</div>
              {t.command && <div className="gq-glossary-cmd">{fmt(STRINGS.glossary.command, { command: t.command })}</div>}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <a href={routeHref({ name: 'home' })} className="gq-btn">
          <Icon name="home" size={14} /> {STRINGS.common.backHome}
        </a>
      </div>
    </div>
  );
}
