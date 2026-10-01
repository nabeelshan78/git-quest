/**
 * Extra data-testid values used inside the Professor Dashboard (in addition
 * to TID.dashboard, TID.dashboardImport and TID.dashboardCsv in src/shared/testids.ts).
 */
export const DASH_TID = {
  dropZone: 'dashboard-drop-zone',
  sample: 'dashboard-sample',
  clear: 'dashboard-clear',
  clearConfirm: 'dashboard-clear-confirm',
  remember: 'dashboard-remember',
  notices: 'dashboard-notices',
  csvLevels: 'dashboard-csv-levels',
  classFilter: 'dashboard-class-filter',
  search: 'dashboard-search',
  shownCount: 'dashboard-shown-count',
  tabStudents: 'dashboard-tab-students',
  tabStuck: 'dashboard-tab-stuck',
  studentTable: 'dashboard-student-table',
  studentRow: (id: string) => `dashboard-row-${id}`,
  sortButton: (key: string) => `dashboard-sort-${key}`,
  stuckList: 'dashboard-stuck-list',
  levelTable: 'dashboard-level-table',
  levelRow: (id: string) => `dashboard-level-${id}`,
  showUnstarted: 'dashboard-show-unstarted',
  drawer: 'dashboard-student-drawer',
  drawerClose: 'dashboard-drawer-close',
  drawerRemove: 'dashboard-drawer-remove',
} as const;
