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
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ringGradient"
          x1="170"
          y1="512"
          x2="854"
          y2="512"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FF3B3B" />
          <stop offset="18%" stopColor="#FF8A00" />
          <stop offset="34%" stopColor="#FFD400" />
          <stop offset="50%" stopColor="#7CFF00" />
          <stop offset="66%" stopColor="#19D3C5" />
          <stop offset="82%" stopColor="#1DA1F2" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>

        <linearGradient
          id="innerShade"
          x1="512"
          y1="210"
          x2="512"
          y2="814"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="white" stopOpacity="0.28" />
          <stop offset="35%" stopColor="white" stopOpacity="0.10" />
          <stop offset="100%" stopColor="black" stopOpacity="0.20" />
        </linearGradient>

        <filter
          id="softShadow"
          x="116"
          y="116"
          width="792"
          height="792"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="18"
            stdDeviation="18"
            floodColor="#000000"
            floodOpacity="0.14"
          />
        </filter>
      </defs>

      <g filter="url(#softShadow)">
        <circle
          cx="512"
          cy="512"
          r="302"
          stroke="url(#ringGradient)"
          strokeWidth="92"
          strokeLinecap="round"
        />
        <circle
          cx="512"
          cy="512"
          r="302"
          stroke="url(#innerShade)"
          strokeWidth="92"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
