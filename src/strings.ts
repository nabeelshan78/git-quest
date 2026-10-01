/**
 * All user-facing interface text, in plain English, in one file
 * (docs/SCOPE.md: no i18n framework). Level text lives in content/ JSON.
 *
 * Ownership: the UI workstream owns every section except `classroom`
 * (Classroom workstream). Add keys to your own section only.
 */
export const STRINGS = {
  common: {
    appName: 'Git Quest',
    loading: 'Loading…',
  },
  classroom: {
    exportProgress: 'Export my progress',
    /** Why importFile refused a file ({version} and {detail} are filled in). */
    importError: {
      empty: 'This file is empty. Export your progress again and use the new file.',
      tooLarge: 'This file is too big to be a Git Quest progress file.',
      notJson: 'This is not a Git Quest progress file. Progress files end in .gitquest.json.',
      notProgress: 'This is not a Git Quest progress file. Progress files end in .gitquest.json.',
      newerVersion: 'This file comes from a newer version of Git Quest (format {version}). Reload the game to get the newest version, then try again.',
      olderVersion: 'This file comes from an old version of Git Quest (format {version}). It can no longer be loaded.',
      damaged: 'This Git Quest file is damaged (problem at "{detail}"). Export your progress again and use the new file.',
      checksum: 'This file was changed after it was exported, so it cannot be loaded. Export your progress again and use the new file.',
    },
    /** Labels in the exported CSV file. */
    csv: {
      name: 'Name',
      handle: 'Handle',
      classCode: 'Class code',
      exportedAt: 'Exported at',
      levelId: 'Level',
      title: 'Title',
      completed: 'Completed',
      stars: 'Stars',
      attempts: 'Attempts',
      completions: 'Completions',
      timeSpentSec: 'Time spent (seconds)',
      hintsUsed: 'Hints used',
      maxHintTier: 'Highest hint tier',
      errors: 'Errors',
      firstCompletedAt: 'First completed at',
      yes: 'yes',
      no: 'no',
    },
    /** The page for professors (#/professor): how to collect and read exported files. */
    professorPage: {
      title: 'For professors: collecting progress',
      lead: 'Git Quest has no server. Each student’s progress stays in their own browser until they export it and send it to you.',
      collectTitle: '1. Collect the files',
      collectSteps: [
        'Give students the game link and a class code. They type both on first launch.',
        'When work is due, students press “Export my progress”. The game saves a .csv file and a .gitquest.json file.',
        'Students upload the files to an assignment in your learning platform, such as Canvas, Moodle or Google Classroom.',
      ],
      readTitle: '2. Read the CSV file',
      readSteps: [
        'Open it in Excel, Google Sheets or LibreOffice.',
        'The first rows show the student’s name, handle, class code and the export time.',
        'Then there is one row per level, in game order: completed, stars, attempts, time, hints and errors.',
        'Boss level titles start with “Boss:”. They are the best sign of what a student can do on their own.',
      ],
      jsonTitle: '3. Keep the JSON file',
      jsonSteps: [
        'The .gitquest.json file is the full record. It ends with a checksum that no longer matches if someone edits the file by hand.',
        'The game refuses to import an edited file. To check one, open the game in a private browser window and import it there.',
        'A student who changes computers can import their own file to continue where they stopped.',
      ],
      privacyTitle: 'Privacy',
      privacyBody:
        'A progress file holds only a display name, a class code and level results. Nothing is sent to any server. Check your university’s rules (for example FERPA or GDPR) before you collect files.',
      guide: 'The Professor Guide (docs/PROFESSOR_GUIDE.md in the Git Quest repository) has a 6-week plan, grading ideas and a final-project brief.',
      backLink: 'Back to the game',
    },
  },
} as const;

/** Replace {name} placeholders in a template: fmt('Hi {name}', { name: 'Ada' }). */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
