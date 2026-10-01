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

  // ----- added by the UI workstream -----
  // app shell / pages
  homeButton: 'home-button',
  homePage: 'home-page',
  continueButton: 'continue-button',
  dailyButton: 'daily-button',
  professorLink: 'professor-link',
  badgeList: 'badge-list',
  /** Has data-earned="true|false". */
  badge: (id: string) => `badge-${id}`,
  levelError: 'level-error',
  liveRegion: 'live-region',
  sandboxPreset: (preset: string) => `sandbox-preset-${preset}`,
  dailyPage: 'daily-page',
  dailyProgress: 'daily-progress',
  dailyDone: 'daily-done',
  challengeTimer: 'challenge-timer',
  // mission panel extras
  /** Has data-correct="true|false". */
  questionFeedback: (id: string) => `question-${id}-feedback`,
  cheatCard: 'cheat-card',
  dialogueLine: 'dialogue-line',
  demoSkip: 'demo-skip',
  demoCaption: 'demo-caption',
  parInfo: 'par-info',
  // predict / win extras
  /** Has data-correct="true|false". */
  predictFeedback: 'predict-feedback',
  winReplay: 'win-replay',
  winChallenge: 'win-challenge',
  winHome: 'win-home',
  winClose: 'win-close',
  winGlossary: 'win-glossary',
  levelCompleteBanner: 'level-complete-banner',
  // world view extras
  /** Has data-badges="new modified ..." and data-exists. */
  workingFile: (path: string) => `working-file-${path}`,
  /** Has data-kind. */
  stagingFile: (path: string) => `staging-file-${path}`,
  commitNode: (shortId: string) => `commit-node-${shortId}`,
  remoteCommitNode: (shortId: string) => `remote-commit-node-${shortId}`,
  commitSheet: 'commit-sheet',
  commitSheetClose: 'commit-sheet-close',
  remoteGraphDescription: 'remote-graph-description',
  remoteSelect: (name: string) => `remote-select-${name}`,
  // files + editor extras
  editorClose: 'file-editor-close',
  editorReload: 'file-editor-reload',
  newFileCancel: 'new-file-cancel',
  // overlays
  glossaryDrawer: 'glossary-drawer',
  settingsDrawer: 'settings-drawer',
  drawerClose: 'drawer-close',
  // glossary + settings pages
  glossaryPage: 'glossary-page',
  glossarySearch: 'glossary-search',
  glossaryTerm: (id: string) => `glossary-term-${id}`,
  settingsPage: 'settings-page',
  settingTheme: 'setting-theme',
  settingTerminalTheme: 'setting-terminal-theme',
  settingFontScale: 'setting-font-scale',
  settingAnimationSpeed: 'setting-animation-speed',
  settingReducedMotion: 'setting-reduced-motion',
  settingScreenReader: 'setting-screen-reader',
  settingLanguage: 'setting-language',
  settingsExport: 'settings-export',
  settingsImport: 'settings-import',
  settingsImportStatus: 'settings-import-status',
  settingsReset: 'settings-reset',
  settingsResetConfirm: 'settings-reset-confirm',
  settingsProfileName: 'settings-profile-name',
  settingsProfileClassCode: 'settings-profile-class-code',
  settingsProfileSave: 'settings-profile-save',
} as const;
