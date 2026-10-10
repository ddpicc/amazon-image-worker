import { clsx } from 'clsx'

/**
 * Pixion brand mark — a pixel-block "P" on a playful violet→indigo→cyan tile,
 * with a yellow spark for the missing pixel.
 */
export function PixionMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pixion"
      className={className}
    >
      <defs>
        <linearGradient
          id="pixion-tile"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.55" stopColor="#6366F1" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#pixion-tile)" />
      <g fill="#ffffff">
        {/* row 0 */}
        <rect x="12.6" y="9.6" width="4.8" height="4.8" rx="0.6" />
        <rect x="18.6" y="9.6" width="4.8" height="4.8" rx="0.6" />
        <rect x="24.6" y="9.6" width="4.8" height="4.8" rx="0.6" />
        {/* row 1 */}
        <rect x="12.6" y="15.6" width="4.8" height="4.8" rx="0.6" />
        <rect x="30.6" y="15.6" width="4.8" height="4.8" rx="0.6" />
        {/* row 2 */}
        <rect x="12.6" y="21.6" width="4.8" height="4.8" rx="0.6" />
        <rect x="18.6" y="21.6" width="4.8" height="4.8" rx="0.6" />
        <rect x="24.6" y="21.6" width="4.8" height="4.8" rx="0.6" />
        {/* row 3 */}
        <rect x="12.6" y="27.6" width="4.8" height="4.8" rx="0.6" />
        {/* row 4 */}
        <rect x="12.6" y="33.6" width="4.8" height="4.8" rx="0.6" />
      </g>
      <path
        d="M37 6.5 L38.5 9.5 L41.5 11 L38.5 12.5 L37 15.5 L35.5 12.5 L32.5 11 L35.5 9.5 Z"
        fill="#FDE047"
      />
    </svg>
  )
}

/**
 * Pixion lockup: pixel mark + "Pixion" wordmark + 中文副标「派图」.
 * Every prop is optional so it can adopt the surrounding layout's sizing/colors.
 */
export function PixionLogo({
  className,
  markClassName = 'h-8 w-8',
  wordClassName = 'text-lg font-bold tracking-tight',
  subtitleClassName = 'text-xs font-medium',
  showSubtitle = true,
}: {
  className?: string
  markClassName?: string
  wordClassName?: string
  subtitleClassName?: string
  showSubtitle?: boolean
}) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)}>
      <PixionMark className={clsx('shrink-0', markClassName)} />
      <span className="flex items-baseline gap-1.5">
        <span className={wordClassName}>Pixion</span>
        {showSubtitle ? (
          <span className={clsx('font-medium', subtitleClassName)}>派图</span>
        ) : null}
      </span>
    </span>
  )
}
