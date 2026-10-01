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
  },
} as const;

/** Replace {name} placeholders in a template: fmt('Hi {name}', { name: 'Ada' }). */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
