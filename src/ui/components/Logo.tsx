/** The Git Quest lantern mark (own design). */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="gq-logo">
      <rect width="64" height="64" rx="14" fill="#1f2a44" />
      <path d="M32 10c-3 0-5 2-5 4v3h10v-3c0-2-2-4-5-4z" fill="#E69F00" />
      <rect x="22" y="17" width="20" height="28" rx="6" fill="#F0E442" stroke="#E69F00" strokeWidth="3" />
      <path d="M32 23c3 4 4 7 0 13-4-6-3-9 0-13z" fill="#D55E00" />
      <rect x="26" y="45" width="12" height="5" rx="2" fill="#E69F00" />
    </svg>
  );
}
