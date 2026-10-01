/**
 * Small inline icons (decorative; always paired with visible or sr-only text).
 */
export type IconName =
  | 'rewind'
  | 'restart'
  | 'book'
  | 'gear'
  | 'home'
  | 'sandbox'
  | 'star'
  | 'star-empty'
  | 'pin'
  | 'check'
  | 'circle'
  | 'file'
  | 'folder'
  | 'folder-open'
  | 'bulb'
  | 'play'
  | 'plus'
  | 'close'
  | 'save'
  | 'tag'
  | 'cloud'
  | 'laptop'
  | 'calendar'
  | 'trophy'
  | 'search'
  | 'upload'
  | 'download'
  | 'warning'
  | 'clock';

const PATHS: Record<IconName, string> = {
  rewind: 'M11 6 4 12l7 6V6zm9 0-7 6 7 6V6z',
  restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  book: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm2 2v11a1 1 0 0 0 1 1h7V7a1 1 0 0 0-1-1H7zm12 1h1v14H8v-1h11V7z',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8 3.5-2.1-.4-.6-1.5 1.2-1.8-1.8-1.8-1.8 1.2-1.5-.6L13 4.9h-2l-.4 2.2-1.5.6-1.8-1.2-1.8 1.8 1.2 1.8-.6 1.5L4 12v2l2.1.4.6 1.5-1.2 1.8 1.8 1.8 1.8-1.2 1.5.6.4 2.1h2l.4-2.1 1.5-.6 1.8 1.2 1.8-1.8-1.2-1.8.6-1.5L20 14z',
  home: 'M12 3 3 10v11h6v-6h6v6h6V10z',
  sandbox: 'M4 18h16v2H4zm2-2 3-8 3 5 2-3 4 6z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  'star-empty': 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9zm0 4.5-1.4 2.9-3.2.5 2.3 2.2-.5 3.2 2.8-1.5 2.8 1.5-.5-3.2 2.3-2.2-3.2-.5z',
  pin: 'M12 2a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6zm0 8.5A2.5 2.5 0 1 1 12 5.5a2.5 2.5 0 0 1 0 5z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  file: 'M6 2h8l5 5v15H6V2zm7 1.5V8h4.5L13 3.5z',
  folder: 'M3 5h7l2 2h9v12H3z',
  'folder-open': 'M3 5h7l2 2h9v3H6l-3 9zm3 6h17l-3 8H3z',
  bulb: 'M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2zM9 20h6v2H9z',
  play: 'M8 5v14l11-7z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  save: 'M5 3h11l3 3v15H5zm2 2v5h8V5zm5 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  tag: 'M3 3h8l10 10-8 8L3 11zm4 2.5A1.5 1.5 0 1 0 7 8.5a1.5 1.5 0 0 0 0-3z',
  cloud: 'M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  laptop: 'M5 5h14v10H5zm-3 12h20v2H2z',
  calendar: 'M7 2h2v2h6V2h2v2h3v17H4V4h3zm-1 7v10h12V9z',
  trophy: 'M7 3h10v2h4v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15v3h4v3H7v-3h4v-3a5 5 0 0 1-3.7-3H7a4 4 0 0 1-4-4V5h4zm-2 4v1a2 2 0 0 0 2 2zm14 0v3a2 2 0 0 0 2-2V7z',
  search: 'M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  upload: 'M11 16V7.8L7.4 11.4 6 10l6-6 6 6-1.4 1.4L13 7.8V16zm-6 3h14v2H5z',
  download: 'M11 4h2v8.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4 3.6 3.6zm-6 15h14v2H5z',
  warning: 'M12 2 1 21h22zm-1 7h2v6h-2zm0 8h2v2h-2z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l4 2.4-1 1.7-5-3V7z',
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`gq-icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
