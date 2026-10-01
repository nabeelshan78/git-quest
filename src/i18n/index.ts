/**
 * i18next setup. Every JSON file in src/i18n/<lang>/<namespace>.json is a
 * namespace: src/i18n/en/common.json -> t('key', { ns: 'common' }).
 * Ownership: UI owns every namespace except en/classroom.json (Classroom).
 * To add a language, add a folder (e.g. src/i18n/fr/) with the same files.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const modules = import.meta.glob('./*/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, unknown>>;

export const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, data] of Object.entries(modules)) {
  const m = /^\.\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!m) continue;
  const [, lang, ns] = m;
  resources[lang] ??= {};
  resources[lang][ns] = data;
}

export const namespaces = Object.keys(resources.en ?? {});

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    ns: namespaces,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
}

export default i18n;
