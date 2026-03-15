export type LivepairIconProps = {
  size?: number;
  className?: string;
};

export function LivepairIcon({
  size = 24,
  className,
}: LivepairIconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={Math.round(size * (652 / 768))}
      viewBox="0 0 768 652"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Equalizer logo"
    >
      <defs>
        <linearGradient id="bar1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD54A" />
          <stop offset="100%" stopColor="#F4B400" />
        </linearGradient>
        <linearGradient id="bar2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F2994A" />
          <stop offset="100%" stopColor="#B7C84B" />
        </linearGradient>
        <linearGradient id="bar3" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#D95C86" />
          <stop offset="50%" stopColor="#9CA0B2" />
          <stop offset="100%" stopColor="#41B565" />
        </linearGradient>
        <linearGradient id="bar4" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7A74E8" />
          <stop offset="100%" stopColor="#3EA9D3" />
        </linearGradient>
        <linearGradient id="bar5" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4C8AF0" />
          <stop offset="100%" stopColor="#457FDD" />
        </linearGradient>
      </defs>

      <rect x="31" y="212" width="78" height="168" rx="39" fill="url(#bar1)" />
      <rect x="184" y="120" width="78" height="353" rx="39" fill="url(#bar2)" />
      <rect x="337" y="29" width="78" height="536" rx="39" fill="url(#bar3)" />
      <rect x="490" y="120" width="78" height="353" rx="39" fill="url(#bar4)" />
      <rect x="643" y="212" width="78" height="168" rx="39" fill="url(#bar5)" />
    </svg>
  );
}
