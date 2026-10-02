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
  professorLink: 'professor-link',
  badgeList: 'badge-list',
  /** Has data-earned="true|false". */
  badge: (id: string) => `badge-${id}`,
  /** "Export my progress" on the home page (Settings uses settingsExport). */
  homeExport: 'home-export',
  profileDialog: 'profile-dialog',
  levelError: 'level-error',
  liveRegion: 'live-region',
  sandboxPage: 'sandbox-page',
  sandboxPreset: (preset: string) => `sandbox-preset-${preset}`,
  notFound: 'not-found',
  levelTitle: 'level-title',
  // mission panel extras
  /** Has data-correct="true|false". */
  questionFeedback: (id: string) => `question-${id}-feedback`,
  goalList: 'goal-list',
  hintNote: 'hint-note',
  cheatCard: 'cheat-card',
  dialogueLine: 'dialogue-line',
  demoSkip: 'demo-skip',
  demoCaption: 'demo-caption',
  parInfo: 'par-info',
  sandboxRestart: 'sandbox-restart',
  // predict / win extras
  /** Has data-correct="true|false". */
  predictFeedback: 'predict-feedback',
  winReplay: 'win-replay',
  winHome: 'win-home',
  winClose: 'win-close',
  winGlossary: 'win-glossary',
  winBadges: 'win-badges',
  levelCompleteBanner: 'level-complete-banner',
  showResults: 'show-results',
  // world view extras
  /** Chapter 0 folder view (inside box-working). */
  folderView: 'folder-view',
  /** Has data-path (absolute) and data-cwd="true" for the current folder. */
  folderItem: (path: string) => `folder-item-${path}`,
  /** Has data-badges="untracked modified ..." and data-exists. */
  workingFile: (path: string) => `working-file-${path}`,
  /** Has data-kind. */
  stagingFile: (path: string) => `staging-file-${path}`,
  commitNode: (shortId: string) => `commit-node-${shortId}`,
  remoteCommitNode: (shortId: string) => `remote-commit-node-${shortId}`,
  /** Branch sticky note on a graph; has data-commit. */
  branchLabel: (name: string) => `branch-label-${name}`,
  /** The "You are here" HEAD pin; has data-commit. */
  headPin: 'head-pin',
  commitSheet: 'commit-sheet',
  commitSheetClose: 'commit-sheet-close',
  remoteGraphDescription: 'remote-graph-description',
  remoteSelect: (name: string) => `remote-select-${name}`,
  showLostCommits: 'show-lost-commits',
  animationLayer: 'animation-layer',
  animationCaption: 'animation-caption',
  // files + editor extras
  editorClose: 'file-editor-close',
  editorReload: 'file-editor-reload',
  editorStatus: 'file-editor-status',
  newFileCancel: 'new-file-cancel',
  // git editor extras
  gitEditorWaiting: 'git-editor-waiting',
  // overlays
  glossaryDrawer: 'glossary-drawer',
  settingsDrawer: 'settings-drawer',
  drawerClose: 'drawer-close',
  // glossary + settings pages
  glossaryPage: 'glossary-page',
  glossarySearch: 'glossary-search',
  glossaryTerm: (id: string) => `glossary-term-${id}`,
  glossaryRecap: (levelId: string) => `glossary-recap-${levelId}`,
  settingsPage: 'settings-page',
  settingTheme: 'setting-theme',
  settingFontScale: 'setting-font-scale',
  settingAnimationSpeed: 'setting-animation-speed',
  settingReducedMotion: 'setting-reduced-motion',
  settingScreenReader: 'setting-screen-reader',
  settingsExport: 'settings-export',
  settingsExportStatus: 'settings-export-status',
  settingsImport: 'settings-import',
  settingsImportConfirm: 'settings-import-confirm',
  settingsImportStatus: 'settings-import-status',
  settingsReset: 'settings-reset',
  settingsResetConfirm: 'settings-reset-confirm',
  settingsResetStatus: 'settings-reset-status',
  settingsProfileName: 'settings-profile-name',
  settingsProfileClassCode: 'settings-profile-class-code',
  settingsProfileSave: 'settings-profile-save',
  settingsShortcuts: 'settings-shortcuts',
  // dev page
  devPage: 'dev-page',
} as const;
