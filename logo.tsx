/**
 * Command Agent logo — a chevron prompt + horizontal command line, suggesting
 * "input then execute". Pure SVG, currentColor, works at any size.
 */
export function CommandAgentLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Command Agent logo"
      role="img"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="6" className="opacity-20" />
      <path d="M8 11l5 5-5 5M16 21h8" />
    </svg>
  );
}
