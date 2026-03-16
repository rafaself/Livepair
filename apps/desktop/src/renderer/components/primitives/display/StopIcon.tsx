export type StopIconProps = {
  size?: number;
  className?: string;
};

export function StopIcon({
  size = 24,
  className,
}: StopIconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity: 0.8 }}
      aria-hidden="true"
    >
      <path
        d="M12 8C20.39 8 21.71 10.66 21.89 11.78c.04.17.74 3.86-1.99 4.14-6.79.69-2.12-4.01-7.89-3.83-5.78.18-1.11 4.52-7.9 3.83-2.73-.29-2.03-3.98-1.99-4.14C2.29 10.66 3.61 8 12 8Z"
      />
    </svg>
  );
}
