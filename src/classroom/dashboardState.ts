/**
 * Dashboard data reducer (pure): imported students and the notices shown
 * after each import. Notices are descriptors; the component translates them.
 */
import { makeRecord, mergeRecord } from './aggregate';
import type { MergeOutcome, StudentRecord } from './aggregate';
import type { ParseError, ParseResult } from './progressFile';

export interface ImportItem {
  sourceName: string;
  result: ParseResult;
}

export type ImportNotice =
  | { kind: MergeOutcome; file: string; name: string }
  | { kind: 'checksum'; file: string; name: string }
  | { kind: 'error'; file: string; error: ParseError }
  | { kind: 'sampleLoaded'; count: number }
  | { kind: 'sampleRemoved'; count: number };

export interface DashboardData {
  records: StudentRecord[];
  notices: ImportNotice[];
}

export type DashboardAction =
  | { type: 'import'; items: ImportItem[]; sample?: boolean }
  | { type: 'remove'; id: string }
  | { type: 'clear' }
  | { type: 'dismiss' };

export function initialDashboardData(records: StudentRecord[] = []): DashboardData {
  return { records, notices: [] };
}

function displayName(record: StudentRecord): string {
  return record.file.player.name.trim() || record.file.player.handle;
}

export function dashboardReducer(state: DashboardData, action: DashboardAction): DashboardData {
  switch (action.type) {
    case 'import': {
      const sample = action.sample === true;
      let records = state.records;
      const notices: ImportNotice[] = [];
      const hasRealFile = !sample && action.items.some((i) => i.result.ok);
      const demoCount = records.filter((r) => r.sample).length;
      if (hasRealFile && demoCount > 0) {
        // Real class data arrived: drop the demo students so they never mix into grades.
        records = records.filter((r) => !r.sample);
        notices.push({ kind: 'sampleRemoved', count: demoCount });
      }
      let loadedSamples = 0;
      for (const item of action.items) {
        if (!item.result.ok) {
          notices.push({ kind: 'error', file: item.sourceName, error: item.result.error });
          continue;
        }
        const record = makeRecord(item.result.file, item.sourceName, sample);
        const merged = mergeRecord(records, record);
        records = merged.records;
        if (sample) {
          if (merged.outcome === 'added' || merged.outcome === 'replaced') loadedSamples++;
          continue;
        }
        notices.push({ kind: merged.outcome, file: item.sourceName, name: displayName(record) });
        if (record.checksum === 'mismatch' && (merged.outcome === 'added' || merged.outcome === 'replaced')) {
          notices.push({ kind: 'checksum', file: item.sourceName, name: displayName(record) });
        }
      }
      if (sample) notices.push({ kind: 'sampleLoaded', count: loadedSamples });
      return { records, notices };
    }
    case 'remove':
      return { records: state.records.filter((r) => r.id !== action.id), notices: state.notices };
    case 'clear':
      return { records: [], notices: [] };
    case 'dismiss':
      return { ...state, notices: [] };
  }
}
