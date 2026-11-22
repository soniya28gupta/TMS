type IconProps = { className?: string };

function base(path: JSX.Element, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-[18px] w-[18px]'}
    >
      {path}
    </svg>
  );
}

export const Icon = {
  dashboard: ({ className }: IconProps) =>
    base(
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>,
      className,
    ),
  tasks: ({ className }: IconProps) =>
    base(
      <>
        <path d="M9 5h10M9 12h10M9 19h10" />
        <path d="M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" />
      </>,
      className,
    ),
  sunrise: ({ className }: IconProps) =>
    base(
      <>
        <path d="M12 3v3M5.6 8.6L7 10M18.4 8.6L17 10M3 18h18M6 18a6 6 0 0112 0" />
      </>,
      className,
    ),
  sunset: ({ className }: IconProps) =>
    base(
      <>
        <path d="M12 10V3M5.6 8.6L7 10M18.4 8.6L17 10M3 18h18M6 18a6 6 0 0112 0" />
      </>,
      className,
    ),
  clock: ({ className }: IconProps) =>
    base(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>,
      className,
    ),
  calendar: ({ className }: IconProps) =>
    base(
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>,
      className,
    ),
  users: ({ className }: IconProps) =>
    base(
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0112 0" />
        <path d="M16 5.5a3 3 0 010 5.8M17.5 20a5.5 5.5 0 00-2-4.2" />
      </>,
      className,
    ),
  chart: ({ className }: IconProps) =>
    base(
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>,
      className,
    ),
  settings: ({ className }: IconProps) =>
    base(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 003.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H8a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V8a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
      </>,
      className,
    ),
  bell: ({ className }: IconProps) =>
    base(
      <>
        <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
        <path d="M13.7 21a2 2 0 01-3.4 0" />
      </>,
      className,
    ),
  check: ({ className }: IconProps) => base(<path d="M20 6L9 17l-5-5" />, className),
  clipboard: ({ className }: IconProps) =>
    base(
      <>
        <rect x="8" y="3" width="8" height="4" rx="1" />
        <path d="M16 5h2a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h2" />
        <path d="M9 12h6M9 16h4" />
      </>,
      className,
    ),
  user: ({ className }: IconProps) =>
    base(
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0114 0" />
      </>,
      className,
    ),
  logout: ({ className }: IconProps) =>
    base(
      <>
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
        <path d="M16 17l5-5-5-5M21 12H9" />
      </>,
      className,
    ),
  plus: ({ className }: IconProps) => base(<path d="M12 5v14M5 12h14" />, className),
  search: ({ className }: IconProps) =>
    base(
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>,
      className,
    ),
  download: ({ className }: IconProps) =>
    base(
      <>
        <path d="M12 3v12M7 11l5 5 5-5" />
        <path d="M4 21h16" />
      </>,
      className,
    ),
  alert: ({ className }: IconProps) =>
    base(
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      </>,
      className,
    ),
  menu: ({ className }: IconProps) => base(<path d="M4 6h16M4 12h16M4 18h16" />, className),
  hierarchy: ({ className }: IconProps) =>
    base(
      <>
        <rect x="9" y="2.5" width="6" height="4.5" rx="1" />
        <rect x="2.5" y="17" width="6" height="4.5" rx="1" />
        <rect x="15.5" y="17" width="6" height="4.5" rx="1" />
        <path d="M12 7v4M5.5 17v-2.5a1.5 1.5 0 011.5-1.5h10a1.5 1.5 0 011.5 1.5V17" />
      </>,
      className,
    ),
  shield: ({ className }: IconProps) =>
    base(
      <>
        <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" />
        <path d="M9.5 12l1.8 1.8L15 10" />
      </>,
      className,
    ),
  history: ({ className }: IconProps) =>
    base(
      <>
        <path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3" />
        <path d="M3 3v4h4" />
        <path d="M12 8v4.5l3 1.8" />
      </>,
      className,
    ),
};

export type IconName = keyof typeof Icon;
