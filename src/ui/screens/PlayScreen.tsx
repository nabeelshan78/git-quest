/**
 * Level play screen: mission panel, world view, file editor, terminal,
 * story dialog, predict cards, win screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSession, SessionSnapshot, GoalItemStatus, PendingPredict, QuestionStatus } from '../../shared/session';
import type { DialogueLine } from '../../shared/level';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Stars } from '../components/Stars';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { Picture } from '../graph/Picture';
import { TerminalPanel } from '../terminal/Terminal';
import { WorldView } from '../world/WorldView';
import { FileEditor, GitEditor } from '../editor/FileEditor';
import { HubPanel } from '../hub/index';
import { routeHref, navigate } from '../router';
import { useAppStatus } from '../state/appStatus';
import { useProgressApi, useProgress } from '../state/progress';
import { createMockSession } from '../dev/mockSession';

export interface PlayScreenProps {
  levelId: string;
}

export function PlayScreen({ levelId }: PlayScreenProps) {
  const progressApi = useProgressApi();
  const progress = useProgress();
  const appStatus = useAppStatus();

  // Create session
  const sessionRef = useRef<GameSession | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    // Try to load level and create real session
    // For now, use mock session for development
    try {
      const session = createMockSession({
        variant: 'full',
        player: {
          ...progress.player,
          id: progress.player.id || 'player',
          createdAt: progress.player.createdAt || new Date().toISOString(),
        },
        onResult: (result) => {
          if (!disposed) progressApi.recordResult(result);
        },
      });
      sessionRef.current = session;
      setSnapshot(session.getSnapshot());

      const unsub = session.subscribe((snap) => {
        if (!disposed) setSnapshot(snap);
      });

      appStatus.set({ phase: session.getSnapshot().phase, ready: true, level: levelId });

      return () => {
        disposed = true;
        unsub();
        session.dispose();
        appStatus.clear();
      };
    } catch (e) {
      setError(String(e));
      return () => { disposed = true; };
    }
  }, [levelId]);

  // Update app status
  useEffect(() => {
    if (snapshot) appStatus.set({ phase: snapshot.phase, ready: true, level: levelId });
  }, [snapshot?.phase]);

  if (error) {
    return (
      <div className="gq-not-found" data-testid={TID.levelError}>
        <h1>{STRINGS.play.startFailedTitle}</h1>
        <p>{fmt(STRINGS.play.startFailed, { error })}</p>
        <a href={routeHref({ name: 'home' })} className="gq-btn">{STRINGS.common.backHome}</a>
      </div>
    );
  }

  if (!snapshot || !sessionRef.current) {
    return <div style={{ padding: 24 }}>{STRINGS.common.loading}</div>;
  }

  return <PlayScreenInner session={sessionRef.current} snapshot={snapshot} levelId={levelId} />;
}

function PlayScreenInner({ session, snapshot, levelId }: { session: GameSession; snapshot: SessionSnapshot; levelId: string }) {
  const [viewTab, setViewTab] = useState<'world' | 'hub'>('world');

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'h': e.preventDefault(); session.revealHint(); break;
          case 'z': e.preventDefault(); session.rewind(); break;
          case '5': e.preventDefault(); setViewTab((t) => (t === 'world' ? 'hub' : 'world')); break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session]);

  return (
    <>
      {/* Top bar for play screen */}
      <PlayTopBar session={session} snapshot={snapshot} levelId={levelId} />

      {/* Git editor overlay */}
      {snapshot.editor && <GitEditor session={session} snapshot={snapshot} />}

      {/* Predict card overlay */}
      {snapshot.pendingPredict && <PredictCardModal session={session} predict={snapshot.pendingPredict} />}

      {/* Win screen overlay */}
      {snapshot.phase === 'complete' && snapshot.result && (
        <WinScreen snapshot={snapshot} levelId={levelId} />
      )}

      {/* Main layout */}
      <div className="gq-play">
        {/* Mission panel */}
        <div className="gq-play-mission">
          <MissionPanel session={session} snapshot={snapshot} />
        </div>

        {/* World/Hub view */}
        <div className="gq-play-world">
          {/* Tabs: world / hub */}
          <div className="gq-tabs" role="tablist" aria-label={STRINGS.world.tabsLabel}>
            <button type="button" role="tab" className="gq-tab" aria-selected={viewTab === 'world'} onClick={() => setViewTab('world')} data-testid={TID.worldTab}>
              {STRINGS.world.tabWorld}
            </button>
            <button type="button" role="tab" className="gq-tab" aria-selected={viewTab === 'hub'} onClick={() => setViewTab('hub')} data-testid={TID.hubTab}>
              {STRINGS.world.tabHub}
            </button>
          </div>
          {viewTab === 'world' ? (
            <WorldView session={session} snapshot={snapshot} />
          ) : (
            <HubPanel session={session} snapshot={snapshot} initialPage={snapshot.level?.ui?.hubPage} />
          )}
        </div>

        {/* File editor */}
        <div className="gq-play-files">
          <FileEditor session={session} snapshot={snapshot} />
        </div>

        {/* Terminal */}
        <div className="gq-play-terminal">
          <TerminalPanel session={session} snapshot={snapshot} />
        </div>
      </div>
    </>
  );
}

function PlayTopBar({ session, snapshot, levelId }: { session: GameSession; snapshot: SessionSnapshot; levelId: string }) {
  const level = snapshot.level;
  return (
    <nav className="gq-topbar" data-testid={TID.topBar}>
      <a href={routeHref({ name: 'home' })} className="gq-topbar-brand" data-testid={TID.homeButton}>
        <Logo size={20} />
      </a>
      {level && (
        <span className="gq-topbar-title" data-testid={TID.levelTitle}>
          {fmt(STRINGS.topBar.levelLabel, { id: levelId, title: level.title })}
        </span>
      )}
      <div className="gq-topbar-actions">
        <button
          type="button"
          className="gq-icon-btn"
          onClick={() => session.rewind()}
          disabled={!snapshot.canRewind}
          data-testid={TID.rewindButton}
          aria-label={STRINGS.topBar.rewind}
          title={STRINGS.topBar.rewindHelp}
        >
          <Icon name="rewind" />
        </button>
        <button
          type="button"
          className="gq-icon-btn"
          onClick={() => session.restart()}
          data-testid={TID.restartButton}
          aria-label={STRINGS.topBar.restart}
          title={STRINGS.topBar.restartHelp}
        >
          <Icon name="restart" />
        </button>
        <a href={routeHref({ name: 'glossary' })} className="gq-icon-btn" aria-label={STRINGS.topBar.glossary} data-testid={TID.glossaryButton}>
          <Icon name="book" />
        </a>
        <a href={routeHref({ name: 'settings' })} className="gq-icon-btn" aria-label={STRINGS.topBar.settings} data-testid={TID.settingsButton}>
          <Icon name="gear" />
        </a>
      </div>
    </nav>
  );
}

function MissionPanel({ session, snapshot }: { session: GameSession; snapshot: SessionSnapshot }) {
  const level = snapshot.level;

  return (
    <div className="gq-mission" data-testid={TID.missionPanel}>
      {/* Story / intro */}
      {!snapshot.storyRead && level && (
        <StoryPanel session={session} snapshot={snapshot} />
      )}

      {/* Demo */}
      {snapshot.phase === 'demo' && (
        <div className="gq-mission-section">
          <h3>{STRINGS.mission.demoTitle}</h3>
          <p className="gq-small gq-muted" data-testid={TID.demoCaption}>{STRINGS.mission.demoRunning}</p>
          <button type="button" className="gq-btn gq-btn-sm" onClick={() => session.finishDemo()} data-testid={TID.demoSkip}>
            {STRINGS.mission.demoSkip}
          </button>
        </div>
      )}

      {/* Goals */}
      {level && snapshot.goals.length > 0 && (
        <div className="gq-mission-section">
          <h3>{STRINGS.mission.goalsTitle}</h3>
          <GoalList goals={snapshot.goals} />
        </div>
      )}

      {/* Hints */}
      {level && (
        <div className="gq-mission-section">
          <h3>{STRINGS.mission.hintsTitle}</h3>
          {snapshot.hints.map((h, i) => (
            <div key={i} className="gq-hint-box" data-testid={TID.hintText(i + 1)}>
              <span className="gq-small gq-muted">{fmt(STRINGS.mission.hintTier, { tier: i + 1 })}: {(STRINGS.mission.hintTierNames as string[])[i]}</span>
              <p>{h}</p>
            </div>
          ))}
          {snapshot.hintsRevealed < 3 ? (
            <>
              <button
                type="button"
                className="gq-btn gq-btn-sm"
                onClick={() => session.revealHint()}
                data-testid={TID.hintButton}
              >
                <Icon name="bulb" size={14} />
                {snapshot.hintsRevealed === 0 ? STRINGS.mission.hintButton : STRINGS.mission.hintButtonNext}
              </button>
              <p className="gq-small gq-muted" data-testid={TID.hintNote}>{STRINGS.mission.hintCostNote}</p>
            </>
          ) : (
            <p className="gq-small gq-muted">{STRINGS.mission.hintsAllShown}</p>
          )}
        </div>
      )}

      {/* Questions */}
      {snapshot.questions.length > 0 && (
        <div className="gq-mission-section">
          <h3>{STRINGS.mission.questionsTitle}</h3>
          {snapshot.questions.map((q) => (
            <QuestionCard key={q.question.id} session={session} status={q} />
          ))}
        </div>
      )}

      {/* Action buttons */}
      {level?.ui?.actionButtons && level.ui.actionButtons.length > 0 && (
        <div className="gq-mission-section">
          <h3>{STRINGS.mission.actionsTitle}</h3>
          <p className="gq-small gq-muted">{STRINGS.mission.actionsIntro}</p>
          <div className="gq-action-buttons">
            {level.ui.actionButtons.map((btn, i) => (
              <button
                key={i}
                type="button"
                className="gq-action-btn"
                onClick={() => session.run(btn.command, { source: 'button' })}
                data-testid={TID.actionButton(i)}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Par info */}
      <div className="gq-par-info" data-testid={TID.parInfo}>
        {snapshot.par != null
          ? fmt(STRINGS.mission.parInfo, { used: snapshot.commandsUsed, par: snapshot.par })
          : fmt(STRINGS.mission.parInfoNoPar, { used: snapshot.commandsUsed })}
      </div>

      {/* Dialogue messages */}
      {snapshot.storyRead && snapshot.dialogue.length > 0 && (
        <div className="gq-mission-section">
          <h3>{STRINGS.mission.dialogueTitle}</h3>
          {snapshot.dialogue.slice(-5).map((d, i) => (
            <DialogueBubble key={i} line={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function StoryPanel({ session, snapshot }: { session: GameSession; snapshot: SessionSnapshot }) {
  const level = snapshot.level!;
  const [line, setLine] = useState(0);
  const story = level.story;

  const onNext = useCallback(() => {
    if (line < story.length - 1) {
      setLine(line + 1);
    } else {
      session.markStoryRead();
    }
  }, [line, story.length, session]);

  const current = story[line];
  if (!current) return null;

  return (
    <div className="gq-mission-section">
      <h3>{STRINGS.mission.storyTitle}</h3>
      <div className="gq-story-line" data-testid={TID.storyLine}>
        <Avatar speaker={current.speaker} size={32} mood={current.mood} />
        <div>
          <div className="gq-story-speaker">{(STRINGS.speakers as Record<string, string>)[current.speaker] ?? current.speaker}</div>
          <div className="gq-story-text">{current.text}</div>
        </div>
      </div>
      <p className="gq-small gq-muted">{fmt(STRINGS.mission.storyOf, { n: line + 1, total: story.length })}</p>
      <button type="button" className="gq-btn gq-btn-sm gq-btn-primary" onClick={onNext} data-testid={TID.storyNext}>
        {line < story.length - 1 ? STRINGS.mission.storyNext : STRINGS.mission.storyStart}
      </button>
    </div>
  );
}

function GoalList({ goals }: { goals: GoalItemStatus[] }) {
  return (
    <ul className="gq-goal-list" data-testid={TID.goalList}>
      {goals.map((g, i) => (
        <li
          key={i}
          className={`gq-goal-item ${g.done ? 'gq-goal-done' : 'gq-goal-todo'}`}
          data-testid={TID.goalItem(i)}
          data-done={g.done}
        >
          <span className="gq-goal-icon">
            <Icon name={g.done ? 'check' : 'circle'} size={18} />
          </span>
          <span>{g.text}</span>
          <span className="gq-sr-only">{g.done ? STRINGS.mission.goalDone : STRINGS.mission.goalTodo}</span>
        </li>
      ))}
    </ul>
  );
}

function DialogueBubble({ line }: { line: DialogueLine }) {
  return (
    <div className="gq-dialogue-line" data-testid={TID.dialogueLine}>
      <Avatar speaker={line.speaker} size={28} mood={line.mood} />
      <div className="gq-dialogue-content">
        <div className="gq-dialogue-speaker">{(STRINGS.speakers as Record<string, string>)[line.speaker] ?? line.speaker}</div>
        <div className="gq-dialogue-text">{line.text}</div>
      </div>
    </div>
  );
}

function QuestionCard({ session, status }: { session: GameSession; status: QuestionStatus }) {
  const q = status.question;
  return (
    <div className="gq-question" data-testid={TID.question(q.id)}>
      <p className="gq-question-prompt">{q.prompt}</p>
      <div className="gq-question-choices">
        {q.choices.map((c, i) => {
          const chosen = status.chosen === i;
          const showResult = status.chosen !== null;
          const correct = i === q.answer;
          return (
            <button
              key={i}
              type="button"
              className="gq-question-choice"
              data-correct={showResult && chosen ? (correct ? 'true' : 'false') : undefined}
              onClick={() => session.answerQuestion(q.id, i)}
              data-testid={TID.questionChoice(q.id, i)}
              disabled={status.correct}
            >
              {c.text}
              {c.picture && <Picture picture={c.picture} />}
            </button>
          );
        })}
      </div>
      {status.chosen !== null && (
        <p className="gq-predict-feedback" data-testid={TID.questionFeedback(q.id)} data-correct={status.correct}>
          {status.correct ? STRINGS.mission.questionCorrect : STRINGS.mission.questionWrong}
        </p>
      )}
    </div>
  );
}

function PredictCardModal({ session, predict }: { session: GameSession; predict: PendingPredict }) {
  const card = predict.card;
  const answered = predict.chosen !== null;
  const correct = predict.chosen === card.answer;

  return (
    <Modal title={STRINGS.predict.title} testId={TID.predictCard}>
      <p>{card.question}</p>
      <p className="gq-small gq-muted">{fmt(STRINGS.predict.command, { command: predict.command })}</p>
      <div className="gq-predict-choices">
        {card.choices.map((c, i) => {
          const isChosen = predict.chosen === i;
          const isAnswer = i === card.answer;
          return (
            <button
              key={i}
              type="button"
              className="gq-predict-choice"
              aria-pressed={isChosen}
              data-correct={answered ? (isAnswer ? 'true' : isChosen ? 'false' : undefined) : undefined}
              onClick={() => !answered && session.answerPredict(i)}
              data-testid={TID.predictChoice(i)}
              disabled={answered}
            >
              <span>{fmt(STRINGS.predict.choice, { n: i + 1 })}: {c.text}</span>
              {c.picture && <Picture picture={c.picture} />}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <p className="gq-predict-feedback" data-testid={TID.predictFeedback} data-correct={correct}>
            {correct ? STRINGS.predict.correct : STRINGS.predict.wrong}
          </p>
          <p className="gq-small">{card.explanation}</p>
          <button type="button" className="gq-btn gq-btn-primary" onClick={() => session.continuePredict()} data-testid={TID.predictContinue}>
            {STRINGS.predict.continue}
          </button>
        </>
      )}
    </Modal>
  );
}

function WinScreen({ snapshot, levelId }: { snapshot: SessionSnapshot; levelId: string }) {
  const result = snapshot.result!;
  const stars = result.stars as 0 | 1 | 2 | 3;
  const timeStr = result.timeMs >= 60000
    ? fmt(STRINGS.time.minutes, { m: Math.floor(result.timeMs / 60000), s: Math.floor((result.timeMs % 60000) / 1000) })
    : fmt(STRINGS.time.seconds, { s: Math.floor(result.timeMs / 1000) });

  return (
    <Modal title={STRINGS.win.title} testId={TID.winScreen}>
      <div className="gq-win">
        <div className="gq-win-stars" data-testid={TID.winStars} data-stars={stars}>
          <Stars value={stars} max={3} size={32} />
        </div>
        <p>{fmt(STRINGS.win.starsLine, { stars })}</p>

        {result.recap && (
          <div className="gq-win-recap" data-testid={TID.winRecap}>
            <h3>{STRINGS.win.recapTitle}</h3>
            <p>{result.recap}</p>
          </div>
        )}

        <div className="gq-win-stats">
          <p>{result.par != null
            ? fmt(STRINGS.win.statsCommands, { used: result.commandsUsed, par: result.par })
            : fmt(STRINGS.win.statsCommandsNoPar, { used: result.commandsUsed })}
          </p>
          <p>{fmt(STRINGS.win.statsHints, { count: result.hintsRevealed })}</p>
          <p>{fmt(STRINGS.win.statsTime, { time: timeStr })}</p>
        </div>

        <div className="gq-win-actions">
          <a href={routeHref({ name: 'home' })} className="gq-btn" data-testid={TID.winHome}>
            <Icon name="home" size={14} /> {STRINGS.win.home}
          </a>
          <button type="button" className="gq-btn" onClick={() => navigate({ name: 'play', levelId })} data-testid={TID.winReplay}>
            <Icon name="restart" size={14} /> {STRINGS.win.replay}
          </button>
        </div>
      </div>
    </Modal>
  );
}
