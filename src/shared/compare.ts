/**
 * Structural comparison helpers used for par counting and rewind.
 */
import type { World } from './types';

/** Deep structural equality for JSON-like values, with a reference-equality fast path. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/**
 * True when anything other than the simulated clock and shell history differs.
 * (Shell history grows on every typed line, so it never counts as a change.)
 */
export function worldChanged(before: World, after: World): boolean {
  if (before === after) return false;
  if (before.activeMachine !== after.activeMachine) return true;
  if (!deepEqual(before.hosted, after.hosted) || !deepEqual(before.hub, after.hub)) return true;
  const ids = new Set([...Object.keys(before.machines), ...Object.keys(after.machines)]);
  for (const id of ids) {
    const a = before.machines[id];
    const b = after.machines[id];
    if (!a || !b) return true;
    if (a === b) continue;
    const { history: _ha, ...restA } = a;
    const { history: _hb, ...restB } = b;
    if (!deepEqual(restA, restB)) return true;
  }
  return false;
}
