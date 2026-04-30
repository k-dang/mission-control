export function RadarWidget({ accent }: { accent: string }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg
        viewBox="0 0 96 96"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <circle cx="48" cy="48" fill="none" stroke={accent} strokeWidth="1" />
        <circle cx="48" cy="48" fill="none" stroke={accent} strokeWidth="1" />
        <circle cx="48" cy="48" fill="none" stroke={accent} strokeWidth="1" />
      </svg>
      <svg
        viewBox="0 0 96 96"
        className="absolute inset-0 h-full w-full opacity-40"
        aria-hidden
      >
        <circle
          cx="48"
          cy="48"
          r="46"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          strokeDasharray="2 4"
        />
        <circle
          cx="48"
          cy="48"
          r="30"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
          strokeDasharray="2 4"
        />
        <line
          x1="0"
          y1="48"
          x2="96"
          y2="48"
          stroke={accent}
          strokeWidth="0.4"
          strokeDasharray="1 3"
        />
        <line
          x1="48"
          y1="0"
          x2="48"
          y2="96"
          stroke={accent}
          strokeWidth="0.4"
          strokeDasharray="1 3"
        />
      </svg>
      <div
        className="h-2 w-2 rounded-full"
        style={{
          background: accent,
          boxShadow: `0 0 14px ${accent}`,
        }}
        aria-hidden
      />
    </div>
  );
}
