/**
 * The Huaqiu (华秋) mark, used as the sidebar auth trigger's DEFAULT icon
 * (mirrors `HQ_ICON` in `hq-eda-ai/apps/web/src/components/ui/icons.tsx`).
 *
 * Plain inline SVG: the DSH client bundle ships as a classic script with no
 * Tailwind, so the Next.js wrapper (div + utility classes) is dropped and the
 * 40×40 viewBox paths are kept verbatim.
 */
export interface HqIconProps {
  size?: number
  /** Brand blue by default; the paths are monochrome so one fill covers all. */
  color?: string
  title?: string
}

export function HQ_ICON({ size = 24, color = '#1a81c4', title }: HqIconProps): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill={color}
        fillRule="evenodd"
        d="M29.71,30a2.75,2.75,0,1,0,2.75,2.74A2.74,2.74,0,0,0,29.71,30Z"
      />
      <path
        fill={color}
        fillRule="evenodd"
        d="M26.59,10.49H13.41a5.93,5.93,0,0,0-5.91,5.9V29.58a5.93,5.93,0,0,0,5.91,5.91H26.85a4,4,0,0,1-1.13-2.78,4.43,4.43,0,0,1,.1-.9H13.41a2.23,2.23,0,0,1-2.22-2.22V16.39a2.23,2.23,0,0,1,2.22-2.21H26.59a2.23,2.23,0,0,1,2.22,2.21V28.81a4.43,4.43,0,0,1,.9-.1,4,4,0,0,1,2.78,1.13,2.26,2.26,0,0,0,0-.26V16.39A5.93,5.93,0,0,0,26.59,10.49Z"
      />
      <path
        fill={color}
        fillRule="evenodd"
        d="M26.38,27.52V18.46a1.85,1.85,0,0,0-1.85-1.85h0a1.84,1.84,0,0,0-1.84,1.85v2.68H17.31V18.46a1.84,1.84,0,0,0-1.84-1.85h0a1.85,1.85,0,0,0-1.85,1.85v9.06a1.85,1.85,0,0,0,1.85,1.85h0a1.84,1.84,0,0,0,1.84-1.85V24.83h5.38v2.69a1.84,1.84,0,0,0,1.84,1.85h0A1.85,1.85,0,0,0,26.38,27.52Z"
      />
      <circle fill={color} cx="20" cy="5.04" r="2.86" />
      <rect fill={color} x="19" y="5.04" width="2" height="6.7" />
      <path fill={color} d="M6.37,17.71a4.89,4.89,0,0,0,0,9.78Z" />
      <path fill={color} d="M33.63,17.71a4.89,4.89,0,1,1,0,9.78Z" />
    </svg>
  )
}
