/** Decorative mark: the adjacent product name provides its accessible label. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <rect width="64" height="64" rx="18" fill="#112c25"/>
    <path d="M16 30 32 16l16 14" stroke="#e4eeab" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 45v-6m12 6V33m12 12V29" stroke="#e4eeab" strokeWidth="6" strokeLinecap="round"/>
  </svg>;
}
