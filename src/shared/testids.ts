/**
 * SHARED CONTRACT — data-testid values used by the UI and the Playwright tests.
 * The UI must put these on the matching elements; QA tests select by them.
 * Owners (UI, Hub) may ADD ids here for their own components (never rename).
 */
export const TID = {
  // app shell
  /** Root element. Attributes: data-phase="intro|demo|play|complete", data-ready="true" when input is accepted, data-level="<id>". */
  app: 'app-root',
  topBar: 'top-bar',
  rewindButton: 'rewind-button',
  restartButton: 'restart-button',
  glossaryButton: 'glossary-button',
  sandboxButton: 'sandbox-button',
  settingsButton: 'settings-button',
  starsTotal: 'stars-total',
  // first launch
  profileName: 'profile-name',
  profileClassCode: 'profile-class-code',
  profileSave: 'profile-save',
  // level select
  chapterCard: (n: number) => `chapter-card-${n}`,
  levelCard: (id: string) => `level-card-${id}`,
  // mission panel
  missionPanel: 'mission-panel',
  storyLine: 'story-line',
  /** Advances / finishes the story (calls markStoryRead at the end). */
  storyNext: 'story-next',
  /** Has data-done="true|false". */
  goalItem: (i: number) => `goal-item-${i}`,
  hintButton: 'hint-button',
  hintText: (tier: number) => `hint-text-${tier}`,
  question: (id: string) => `question-${id}`,
  questionChoice: (id: string, i: number) => `question-${id}-choice-${i}`,
  actionButton: (i: number) => `action-button-${i}`,
  // predict card
  predictCard: 'predict-card',
  predictChoice: (i: number) => `predict-choice-${i}`,
  predictContinue: 'predict-continue',
  // terminal
  /** Container; keyboard input goes to the xterm helper textarea inside it. */
  terminal: 'terminal',
  machineTab: (id: string) => `machine-tab-${id}`,
  // world view
  worldView: 'world-view',
  boxWorking: 'box-working',
  boxStaging: 'box-staging',
  boxRepository: 'box-repository',
  boxRemote: 'box-remote',
  graphDescription: 'graph-description',
  // files + editor
  fileTree: 'file-tree',
  fileTreeItem: (path: string) => `file-item-${path}`,
  editor: 'file-editor',
  editorSave: 'file-editor-save',
  newFileButton: 'new-file-button',
  newFileName: 'new-file-name',
  newFileCreate: 'new-file-create',
  // git-opened editor (commit message / rebase todo)
  gitEditor: 'git-editor',
  gitEditorText: 'git-editor-text',
  gitEditorSave: 'git-editor-save',
  gitEditorAbort: 'git-editor-abort',
  // win screen
  winScreen: 'win-screen',
  /** Has data-stars="1|2|3". */
  winStars: 'win-stars',
  winNext: 'win-next',
  winRecap: 'win-recap',
  // hub panel (the Hub workstream documents more in src/ui/hub/TESTIDS.md)
  hubPanel: 'hub-panel',
  hubTab: 'hub-tab',
  worldTab: 'world-tab',
  // professor dashboard
  dashboard: 'professor-dashboard',
  dashboardImport: 'dashboard-import',
  dashboardCsv: 'dashboard-csv',
} as const;
