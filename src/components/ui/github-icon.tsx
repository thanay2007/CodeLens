import type { SVGProps } from "react";

export function Github({
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 18c-4.5 2-5-2-7-2m13 6v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5a5.4 5.4 0 0 0-1-3.5c.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5a21 21 0 0 0-8 0C6 2 5 2 5 2a7 7 0 0 0 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5A4.8 4.8 0 0 0 9 18v4" />
    </svg>
  );
}
