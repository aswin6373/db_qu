import { useId } from "react";

export function LogoMark({ className }: { className?: string }) {
  const rawId = useId();
  const gradId = `qm-grad-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={gradId} x1="7" y1="7" x2="42" y2="41">
          <stop offset="0" stopColor="#52aaa2" />
          <stop offset="1" stopColor="#1f6b65" />
        </linearGradient>
      </defs>
      <path d="M22.5 16.5v19.5a10.5 4.4 0 0 0 21 0V16.5Z" fill={`url(#${gradId})`} />
      <path d="M22.5 26.4a10.5 4.4 0 0 0 21 0" stroke="#fff" strokeLinecap="round" strokeWidth="2.4" />
      <ellipse cx="33" cy="16.5" fill={`url(#${gradId})`} rx="10.5" ry="4.4" stroke="#fff" strokeWidth="2.4" />
      <path
        d="M15.74 32.3A13 13 0 1 0 6.74 26L5.5 40.5Z"
        fill={`url(#${gradId})`}
        stroke="#fff"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}
