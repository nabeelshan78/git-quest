/**
 * Hash routing. Every page lives behind "#/..." so the build works from any
 * GitHub Pages sub-path.
 */
import { useEffect, useState } from 'react';

export type SandboxPreset = 'empty' | 'festival' | 'festival-with-remote';
export const SANDBOX_PRESETS: SandboxPreset[] = ['empty', 'festival', 'festival-with-remote'];

export type Route =
  | { name: 'home' }
  | { name: 'play'; levelId: string }
  | { name: 'sandbox'; preset: SandboxPreset | null }
  | { name: 'glossary' }
  | { name: 'settings' }
  | { name: 'professor' }
  | { name: 'dev'; variant: string | null }
  | { name: 'notFound'; path: string };

/** Parse `location.hash` ("#/play/1.4", "#/play/1.4?test=1", "", "#") into a route. */
export function parseRoute(hash: string): Route {
  let h = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = h.indexOf('?');
  if (q >= 0) h = h.slice(0, q);
  const parts = h
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  if (parts.length === 0) return { name: 'home' };
  const [head, arg, ...rest] = parts;
  if (rest.length) return { name: 'notFound', path: h };
  switch (head) {
    case 'play':
      return arg ? { name: 'play', levelId: arg } : { name: 'notFound', path: h };
    case 'sandbox':
      if (!arg) return { name: 'sandbox', preset: null };
      return (SANDBOX_PRESETS as string[]).includes(arg) ? { name: 'sandbox', preset: arg as SandboxPreset } : { name: 'notFound', path: h };
    case 'glossary':
    case 'settings':
    case 'professor':
      return arg ? { name: 'notFound', path: h } : { name: head };
    case 'dev':
      return { name: 'dev', variant: arg ?? null };
    default:
      return { name: 'notFound', path: h };
  }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'play':
      return `#/play/${encodeURIComponent(route.levelId)}`;
    case 'sandbox':
      return route.preset ? `#/sandbox/${route.preset}` : '#/sandbox';
    case 'dev':
      return route.variant ? `#/dev/${route.variant}` : '#/dev';
    case 'notFound':
      return `#${route.path}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(to: Route | string): void {
  const href = typeof to === 'string' ? to : routeHref(to);
  if (window.location.hash === href) return;
  window.location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** A stable key for a route, used to remount pages when the route changes. */
export function routeKey(route: Route): string {
  return routeHref(route);
}
