/**
 * Home screen: chapter map with level cards, badges, sandbox/glossary/settings links.
 */
import { useMemo, useState } from 'react';
import chaptersData from '../../../content/chapters.json';
import type { ChaptersFile } from '../../shared/level';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Stars } from '../components/Stars';
import { routeHref } from '../router';
import { useProgress } from '../state/progress';
import {
  badgeDefinitions,
  chapterProgress,
  completedIds,
  isBadgeEarned,
  suggestedNextLevel,
  totalStars,
} from '../state/rewards';

const chapters = chaptersData as ChaptersFile;
const levelOrder = chapters.chapters.flatMap((c) => c.levels.map((l) => l.id));

export function HomeScreen() {
  const progress = useProgress();
  const done = useMemo(() => completedIds(progress), [progress]);
  const suggested = useMemo(() => suggestedNextLevel(progress, levelOrder), [progress]);
  const chapterProg = useMemo(() => chapterProgress(progress, chapters), [progress]);
  const _stars = totalStars(progress);
  const badges = useMemo(() => badgeDefinitions(chapters), []);

  return (
    <div className="gq-home" data-testid={TID.homePage}>
      {/* Hero */}
      <div className="gq-home-hero">
        <Logo size={48} />
        <div>
          <h1>{progress.player.name ? fmt(STRINGS.home.welcomeBack, { name: progress.player.name }) : STRINGS.common.appName}</h1>
          <p className="gq-muted">{STRINGS.common.tagline}</p>
        </div>
      </div>

      {/* Continue / start */}
      {suggested ? (
        <a href={routeHref({ name: 'play', levelId: suggested })} className="gq-btn gq-btn-primary gq-btn-lg" data-testid={TID.continueButton}>
          <Icon name="play" size={16} />
          {done.size === 0 ? STRINGS.home.startFirst : fmt(STRINGS.home.continue, { id: suggested, title: levelTitle(suggested) })}
        </a>
      ) : (
        <p className="gq-muted">{STRINGS.home.allDone}</p>
      )}

      {/* Chapter map */}
      <section>
        <h2>{STRINGS.home.mapTitle}</h2>
        <p className="gq-muted gq-small">{STRINGS.home.mapIntro}</p>
        <p className="gq-small">{fmt(STRINGS.home.levelsDone, { done: done.size, total: levelOrder.length })}</p>
        {chapters.chapters.map((ch, ci) => (
          <ChapterCard
            key={ch.number}
            chapter={ch}
            progress={chapterProg[ci]}
            done={done}
            suggested={suggested}
          />
        ))}
      </section>

      {/* Badges */}
      <section>
        <h2>{STRINGS.home.badgesTitle}</h2>
        <p className="gq-muted gq-small">{STRINGS.home.badgesIntro}</p>
        <div className="gq-badge-grid" data-testid={TID.badgeList}>
          {badges.map((b) => {
            const earned = isBadgeEarned(b, progress, chapters);
            return (
              <div key={b.id} className="gq-badge-card" data-testid={TID.badge(b.id)} data-earned={earned}>
                <div className="gq-badge-name">
                  <Icon name={earned ? 'trophy' : 'circle'} size={14} />
                  {' '}{badgeName(b)}
                </div>
                <div className="gq-badge-desc">{earned ? STRINGS.home.earned : STRINGS.home.notEarned}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href={routeHref({ name: 'sandbox', preset: null })} className="gq-btn">
          <Icon name="sandbox" size={16} /> {STRINGS.home.sandboxTitle}
        </a>
        <a href={routeHref({ name: 'glossary' })} className="gq-btn">
          <Icon name="book" size={16} /> {STRINGS.home.glossaryTitle}
        </a>
        <a href={routeHref({ name: 'settings' })} className="gq-btn">
          <Icon name="gear" size={16} /> {STRINGS.home.settingsTitle}
        </a>
      </div>

      <p className="gq-small">
        <a href={routeHref({ name: 'professor' })} data-testid={TID.professorLink}>
          {STRINGS.home.professorLink}
        </a>
      </p>
    </div>
  );
}

function ChapterCard({
  chapter,
  progress,
  done,
  suggested,
}: {
  chapter: ChaptersFile['chapters'][number];
  progress: { completed: number; total: number; stars: number; maxStars: number };
  done: Set<string>;
  suggested: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="gq-chapter-card" data-testid={TID.chapterCard(chapter.number)}>
      <button
        type="button"
        className="gq-chapter-header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="gq-chapter-num">{chapter.number}</span>
        <span className="gq-chapter-info">
          <span className="gq-chapter-title">{chapter.title}</span>
          <br />
          <span className="gq-chapter-progress-text">
            {progress.completed}/{progress.total} levels &middot; <Stars value={progress.stars} max={progress.maxStars} size={12} />
          </span>
        </span>
      </button>
      {open && (
        <ul className="gq-level-list">
          {chapter.levels.map((lv) => {
            const isDone = done.has(lv.id);
            const isSuggested = lv.id === suggested;
            const _lvStars = 0; // stars per level from progress
            return (
              <li key={lv.id} className={`gq-level-item ${isDone ? 'gq-level-done' : ''}`} data-testid={TID.levelCard(lv.id)}>
                <a href={routeHref({ name: 'play', levelId: lv.id })} className="gq-level-link">
                  <span className="gq-level-id">{lv.id}</span>
                  <span className={`gq-level-title ${lv.boss ? 'gq-level-boss' : ''}`}>
                    {lv.title}
                    {isSuggested && <span className="gq-small gq-muted"> ({STRINGS.home.suggested})</span>}
                  </span>
                  {isDone && <Icon name="check" size={16} />}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function levelTitle(id: string): string {
  for (const ch of chapters.chapters) {
    const lv = ch.levels.find((l) => l.id === id);
    if (lv) return lv.title;
  }
  return id;
}

function badgeName(b: { id: string; kind: string; value: number }): string {
  switch (b.kind) {
    case 'first-level':
      return (STRINGS.badges['first-level'] as { name: string }).name;
    case 'chapter': {
      const ch = chapters.chapters.find((c) => c.number === b.value);
      return fmt((STRINGS.badges.chapter as { name: string }).name, { n: b.value, title: ch?.title ?? '' });
    }
    case 'stars':
      return fmt((STRINGS.badges.stars as { name: string }).name, { count: b.value });
    case 'all-stars':
      return (STRINGS.badges['all-stars'] as { name: string }).name;
    case 'sandbox':
      return (STRINGS.badges.sandbox as { name: string }).name;
    default:
      return b.id;
  }
}
