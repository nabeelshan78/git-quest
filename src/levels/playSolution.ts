/**
 * Headless solution player: play reference solutions programmatically.
 * Used by tests to verify that every level's reference solution reaches
 * the win screen.
 */
import type { GameSession, SessionSnapshot } from '../shared/session';
import type { SolutionStep, LevelDefinition } from '../shared/level';

export interface PlayResult {
  success: boolean;
  /** Last snapshot after all steps. */
  snapshot: SessionSnapshot;
  /** Steps that were executed. */
  stepsExecuted: number;
  /** Error message if failed. */
  error?: string;
}

/**
 * Play a level's reference solution through a session.
 * Returns the result after all steps are done or an error occurs.
 */
export function playSolution(session: GameSession, steps: SolutionStep[]): PlayResult {
  let snapshot = session.getSnapshot();

  // Mark story as read first
  if (snapshot.phase === 'intro') {
    session.markStoryRead();
    snapshot = session.getSnapshot();
  }

  // Finish demo if needed
  if (snapshot.phase === 'demo') {
    session.finishDemo();
    snapshot = session.getSnapshot();
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    snapshot = session.getSnapshot();

    // Stop if already complete
    if (snapshot.phase === 'complete') {
      return { success: true, snapshot, stepsExecuted: i };
    }

    try {
      executeSolutionStep(session, step);
    } catch (err) {
      snapshot = session.getSnapshot();
      return {
        success: false,
        snapshot,
        stepsExecuted: i,
        error: `Step ${i} failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    snapshot = session.getSnapshot();

    // Handle predict card if it appeared
    if (snapshot.pendingPredict) {
      // Answer correctly
      session.answerPredict(snapshot.pendingPredict.card.answer);
      session.continuePredict();
      snapshot = session.getSnapshot();
    }

    // Handle editor if it appeared
    if (snapshot.editor) {
      // Save with default content
      session.submitEditor(snapshot.editor.initialContent);
      snapshot = session.getSnapshot();
    }
  }

  snapshot = session.getSnapshot();
  return {
    success: snapshot.phase === 'complete',
    snapshot,
    stepsExecuted: steps.length,
    error: snapshot.phase !== 'complete' ? `Level not complete after all ${steps.length} steps. Phase: ${snapshot.phase}` : undefined,
  };
}

function executeSolutionStep(session: GameSession, step: SolutionStep): void {
  if ('run' in step) {
    session.run(step.run);
    return;
  }

  if ('edit' in step) {
    session.saveFile(step.edit.path, step.edit.content);
    return;
  }

  if ('editor' in step) {
    if (step.editor.action === 'save') {
      const snapshot = session.getSnapshot();
      const content = step.editor.content ?? snapshot.editor?.initialContent ?? '';
      session.submitEditor(content);
    } else {
      session.submitEditor(null);
    }
    return;
  }

  if ('hub' in step) {
    session.hubAction(step.hub);
    return;
  }

  if ('answer' in step) {
    session.answerQuestion(step.answer.question, step.answer.choice);
    return;
  }

  if ('story' in step) {
    session.markStoryRead();
    return;
  }

  if ('switchMachine' in step) {
    session.switchMachine(step.switchMachine);
    return;
  }
}
