/**
 * Loads all content (levels, chapters, glossary) bundled by Vite.
 * Uses import.meta.glob, so it is excluded from the DOM-free core tsconfig.
 */
import { ChaptersFileSchema, GlossaryFileSchema, LevelSchema } from '../shared/level';
import type { ChaptersFile, GlossaryEntry, LevelDefinition } from '../shared/level';
import chaptersJson from '../../content/chapters.json';

const levelModules = import.meta.glob('../../content/levels/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const glossaryModules = import.meta.glob('../../content/glossary/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export interface LoadedLevels {
  levels: LevelDefinition[];
  /** Human-readable validation problems (empty when all content is valid). */
  errors: string[];
}

let cache: LoadedLevels | null = null;

export function getChapters(): ChaptersFile {
  return ChaptersFileSchema.parse(chaptersJson);
}

/** Level ids in curriculum order (from content/chapters.json). */
export function levelOrder(): string[] {
  return getChapters().chapters.flatMap((c) => c.levels.map((l) => l.id));
}

export function loadLevels(): LoadedLevels {
  if (cache) return cache;
  const errors: string[] = [];
  const byId = new Map<string, LevelDefinition>();
  for (const [file, data] of Object.entries(levelModules)) {
    const parsed = LevelSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    if (byId.has(parsed.data.id)) errors.push(`${file}: duplicate level id ${parsed.data.id}`);
    byId.set(parsed.data.id, parsed.data);
  }
  const order = levelOrder();
  const levels: LevelDefinition[] = [];
  for (const id of order) {
    const l = byId.get(id);
    if (l) levels.push(l);
  }
  for (const id of byId.keys()) if (!order.includes(id)) errors.push(`level ${id} is not listed in content/chapters.json`);
  cache = { levels, errors };
  return cache;
}

export function getLevel(id: string): LevelDefinition | undefined {
  return loadLevels().levels.find((l) => l.id === id);
}

export function getGlossary(): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const data of Object.values(glossaryModules)) {
    const parsed = GlossaryFileSchema.safeParse(data);
    if (parsed.success) out.push(...parsed.data);
  }
  return out.sort((a, b) => a.term.localeCompare(b.term));
}
