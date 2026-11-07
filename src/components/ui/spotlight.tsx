import { useId } from "react";
import { cn } from "@/lib/utils";

// Adapted Aceternity UI Spotlight effect: https://ui.aceternity.com/components/spotlight
export function Spotlight({
  className,
  fill = "#8b5cf6",
}: {
  className?: string;
  fill?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute h-[160%] w-[130%] animate-spotlight opacity-0",
        className,
      )}
      viewBox="0 0 1200 700"
      fill="none"
    >
      <g filter={`url(#${id})`}>
        <ellipse
          cx="600"
          cy="340"
          rx="550"
          ry="110"
          transform="rotate(-28 600 340)"
          fill={fill}
          fillOpacity="0.19"
        />
      </g>
      <defs>
        <filter
          id={id}
          x="-200"
          y="-300"
          width="1800"
          height="1300"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="65" />
        </filter>
      </defs>
    </svg>
  );
}
